import { useState } from 'react'
import { waNumber, invoiceMessage } from '../../utils/vendorInvoice'

// Getting a signing link to a vendor without a mail server.
//
// There is no Edge Function to deploy, no secret to set and no domain to
// verify, so nothing on the server can send anything. What is left is the two
// channels the staff member already has open in front of them: WhatsApp, and
// their own mail client. Both send from a real human account that the vendor
// recognises, which for sixteen Gmail recipients is better deliverability than
// an unauthenticated domain would have managed anyway.
//
// The link is the payload in both cases. Nothing here is a substitute for the
// invoice itself — it lives behind the token, on the page the vendor opens.

const MONO = 'var(--font-mono, monospace)'

const btn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  minHeight: 44, padding: '0 14px', borderRadius: 9, fontSize: 13, fontWeight: 700,
  fontFamily: MONO, cursor: 'pointer', border: '1px solid var(--border, #2e3040)',
  background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', textDecoration: 'none',
  flex: '1 1 130px',
}

export default function ShareLinks({ row, compact }) {
  const [copied, setCopied] = useState(false)
  const { link, name, phone, email, invoiceNo, periodMonth, net } = row
  const body = invoiceMessage({ name, invoiceNo, periodMonth, net, link })
  const wa = waNumber(phone)

  function copy() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {wa && (
        <a href={`https://wa.me/${wa}?text=${encodeURIComponent(body)}`} target="_blank" rel="noreferrer"
          style={{ ...btn, background: 'rgba(37,211,102,0.12)', borderColor: 'rgba(37,211,102,0.45)', color: '#25d366' }}>
          WhatsApp
        </a>
      )}
      {email && (
        <a href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Invoice ${invoiceNo} — please sign`)}&body=${encodeURIComponent(body)}`}
          style={btn}>Email</a>
      )}
      <button type="button" onClick={copy} style={{ ...btn, color: copied ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)' }}>
        {copied ? '✓ Copied' : 'Copy link'}
      </button>
      {!compact && (
        <div style={{ width: '100%', fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 }}>
          Sends from your own WhatsApp / mail client — the vendor sees it from you.
        </div>
      )}
    </div>
  )
}
