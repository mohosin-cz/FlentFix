// Shared config + "next recharge due" logic for property utilities.
// DTH/Cable intentionally removed.
export const UTILITY_TYPES = [
  { key: 'wifi',           label: 'WiFi / Broadband',    color: '#7f93b8' },
  { key: 'water_purifier', label: 'Water Purifier (RO)', color: '#38bdf8' },
  { key: 'pest_control',   label: 'Pest control',        color: '#b5895a' },
  { key: 'other',          label: 'Other',               color: '#8b8d98' },
]
export const TYPE_MAP = Object.fromEntries(UTILITY_TYPES.map(t => [t.key, t]))
export const ADD_TYPES = UTILITY_TYPES

export const BILLING_CYCLES = ['Monthly', 'Bi-monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'One-time']
export const CYCLE_MONTHS = { Monthly: 1, 'Bi-monthly': 2, Quarterly: 3, 'Half-yearly': 6, Yearly: 12 }

export const STATUSES = [
  { key: 'active',     label: 'Active',     color: 'var(--green, #6f9a7e)' },
  { key: 'paused',     label: 'Paused',     color: 'var(--accent, #c8963e)' },
  { key: 'cancelled',  label: 'Cancelled',  color: 'var(--text-muted, #6b6d82)' },
  { key: 'unknown',    label: 'Unknown',    color: 'var(--accent, #c8963e)' },
  { key: 'superseded', label: 'Superseded', color: 'var(--text-muted, #6b6d82)' },
]
export const STATUS_MAP = Object.fromEntries(STATUSES.map(st => [st.key, st]))
// statuses that count as "live" — they get a recharge countdown + show in the overview
export const LIVE_STATUSES = new Set(['active', 'unknown'])

// A PID is a bare number — 1, 11, 228 — and the property is named "PID 228", so
// a plain substring search for "228" also lands on PID 1228, on an account
// number with 228 in it, and on a phone number. A PID is how a property gets
// shared, so when somebody types one it has to mean that property and nothing
// else. This reads the ways people actually write it — "228", "PID 228",
// "pid-228", "#228" — and returns the digits, or null when it is not a PID at
// all and the query should be treated as text.
export function pidQuery(q) {
  const s = String(q ?? '').trim().toLowerCase().replace(/^#/, '').replace(/^p\.?i\.?d\.?[\s#:_-]*/, '').trim()
  return /^\d+$/.test(s) ? String(Number(s)) : null   // "0228" and "228" are one property
}

export function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
export function typeLabel(u) {
  if (u.utility_type === 'other') return (u.custom_type || '').trim() || 'Other'
  return TYPE_MAP[u.utility_type]?.label || u.utility_type
}
export function typeColor(u) {
  return TYPE_MAP[u.utility_type]?.color || '#8b8d98'
}

// A utility is valid for one billing cycle from its base date — the last
// recharge if one was ever logged, otherwise the install date. The next
// recharge is base + one cycle, and that is the whole of it.
//
// It used to roll that date forward, cycle by cycle, until it landed in the
// future. That turned a connection eight months past its period into "due in
// 12 days" and meant nothing could ever be overdue. The rollforward was doing
// the job of a payment record nobody keeps: it assumed every cycle in between
// had been paid. On the live table that assumption was hiding 150 of the 292
// schedulable connections — a little over half the estate.
//
// null when there is nothing to schedule (no base date, or a cycle with no
// length, which includes One-time).
export function nextDueDate(baseStr, cycle) {
  const m = CYCLE_MONTHS[cycle]
  if (!baseStr || !m) return null
  const base = new Date(String(baseStr).slice(0, 10) + 'T00:00:00')
  if (isNaN(base)) return null
  const d = new Date(base)
  const day = d.getDate()
  d.setMonth(d.getMonth() + m)
  // 31 Jan plus a month is the end of February, not the 2nd of March
  if (d.getDate() < day) d.setDate(0)
  return d
}

// How many whole billing periods have ended without a recharge being recorded.
// 1 the day after the first period lapses, 2 a cycle later, and so on; 0 while
// the connection is still inside its current period — including the day the
// period ends, which is a day to act on, not a day already missed.
export function periodsLapsed(dueDate, cycle, today) {
  const m = CYCLE_MONTHS[cycle]
  if (!dueDate || !m || dueDate >= today) return 0
  let n = 1
  const d = new Date(dueDate)
  while (n < 400) {
    const day = d.getDate()
    d.setMonth(d.getMonth() + m)
    if (d.getDate() < day) d.setDate(0)
    if (d > today) break
    n++
  }
  return n
}

// Utilities that went live in a given month, and the run-rate they added.
// Deliberately install-only: nothing records an actual recharge — the
// recharges table is empty and last_recharged_on is unset everywhere — so any
// "renewals paid this month" figure would be projected from install dates and
// read as fact. Installs are a real event we hold a date for.
export function installsInMonth(rows, year, monthIdx) {
  let count = 0, paid = 0, monthlyAdded = 0
  for (const u of rows || []) {
    if (!u || !LIVE_STATUSES.has(u.status) || !u.start_date) continue
    const d = new Date(u.start_date + 'T00:00:00')
    if (isNaN(d) || d.getFullYear() !== year || d.getMonth() !== monthIdx) continue
    count++
    if (u.billing_amount == null) continue
    const amt = Number(u.billing_amount)
    paid += amt
    const cyc = CYCLE_MONTHS[u.billing_cycle]
    if (cyc) monthlyAdded += amt / cyc
  }
  return { count, paid, monthlyAdded }
}

// monthly-equivalent cost of a live utility (0 for one-time / no amount / inactive)
export function monthlyCost(u) {
  if (!u || !LIVE_STATUSES.has(u.status) || u.billing_amount == null) return 0
  const m = CYCLE_MONTHS[u.billing_cycle]
  if (!m) return 0
  return Number(u.billing_amount) / m
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

// per-month deployment cohorts keyed on install (start_date), newest first
// Two different money questions, kept as two fields because conflating them is
// what made this table unreconcilable against the fixture sheet:
//   paid  — cash committed by that month's deployments (a ₹5,088/yr plan is ₹5,088)
//   spend — recurring monthly-equivalent those deployments added (₹5,088/12 = ₹424)
// The sheet counts cash, so `paid` is the headline and `spend` the footnote.
export function deploymentsByMonth(rows) {
  const map = {}
  for (const r of rows) {
    if (!r.start_date) continue
    const ym = r.start_date.slice(0, 7)
    const g = map[ym] || (map[ym] = { ym, deploys: 0, props: new Set(), wifi: 0, water: 0, other: 0, spend: 0, paid: 0 })
    g.deploys++
    g.props.add(r.pid)
    if (r.utility_type === 'wifi') g.wifi++
    else if (r.utility_type === 'water_purifier') g.water++
    else g.other++
    g.spend += monthlyCost(r)
    g.paid += Number(r.billing_amount) || 0
  }
  return Object.values(map).map(g => ({ ...g, properties: g.props.size })).sort((a, b) => b.ym.localeCompare(a.ym))
}

// bucket a utility by recharge urgency:
// 'overdue' (the period already ended) | 'due' (<=7d) | 'month' (<=31d) | 'later' | 'none'
export function dueBucket(u) {
  const di = dueInfo(u)
  if (!di) return 'none'
  if (di.days < 0) return 'overdue'
  if (di.days <= 7) return 'due'
  if (di.days <= 31) return 'month'
  return 'later'
}

// human-facing due status; returns null when there's nothing to schedule.
//
// `basis` matters more than it looks. Not one row in the table has ever had a
// recharge logged, so every countdown on this page is measured from the install
// date. That is a reasonable thing to show — but it is an assumption, and the
// UI says which it is rather than presenting it as a payment history.
export function dueInfo(u) {
  if (!u || !LIVE_STATUSES.has(u.status)) return null
  const basis = u.last_recharged_on ? 'recharge' : 'install'
  const d = nextDueDate(u.last_recharged_on || u.start_date, u.billing_cycle)
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  const lapsed = periodsLapsed(d, u.billing_cycle, today)

  const verb = u.utility_type === 'pest_control' ? 'Treatment' : 'Recharge'
  let color, label, tone
  if (days < 0) {
    color = 'var(--red, #b0645b)'; tone = 'overdue'
    label = lapsed > 1
      ? `${lapsed} periods with no ${verb.toLowerCase()} logged`
      : `${verb} overdue by ${-days} ${-days === 1 ? 'day' : 'days'}`
  } else if (days === 0) { color = 'var(--red, #b0645b)'; label = `${verb} due today`; tone = 'due' }
  else if (days === 1) { color = 'var(--red, #b0645b)'; label = `${verb} tomorrow`; tone = 'due' }
  else if (days <= 5) { color = 'var(--accent, #c8963e)'; label = `${verb} in ${days} days`; tone = 'soon' }
  else { color = 'var(--green, #6f9a7e)'; label = `${verb} in ${days} days`; tone = 'ok' }

  const note = basis === 'install'
    ? 'Counted from the install date — no recharge has ever been logged against this connection.'
    : null
  return { date: d, days, label, color, tone, basis, periodsLapsed: lapsed, overdue: days < 0, note }
}

// ── Entry presets ────────────────────────────────────────────────────────────
// The common cases as one tap, with a free-text escape for the rest. Typing
// "ACT" by hand on a phone at a site is how "ACT", "Act" and "ACT Fibernet"
// end up as three providers in the same report.

// Ordered by how often they actually appear in the estate, so the first chip
// is usually the right one.
export const PROVIDERS = {
  wifi: ['ACT', 'Airtel', 'Tata Play Fiber', 'Jio', 'BSNL'],
  water_purifier: ['DrinkPrime', 'AquaGuard-LL', 'Livpure', 'Kent', 'Pureit'],
  pest_control: [],
  other: [],
}

// What a pest control visit treats. Planning books one or more of these, and
// the Utilities record keeps them as its "plan".
export const PEST_TREATMENTS = ['General', 'Bed bugs', 'Termite', 'Rodents']

// "Plan" is the thing you bought, and it means different things per utility:
// a line speed for broadband, a litre allowance for an RO. It is NOT the
// recharge length — that is the billing cycle, below. Keeping them separate
// matches how the 300-odd existing rows are already filled in.
export const PLANS = {
  wifi: ['100 Mbps', '200 Mbps', '200 Mbps mesh', '300 Mbps', '400 Mbps'],
  water_purifier: ['250L/M', '500L/M', 'Unlimited'],
  pest_control: PEST_TREATMENTS,
  other: [],
}

// The recharge length as chips, with the duration spelled out beside the name —
// "Half-yearly 6m" so nobody has to translate. Derived from BILLING_CYCLES and
// CYCLE_MONTHS rather than restated, because a second hand-written list of the
// same cycles is a list that eventually disagrees with the one driving the
// countdown. One-time has no duration, hence the blank.
export const CYCLE_PRESETS = BILLING_CYCLES.map(cycle => ({
  cycle,
  short: CYCLE_MONTHS[cycle] ? `${CYCLE_MONTHS[cycle]}m` : '',
}))

// The standard we set on install — 161 of the 166 WiFi rows use it. Anything
// else is typed once, deliberately.
export const DEFAULT_PASSWORD = 'Flent@2k24'

// Nearly every SSID in the estate is Flent_<flat>, but the flat number is not
// the PID and nothing here knows it. So this offers the prefix and stops —
// proposing a whole SSID would just be inventing the half that matters.
export const SSID_PREFIX = 'Flent_'

// ── period analysis ─────────────────────────────────────────────────────────
// Month, quarter or year over the same rows. The grain is a parameter rather
// than three near-identical functions, because the moment they are separate
// one of them gets a fix the others do not.
//
// Anchored on start_date — the install — for the reason installsInMonth gives:
// nothing records an actual recharge, so a period figure built on renewals
// would be a projection wearing the clothes of a fact.
export const GRAINS = [
  { key: 'month',   label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year',    label: 'Year' },
]

export function periodKeyOf(dateStr, grain) {
  if (!dateStr) return null
  const [y, m] = String(dateStr).slice(0, 10).split('-')
  if (!y || !m) return null
  if (grain === 'year') return y
  if (grain === 'quarter') return `${y}-Q${Math.floor((Number(m) - 1) / 3) + 1}`
  return `${y}-${m}`
}

export function periodLabelOf(key, grain) {
  if (!key) return '—'
  if (grain === 'year') return key
  if (grain === 'quarter') return key.replace('-', ' ')
  return monthLabel(key)
}

// One row per period, oldest first, carrying both money questions plus a
// running total. `cumulativeMonthly` is the estate's run-rate as it stood at
// the end of that period — the number that answers "what do we now pay every
// month", which no single period can.
export function deploymentsByPeriod(rows, grain) {
  const map = new Map()
  for (const r of rows || []) {
    if (!r || !LIVE_STATUSES.has(r.status)) continue
    const key = periodKeyOf(r.start_date, grain)
    if (!key) continue
    const g = map.get(key) || {
      key, label: periodLabelOf(key, grain),
      deploys: 0, wifi: 0, water: 0, other: 0,
      paid: 0, spend: 0, props: new Set(),
    }
    g.deploys++
    g.props.add(r.pid)
    if (r.utility_type === 'wifi') g.wifi++
    else if (r.utility_type === 'water_purifier') g.water++
    else g.other++
    g.paid += Number(r.billing_amount) || 0
    g.spend += monthlyCost(r)
    map.set(key, g)
  }
  let running = 0
  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(g => {
      running += g.spend
      return {
        ...g,
        properties: g.props.size,
        cumulativeMonthly: running,
        avgPaid: g.deploys ? g.paid / g.deploys : 0,
      }
    })
}

// Change against the period before, as a signed ratio. null when there is no
// previous period or it was zero — "+100%" from nothing is not information.
// Is this the period we are standing in? A current month compared with a
// complete one always looks like a collapse — 2026 Q3 read "down 60%" on its
// second week — so the caller needs to know before it draws an arrow.
export function isCurrentPeriod(key, grain) {
  const now = new Date()
  return key === periodKeyOf(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, grain)
}

export function deltaPct(now, prev) {
  if (prev == null || prev === 0 || now == null) return null
  return (now - prev) / prev
}

// Count by any field, biggest first — providers, cycles, plans all ask this.
export function countBy(rows, pick, limit = 6) {
  const m = new Map()
  for (const r of rows || []) {
    const k = (pick(r) ?? '').toString().trim() || '—'
    const g = m.get(k) || { name: k, count: 0, paid: 0, spend: 0 }
    g.count++
    g.paid += Number(r.billing_amount) || 0
    g.spend += monthlyCost(r)
    m.set(k, g)
  }
  return [...m.values()].sort((a, b) => b.count - a.count || b.spend - a.spend).slice(0, limit)
}
