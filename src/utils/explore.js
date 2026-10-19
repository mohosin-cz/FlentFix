// Explore (exploratory visits from Flent-Stage): shared bits for the record,
// the visit log and the calendar.

export const first = (email) => { const s = (email || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '' }
export const slotText = (d, t) => {
  if (!d) return 'no slot yet'
  const day = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  return t ? `${day}, ${timeText(t)}` : day
}
export const timeText = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` }

// Stage's words for the visit outcome (stored as go / no_go / unsure).
export const VERDICT = { go: ['Accept', 'green'], no_go: ['Reject', 'red'], unsure: ['Under review', 'amber'] }
export const RATING = { ok: 'OK', fix: 'Needs work', poor: 'Poor' }
export const CAPEX_BANDS = ['under ₹50k', '₹50k–1 L', '₹1–2 L', '₹2–4 L', 'over ₹4 L']

// What supply asked for, read from the request's notes, decides which checks
// come first and whether the furniture-retain list appears.
export function readAsk(notes) {
  const n = (notes || '').toLowerCase()
  return {
    hygiene: /hygiene|t-?5|clean/.test(n),
    t5: /\bt\s*-?\s*5\b/.test(n),
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

// ── the visit log, second shape (log.detail) ───────────────────────────────

// The condition of the place, trade by trade, each scored out of 10.
export const TRADES = [
  ['plumbing', 'Plumbing', 'taps, flush, drains, leaks, water pressure'],
  ['electrical', 'Electrical', 'switches, wiring, DB, earthing, lights'],
  ['civil', 'Civil & seepage', 'walls, ceilings, cracks, damp'],
  ['carpentry', 'Carpentry', 'wardrobes, doors, kitchen shutters, hinges'],
  ['painting', 'Painting', 'walls, polish, peeling'],
  ['flooring', 'Flooring & tiles', 'cracks, hollow tiles, grout'],
  ['appliances', 'Appliances', 'geyser, chimney, fridge, AC, washing machine'],
  ['hygiene', 'Cleaning & hygiene', 'deep-clean need, pests, smell'],
]
export const scoreRating = (n) => (n == null ? null : n >= 7 ? 'ok' : n >= 4 ? 'fix' : 'poor')
export const scoreTone = (n) => (n == null ? 'grey' : n >= 7 ? 'green' : n >= 4 ? 'amber' : 'red')

// The things people always need to know and rarely write down.
export const FACTS = [
  ['seepage', 'Visible seepage', [['none', 'None'], ['some', 'Some'], ['severe', 'Severe']], true],
  ['washing_machine', 'Washing-machine point', [['yes', 'Yes'], ['no', 'No'], ['possible', 'Can be added']], true],
  ['meter', 'Power meter', [['single', 'Single phase'], ['three', 'Three phase']], false],
  ['sump', 'Sump tank', [['good', 'Good'], ['clean', 'Needs cleaning'], ['damaged', 'Damaged'], ['none', 'None']], true],
  ['overhead', 'Overhead tank', [['good', 'Good'], ['clean', 'Needs cleaning'], ['damaged', 'Damaged'], ['none', 'None']], true],
  ['water', 'Water supply', [['cauvery', 'Cauvery'], ['borewell', 'Borewell'], ['both', 'Both'], ['tanker', 'Tanker']], false],
  ['geyser', 'Geysers', [['all', 'In every bath'], ['some', 'Some'], ['none', 'None']], false],
  ['backup', 'Power backup', [['yes', 'Yes'], ['no', 'No']], false],
  ['lift', 'Lift', [['yes', 'Yes'], ['no', 'No'], ['na', 'Not needed']], false],
  ['parking', 'Parking', [['car', 'Car'], ['bike', 'Two-wheeler only'], ['none', 'None']], false],
]

// Supply's note, split into the separate things they asked for.
export function parseAsks(notes) {
  return (notes || '')
    .split(/\n+|;|\.\s+(?=[A-Z])|\s+plus\s+/i)
    .map(x => x.replace(/^[\s•\-*\d.)]+/, '').replace(/\.$/, '').trim())
    .filter(x => x.length > 3)
    .map(text => ({ text, answer: '', photos: [], done: false }))
}

export function freshDetail(request) {
  return {
    version: 2,
    asks: parseAsks(request?.notes),
    trades: TRADES.map(([key, label]) => ({ key, label, score: null, note: '', photos: [] })),
    facts: {},
    non_retain: [],
    pros: [], cons: [], actions: [],
    internal: '',
    follow_up: { needed: null, what: '' },
    t5_opened_at: null,
  }
}

const FACT_WORD = (key, val) => {
  const f = FACTS.find(x => x[0] === key)
  return f ? (f[2].find(o => o[0] === val) || [])[1] : null
}

// Stage's visit form, field by field, from a log.
export function stageFields(request, log, author) {
  const d = log?.detail
  if (!d) return null
  const out = []
  const answered = (d.asks || []).filter(a => a.answer || a.done)
  if (answered.length) out.push('Supply asked', ...answered.map(a => `• ${a.text}: ${a.answer || 'done'}`), '')
  const scored = (d.trades || []).filter(t => t.score != null || t.note)
  if (scored.length) out.push('Condition by trade', ...scored.map(t => `• ${t.label}: ${t.score != null ? `${t.score}/10` : '—'}${t.note ? ` — ${t.note}` : ''}`), '')
  const facts = FACTS.filter(([k]) => d.facts?.[k]?.v || d.facts?.[k]?.note)
  if (facts.length || d.facts?.other) {
    out.push('Site checks', ...facts.map(([k, label]) => `• ${label}: ${FACT_WORD(k, d.facts[k].v) || '—'}${d.facts[k].note ? ` — ${d.facts[k].note}` : ''}`))
    if (d.facts?.other) out.push(`• Other: ${d.facts.other}`)
    out.push('')
  }
  for (const [k, h] of [['pros', 'Pros'], ['cons', 'Cons'], ['actions', 'Action items']]) {
    const xs = (d[k] || []).filter(Boolean)
    if (xs.length) out.push(h, ...xs.map(x => `- ${x}`), '')
  }
  const when = log.visited_at ? new Date(log.visited_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  out.push(`Visited ${when}${author ? ` by ${first(author)} (Flent setup ops)` : ''}${(d.trades || []).some(t => (t.photos || []).length) ? ' · photos in Pulse' : ''}`)
  return {
    outcome: VERDICT[log.verdict]?.[0] || '',
    follow_up: d.follow_up?.needed == null ? '' : d.follow_up.needed ? `Yes${d.follow_up.what ? ` — ${d.follow_up.what}` : ''}` : 'No',
    notes: out.join('\n').trim(),
    non_retain: (d.non_retain || []).filter(x => x.name).map(x => `${x.name}${x.where ? ` (${x.where})` : ''}`).join('\n'),
    non_retain_photos: (d.non_retain || []).filter(x => x.photo).map(x => x.photo),
    internal: d.internal || '',
  }
}

// The block a person pastes into Stage's visit form, until that is automated.
export function stageCopy(request, log, author) {
  const f = stageFields(request, log, author)
  if (f) {
    return [
      `EXPLORATORY VISIT — ${request.property_name || ''}${request.configuration ? ` (${request.configuration})` : ''}`,
      `Outcome: ${f.outcome || '—'}`, f.follow_up ? `Follow-up: ${f.follow_up}` : null, '', f.notes,
      f.non_retain ? `\nNot to retain:\n${f.non_retain}` : null,
      f.internal ? `\nInternal: ${f.internal}` : null,
    ].filter(x => x !== null).join('\n')
  }
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
