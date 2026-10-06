import { supabase } from '../lib/supabase'

// Is this PID free — and if not, what is holding it?
//
// `properties.pid` is unique in the database forever, but the app has three
// ways of putting a property out of sight: soft-delete into the bin, archive
// it, or never give it a properties row at all (a PID can exist on nothing but
// an inspection). A plain "already in use" named none of them, so a PID in the
// bin became a wall — invisible on every screen, and still refusing to be
// created again, with nothing on screen to say why or what to do about it.
//
// The states, in the order they are decided:
//   live        a property that is in the list right now
//   binned      soft-deleted; recoverable from the bin, or erasable from it
//   archived    deliberately kept, out of the daily list
//   inspection  no properties row, but an inspection already uses the PID
//   free        nothing holds it
export async function pidStatus(pid) {
  const v = String(pid ?? '').trim()
  if (!v) return { pid: v, state: 'free' }

  const [{ data: prop }, { data: bin }, { data: arch }, { data: insp }] = await Promise.all([
    supabase.from('properties').select('pid,name,deleted_at,deleted_by,archived_at,archived_by').eq('pid', v).maybeSingle(),
    supabase.from('properties_bin').select('pid,deleted_at,deleted_by').eq('pid', v).maybeSingle(),
    supabase.from('properties_archive').select('pid,archived_at,archived_by').eq('pid', v).maybeSingle(),
    supabase.from('inspections').select('id,status,created_at').eq('pid', v).order('created_at', { ascending: false }),
  ])

  const out = { pid: v, property: prop || null, bin: bin || null, archive: arch || null, inspections: insp || [] }

  // The bin row and properties.deleted_at are written together, but either one
  // alone is enough to mean deleted — a half-finished delete should read as
  // deleted rather than as a PID that is mysteriously taken.
  if (bin || prop?.deleted_at) {
    return {
      ...out, state: 'binned', inBin: !!bin,
      at: bin?.deleted_at || prop?.deleted_at, by: bin?.deleted_by || prop?.deleted_by,
    }
  }
  if (arch || prop?.archived_at) {
    return { ...out, state: 'archived', at: arch?.archived_at || prop?.archived_at, by: arch?.archived_by || prop?.archived_by }
  }
  if (prop) return { ...out, state: 'live' }
  if ((insp || []).length) return { ...out, state: 'inspection' }
  return { ...out, state: 'free' }
}

// Give up a PID for good, so it can be used again.
//
// The one definition of erasing a property — the bin's "delete permanently"
// calls this too, so a PID reclaimed from the rename modal and one erased from
// the bin leave exactly the same state behind. Order matters: the properties
// list is built from inspections as well as properties, so an inspection left
// behind would re-materialise the thing that was just erased.
//
// The quick note goes with it. PIDs get reused, and a note written about one
// property must not reappear on the next property to take the number.
//
// Destructive, and never silent: every caller asks first.
export async function purgeBinnedPid(pid) {
  const v = String(pid ?? '').trim()
  if (!v) return { error: 'No PID given' }
  for (const q of [
    supabase.from('inspections').delete().eq('pid', v),
    supabase.from('properties').delete().eq('pid', v),
    supabase.from('properties_bin').delete().eq('pid', v),
    supabase.from('quick_notes').delete().eq('pid', v),
  ]) {
    const { error } = await q
    if (error) return { error: error.message }
  }
  return { error: null }
}

// Bring a binned property back into the list, exactly as the bin does.
export async function restoreBinnedPid(pid) {
  const v = String(pid ?? '').trim()
  if (!v) return { error: 'No PID given' }
  const { error } = await supabase.from('properties').update({ deleted_at: null, deleted_by: null }).eq('pid', v)
  if (error) return { error: error.message }
  const { error: bErr } = await supabase.from('properties_bin').delete().eq('pid', v)
  return { error: bErr ? bErr.message : null }
}

// How a held PID should read on screen. One sentence, and it must say which
// screen the property is sitting on — "already in use" sent people looking
// through a list the property had been removed from.
export function pidStatusMessage(s) {
  if (!s) return ''
  const when = s.at ? new Date(s.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const who = s.by ? ` by ${s.by}` : ''
  switch (s.state) {
    case 'live': return `PID ${s.pid} is already in use by a property in the list.`
    // The two halves of a delete are written separately, so one can land
    // without the other. A PID held by a deleted property that never reached
    // the bin would otherwise send you to a bin screen that does not list it.
    case 'binned': return s.inBin
      ? `PID ${s.pid} is in the bin — deleted${when ? ` ${when}` : ''}${who}. It still holds the PID until it is restored or permanently deleted.`
      : `PID ${s.pid} belongs to a property that was deleted${when ? ` ${when}` : ''}${who} but never reached the bin, so it is not listed there. It still holds the PID.`
    case 'archived': return `PID ${s.pid} is archived${when ? ` (${when}${who})` : ''}. Restore it from the archive, or move it to the bin, before reusing the PID.`
    case 'inspection': return `An inspection already uses PID ${s.pid}, so the PID is taken even though no property row exists.`
    default: return ''
  }
}
