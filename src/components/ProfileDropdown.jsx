import { useState, useEffect, useRef } from 'react'
import { useTheme } from '../contexts/ThemeContext'

// The avatar menu from Home's header — appearance picker, account, sign out.
// Lifted out of Dashboard.jsx so every wide page can carry the same header.

function initials(name = '') {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'FL'
}


// Appearance is a per-screen setting, not a per-account one — the same person at a
// desk and on site on a dark landing wants different answers — so it is remembered
// in this browser and takes effect the moment it is pressed, with no save.
const APPEARANCES = [
  ['system', 'Auto', 'Follows your device'],
  ['light',  'Light', 'Always light'],
  ['dark',   'Dark',  'Always dark'],
]

function AppearancePicker() {
  const { preference, theme, setPreference } = useTheme()
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 6 }}>appearance</div>
      <div role="group" aria-label="Appearance" className="tct-scored" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {APPEARANCES.map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            title={hint}
            aria-pressed={preference === key}
            onClick={() => setPreference(key)}
            className={`tct tct-raised${preference === key ? ' is-on' : ''}`}
            style={{ padding: '7px 4px', fontSize: 11, lineHeight: 1.1, minHeight: 32, textAlign: 'center' }}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Say which one "Auto" landed on, so the setting is never a mystery. */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', marginTop: 5 }}>
        {preference === 'system' ? `following your device · ${theme}` : `pinned to ${preference}`}
      </div>
    </div>
  )
}

// ─── Profile dropdown ──────────────────────────────────────────────────────────
export default function ProfileDropdown({ name, email, onLogout }) {
  const [open, setOpen]       = useState(false)
  const [sub,  setSub]        = useState(null)
  const ref                   = useRef(null)

  useEffect(() => {
    function outside(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSub(null) } }
    if (open) document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(p => !p); setSub(null) }}
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: open ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
          border: `2px solid ${open ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          color: open ? '#fff' : 'var(--text-dim, #9394a8)',
          fontFamily: 'var(--font-mono, monospace)',
          cursor: 'pointer',
          transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          flexShrink: 0,
        }}
      >{initials(name)}</button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          minWidth: 192,
          background: 'var(--bg-panel, #1e2028)',
          border: '1px solid var(--border, #2e3040)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
          overflow: 'hidden', zIndex: 200, animation: 'fadeIn 0.15s ease',
        }}>
          {sub === null ? (
            <>
              <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)' }}>{name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{email}</div>
              </div>
              <DropItem icon="✎"  label="My notes" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('pulse:notepad', { detail: { view: 'list' } })) }} />
              <DropItem icon="👤" label="Profile"  onClick={() => setSub('profile')} />
              <DropItem icon="⎋"  label="Log Out"  onClick={onLogout} danger />
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                <button onClick={() => setSub(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>←</button>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)' }}>profile</span>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent, #c8963e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono, monospace)' }}>{initials(name)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 3 }}>name</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'capitalize' }}>{name || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 3 }}>email</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>{email || '—'}</div>
                </div>
                <AppearancePicker />
              </div>
              <div style={{ padding: '0 10px 10px' }}>
                <button onClick={onLogout} style={{ width: '100%', padding: '9px 14px', borderRadius: 6, border: '1px solid rgba(176,100,91,0.3)', background: 'rgba(176,100,91,0.08)', fontSize: 12, fontWeight: 600, color: 'var(--red, #b0645b)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                  ⎋ log out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DropItem({ icon, label, onClick, danger }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '11px 16px', border: 'none',
        background: hover ? (danger ? 'rgba(176,100,91,0.08)' : 'rgba(200,150,62,0.08)') : 'transparent',
        color: danger ? 'var(--red, #b0645b)' : hover ? 'var(--accent, #c8963e)' : 'var(--text, #e8e8f0)',
        fontSize: 13, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'var(--font-mono, monospace)', textAlign: 'left',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>{label}
    </button>
  )
}
