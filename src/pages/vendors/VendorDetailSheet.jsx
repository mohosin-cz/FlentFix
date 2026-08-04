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
}

// ── inline-editable row ─────────────────────────────────────────────────────
// Staff fix what the vendor typed (email for attendance OTP) and add what the
// public form deliberately never asks for (rate, cost centre, team) — see the
// Payout setup card. `display` renders the saved value; `children` may add a
// control next to it (the account-number reveal).
let editRowSeq = 0
function EditRow({ label, value, onSave, placeholder, type = 'text', inputMode, suggestions, display, children, addLabel = 'add' }) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(value == null ? '' : String(value))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [listId] = useState(() => `er-${++editRowSeq}`)

  async function save() {
    setBusy(true); setErr('')
    const e = await onSave(input)
    setBusy(false)
    if (e) setErr(e); else setEditing(false)
  }
  const filled = value != null && value !== ''

  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', minWidth: 96, flexShrink: 0, paddingTop: 1 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setErr(''); setInput(value == null ? '' : String(value)) } }}
                placeholder={placeholder}
                type={type}
                inputMode={inputMode || (type === 'number' ? 'decimal' : type === 'email' ? 'email' : undefined)}
                autoCapitalize={type === 'email' ? 'off' : undefined}
                autoCorrect={type === 'email' ? 'off' : undefined}
                list={suggestions ? listId : undefined}
                autoFocus
                style={{ flex: 1, minWidth: 0, padding: '7px 10px', fontSize: 14, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit' }} />
              {suggestions && <datalist id={listId}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>}
              <button type="button" onClick={save} disabled={busy} style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 6, padding: '0 12px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{busy ? '…' : 'save'}</button>
              <button type="button" onClick={() => { setEditing(false); setErr(''); setInput(value == null ? '' : String(value)) }} style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: '0 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>cancel</button>
            </div>
            {err && <span style={{ fontSize: 11, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>{err}</span>}
          </div>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: filled ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', wordBreak: 'break-word' }}>
              {filled ? (display ? display(value) : value) : 'Not provided'}
            </span>
            {children}
            <button type="button" onClick={() => { setInput(value == null ? '' : String(value)); setEditing(true) }} style={{ fontSize: 10, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{filled ? 'edit' : addLabel}</button>
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
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')

  const { session } = useAuth()
  const admin = isAdmin(session?.user?.email)
  const removed = row.status === 'exited'

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
    setRow(data); setConfirming(false); setReason('')
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

  // One writer for every inline edit. `parse` turns the raw input into the
  // column value (null clears it); `validate` returns an error string or null.
  const saveField = (field, { parse, validate } = {}) => async (next) => {
    const raw = (next ?? '').trim()
    const msg = validate ? validate(raw) : null
    if (msg) return msg
    const value = parse ? parse(raw) : (raw || null)
    const { error } = await supabase.from('vendors').update({ [field]: value }).eq('id', row.id)
    if (error) return error.message
    setRow(r => ({ ...r, [field]: value }))
    onUpdated && onUpdated()
    return null
  }

  const saveEmail = saveField('email', {
    parse: v => v.toLowerCase(),
    validate: v => isEmail(v.toLowerCase()) ? null : 'Enter a valid email address.',
  })
  // Kept as a text input on purpose: a number input silently yields '' for
  // "₹19,500", which would read as "clear the rate" instead of an error.
  const cleanAmount = v => (v || '').replace(/[₹,\s]/g, '')
  const saveRate = saveField('monthly_rate', {
    parse: v => cleanAmount(v) === '' ? null : Number(cleanAmount(v)),
    validate: v => {
      const c = cleanAmount(v)
      if (c === '') return null                       // clearing is allowed
      if (!/^\d+(\.\d+)?$/.test(c)) return 'Enter a number, e.g. 22000.'
      if (Number(c) <= 0) return 'Rate must be more than 0.'
      if (Number(c) > 1000000) return 'That looks too high — check the figure.'
      return null
    },
  })
  const saveIfsc = saveField('bank_ifsc', {
    parse: v => v.toUpperCase(),
    validate: v => (!v || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(v)) ? null : 'IFSC looks wrong (e.g. HDFC0001234).',
  })

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
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>

        {/* body */}
        <div style={{ overflowY: 'auto', padding: '14px 18px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card title="Identity">
            <EditRow label="Full name" value={row.full_name} onSave={saveField('full_name', { validate: required('Name') })} placeholder="As on the Aadhaar" />
            <EditRow label="Trade" value={row.trade} onSave={saveField('trade', { validate: required('Trade') })} suggestions={TRADES} placeholder="e.g. Cleaner" />
            <EditRow label="Date of birth" value={row.date_of_birth} onSave={saveField('date_of_birth')} type="date" display={fmtDate} />
            <EditRow label="Joined" value={row.date_of_joining} onSave={saveField('date_of_joining')} type="date" display={fmtDate} />
            <EditRow label="Father" value={row.father_name} onSave={saveField('father_name')} />
            <EditRow label="Mother" value={row.mother_name} onSave={saveField('mother_name')} />
          </Card>

          <Card title="Contact">
            <EditRow label="Phone" value={row.phone} onSave={saveField('phone', { validate: rules.phone })} inputMode="tel" placeholder="10-digit mobile" />
            <EditRow label="Alt phone" value={row.alt_phone} onSave={saveField('alt_phone', { validate: rules.altPhone })} inputMode="tel" />
            <EditRow label="Guardian" value={row.guardian_phone} onSave={saveField('guardian_phone', { validate: rules.altPhone })} inputMode="tel" />
            <EditRow label="Email" value={row.email} onSave={saveEmail} type="email" placeholder="name@example.com" />
            <EditRow label="Address" value={row.address_line} onSave={saveField('address_line')} placeholder="House, street, area" />
            <EditRow label="City" value={row.city} onSave={saveField('city')} />
            <EditRow label="Pincode" value={row.pincode} onSave={saveField('pincode', { validate: rules.pincode })} inputMode="numeric" />
            <EditRow label="Permanent" value={row.permanent_address} onSave={saveField('permanent_address')} placeholder="Home-town address" />
          </Card>

          {/* Payout setup — the commercial terms the public form never asks for.
              Set here at verification, otherwise payroll has nothing to compute. */}
          <Card title="Payout setup">
            {!row.monthly_rate && (
              <div style={{ display: 'flex', gap: 9, padding: '9px 11px', marginTop: 6, background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.32)', borderRadius: 8 }}>
                <span style={{ fontSize: 13, lineHeight: 1.3 }}>⚠</span>
                <span style={{ fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5 }}>
                  No monthly rate — {row.full_name.split(' ')[0]} will be generated into payroll at ₹0 until one is set.
                </span>
              </div>
            )}
            <EditRow label="Monthly rate" value={row.monthly_rate} onSave={saveRate} inputMode="decimal"
              placeholder="e.g. 22000" addLabel="set" display={v => `${money(v)} / month`} />
            <EditRow label="Cost centre" value={row.cost_centre} onSave={saveField('cost_centre')}
              placeholder="e.g. OPX-FIX" suggestions={COST_CENTRES} />
            <EditRow label="Team" value={row.team} onSave={saveField('team')}
              placeholder="e.g. Setup Ops" suggestions={TEAMS} />
            <EditRow label="Accommodation" value={row.flent_accommodation} onSave={saveField('flent_accommodation')}
              placeholder="e.g. Vendor HQ-1" suggestions={ACCOMMODATION} />
          </Card>

          <Card title="Payment method">
            {!hasBank && !row.upi_id && (
              <div style={{ display: 'flex', gap: 9, padding: '9px 11px', marginTop: 6, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8 }}>
                <span style={{ fontSize: 13, lineHeight: 1.3 }}>⚠</span>
                <span style={{ fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5 }}>
                  Neither bank details nor UPI — there is no way to pay this vendor.
                </span>
              </div>
            )}
            <EditRow label="Acct name" value={row.bank_account_name} onSave={saveField('bank_account_name')} placeholder="As printed on the passbook" />
            <EditRow label="Account no." value={row.bank_account_no} onSave={saveField('bank_account_no')} placeholder="Account number"
              display={v => revealAcct ? v : maskAccount(v)}>
              {row.bank_account_no && (
                <button type="button" onClick={() => setRevealAcct(v => !v)} style={{ fontSize: 10, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{revealAcct ? 'hide' : 'reveal'}</button>
              )}
            </EditRow>
            <EditRow label="IFSC" value={row.bank_ifsc} onSave={saveIfsc} placeholder="HDFC0001234" />
            <EditRow label="UPI ID" value={row.upi_id} onSave={saveField('upi_id')} placeholder="name@bank" />
          </Card>

          <Card title="Identity documents">
            <EditRow label="Aadhaar" value={row.aadhaar_last4} onSave={saveField('aadhaar_last4', { validate: rules.aadhaar4 })}
              inputMode="numeric" placeholder="Last 4 digits only" display={v => `•••• •••• ${v}`} />
            <EditRow label="PAN" value={row.pan_number} onSave={saveField('pan_number', { parse: v => v.toUpperCase() || null, validate: rules.pan })}
              placeholder="ABCDE1234F" />
            <EditRow label="Licence" value={row.dl_number} onSave={saveField('dl_number')} placeholder="DL number" />
            <EditRow label="DL expiry" value={row.dl_expiry} onSave={saveField('dl_expiry')} type="date" display={fmtDate} />
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <DocThumb label="Aadhaar" doc={docs.aadhaar} />
              <DocThumb label="PAN" doc={docs.pan} />
              <DocThumb label="Licence" doc={docs.dl} />
            </div>
          </Card>

          <Card title="Notes">
            <EditRow label="Notes" value={row.notes} onSave={saveField('notes')} placeholder="Anything the team should know" addLabel="add" />
          </Card>

          <Card title="Live capture">
            <LocationCard lat={row.capture_lat} lng={row.capture_lng} accuracy={row.capture_accuracy} at={row.capture_at} />
          </Card>
        </div>

        {/* footer: assign POD + onboard */}
        <div style={{ borderTop: '1px solid var(--border, #2e3040)', padding: '12px 18px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-panel, #1e2028)' }}>
          {err && <ErrStrip>{err}</ErrStrip>}

          {removed ? (
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

              {admin && !done && (confirming ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '12px 13px', background: 'rgba(224,92,106,0.07)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--red, #e05c6a)' }}>Remove {row.full_name.split(' ')[0]} from the on-roll list?</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5, fontFamily: 'var(--font-mono, monospace)' }}>
                    They stop appearing on the roster and payroll stops generating a line for them. Nothing is deleted, and you can put them back.
                  </div>
                  <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional) — e.g. left the company"
                    style={{ padding: '8px 10px', fontSize: 14, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={removeVendor} disabled={busy === 'remove'}
                      style={{ flex: 1, minHeight: 42, borderRadius: 8, border: 'none', background: 'var(--red, #e05c6a)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy === 'remove' ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                      {busy === 'remove' ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button type="button" onClick={() => { setConfirming(false); setReason(''); setErr('') }}
                      style={{ flex: 1, minHeight: 42, borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirming(true)}
                  style={{ alignSelf: 'flex-start', padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--red, #e05c6a)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                  Remove from on-roll
                </button>
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
