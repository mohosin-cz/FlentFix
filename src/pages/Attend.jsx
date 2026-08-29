import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import PortalPayroll from '../components/vendor/PortalPayroll'
import { Field, Input } from '../components/ui'
import { getPosition, fmtTime, fmtDate, fmtDuration, fmtElapsed, fmtBreakLeft, maskAccount, initials, avatarColor } from '../utils/vendorHub'
import { compressForUpload, newSubmissionId } from '../utils/vendorOnboard'
import FlentWordmark from '../components/FlentWordmark'

const TOKEN_KEY = 'flent_attend_token'
const avatarUrl = (path) => {
  if (!path) return null
  try { return supabase.storage.from('vendor-avatars').getPublicUrl(path).data.publicUrl } catch { return null }
}

// light + quick selfie: downscale on a canvas → small JPEG (no worker, no webp).
async function selfieBlob(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not read the photo')); im.src = url })
    const max = 720
    let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
    if (w > h && w > max) { h = Math.round(h * max / w); w = max }
    else if (h >= w && h > max) { w = Math.round(w * max / h); h = max }
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(img, 0, 0, w, h)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.7))
    if (!blob) throw new Error('Could not process the photo')
    return blob
  } finally { URL.revokeObjectURL(url) }
}

// group punches into days, pairing in/out per kind → { date, regularMs, otMs, punches[] }
function groupHistory(list) {
  const byDay = {}
  for (const h of list || []) {
    const d = new Date(h.punched_at)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    ;(byDay[key] = byDay[key] || []).push(h)
  }
  return Object.values(byDay).map(punches => {
    const asc = [...punches].sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at))
    const ms = { regular: 0, overtime: 0 }
    const open = { regular: null, overtime: null }
    for (const p of asc) {
      const k = p.kind || 'regular'
      if (p.punch_type === 'in') { if (open[k] == null) open[k] = new Date(p.punched_at).getTime() }
      else if (open[k] != null) { ms[k] += new Date(p.punched_at).getTime() - open[k]; open[k] = null }
    }
    return { date: asc[0].punched_at, regularMs: ms.regular, otMs: ms.overtime, punches: [...asc].reverse() }
  }).sort((a, b) => new Date(b.date) - new Date(a.date))
}

