// Team load — one definition, used by Home's Team load card and the
// /team/load page, so the bar on Home and the breakdown behind it can never
// disagree. Everything here works on rows the journey engine already returns
// (property_journey_state('all') + explore_journey_state()) and the owners map
// from home_team(); nothing is recomputed server-side.

// Rows that count toward anyone's load: test PIDs out, closed / archived out.
// Paused properties never reach the client — the engine skips them.
export const liveRows = (rows) => (rows || []).filter(r => !/^test/i.test(r.pid) && r.stage_code !== 'closed' && r.stage_code !== 'archived')

// Whose a row is. Properties: home_team's owner (assigned_to, else the
// property's owner_email). Prospects: the engine's owner (the assignee, else
// Stage's inspector, else the first admin for visits nobody is on yet).
export const ownerOf = (r, owners) => r.is_prospect ? (r.owner_email || '').toLowerCase() || null : owners?.[r.pid] || null

// Not-taken prospects are history, not load.
export const isCarried = (r) => r.stage_code !== 'explore_not_taken'

// The three bar segments. Judged on the headline step only — the engine's
// pick of the most urgent thing on the property.
//   them   — the next move is setup ops'
//   others — someone else has it and it needs chasing: late, due today or soon
//   quiet  — someone else has it and is still inside the limit (or the step
//            has none, like vendors working): nobody needs to act yet
export function bucketOf(r) {
  if (r.urgency === 'done') return 'quiet'
  if (r.blocked_on === 'setup_ops') return 'them'
  if (r.blocked_on && r.urgency === 'waiting') return 'quiet'
  if (r.blocked_on) return 'others'
  return 'unset'
}

export const isSetupThisWeek = (r) => r.days_to_setup != null && r.days_to_setup >= 0 && r.days_to_setup <= 6

// One person's numbers, exactly as the Team load row shows them.
export function personLoad(p, rows, owners) {
  const mine = rows.filter(r => ownerOf(r, owners) === p.email && isCarried(r))
  return {
    ...p, rows: mine, owned: mine.length,
    overdue: mine.filter(r => r.urgency === 'overdue').length,
    today: mine.filter(r => r.urgency === 'today').length,
    setups: mine.filter(isSetupThisWeek).length,
    onThem: mine.filter(r => bucketOf(r) === 'them').length,
    onOthers: mine.filter(r => bucketOf(r) === 'others').length,
    quiet: mine.filter(r => bucketOf(r) === 'quiet').length,
  }
}

export function teamLoad(people, rows, owners) {
  return (people || []).map(p => personLoad(p, rows, owners)).sort((a, b) => b.owned - a.owned)
}

