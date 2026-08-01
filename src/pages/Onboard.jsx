import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  Field, Input, PillGroup, BtnPrimary, StepBar, SectionLabel, Divider,
} from '../components/ui'
import {
  isPhone, isPincode, isEmail, isIFSC, isPAN, isUPI, isLast4,
  uploadVendorDoc,
} from '../utils/vendorOnboard'

// ─────────────────────────────────────────────────────────────────────────────
// All sub-components are defined at MODULE SCOPE (never inside the render body)
// so React keeps their identity stable across keystrokes — inline components
// remount every render and drop the Android keyboard mid-typing.
// ─────────────────────────────────────────────────────────────────────────────

const TRADES = ['Runner', 'Electrician', 'Carpenter', 'Plumber', 'Cleaner', 'Other']
const isAccountNo = v => /^\d{9,18}$/.test((v || '').trim())

// ── Red error strip (real messages only, never a generic fallback) ──────────
function RedStrip({ title, children }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '10px 14px',
      background: 'rgba(224,92,106,0.10)',
      border: '1px solid rgba(224,92,106,0.30)',
      borderRadius: 6,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}>
        ⚠ {title}
      </span>
      {children && (
        <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5, wordBreak: 'break-word', fontFamily: 'var(--font-mono, monospace)' }}>
          {children}
        </span>
      )}
    </div>
  )
}

// ── Text field (Field + Input with a stable id for jump-to-field) ───────────
function TextField({ id, label, optional, value, onChange, error, placeholder, type, inputMode, maxLength, autoCapitalize }) {
  return (
    <Field label={label} optional={optional} error={error}>
      <Input
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize}
        autoCorrect="off"
        error={!!error}
      />
    </Field>
  )
}

// ── Collapsed completed-stage receipt chip (tap to re-open) ─────────────────
function StepperChip({ visible, label, value, onOpen }) {
  if (!visible || !value) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        background: 'var(--bg-input, #252731)',
        border: '1px solid var(--green, #3dba7a)',
        borderRadius: 6, cursor: 'pointer', width: '100%', textAlign: 'left',
        WebkitTapHighlightColor: 'transparent', minHeight: 40,
      }}
    >
      <span style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, minWidth: 54 }}>{label}</span>
      <span style={{ width: 1, height: 12, background: 'var(--border, #2e3040)', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', flexShrink: 0 }}>✎</span>
    </button>
  )
}

// ── Expanding stage body (only the active stage is visible) ─────────────────
function StepperStageBox({ active, title, children }) {
  return (
    <div style={{ overflow: 'hidden', maxHeight: active ? '6000px' : '0', opacity: active ? 1 : 0, transition: 'max-height 220ms ease, opacity 220ms ease' }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 16,
        padding: 16,
        background: 'var(--bg-panel, #1e2028)',
        border: '1px solid var(--accent, #c8963e)',
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}>
        {title && <SectionLabel>{title}</SectionLabel>}
        {children}
      </div>
    </div>
  )
}

// ── Advance button (right-aligned, gold when enabled) ───────────────────────
function StepperNextBtn({ onClick, disabled, label = 'Continue →' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
      <BtnPrimary onClick={onClick} disabled={disabled}>{label}</BtnPrimary>
    </div>
  )
}

