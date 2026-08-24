import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import FlentWordmark from '../components/FlentWordmark'
import { CATEGORIES } from '../utils/assetMeta'
import { STAGES, stageIndex, DETAIL_FIELDS } from '../utils/assetRequest'

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
  width: '100%', minHeight: 46, padding: '11px 13px', boxSizing: 'border-box',
  background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
  borderRadius: 10, color: 'var(--text, #e8e8f0)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
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

// Where the request has got to, as a rail the vendor can read at a glance.
function StatusRail({ status }) {
  if (status === 'denied') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 9, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)' }}>
        <span style={{ fontSize: 14 }}>✕</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Not approved</span>
      </div>
    )
  }
  const at = stageIndex(status)
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      {STAGES.map((s, i) => {
        const done = i <= at
        const current = i === at
        return (
          <div key={s.key} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ height: 4, borderRadius: 2, background: done ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)', marginInlineEnd: i === STAGES.length - 1 ? 0 : 3 }} />
            <span style={{ fontSize: 9.5, lineHeight: 1.3, fontFamily: MONO, color: current ? 'var(--accent, #c8963e)' : done ? 'var(--text-dim, #9394a8)' : 'var(--text-muted, #6b6d82)', fontWeight: current ? 700 : 500 }}>
              {s.short}
            </span>
          </div>
        )
      })}
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
    const { error } = await supabase.rpc('asset_request_log_item', {
      p_email: email.trim(), p_request_id: logging.id,
      p_serial: serial.trim() || null, p_details: clean,
    })
    setBusy('')
    if (error) { setErr(error.message); return }
    setLogging(null); setSerial(''); setDetails({})
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
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" inputMode="email"
            autoCapitalize="none" autoCorrect="off" placeholder="name@example.com" aria-label="Your email" style={input} />
          <Err>{err}</Err>
          <button type="submit" disabled={busy === 'in' || !email.trim()}
            style={{ minHeight: 50, borderRadius: 11, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
            {busy === 'in' ? 'Checking…' : 'Continue →'}
          </button>
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
            <input value={serial} onChange={e => setSerial(e.target.value)} placeholder="As printed on the item"
              autoCapitalize="characters" style={{ ...input, fontFamily: MONO }} />
          </label>
          {fields.map(f => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{f.label}</span>
              <input value={details[f.key] || ''} onChange={e => setDetails(d => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder || ''} style={f.mono ? { ...input, fontFamily: MONO } : input} />
            </label>
          ))}
          <Err>{err}</Err>
          <button type="submit" disabled={busy === 'log'}
            style={{ minHeight: 50, borderRadius: 11, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
            {busy === 'log' ? 'Saving…' : 'Save details'}
          </button>
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
        <button type="button" onClick={() => { setMe(null); setRows([]); setErr('') }}
          style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', minHeight: 36, padding: '0 11px', fontFamily: MONO }}>
          Not you?
        </button>
      </div>

      {/* ask */}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 14px 15px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Ask for something</div>
        <input value={item} onChange={e => setItem(e.target.value)} placeholder="What do you need? e.g. Two-wheeler, Backpack" aria-label="What do you need" style={input} />
        <div style={{ display: 'flex', gap: 9 }}>
          <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Category" style={{ ...input, flex: 1, appearance: 'none' }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" aria-label="How many"
            style={{ ...input, width: 78, flexShrink: 0, fontFamily: MONO, textAlign: 'center' }} />
        </div>
        <input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why do you need it? (optional)" aria-label="Reason" style={input} />
        <Err>{err}</Err>
        {sent && (
          <div style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.32)', fontSize: 12.5, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>
            ✓ Sent — the office will review it.
          </div>
        )}
        <button type="submit" disabled={busy === 'req' || !item.trim()}
          style={{ minHeight: 48, borderRadius: 11, border: 'none', background: item.trim() ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)', color: item.trim() ? '#1a1408' : 'var(--text-muted, #6b6d82)', fontSize: 14.5, fontWeight: 700, cursor: item.trim() ? 'pointer' : 'not-allowed', fontFamily: MONO }}>
          {busy === 'req' ? 'Sending…' : 'Send request'}
        </button>
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

          <StatusRail status={r.status} />

          {r.status === 'denied' && r.deny_reason && (
            <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, lineHeight: 1.5 }}>{r.deny_reason}</div>
          )}

          {r.status === 'deployed' && (
            <button type="button" onClick={() => { setLogging(r); setErr('') }}
              style={{ minHeight: 46, borderRadius: 10, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>
              Log the details →
            </button>
          )}

          {r.status === 'logged' && (
            <div style={{ fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>✓ Logged — it is on your record</div>
          )}
        </div>
      ))}
    </Shell>
  )
}
