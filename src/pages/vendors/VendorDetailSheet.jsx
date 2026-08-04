import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { BtnPrimary } from '../../components/ui'
import {
  POD_OPTIONS, signedDocUrl, fmtDate, fmtDateTime, relTime,
  maskAccount, initials, avatarColor, isAdmin,
} from '../../utils/vendorHub'
import { useAuth } from '../../contexts/AuthContext'
import { isEmail } from '../../utils/vendorOnboard'

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
// Suggestions, not closed lists — staff can type a new one.
const COST_CENTRES = ['OPX-FIX', 'OPX-CX']
const TEAMS = ['Setup Ops', 'CX']
const TRADES = ['Carpenter', 'Cleaner', 'Electrician', 'General Help', 'Painter', 'Plumber', 'Supervisor']
const ACCOMMODATION = ['Vendor HQ-1', 'Vendor HQ-2', 'VHQ-2', 'N/A']

const digits = (v) => (v || '').replace(/\D/g, '')
const required = (label) => (v) => v.trim() ? null : `${label} can't be empty.`
const phoneRule = (v) => !v ? null : (digits(v).length === 10 ? null : 'Phone should be 10 digits.')
const rules = {
  phone: (v) => v.trim() ? phoneRule(v) : "Phone can't be empty.",
  altPhone: phoneRule,
  pincode: (v) => !v || /^\d{6}$/.test(v) ? null : 'Pincode should be 6 digits.',
  pan: (v) => !v || /^[A-Za-z]{5}\d{4}[A-Za-z]$/.test(v) ? null : 'PAN looks wrong (e.g. ABCDE1234F).',
  aadhaar4: (v) => !v || /^\d{4}$/.test(v) ? null : 'Enter just the last 4 digits.',
  ifsc: (v) => !v || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v) ? null : 'IFSC looks wrong (e.g. HDFC0001234).',
}

const cleanAmount = (v) => (v || '').replace(/[₹,\s]/g, '')
const rateRule = (v) => {
  const c = cleanAmount(v)
  if (c === '') return null
  if (!/^\d+(\.\d+)?$/.test(c)) return 'Enter a number, e.g. 22000.'
  if (Number(c) <= 0) return 'Rate must be more than 0.'
  if (Number(c) > 1000000) return 'That looks too high — check the figure.'
  return null
}

// The whole record, declared once. Rendering, validation, the draft and the
// saved patch all read from this, so a new column is one entry here.
const SECTIONS = [
  { title: 'Identity', fields: [
    { name: 'full_name', label: 'Full name', placeholder: 'As on the Aadhaar', validate: required('Name') },
    { name: 'trade', label: 'Trade', suggestions: TRADES, placeholder: 'e.g. Cleaner', validate: required('Trade') },
    { name: 'date_of_birth', label: 'Date of birth', type: 'date', display: fmtDate },
    { name: 'date_of_joining', label: 'Joined', type: 'date', display: fmtDate },
    { name: 'father_name', label: 'Father' },
    { name: 'mother_name', label: 'Mother' },
  ] },
  { title: 'Contact', fields: [
    { name: 'phone', label: 'Phone', inputMode: 'tel', placeholder: '10-digit mobile', validate: rules.phone },
    { name: 'alt_phone', label: 'Alt phone', inputMode: 'tel', validate: rules.altPhone },
    { name: 'guardian_phone', label: 'Guardian', inputMode: 'tel', validate: rules.altPhone },
    { name: 'email', label: 'Email', type: 'email', placeholder: 'name@example.com',
      parse: v => v.toLowerCase() || null,
      validate: v => !v || isEmail(v.toLowerCase()) ? null : 'Enter a valid email address.' },
    { name: 'address_line', label: 'Address', placeholder: 'House, street, area' },
    { name: 'city', label: 'City' },
    { name: 'pincode', label: 'Pincode', inputMode: 'numeric', validate: rules.pincode },
    { name: 'permanent_address', label: 'Permanent', placeholder: 'Home-town address' },
  ] },
  { title: 'Payout setup', kind: 'payout', fields: [
    { name: 'monthly_rate', label: 'Monthly rate', inputMode: 'decimal', placeholder: 'e.g. 22000',
      display: v => `${money(v)} / month`,
      parse: v => cleanAmount(v) === '' ? null : Number(cleanAmount(v)), validate: rateRule },
    { name: 'cost_centre', label: 'Cost centre', suggestions: COST_CENTRES, placeholder: 'e.g. OPX-FIX' },
    { name: 'team', label: 'Team', suggestions: TEAMS, placeholder: 'e.g. Setup Ops' },
    { name: 'flent_accommodation', label: 'Accommodation', suggestions: ACCOMMODATION, placeholder: 'e.g. Vendor HQ-1' },
  ] },
  { title: 'Payment method', kind: 'payment', fields: [
    { name: 'bank_account_name', label: 'Acct name', placeholder: 'As printed on the passbook' },
    { name: 'bank_account_no', label: 'Account no.', placeholder: 'Account number', secret: true },
    { name: 'bank_ifsc', label: 'IFSC', placeholder: 'HDFC0001234',
      parse: v => v.toUpperCase() || null, validate: rules.ifsc },
    { name: 'upi_id', label: 'UPI ID', placeholder: 'name@bank' },
  ] },
  { title: 'Identity documents', kind: 'docs', fields: [
    { name: 'aadhaar_last4', label: 'Aadhaar', inputMode: 'numeric', placeholder: 'Last 4 digits only',
      display: v => `•••• •••• ${v}`, validate: rules.aadhaar4 },
    { name: 'pan_number', label: 'PAN', placeholder: 'ABCDE1234F',
      parse: v => v.toUpperCase() || null, validate: rules.pan },
    { name: 'dl_number', label: 'Licence', placeholder: 'DL number' },
    { name: 'dl_expiry', label: 'DL expiry', type: 'date', display: fmtDate },
  ] },
  { title: 'Notes', fields: [
    { name: 'notes', label: 'Notes', placeholder: 'Anything the team should know' },
  ] },
]
const ALL_FIELDS = SECTIONS.flatMap(s => s.fields)