// ── Live camera capture (getUserMedia → canvas). No file input, ever. ───────
function CameraCapture({ facingMode, mirror, hasPhoto, previewUrl, onCapture, onRetake }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [streaming, setStreaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setStreaming(false)
  }, [])

  useEffect(() => () => stop(), [stop])

  async function start() {
    setError('')
    setBusy(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setStreaming(true)
    } catch (err) {
      const name = err && err.name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Camera permission is blocked. Tap the lock / ⓘ icon next to the web address → Camera → Allow, then tap "Start camera" again.')
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
        setError('No usable camera was found on this device.')
      } else {
        setError('Could not start the camera: ' + ((err && err.message) || name || 'unknown error'))
      }
    } finally {
      setBusy(false)
    }
  }

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) {
      setError('Camera is still warming up — wait a second and tap Capture again.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (!blob) { setError('Could not capture the photo — please retry.'); return }
      stop()
      onCapture(blob)
    }, 'image/jpeg', 0.9)
  }

  function retake() {
    onRetake()
    start()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '3 / 4',
        maxHeight: 360, background: '#000', borderRadius: 8, overflow: 'hidden',
        border: '1px solid var(--border, #2e3040)',
      }}>
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            display: hasPhoto ? 'none' : 'block',
            transform: mirror ? 'scaleX(-1)' : 'none',
          }}
        />
        {hasPhoto && previewUrl && (
          <img src={previewUrl} alt="captured" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {!hasPhoto && !streaming && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted, #6b6d82)' }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 6l1.5-2h5L16 6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>camera off</span>
          </div>
        )}
      </div>

      {error && <RedStrip title="Camera unavailable">{error}</RedStrip>}

      {hasPhoto ? (
        <button type="button" onClick={retake} style={ctrlBtnStyle(false)}>Retake photo</button>
      ) : streaming ? (
        <button type="button" onClick={capture} style={ctrlBtnStyle(true)}>◉ Capture photo</button>
      ) : (
        <button type="button" onClick={start} disabled={busy} style={ctrlBtnStyle(true, busy)}>
          {busy ? 'Starting…' : 'Start camera'}
        </button>
      )}
    </div>
  )
}

function ctrlBtnStyle(primary, disabled) {
  return {
    width: '100%', minHeight: 46, borderRadius: 6,
    fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
    border: `1px solid ${primary ? 'transparent' : 'var(--border-dash, #3a3d52)'}`,
    background: disabled ? 'var(--bg-input, #252731)' : primary ? 'var(--accent, #c8963e)' : 'transparent',
    color: disabled ? 'var(--text-muted, #6b6d82)' : primary ? '#fff' : 'var(--text, #e8e8f0)',
  }
}

// ── Document capture block (label + live camera + captured state) ───────────
function DocCapture({ anchorId, title, hint, photo, onCapture, onRetake }) {
  return (
    <div id={anchorId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }}>{title}</span>
        {photo && <span style={{ fontSize: 11, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>captured ✓</span>}
      </div>
      {hint && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{hint}</span>}
      <CameraCapture
        facingMode="environment"
        mirror={false}
        hasPhoto={!!photo}
        previewUrl={photo && photo.url}
        onCapture={onCapture}
        onRetake={onRetake}
      />
    </div>
  )
}

// ── Review summary row (tap to jump back to its stage) ──────────────────────
function ReviewRow({ label, value, onEdit }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        padding: '10px 12px', background: 'var(--bg-input, #252731)',
        border: '1px solid var(--border, #2e3040)', borderRadius: 6, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent', minHeight: 44,
      }}
    >
      <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 96, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', flex: 1, wordBreak: 'break-word' }}>{value || '—'}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', flexShrink: 0 }}>✎</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

const EMPTY = {
  full_name: '', phone: '', alt_phone: '', email: '', address_line: '', city: '', pincode: '', trade: '',
  bank_account_name: '', bank_account_no: '', bank_account_no_confirm: '', bank_ifsc: '', upi_id: '',
  aadhaar_last4: '', pan_number: '', dl_number: '', dl_expiry: '',
}

