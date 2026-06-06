import { supabase } from '../lib/supabase'

export async function resolveInspectionWithData(pid) {
  const { data: inspections } = await supabase
    .from('inspections')
    .select('id, created_at')
    .eq('pid', pid)
    .order('created_at', { ascending: false })
  if (!inspections?.length) return null
  for (const insp of inspections) {
    const { count } = await supabase
      .from('inspection_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('inspection_id', insp.id)
    if (count > 0) return insp.id
  }
  return inspections[0].id
}

const belongsInEstimate = (item) => {
  if (item.cost_type === 'nil') return false
  if (item.excluded_from_estimate) return false
  if (item.section_name?.toLowerCase() === 'appliances') return false
  if (item.availability_status === 'not_available' || item.availability_status === 'no_provision') return false
  const desc = (item.issue_description || '').toLowerCase().trim()
  if (desc === 'not available' || desc === 'n/a' || desc === 'na' || desc.startsWith('not available')) return false
  if (desc.includes('no provision')) return false
  if (desc.includes('functional') || desc.includes('no issues') || desc.includes('no issue')) return false
  return true
}

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
      sort_order:           i,
      area:                 item.area || '',
      item_name:            item.item_name || '',
      trade:                item.trade || '',
      issue_description:    item.issue_description || '',
      material_description: item.material_description || '',
      material_cost:        item.material_cost || 0,
      labour_description:   item.action || '',
      labour_cost:          item.labour_cost || 0,
      qty:                  item.qty || 1,
      cost_type:            item.cost_type || 'priced',
      status:               'pending',
    }))
    const { error: insertErr } = await supabase.from('estimate_items').insert(rows)
    if (insertErr) console.error('[generateEstimate] items insert failed:', insertErr.message)
  }

  return estimateId
}
