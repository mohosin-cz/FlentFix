import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

// One vendor's portal password, on their own profile.
//
// It belongs here rather than on a payroll screen: it is a property of this
// person, and the moment you need it is the moment you are looking at them —
// they have rung up unable to sign in.
//
// Masked by default. Someone else is usually looking at the same screen during
// a handover, and a credential sitting in plain view on a profile is the kind
// of thing that gets photographed.

const MONO = 'var(--font-mono, monospace)'

const btn = {
  minHeight: 40, padding: '0 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  fontFamily: MONO, cursor: 'pointer', border: '1px solid var(--border, #2e3040)',
  background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)',
  display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
}

export default function PortalPasswordCard({ vendor }) {
  const [pw, setPw] = useState(null)          // stored plaintext, if any
  const [setAt, setSetAt] = useState(vendor.portal_password_set_at || null)
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [legacy, setLegacy] = useState(false)  // hash exists but no readable copy

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('vendor_portal_credentials')
      .select('password_plain, updated_at')
      .eq('vendor_id', vendor.id).maybeSingle()
    if (error) {
      // Table not there yet — the feature simply isn't switched on.
      if (/schema cache|does not exist|relation/i.test(error.message || '')) { setLegacy(true); return }
      setErr(error.message); return
    }
    setPw(data?.password_plain || null)
  }, [vendor.id])

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  async function issue(custom) {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('vendor_set_portal_password', {
      p_vendor_id: vendor.id, p_password: custom || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setPw(data); setSetAt(new Date().toISOString())
    setShown(true); setEditing(false); setDraft(''); setLegacy(false)
  }

  const message = pw
    ? `Flent vendor portal\nEmail: ${vendor.email}\nPassword: ${pw}\n\nSign in at ${window.location.origin}/attend`
    : ''

  function copy() {
    navigator.clipboard?.writeText(message).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1700)
    })
  }

  const wa = String(vendor.phone || '').replace(/\D/g, '').slice(-10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.55 }}>
        Signs them in to the vendor portal — punching in, and their own invoices and
        receipts. They need it with their email; neither works alone.
      </div>

      {err && (
        <div style={{ padding: '9px 11px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word' }}>⚠ {err}</div>
      )}

      {pw ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Password</div>
              <div style={{ fontSize: 19, fontWeight: 700, fontFamily: MONO, letterSpacing: '0.14em', marginTop: 2, color: shown ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)' }}>
                {shown ? pw : '••••••••'}
              </div>
            </div>
            <button type="button" onClick={() => setShown(s => !s)} style={btn}>{shown ? 'Hide' : 'Reveal'}</button>
          </div>

          {shown && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={copy} style={{ ...btn, color: copied ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)' }}>
                {copied ? '✓ Copied' : 'Copy message'}
              </button>
              {wa.length === 10 && (
                <a href={`https://wa.me/91${wa}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"
                  style={{ ...btn, background: 'rgba(37,211,102,0.10)', borderColor: 'rgba(37,211,102,0.42)', color: '#25d366' }}>
                  WhatsApp it
                </a>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '11px 13px', background: 'var(--bg-input, #252731)', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.55 }}>
          {legacy || setAt
            ? 'A password is set but was issued before it could be stored — it can only be replaced.'
            : 'No password yet — they cannot sign in to the portal.'}
        </div>
      )}

      {editing ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="At least 6 characters"
            autoFocus autoCapitalize="characters" autoCorrect="off"
            style={{ flex: '1 1 180px', minWidth: 0, padding: '10px 12px', fontSize: 15, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, color: 'var(--text, #e8e8f0)', outline: 'none', fontFamily: MONO }} />
          <button type="button" onClick={() => issue(draft.trim())} disabled={draft.trim().length < 6 || busy}
            style={{ ...btn, border: 'none', fontWeight: 700, background: draft.trim().length < 6 ? 'var(--bg-input, #252731)' : 'var(--accent, #c8963e)', color: draft.trim().length < 6 ? 'var(--text-muted, #6b6d82)' : '#1a1408' }}>
            {busy ? '…' : 'Save'}
          </button>
          <button type="button" onClick={() => { setEditing(false); setDraft('') }} style={btn}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => issue(null)} disabled={busy} style={{ ...btn, ...(pw ? null : { background: 'var(--accent, #c8963e)', color: '#1a1408', border: 'none', fontWeight: 700 }) }}>
            {busy ? 'Working…' : pw || setAt ? 'Issue a new one' : 'Set a password'}
          </button>
          <button type="button" onClick={() => { setEditing(true); setDraft('') }} style={btn}>Choose one…</button>
        </div>
      )}
    </div>
  )
}
