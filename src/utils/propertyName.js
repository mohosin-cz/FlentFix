// The name of a property, when it has one worth showing.
//
// Every property carries a `name`, but for most of their life those names were
// placeholders the app wrote itself — the PID, or "PID 266" — because a new
// inspection creates the property row with `name: pid`. Printing one of those
// under the PID gives you "PID 266 / 266", which is noise wearing the costume
// of information.
//
// So there is one question, asked in one place: is this a name a person chose?
// Everything that shows a property says nothing at all when the answer is no,
// rather than each screen inventing its own idea of an empty name.
export function realName(row) {
  const pid = String(row?.pid ?? '').trim()
  const name = String(row?.name ?? '').trim()
  if (!name) return null
  if (!pid) return name
  if (name === pid) return null
  if (name.toLowerCase() === `pid ${pid}`.toLowerCase()) return null
  return name
}

// "Saikrupa · PID 266" — for the places that have room for one line and need
// the property to be identifiable from it alone.
export function propertyLabel(row) {
  const name = realName(row)
  const pid = String(row?.pid ?? '').trim()
  return name ? `${name} · PID ${pid}` : `PID ${pid}`
}
