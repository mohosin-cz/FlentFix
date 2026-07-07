import { supabase } from '../lib/supabase'

// Pure observation phrases — items with only these and zero cost are excluded.
// "Not available" WITH a cost (install price) IS work and passes through.
const OBSERVATION_RE = /^(functional|ok|working|fine|good|checked|n\/a|not\s+avail(able)?|no\s+issue|no\s+defect|no\s+problem|okay|no\s+defects?)$/i

function belongsInEstimate(item) {
  if (item.excluded_from_estimate === true) return false
  const hasCost = (parseFloat(item.material_cost) || 0) + (parseFloat(item.labour_cost) || 0) > 0
  if (hasCost) return true // "not available" WITH install cost IS work — include
  const desc = (item.issue_description || '').trim()
  if (!desc) return false // no description, no cost → skip
  if (OBSERVATION_RE.test(desc)) return false // pure observation
  return true // real issue, zero cost so far (e.g. action-only pending price) — include
}

function toEstimateRow(item, estimateId, sortOrder) {
  return {
    estimate_id:          estimateId,
    line_item_id:         item.id,
    sort_order:           sortOrder,
    area:                 item.area || '',
    item_name:            item.item_name || '',
    trade:                item.trade || '',
    section_name:         item.section_name || '',
    item_kind:            item.item_kind || null,
    issue_description:    item.issue_description || '',
    material_description: item.material_description || '',
    material_cost:        item.material_cost || 0,
    action:               item.action || '',
    labour_description:   item.action || '',
    labour_cost:          item.labour_cost || 0,
    qty:                  item.qty || 1,
    cost_type:            item.cost_type || 'priced',
    status:               'pending',
  }
}

export async function resolveInspectionWithData(pid) {
  const { data: inspections } = await supabase
    .from('inspections')
    .select('id, created_at')
    .eq('pid', pid)
    .order('created_at', { ascending: false })
  if (!inspections?.length) return null
  for (const insp of inspections) {
    const { data: probe } = await supabase
      .from('inspection_line_items')
      .select('id')
      .eq('inspection_id', insp.id)
      .limit(1)
    if (probe?.length > 0) return insp.id
  }
  return inspections[0].id
}

// Create-or-repair — never deletes.
// Returns { id, error, inserted, repaired }
// If estimate already exists for this inspection: inserts only items not yet
//   present (matched by line_item_id). Preserves share_token and all edits.
// If no estimate: creates row + copies all valid items, verifies count > 0.
//   Zero valid items → no estimate row created → returns { id: null, error }.
export async function generateEstimate(inspectionId, pid, userEmail) {
  const { data: inspection, error: fetchErr } = await supabase
    .from('inspections')
    .select('*, inspection_line_items(*)')
    .eq('id', inspectionId)
    .single()
  if (fetchErr || !inspection) {
    return { id: null, error: `Inspection fetch failed: ${fetchErr?.message || 'no data'}` }
  }

  const allItems = inspection.inspection_line_items || []
  const valid    = allItems.filter(belongsInEstimate)
  const nExcluded    = allItems.filter(i => i.excluded_from_estimate === true).length
  const nZeroCostObs = allItems.length - nExcluded - valid.length

  // Check for existing estimate (by inspection_id)
  const { data: existing, error: existErr } = await supabase
    .from('estimates')
    .select('id, share_token')
    .eq('inspection_id', inspectionId)
    .maybeSingle()
  if (existErr) return { id: null, error: `Estimate lookup failed: ${existErr.message}` }

  const inspector = inspection?.owner_email?.split('@')[0] || userEmail?.split('@')[0] || 'Flent'

  if (existing?.id) {
    // ── REPAIR IN PLACE ──────────────────────────────────────────────────────
    // Insert only line items not already present; preserve everything else.
    const { data: existingItems } = await supabase
      .from('estimate_items')
      .select('line_item_id, sort_order')
      .eq('estimate_id', existing.id)
    const presentIds = new Set((existingItems || []).map(r => r.line_item_id))
    const maxSort    = (existingItems || []).reduce((m, r) => Math.max(m, r.sort_order || 0), 0)
    const newItems   = valid.filter(item => !presentIds.has(item.id))

    if (newItems.length > 0) {
      const rows = newItems.map((item, i) => toEstimateRow(item, existing.id, maxSort + (i + 1) * 10))
      const { error: insertErr } = await supabase.from('estimate_items').insert(rows)
      if (insertErr) return { id: null, error: `Repair insert failed: ${insertErr.message}` }
    }

    return { id: existing.id, inserted: newItems.length, repaired: true }
  }

  // ── NEW ESTIMATE ─────────────────────────────────────────────────────────
  if (valid.length === 0) {
    const parts = []
    if (nExcluded > 0)    parts.push(`${nExcluded} excluded`)
    if (nZeroCostObs > 0) parts.push(`${nZeroCostObs} with no cost or issue`)
    return {
      id: null,
      error: `No billable items found — ${parts.join(', ') || 'all items filtered'}. Price some issues in the inspection first.`,
    }
  }

  const { data: est, error: createErr } = await supabase
    .from('estimates')
    .insert({ pid, inspection_id: inspectionId, inspector_name: inspector, status: 'draft', created_by: userEmail })
    .select('id').single()
  if (createErr || !est?.id) {
    return { id: null, error: `Estimate create failed: ${createErr?.message || 'no row returned'}` }
  }

  const rows = valid.map((item, i) => toEstimateRow(item, est.id, i * 10))
  const { data: inserted, error: insertErr } = await supabase
    .from('estimate_items').insert(rows).select('id')
  if (insertErr || !inserted?.length) {
    // Roll back the shell estimate row
    await supabase.from('estimates').delete().eq('id', est.id)
    return { id: null, error: `Item copy failed${insertErr ? ': ' + insertErr.message : ' — 0 items inserted'}` }
  }

  return { id: est.id, inserted: inserted.length, repaired: false }
}

