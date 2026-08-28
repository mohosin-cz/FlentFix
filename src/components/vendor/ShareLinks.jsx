import { useState } from 'react'
import { waNumber, invoiceMessage } from '../../utils/vendorInvoice'

// Getting a signing link to a vendor without a mail server.
//
// There is no Edge Function to deploy, no secret to set and no domain to
// verify, so nothing on the server can send anything. What is left is the two
// channels the staff member already has open: WhatsApp, and their own mail
// client. Both send from an account the vendor recognises, which for sixteen
// Gmail recipients lands better than an unauthenticated domain would have.
//
// Every action names where it is going. Sixteen rows of identical
// WhatsApp/Email/Copy buttons is precisely the shape of mistake where one
// vendor gets another's link — and each link is a private view of somebody's
// pay. Putting the number and the address on the buttons makes sending the
// wrong one something you have to read past rather than something you can do
// by miscounting rows.

const MONO = 'var(--font-mono, monospace)'

const prettyPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '').slice(-10)
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : (p || '')
}
const shortEmail = (e) => (e && e.length > 24 ? e.slice(0, 21) + '…' : e || '')

const pill = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  minHeight: 40, padding: '0 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
  fontFamily: MONO, cursor: 'pointer', textDecoration: 'none',
  border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)',
  color: 'var(--text-dim, #9394a8)', maxWidth: '100%',
}
const dest = { fontWeight: 400, color: 'var(--text-muted, #6b6d82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

export default function ShareLinks({ row, sharedEmail }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
        {wa ? (
          <a href={`https://wa.me/${wa}?text=${encodeURIComponent(body)}`} target="_blank" rel="noreferrer"
            title={`WhatsApp ${name} on ${prettyPhone(phone)}`}
            style={{ ...pill, background: 'rgba(37,211,102,0.10)', borderColor: 'rgba(37,211,102,0.42)', color: '#25d366' }}>
            WhatsApp <span style={dest}>{prettyPhone(phone)}</span>
          </a>
        ) : (
          <span style={{ ...pill, cursor: 'default', opacity: 0.6 }}>No phone on file</span>
        )}

        {email ? (
          <a href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Invoice ${invoiceNo} — please sign`)}&body=${encodeURIComponent(body)}`}
            title={`Email ${name} at ${email}`}
            style={{ ...pill, ...(sharedEmail ? { borderColor: 'var(--accent, #c8963e)', color: 'var(--accent, #c8963e)' } : null) }}>
            Email <span style={{ ...dest, ...(sharedEmail ? { color: 'inherit' } : null) }}>{shortEmail(email)}</span>
          </a>
        ) : (
          <span style={{ ...pill, cursor: 'default', opacity: 0.6 }}>No email on file</span>
        )}

        <button type="button" onClick={copy}
          style={{ ...pill, color: copied ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)' }}>
          {copied ? '✓ Copied' : 'Copy link'}
        </button>
      </div>

      {sharedEmail && (
        <div style={{ fontSize: 10.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
          ⚠ Another vendor has this same address — use WhatsApp so the right person gets it.
        </div>
      )}
    </div>
  )
}
