// ════════════════════════════════════════════════════════════════════════════
// The utilities record model.
//
// /utilities used to be a list with a countdown on it. This is the other half:
// the book of records, and the three questions people actually bring to it —
// what do we have, what does a record say, and where does the book contradict
// itself.
//
// Everything here is a pure function over rows of `property_utilities` with a
// `prop` attached (see PropertyUtilitiesOverview). Nothing fetches, nothing
// renders, so the checks can be reasoned about and the views stay thin.
// ════════════════════════════════════════════════════════════════════════════
import { CYCLE_MONTHS, typeLabel, TYPE_MAP } from './propertyUtils'

export const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)']

export const money = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
export const moneyShort = (n) => {
  const v = Number(n || 0)
  if (v >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr'
  if (v >= 1e5) return '₹' + (v / 1e5).toFixed(2) + 'L'
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'k'
  return money(v)
}
export const NOT_RECORDED = '— not recorded'

export const monthlyOf = (r) => {
  const m = CYCLE_MONTHS[r.billing_cycle]
  const a = Number(r.billing_amount || 0)
  return m && a ? a / m : 0
}
export const annualOf = (r) => monthlyOf(r) * 12

export function periodOf(dateStr, grain) {
  if (!dateStr) return null
  const [y, m] = String(dateStr).slice(0, 10).split('-')
  if (!y || !m) return null
  if (grain === 'year') return y
  if (grain === 'quarter') return `${y}-Q${Math.ceil(Number(m) / 3)}`
  return `${y}-${m}`
}
export const periodLabel = (p, grain) => (grain === 'month' && p && p.length === 7 ? p.slice(2) : p)

export const daysSince = (dateStr) => {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.round((Date.now() - d.getTime()) / 864e5)
}

// ── canonical plan ──────────────────────────────────────────────────────────
// "200 Mbps mesh", "200 mbps mesh", "200 Mbps Mesh" and "200mbps" are one plan
// typed four ways. Any question of the form "are we all paying the same for the
// same thing?" is unanswerable until they are folded together, so every
// comparison here groups on this and the raw text is kept to be shown and,
// eventually, fixed.
export function canonPlan(plan) {
  if (!plan) return null
  const s = String(plan).toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/(\d)\s*mbps/g, '$1 mbps')
    .replace(/\+\s*mesh/g, 'mesh')
    .replace(/\s+/g, ' ')
    .trim()
  return s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/Mbps/g, 'Mbps')
}

// ── the fields a record needs before anyone can act on it ───────────────────
export const CORE_FIELDS = [
  { k: 'provider', label: 'Provider',       has: (r) => !!r.provider },
  { k: 'plan',     label: 'Plan',           has: (r) => !!r.plan_type },
  { k: 'account',  label: 'Account number', has: (r) => !!r.account_number },
  { k: 'start',    label: 'Start date',     has: (r) => !!r.start_date },
  { k: 'cycle',    label: 'Billing cycle',  has: (r) => !!r.billing_cycle },
  { k: 'amount',   label: 'Billing amount', has: (r) => Number(r.billing_amount) > 0 },
  { k: 'invoice',  label: 'Invoice link',   has: (r) => !!r.invoice_link },
]
export const completeness = (r) => CORE_FIELDS.filter((c) => c.has(r)).length
export const missingOf = (r) => CORE_FIELDS.filter((c) => !c.has(r))

const title = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ── the dimensions anything can be grouped by ───────────────────────────────
export const DIMS = {
  type:      { label: 'Utility type',          of: (r) => typeLabel(r) },
  provider:  { label: 'Provider',              of: (r) => r.provider || NOT_RECORDED },
  planCanon: { label: 'Plan · normalised',     of: (r) => canonPlan(r.plan_type) || NOT_RECORDED },
  plan:      { label: 'Plan · as typed',       of: (r) => r.plan_type || NOT_RECORDED },
  cycle:     { label: 'Billing cycle',         of: (r) => r.billing_cycle || NOT_RECORDED },
  status:    { label: 'Record status',         of: (r) => title(r.status || 'unknown') },
  payMode:   { label: 'Payment mode',          of: (r) => r.payment_mode || NOT_RECORDED },
  source:    { label: 'How it was recorded',   of: (r) => r.source || NOT_RECORDED },
  pid:       { label: 'Property',              of: (r) => `PID ${r.pid}` },
  month:     { label: 'Installed · month',     of: (r) => periodOf(r.start_date, 'month') || '— no start date' },
  quarter:   { label: 'Installed · quarter',   of: (r) => periodOf(r.start_date, 'quarter') || '— no start date' },
  year:      { label: 'Installed · year',      of: (r) => periodOf(r.start_date, 'year') || '— no start date' },
  complete:  { label: 'Completeness',          of: (r) => {
    const c = completeness(r), n = CORE_FIELDS.length
    return c === n ? 'Complete' : c >= n - 2 ? 'Nearly — 1–2 gaps' : c >= 3 ? 'Partial — 3–4 gaps' : 'Sparse — 5+ gaps'
  } },
}

