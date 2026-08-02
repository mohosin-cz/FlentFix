import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Field, Input } from '../components/ui'
import { getPosition, fmtTime, fmtDate, maskAccount } from '../utils/vendorHub'

const TOKEN_KEY = 'flent_attend_token'

// All sub-components at module scope (stable identity → no Android keyboard drop).

function Shell({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', minHeight: 56, flexShrink: 0, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent, #c8963e)', letterSpacing: '0.04em', fontFamily: 'var(--font-mono, monospace)' }}>FLENT</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>vendor portal</span>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ padding: '18px 16px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function RedStrip({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 14px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>⚠ {title}</span>
      {children && <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5, fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word' }}>{children}</span>}
    </div>
  )
}

function bigBtn(kind, disabled) {
  const bg = disabled ? 'var(--bg-input, #252731)' : kind === 'danger' ? 'var(--red, #e05c6a)' : kind === 'go' ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)'
  return {
    width: '100%', minHeight: 52, borderRadius: 10, border: 'none', background: bg,
    color: disabled ? 'var(--text-muted, #6b6d82)' : '#fff', fontSize: 16, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.02em', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  }
}
const linkBtn = { background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', padding: 4 }

// ── profile card / row ──────────────────────────────────────────────────────
function PCard({ title, children }) {
  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: '2px 14px 8px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '10px 0 4px' }}>{title}</div>
      {children}
    </div>
  )
}
function PRow({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', minWidth: 100, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', flex: 1, wordBreak: 'break-word' }}>{children || '—'}</span>
    </div>
  )
}

