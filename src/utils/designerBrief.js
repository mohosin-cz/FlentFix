// The questions the designer is asked, in one place.
//
// They live here rather than in the form because two screens have to agree on
// them: the form she fills, and the staff view that reads it back. If the staff
// view kept its own list, a question added to the form would come back as a raw
// key like "wall_items" — or worse, silently not come back at all, so a blank
// would look like she skipped something she was never asked.
//
// Adding a question here makes it appear on both. Old briefs are unaffected:
// answers are stored by key, and a key nobody answered simply reads as blank.

export const WHOLE = 'Whole property'

// The same five questions in every room, because a designer walking a flat
// thinks room by room, not category by category. The two counters are here
// because those two things come up in every property and are the only things
// she can state exactly — everything else is words and pictures.
export const ROOM_FIELDS = [
  { k: 'furniture',     label: 'Furniture going in here',            kind: 'text',  ph: 'Bed, wardrobe, side tables…' },
  { k: 'light_points',  label: 'Light points to add or change',      kind: 'count' },
  { k: 'switch_points', label: 'Extra switch points / sockets',      kind: 'count' },
  { k: 'wall_items',    label: 'Fixed to the walls',                 kind: 'text',  ph: 'Shelves, mirror, curtain rod, TV mount…' },
  { k: 'complications', label: 'Anything complicated about this room', kind: 'text', ph: 'A beam, a duct, an uneven wall, an odd size…' },
]

export const WHOLE_FIELDS = [
  { k: 'windows',       label: 'Windows needing curtains',           kind: 'count' },
  { k: 'ceiling',       label: 'False ceiling, partitions, panelling', kind: 'text', ph: 'Where, and roughly what' },
  { k: 'painting',      label: 'Painting beyond the usual',          kind: 'text',  ph: 'Accent walls, textures, wallpaper…' },
  { k: 'furniture',     label: 'Anything else being brought in',     kind: 'text',  ph: 'Things that do not belong to one room' },
  { k: 'complications', label: 'Anything the vendor must know before arriving', kind: 'text', ph: 'Access, lift size, society timings, water…' },
]

export const fieldsFor = (area) => (area === WHOLE ? WHOLE_FIELDS : ROOM_FIELDS)

// A count of 0 and an empty string are both "she did not answer this". Kept in
// one function because the form, the staff view and the extraction all have to
// draw that line in the same place.
export const isAnswered = (v) =>
  Array.isArray(v) ? v.length > 0
    : typeof v === 'number' ? v > 0
    : String(v ?? '').trim() !== ''

export function areaIsFilled(answers, area) {
  const a = (answers || {})[area] || {}
  return fieldsFor(area).some(f => isAnswered(a[f.k])) || (a.photos || []).length > 0
}

// How much of the brief she actually filled, for a progress read on both ends.
export function briefProgress(brief) {
  const areas = brief?.areas || []
  const filled = areas.filter(a => areaIsFilled(brief?.answers, a))
  const photos = areas.reduce((n, a) => n + (((brief?.answers || {})[a] || {}).photos || []).length, 0)
  return { areas: areas.length, filled: filled.length, photos, filledAreas: filled }
}
