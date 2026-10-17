// Explore (exploratory visits from Flent-Stage): shared bits for the record,
// the visit log and the calendar.

export const first = (email) => { const s = (email || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '' }
export const slotText = (d, t) => {
  if (!d) return 'no slot yet'
  const day = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  return t ? `${day}, ${timeText(t)}` : day
}
export const timeText = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` }

export const VERDICT = { go: ['Go', 'green'], no_go: ['No-go', 'red'], unsure: ['Unsure', 'amber'] }
export const RATING = { ok: 'OK', fix: 'Needs work', poor: 'Poor' }
export const CAPEX_BANDS = ['under ₹50k', '₹50k–1 L', '₹1–2 L', '₹2–4 L', 'over ₹4 L']

// What supply asked for, read from the request's notes, decides which checks
// come first and whether the furniture-retain list appears.
export function readAsk(notes) {
  const n = (notes || '').toLowerCase()
  return {
    hygiene: /hygiene|t-?5|clean/.test(n),
    retain: /aff|retain|as[- ]is|furniture/.test(n),
    furnishCost: /furnish|cost of furnishing|furnishing cost/.test(n),
    quote: /quote|estimate/.test(n),
  }
}

const BASE_CHECKS = [
  ['structure', 'Structure & seepage'],
  ['bathrooms', 'Bathrooms & plumbing'],
  ['kitchen', 'Kitchen & appliances'],
  ['electrical', 'Electrical'],
  ['hygiene', 'Hygiene (T5)'],
  ['light', 'Light & ventilation'],
  ['furniture', 'Furniture'],
  ['access', 'Building & access'],
]
export function checklistFor(request) {
  const ask = readAsk(request?.notes)
  const order = [...BASE_CHECKS]
  const lift = (key) => { const i = order.findIndex(c => c[0] === key); if (i > 0) order.unshift(order.splice(i, 1)[0]) }
  if (ask.retain || ask.furnishCost) lift('furniture')
  if (ask.hygiene) lift('hygiene')
  return order.map(([key, label]) => ({ key, label, rating: null, note: '', photos: [] }))
}

// The block a person pastes into Stage's visit form, until that is automated.
export function stageCopy(request, log, author) {
  const v = VERDICT[log.verdict]?.[0]?.toUpperCase() || '—'
  const when = log.visited_at ? new Date(log.visited_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  const lines = [
    `EXPLORATORY VISIT — ${request.property_name || ''}${request.configuration ? ` (${request.configuration})` : ''}`,
    `Visited: ${when}${author ? ` · by ${first(author)} (Flent setup ops)` : ''}`,
    `Verdict: ${v}`,
    log.capex_band ? `Rough capex: ${log.capex_band}` : null,
    '',
    ...(log.checks || []).filter(c => c.rating || c.note).map(c => `• ${c.label}: ${RATING[c.rating] || '—'}${c.note ? ` — ${c.note}` : ''}`),
    ...((log.retain || []).length ? ['', 'Furniture:', ...log.retain.map(r => `• ${r.item}: ${r.keep ? 'keep' : 'replace'}${r.note ? ` — ${r.note}` : ''}`)] : []),
    log.landlord_note ? `\nLandlord: ${log.landlord_note}` : null,
    log.notes ? `\nNotes: ${log.notes}` : null,
    (() => { const n = (log.checks || []).reduce((s, c) => s + (c.photos || []).length, 0); return n ? `\nPhotos: ${n} (in Pulse)` : null })(),
  ]
  return lines.filter(l => l !== null).join('\n')
}

export async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true } } catch { /* fall through */ }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
  document.body.appendChild(ta); ta.focus(); ta.select()
  let ok = false; try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta); return ok
}
