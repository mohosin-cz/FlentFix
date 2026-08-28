import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { initials, avatarColor } from '../../utils/vendorHub'

// Issuing portal passwords, and keeping track of who still hasn't got one.
//
// The password is shown once, here, and never again — only its hash is stored.
// That is the point of hashing, but it does mean the copy button is the whole
// mechanism: if it is not passed on now, the only remedy is to issue another.
// So the freshly-minted one stays on screen until dismissed rather than
// disappearing on the next render.
//
// It also quietly fixes the shared-inbox problem. Two vendors on one address
// used to resolve to whichever row came back first, so one of them could not
// sign in as themselves at all. Distinct passwords tell them apart without
// anyone having to change their email first.

const MONO = 'var(--font-mono, monospace)'

const btn = {
  minHeight: 40, padding: '0 13px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
  fontFamily: MONO, cursor: 'pointer', border: '1px solid var(--border, #2e3040)',
  background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)',
}

function Ava({ name }) {
  const c = avatarColor(name || '?')
  return <span style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: MONO, background: c + '22', color: c }}>{initials(name || '?')}</span>
}

export default function PortalPasswordSheet({ onClose }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [minted, setMinted] = useState({})   // vendor_id → plaintext, this session only
  const [copied, setCopied] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('vendors')
      .select('id,full_name,vendor_code,email,phone,portal_password_set_at,portal_last_login_at')
      .eq('status', 'approved').order('full_name')
    if (error) { setErr(error.message); setRows([]); return }
    setErr(''); setRows(data || [])
  }, [])
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  // Addresses on more than one record: exactly the people for whom a password
  // is not a nicety but the only way to sign in as themselves.
  const shared = new Set()
  const seen = {}
  for (const v of rows || []) {
    const e = (v.email || '').trim().toLowerCase()
    if (!e) continue
    if (seen[e]) shared.add(e); else seen[e] = true
  }

  async function generate(v) {
    setBusy(v.id); setErr('')
    const { data, error } = await supabase.rpc('vendor_generate_portal_password', { p_vendor_id: v.id })
    setBusy('')
    if (error) { setErr(error.message); return }
    setMinted(m => ({ ...m, [v.id]: data }))
    load()
  }

  function copy(v) {
    const pw = minted[v.id]
    const text = `Flent vendor portal\nEmail: ${v.email}\nPassword: ${pw}\n\nSign in at ${window.location.origin}/attend`
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(v.id); setTimeout(() => setCopied(''), 1800)
    })
  }

  const list = (rows || []).filter(v => {
    const needle = q.trim().toLowerCase()
    return !needle || [v.full_name, v.vendor_code, v.email].some(f => (f || '').toLowerCase().includes(needle))
  })
  const without = (rows || []).filter(v => !v.portal_password_set_at).length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8,9,13,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 620, maxHeight: '93vh', overflowY: 'auto', background: 'var(--bg-panel, #1e2028)', borderRadius: '16px 16px 0 0', borderTop: '1px solid var(--border, #2e3040)', padding: '16px 18px 34px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border, #2e3040)', margin: '-4px auto 0' }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Portal passwords</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
              {without} of {(rows || []).length} still without one
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: 0 }}>×</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.55 }}>
          A password is shown once when you issue it and cannot be looked up afterwards —
          copy it straight to the vendor. Until someone has one, their email alone still
          signs them in.
        </div>

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, email"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, color: 'var(--text, #e8e8f0)', outline: 'none', fontFamily: 'inherit' }} />

        {err && (
          <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word' }}>⚠ {err}</div>
        )}

        {rows === null ? <div style={{ padding: 18, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div> : list.map(v => {
          const pw = minted[v.id]
          const isShared = shared.has((v.email || '').trim().toLowerCase())
          return (
            <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Ava name={v.full_name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{v.full_name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.vendor_code} · {v.email || 'no email'}
                  </div>
                </div>
                {v.portal_password_set_at
                  ? <span style={{ fontSize: 9.5, fontWeight: 700, fontFamily: MONO, color: 'var(--green, #3dba7a)', border: '1px solid var(--green, #3dba7a)', borderRadius: 10, padding: '2px 8px' }}>SET</span>
                  : <span style={{ fontSize: 9.5, fontWeight: 700, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '2px 8px' }}>NONE</span>}
                <button type="button" onClick={() => generate(v)} disabled={busy === v.id} style={btn}>
                  {busy === v.id ? '…' : v.portal_password_set_at ? 'Reset' : 'Generate'}
                </button>
              </div>

              {isShared && !v.portal_password_set_at && (
                <div style={{ fontSize: 10.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
                  ⚠ This email is on another vendor too — without a password one of them can&rsquo;t sign in as themselves.
                </div>
              )}

              {pw && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(61,186,122,0.08)', border: '1px solid rgba(61,186,122,0.35)', borderRadius: 9, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Give this to {v.full_name.split(' ')[0]}</div>
                    <div style={{ fontSize: 19, fontWeight: 700, fontFamily: MONO, color: 'var(--green, #3dba7a)', letterSpacing: '0.12em', marginTop: 2 }}>{pw}</div>
                  </div>
                  <button type="button" onClick={() => copy(v)} style={{ ...btn, color: copied === v.id ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)' }}>
                    {copied === v.id ? '✓ Copied' : 'Copy message'}
                  </button>
                  {v.phone && (
                    <a href={`https://wa.me/${String(v.phone).replace(/\D/g, '').slice(-10).padStart(12, '91')}?text=${encodeURIComponent(`Flent vendor portal\nEmail: ${v.email}\nPassword: ${pw}\n\nSign in at ${window.location.origin}/attend`)}`}
                      target="_blank" rel="noreferrer"
                      style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', background: 'rgba(37,211,102,0.10)', borderColor: 'rgba(37,211,102,0.42)', color: '#25d366' }}>
                      WhatsApp
                    </a>
                  )}
                  <div style={{ width: '100%', fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 }}>
                    Shown once — it can&rsquo;t be looked up again, only replaced.
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
