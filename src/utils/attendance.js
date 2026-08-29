// Shared attendance arithmetic.
//
// Lifted out of AttendanceTab so the live board and a vendor's own history
// cannot drift apart. Two screens each pairing in/out rows their own way is
// how you end up with a board saying 8h and a profile saying 7h for the same
// day, with no way to tell which is lying.

// Total regular / overtime milliseconds for one day's punches, plus who is
// still on site. `list` must be a single vendor's punches for one day, oldest
// first. An unclosed 'in' counts up to `now`, so a running shift shows real
// time rather than zero.
export function summarize(list, now = Date.now()) {
  const ms = { regular: 0, overtime: 0 }
  const open = { regular: null, overtime: null }
  let firstIn = null, lastOut = null
  for (const p of list) {
    const k = p.kind || 'regular'
    if (p.punch_type === 'in') { if (!firstIn) firstIn = p; if (open[k] == null) open[k] = new Date(p.punched_at).getTime() }
    else { lastOut = p; if (open[k] != null) { ms[k] += new Date(p.punched_at).getTime() - open[k]; open[k] = null } }
  }
  const regMs = ms.regular + (open.regular != null ? now - open.regular : 0)
  const otMs  = ms.overtime + (open.overtime != null ? now - open.overtime : 0)
  const last  = list[list.length - 1]
  return {
    firstIn, lastOut,
    status: (open.regular != null || open.overtime != null) ? 'on_site' : 'checked_out',
    // which kind is still running, so a board can say "on overtime" rather
    // than "on site" and leave the reader to infer it from a colour
    openKind: open.overtime != null ? 'overtime' : open.regular != null ? 'regular' : null,
    openSince: open.overtime != null ? open.overtime : open.regular,
    regMs, otMs,
    site: (firstIn && firstIn.pid) || (last && last.pid) || null,
  }
}

// Group a vendor's punches into calendar days, newest day first, each day's
// punches oldest first. Keyed on the local date so a shift reads against the
// day the vendor actually worked.
export function groupByDay(punches) {
  const byDay = new Map()
  for (const p of punches) {
    const d = new Date(p.punched_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(p)
  }
  return [...byDay.entries()]
    .map(([date, list]) => ({
      date,
      punches: [...list].sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// Minutes of break taken on a given local date. An unfinished break counts up
// to `now` for the same reason an open shift does.
export function breakMinutesOn(breaks, dateKey, now = Date.now()) {
  return (breaks || []).reduce((sum, b) => {
    const d = new Date(b.started_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (key !== dateKey) return sum
    const end = b.ended_at ? new Date(b.ended_at).getTime() : now
    return sum + Math.max(0, (end - d.getTime()) / 60000)
  }, 0)
}

// Local YYYY-MM-DD, the key days are grouped by.
export function dayKey(d) {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

// summarize() for a *historical* day.
//
// An unclosed 'in' counting up to now() is right for today — it is a shift in
// progress. On a past day it is a forgotten check-out, and counting it to now
// produced totals like 425h for a single day. Rather than invent an end time,
// such a day is reported as incomplete with no hours, so the gap shows up as
// the data problem it is instead of being laundered into a plausible-looking
// number. Totals skip it.
export function summarizeDay(punches, key, now = Date.now()) {
  const s = summarize(punches, now)
  const incomplete = s.status === 'on_site' && key !== dayKey(now)
  return incomplete
    ? { ...s, incomplete: true, regMs: 0, otMs: 0 }
    : { ...s, incomplete: false }
}

export function fmtHrs(ms) {
  const mins = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(mins / 60)
  return h > 0 ? `${h}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`
}

// Break allowances, in minutes. attend_break_rules() in the database is the
// authority — this mirrors it so the staff board can count a running break
// down without a round trip per row. If the SQL changes, change this too.
export const BREAK_MINUTES = { lunch: 45, snack: 15 }
export const BREAK_LABEL = { lunch: 'Lunch', snack: 'Snack' }

// The break a vendor is on right now, if any. An unfinished row (no ended_at)
// is the live one; there is at most one per vendor by construction.
export function openBreakOf(breaks, vendorId) {
  return (breaks || []).find(b => b.vendor_id === vendorId && !b.ended_at) || null
}

// What each break actually cost, against what it was allowed.
//
// The start and the end were already being stored — nothing recorded the
// duration because nothing ever subtracted them. This does, in one place, so
// the vendor's phone and the staff board cannot disagree about whether a lunch
// ran over.
//
// A break still running counts to `now`, the same way an open shift does: a
// lunch that is forty minutes over is over by forty minutes whether or not
// anyone has pressed end yet. That is the case that most needs saying, and the
// one that a duration computed only on close would never show at all.
export function breakLedger(breaks, now = Date.now()) {
  return (breaks || [])
    .slice()
    .sort((a, b) => new Date(a.started_at) - new Date(b.started_at))
    .map(b => {
      const startedAt = new Date(b.started_at).getTime()
      const open = !b.ended_at
      const takenMs = Math.max(0, (open ? now : new Date(b.ended_at).getTime()) - startedAt)
      // vendor rows carry the allowance from the RPC; raw table rows do not
      const allowedMs = ((b.minutes ?? BREAK_MINUTES[b.kind]) || 0) * 60000
      return {
        id: b.id, kind: b.kind, label: BREAK_LABEL[b.kind] || b.kind,
        vendor_id: b.vendor_id, startedAt, endedAt: open ? null : new Date(b.ended_at).getTime(),
        open, takenMs, allowedMs, overMs: Math.max(0, takenMs - allowedMs),
      }
    })
}

// One day's breaks rolled up. `over` is the list that needs somebody's
// attention — running long right now, or finished long and now on the record.
export function breakTotals(breaks, now = Date.now()) {
  const rows = breakLedger(breaks, now)
  return {
    rows,
    count: rows.length,
    takenMs: rows.reduce((a, r) => a + r.takenMs, 0),
    allowedMs: rows.reduce((a, r) => a + r.allowedMs, 0),
    overMs: rows.reduce((a, r) => a + r.overMs, 0),
    over: rows.filter(r => r.overMs > 0),
    open: rows.find(r => r.open) || null,
  }
}

// mm:ss, for a duration that a person is watching rather than filing.
export function fmtMs(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