// ── portal bottom nav ───────────────────────────────────────────────────────
const PORTAL_TABS = [{ key: 'time', label: 'Time', icon: '⏱' }, { key: 'profile', label: 'Profile', icon: '☰' }, { key: 'payroll', label: 'Payroll', icon: '₹' }]
function PortalNav({ tab, onTab }) {
  return (
    <div style={{ flexShrink: 0, display: 'flex', background: 'var(--bg-panel, #1e2028)', borderTop: '1px solid var(--border, #2e3040)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {PORTAL_TABS.map(t => {
        const on = tab === t.key
        return (
          <button key={t.key} type="button" onClick={() => onTab(t.key)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 0', background: 'none', border: 'none', cursor: 'pointer', color: on ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', WebkitTapHighlightColor: 'transparent' }}>
            <span style={{ fontSize: 17, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: on ? 700 : 500, fontFamily: 'var(--font-mono, monospace)' }}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function Attend() {
  const [step, setStep] = useState(() => { try { return localStorage.getItem(TOKEN_KEY) ? 'resume' : 'email' } catch { return 'email' } })
  const [initialToken] = useState(() => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } })
  const tokenRef = useRef(initialToken)

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [vendor, setVendor] = useState(null)
  const [sites, setSites] = useState([])
  const [site, setSite] = useState('')
  const [geo, setGeo] = useState(null)
  const [geoErr, setGeoErr] = useState('')
  const [geoBusy, setGeoBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(null)
  // portal
  const [tab, setTab] = useState('time')
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState(null)

  const captureLocation = useCallback(async () => {
    setGeoErr(''); setGeoBusy(true)
    try { setGeo(await getPosition()) } catch (e) { setGeoErr(e.message) }
    setGeoBusy(false)
  }, [])

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase.rpc('attend_history', { p_token: tokenRef.current })
    setHistory(error ? [] : (data || []))
  }, [])

  const enterPortal = useCallback(async (v) => {
    setVendor(v); setTab('time'); setStep('portal')
    const s = await supabase.rpc('attend_sites'); setSites(s.data || [])
    loadHistory()
    const p = await supabase.rpc('attend_profile', { p_token: tokenRef.current })
    if (!p.error && p.data) setProfile(Array.isArray(p.data) ? p.data[0] : p.data)
    captureLocation()
  }, [captureLocation, loadHistory])

  // resume a stored session on load
  useEffect(() => {
    if (step !== 'resume') return
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.rpc('attend_session_info', { p_token: tokenRef.current })
      if (!alive) return
      const v = Array.isArray(data) ? data[0] : data
      if (error || !v) { try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ } tokenRef.current = ''; setStep('email'); return }
      enterPortal(v)
    })()
    return () => { alive = false }
  }, [step, enterPortal])

  async function sendCode() {
    setErr('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email address.'); return }
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('attend-request-otp', { body: { email: email.trim() } })
    setBusy(false)
    if (error) { setErr('Could not reach the server. Check your connection and try again.'); return }
    if (!data || !data.ok) { setErr((data && data.error) || 'Could not send the code.'); return }
    setCode(''); setStep('otp')
  }

  async function verifyCode() {
    setErr('')
    if (!/^\d{6}$/.test(code.trim())) { setErr('Enter the 6-digit code from your email.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('attend_verify_otp', { p_email: email.trim(), p_code: code.trim() })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const v = Array.isArray(data) ? data[0] : data
    if (!v || !v.token) { setErr('Verification failed — request a new code.'); return }
    try { localStorage.setItem(TOKEN_KEY, v.token) } catch { /* noop */ }
    tokenRef.current = v.token
    enterPortal(v)
  }

  async function punch(type) {
    setErr(''); setConfirm(null)
    if (type === 'in' && !site) { setErr('Select the site you are working at.'); return }
    setBusy(true)
    let g = geo
    if (!g) { try { g = await getPosition(); setGeo(g) } catch (e) { setGeoErr(e.message) } }
    const { data, error } = await supabase.rpc('attend_punch', {
      p_token: tokenRef.current, p_type: type,
      p_pid: type === 'in' ? site : (site || null),
      p_lat: g ? g.lat : null, p_lng: g ? g.lng : null, p_accuracy: g ? g.accuracy : null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const r = Array.isArray(data) ? data[0] : data
    setConfirm(r)
    setVendor(prev => ({ ...prev, checked_in: r.punch_type === 'in', last_punch_at: r.punched_at }))
    loadHistory()
  }

  function signOut() {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ }
    tokenRef.current = ''
    setVendor(null); setProfile(null); setHistory(null); setEmail(''); setCode(''); setSite(''); setConfirm(null); setErr(''); setStep('email')
  }

  // ── resume (loading) ────────────────────────────────────────────────────────
  if (step === 'resume') {
    return <Shell><div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Restoring your session…</div></Shell>
  }

  // ── email step ──────────────────────────────────────────────────────────────
  if (step === 'email') {
    return (
      <Shell>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Vendor sign in</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', marginTop: 3, lineHeight: 1.5 }}>Enter the email you gave at onboarding — we’ll send you a code.</div>
        </div>
        <Field label="Email">
          <Input value={email} onChange={setEmail} placeholder="you@example.com" type="email" inputMode="email" autoCorrect="off" />
        </Field>
        {err && <RedStrip title="Couldn’t send code">{err}</RedStrip>}
        <button type="button" onClick={sendCode} disabled={busy} style={bigBtn('primary', busy)}>{busy ? 'Sending…' : 'Send code →'}</button>
      </Shell>
    )
  }

  // ── otp step ────────────────────────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <Shell>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Enter your code</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', marginTop: 3, lineHeight: 1.5 }}>We sent a 6-digit code to <span style={{ color: 'var(--text-dim, #9394a8)' }}>{email.trim()}</span>. It expires in 10 minutes.</div>
        </div>
        <Field label="6-digit code">
          <Input value={code} onChange={setCode} placeholder="123456" type="tel" inputMode="numeric" maxLength={6} />
        </Field>
        {err && <RedStrip title="Couldn’t verify">{err}</RedStrip>}
        <button type="button" onClick={verifyCode} disabled={busy} style={bigBtn('go', busy)}>{busy ? 'Verifying…' : 'Verify →'}</button>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button type="button" onClick={sendCode} disabled={busy} style={linkBtn}>Resend code</button>
          <button type="button" onClick={() => { setStep('email'); setErr('') }} style={linkBtn}>Change email</button>
        </div>
      </Shell>
    )
  }

  // ── portal ──────────────────────────────────────────────────────────────────
  const checkedIn = vendor && vendor.checked_in
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56, flexShrink: 0, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent, #c8963e)', letterSpacing: '0.04em', fontFamily: 'var(--font-mono, monospace)' }}>FLENT</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor.full_name}</div>
        </div>
        <button type="button" onClick={signOut} style={linkBtn}>Sign out</button>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ padding: '16px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── TIME ─────────────────────────────────────────────────────── */}
          {tab === 'time' && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: checkedIn ? 'rgba(61,186,122,0.10)' : 'var(--bg-input, #252731)', border: `1px solid ${checkedIn ? 'rgba(61,186,122,0.35)' : 'var(--border, #2e3040)'}` }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: checkedIn ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }} />
              <span style={{ fontSize: 13, color: checkedIn ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{checkedIn ? `On site since ${fmtTime(vendor.last_punch_at)}` : 'Not checked in'}</span>
            </div>

            {!checkedIn && (
              <Field label="Which site are you at?">
                <select value={site} onChange={e => setSite(e.target.value)} style={{ width: '100%', padding: '11px 14px', fontSize: 16, minHeight: 46, color: site ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }}>
                  <option value="">Select a site…</option>
                  {sites.map(s => <option key={s.pid} value={s.pid}>{s.label} ({s.pid})</option>)}
                </select>
              </Field>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
              <span style={{ fontSize: 15 }}>📍</span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{geo ? `Location captured · ±${Math.round(geo.accuracy)}m` : geoBusy ? 'Getting location…' : 'Location not captured'}</span>
              {!geoBusy && <button type="button" onClick={captureLocation} style={{ fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{geo ? 'refresh' : 'retry'}</button>}
            </div>
            {geoErr && <RedStrip title="Location">{geoErr}</RedStrip>}
            {confirm && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.35)', borderRadius: 10 }}>
                <span style={{ fontSize: 18 }}>✓</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>{confirm.punch_type === 'in' ? 'Checked in' : 'Checked out'} at {fmtTime(confirm.punched_at)}</span>
              </div>
            )}
            {err && <RedStrip title="Couldn’t record">{err}</RedStrip>}
            <button type="button" onClick={() => punch(checkedIn ? 'out' : 'in')} disabled={busy} style={bigBtn(checkedIn ? 'danger' : 'go', busy)}>{busy ? 'Recording…' : checkedIn ? 'Check out →' : 'Check in →'}</button>

            <PCard title="Recent">
              {history == null ? (
                <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>
              ) : history.length === 0 ? (
                <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No punches yet.</div>
              ) : history.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: h.punch_type === 'in' ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: h.punch_type === 'in' ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', minWidth: 34 }}>{h.punch_type === 'in' ? 'IN' : 'OUT'}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDate(h.punched_at)} · {fmtTime(h.punched_at)}</span>
                  {h.pid && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{h.pid}</span>}
                </div>
              ))}
            </PCard>
          </>}

          {/* ── PROFILE ──────────────────────────────────────────────────── */}
          {tab === 'profile' && (profile ? <>
            <PCard title="You">
              <PRow label="Name">{profile.full_name}</PRow>
              <PRow label="Trade">{profile.trade}</PRow>
              <PRow label="POD">{profile.pod}</PRow>
              <PRow label="Vendor code">{profile.vendor_code}</PRow>
              <PRow label="Joined">{profile.date_of_joining ? fmtDate(profile.date_of_joining) : '—'}</PRow>
            </PCard>
            <PCard title="Contact">
              <PRow label="Phone">{profile.phone}</PRow>
              <PRow label="Alt phone">{profile.alt_phone}</PRow>
              <PRow label="Email">{profile.email}</PRow>
              <PRow label="Address">{[profile.address_line, profile.city, profile.pincode].filter(Boolean).join(', ')}</PRow>
            </PCard>
            <PCard title="Payout">
              <PRow label="Account name">{profile.bank_account_name}</PRow>
              <PRow label="Account no.">{profile.bank_account_last4 ? maskAccount(profile.bank_account_last4) : '—'}</PRow>
              <PRow label="IFSC">{profile.bank_ifsc}</PRow>
              <PRow label="UPI ID">{profile.upi_id}</PRow>
            </PCard>
            <PCard title="Documents">
              <PRow label="Aadhaar">{profile.aadhaar_last4 ? `•••• •••• ${profile.aadhaar_last4}` : '—'}</PRow>
              <PRow label="PAN">{profile.pan_number}</PRow>
              <PRow label="Licence">{profile.dl_number ? `${profile.dl_number}${profile.dl_expiry ? ` · exp ${fmtDate(profile.dl_expiry)}` : ''}` : '—'}</PRow>
            </PCard>
          </> : <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading profile…</div>)}

          {/* ── PAYROLL ──────────────────────────────────────────────────── */}
          {tab === 'payroll' && (
            <div style={{ padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>₹</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Payroll — coming soon</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 6, lineHeight: 1.5, maxWidth: 300, marginLeft: 'auto', marginRight: 'auto' }}>Your earnings, payment history and payslips will appear here once payroll goes live.</div>
            </div>
          )}
        </div>
      </div>

      <PortalNav tab={tab} onTab={setTab} />
    </div>
  )
}
