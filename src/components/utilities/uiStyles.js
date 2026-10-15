// Style objects for the utilities record room, kept out of the component file
// so fast refresh stays intact (a module that exports both components and
// non-component values loses it).
export const SANS = 'var(--font-sans, Poppins, sans-serif)'
export const MONO = 'var(--font-mono, monospace)'

export const card = {
  background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)',
  borderRadius: 12, minWidth: 0,
}
export const cardHead = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
  borderBottom: '1px solid var(--border, #2e3040)', flexWrap: 'wrap',
}
export const h3 = { fontSize: 12.5, fontWeight: 700, color: 'var(--text, #e8e8f0)', margin: 0 }
export const lbl = {
  fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-muted, #6b6d82)', fontFamily: MONO,
}
export const hint = { fontSize: 11.5, color: 'var(--text-muted, #6b6d82)' }

export const th = {
  textAlign: 'left', fontSize: 9.5, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: 'var(--text-muted, #6b6d82)', fontWeight: 700, fontFamily: MONO,
  padding: '7px 9px', borderBottom: '1px solid var(--border, #2e3040)', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, background: 'var(--bg-panel, #1e2028)', zIndex: 1,
}
export const td = {
  padding: '8px 9px', borderBottom: '1px solid var(--border, #2e3040)',
  fontSize: 12.5, verticalAlign: 'middle', color: 'var(--text, #e8e8f0)',
}
export const table = { width: '100%', borderCollapse: 'collapse' }
export const scrollX = { overflowX: 'auto', WebkitOverflowScrolling: 'touch' }