// Reconcile (Regen) — never deletes. Builds the full valid item set in memory,
// verifies it is non-empty, then inserts new items and marks vanished ones
// status='removed'. Updates no estimates row. Preserves all manual WB edits.
// Returns { error, inserted, removed } — caller handles error display.
export async function reconcileEstimate(inspectionId, estimateId) {
  const { data: inspection, error: fetchErr } = await supabase
    .from('inspections')
    .select('*, inspection_line_items(*)')
    .eq('id', inspectionId)
    .single()
  if (fetchErr || !inspection) {
    return { error: `Inspection fetch failed: ${fetchErr?.message || 'no data'}` }
  }

  const allItems = inspection.inspection_line_items || []
  const valid    = allItems.filter(belongsInEstimate)
  const nExcluded    = allItems.filter(i => i.excluded_from_estimate === true).length
  const nZeroCostObs = allItems.length - nExcluded - valid.length

  if (valid.length === 0) {
    const parts = []
    if (nExcluded > 0)    parts.push(`${nExcluded} excluded`)
    if (nZeroCostObs > 0) parts.push(`${nZeroCostObs} with no cost or issue`)
    return { error: `No billable items — ${parts.join(', ') || 'all filtered'}` }
  }

  const { data: currentItems } = await supabase
    .from('estimate_items')
    .select('id, line_item_id, sort_order, status')
    .eq('estimate_id', estimateId)
  const presentMap = new Map((currentItems || []).map(r => [r.line_item_id, r]))
  const maxSort    = (currentItems || []).reduce((m, r) => Math.max(m, r.sort_order || 0), 0)

  // Insert items present in inspection but missing from estimate
  const toInsert = valid.filter(item => !presentMap.has(item.id))
  if (toInsert.length > 0) {
    const rows = toInsert.map((item, i) => toEstimateRow(item, estimateId, maxSort + (i + 1) * 10))
    const { error: insertErr } = await supabase.from('estimate_items').insert(rows)
    if (insertErr) return { error: `Regen insert failed: ${insertErr.message}` }
  }

  // Mark items no longer in inspection as removed
  const validIds  = new Set(valid.map(i => i.id))
  const toRemove  = (currentItems || [])
    .filter(r => r.status !== 'removed' && !validIds.has(r.line_item_id))
    .map(r => r.id)
  for (const itemId of toRemove) {
    await supabase.from('estimate_items').update({ status: 'removed' }).eq('id', itemId)
  }

  return { inserted: toInsert.length, removed: toRemove.length }
}

// No-op: DB trigger trg_recompute_total owns estimates.total now.
export async function recomputeEstimateTotal(_estimateId) { return }
export async function backfillEstimateTotals() { return }
