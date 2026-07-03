import { supabase } from '../lib/supabase'

// Recompute and persist estimates.total from current estimate_items.
// Formula: sum((material_cost + labour_cost) * qty) for priced, non-removed/excluded rows.
// Requires: ALTER TABLE estimates ADD COLUMN IF NOT EXISTS total numeric;
export async function recomputeEstimateTotal(estimateId) {
  const { data: rows } = await supabase
    .from('estimate_items')
    .select('material_cost, labour_cost, qty, cost_type, status')
    .eq('estimate_id', estimateId)
  const total = (rows || [])
    .filter(r => !['removed', 'excluded'].includes(r.status) && r.cost_type === 'priced')
    .reduce((s, r) => s + ((parseFloat(r.material_cost) || 0) + (parseFloat(r.labour_cost) || 0)) * (r.qty || 1), 0)
  await supabase.from('estimates').update({ total }).eq('id', estimateId)
  return total
}

// One-time backfill: run once after deploying to populate total for all existing estimates.
export async function backfillEstimateTotals() {
  const { data: ests } = await supabase.from('estimates').select('id')
  for (const est of (ests || [])) await recomputeEstimateTotal(est.id)
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

const belongsInEstimate = (item) => item.excluded_from_estimate !== true

export async function generateEstimate(inspectionId, pid, userEmail) {
  // Check for existing estimate
  const { data: existing } = await supabase
    .from('estimates')
    .select('id')
    .eq('inspection_id', inspectionId)
    .maybeSingle()

  // Fetch inspection + line items
  const { data: inspection, error: fetchErr } = await supabase
    .from('inspections')
    .select('*, inspection_line_items(*)')
    .eq('id', inspectionId)
    .single()
  if (fetchErr) { console.error('[generateEstimate] fetch failed:', fetchErr.message); return null }

  const inspector = inspection?.owner_email?.split('@')[0] || userEmail?.split('@')[0] || 'Flent'
  let estimateId = existing?.id

  if (!estimateId) {
    const { data: est, error: createErr } = await supabase
      .from('estimates')
      .insert({ pid, inspection_id: inspectionId, inspector_name: inspector, status: 'draft', created_by: userEmail })
      .select('id')
      .single()
    if (createErr) { console.error('[generateEstimate] create failed:', createErr.message); return null }
    estimateId = est.id
  } else {
    // Regenerate: clear old items
    await supabase.from('estimate_items').delete().eq('estimate_id', estimateId)
  }

  const validItems = (inspection?.inspection_line_items || []).filter(belongsInEstimate)
  if (validItems.length > 0) {
    const rows = validItems.map((item, i) => ({
      estimate_id:          estimateId,
      line_item_id:         item.id,
      sort_order:           i * 10,
      area:                 item.area || '',
      item_name:            item.item_name || '',
      trade:                item.trade || '',
      issue_description:    item.issue_description || '',
      material_description: item.material_description || '',
      material_cost:        item.material_cost || 0,
      action:               item.action || '',
      labour_description:   item.action || '',
      labour_cost:          item.labour_cost || 0,
      qty:                  item.qty || 1,
      cost_type:            item.cost_type || 'priced',
      status:               'pending',
    }))
    const { error: insertErr } = await supabase.from('estimate_items').insert(rows)
    if (insertErr) console.error('[generateEstimate] items insert failed:', insertErr.message)
  }

  await recomputeEstimateTotal(estimateId)
  return estimateId
}
