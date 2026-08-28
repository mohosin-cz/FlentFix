import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import InvoiceDoc from './InvoiceDoc'
import SignaturePad from './SignaturePad'
import { inr, monthLabel, dateLabel } from '../../utils/vendorInvoice'

// The vendor's own payroll, inside the portal they already sign into daily.
//
// This replaces sending each of them a private link: there is nothing to
// forward, nothing to intercept, and no way to open somebody else's invoice —
// the session decides whose months these are, not possession of a token.
//
// Newest month first, because the one that needs signing is always the newest.
// Older months stay for reference with a receipt once the money has gone.

const MONO = 'var(--font-mono, monospace)'

function Row({ label, value, strong, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, fontFamily: MONO }}>
      <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{label}</span>
      <span style={{ color: tone || (strong ? 'var(--text, #e8e8f0)' : 'var(--text-dim, #9394a8)'), fontWeight: strong ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function Badge({ children, tone }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.05em',
      color: tone, border: `1px solid ${tone}`, borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}>{children}</span>
  )
}

// ── receipt: proof the money actually went out ───────────────────────────────
// Only for a closed month with a reference recorded. A "receipt" for something
// still being reviewed would be a promise dressed up as a record.
function Receipt({ m, name, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(8,9,13,0.9)', overflowY: 'auto', padding: '16px 12px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <style>{`@media print { body > *:not(.rcpt-root) { display:none !important } .rcpt-root { position:static !important; background:#fff !important } .rcpt-bar { display:none !important } }`}</style>
      <div className="rcpt-root" style={{ maxWidth: 460, margin: '0 auto' }}>
        <div className="rcpt-bar" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 10 }}>
          <button type="button" onClick={() => window.print()} style={{ minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontFamily: MONO, cursor: 'pointer' }}>⤓ Save</button>
          <button type="button" onClick={onClose} style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 15, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ background: '#fff', color: '#1a1c23', borderRadius: 10, padding: 24, fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.14em' }}>PAYMENT RECEIPT</div>
          <div style={{ fontSize: 11.5, color: '#6b7280', fontFamily: MONO, marginTop: 3 }}>{monthLabel(m.period_month)}</div>
          <div style={{ height: 2, background: '#1a1c23', margin: '14px 0 16px' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 12.5, fontFamily: MONO }}>
            {[['Paid to', name], ['For', monthLabel(m.period_month)],
              ['Days worked', m.days_worked == null ? '—' : String(m.days_worked)],
              ...(Number(m.ot_days) ? [['Overtime days', String(m.ot_days)]] : []),
              ...(Number(m.advance_recovered) ? [['Less: advance', '− ' + inr(m.advance_recovered)]] : []),
              ...(m.utr ? [['Reference', m.utr]] : []),
              ...(m.invoice?.invoice_no ? [['Against invoice', m.invoice.invoice_no]] : [])].map(([k, val]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                <span style={{ color: '#6b7280' }}>{k}</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14, borderTop: '1.5px solid #1a1c23', marginTop: 14, paddingTop: 11 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Amount paid</span>
            <span style={{ fontSize: 19, fontWeight: 800, fontFamily: MONO }}>{inr(m.total_payout)}</span>
          </div>
          <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 14, lineHeight: 1.6 }}>
            Computer-generated receipt from Flent. Keep it for your records.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PortalPayroll({ token, vendorName }) {
  const [months, setMonths] = useState(null)
  const [err, setErr] = useState('')
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(null)      // period_month being viewed
  const [signing, setSigning] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('attend_payroll', { p_token: token })
    if (error) {
      // Until the migration lands this function does not exist. A vendor should
      // never be shown a schema-cache message — from their side it is simply
      // not switched on yet.
      const notBuilt = /schema cache|could not find the function/i.test(error.message || '')
      setErr(notBuilt ? '' : error.message)
      setMonths(notBuilt ? [] : [])
      setPending(notBuilt)
      return
    }
    setErr(''); setPending(false)
    setMonths(data || [])
  }, [token])

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  if (err) return (
    <div style={{ padding: '11px 13px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 10, fontSize: 12.5, color: '#e8697a', fontFamily: MONO, lineHeight: 1.55 }}>⚠ {err}</div>
  )
  if (months === null) return (
    <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>
  )
  if (!months.length) return (
    <div style={{ padding: '44px 24px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>₹</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{pending ? 'Payroll — coming soon' : 'Nothing here yet'}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 6, lineHeight: 1.55, maxWidth: 300, margin: '6px auto 0' }}>
        {pending
          ? 'Your invoices, payments and receipts will appear here once payroll goes live.'
          : 'Your months will appear here once payroll has been run for you.'}
      </div>
    </div>
  )

  const toSign = months.filter(m => m.invoice?.signable)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {toSign.length > 0 && (
        <div style={{ padding: '12px 14px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 12, fontSize: 12.5, color: 'var(--accent, #c8963e)', lineHeight: 1.55 }}>
          {toSign.length === 1
            ? <>Your <b>{monthLabel(toSign[0].period_month)}</b> invoice is waiting for your signature.</>
            : <>{toSign.length} invoices are waiting for your signature.</>}
        </div>
      )}

      {months.map(m => {
        const inv = m.invoice
        const isOpen = open === m.period_month
        const signed = inv?.status === 'signed'
        return (
          <div key={m.period_month} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
            <button type="button" onClick={() => setOpen(isOpen ? null : m.period_month)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 58, padding: '10px 13px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{monthLabel(m.period_month)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
                  {inr(m.total_payout)}{m.days_worked != null && <> · {m.days_worked} days</>}{Number(m.ot_days) > 0 && <> · {m.ot_days} OT</>}
                </div>
              </div>
              {inv?.signable ? <Badge tone="var(--accent, #c8963e)">Sign</Badge>
                : signed ? <Badge tone="var(--green, #3dba7a)">Signed</Badge>
                : m.paid ? <Badge tone="var(--text-muted, #6b6d82)">Paid</Badge> : null}
              <span aria-hidden="true" style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
            </button>

            {isOpen && (
              <div style={{ padding: '0 13px 13px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ height: 1, background: 'var(--border, #2e3040)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Row label="Earned" value={inr(Number(m.fixed_pay || 0) * (m.days_worked == null ? 30 : Number(m.days_worked)) / 30)} />
                  {Number(m.allowance) > 0 && <Row label="Allowance" value={inr(m.allowance)} />}
                  {Number(m.ot_amount) > 0 && <Row label={`Overtime · ${m.ot_days} days`} value={inr(m.ot_amount)} />}
                  {Number(m.advance_recovered) > 0 && <Row label="Less: advance" value={'− ' + inr(m.advance_recovered)} tone="var(--red, #e05c6a)" />}
                  <Row label="Total" value={inr(m.total_payout)} strong tone="var(--accent, #c8963e)" />
                  {signed && <Row label="Signed" value={dateLabel(inv.signed_at)} />}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {inv?.signable && (
                    <button type="button" onClick={() => setSigning(m)}
                      style={{ flex: '1 1 160px', minHeight: 46, borderRadius: 10, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 14, fontWeight: 700, fontFamily: MONO, cursor: 'pointer' }}>
                      Review &amp; sign →
                    </button>
                  )}
                  {inv?.snapshot && !inv.signable && (
                    <button type="button" onClick={() => setSigning(m)}
                      style={{ flex: '1 1 140px', minHeight: 46, borderRadius: 10, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, fontFamily: MONO, cursor: 'pointer' }}>
                      View invoice
                    </button>
                  )}
                  {m.paid && (
                    <button type="button" onClick={() => setReceipt(m)}
                      style={{ flex: '1 1 140px', minHeight: 46, borderRadius: 10, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, fontFamily: MONO, cursor: 'pointer' }}>
                      ⤓ Receipt
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {signing && (
        <SignSheet month={signing} token={token} vendorName={vendorName}
          onClose={() => setSigning(null)} onSigned={() => { setSigning(null); load() }} />
      )}
      {receipt && <Receipt m={receipt} name={vendorName} onClose={() => setReceipt(null)} />}
    </div>
  )
}

// ── review & sign, full screen ───────────────────────────────────────────────
function SignSheet({ month, token, vendorName, onClose, onSigned }) {
  const inv = month.invoice
  const [name, setName] = useState(inv?.signed_name || inv?.snapshot?.from?.name || vendorName || '')
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [padHost, setPadHost] = useState(null)
  const signed = inv?.status === 'signed'

  async function submit() {
    setErr('')
    const png = padHost?.querySelector('canvas')?._readSignature?.()
    if (!name.trim()) { setErr('Please enter your name.'); return }
    if (!png) { setErr('Please draw your signature in the box.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('attend_invoice_sign', {
      p_token: token, p_invoice_id: inv.id, p_name: name.trim(),
      p_signature: png, p_ua: navigator.userAgent.slice(0, 400),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSigned()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'var(--bg, #16171f)', overflowY: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>
          {signed ? 'Your signed invoice' : 'Review & sign'}
          <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{monthLabel(month.period_month)}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close"
          style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 15, cursor: 'pointer' }}>✕</button>
      </div>

      <div style={{ padding: '14px 12px calc(30px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760, margin: '0 auto' }}>
        <InvoiceDoc data={inv.snapshot} signature={inv.signature_png} signedName={inv.signed_name} signedAt={inv.signed_at} />

        {!signed && (
          <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Sign to confirm</span>
              <span style={{ marginInlineStart: 'auto', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                <b style={{ color: 'var(--accent, #c8963e)' }}>{inr(inv.net_payable)}</b>
              </span>
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)' }}>Your full name</span>
              <input value={name} onChange={e => setName(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '12px 13px', fontSize: 16, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, color: 'var(--text, #e8e8f0)', outline: 'none', fontFamily: 'inherit' }} />
            </label>
            <div ref={setPadHost}><SignaturePad onChange={setHasInk} disabled={busy} /></div>
            {err && <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word' }}>⚠ {err}</div>}
            <button type="button" onClick={submit} disabled={busy || !name.trim() || !hasInk}
              style={{ minHeight: 50, borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, fontFamily: MONO, cursor: busy ? 'wait' : 'pointer',
                background: (!name.trim() || !hasInk) ? 'var(--bg-input, #252731)' : 'var(--accent, #c8963e)',
                color: (!name.trim() || !hasInk) ? 'var(--text-muted, #6b6d82)' : '#1a1408' }}>
              {busy ? 'Submitting…' : 'Sign & submit'}
            </button>
            {(!name.trim() || !hasInk) && (
              <div style={{ fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, textAlign: 'center', lineHeight: 1.5 }}>
                {!name.trim() && !hasInk ? 'Enter your name and draw your signature'
                  : !name.trim() ? 'Enter your name above' : 'Draw your signature in the box'}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', textAlign: 'center', lineHeight: 1.5 }}>
              If the amount looks wrong, don&rsquo;t sign — tell the office first.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