// ── one row of the record ───────────────────────────────────────────────────
// Read-only until the card as a whole is put into edit mode, so the sheet stays
// readable and a whole record is saved in one write.
function Field({ f, value, editing, draft, error, onChange, children }) {
  const filled = value != null && value !== ''
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', minWidth: 96, flexShrink: 0, paddingTop: editing ? 9 : 1 }}>{f.label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
              value={draft}
              onChange={e => onChange(f.name, e.target.value)}
              placeholder={f.placeholder}
              type={f.type || 'text'}
              inputMode={f.inputMode}
              list={f.suggestions ? `dl-${f.name}` : undefined}
              autoCapitalize={f.type === 'email' ? 'off' : undefined}
              autoCorrect={f.type === 'email' ? 'off' : undefined}
              style={{ width: '100%', padding: '8px 10px', fontSize: 14, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', borderRadius: 7, outline: 'none', fontFamily: 'inherit',
                border: `1px solid ${error ? 'var(--red, #e05c6a)' : 'var(--border, #2e3040)'}` }} />
            {f.suggestions && <datalist id={`dl-${f.name}`}>{f.suggestions.map(o => <option key={o} value={o} />)}</datalist>}
            {error && <span style={{ fontSize: 11, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>{error}</span>}
          </div>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: filled ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', wordBreak: 'break-word' }}>
              {filled ? (f.display ? f.display(value) : value) : 'Not provided'}
            </span>
            {children}
          </span>
        )}
      </div>
    </div>
  )
}

// ── POD picker ──────────────────────────────────────────────────────────────
// The three built-ins plus every POD already in use, so a name typed once is
// one tap for the next vendor rather than being retyped.
function PodPicker({ value, options, onChange, disabled }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const chip = (on) => `tct tct-raised${on ? ' is-on' : ''}`
  const chipStyle = { padding: '8px 13px', fontSize: 12.5, borderRadius: 16, flexShrink: 0 }

  function commit() {
    const n = name.trim()
    if (!n) { setAdding(false); return }
    onChange(n)
    setName(''); setAdding(false)
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {options.map(p => (
        <button key={p} type="button" disabled={disabled} onClick={() => onChange(p)}
          aria-pressed={value === p} className={chip(value === p)} style={chipStyle}>{p}</button>
      ))}
      {adding ? (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="POD name"
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setAdding(false); setName('') } }}
            style={{ width: 130, padding: '7px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--accent, #c8963e)', borderRadius: 16, outline: 'none', fontFamily: 'inherit' }} />
          <button type="button" onClick={commit} style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 6, padding: '6px 11px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>add</button>
          <button type="button" onClick={() => { setAdding(false); setName('') }} style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: '6px 9px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>cancel</button>
        </span>
      ) : (
        <button type="button" disabled={disabled} onClick={() => setAdding(true)} className="tct tct-raised"
          style={{ ...chipStyle, color: 'var(--accent, #c8963e)' }}>+ New POD</button>
      )}
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

