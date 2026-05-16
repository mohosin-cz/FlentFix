export const STAGES = [
  { key: 'T-5',               label: 'T-5',       icon: '🏠' },
  { key: 'inspection_done',   label: 'Inspected', icon: '📋' },
  { key: 'estimate_created',  label: 'Estimate',  icon: '📄' },
  { key: 'estimate_shared',   label: 'Shared',    icon: '🔗' },
  { key: 'estimate_approved', label: 'Approved',  icon: '✓'  },
  { key: 'estimate_rejected', label: 'Rejected',  icon: '✗'  },
  { key: 'utility_planned',   label: 'Utility',   icon: '🔧' },
  { key: 'setup_date',        label: 'Setup',     icon: '📅' },
  { key: 'tday',              label: 'T-Day',     icon: '⚡' },
  { key: 'handover',          label: 'Handover',  icon: '🤝' },
  { key: 'invoice_created',   label: 'Invoice',   icon: '🧾' },
]

export const MAIN_SEQUENCE = STAGES.filter(s => s.key !== 'estimate_rejected')

export async function advanceStage(supabase, pid, newStage, userEmail) {
  await supabase.from('properties').update({ stage: newStage }).eq('pid', pid)
  await supabase.from('property_journey').insert({
    pid,
    stage: newStage,
    changed_by: userEmail || 'system',
  })
}