export default function Onboard() {
  const [form, setForm] = useState(EMPTY)
  const [openStage, setOpenStage] = useState(1)

  // media / capture state — kept out of `form` so nothing sensitive is ever
  // stringified alongside text fields
  const [livePhoto, setLivePhoto] = useState(null)   // { blob, url }
  const [geo, setGeo] = useState(null)               // { lat, lng, accuracy, timestamp }
  const [geoError, setGeoError] = useState('')
  const [geoBusy, setGeoBusy] = useState(false)
  const [aadhaarPhoto, setAadhaarPhoto] = useState(null)
  const [panPhoto, setPanPhoto] = useState(null)
  const [dlPhoto, setDlPhoto] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitStatus, setSubmitStatus] = useState('')
  const [done, setDone] = useState(null)             // submissionId on success

  // one submission id for the whole flow — used as BOTH the storage prefix and
  // the row id, so we never need to read the row back (the anon key can't).
  const submissionId = useRef(null)
  if (submissionId.current === null) submissionId.current = crypto.randomUUID()

  const setField = useCallback((k) => (v) => setForm(f => ({ ...f, [k]: v })), [])

  function makeMedia(blob) {
    return { blob, url: URL.createObjectURL(blob) }
  }

  // ── derived validity ──────────────────────────────────────────────────────
  const stage1Done = !!form.full_name.trim() && isPhone(form.phone) && !!form.trade
  const stage2Done = !!livePhoto && !!geo

  const bankValid =
    !!form.bank_account_name.trim() &&
    isAccountNo(form.bank_account_no) &&
    form.bank_account_no_confirm === form.bank_account_no &&
    isIFSC(form.bank_ifsc)
  const upiValid = isUPI(form.upi_id)
  const stage3Done = bankValid || upiValid

  const dlRequired = form.trade === 'Runner'
  const aadhaarDone = isLast4(form.aadhaar_last4) && !!aadhaarPhoto
  const panDone = isPAN(form.pan_number) && !!panPhoto
  const dlDone = dlRequired ? (!!form.dl_number.trim() && !!form.dl_expiry && !!dlPhoto) : true
  const stage4Done = aadhaarDone && panDone && dlDone

  // ── inline field errors (only shown once the field has content) ────────────
  const phoneErr = form.phone && !isPhone(form.phone) ? 'Enter a valid 10-digit mobile number' : ''
  const altErr = form.alt_phone && !isPhone(form.alt_phone) ? 'Enter a valid 10-digit mobile number' : ''
  const emailErr = form.email && !isEmail(form.email) ? 'Enter a valid email address' : ''
  const pinErr = form.pincode && !isPincode(form.pincode) ? 'Enter a valid 6-digit pincode' : ''
  const acctErr = form.bank_account_no && !isAccountNo(form.bank_account_no) ? 'Enter a valid account number (9–18 digits)' : ''
  const confirmErr = form.bank_account_no_confirm && form.bank_account_no_confirm !== form.bank_account_no ? 'Account numbers do not match' : ''
  const ifscErr = form.bank_ifsc && !isIFSC(form.bank_ifsc) ? 'IFSC must be 11 characters, e.g. HDFC0001234' : ''
  const upiErr = form.upi_id && !isUPI(form.upi_id) ? 'UPI must look like name@bank' : ''
  const last4Err = form.aadhaar_last4 && !isLast4(form.aadhaar_last4) ? 'Enter exactly the last 4 digits' : ''
  const panErr = form.pan_number && !isPAN(form.pan_number) ? 'PAN must look like AAAAA9999A' : ''

  // ── what's-missing checklist for the submit gate ───────────────────────────
  const missing = []
  if (!form.full_name.trim()) missing.push({ label: 'Full name', stage: 1, target: 'f-full_name' })
  if (!isPhone(form.phone)) missing.push({ label: 'Valid 10-digit phone', stage: 1, target: 'f-phone' })
  if (!form.trade) missing.push({ label: 'Trade', stage: 1, target: 'anchor-1' })
  if (!livePhoto) missing.push({ label: 'Live photo', stage: 2, target: 'anchor-2' })
  if (!geo) missing.push({ label: 'GPS location', stage: 2, target: 'anchor-2' })
  if (!stage3Done) missing.push({ label: 'Full bank details or a UPI ID', stage: 3, target: 'anchor-3' })
  if (!isLast4(form.aadhaar_last4)) missing.push({ label: 'Aadhaar last 4 digits', stage: 4, target: 'f-aadhaar_last4' })
  if (!aadhaarPhoto) missing.push({ label: 'Aadhaar card photo', stage: 4, target: 'anchor-4-aadhaar' })
  if (!isPAN(form.pan_number)) missing.push({ label: 'Valid PAN number', stage: 4, target: 'f-pan_number' })
  if (!panPhoto) missing.push({ label: 'PAN card photo', stage: 4, target: 'anchor-4-pan' })
  if (dlRequired && !form.dl_number.trim()) missing.push({ label: 'Driving licence number (Runner)', stage: 4, target: 'f-dl_number' })
  if (dlRequired && !form.dl_expiry) missing.push({ label: 'Driving licence expiry (Runner)', stage: 4, target: 'f-dl_expiry' })
  if (dlRequired && !dlPhoto) missing.push({ label: 'Driving licence photo (Runner)', stage: 4, target: 'anchor-4-dl' })
  const canSubmit = missing.length === 0

  function jumpTo(stage, target) {
    setOpenStage(stage)
    setTimeout(() => {
      const el = target && document.getElementById(target)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (typeof el.focus === 'function') { try { el.focus({ preventScroll: true }) } catch { /* noop */ } }
      }
    }, 260)
  }

  function captureLocation() {
    setGeoError('')
    if (!navigator.geolocation) {
      setGeoError('This device/browser does not support location. Please try a different phone.')
      return
    }
    setGeoBusy(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeo({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        })
        setGeoBusy(false)
      },
      err => {
        setGeoBusy(false)
        if (err.code === 1) {
          setGeoError('Location permission is blocked. Tap the lock / ⓘ icon next to the web address → Location → Allow, then tap "Capture location" again.')
        } else if (err.code === 2) {
          setGeoError('Location is unavailable right now. Move to an open area and tap "Capture location" again.')
        } else if (err.code === 3) {
          setGeoError('Getting location timed out. Check that GPS is on, then tap "Capture location" again.')
        } else {
          setGeoError('Could not get location: ' + (err.message || 'unknown error'))
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }

  async function handleSubmit() {
    if (!canSubmit || submitting) return
    setSubmitError('')
    setSubmitting(true)
    const id = submissionId.current
    try {
      setSubmitStatus('Uploading live photo…')
      const livePath = await uploadVendorDoc(supabase, id, 'live_photo', livePhoto.blob)

      setSubmitStatus('Uploading Aadhaar photo…')
      const aadhaarPath = await uploadVendorDoc(supabase, id, 'aadhaar', aadhaarPhoto.blob)

      setSubmitStatus('Uploading PAN photo…')
      const panPath = await uploadVendorDoc(supabase, id, 'pan', panPhoto.blob)

      let dlPath = null
      if (dlPhoto) {
        setSubmitStatus('Uploading driving licence…')
        dlPath = await uploadVendorDoc(supabase, id, 'dl', dlPhoto.blob)
      }

      setSubmitStatus('Saving your details…')
      const clean = v => { const t = (v || '').trim(); return t === '' ? null : t }
      const row = {
        id,
        status: 'submitted',
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        alt_phone: clean(form.alt_phone),
        email: clean(form.email),
        address_line: clean(form.address_line),
        city: clean(form.city),
        pincode: clean(form.pincode),
        trade: form.trade,
        live_photo_path: livePath,
        capture_lat: geo.lat,
        capture_lng: geo.lng,
        capture_accuracy: geo.accuracy,
        capture_at: new Date(geo.timestamp).toISOString(),
        bank_account_name: clean(form.bank_account_name),
        bank_account_no: clean(form.bank_account_no),
        bank_ifsc: form.bank_ifsc.trim() ? form.bank_ifsc.trim().toUpperCase() : null,
        upi_id: clean(form.upi_id),
        aadhaar_last4: clean(form.aadhaar_last4),
        aadhaar_doc_path: aadhaarPath,
        pan_number: form.pan_number.trim() ? form.pan_number.trim().toUpperCase() : null,
        pan_doc_path: panPath,
        dl_number: form.dl_number.trim() ? form.dl_number.trim().toUpperCase() : null,
        dl_doc_path: dlPath,
        dl_expiry: clean(form.dl_expiry),
      }

      // Insert only — no .select(). The anon key has no read access to vendors
      // and we already know the id we generated.
      const { error } = await supabase.from('vendors').insert(row)
      if (error) throw error

      setDone(id)
    } catch (e) {
      setSubmitError((e && e.message) || String(e))
    } finally {
      setSubmitting(false)
      setSubmitStatus('')
    }
  }

  // ── confirmation screen (only PII shown is their own name) ──────────────────
  if (done) {
    return (
      <Shell>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(61,186,122,0.12)', border: '1px solid var(--green, #3dba7a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="var(--green, #3dba7a)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Thanks, {form.full_name.trim().split(' ')[0] || form.full_name.trim()}!</div>
          <div style={{ fontSize: 14, color: 'var(--text-dim, #9394a8)', lineHeight: 1.6, maxWidth: 340 }}>
            Your details have been received. The Flent team will review them and call you shortly.
          </div>
          <div style={{ marginTop: 8, padding: '12px 20px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>Reference number</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', marginTop: 4 }}>{done.slice(0, 8).toUpperCase()}</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', maxWidth: 320, lineHeight: 1.5 }}>Keep this reference handy when Flent calls you.</div>
        </div>
      </Shell>
    )
  }

  // ── receipt summaries for collapsed stages ──────────────────────────────────
  const s1Summary = [form.full_name.trim(), form.trade, form.phone.trim()].filter(Boolean).join(' · ')
  const s2Summary = geo ? `Photo ✓ · ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)} (±${Math.round(geo.accuracy)}m)` : ''
  const s3Summary = bankValid
    ? `Bank ••${form.bank_account_no.slice(-4)} · ${form.bank_ifsc.toUpperCase()}`
    : upiValid ? `UPI ${form.upi_id.trim()}` : ''
  const s4Summary = [
    isLast4(form.aadhaar_last4) ? `Aadhaar ••${form.aadhaar_last4}` : '',
    isPAN(form.pan_number) ? `PAN ${form.pan_number.toUpperCase()}` : '',
    dlPhoto ? 'DL ✓' : '',
  ].filter(Boolean).join(' · ')

  return (
    <Shell>
      <div style={{ flexShrink: 0 }}>
        <StepBar steps={['Basics', 'Photo', 'Payout', 'Docs', 'Review']} current={openStage - 1} />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
       <div style={{ padding: '16px', paddingBottom: 'max(24px, env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ marginBottom: 2 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Vendor onboarding</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 2, lineHeight: 1.5 }}>Fill this in at the site. It takes about 5 minutes.</div>
        </div>

        {/* ── Stage 1 — Basics ─────────────────────────────────────────────── */}
        <StepperChip visible={openStage !== 1 && stage1Done} label="Basics" value={s1Summary} onOpen={() => setOpenStage(1)} />
        <StepperStageBox active={openStage === 1} title="1 · Basics">
          <span id="anchor-1" />
          <TextField id="f-full_name" label="Full name" value={form.full_name} onChange={setField('full_name')} placeholder="As per your ID" autoCapitalize="words" />
          <TextField id="f-phone" label="Phone" value={form.phone} onChange={setField('phone')} placeholder="10-digit mobile" type="tel" inputMode="numeric" maxLength={10} error={phoneErr} />
          <TextField id="f-alt_phone" label="Alternate phone" optional value={form.alt_phone} onChange={setField('alt_phone')} placeholder="10-digit mobile" type="tel" inputMode="numeric" maxLength={10} error={altErr} />
          <TextField id="f-email" label="Email" optional value={form.email} onChange={setField('email')} placeholder="name@example.com" type="email" inputMode="email" error={emailErr} />
          <TextField id="f-address_line" label="Address" optional value={form.address_line} onChange={setField('address_line')} placeholder="House / street / area" />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <TextField id="f-city" label="City" optional value={form.city} onChange={setField('city')} placeholder="City" autoCapitalize="words" />
            </div>
            <div style={{ flex: 1 }}>
              <TextField id="f-pincode" label="Pincode" optional value={form.pincode} onChange={setField('pincode')} placeholder="6 digits" inputMode="numeric" maxLength={6} error={pinErr} />
            </div>
          </div>
          <Field label="Trade">
            <PillGroup options={TRADES} value={form.trade} onChange={setField('trade')} />
          </Field>
          <StepperNextBtn onClick={() => setOpenStage(2)} disabled={!stage1Done} />
        </StepperStageBox>

        {/* ── Stage 2 — Live photo + location ──────────────────────────────── */}
        <StepperChip visible={openStage !== 2 && stage2Done} label="Photo" value={s2Summary} onOpen={() => setOpenStage(2)} />
        <StepperStageBox active={openStage === 2} title="2 · Live photo + location">
          <span id="anchor-2" />
          <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>
            Take a live selfie now — this can’t come from your gallery. Then capture your GPS location at the site.
          </span>
          <CameraCapture
            facingMode="user"
            mirror
            hasPhoto={!!livePhoto}
            previewUrl={livePhoto && livePhoto.url}
            onCapture={blob => setLivePhoto(makeMedia(blob))}
            onRetake={() => setLivePhoto(null)}
          />

          <Divider label="location" />
          {geo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(61,186,122,0.08)', border: '1px solid rgba(61,186,122,0.25)', borderRadius: 6 }}>
              <span style={{ color: 'var(--green, #3dba7a)' }}>✓</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', flex: 1 }}>
                {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)} · ±{Math.round(geo.accuracy)}m
              </span>
              <button type="button" onClick={captureLocation} style={{ fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>refresh</button>
            </div>
          ) : (
            <button type="button" onClick={captureLocation} disabled={geoBusy} style={ctrlBtnStyle(true, geoBusy)}>
              {geoBusy ? 'Getting location…' : '📍 Capture location'}
            </button>
          )}
          {geoError && <RedStrip title="Location unavailable">{geoError}</RedStrip>}

          <StepperNextBtn onClick={() => setOpenStage(3)} disabled={!stage2Done} />
        </StepperStageBox>

        {/* ── Stage 3 — Payout ─────────────────────────────────────────────── */}
        <StepperChip visible={openStage !== 3 && stage3Done} label="Payout" value={s3Summary} onOpen={() => setOpenStage(3)} />
        <StepperStageBox active={openStage === 3} title="3 · Payout details">
          <span id="anchor-3" />
          <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>
            Give a full bank account <b>or</b> a UPI ID (at least one).
          </span>
          <TextField id="f-bank_account_name" label="Account holder name" optional value={form.bank_account_name} onChange={setField('bank_account_name')} placeholder="Name on the bank account" autoCapitalize="words" />
          <TextField id="f-bank_account_no" label="Account number" optional value={form.bank_account_no} onChange={setField('bank_account_no')} placeholder="Bank account number" inputMode="numeric" maxLength={18} error={acctErr} />
          <TextField id="f-bank_account_no_confirm" label="Re-enter account number" optional value={form.bank_account_no_confirm} onChange={setField('bank_account_no_confirm')} placeholder="Confirm account number" inputMode="numeric" maxLength={18} error={confirmErr} />
          <TextField id="f-bank_ifsc" label="IFSC code" optional value={form.bank_ifsc} onChange={setField('bank_ifsc')} placeholder="e.g. HDFC0001234" maxLength={11} autoCapitalize="characters" error={ifscErr} />
          <Divider label="or" />
          <TextField id="f-upi_id" label="UPI ID" optional value={form.upi_id} onChange={setField('upi_id')} placeholder="name@bank" error={upiErr} />
          <StepperNextBtn onClick={() => setOpenStage(4)} disabled={!stage3Done} />
        </StepperStageBox>

        {/* ── Stage 4 — Documents ──────────────────────────────────────────── */}
        <StepperChip visible={openStage !== 4 && stage4Done} label="Docs" value={s4Summary} onOpen={() => setOpenStage(4)} />
        <StepperStageBox active={openStage === 4} title="4 · Documents">
          <TextField id="f-aadhaar_last4" label="Aadhaar — last 4 digits only" value={form.aadhaar_last4} onChange={setField('aadhaar_last4')} placeholder="1234" inputMode="numeric" maxLength={4} error={last4Err} />
          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: -8 }}>We only keep the last 4 digits — never the full number.</span>
          <DocCapture anchorId="anchor-4-aadhaar" title="Aadhaar card photo" hint="Photo of the card for verification" photo={aadhaarPhoto} onCapture={blob => setAadhaarPhoto(makeMedia(blob))} onRetake={() => setAadhaarPhoto(null)} />

          <Divider />
          <TextField id="f-pan_number" label="PAN number" value={form.pan_number} onChange={setField('pan_number')} placeholder="AAAAA9999A" maxLength={10} autoCapitalize="characters" error={panErr} />
          <DocCapture anchorId="anchor-4-pan" title="PAN card photo" photo={panPhoto} onCapture={blob => setPanPhoto(makeMedia(blob))} onRetake={() => setPanPhoto(null)} />

          <Divider />
          <TextField id="f-dl_number" label="Driving licence number" optional={!dlRequired} value={form.dl_number} onChange={setField('dl_number')} placeholder="DL number" autoCapitalize="characters" />
          <TextField id="f-dl_expiry" label="Driving licence expiry" optional={!dlRequired} value={form.dl_expiry} onChange={setField('dl_expiry')} type="date" />
          <DocCapture anchorId="anchor-4-dl" title={`Driving licence photo${dlRequired ? ' (required for Runner)' : ' (optional)'}`} photo={dlPhoto} onCapture={blob => setDlPhoto(makeMedia(blob))} onRetake={() => setDlPhoto(null)} />

          <StepperNextBtn onClick={() => setOpenStage(5)} disabled={!stage4Done} label="Review →" />
        </StepperStageBox>

        {/* ── Stage 5 — Review & submit ────────────────────────────────────── */}
        <StepperStageBox active={openStage === 5} title="5 · Review & submit">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ReviewRow label="Name" value={form.full_name.trim()} onEdit={() => jumpTo(1, 'f-full_name')} />
            <ReviewRow label="Phone" value={form.phone.trim()} onEdit={() => jumpTo(1, 'f-phone')} />
            <ReviewRow label="Alt phone" value={form.alt_phone.trim()} onEdit={() => jumpTo(1, 'f-alt_phone')} />
            <ReviewRow label="Email" value={form.email.trim()} onEdit={() => jumpTo(1, 'f-email')} />
            <ReviewRow label="Address" value={[form.address_line.trim(), form.city.trim(), form.pincode.trim()].filter(Boolean).join(', ')} onEdit={() => jumpTo(1, 'f-address_line')} />
            <ReviewRow label="Trade" value={form.trade} onEdit={() => jumpTo(1, 'anchor-1')} />
            <ReviewRow label="Live photo" value={livePhoto ? 'Captured ✓' : ''} onEdit={() => jumpTo(2, 'anchor-2')} />
            <ReviewRow label="Location" value={geo ? `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} (±${Math.round(geo.accuracy)}m)` : ''} onEdit={() => jumpTo(2, 'anchor-2')} />
            <ReviewRow label="Payout" value={s3Summary} onEdit={() => jumpTo(3, 'anchor-3')} />
            <ReviewRow label="Aadhaar" value={isLast4(form.aadhaar_last4) ? `••${form.aadhaar_last4}${aadhaarPhoto ? ' · photo ✓' : ''}` : ''} onEdit={() => jumpTo(4, 'f-aadhaar_last4')} />
            <ReviewRow label="PAN" value={isPAN(form.pan_number) ? `${form.pan_number.toUpperCase()}${panPhoto ? ' · photo ✓' : ''}` : ''} onEdit={() => jumpTo(4, 'f-pan_number')} />
            <ReviewRow label="Licence" value={form.dl_number.trim() ? `${form.dl_number.toUpperCase()}${dlPhoto ? ' · photo ✓' : ''}` : (dlRequired ? '' : 'Not provided')} onEdit={() => jumpTo(4, 'f-dl_number')} />
          </div>

          {!canSubmit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber, #c8963e)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Still missing ({missing.length})</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {missing.map(m => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => jumpTo(m.stage, m.target)}
                    style={{ fontSize: 11, padding: '5px 10px', borderRadius: 12, background: 'rgba(200,150,62,0.14)', border: '1px solid rgba(200,150,62,0.35)', color: 'var(--amber, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, WebkitTapHighlightColor: 'transparent' }}
                  >{m.label} →</button>
                ))}
              </div>
            </div>
          )}

          {submitError && <RedStrip title="Could not submit — nothing was lost, please try again">{submitError}</RedStrip>}

          <BtnPrimary onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? (submitStatus || 'Submitting…') : 'Submit application'}
          </BtnPrimary>
        </StepperStageBox>
       </div>
      </div>
    </Shell>
  )
}

// ── Full-screen shell that covers the app's floating nav (public route) ──────
function Shell({ children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg, #16171f)',
      color: 'var(--text, #e8e8f0)',
      fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 18px', minHeight: 56, flexShrink: 0,
        paddingTop: 'env(safe-area-inset-top)',
        background: 'var(--bg-panel, #1e2028)',
        borderBottom: '1px solid var(--border, #2e3040)',
      }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent, #c8963e)', letterSpacing: '0.04em', fontFamily: 'var(--font-mono, monospace)' }}>FLENT</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>vendor onboarding</span>
      </header>
      {children}
    </div>
  )
}
