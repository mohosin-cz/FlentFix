import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import FlentWordmark from '../components/FlentWordmark'
import { CATEGORIES } from '../utils/assetMeta'
import { DETAIL_FIELDS } from '../utils/assetRequest'
import CaptureUpload from '../components/vendor/CaptureUpload'
import { assetFolder, IMAGE_ONLY } from '../utils/assetFiles'
import RequestStepper from '../components/vendor/RequestStepper'

// The vendor's end of the asset pipeline, on one public link.
//
// Ask for something, watch where it has got to, and once it is deployed fill
// in what you were actually handed. All three live on one page because they
// are one thing from the vendor's side — "the backpack I asked for" — and
// three links to remember would be two too many.
//
// Identity is the email given at onboarding, resolved server-side. Nothing is
// read or written directly: anon has no table access and every call goes
// through a SECURITY DEFINER RPC that checks the vendor is on the roster.

const MONO = 'var(--font-mono, monospace)'

const input = {
  width: '100%', minHeight: 48, padding: '12px 14px', boxSizing: 'border-box',
  background: 'var(--bg-input, #252731)', border: '1px solid transparent',
  borderRadius: 11, color: 'var(--text, #e8e8f0)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
  transition: 'border-color .16s, box-shadow .16s',
}

// A focus ring rather than a permanent outline: the field is defined by its
// fill, and the accent shows up on the one it is actually on.
function Input(props) {
  const [f, setF] = useState(false)
  const { style, ...rest } = props
  return <input {...rest} onFocus={e => { setF(true); rest.onFocus?.(e) }} onBlur={e => { setF(false); rest.onBlur?.(e) }}
    style={{ ...input, ...(f ? { borderColor: 'var(--accent, #c8963e)', boxShadow: '0 0 0 3px rgba(200,150,62,0.10)' } : null), ...style }} />
}

// appearance:none strips the caret, which left the category looking like a
// text box nobody could tell was a dropdown.
function Select({ value, onChange, children, ariaLabel, style }) {
  const [f, setF] = useState(false)
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, ...style }}>
      <select value={value} onChange={onChange} aria-label={ariaLabel}
        onFocus={() => setF(true)} onBlur={() => setF(false)}
        style={{ ...input, appearance: 'none', WebkitAppearance: 'none', paddingRight: 38, cursor: 'pointer',
          ...(f ? { borderColor: 'var(--accent, #c8963e)', boxShadow: '0 0 0 3px rgba(200,150,62,0.10)' } : null) }}>
        {children}
      </select>
      <span aria-hidden="true" style={{ position: 'absolute', right: 15, top: '50%', width: 7, height: 7, marginTop: -5,
        borderRight: '2px solid var(--text-muted, #6b6d82)', borderBottom: '2px solid var(--text-muted, #6b6d82)',
        transform: 'rotate(45deg)', pointerEvents: 'none' }} />
    </div>
  )
}

// One primary button, so "not yet" reads as waiting rather than broken.
function Primary({ children, disabled, ...rest }) {
  return (
    <button {...rest} disabled={disabled}
      style={{
        minHeight: 52, borderRadius: 12, border: 'none', width: '100%',
        background: disabled ? 'rgba(200,150,62,0.16)' : 'var(--accent, #c8963e)',
        color: disabled ? 'rgba(200,150,62,0.55)' : '#1a1408',
        fontSize: 15, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 2px 10px rgba(0,0,0,0.35)',
        transition: 'background .16s, color .16s, box-shadow .16s',
      }}>
      {children}
    </button>
  )
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-sans, Poppins, sans-serif)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '14px 18px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <FlentWordmark height={18} />
        <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>asset requests</span>
      </header>
      <main style={{ flex: 1, width: '100%', maxWidth: 560, margin: '0 auto', padding: '18px 16px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </main>
    </div>
  )
}

function Err({ children }) {
  if (!children) return null
  return (
    <div style={{ padding: '11px 13px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.35)', borderRadius: 10, fontSize: 12.5, color: '#e8697a', fontFamily: MONO, lineHeight: 1.55, wordBreak: 'break-word' }}>
      {children}
    </div>
  )
}

