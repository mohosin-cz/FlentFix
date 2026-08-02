import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Field, Input } from '../components/ui'
import { getPosition, fmtTime } from '../utils/vendorHub'

// All sub-components at module scope (stable identity → no Android keyboard drop).

function Shell({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', minHeight: 56, flexShrink: 0, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent, #c8963e)', letterSpacing: '0.04em', fontFamily: 'var(--font-mono, monospace)' }}>FLENT</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>attendance</span>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ padding: '18px 16px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', maxWidth: 460, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
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

export default function Attend() {
  const [step, setStep] = useState('id')
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [vendor, setVendor] = useState(null)
  const [sites, setSites] = useState([])
  const [site, setSite] = useState('')
  const [geo, setGeo] = useState(null)
  const [geoErr, setGeoErr] = useState('')
  const [geoBusy, setGeoBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(null)

  async function captureLocation() {
    setGeoErr(''); setGeoBusy(true)
    try { setGeo(await getPosition()) } catch (e) { setGeoErr(e.message) }
    setGeoBusy(false)
  }

  async function identify() {
    setErr('')
    if (!code.trim() || !phone.trim()) { setErr('Enter your vendor code and phone number.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('attend_lookup', { p_code: code, p_phone: phone })
    if (error) { setErr(error.message); setBusy(false); return }
    const v = Array.isArray(data) ? data[0] : data
    if (!v) { setErr('No approved vendor found for that code and phone.'); setBusy(false); return }
    setVendor(v)
    const { data: s } = await supabase.rpc('attend_sites')
    setSites(s || [])
    setStep('punch')
    setBusy(false)
    captureLocation()
  }

  async function punch(type) {
    setErr(''); setConfirm(null)
    if (type === 'in' && !site) { setErr('Select the site you are working at.'); return }
    setBusy(true)
    let g = geo
    if (!g) { try { g = await getPosition(); setGeo(g) } catch (e) { setGeoErr(e.message) } }
    const { data, error } = await supabase.rpc('attend_punch', {
      p_code: code, p_phone: phone, p_type: type,
      p_pid: type === 'in' ? site : (site || null),
      p_lat: g ? g.lat : null, p_lng: g ? g.lng : null, p_accuracy: g ? g.accuracy : null,
    })
    if (error) { setErr(error.message); setBusy(false); return }
    const r = Array.isArray(data) ? data[0] : data
    setConfirm(r)
    setVendor(prev => ({ ...prev, checked_in: r.punch_type === 'in', last_punch_at: r.punched_at }))
    setBusy(false)
  }

  // ── identity step ──────────────────────────────────────────────────────────
  if (step === 'id') {
    return (
      <Shell>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Mark your attendance</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', marginTop: 3, lineHeight: 1.5 }}>Enter your vendor code and phone to check in or out.</div>
        </div>
        <Field label="Vendor code">
          <Input value={code} onChange={setCode} placeholder="e.g. ELE-0042" autoCapitalize="characters" autoCorrect="off" />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={setPhone} placeholder="10-digit mobile" type="tel" inputMode="numeric" maxLength={10} />
        </Field>
        {err && <RedStrip title="Couldn’t verify">{err}</RedStrip>}
        <button type="button" onClick={identify} disabled={busy} style={bigBtn(true, busy)}>{busy ? 'Checking…' : 'Continue →'}</button>
      </Shell>
    )
  }

  // ── punch step ─────────────────────────────────────────────────────────────
  const checkedIn = vendor && vendor.checked_in
  return (
    <Shell>
      <div style={{ padding: '14px 16px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{vendor.full_name}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 6, padding: '1px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{vendor.trade}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{code.toUpperCase()}</span>
          {vendor.pod && <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{vendor.pod}</span>}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: checkedIn ? 'rgba(61,186,122,0.10)' : 'var(--bg-input, #252731)', border: `1px solid ${checkedIn ? 'rgba(61,186,122,0.35)' : 'var(--border, #2e3040)'}` }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: checkedIn ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }} />
        <span style={{ fontSize: 13, color: checkedIn ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>
          {checkedIn ? `On site since ${fmtTime(vendor.last_punch_at)}` : 'Not checked in'}
        </span>
      </div>

      {!checkedIn && (
        <Field label="Which site are you at?">
          <select value={site} onChange={e => setSite(e.target.value)} style={{ width: '100%', padding: '11px 14px', fontSize: 16, minHeight: 46, color: site ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }}>
            <option value="">Select a site…</option>
            {sites.map(s => <option key={s.pid} value={s.pid}>{s.label} ({s.pid})</option>)}
          </select>
        </Field>
      )}

      {/* location */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
        <span style={{ fontSize: 15 }}>📍</span>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>
          {geo ? `Location captured · ±${Math.round(geo.accuracy)}m` : geoBusy ? 'Getting location…' : 'Location not captured'}
        </span>
        {!geoBusy && <button type="button" onClick={captureLocation} style={{ fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{geo ? 'refresh' : 'retry'}</button>}
      </div>
      {geoErr && <RedStrip title="Location">{geoErr}</RedStrip>}

      {confirm && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.35)', borderRadius: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>
            {confirm.punch_type === 'in' ? 'Checked in' : 'Checked out'} at {fmtTime(confirm.punched_at)}
          </span>
        </div>
      )}

      {err && <RedStrip title="Couldn’t record">{err}</RedStrip>}

      <button type="button" onClick={() => punch(checkedIn ? 'out' : 'in')} disabled={busy} style={bigBtn(!checkedIn, busy, checkedIn)}>
        {busy ? 'Recording…' : checkedIn ? 'Check out →' : 'Check in →'}
      </button>

      <button type="button" onClick={() => { setStep('id'); setVendor(null); setCode(''); setPhone(''); setSite(''); setConfirm(''); setErr('') }} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', padding: 4 }}>Not you? Start over</button>
    </Shell>
  )
}

function bigBtn(primary, disabled, danger) {
  const bg = disabled ? 'var(--bg-input, #252731)' : danger ? 'var(--red, #e05c6a)' : primary ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)'
  return {
    width: '100%', minHeight: 52, borderRadius: 10, border: 'none',
    background: bg, color: disabled ? 'var(--text-muted, #6b6d82)' : '#fff',
    fontSize: 16, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  }
}
