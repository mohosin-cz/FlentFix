import { inr, amountInWords, monthLabel, dateLabel } from '../../utils/vendorInvoice'

// The invoice itself, rendered from a snapshot.
//
// Deliberately white paper inside a dark app. This is a document, not a screen:
// it gets printed, saved to PDF and filed, and it has to look the same in all
// three. It is also the single renderer for both the staff preview and the
// vendor's signing page — two implementations would eventually disagree about
// what somebody signed.
//
// `data` is the frozen snapshot from vendor_invoices.snapshot, so this shows
// what was true when the invoice was sent, not what the vendor record says now.

const PAPER = '#ffffff'
const INK = '#1a1c23'
const MUTED = '#6b7280'
const RULE = '#e5e7eb'
const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

function Party({ title, children }) {
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', color: MUTED, fontFamily: MONO, textTransform: 'uppercase', marginBottom: 7 }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.65, color: INK }}>{children}</div>
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, fontSize: 11.5, lineHeight: 1.9 }}>
      <span style={{ color: MUTED, fontFamily: MONO }}>{label}</span>
      <span style={{ color: INK, fontWeight: 600, fontFamily: MONO, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function Total({ label, value, strong, negative }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, padding: strong ? '10px 0 0' : '3px 0',
      borderTop: strong ? `1.5px solid ${INK}` : 'none', marginTop: strong ? 7 : 0 }}>
      <span style={{ fontSize: strong ? 12.5 : 11.5, fontWeight: strong ? 700 : 500, color: strong ? INK : MUTED, fontFamily: strong ? SANS : MONO }}>{label}</span>
      <span style={{ fontSize: strong ? 16 : 12, fontWeight: strong ? 800 : 600, fontFamily: MONO,
        color: negative ? '#b91c1c' : INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {negative ? '− ' : ''}{inr(value)}
      </span>
    </div>
  )
}

export default function InvoiceDoc({ data, signature, signedName, signedAt, compact }) {
  if (!data) return null
  const from = data.from || {}
  const to = data.bill_to || {}
  const lines = data.lines || []
  const pad = compact ? 20 : 34

  return (
    <div style={{ background: PAPER, color: INK, fontFamily: SANS, borderRadius: 10, padding: pad,
      boxShadow: '0 10px 40px rgba(0,0,0,0.28)', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

      {/* masthead */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', paddingBottom: 18, borderBottom: `2px solid ${INK}` }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: '0.16em', color: INK }}>INVOICE</div>
          <div style={{ fontSize: 11.5, color: MUTED, fontFamily: MONO, marginTop: 3 }}>
            For services rendered · {monthLabel(data.period_month)}
          </div>
        </div>
        <div style={{ minWidth: 208 }}>
          <Meta label="Invoice no." value={data.invoice_no || '—'} />
          <Meta label="Invoice date" value={dateLabel(data.invoice_date)} />
          <Meta label="Period" value={monthLabel(data.period_month)} />
        </div>
      </div>

      {/* parties */}
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', padding: '20px 0', borderBottom: `1px solid ${RULE}` }}>
        <Party title="From">
          <div style={{ fontWeight: 700, fontSize: 14 }}>{from.name || '—'}</div>
          {from.trade && <div style={{ color: MUTED }}>{from.trade}{from.code ? ` · ${from.code}` : ''}</div>}
          {from.address && <div>{from.address}</div>}
          {(from.city || from.pincode) && <div>{[from.city, from.pincode].filter(Boolean).join(' ')}</div>}
          {from.phone && <div style={{ fontFamily: MONO, fontSize: 11.5, marginTop: 3 }}>{from.phone}</div>}
        </Party>
        <Party title="Bill to">
          <div style={{ fontWeight: 700, fontSize: 14 }}>{to.legal_name || 'Slaash Technologies Pvt Ltd'}</div>
          {to.address_line && <div>{to.address_line}</div>}
          {(to.city || to.state || to.pincode) && <div>{[to.city, to.state, to.pincode].filter(Boolean).join(', ')}</div>}
          {to.gstin && <div style={{ fontFamily: MONO, fontSize: 11.5, marginTop: 3 }}>GSTIN {to.gstin}</div>}
          {to.cin && <div style={{ fontFamily: MONO, fontSize: 11.5 }}>CIN {to.cin}</div>}
          {to.pan && <div style={{ fontFamily: MONO, fontSize: 11.5 }}>PAN {to.pan}</div>}
        </Party>
      </div>

      {/* lines */}
      <table style={{ width: '100%', borderCollapse: 'collapse', margin: '18px 0 0' }}>
        <thead>
          <tr>
            {['#', 'Description', 'PID', 'Amount'].map((h, i) => (
              <th key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: MUTED, fontFamily: MONO,
                textTransform: 'uppercase', textAlign: i >= 2 ? 'right' : 'left', padding: '0 0 9px',
                borderBottom: `1px solid ${RULE}`, width: i === 0 ? 26 : i === 2 ? 70 : i === 3 ? 108 : 'auto' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={{ padding: '11px 0', borderBottom: `1px solid ${RULE}`, fontSize: 11.5, color: MUTED, fontFamily: MONO, verticalAlign: 'top' }}>{i + 1}</td>
              <td style={{ padding: '11px 10px 11px 0', borderBottom: `1px solid ${RULE}`, fontSize: 12.5, color: INK, verticalAlign: 'top' }}>{l.description || '—'}</td>
              <td style={{ padding: '11px 0', borderBottom: `1px solid ${RULE}`, fontSize: 12, color: INK, fontFamily: MONO, textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{l.pid || '—'}</td>
              <td style={{ padding: '11px 0', borderBottom: `1px solid ${RULE}`, fontSize: 12.5, color: INK, fontFamily: MONO, textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{inr(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* totals */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <div style={{ width: '100%', maxWidth: 288 }}>
          <Total label="Subtotal" value={data.subtotal} />
          {Number(data.advance_recovered) > 0 && (
            <Total label="Less: advance recovered" value={data.advance_recovered} negative />
          )}
          <Total label="Net payable" value={data.net_payable} strong />
        </div>
      </div>

      <div style={{ marginTop: 16, padding: '11px 13px', background: '#f9fafb', border: `1px solid ${RULE}`, borderRadius: 7 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: MUTED, fontFamily: MONO, textTransform: 'uppercase' }}>Amount in words</span>
        <div style={{ fontSize: 12.5, color: INK, marginTop: 3, lineHeight: 1.55 }}>{amountInWords(data.net_payable)}</div>
      </div>

      {/* payment details — last 4 only, because this renders on a link that
          will get forwarded at some point no matter what the email says */}
      {(from.bank_last4 || from.upi) && (
        <div style={{ marginTop: 14, fontSize: 11.5, color: MUTED, fontFamily: MONO, lineHeight: 1.7 }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 9 }}>Payable to</span><br />
          {from.bank_last4 && <>Bank a/c ····{from.bank_last4}{from.upi ? ' · ' : ''}</>}
          {from.upi && <>UPI {from.upi}</>}
        </div>
      )}

      {/* signature */}
      <div style={{ marginTop: 26, paddingTop: 16, borderTop: `1px solid ${RULE}`, display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.6, maxWidth: 330 }}>
          I confirm the work described above was carried out by me and that the
          net payable shown is correct and fully settles my dues for this period.
        </div>
        <div style={{ textAlign: 'right', minWidth: 190 }}>
          {signature
            ? <img src={signature} alt="Signature" style={{ height: 56, maxWidth: 210, objectFit: 'contain', display: 'block', marginLeft: 'auto' }} />
            : <div style={{ height: 56 }} />}
          <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 5, marginTop: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>{signedName || from.name || ''}</div>
            <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>
              {signedAt ? `Signed ${dateLabel(signedAt)}` : 'Signature'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
