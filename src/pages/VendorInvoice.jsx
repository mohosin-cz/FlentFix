import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import InvoiceDoc from '../components/vendor/InvoiceDoc'
import SignaturePad from '../components/vendor/SignaturePad'
import { inr } from '../utils/vendorInvoice'

// The vendor's own invoice, opened from an emailed link and signed here.
//
// Public URL, anonymous visitor. Everything comes from rpc('invoice_fetch') —
// the tables are not readable by anon by design, and the token is the whole
// security boundary, so it is scoped to exactly one payout line. A bad token
// and a not-yet-sent invoice produce the same message: this never confirms
// that a token once existed.
//
// No other vendor's data, no other month, and the bank account is last-4 only,
// because a link sent to one person ends up forwarded to another.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', fontFamily: SANS,
      padding: '20px 14px calc(30px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {children}
    </div>
  )
}

function Notice({ title, body }) {
  return (
    <Shell>
      <div style={{ maxWidth: 420, width: '100%', marginTop: '18vh', textAlign: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-muted, #6b6d82)', marginTop: 8, lineHeight: 1.6 }}>{body}</div>
      </div>
    </Shell>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function VendorInvoice() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, err: '', data: null })
  const [name, setName] = useState('')
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [signErr, setSignErr] = useState('')
  const padHost = useRef(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('invoice_fetch', { p_token: token }).then(({ data, error }) => {
      if (!alive) return
      if (error) { setState({ loading: false, err: error.message, data: null }); return }
      setState({ loading: false, err: '', data })
      // Prefilled from the invoice. It was an empty field behind a placeholder
      // showing the vendor's own name, which reads as already filled — so the
      // Sign button sat greyed out with nothing saying why. Still editable:
      // whoever signs should be able to put their actual name to it.
      setName(data?.signed_name || data?.invoice?.from?.name || '')
    })
    return () => { alive = false }
  }, [token])

  async function sign() {
    setSignErr('')
    const canvas = padHost.current?.querySelector('canvas')
    const png = canvas?._readSignature?.()
    if (!name.trim()) { setSignErr('Please enter your name.'); return }
    if (!png) { setSignErr('Please draw your signature in the box.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('invoice_sign', {
      p_token: token, p_name: name.trim(), p_signature: png, p_ua: navigator.userAgent.slice(0, 400),
    })
    if (error) { setSignErr(error.message); setBusy(false); return }
    // Re-read rather than patching locally: the signed copy shown from here on
    // is the one the server actually stored.
    const { data } = await supabase.rpc('invoice_fetch', { p_token: token })
    setState(s => ({ ...s, data }))
    setBusy(false)
  }

  if (state.loading) {
    return <Notice title="Loading…" body="Fetching your invoice." />
  }
  if (state.err || !state.data?.invoice) {
    return <Notice title="This invoice link isn't valid"
      body="It may have been cancelled or replaced. Please check with the Flent office for a new link." />
  }

  const d = state.data
  const inv = d.invoice
  const signed = d.status === 'signed'

  return (
    <Shell>
      <div style={{ width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>
            {signed ? 'Signed — thank you' : 'Please review and sign'}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', marginTop: 4, lineHeight: 1.55 }}>
            {signed
              ? 'We have your signed copy. Nothing else to do.'
              : <>Check the amount below. If anything is wrong, <b>don&rsquo;t sign</b> — reply to the email instead.</>}
          </div>
        </div>

        <InvoiceDoc data={inv} signature={d.signature_png} signedName={d.signed_name} signedAt={d.signed_at} />

        {!signed && (
          <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Sign to confirm</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginInlineStart: 'auto' }}>
                Net payable <b style={{ color: 'var(--accent, #c8963e)' }}>{inr(inv.net_payable)}</b>
              </span>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)' }}>Your full name</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={inv.from?.name || 'Full name'}
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 13px', fontSize: 16, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, color: 'var(--text, #e8e8f0)', outline: 'none', fontFamily: 'inherit' }} />
            </label>

            <div ref={padHost}><SignaturePad onChange={setHasInk} disabled={busy} /></div>

            {signErr && (
              <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word' }}>⚠ {signErr}</div>
            )}

            <button type="button" onClick={sign} disabled={busy || !name.trim() || !hasInk}
              style={{ minHeight: 50, borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, fontFamily: MONO, cursor: busy ? 'wait' : 'pointer',
                background: (!name.trim() || !hasInk) ? 'var(--bg-input, #252731)' : 'var(--accent, #c8963e)',
                color: (!name.trim() || !hasInk) ? 'var(--text-muted, #6b6d82)' : '#1a1408' }}>
              {busy ? 'Submitting…' : 'Sign & submit'}
            </button>
            {(!name.trim() || !hasInk) && (
              <div style={{ fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, textAlign: 'center', lineHeight: 1.5 }}>
                {!name.trim() && !hasInk ? 'Enter your name and draw your signature'
                  : !name.trim() ? 'Enter your name above'
                  : 'Draw your signature in the box'}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', textAlign: 'center', lineHeight: 1.5 }}>
              This link is personal to you. Please don&rsquo;t forward it.
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