export default function AssetRequest() {
  const [email, setEmail] = useState('')
  const [me, setMe] = useState(null)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  // new request
  const [item, setItem] = useState('')
  const [cat, setCat] = useState('Other')
  const [qty, setQty] = useState('1')
  const [why, setWhy] = useState('')
  const [sent, setSent] = useState(false)

  // logging a deployed item
  const [logging, setLogging] = useState(null)   // request row
  const [serial, setSerial] = useState('')
  const [details, setDetails] = useState({})
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoicePath, setInvoicePath] = useState(null)
  const [photoPath, setPhotoPath] = useState(null)

  const refresh = useCallback(async (addr) => {
    const { data, error } = await supabase.rpc('asset_request_list', { p_email: addr })
    if (error) { setErr(error.message); return }
    setRows(data || [])
  }, [])

  async function signIn(e) {
    e?.preventDefault()
    setErr(''); setBusy('in')
    const { data, error } = await supabase.rpc('asset_request_whoami', { p_email: email.trim() })
    setBusy('')
    if (error) { setErr(error.message); return }
    const v = Array.isArray(data) ? data[0] : data
    if (!v) { setErr('No on-roll vendor found for that email'); return }
    setMe(v)
    refresh(email.trim())
  }

  async function submit(e) {
    e?.preventDefault()
    setErr(''); setBusy('req')
    const { error } = await supabase.rpc('asset_request_create', {
      p_email: email.trim(), p_item_name: item.trim(), p_category: cat,
      p_quantity: Number(qty) || 1, p_reason: why.trim() || null,
    })
    setBusy('')
    if (error) { setErr(error.message); return }
    setItem(''); setWhy(''); setQty('1'); setCat('Other')
    setSent(true); setTimeout(() => setSent(false), 4000)
    refresh(email.trim())
  }

  async function saveLog(e) {
    e?.preventDefault()
    setErr(''); setBusy('log')
    const clean = {}
    for (const [k, v] of Object.entries(details)) if (String(v || '').trim()) clean[k] = String(v).trim()
    // The invoice arguments are only sent when there is an invoice. PostgREST
    // resolves the function by the arguments given, so a four-argument call
    // matches both the old signature and the new one (whose invoice params
    // default to null) — which means logging an item keeps working whether or
    // not the invoice migration has been applied yet.
    const args = {
      p_email: email.trim(), p_request_id: logging.id,
      p_serial: serial.trim() || null, p_details: clean,
    }
    if (invoiceNo.trim()) args.p_invoice_no = invoiceNo.trim()
    if (invoicePath) args.p_invoice_path = invoicePath
    if (photoPath) args.p_photo_path = photoPath

    const { error } = await supabase.rpc('asset_request_log_item', args)
    setBusy('')
    if (error) { setErr(error.message); return }
    setLogging(null); setSerial(''); setDetails({}); setInvoiceNo(''); setInvoicePath(null); setPhotoPath(null)
    refresh(email.trim())
  }

  // ── identify ──────────────────────────────────────────────────────────────
  if (!me) {
    return (
      <Shell>
        <div style={{ fontSize: 19, fontWeight: 700 }}>Request an item</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-dim, #9394a8)', lineHeight: 1.6 }}>
          Enter the email you gave when you joined. You will see anything you have already asked for and where it has got to.
        </div>
        <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Input value={email} onChange={e => setEmail(e.target.value)} type="email" inputMode="email"
            autoCapitalize="none" autoCorrect="off" placeholder="name@example.com" aria-label="Your email" />
          <Err>{err}</Err>
          <Primary type="submit" disabled={busy === 'in' || !email.trim()}>
            {busy === 'in' ? 'Checking…' : 'Continue →'}
          </Primary>
        </form>
      </Shell>
    )
  }

  // ── logging a deployed item ───────────────────────────────────────────────
  if (logging) {
    const fields = DETAIL_FIELDS[logging.category] || DETAIL_FIELDS.Other
    return (
      <Shell>
        <button type="button" onClick={() => { setLogging(null); setErr('') }}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 13, cursor: 'pointer', fontFamily: MONO, padding: 0 }}>‹ back</button>
        <div style={{ fontSize: 19, fontWeight: 700 }}>Log your {logging.item_name.toLowerCase()}</div>
        <div style={{ fontSize: 13, color: 'var(--text-dim, #9394a8)', lineHeight: 1.6 }}>
          Fill in what is written on the item itself. This is what the office will hold against your name.
        </div>
        <form onSubmit={saveLog} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Serial / ID number</span>
            <Input value={serial} onChange={e => setSerial(e.target.value)} placeholder="As printed on the item"
              autoCapitalize="characters" style={{ fontFamily: MONO }} />
          </label>
          {fields.map(f => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{f.label}</span>
              <Input value={details[f.key] || ''} onChange={e => setDetails(d => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder || ''} style={f.mono ? { fontFamily: MONO } : null} />
            </label>
          ))}

          {/* What it actually looks like on the day it changed hands. Worth
              more than any condition dropdown when something is later returned
              scratched and nobody can say whether it arrived that way. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 12, borderTop: '1px solid var(--border, #2e3040)', marginTop: 4 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Photo of the item</span>
            <CaptureUpload supabase={supabase} folder={assetFolder(logging.id)} name="item"
              accept={IMAGE_ONLY} hint="A clear photo of the item as you received it"
              camTitle="Photograph the item" doneLabel="Photo attached"
              value={photoPath} onChange={setPhotoPath} disabled={busy === 'log'} />
          </div>

          {/* The bill that came with it. Optional — an item with no paperwork
              is still worth logging, and blocking on it would just mean the
              details never get entered at all. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 4, borderTop: '1px solid var(--border, #2e3040)', marginTop: 4 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, paddingTop: 8 }}>Invoice / bill <span style={{ textTransform: 'none', letterSpacing: 0 }}>(if you have it)</span></span>
            <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Invoice number" style={{ fontFamily: MONO }} />
            <div style={{ marginTop: 4 }}>
              <CaptureUpload supabase={supabase} folder={assetFolder(logging.id)} name="invoice"
                hint="Photo of the bill, or a PDF" camTitle="Photograph the invoice"
                doneLabel="Invoice attached"
                value={invoicePath} onChange={setInvoicePath} disabled={busy === 'log'} />
            </div>
          </div>

          <Err>{err}</Err>
          <Primary type="submit" disabled={busy === 'log'}>
            {busy === 'log' ? 'Saving…' : 'Save details'}
          </Primary>
        </form>
      </Shell>
    )
  }

  // ── request + track ───────────────────────────────────────────────────────
  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.full_name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{[me.vendor_code, me.trade].filter(Boolean).join(' · ')}</div>
        </div>
        <button type="button" className="tct tct-raised" onClick={() => { setMe(null); setRows([]); setErr('') }}
          style={{ flexShrink: 0, fontSize: 12.5, minHeight: 38, padding: '0 13px', cursor: 'pointer' }}>
          Not you?
        </button>
      </div>

      {/* ask */}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 14px 15px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Ask for something</div>
        <Input value={item} onChange={e => setItem(e.target.value)} placeholder="What do you need? e.g. Two-wheeler, Backpack" aria-label="What do you need" />
        <div style={{ display: 'flex', gap: 9 }}>
          <Select value={cat} onChange={e => setCat(e.target.value)} ariaLabel="Category">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" aria-label="How many"
            style={{ width: 82, flexShrink: 0, fontFamily: MONO, textAlign: 'center' }} />
        </div>
        <Input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why do you need it? (optional)" aria-label="Reason" />
        <Err>{err}</Err>
        {sent && (
          <div style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.32)', fontSize: 12.5, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>
            ✓ Sent — the office will review it.
          </div>
        )}
        <Primary type="submit" disabled={busy === 'req' || !item.trim()}>
          {busy === 'req' ? 'Sending…' : 'Send request'}
        </Primary>
      </form>

      {/* track */}
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>Your requests</div>

      {rows.length === 0 ? (
        <div style={{ padding: '26px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 11, lineHeight: 1.6 }}>
          Nothing yet. Anything you ask for will show here with its progress.
        </div>
      ) : rows.map(r => (
        <div key={r.id} style={{ padding: '13px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>{r.item_name}{r.quantity > 1 ? ` ×${r.quantity}` : ''}</span>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, flexShrink: 0 }}>{r.category}</span>
          </div>

          <RequestStepper status={r.status} row={r} />

          {r.status === 'denied' && r.deny_reason && (
            <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, lineHeight: 1.5 }}>{r.deny_reason}</div>
          )}

          {r.status === 'deployed' && (
            <Primary type="button" onClick={() => { setLogging(r); setErr('') }} style={{ minHeight: 46 }}>
              Log the details →
            </Primary>
          )}

          {r.status === 'logged' && (
            <div style={{ fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>✓ Logged — it is on your record</div>
          )}
        </div>
      ))}
    </Shell>
  )
}