const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0)

// ── and the ways they can be measured ───────────────────────────────────────
export const MEASURES = {
  monthly: { label: 'Monthly run-rate', unit: 'per month',  of: (rows) => sum(rows, monthlyOf), fmt: moneyShort },
  annual:  { label: 'Annualised cost',  unit: 'per year',   of: (rows) => sum(rows, annualOf),  fmt: moneyShort },
  count:   { label: 'Records',          unit: 'records',    of: (rows) => rows.length, fmt: (n) => Number(n).toLocaleString('en-IN') },
  props:   { label: 'Properties',       unit: 'properties', of: (rows) => new Set(rows.map((r) => r.pid)).size, fmt: (n) => Number(n).toLocaleString('en-IN') },
  billed:  { label: 'Billed per cycle', unit: 'per cycle',  of: (rows) => sum(rows, (r) => Number(r.billing_amount || 0)), fmt: moneyShort },
  ticket:  { label: 'Average bill',     unit: 'average',    of: (rows) => (rows.length ? sum(rows, (r) => Number(r.billing_amount || 0)) / rows.length : 0), fmt: money },
}

// Top `cap` groups by the measure, everything else folded into one "Other" —
// never a generated hue for series nine.
export function seriesOf(rows, dimKey, measureKey, cap = 5) {
  const dim = DIMS[dimKey], meas = MEASURES[measureKey]
  const g = new Map()
  for (const r of rows) {
    const k = dim.of(r)
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(r)
  }
  let entries = [...g.entries()].map(([key, rs]) => ({ key, rows: rs, val: meas.of(rs) }))
    .sort((a, b) => b.val - a.val || b.rows.length - a.rows.length)
  if (entries.length > cap) {
    const rest = entries.slice(cap)
    const restRows = rest.flatMap((e) => e.rows)
    entries = entries.slice(0, cap).concat([{ key: `Other · ${rest.length} more`, rows: restRows, val: meas.of(restRows), isOther: true }])
  }
  // Ranks past the fifth get a neutral, never a recycled hue — two series the
  // same colour is worse than one series with no colour.
  return entries.map((e, i) => ({ ...e, color: (e.isOther || i >= VIZ.length) ? 'var(--text-muted)' : VIZ[i] }))
}

// ════════════════════════════════════════════════════════════════════════════
// The checks.
//
// Two families, kept apart on purpose. GAPS are things a record does not say —
// tedious, but obvious the moment you look. CONTRADICTIONS are things the
// records say that cannot all be true at once: one plan under four spellings,
// one price under three values, two live records for one connection. Nobody
// finds those by scrolling, which is the whole argument for this page.
// ════════════════════════════════════════════════════════════════════════════
const LIVE = new Set(['active', 'unknown'])

export function buildChecks(rows) {
  const out = []
  const push = (fam, id, label, why, sev, rs, ev) => { if (rs.length) out.push({ id, fam, label, why, sev, rows: rs, ev }) }
  const gap = (id, label, why, sev, test) => push('gap', id, label, why, sev, rows.filter(test))

  push('con', 'c-price', 'Same plan, different price', 'Identical provider, identical plan, identical cycle — and a different amount on the record. Either somebody is paying more than they should, or one of these numbers is simply wrong.', 'bad', ...pricec(rows))
  push('con', 'c-spell', 'One plan, several spellings', 'Grouping on the plan text splits one plan into several, so every per-plan comparison is quietly wrong until these are spelled the same way.', 'warn', ...spellc(rows))
  push('con', 'c-dupe', 'Two live records for one connection', 'The same property has more than one live record with the same provider and type. Usually the old connection was never marked superseded — which means its cost is being counted twice.', 'bad', dupec(rows))
  push('con', 'c-orphan', 'Record points at no property', 'The PID on this record does not match any property on the books. Nobody can open it, and it is still counted in every figure here.', 'bad', rows.filter((r) => !r.prop))
  push('con', 'c-unknown', 'Status never set', 'The record does not say whether this connection is live. It is counted in the costs on this page because nothing says it should not be.', 'warn', rows.filter((r) => r.status === 'unknown'))

  gap('g-invoice', 'No invoice link', 'There is nothing to show a landlord or an auditor for this connection.', 'warn', (r) => !r.invoice_link)
  gap('g-plan', 'No plan recorded', 'What this connection actually buys — the speed, the litres — is not written down anywhere.', 'warn', (r) => !r.plan_type)
  gap('g-account', 'No account number', 'Nobody can call the provider about this connection without going hunting first.', 'warn', (r) => !r.account_number)
  gap('g-amount', 'No billing amount', 'This connection is invisible to every cost figure on this page.', 'bad', (r) => !(Number(r.billing_amount) > 0))
  gap('g-cycle', 'No billing cycle', 'Without a cycle the amount cannot be turned into a monthly cost, so the record cannot be compared with any other.', 'bad', (r) => !r.billing_cycle)
  gap('g-start', 'No start date', 'The record cannot be placed in time, so it falls out of every trend and every by-month count.', 'bad', (r) => !r.start_date)
  gap('g-stale', 'Untouched for over 9 months', 'Nobody has edited this record in three quarters. It may be perfectly correct — but nothing here confirms it still describes reality.', 'warn',
    (r) => LIVE.has(r.status) && (daysSince(r.updated_at) ?? 0) > 270)

  return out
}

