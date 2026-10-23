import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Who owns this property: on whose desk and Team load bar it sits. Admin only;
// property_set_owner() checks that again on the server.
const firstOf = (e) => { const x = (e || '').split('@')[0]; return x ? x[0].toUpperCase() + x.slice(1) : '' }
export default function ChangeOwnerModal({ pid, current, onClose, onSuccess }) {
  const [team, setTeam]     = useState([])
  const [pick, setPick]     = useState(current || '')
  const [other, setOther]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  useEffect(() => {
    supabase.rpc('team_members').then(({ data }) => setTeam((data || []).filter(t => (t.email || '').endsWith('@flent.in'))))
  }, [])
  const chosen = (pick === '__other' ? other : pick).trim().toLowerCase()
  const valid = chosen === '' || /^[a-z0-9._%+-]+@flent\.in$/.test(chosen)
  const changed = chosen !== (current || '')
  async function save() {
    if (!valid || !changed || saving) return
    setSaving(true); setError(null)
    const { error: e } = await supabase.rpc('property_set_owner', { p_pid: pid, p_email: chosen || null })
    setSaving(false)
    if (e) { setError(e.message); return }
    onSuccess(chosen)
  }
  const row = (key, label, sub) => (
    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: pick === key ? 'rgba(200,150,62,0.1)' : 'var(--bg-input, #252731)', border: `1px solid ${pick === key ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}` }}>
      <input type="radio" name="owner" checked={pick === key} onChange={() => setPick(key)} style={{ accentColor: '#c8963e' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>{label}</span>
        {sub && <span style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)' }}>{sub}</span>}
      </span>
      {key === current && <span style={{ fontSize: 10.5, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>CURRENT</span>}
    </label>
  )
  const people = [...new Set([...(current ? [current] : []), ...team.map(t => t.email.toLowerCase())])]
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 500, maxHeight: '90svh', overflowY: 'auto', background: 'var(--bg-panel, #1e2028)', borderTop: '1px solid var(--border, #2e3040)', borderRadius: '16px 16px 0 0', padding: '24px 24px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border, #2e3040)', margin: '-8px auto 8px' }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)', marginBottom: 6 }}>Owner of {pid}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.6 }}>
            The owner has this property on their desk and their Team load bar. Currently {current ? <b style={{ color: 'var(--text-dim, #9394a8)' }}>{firstOf(current)}</b> : 'nobody'}.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {people.map(e => {
            const t = team.find(x => x.email.toLowerCase() === e)
            return row(e, firstOf(e), `${e}${t ? ` · ${t.properties} propert${t.properties === 1 ? 'y' : 'ies'}` : ''}`)
          })}
          {row('__other', 'Someone else', 'type a @flent.in address')}
          {pick === '__other' && (
            <input type="email" value={other} onChange={e => setOther(e.target.value)} placeholder="name@flent.in" autoFocus
              style={{ background: 'var(--bg-input, #252731)', border: `1px solid ${other && !valid ? '#f87171' : 'var(--border, #2e3040)'}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text, #e8e8f0)', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          )}
          {current && row('', 'No owner', 'shows as Unowned on Team load')}
        </div>
        {error && <div style={{ fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono, monospace)', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={!valid || !changed || saving}
            style={{ flex: 2, padding: '11px 0', background: valid && changed ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: valid && changed ? '#000' : 'var(--text-muted, #6b6d82)', cursor: valid && changed ? 'pointer' : 'default' }}>
            {saving ? 'Saving…' : !changed ? 'Pick an owner' : chosen ? `Make ${firstOf(chosen)} the owner` : 'Remove owner'}
          </button>
        </div>
      </div>
    </div>
  )
}