// ── layout primitives (module scope: stable identity) ───────────────────────
function Shell({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', minHeight: 56, flexShrink: 0, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        <FlentWordmark variant="light" height={18} />
        <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>vendor portal</span>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ padding: '18px 16px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
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
// Dark ink on the fill, not white.
//
// Every one of these fills is a mid-tone, and white on a mid-tone is not
// readable: white on the green was 2.47:1, on the gold 2.66:1, where 4.5 is the
// floor and 3.0 the concession for large bold text. All four failed. The same
// fills carry #16171f at 5.0–7.2:1, and that is already how the rest of the app
// paints an accent button — this page was the outlier, not the standard.
//
// It matters most here: this is the screen someone uses outdoors, in sunlight,
// on a cheap phone, to record that they turned up.
const BTN_FILL = {
  danger: 'var(--red, #e05c6a)',
  ot: '#5b8def',
  go: 'var(--green, #3dba7a)',
  primary: 'var(--accent, #c8963e)',
}
function bigBtn(kind, disabled) {
  const bg = disabled ? 'var(--bg-input, #252731)' : (BTN_FILL[kind] || BTN_FILL.primary)
  return { width: '100%', minHeight: 52, borderRadius: 10, border: 'none', background: bg, color: disabled ? 'var(--text-muted, #6b6d82)' : '#16171f', fontSize: 16, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }
}

// A quiet, outlined button. For actions that are occasional rather than the
// point of the screen — asking for an edit window is not what a vendor came
// here to do, and painting it in a solid accent slab said that it was.
function ghostBtn(disabled) {
  return { width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid var(--border-dash, #3a3d52)', background: 'transparent', color: disabled ? 'var(--text-muted, #6b6d82)' : 'var(--text, #e8e8f0)', fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }
}
const linkBtn = { background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', padding: 4 }

// What a vendor actually comes here to fix, in their words rather than the
// column names. Kept short: the point is that tapping is quicker than typing.
const EDIT_TOPICS = ['Phone', 'Bank / UPI', 'Address', 'Documents', 'Name spelling', 'Something else']

function PCard({ title, children }) {
  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, padding: '2px 16px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '12px 0 4px' }}>{title}</div>
      {children}
    </div>
  )
}
function PRow({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', minWidth: 104, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', flex: 1, wordBreak: 'break-word' }}>{children || '—'}</span>
    </div>
  )
}

// Payroll sits in the middle — it is the thing a vendor now comes here to do
// besides punching, and the middle of a three-up bar is the easiest reach on a
// phone. Profile moves right: it is looked at rarely.
const PORTAL_TABS = [{ key: 'time', label: 'Time', icon: '⏱' }, { key: 'payroll', label: 'Payroll', icon: '₹' }, { key: 'profile', label: 'Profile', icon: '☰' }]
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

// avatar with optional upload affordance
function AvatarBig({ name, url, onPick, busy }) {
  const color = avatarColor(name)
  return (
    <button type="button" onClick={onPick} disabled={busy} style={{ position: 'relative', width: 96, height: 96, borderRadius: '50%', border: 'none', padding: 0, cursor: busy ? 'wait' : 'pointer', background: 'none', flexShrink: 0 }}>
      {url ? (
        <img src={url} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${color}` }} />
      ) : (
        <div style={{ width: 96, height: 96, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: color + '22', color, fontWeight: 700, fontSize: 32, fontFamily: 'var(--font-mono, monospace)', border: `2px solid ${color}` }}>{initials(name)}</div>
      )}
      <span style={{ position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: '50%', background: 'var(--accent, #c8963e)', border: '2px solid var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{busy ? '…' : '📷'}</span>
    </button>
  )
}

// editable fields during an approved window (email + name stay locked)
const EDIT_FIELDS = [
  { section: 'Contact', fields: [
    { k: 'phone', label: 'Phone' }, { k: 'alt_phone', label: 'Alt phone' },
    { k: 'address_line', label: 'Address' }, { k: 'city', label: 'City' }, { k: 'pincode', label: 'Pincode' },
  ] },
  { section: 'Payout', fields: [
    { k: 'bank_account_name', label: 'Account name' },
    { k: 'bank_account_no', label: 'Account no.' },
    { k: 'bank_ifsc', label: 'IFSC' }, { k: 'upi_id', label: 'UPI ID' },
  ] },
  { section: 'Documents', fields: [
    { k: 'pan_number', label: 'PAN' }, { k: 'dl_number', label: 'Licence no.' },
    { k: 'dl_expiry', label: 'Licence expiry', type: 'date' },
  ] },
]
const EDIT_KEYS = EDIT_FIELDS.flatMap(g => g.fields.map(f => f.k))
// bank account isn't returned in full (masked), so start it blank
function initDraft(p) { const d = {}; for (const k of EDIT_KEYS) d[k] = k === 'bank_account_no' ? '' : (p[k] || ''); return d }

function EInput({ label, value, onChange, placeholder, type }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border, #2e3040)', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', minWidth: 96, flexShrink: 0 }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type || 'text'}
        style={{ flex: 1, minWidth: 0, padding: '8px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }} />
    </div>
  )
}

export default function Attend() {
  const [step, setStep] = useState(() => { try { return localStorage.getItem(TOKEN_KEY) ? 'resume' : 'email' } catch { return 'email' } })
  const [initialToken] = useState(() => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } })
  const tokenRef = useRef(initialToken)
  const fileRef = useRef(null)
  const selfieRef = useRef(null)

  const [email, setEmail] = useState('')
  const [vendor, setVendor] = useState(null)
  const [pid, setPid] = useState('')
  const [kind, setKind] = useState('regular')
  const [geo, setGeo] = useState(null)
  const [geoErr, setGeoErr] = useState('')
  const [geoBusy, setGeoBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [tab, setTab] = useState('time')
  const [password, setPassword] = useState('')
  const [profile, setProfile] = useState(null)
  const [history, setHistory] = useState(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarErr, setAvatarErr] = useState('')
  const [pendingType, setPendingType] = useState(null)  // punch awaiting its selfie
  const [editReq, setEditReq] = useState(null)       // {id,status,expires_at,proposed,decision_note}
  const [editDraft, setEditDraft] = useState(null)   // in-progress edits during a granted window
  const [editReason, setEditReason] = useState('')
  const [editOpen, setEditOpen] = useState(false)    // the request form, closed until asked for
  const [editTopics, setEditTopics] = useState([])   // what they say needs changing
  const [editBusy, setEditBusy] = useState(false)
  const [editErr, setEditErr] = useState('')
  const [nowTs, setNowTs] = useState(0)              // ticker for the countdown
  const [breaks, setBreaks] = useState(null)         // today's breaks, newest last
  const [breakBusy, setBreakBusy] = useState('')
  const [breakErr, setBreakErr] = useState('')
  const [tick, setTick] = useState(() => Date.now()) // 1s clock, only while on the clock

  const captureLocation = useCallback(async () => {
    setGeoErr(''); setGeoBusy(true)
    try { setGeo(await getPosition()) } catch (e) { setGeoErr(e.message) }
    setGeoBusy(false)
  }, [])

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase.rpc('attend_history', { p_token: tokenRef.current })
    setHistory(error ? [] : (data || []))
  }, [])

  const loadProfile = useCallback(async () => {
    const { data, error } = await supabase.rpc('attend_profile', { p_token: tokenRef.current })
    if (!error && data) setProfile(Array.isArray(data) ? data[0] : data)
  }, [])

  const loadBreaks = useCallback(async () => {
    const { data, error } = await supabase.rpc('attend_break_status', { p_token: tokenRef.current })
    // A missing RPC means the migration has not been run; say so rather than
    // showing an empty break panel that looks like "no breaks taken".
    if (error) { setBreakErr(error.message); setBreaks([]); return }
    setBreakErr(''); setBreaks(data || [])
  }, [])

  const loadEditStatus = useCallback(async () => {
    const { data, error } = await supabase.rpc('attend_edit_status', { p_token: tokenRef.current })
    if (error) return
    setEditReq(Array.isArray(data) ? (data[0] || null) : (data || null))
  }, [])

  const enterPortal = useCallback(async (v) => {
    setVendor(v); setTab('time'); setStep('portal')
    loadHistory(); loadProfile(); loadEditStatus(); loadBreaks(); captureLocation()
  }, [captureLocation, loadHistory, loadProfile, loadEditStatus, loadBreaks])

  const isGranted = editReq && editReq.status === 'granted' && editReq.expires_at && new Date(editReq.expires_at).getTime() > nowTs
  const minsLeft = editReq && editReq.expires_at ? Math.max(0, Math.ceil((new Date(editReq.expires_at).getTime() - nowTs) / 60000)) : 0

  // seed / clear the edit draft when the window opens or closes
  useEffect(() => {
    if (editReq && editReq.status === 'granted' && profile && !editDraft) setEditDraft(initDraft(profile))
    if ((!editReq || editReq.status !== 'granted') && editDraft) setEditDraft(null)
  }, [editReq, profile, editDraft])

  // countdown ticker; auto-refresh status the moment the window lapses
  useEffect(() => {
    if (!editReq || editReq.status !== 'granted') return
    setNowTs(Date.now())
    const iv = setInterval(() => {
      const t = Date.now(); setNowTs(t)
      if (editReq.expires_at && new Date(editReq.expires_at).getTime() <= t) loadEditStatus()
    }, 15000)
    return () => clearInterval(iv)
  }, [editReq, loadEditStatus])

  async function requestEdit() {
    setEditBusy(true); setEditErr('')
    // The chips are the request; the note only adds to it. Composed into the
    // one text field the RPC already takes, so staff read a scope rather than a
    // blank — no schema change to carry a list nobody else reads.
    const reason = [editTopics.join(', '), editReason.trim()].filter(Boolean).join(' — ')
    const { error } = await supabase.rpc('attend_request_edit', { p_token: tokenRef.current, p_reason: reason || null })
    setEditBusy(false)
    if (error) { setEditErr(error.message); return }
    setEditReason(''); setEditTopics([]); setEditOpen(false); loadEditStatus()
  }

  async function submitEdit() {
    setEditBusy(true); setEditErr('')
    const changes = {}
    for (const k of EDIT_KEYS) {
      const val = (editDraft[k] ?? '').toString().trim()
      const orig = k === 'bank_account_no' ? '' : (profile[k] || '')
      if (val !== String(orig)) changes[k] = val
    }
    if (Object.keys(changes).length === 0) { setEditErr('You haven’t changed anything yet.'); setEditBusy(false); return }
    const { error } = await supabase.rpc('attend_submit_edit', { p_token: tokenRef.current, p_changes: changes })
    setEditBusy(false)
    if (error) { setEditErr(error.message); return }
    setEditDraft(null); loadEditStatus()
  }

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

  async function login() {
    setErr('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email address.'); return }
    if (!password.trim()) { setErr('Enter the password the office gave you.'); return }
    setBusy(true)
    // Password first. If the two-argument function is not there yet the
    // migration has not run, so fall back to email only rather than locking
    // seventeen people out of punching in for the gap between deploy and SQL.
    let { data, error } = await supabase.rpc('attend_login', {
      p_email: email.trim(), p_password: password.trim(),
    })
    if (error && /schema cache|could not find the function/i.test(error.message || '')) {
      ({ data, error } = await supabase.rpc('attend_login', { p_email: email.trim() }))
    }
    setBusy(false)
    if (error) { setErr(error.message); return }
    const v = Array.isArray(data) ? data[0] : data
    if (!v || !v.token) { setErr('Could not sign in — check the email and try again.'); return }
    try { localStorage.setItem(TOKEN_KEY, v.token) } catch { /* noop */ }
    tokenRef.current = v.token
    setPassword('')
    enterPortal(v)
  }

  // open in-progress punch for a kind (history is newest-first)
  const lastOf = (k) => (history || []).find(h => (h.kind || 'regular') === k)
  const openReg = (() => { const l = lastOf('regular'); return l && l.punch_type === 'in' ? l : null })()
  const openOt = (() => { const l = lastOf('overtime'); return l && l.punch_type === 'in' ? l : null })()
  const activeOpen = kind === 'regular' ? openReg : openOt
  const onClock = !!activeOpen

  // 1s clock for the shift timer and the break countdown. Only runs while the
  // vendor is on the clock — no point spinning a per-second render otherwise.
  useEffect(() => {
    if (!onClock) return undefined
    setTick(Date.now())
    const iv = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [onClock])


  // ── Breaks ────────────────────────────────────────────────────────────────
  // 45 min lunch from 1 pm, 15 min snack between 4 and 6 pm, one of each a day.
  // The same numbers live in attend_break_rules() server-side; these drive the
  // buttons, the RPC is what actually enforces them.
  const BREAK_RULES = { lunch: { mins: 45, from: 13, to: 24, label: 'Lunch', when: 'after 1 pm' },
                        snack: { mins: 15, from: 16, to: 18, label: 'Snack', when: '4–6 pm' } }

  // Read the hour in IST regardless of how the phone is set, so the button and
  // the server agree about when a window opens.
  const istHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date(tick)))

  const openBreak = (breaks || []).find(b => !b.ended_at) || null
  const takenKinds = new Set((breaks || []).map(b => b.kind))
  const breakMinsUsed = (breaks || []).reduce((sum, b) => {
    const end = b.ended_at ? new Date(b.ended_at).getTime() : tick
    return sum + Math.max(0, (end - new Date(b.started_at).getTime()) / 60000)
  }, 0)

  function breakState(kind) {
    const r = BREAK_RULES[kind]
    if (takenKinds.has(kind) && !(openBreak && openBreak.kind === kind)) return { can: false, why: 'Taken today' }
    if (!onClock)                       return { can: false, why: 'Punch in first' }
    if (openBreak)                      return { can: false, why: 'On a break' }
    if (istHour < r.from)               return { can: false, why: `Opens ${r.when}` }
    if (istHour >= r.to)                return { can: false, why: `Window closed (${r.when})` }
    return { can: true, why: '' }
  }

  async function startBreak(kind) {
    setBreakBusy(kind); setBreakErr('')
    const { error } = await supabase.rpc('attend_break_start', { p_token: tokenRef.current, p_kind: kind })
    setBreakBusy('')
    if (error) { setBreakErr(error.message); return }
    loadBreaks()
  }

  async function endBreak() {
    setBreakBusy('end'); setBreakErr('')
    const { error } = await supabase.rpc('attend_break_end', { p_token: tokenRef.current })
    setBreakBusy('')
    if (error) { setBreakErr(error.message); return }
    loadBreaks()
  }

  // a punch always captures a selfie first: open the camera, then record on capture
  function startPunch(type) {
    setErr(''); setConfirm(null)
    if (type === 'in' && !pid.trim()) { setErr('Enter the site / property ID you are working at.'); return }
    setPendingType(type)
    if (selfieRef.current) selfieRef.current.click()
  }

  async function onSelfie(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    const type = pendingType
    setPendingType(null)
    if (!file || !type) return
    await punch(type, file)
  }

  async function punch(type, selfieFile) {
    setErr(''); setConfirm(null); setBusy(true)
    let g = geo
    if (!g) { try { g = await getPosition(); setGeo(g) } catch (e) { setGeoErr(e.message) } }
    let selfiePath = null
    try {
      const blob = await selfieBlob(selfieFile)
      selfiePath = `selfies/${newSubmissionId()}.jpg`
      const { error: upErr } = await supabase.storage.from('vendor-avatars').upload(selfiePath, blob, { contentType: 'image/jpeg' })
      if (upErr) throw upErr
    } catch (e) { setBusy(false); setErr('Selfie upload failed: ' + (e && e.message ? e.message : 'try again')); return }
    // Checking out while still on a break would leave that break open for
    // ever — no end time, so it counts as unbounded. End it first.
    if (type === 'out' && (breaks || []).some(b => !b.ended_at)) {
      await supabase.rpc('attend_break_end', { p_token: tokenRef.current })
    }
    const { data, error } = await supabase.rpc('attend_punch', {
      p_token: tokenRef.current, p_type: type, p_kind: kind,
      p_pid: type === 'in' ? pid.trim() : (pid.trim() || null),
      p_lat: g ? g.lat : null, p_lng: g ? g.lng : null, p_accuracy: g ? g.accuracy : null,
      p_selfie: selfiePath,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const r = Array.isArray(data) ? data[0] : data
    setConfirm(r)
    if (type === 'out') setPid('')
    loadHistory(); loadBreaks()
  }

  async function onAvatarFile(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    setAvatarErr(''); setAvatarBusy(true)
    try {
      const { file: img, ext } = await compressForUpload(file)
      const path = `av/${newSubmissionId()}.${ext}`
      const { error: upErr } = await supabase.storage.from('vendor-avatars').upload(path, img, { contentType: img.type || 'image/jpeg' })
      if (upErr) throw upErr
      const { error } = await supabase.rpc('attend_set_avatar', { p_token: tokenRef.current, p_path: path })
      if (error) throw error
      setProfile(p => ({ ...(p || {}), avatar_path: path }))
    } catch (e2) { setAvatarErr(e2.message || 'Could not upload the photo.') }
    setAvatarBusy(false)
  }

  function signOut() {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ }
    tokenRef.current = ''
    setVendor(null); setProfile(null); setHistory(null); setEmail(''); setPid(''); setConfirm(null); setErr(''); setStep('email')
  }

  if (step === 'resume') return <Shell><div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Restoring your session…</div></Shell>

  if (step === 'email') {
    return (
      <Shell>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Vendor sign in</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', marginTop: 3, lineHeight: 1.5 }}>Enter the email you gave at onboarding, and the password the office gave you.</div>
        </div>
        <Field label="Email"><Input value={email} onChange={setEmail} placeholder="you@example.com" type="email" inputMode="email" autoCorrect="off" /></Field>
        {/* Optional until the office has issued one. Two people can share an
            inbox, but not a password — so this is also what tells them apart
            at sign-in, rather than the email quietly picking one of them. */}
        <Field label="Password">
          <Input value={password} onChange={setPassword} placeholder="From the office"
            type="password" autoCorrect="off" autoCapitalize="characters" />
        </Field>
        {err && <RedStrip title="Couldn’t sign in">{err}</RedStrip>}
        <button type="button" onClick={login} disabled={busy} style={bigBtn('primary', busy)}>{busy ? 'Signing in…' : 'Sign in →'}</button>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', textAlign: 'center', lineHeight: 1.6 }}>
          Forgotten it? The office can issue a new one — it cannot be looked up.
        </div>
      </Shell>
    )
  }

  // ── portal ──────────────────────────────────────────────────────────────────
  const isOt = kind === 'overtime'
  const days = groupHistory(history)
  const headerAvatar = profile && avatarUrl(profile.avatar_path)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={onAvatarFile} style={{ display: 'none' }} />
      <input ref={selfieRef} type="file" accept="image/*" capture="user" onChange={onSelfie} style={{ display: 'none' }} />
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 16px', minHeight: 56, flexShrink: 0, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        <FlentWordmark variant="light" height={18} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button type="button" onClick={() => setTab('profile')} aria-label="Profile" style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', WebkitTapHighlightColor: 'transparent' }}>
            {headerAvatar
              ? <img src={headerAvatar} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border, #2e3040)' }} />
              : <span style={{ width: 30, height: 30, borderRadius: '50%', background: avatarColor(vendor.full_name) + '22', color: avatarColor(vendor.full_name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>{initials(vendor.full_name)}</span>}
          </button>
          <button type="button" onClick={signOut} style={linkBtn}>Sign out</button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ padding: '16px', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── TIME ─────────────────────────────────────────────────────── */}
          {tab === 'time' && <>
            <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
              {[{ k: 'regular', l: 'Regular' }, { k: 'overtime', l: 'Overtime' }].map(o => {
                const on = kind === o.k
                const c = o.k === 'overtime' ? '#5b8def' : 'var(--accent, #c8963e)'
                return <button key={o.k} type="button" onClick={() => { setKind(o.k); setConfirm(null); setErr('') }} style={{ flex: 1, padding: '9px 8px', fontSize: 13, fontWeight: on ? 700 : 500, border: 'none', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--bg-input, #252731)' : 'transparent', color: on ? c : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', boxShadow: on ? `inset 0 0 0 1px ${c}55` : 'none' }}>{o.l}</button>
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, background: onClock ? (isOt ? 'rgba(91,141,239,0.10)' : 'rgba(61,186,122,0.10)') : 'var(--bg-input, #252731)', border: `1px solid ${onClock ? (isOt ? 'rgba(91,141,239,0.35)' : 'rgba(61,186,122,0.35)') : 'var(--border, #2e3040)'}` }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: onClock ? (isOt ? '#5b8def' : 'var(--green, #3dba7a)') : 'var(--text-muted, #6b6d82)' }} />
              <span style={{ fontSize: 13, color: onClock ? (isOt ? '#5b8def' : 'var(--green, #3dba7a)') : 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>
                {onClock ? `${isOt ? 'Overtime' : 'On site'} since ${fmtTime(activeOpen.punched_at)}${activeOpen.pid ? ` · ${activeOpen.pid}` : ''}` : (isOt ? 'No overtime running' : 'Not checked in')}
              </span>
            </div>

            {!onClock && (
              <Field label="Site / property ID">
                <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>
                  <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', borderRight: '1px solid var(--border, #2e3040)', fontFamily: 'var(--font-mono, monospace)' }}>PID</span>
                  <input value={pid} onChange={e => setPid(e.target.value)} placeholder="enter the number" autoCapitalize="characters" autoCorrect="off"
                    style={{ flex: 1, minWidth: 0, padding: '13px 12px', fontSize: 16, color: 'var(--text, #e8e8f0)', background: 'none', border: 'none', outline: 'none', fontFamily: 'inherit' }} />
                </div>
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
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>{(confirm.kind === 'overtime' ? 'Overtime ' : '')}{confirm.punch_type === 'in' ? 'started' : 'ended'} at {fmtTime(confirm.punched_at)}</span>
              </div>
            )}
            {err && <RedStrip title="Couldn’t record">{err}</RedStrip>}
            {/* Shift timer + breaks. Only while actually on the clock. */}
            {onClock && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
                      {openBreak ? `On ${BREAK_RULES[openBreak.kind].label.toLowerCase()} break` : (isOt ? 'Overtime running' : 'Shift running')}
                    </span>
                    <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, letterSpacing: '0.04em', fontFamily: 'var(--font-mono, monospace)', color: openBreak ? 'var(--accent, #c8963e)' : 'var(--green, #3dba7a)', fontVariantNumeric: 'tabular-nums' }}>
                      {openBreak ? fmtBreakLeft(openBreak, tick) : fmtElapsed(tick - new Date(activeOpen.punched_at).getTime())}
                    </span>
                  </div>
                </div>

                {/* 6 pm: nudge to punch out. */}
                {istHour >= 18 && !openBreak && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 10, background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.35)' }}>
                    <span style={{ fontSize: 16 }}>⏰</span>
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.45 }}>
                      It&rsquo;s past 6 pm — remember to check out.
                    </span>
                  </div>
                )}

                {breakErr && <RedStrip title="Break">{breakErr}</RedStrip>}

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingTop: 2 }}>
                  <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
                    Break allowance · today
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums', color: breakMinsUsed > 60 ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)' }}>
                    {Math.round(breakMinsUsed)} / 60 min used
                  </span>
                </div>

                {openBreak ? (
                  <button type="button" onClick={endBreak} disabled={breakBusy === 'end'}
                    style={{ width: '100%', minHeight: 46, borderRadius: 10, border: '1px solid var(--accent, #c8963e)', background: 'rgba(200,150,62,0.12)', color: 'var(--accent, #c8963e)', fontSize: 14, fontWeight: 700, cursor: breakBusy === 'end' ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                    {breakBusy === 'end' ? 'Ending…' : `End ${BREAK_RULES[openBreak.kind].label.toLowerCase()} break`}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['lunch', 'snack'].map(k => {
                      const r = BREAK_RULES[k]
                      const st = breakState(k)
                      return (
                        <button key={k} type="button" onClick={() => startBreak(k)} disabled={!st.can || breakBusy === k}
                          style={{ flex: 1, minHeight: 52, borderRadius: 10, padding: '6px 8px',
                            border: `1px solid ${st.can ? 'var(--border, #2e3040)' : 'transparent'}`,
                            background: st.can ? 'var(--bg-input, #252731)' : 'rgba(255,255,255,0.03)',
                            color: st.can ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)',
                            cursor: st.can ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-mono, monospace)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{r.label} · {r.mins}m</span>
                          <span style={{ fontSize: 10 }}>{breakBusy === k ? 'Starting…' : (st.can ? 'Tap to start' : st.why)}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {/* The one thing this screen is for. Given the height and the type
                size to match: a single label a person can hit without looking,
                and a second line saying what happens when they do — the punch
                opens the camera, which the old ‘📷 … →’ left them to infer from
                an emoji between two arrows. */}
            <button type="button" onClick={() => startPunch(onClock ? 'out' : 'in')} disabled={busy}
              style={{ ...bigBtn(onClock ? 'danger' : (isOt ? 'ot' : 'go'), busy), minHeight: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.03em' }}>
                {busy ? 'Recording…' : onClock ? (isOt ? 'End overtime' : 'Check out') : (isOt ? 'Start overtime' : 'Check in')}
              </span>
              {!busy && (
                <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.72 }}>Opens the camera</span>
              )}
            </button>

            <PCard title="Attendance history">
              {history == null ? (
                <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>
              ) : days.length === 0 ? (
                <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No attendance yet.</div>
              ) : days.map((d, i) => (
                <div key={i} style={{ borderTop: '1px solid var(--border, #2e3040)', padding: '10px 0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDate(d.date)}</span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDuration(d.regularMs)}</span>
                      {d.otMs > 0 && <span style={{ fontSize: 11, color: '#5b8def', fontFamily: 'var(--font-mono, monospace)' }}>+OT {fmtDuration(d.otMs)}</span>}
                    </span>
                  </div>
                  {d.punches.map((h, j) => {
                    const ot = (h.kind || 'regular') === 'overtime'
                    const inn = h.punch_type === 'in'
                    return (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: inn ? (ot ? '#5b8def' : 'var(--green, #3dba7a)') : 'var(--text-muted, #6b6d82)', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: inn ? (ot ? '#5b8def' : 'var(--green, #3dba7a)') : 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', minWidth: 30 }}>{inn ? 'IN' : 'OUT'}</span>
                        {ot && <span style={{ fontSize: 9, color: '#5b8def', border: '1px solid #5b8def55', borderRadius: 4, padding: '0 4px', fontFamily: 'var(--font-mono, monospace)' }}>OT</span>}
                        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtTime(h.punched_at)}{h.pid ? ` · ${h.pid}` : ''}</span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </PCard>
          </>}

          {/* ── PROFILE ──────────────────────────────────────────────────── */}
          {tab === 'profile' && (profile ? <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '10px 0 4px' }}>
              <AvatarBig name={profile.full_name} url={avatarUrl(profile.avatar_path)} onPick={() => fileRef.current && fileRef.current.click()} busy={avatarBusy} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{profile.full_name}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 12, padding: '2px 10px', fontFamily: 'var(--font-mono, monospace)' }}>{profile.trade}</span>
                  {profile.vendor_code && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green, #3dba7a)', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.28)', borderRadius: 12, padding: '2px 10px', fontFamily: 'var(--font-mono, monospace)' }}>{profile.vendor_code}</span>}
                  {profile.pod && <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: '2px 10px', fontFamily: 'var(--font-mono, monospace)' }}>{profile.pod}</span>}
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Tap the photo to {profile.avatar_path ? 'change' : 'add'} it</span>
              {avatarErr && <RedStrip title="Photo">{avatarErr}</RedStrip>}
            </div>
            {/* ── edit-access gate ─────────────────────────────────── */}
            {isGranted ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '11px 14px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.35)', borderRadius: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>✎ Editing open · {minsLeft} min left</span>
                <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>Change what you need below, then submit — staff review your changes before they go live.</span>
              </div>
            ) : editReq && editReq.status === 'requested' ? (
              <div style={{ padding: '11px 14px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 12, fontSize: 12, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>⏳ Edit access requested — waiting for staff approval.</div>
            ) : editReq && editReq.status === 'submitted' ? (
              <div style={{ padding: '11px 14px', background: 'rgba(91,141,239,0.10)', border: '1px solid rgba(91,141,239,0.30)', borderRadius: 12, fontSize: 12, color: '#5b8def', fontFamily: 'var(--font-mono, monospace)' }}>✓ Changes submitted — pending staff review.</div>
            ) : (
              // Closed until asked for. This is an occasional errand, not what
              // the page is for, and as a solid accent slab above the profile it
              // was the loudest thing on screen — louder than the profile it sat
              // on top of, and the same hue as the "waiting for approval" strip
              // it turns into.
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
                {editReq && editReq.status === 'applied' && <span style={{ fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>✓ Your last update was applied.</span>}
                {editReq && editReq.status === 'denied' && <span style={{ fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>Your last request was declined{editReq.decision_note ? `: ${editReq.decision_note}` : '.'}</span>}

                {!editOpen ? (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>
                      Something here wrong? You can ask to change it.
                    </span>
                    <button type="button" onClick={() => setEditOpen(true)} style={ghostBtn(false)}>✎ Request edit access</button>
                  </>
                ) : (
                  <>
                    {/* Ask what, not why. The old box was one optional free-text
                        line, so the honest answer was usually nothing — and
                        staff approved a request without knowing its scope.
                        Tapping what you need is faster than typing it on a
                        phone, and it arrives as something staff can read. */}
                    <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>
                      What needs changing? Staff open a one-hour window, then review your changes before they go live.
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {EDIT_TOPICS.map(t => {
                        const on = editTopics.includes(t)
                        return (
                          <button key={t} type="button"
                            onClick={() => setEditTopics(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}
                            aria-pressed={on}
                            style={{ padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer',
                              border: `1px solid ${on ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
                              background: on ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)',
                              color: on ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)',
                              WebkitTapHighlightColor: 'transparent' }}>
                            {on ? '✓ ' : ''}{t}
                          </button>
                        )
                      })}
                    </div>
                    <input value={editReason} onChange={e => setEditReason(e.target.value)}
                      placeholder="Anything to add? (optional)"
                      style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }} />
                    {editErr && <RedStrip title="Couldn’t submit">{editErr}</RedStrip>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => { setEditOpen(false); setEditErr('') }} disabled={editBusy}
                        style={{ ...ghostBtn(editBusy), width: 'auto', padding: '0 16px', flexShrink: 0 }}>Cancel</button>
                      {/* Enabled only once they have said what — a request with
                          no scope is what staff were being asked to approve. */}
                      <button type="button" onClick={requestEdit} disabled={editBusy || editTopics.length === 0}
                        style={bigBtn('primary', editBusy || editTopics.length === 0)}>
                        {editBusy ? 'Requesting…' : 'Send request'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── fields: editable during a granted window, else read-only ── */}
            {isGranted && editDraft ? <>
              {EDIT_FIELDS.map(g => (
                <PCard key={g.section} title={g.section}>
                  {g.section === 'Contact' && <PRow label="Email">{profile.email}</PRow>}
                  {g.fields.map(f => (
                    <EInput key={f.k} label={f.label} type={f.type} value={editDraft[f.k]} onChange={v => setEditDraft(d => ({ ...d, [f.k]: v }))}
                      placeholder={f.k === 'bank_account_no' && profile.bank_account_last4 ? `•••• ${profile.bank_account_last4} — enter new` : ''} />
                  ))}
                </PCard>
              ))}
              {editErr && <RedStrip title="Couldn’t submit">{editErr}</RedStrip>}
              <button type="button" onClick={submitEdit} disabled={editBusy} style={bigBtn('primary', editBusy)}>{editBusy ? 'Submitting…' : 'Submit changes for review →'}</button>
              <button type="button" onClick={() => setEditDraft(initDraft(profile))} style={linkBtn}>Reset changes</button>
            </> : <>
              <PCard title="Contact">
                <PRow label="Phone">{profile.phone}</PRow>
                <PRow label="Alt phone">{profile.alt_phone}</PRow>
                <PRow label="Email">{profile.email}</PRow>
                <PRow label="Address">{[profile.address_line, profile.city, profile.pincode].filter(Boolean).join(', ')}</PRow>
                <PRow label="Joined">{profile.date_of_joining ? fmtDate(profile.date_of_joining) : '—'}</PRow>
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
            </>}
          </> : <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading profile…</div>)}

          {/* ── PAYROLL ──────────────────────────────────────────────────── */}
          {tab === 'payroll' && (
            <PortalPayroll token={tokenRef.current} vendorName={vendor?.full_name || profile?.full_name || ''} />
          )}
        </div>
      </div>

      <PortalNav tab={tab} onTab={setTab} />
    </div>
  )
}
