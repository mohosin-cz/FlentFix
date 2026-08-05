// Shared config + "next recharge due" logic for property utilities.
// DTH/Cable intentionally removed.
export const UTILITY_TYPES = [
  { key: 'wifi',           label: 'WiFi / Broadband',    color: '#5b8def' },
  { key: 'water_purifier', label: 'Water Purifier (RO)', color: '#38bdf8' },
  { key: 'other',          label: 'Other',               color: '#8b8d98' },
]
export const TYPE_MAP = Object.fromEntries(UTILITY_TYPES.map(t => [t.key, t]))
export const ADD_TYPES = UTILITY_TYPES

export const BILLING_CYCLES = ['Monthly', 'Bi-monthly', 'Quarterly', 'Half-yearly', 'Yearly', 'One-time']
export const CYCLE_MONTHS = { Monthly: 1, 'Bi-monthly': 2, Quarterly: 3, 'Half-yearly': 6, Yearly: 12 }

export const STATUSES = [
  { key: 'active',     label: 'Active',     color: 'var(--green, #3dba7a)' },
  { key: 'paused',     label: 'Paused',     color: 'var(--accent, #c8963e)' },
  { key: 'cancelled',  label: 'Cancelled',  color: 'var(--text-muted, #6b6d82)' },
  { key: 'unknown',    label: 'Unknown',    color: 'var(--accent, #c8963e)' },
  { key: 'superseded', label: 'Superseded', color: 'var(--text-muted, #6b6d82)' },
]
export const STATUS_MAP = Object.fromEntries(STATUSES.map(st => [st.key, st]))
// statuses that count as "live" — they get a recharge countdown + show in the overview
export const LIVE_STATUSES = new Set(['active', 'unknown'])

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

// A utility is valid for one billing cycle from its base date (last recharge, or
// start date if never recharged). Next recharge = base + one cycle, rolled
// forward to the current cycle if several have elapsed. null when not schedulable.
export function nextDueDate(baseStr, cycle) {
  const m = CYCLE_MONTHS[cycle]
  if (!baseStr || !m) return null
  const base = new Date(baseStr + 'T00:00:00')
  if (isNaN(base)) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(base); d.setMonth(d.getMonth() + m)
  let guard = 0
  while (d < today && guard < 2400) { d.setMonth(d.getMonth() + m); guard++ }
  return d
}

// A calendar month's utility spend, split the way the team reads it:
//   installs   — utilities that went live that month (first payment)
//   recharges  — utilities already running whose renewal fell that month
// A utility pays its full billing_amount on its base date and again every cycle
// after, so a renewal lands in a month when the gap from the base is a whole
// number of cycles. `monthlyAdded` is the run-rate the new installs added,
// which is what the By-month tab reports.
export function spendInMonth(rows, year, monthIdx) {
  const installs = { count: 0, paid: 0, monthlyAdded: 0 }
  const recharges = { count: 0, paid: 0 }
  const byType = {}
  let undated = 0

  for (const u of rows || []) {
    if (!u || !LIVE_STATUSES.has(u.status)) continue
    const cyc = CYCLE_MONTHS[u.billing_cycle]
    const baseStr = u.last_recharged_on || u.start_date
    if (!cyc || !baseStr || u.billing_amount == null) { undated++; continue }
    const base = new Date(baseStr + 'T00:00:00')
    if (isNaN(base)) { undated++; continue }

    const amt = Number(u.billing_amount)
    const isInstall = !!u.start_date &&
      new Date(u.start_date + 'T00:00:00').getFullYear() === year &&
      new Date(u.start_date + 'T00:00:00').getMonth() === monthIdx
    const diff = (year - base.getFullYear()) * 12 + (monthIdx - base.getMonth())
    const renewed = diff > 0 && diff % cyc === 0

    if (isInstall) {
      installs.count++; installs.paid += amt; installs.monthlyAdded += amt / cyc
    } else if (renewed) {
      recharges.count++; recharges.paid += amt
    } else continue

    const k = u.utility_type
    ;(byType[k] = byType[k] || { key: k, count: 0, spend: 0 })
    byType[k].count++; byType[k].spend += amt
  }
  return { installs, recharges, undated, byType, total: installs.paid + recharges.paid }
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
export function deploymentsByMonth(rows) {
  const map = {}
  for (const r of rows) {
    if (!r.start_date) continue
    const ym = r.start_date.slice(0, 7)
    const g = map[ym] || (map[ym] = { ym, deploys: 0, props: new Set(), wifi: 0, water: 0, other: 0, spend: 0 })
    g.deploys++
    g.props.add(r.pid)
    if (r.utility_type === 'wifi') g.wifi++
    else if (r.utility_type === 'water_purifier') g.water++
    else g.other++
    g.spend += monthlyCost(r)
  }
  return Object.values(map).map(g => ({ ...g, properties: g.props.size })).sort((a, b) => b.ym.localeCompare(a.ym))
}

// bucket a utility by recharge urgency: 'due' (<=7d) | 'month' (<=31d) | 'later' | 'none'
export function dueBucket(u) {
  const di = dueInfo(u)
  if (!di) return 'none'
  if (di.days <= 7) return 'due'
  if (di.days <= 31) return 'month'
  return 'later'
}

// human-facing due status; returns null when there's nothing to schedule
export function dueInfo(u) {
  if (!u || !LIVE_STATUSES.has(u.status)) return null
  const d = nextDueDate(u.last_recharged_on || u.start_date, u.billing_cycle)
  if (!d) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  let color, label, tone
  if (days <= 0) { color = 'var(--red, #e05c6a)'; label = 'Recharge due today'; tone = 'due' }
  else if (days === 1) { color = 'var(--red, #e05c6a)'; label = 'Recharge tomorrow'; tone = 'due' }
  else if (days <= 5) { color = 'var(--accent, #c8963e)'; label = `Recharge in ${days} days`; tone = 'soon' }
  else { color = 'var(--green, #3dba7a)'; label = `Recharge in ${days} days`; tone = 'ok' }
  return { date: d, days, label, color, tone }
}