// ── inline warning strip ────────────────────────────────────────────────────
function Warn({ tone, children }) {
  const c = tone === 'red' ? '224,92,106' : '200,150,62'
  return (
    <div style={{ display: 'flex', gap: 9, padding: '9px 11px', marginTop: 6, background: `rgba(${c},0.10)`, border: `1px solid rgba(${c},0.32)`, borderRadius: 8 }}>
      <span style={{ fontSize: 13, lineHeight: 1.3 }}>⚠</span>
      <span style={{ fontSize: 11.5, color: tone === 'red' ? 'var(--red, #e05c6a)' : 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5 }}>{children}</span>
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

export default function VendorDetailSheet({ vendor, onClose, onOnboarded, onUpdated, knownPods = [] }) {
  const [row, setRow] = useState(vendor)
  const [docs, setDocs] = useState({})
  const [revealAcct, setRevealAcct] = useState(false)
  const [busy, setBusy] = useState('')       // 'pod' | 'onboard' | 'remove' | ''
  const [err, setErr] = useState('')
  const [done, setDone] = useState(null)     // assigned vendor_code after onboarding
  const [pending, setPending] = useState('')   // '' | 'archive' | 'remove'
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [errors, setErrors] = useState({})

  const { session } = useAuth()
  const admin = isAdmin(session?.user?.email)
  const removed  = row.status === 'exited'
  const archived = row.status === 'archived'

  // built-ins + every POD in use + whatever this vendor already has, so a custom
  // name survives a reopen instead of vanishing back into "+ New POD"
  const podOptions = Array.from(new Set([
    ...POD_OPTIONS.filter(p => p !== 'Unassigned'),
    ...knownPods,
    ...(row.pod ? [row.pod] : []),
    'Unassigned',
  ]))

  async function removeVendor() {
    setBusy('remove'); setErr('')
    const { data, error } = await supabase.rpc('remove_vendor', { p_vendor_id: row.id, p_reason: reason })
    setBusy('')
    if (error) { setErr(error.message); return }
    setRow(data); setPending(''); setReason('')
    onUpdated && onUpdated()
  }

  async function archiveVendor() {
    setBusy('remove'); setErr('')
    const { data, error } = await supabase.rpc('archive_vendor', { p_vendor_id: row.id, p_reason: reason })
    setBusy('')
    if (error) { setErr(error.message); return }
    setRow(data); setPending(''); setReason('')
    onUpdated && onUpdated()
  }

  async function unarchiveVendor() {
    setBusy('remove'); setErr('')
    const { data, error } = await supabase.rpc('unarchive_vendor', { p_vendor_id: row.id })
    setBusy('')
    if (error) { setErr(error.message); return }
    setRow(data)
    onUpdated && onUpdated()
  }

  async function restoreVendor() {
    setBusy('remove'); setErr('')
    const { data, error } = await supabase.rpc('restore_vendor', { p_vendor_id: row.id })
    setBusy('')
    if (error) { setErr(error.message); return }
    setRow(data)
    onUpdated && onUpdated()
  }

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

  const toDraft = (r) => Object.fromEntries(ALL_FIELDS.map(f => [f.name, r[f.name] == null ? '' : String(r[f.name])]))

  function startEdit() { setDraft(toDraft(row)); setErrors({}); setErr(''); setEditing(true) }
  function cancelEdit() { setEditing(false); setDraft({}); setErrors({}); setErr('') }
  const onDraftChange = (name, v) => {
    setDraft(d => ({ ...d, [name]: v }))
    setErrors(e => e[name] ? { ...e, [name]: null } : e)   // clear as they fix it
  }

  // Validate everything, then write only what actually changed — one round trip
  // for the whole card instead of one per field.
  async function saveAll() {
    const errs = {}
    for (const f of ALL_FIELDS) {
      const msg = f.validate ? f.validate((draft[f.name] ?? '').trim()) : null
      if (msg) errs[f.name] = msg
    }
    if (Object.keys(errs).length) { setErrors(errs); setErr('Some fields need fixing.'); return }

    const patch = {}
    for (const f of ALL_FIELDS) {
      const raw = (draft[f.name] ?? '').trim()
      const next = f.parse ? f.parse(raw) : (raw || null)
      const cur = row[f.name] ?? null
      if (String(next ?? '') !== String(cur ?? '')) patch[f.name] = next
    }
    if (!Object.keys(patch).length) { cancelEdit(); return }

    setBusy('save'); setErr('')
    const { error } = await supabase.from('vendors').update(patch).eq('id', row.id)
    setBusy('')
    if (error) { setErr(error.message); return }
    setRow(r => ({ ...r, ...patch }))
    setEditing(false); setDraft({}); setErrors({})
    onUpdated && onUpdated()
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
              {removed && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.35)', borderRadius: 6, padding: '1px 8px', fontFamily: 'var(--font-mono, monospace)' }}>REMOVED</span>}
              {row.pod && <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{row.pod}</span>}
              <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{relTime(row.submitted_at)}</span>
            </div>
          </div>
          {editing ? (
            <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
              <button type="button" onClick={saveAll} disabled={busy === 'save'}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent, #c8963e)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy === 'save' ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                {busy === 'save' ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={cancelEdit}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button type="button" onClick={startEdit}
                style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                ✎ Edit
              </button>
              <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
            </>
          )}
        </div>

        {/* body */}
        <div style={{ overflowY: 'auto', padding: '14px 18px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {SECTIONS.map(sec => (
            <Card key={sec.title} title={sec.title}>
              {sec.kind === 'payout' && !row.monthly_rate && (
                <Warn tone="amber">No monthly rate — {row.full_name.split(' ')[0]} will be generated into payroll at ₹0 until one is set.</Warn>
              )}
              {sec.kind === 'payment' && !hasBank && !row.upi_id && (
                <Warn tone="red">Neither bank details nor UPI — there is no way to pay this vendor.</Warn>
              )}
              {sec.fields.map(f => (
                <Field
                  key={f.name}
                  f={f}
                  value={f.secret && !revealAcct && !editing ? maskAccount(row[f.name]) : row[f.name]}
                  editing={editing}
                  draft={draft[f.name] ?? ''}
                  error={errors[f.name]}
                  onChange={onDraftChange}
                >
                  {f.secret && !editing && row[f.name] && (
                    <button type="button" onClick={() => setRevealAcct(v => !v)} style={{ fontSize: 10, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{revealAcct ? 'hide' : 'reveal'}</button>
                  )}
                </Field>
              ))}
              {sec.kind === 'docs' && (
                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                  <DocThumb label="Aadhaar" doc={docs.aadhaar} />
                  <DocThumb label="PAN" doc={docs.pan} />
                  <DocThumb label="Licence" doc={docs.dl} />
                </div>
              )}
            </Card>
          ))}

          <Card title="Live capture">
            <LocationCard lat={row.capture_lat} lng={row.capture_lng} accuracy={row.capture_accuracy} at={row.capture_at} />
          </Card>
        </div>

        {/* footer: assign POD + onboard */}
        <div style={{ borderTop: '1px solid var(--border, #2e3040)', padding: '12px 18px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))', flexShrink: 0, display: editing ? 'none' : 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-panel, #1e2028)' }}>
          {err && <ErrStrip>{err}</ErrStrip>}

          {archived ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>🗄</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent, #c8963e)' }}>Archived{row.archived_at ? ` · ${fmtDate(row.archived_at)}` : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word' }}>
                    {row.archived_by || '—'}{row.archive_reason ? ` · ${row.archive_reason}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5 }}>
                Still on the books, just not active — payroll skips them while archived. Bring them back any time.
              </div>
              <button type="button" onClick={unarchiveVendor} disabled={busy === 'remove'}
                style={{ width: '100%', minHeight: 46, borderRadius: 10, border: '1px solid var(--green, #3dba7a)', background: 'rgba(61,186,122,0.10)', color: 'var(--green, #3dba7a)', fontSize: 14, fontWeight: 700, cursor: busy === 'remove' ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                {busy === 'remove' ? 'Returning…' : 'Return to roster'}
              </button>
            </>
          ) : removed ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.35)', borderRadius: 10 }}>
                <span style={{ fontSize: 20 }}>⦸</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red, #e05c6a)' }}>Removed from on-roll{row.exited_at ? ` · ${fmtDate(row.exited_at)}` : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word' }}>
                    {row.exited_by || '—'}{row.exit_reason ? ` · ${row.exit_reason}` : ''}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5 }}>
                History is kept — attendance, payouts and documents are untouched. Payroll no longer generates a line.
              </div>
              {admin && (
                <button type="button" onClick={restoreVendor} disabled={busy === 'remove'}
                  style={{ width: '100%', minHeight: 46, borderRadius: 10, border: '1px solid var(--green, #3dba7a)', background: 'rgba(61,186,122,0.10)', color: 'var(--green, #3dba7a)', fontSize: 14, fontWeight: 700, cursor: busy === 'remove' ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                  {busy === 'remove' ? 'Restoring…' : 'Put back on roll'}
                </button>
              )}
            </>
          ) : onboardedCode ? (
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
                <PodPicker options={podOptions} value={row.pod || 'Unassigned'} onChange={assignPod} disabled={busy === 'pod'} />
              </div>
              {done && <BtnPrimary onClick={onOnboarded}>Done</BtnPrimary>}

              {!done && (pending ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '12px 13px', borderRadius: 10,
                  background: pending === 'remove' ? 'rgba(224,92,106,0.07)' : 'rgba(200,150,62,0.07)',
                  border: `1px solid ${pending === 'remove' ? 'rgba(224,92,106,0.30)' : 'rgba(200,150,62,0.32)'}` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: pending === 'remove' ? 'var(--red, #e05c6a)' : 'var(--accent, #c8963e)' }}>
                    {pending === 'remove'
                      ? `Remove ${row.full_name.split(' ')[0]} from the on-roll list?`
                      : `Archive ${row.full_name.split(' ')[0]}?`}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5, fontFamily: 'var(--font-mono, monospace)' }}>
                    {pending === 'remove'
                      ? 'For someone who has left. They come off the roster and payroll stops generating a line. Nothing is deleted, and you can put them back.'
                      : 'For someone still employed but not currently working — long leave, seasonal, between sites. They come off the roster and payroll skips them until you bring them back.'}
                  </div>
                  <input value={reason} onChange={e => setReason(e.target.value)}
                    placeholder={pending === 'remove' ? 'Reason (optional) — e.g. left the company' : 'Reason (optional) — e.g. on long leave'}
                    style={{ padding: '8px 10px', fontSize: 14, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={pending === 'remove' ? removeVendor : archiveVendor} disabled={busy === 'remove'}
                      style={{ flex: 1, minHeight: 42, borderRadius: 8, border: 'none', background: pending === 'remove' ? 'var(--red, #e05c6a)' : 'var(--accent, #c8963e)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy === 'remove' ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                      {busy === 'remove' ? 'Working…' : pending === 'remove' ? 'Yes, remove' : 'Yes, archive'}
                    </button>
                    <button type="button" onClick={() => { setPending(''); setReason(''); setErr('') }}
                      style={{ flex: 1, minHeight: 42, borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setPending('archive')}
                    style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                    🗄 Archive
                  </button>
                  {admin && (
                    <button type="button" onClick={() => setPending('remove')}
                      style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--red, #e05c6a)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                      Remove from on-roll
                    </button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assign POD (optional)</span>
                <PodPicker options={podOptions} value={row.pod || 'Unassigned'} onChange={assignPod} disabled={busy === 'pod'} />
              </div>
              {!row.monthly_rate && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.32)', borderRadius: 9 }}>
                  <span style={{ fontSize: 15 }}>⚠</span>
                  <span style={{ flex: 1, fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.45 }}>
                    No monthly rate set — payroll will generate ₹0 for this vendor.
                  </span>
                </div>
              )}
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
