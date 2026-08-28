// Vendor monthly invoice — shared vocabulary and arithmetic.
//
// The invoice is raised BY the vendor ON Slaash Technologies for the trade work
// they did at one or more PIDs. Both the staff preview and the vendor's own
// signing page render from this, so the two can never disagree about what an
// invoice says.

export const INVOICE_STATUS = {
  none:   { label: 'Not raised', color: 'var(--text-muted, #6b6d82)', hint: 'No invoice yet' },
  draft:  { label: 'Draft',      color: 'var(--text-dim, #9394a8)',   hint: 'Raised, not sent' },
  sent:   { label: 'Sent',       color: 'var(--accent, #c8963e)',     hint: 'Emailed, not opened' },
  viewed: { label: 'Opened',     color: 'var(--accent, #c8963e)',     hint: 'Opened but not signed' },
  signed: { label: 'Signed',     color: 'var(--green, #3dba7a)',      hint: 'Signed by the vendor' },
  void:   { label: 'Void',       color: 'var(--red, #e05c6a)',        hint: 'Cancelled' },
}
// Order the stage list reads in, worst-first: what still needs chasing is what
// you want at the top of the pile.
export const STATUS_ORDER = ['none', 'draft', 'sent', 'viewed', 'signed', 'void']

export const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

export const monthLabel = (d) => {
  if (!d) return ''
  const x = new Date(d)
  return isNaN(x) ? String(d) : x.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
export const dateLabel = (d) => {
  if (!d) return '—'
  const x = new Date(d)
  return isNaN(x) ? String(d) : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Gross is the payout plus whatever advance was taken back out of it. Derived
// this way rather than recomputed from rate × days because nine legacy lines
// don't satisfy that formula, and an invoice whose net disagrees with the money
// actually transferred is worse than no invoice.
export const grossOf = (payout) =>
  Number(payout?.total_payout || 0) + Number(payout?.advance_recovered || 0)

export const sumLines = (lines) =>
  (lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0)

// What still stops this invoice being sent. Empty array means it's ready.
export function sendBlockers(invoice, lines) {
  const out = []
  const total = sumLines(lines)
  if (!lines || lines.length === 0) out.push('No line items')
  if (Math.round(total) !== Math.round(Number(invoice?.subtotal || 0))) {
    out.push(`Split adds to ${inr(total)}, invoice is ${inr(invoice?.subtotal)}`)
  }
  if ((lines || []).some(l => !String(l.pid || '').trim())) out.push('A line has no PID')
  return out
}

// ── amount in words, Indian system ──────────────────────────────────────────
// Present on every invoice that means anything, and the one field nobody can
// fudge later: figures can be misread, words can't.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function under1000(n) {
  const out = []
  if (n >= 100) { out.push(ONES[Math.floor(n / 100)], 'Hundred'); n %= 100 }
  if (n >= 20) { out.push(TENS[Math.floor(n / 10)]); n %= 10 }
  if (n > 0) out.push(ONES[n])
  return out.filter(Boolean).join(' ')
}

export function amountInWords(amount) {
  let n = Math.floor(Math.abs(Number(amount) || 0))
  const paise = Math.round((Math.abs(Number(amount) || 0) - n) * 100)
  if (n === 0 && !paise) return 'Zero rupees only'

  const parts = []
  const crore = Math.floor(n / 1e7); n %= 1e7
  const lakh  = Math.floor(n / 1e5); n %= 1e5
  const thou  = Math.floor(n / 1e3); n %= 1e3
  if (crore) parts.push(under1000(crore), 'Crore')
  if (lakh)  parts.push(under1000(lakh), 'Lakh')
  if (thou)  parts.push(under1000(thou), 'Thousand')
  if (n)     parts.push(under1000(n))

  const whole = Math.floor(Math.abs(Number(amount) || 0))
  let s = parts.filter(Boolean).join(' ') + (whole === 1 ? ' rupee' : ' rupees')
  if (paise) s += ' and ' + under1000(paise) + (paise === 1 ? ' paisa' : ' paise')
  return s + ' only'
}

// ── delivering the link by hand ──────────────────────────────────────────────
// There is no mail server to hand a signing link to, so it goes out through
// whatever the staff member already has open. These live here rather than in
// the share component because a component file that also exports helpers stops
// fast refresh working for the whole module.

// wa.me wants digits only, country code included. Indian mobiles are stored as
// ten digits, so 91 is prefixed unless something longer is already there.
export function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 10) return '91' + d
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1)
  return d
}

export function invoiceMessage({ name, invoiceNo, periodMonth, net, link }) {
  return `Hello ${name || ''},\n\n` +
    `Your invoice ${invoiceNo} for ${monthLabel(periodMonth)} is ready.\n` +
    `Net payable: ${inr(net)}\n\n` +
    `Please review and sign here:\n${link}\n\n` +
    `If the amount looks wrong, don't sign — reply to this message instead.`
}
