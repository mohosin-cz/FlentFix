import { supabase } from '../lib/supabase'
import { advanceStage } from './propertyJourney'

export async function generateInvoice(estimateId, userEmail) {
  const { data: estimate } = await supabase
    .from('estimates')
    .select('*, estimate_items(*)')
    .eq('id', estimateId)
    .single()

  if (!estimate) return null

  // Only priced approved items form the fixed invoice total; actuals are excluded from subtotal
  const pricedItems = estimate.estimate_items.filter(
    i => i.status === 'approved' && i.cost_type === 'priced'
  )

  const { count } = await supabase
    .from('tax_invoices')
    .select('id', { count: 'exact', head: true })

  const invoiceNumber = `FLT/INV/${estimate.pid}/${String((count || 0) + 1).padStart(3, '0')}`

  const subtotal = pricedItems.reduce((s, i) => s + (i.material_cost || 0) + (i.labour_cost || 0), 0)
  const cgst  = +(subtotal * 0.09).toFixed(2)
  const sgst  = +(subtotal * 0.09).toFixed(2)
  const total = +(subtotal + cgst + sgst).toFixed(2)

  const { data: invoice, error } = await supabase
    .from('tax_invoices')
    .insert({
      pid: estimate.pid,
      estimate_id: estimateId,
      invoice_number: invoiceNumber,
      landlord_name: estimate.approved_by_name,
      subtotal,
      cgst,
      sgst,
      total,
      created_by: userEmail,
    })
    .select()
    .single()

  if (error || !invoice) return null

  const items = pricedItems.map((it, i) => ({
    invoice_id: invoice.id,
    description: [it.area, it.issue_description].filter(Boolean).join(' — '),
    qty: it.qty || 1,
    rate: +(((it.material_cost || 0) + (it.labour_cost || 0)) / (it.qty || 1)).toFixed(2),
    amount: (it.material_cost || 0) + (it.labour_cost || 0),
    sort_order: i,
  }))

  if (items.length) await supabase.from('tax_invoice_items').insert(items)

  await advanceStage(supabase, estimate.pid, 'invoice_created', userEmail)
  return invoice.id
}
