import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PillGroup, BtnPrimary } from '../../components/ui'
import {
  POD_OPTIONS, signedDocUrl, fmtDate, fmtDateTime, relTime,
  maskAccount, initials, avatarColor,
} from '../../utils/vendorHub'
import { isEmail } from '../../utils/vendorOnboard'

// ── editable email row (staff can add/fix email — needed for attendance OTP) ─
function EmailRow({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(value || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save() {
    setBusy(true); setErr('')
    const e = await onSave(input)
    setBusy(false)
    if (e) setErr(e); else setEditing(false)
  }
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', minWidth: 96, flexShrink: 0, paddingTop: 1 }}>Email</span>
      <div style={{ flex: 1 }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="name@example.com" type="email" inputMode="email" autoCapitalize="off" autoCorrect="off"
                style={{ flex: 1, minWidth: 0, padding: '7px 10px', fontSize: 14, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit' }} />
              <button type="button" onClick={save} disabled={busy} style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 6, padding: '0 12px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{busy ? '…' : 'save'}</button>
              <button type="button" onClick={() => { setEditing(false); setErr(''); setInput(value || '') }} style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: '0 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>cancel</button>
            </div>
            {err && <span style={{ fontSize: 11, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>{err}</span>}
          </div>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', wordBreak: 'break-word' }}>{value || 'Not provided'}</span>
            <button type="button" onClick={() => { setInput(value || ''); setEditing(true) }} style={{ fontSize: 10, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{value ? 'edit' : 'add'}</button>
          </span>
        )}
      </div>
    </div>
  )
}

// ── loud error strip (real messages only) ───────────────────────────────────
function ErrStrip({ children }) {
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word' }}>
      ⚠ {children}
    </div>
  )
}

// ── titled section card ─────────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div style={{ background: 'var(--bg, #16171f)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: '4px 14px 8px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 0 4px' }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', minWidth: 96, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', flex: 1, wordBreak: 'break-word' }}>{children ?? '—'}</span>
    </div>
  )
}

// ── document thumbnail (signed URL, opens full on tap) ──────────────────────
function DocThumb({ label, doc }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 0', minWidth: 92 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {!doc ? (
        <div style={{ ...box, color: 'var(--text-muted, #6b6d82)', fontSize: 11 }}>loading…</div>
      ) : doc.missing ? (
        <div style={{ ...box, color: 'var(--text-muted, #6b6d82)', fontSize: 11 }}>not provided</div>
      ) : doc.err ? (
        <div style={{ ...box, border: '1px solid rgba(224,92,106,0.4)', color: 'var(--red, #e05c6a)', fontSize: 10, textAlign: 'center', padding: 6, fontFamily: 'var(--font-mono, monospace)' }}>{doc.err}</div>
      ) : (
        <a href={doc.url} target="_blank" rel="noreferrer" style={{ ...box, padding: 0, overflow: 'hidden' }}>
          <img src={doc.url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </a>
      )}
    </div>
  )
}
const box = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', aspectRatio: '1 / 1', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, cursor: 'pointer', textDecoration: 'none' }

// ── static capture-location pin (no external tiles → no leak until clicked) ──
function LocationCard({ lat, lng, accuracy, at }) {
  if (lat == null || lng == null) return <Row label="Location">not captured</Row>
  const maps = `https://www.google.com/maps?q=${lat},${lng}`
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '10px 0 4px', borderTop: '1px solid var(--border, #2e3040)' }}>
      <div style={{
        width: 84, height: 84, flexShrink: 0, borderRadius: 10,
        border: '1px solid var(--border, #2e3040)',
        background: 'repeating-linear-gradient(0deg, var(--bg-input,#252731), var(--bg-input,#252731) 14px, var(--bg-panel,#1e2028) 14px, var(--bg-panel,#1e2028) 15px), repeating-linear-gradient(90deg, var(--bg-input,#252731), var(--bg-input,#252731) 14px, var(--bg-panel,#1e2028) 14px, var(--bg-panel,#1e2028) 15px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="var(--red, #e05c6a)"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>
        <span>{Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</span>
        <span>accuracy ±{accuracy != null ? Math.round(accuracy) : '?'} m</span>
        <span>{fmtDateTime(at)}</span>
        <a href={maps} target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #c8963e)', textDecoration: 'none' }}>View on map ↗</a>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function VendorDetailSheet({ vendor, onClose, onOnboarded, onUpdated }) {
  const [row, setRow] = useState(vendor)
  const [docs, setDocs] = useState({})
  const [revealAcct, setRevealAcct] = useState(false)
  const [busy, setBusy] = useState('')       // 'pod' | 'onboard' | ''
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)     // assigned vendor_code after onboarding

  // Mounted with key={vendor.id} → fresh instance per candidate, no reset effect.

  useEffect(() => {
    let alive = true
    const paths = { live: vendor.live_photo_path, aadhaar: vendor.aadhaar_doc_path, pan: vendor.pan_doc_path, dl: vendor.dl_doc_path }
    ;(async () => {
      const out = {}
      for (const [k, p] of Object.entries(paths)) {
        if (!p) { out[k] = { missing: true }; continue }
        try { out[k] = { url: await signedDocUrl(supabase, p, 300) } }
        catch (e) { out[k] = { err: e.message } }
      }
      if (alive) setDocs(out)
    })()
    return () => { alive = false }
  }, [vendor.id, vendor.live_photo_path, vendor.aadhaar_doc_path, vendor.pan_doc_path, vendor.dl_doc_path])

  async function assignPod(val) {
    const pod = val === 'Unassigned' ? null : val
    if (pod === (row.pod || null)) return
    setBusy('pod'); setErr('')
    const { error } = await supabase.from('vendors').update({ pod }).eq('id', row.id)
    if (error) setErr(error.message)
    else { setRow(r => ({ ...r, pod })); onUpdated && onUpdated() }
    setBusy('')
  }

  async function onboard() {
    setBusy('onboard'); setErr('')
    const { data, error } = await supabase.rpc('approve_vendor', { p_vendor_id: row.id })
    if (error) { setErr(error.message); setBusy(''); return }
    setRow(data)
    setDone(data.vendor_code)
    setBusy('')
  }

  const liveUrl = docs.live && docs.live.url
  const hasBank = row.bank_account_no || row.bank_ifsc || row.bank_account_name
  // already onboarded (opened from the roster) or just onboarded this session
  const onboardedCode = done || (row.status === 'approved' ? row.vendor_code : null)

  async function saveEmail(next) {
    const e = (next || '').trim().toLowerCase()
    if (!isEmail(e)) return 'Enter a valid email address.'
    const { error } = await supabase.from('vendors').update({ email: e }).eq('id', row.id)
    if (error) return error.message
    setRow(r => ({ ...r, email: e }))
    onUpdated && onUpdated()
    return null
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 640, margin: '0 auto', background: 'var(--bg-panel, #1e2028)', borderRadius: '16px 16px 0 0', maxHeight: '93vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.22s ease-out' }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 4px', flexShrink: 0 }} />

        {/* header with live selfie */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px 14px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          {liveUrl ? (
            <img src={liveUrl} alt="" width={54} height={54} style={{ width: 54, height: 54, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid var(--accent, #c8963e)' }} />
          ) : (
            <div style={{ width: 54, height: 54, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(row.full_name) + '22', color: avatarColor(row.full_name), fontWeight: 700, fontSize: 19, fontFamily: 'var(--font-mono, monospace)', border: `2px solid ${avatarColor(row.full_name)}` }}>{initials(row.full_name)}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.full_name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 6, padding: '1px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{row.trade}</span>
              {row.vendor_code && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green, #3dba7a)', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.28)', borderRadius: 6, padding: '1px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{row.vendor_code}</span>}
              {row.pod && <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{row.pod}</span>}
              <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{relTime(row.submitted_at)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>

        {/* body */}
        <div style={{ overflowY: 'auto', padding: '14px 18px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="Contact">
            <Row label="Phone">{row.phone}</Row>
            <Row label="Alt phone">{row.alt_phone}</Row>
            <EmailRow value={row.email} onSave={saveEmail} />
            <Row label="Address">{[row.address_line, row.city, row.pincode].filter(Boolean).join(', ') || '—'}</Row>
          </Card>

          <Card title="Payout">
            {hasBank && <>
              <Row label="Acct name">{row.bank_account_name}</Row>
              <Row label="Account no.">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{revealAcct ? (row.bank_account_no || '—') : maskAccount(row.bank_account_no)}</span>
                  {row.bank_account_no && (
                    <button type="button" onClick={() => setRevealAcct(v => !v)} style={{ fontSize: 10, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{revealAcct ? 'hide' : 'reveal'}</button>
                  )}
                </span>
              </Row>
              <Row label="IFSC">{row.bank_ifsc}</Row>
            </>}
            <Row label="UPI ID">{row.upi_id}</Row>
          </Card>

          <Card title="Identity documents">
            <Row label="Aadhaar">{row.aadhaar_last4 ? `•••• •••• ${row.aadhaar_last4}` : '—'}</Row>
            <Row label="PAN">{row.pan_number}</Row>
            <Row label="Licence">{row.dl_number ? `${row.dl_number}${row.dl_expiry ? ` · exp ${fmtDate(row.dl_expiry)}` : ''}` : '—'}</Row>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <DocThumb label="Aadhaar" doc={docs.aadhaar} />
              <DocThumb label="PAN" doc={docs.pan} />
              <DocThumb label="Licence" doc={docs.dl} />
            </div>
          </Card>

          <Card title="Live capture">
            <LocationCard lat={row.capture_lat} lng={row.capture_lng} accuracy={row.capture_accuracy} at={row.capture_at} />
          </Card>
        </div>

        {/* footer: assign POD + onboard */}
        <div style={{ borderTop: '1px solid var(--border, #2e3040)', padding: '12px 18px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-panel, #1e2028)' }}>
          {err && <ErrStrip>{err}</ErrStrip>}

          {onboardedCode ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.35)', borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>✓</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green, #3dba7a)' }}>Onboarded{row.reviewed_at ? ` · ${fmtDate(row.reviewed_at)}` : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>Vendor code {onboardedCode}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>POD</span>
                <PillGroup options={POD_OPTIONS} value={row.pod || 'Unassigned'} onChange={assignPod} />
              </div>
              {done && <BtnPrimary onClick={onOnboarded}>Done</BtnPrimary>}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assign POD (optional)</span>
                <PillGroup options={POD_OPTIONS} value={row.pod || 'Unassigned'} onChange={assignPod} />
              </div>
              <button
                type="button"
                onClick={onboard}
                disabled={busy === 'onboard'}
                style={{
                  width: '100%', minHeight: 50, borderRadius: 10, border: 'none',
                  background: busy === 'onboard' ? 'var(--accent-dim, #8a6428)' : 'var(--accent, #c8963e)',
                  color: '#fff', fontSize: 15, fontWeight: 700, cursor: busy === 'onboard' ? 'wait' : 'pointer',
                  fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {busy === 'onboard' ? 'Onboarding…' : `Onboard ${row.full_name.split(' ')[0]} →`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
