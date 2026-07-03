export async function logActivity(supabase, estimateId, entry) {
  try {
    await supabase.from('estimate_activity').insert({
      estimate_id: estimateId,
      action:      entry.action,
      field:       entry.field      ?? null,
      old_value:   entry.old_value  != null ? String(entry.old_value) : null,
      new_value:   entry.new_value  != null ? String(entry.new_value) : null,
      item_id:     entry.item_id    ?? null,
      item_name:   entry.item_name  ?? null,
      changed_by:  entry.changed_by ?? null,
    })
  } catch (e) {
    console.warn('[activity]', e?.message)
  }
}