export const firstName = (email) => { const s = (email || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '—' }

export const WAITING = { setup_ops: 'Setup ops', landlord: 'Landlord', vendor: 'Vendor', supply: 'Supply', none: 'Nobody' }

// Steps whose engine label carries a count ("9 of 21 items approved") are
// grouped under one name, so tables have one row per step.
export const STEP_NAME = {
  landlord_deciding: 'Landlord approving items',
  explore_assign: 'Explore · assign someone', explore_confirm: 'Explore · confirm the visit', explore_visit: 'Explore · visit booked',
  explore_log: 'Explore · log the findings', explore_decision: 'Explore · supply to decide', explore_deal: 'Explore · supply closing the deal',
  explore_link: 'Explore · link to its PID', explore_create_pid: 'Explore · create the PID', explore_slot: 'Explore · supply to set a slot',
  explore_stale: 'Explore · stale in Stage', explore_paste: 'Explore · paste findings into Stage', explore_paste_main: 'Explore · logged, not in Stage yet', items_to_verify: 'Vendor work to verify', disputed: 'Items sent back to vendor',
  setup_day: 'Setup day', setup_in_progress: 'Work under way', vendors_on_site: 'Vendors on site', wo_awaiting_day: 'Waiting for setup day',
  wo_overdue: 'Items open past closure date', wo_unassigned: 'Work orders with no vendor', wo_undated: 'Work orders with no closure date',
  utilities_unplanned: 'WiFi / RO / pest control not booked', utility_details_pending: 'Utility details not registered',
}
export const stepName = (code, label) => STEP_NAME[code] || label || code

// Every step the engines can raise, in journey order, with who it waits on
// and the limit it is held to. `limit` is a journey_thresholds() key (elapsed
// days since the step began); `lead` is a key counted back from the setup
// date; `fixed` is a limit written into the engine itself.
export const STEPS = [
  // exploratory (explore_journey_state)
  { code: 'explore_slot', name: 'Supply to set a visit slot', wait: 'supply', fixed: 2, phase: 'Explore' },
  { code: 'explore_assign', name: 'Assign someone for the visit', wait: 'setup_ops', rule: 'by the visit date: past = overdue, today = today, tomorrow = soon', phase: 'Explore' },
  { code: 'explore_confirm', name: 'Confirm the visit', wait: 'setup_ops', rule: 'by the visit date', phase: 'Explore' },
  { code: 'explore_visit', name: 'Visit booked', wait: 'setup_ops', rule: 'by the visit date', phase: 'Explore' },
  { code: 'explore_log', name: 'Log the findings', wait: 'setup_ops', rule: 'overdue as soon as the visit date passes', phase: 'Explore' },
  { code: 'explore_paste_main', name: 'Logged — paste findings into Stage', wait: 'setup_ops', fixed: 1, phase: 'Explore' },
  { code: 'explore_decision', name: 'Supply to decide', wait: 'supply', fixed: 3, phase: 'Explore' },
  { code: 'explore_deal', name: 'Supply closing the deal', wait: 'supply', rule: 'no limit — supply’s pace', phase: 'Explore' },
  { code: 'explore_create_pid', name: 'Create the PID in Pulse', wait: 'setup_ops', fixed: 2, phase: 'Explore' },
  { code: 'explore_link', name: 'Link to its PID', wait: 'setup_ops', fixed: 2, phase: 'Explore' },
  { code: 'explore_stale', name: 'Stale in Stage', wait: 'supply', rule: 'no limit — sits on the admin', phase: 'Explore' },
  // property (property_journey_state)
  { code: 'property_created', name: 'Property created, no inspection', wait: 'setup_ops', limit: 'onboarded_days', phase: 'Inspect' },
  { code: 'inspection_in_progress', name: 'Inspection started, not finished', wait: 'setup_ops', limit: 'inspection_draft_days', phase: 'Inspect' },
  { code: 'inspection_complete', name: 'Inspection done, no estimate', wait: 'setup_ops', limit: 'estimate_not_created_days', phase: 'Inspect' },
  { code: 'estimate_draft', name: 'Estimate drafted, not sent', wait: 'setup_ops', limit: 'estimate_draft_days', phase: 'Estimate' },
  { code: 'estimate_sent', name: 'Estimate with supply, no decision', wait: 'supply', limit: 'supply_forward_days', phase: 'Estimate' },
  { code: 'landlord_deciding', name: 'Landlord approving items', wait: 'landlord', limit: 'landlord_silent_days', phase: 'Estimate' },
  { code: 'landlord_queried', name: 'Landlord query waiting for a reply', wait: 'setup_ops', limit: 'query_reply_days', phase: 'Estimate' },
  { code: 'estimate_final_pending', name: 'All approved, estimate not final', wait: 'setup_ops', limit: 'estimate_final_days', phase: 'Estimate' },
  { code: 'setup_date_pending', name: 'Estimate final, no setup date', wait: 'setup_ops', limit: 'setup_date_days', phase: 'Plan' },
  { code: 'utilities_unplanned', name: 'WiFi / RO / pest control not booked', wait: 'setup_ops', lead: 'utilities_lead_days', phase: 'Plan' },
  { code: 'work_orders_unplanned', name: 'No work orders raised', wait: 'setup_ops', lead: 'wo_lead_days', phase: 'Plan' },
  { code: 'wo_unassigned', name: 'Work orders with no vendor', wait: 'setup_ops', lead: 'assign_lead_days', limit: 'wo_unassigned_days', phase: 'Plan' },
  { code: 'wo_undated', name: 'Work orders with no closure date', wait: 'setup_ops', lead: 'assign_lead_days', limit: 'wo_unscheduled_days', phase: 'Plan' },
  { code: 'wo_awaiting_day', name: 'Waiting for setup day', wait: 'vendor', rule: 'soon inside setup_soon_days, else waiting', phase: 'Setup' },
  { code: 'setup_day', name: 'Setup day', wait: 'vendor', rule: 'always today', phase: 'Setup' },
  { code: 'vendors_on_site', name: 'Vendors on site', wait: 'vendor', rule: 'waiting — no limit', phase: 'Setup' },
  { code: 'setup_in_progress', name: 'Work under way', wait: 'vendor', rule: 'waiting — no limit', phase: 'Setup' },
  { code: 'items_to_verify', name: 'Vendor work to verify', wait: 'setup_ops', limit: 'items_to_verify_days', phase: 'Setup' },
  { code: 'disputed', name: 'Items sent back to vendor', wait: 'vendor', limit: 'dispute_days', phase: 'Setup' },
  { code: 'wo_overdue', name: 'Items open past closure date', wait: 'vendor', fixed: 0, phase: 'Setup' },
  { code: 'payments_pending', name: 'Confirm all payments are logged', wait: 'setup_ops', limit: 'payments_days', phase: 'Close' },
  { code: 'utility_details_pending', name: 'Utility details not registered', wait: 'setup_ops', limit: 'utility_details_days', phase: 'Close' },
  { code: 'setup_close_pending', name: 'All work done, close setup', wait: 'setup_ops', limit: 'setup_close_days', phase: 'Close' },
  { code: 'qc_pending', name: 'Setup closed, QC not done', wait: 'setup_ops', limit: 'qc_days', phase: 'Close' },
  { code: 'handover_pending', name: 'QC done, not handed over', wait: 'setup_ops', limit: 'handover_days', phase: 'Close' },
  { code: 'wo_share_pending', name: 'Work order not on Slack', wait: 'setup_ops', limit: 'wo_share_days', phase: 'Close' },
  { code: 'invoice_pending', name: 'No final landlord invoice', wait: 'setup_ops', limit: 'invoice_days', phase: 'Close' },
  { code: 'close_pending', name: 'Invoiced, property not closed', wait: 'setup_ops', limit: 'close_days', phase: 'Close' },
]
export const STEP_ORDER = Object.fromEntries(STEPS.map((s, i) => [s.code, i]))
