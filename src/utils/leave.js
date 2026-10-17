// Vendor leave — shared between the vendor's phone (/attend → Leave) and
// Vendor management → Leave. Dates travel as 'YYYY-MM-DD' strings and are
// built as local dates, so a leave on the 24th never shows as the 23rd.

export const KIND = {
  paid:      { label: 'Paid leave', short: 'Paid',      ink: '#6f9a7e', soft: 'rgba(111,154,126,0.16)', hint: '15 a year from your joining date' },
  sick:      { label: 'Sick',       short: 'Sick',      ink: '#7f93b8', soft: 'rgba(127,147,184,0.16)', hint: 'Paid, does not use your 15' },
  emergency: { label: 'Emergency',  short: 'Emergency', ink: '#a8895a', soft: 'rgba(168,137,90,0.16)',  hint: 'The office decides how it is paid' },
}

export const STATUS = {
  pending:   { label: 'Waiting',      ink: '#a8895a', soft: 'rgba(168,137,90,0.16)' },
  approved:  { label: 'Approved',     ink: '#6f9a7e', soft: 'rgba(111,154,126,0.16)' },
  declined:  { label: 'Not approved', ink: '#b0645b', soft: 'rgba(176,100,91,0.16)' },
  cancelled: { label: 'Cancelled',    ink: '#8a8b9c', soft: 'rgba(138,139,156,0.14)' },
}

// Matte palette, as on Home's Team view.
export const M = { red: '#b0645b', redSoft: 'rgba(176,100,91,0.16)', amber: '#a8895a', amberSoft: 'rgba(168,137,90,0.16)', green: '#6f9a7e', greenSoft: 'rgba(111,154,126,0.16)', blue: '#7f93b8', blueSoft: 'rgba(127,147,184,0.16)' }

// How an approved leave is paid. 'balance' spends the 15, 'free' is paid
// without counting (sick, or an emergency the office covers), 'unpaid' comes
// off payroll.
export const PAY_MODE = {
  balance: 'From the 15',
  free:    'Paid, not counted',
  unpaid:  'Unpaid',
}

export function parseDay(s) {
  if (!s) return null
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function isoDay(dt) {
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
export function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d) }
export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
export function diffDays(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000) }

export function dayLabel(s, opts = {}) {
  const d = parseDay(s)
  if (!d) return '—'
  const o = { weekday: 'short', day: 'numeric', month: 'short' }
  if (opts.year) o.year = 'numeric'
  return d.toLocaleDateString('en-GB', o).replace(',', '')
}
export function rangeLabel(a, b, half) {
  if (!a) return '—'
  if (!b || a === b) return dayLabel(a) + (half ? ` · ${half === 'first' ? 'first half' : 'second half'}` : '')
  return `${dayLabel(a)} – ${dayLabel(b)}`
}
export function fmtDays(n) {
  const v = Number(n || 0)
  const t = Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10)
  return `${t} day${v === 1 ? '' : 's'}`
}
export function num(n) { const v = Number(n || 0); return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10) }

// "5 paid, 4 unpaid" — what an approved leave actually cost.
export function payLine(l) {
  if (!l || l.status !== 'approved') return ''
  const p = Number(l.paid_days || 0), u = Number(l.unpaid_days || 0)
  const parts = []
  if (p > 0) parts.push(`${num(p)} paid${l.counts_balance ? '' : ' (not counted)'}`)
  if (u > 0) parts.push(`${num(u)} unpaid`)
  return parts.join(', ')
}

// Month grid, Monday first: weeks of 'YYYY-MM-DD' or null.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(isoDay(new Date(year, month, d)))
  while (cells.length % 7) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