// same provider + normalised plan + cycle, more than one amount
function pricec(rows) {
  const g = new Map()
  for (const r of rows) {
    if (!LIVE.has(r.status) || !r.billing_cycle || !r.plan_type || !(Number(r.billing_amount) > 0)) continue
    const k = `${r.provider}|${canonPlan(r.plan_type)}|${r.billing_cycle}`
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(r)
  }
  const hit = [], ev = []
  for (const [k, rs] of g) {
    const counts = new Map()
    rs.forEach((r) => counts.set(Number(r.billing_amount), (counts.get(Number(r.billing_amount)) || 0) + 1))
    if (counts.size < 2) continue
    hit.push(...rs)
    const vals = [...counts.keys()].sort((a, b) => a - b)
    const [provider, plan, cycle] = k.split('|')
    ev.push({ head: `${provider} · ${plan} · ${String(cycle).toLowerCase()}`,
              parts: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => [money(a), n]),
              spread: vals[vals.length - 1] - vals[0], n: rs.length })
  }
  ev.sort((a, b) => b.spread * b.n - a.spread * a.n)
  return [hit, ev]
}

// same type + provider + normalised plan, more than one raw spelling
function spellc(rows) {
  const g = new Map()
  for (const r of rows) {
    const canon = canonPlan(r.plan_type)
    if (!canon) continue
    const k = `${r.utility_type}|${r.provider}|${canon}`
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(r)
  }
  const hit = [], ev = []
  for (const [k, rs] of g) {
    const spellings = new Map()
    rs.forEach((r) => spellings.set(r.plan_type, (spellings.get(r.plan_type) || 0) + 1))
    if (spellings.size < 2) continue
    hit.push(...rs)
    const [, provider, canon] = k.split('|')
    ev.push({ head: `${provider} · ${canon}`, parts: [...spellings.entries()].sort((a, b) => b[1] - a[1]) })
  }
  ev.sort((a, b) => b.parts.length - a.parts.length)
  return [hit, ev]
}

function dupec(rows) {
  const g = new Map()
  for (const r of rows) {
    if (!LIVE.has(r.status)) continue
    const k = `${r.pid}|${r.utility_type}|${r.provider || ''}`
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(r)
  }
  return [...g.values()].filter((v) => v.length > 1).flat()
}

// ── property-level coverage ─────────────────────────────────────────────────
export function coverageOf(rows, properties) {
  return (properties || []).map((p) => {
    const rs = rows.filter((r) => String(r.pid) === String(p.pid) && LIVE.has(r.status))
    return {
      pid: String(p.pid), name: p.name, address: p.address, rows: rs,
      wifi: rs.some((r) => r.utility_type === 'wifi'),
      water: rs.some((r) => r.utility_type === 'water_purifier'),
      monthly: sum(rs, monthlyOf), annual: sum(rs, annualOf),
    }
  })
}

// The chain of records for one connection at one property: what is live now,
// and what it replaced. `superseded` is the only thing in the table that
// remembers a property used to be on a different plan at a different price.
export function chainFor(row, allRows) {
  return allRows
    .filter((r) => String(r.pid) === String(row.pid) && r.utility_type === row.utility_type && r.id !== row.id)
    .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))
}

export { TYPE_MAP }
