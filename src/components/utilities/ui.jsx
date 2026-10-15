// Shared components for the utilities record room. Inline styles reading the
// theme tokens, same as the rest of Pulse — nothing here knows about a theme,
// it only knows about var(--…).
import { CORE_FIELDS, completeness, missingOf } from '../../utils/utilitiesModel'
import { SANS, MONO, card, cardHead, h3 } from './uiStyles'

export function Card({ title, right, children, bodyPad = '13px 14px', style }) {
  return (
    <section style={{ ...card, ...style }}>
      {(title || right) && (
        <header style={cardHead}>
          {title && <h3 style={h3}>{title}</h3>}
          <span style={{ flex: 1 }} />
          {right}
        </header>
      )}
      <div style={{ padding: bodyPad, minWidth: 0 }}>{children}</div>
    </section>
  )
}

export function Pill({ children, tone, style }) {
  const color = tone === 'ok' ? 'var(--green, #3dba7a)'
    : tone === 'bad' ? 'var(--red, #e05c6a)'
    : tone === 'warn' ? 'var(--accent, #c8963e)'
    : 'var(--text-dim, #9394a8)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, padding: '2px 8px',
      borderRadius: 10, background: 'var(--bg-input, #252731)', boxShadow: 'inset 0 0 0 1px var(--border, #2e3040)',
      color, whiteSpace: 'nowrap', ...style }}>{children}</span>
  )
}

export const Swatch = ({ color, style }) => (
  <i style={{ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0, display: 'inline-block', ...style }} />
)

export function Bar({ pct, color, height = 9 }) {
  return (
    <div style={{ background: 'var(--bg-input, #252731)', borderRadius: 5, overflow: 'hidden', height }}>
      <div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height, background: color, borderRadius: '0 4px 4px 0' }} />
    </div>
  )
}

// Seven ticks, one per field a record needs. Green only when nothing is
// missing, so "nearly complete" never reads as done.
export function Meter({ row }) {
  const c = completeness(row), n = CORE_FIELDS.length
  const miss = missingOf(row)
  return (
    <span title={miss.length ? `Missing: ${miss.map((m) => m.label).join(', ')}` : 'Nothing missing'}
      style={{ display: 'inline-flex', gap: 2 }}>
      {CORE_FIELDS.map((f, i) => (
        <i key={f.k} style={{ width: 5, height: 11, borderRadius: 1, display: 'inline-block',
          background: i < c ? (c === n ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)') : 'var(--bg-input, #252731)' }} />
      ))}
    </span>
  )
}

export function Drill({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer',
      color: 'var(--text, #e8e8f0)', borderBottom: '1px dotted var(--border-dash, #3a3d52)', textAlign: 'left' }}>
      {children}
    </button>
  )
}

export function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ height: 30, borderRadius: 8, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
        color: 'var(--text, #e8e8f0)', padding: '0 7px', fontSize: 12, fontFamily: SANS, outline: 'none', maxWidth: '100%' }}>
      {options.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
    </select>
  )
}

export function Seg({ value, onChange, options, style }) {
  return (
    <span style={{ display: 'inline-flex', background: 'var(--bg-input, #252731)', boxShadow: 'inset 0 0 0 1px var(--border, #2e3040)',
      borderRadius: 8, padding: 2, gap: 2, ...style }}>
      {options.map((o) => (
        <button key={o.k} onClick={() => onChange(o.k)} aria-pressed={value === o.k}
          style={{ height: 24, padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11.5, fontFamily: SANS,
            background: value === o.k ? 'var(--bg-panel, #1e2028)' : 'transparent',
            color: value === o.k ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)',
            fontWeight: value === o.k ? 700 : 400 }}>{o.label}</button>
      ))}
    </span>
  )
}

export function Empty({ title, children }) {
  return (
    <div style={{ padding: '32px 18px', textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontSize: 12.5, lineHeight: 1.7 }}>
      {title && <b style={{ display: 'block', color: 'var(--text-dim, #9394a8)', fontSize: 13, marginBottom: 4 }}>{title}</b>}
      {children}
    </div>
  )
}
