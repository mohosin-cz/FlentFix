import { useIsMobile } from '../../hooks/useIsMobile'
import { openCommand } from './commandStore'

// The affordance for people who will never learn ⌘K. Drop it in a header.
//
//   <CommandTrigger />            desktop: a search-field-shaped button with
//                                 the shortcut on the right; phone: a 44px
//                                 icon button
//   <CommandTrigger compact />    icon button at every width (tight headers)
//   pid                           optional — pass when the header already
//                                 knows its property and the URL might not
//                                 (the surface also reads /properties/:pid)

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')

function Glass({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function CommandTrigger({ compact = false, pid, style }) {
  const phone = useIsMobile(640)
  const open = () => openCommand(pid ? { pid } : undefined)

  if (compact || phone) {
    return (
      <button type="button" onClick={open} aria-label="Search or jump to" title={`Search or jump to (${IS_MAC ? '⌘' : 'Ctrl'} K)`}
        style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                 background: 'none', border: '1px solid transparent', borderRadius: 10, color: 'var(--text-dim, #9394a8)', cursor: 'pointer',
                 WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', ...style }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border, #2e3040)'; e.currentTarget.style.color = 'var(--text, #e8e8f0)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--text-dim, #9394a8)' }}>
        <Glass size={18} />
      </button>
    )
  }

  return (
    <button type="button" onClick={open} aria-label="Search or jump to" title={`Search or jump to (${IS_MAC ? '⌘' : 'Ctrl'} K)`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 36, width: 'min(300px, 100%)', padding: '0 8px 0 10px',
               background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9,
               color: 'var(--text-muted, #6b6d82)', fontFamily: SANS, fontSize: 12.5, textAlign: 'left', cursor: 'text', ...style }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent, #c8963e)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #2e3040)' }}>
      <Glass />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Search or jump to…</span>
      <span style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
        {[IS_MAC ? '⌘' : 'Ctrl', 'K'].map(k => (
          <kbd key={k} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, minWidth: 18, padding: '1px 5px', textAlign: 'center', lineHeight: '16px',
                                border: '1px solid var(--border, #2e3040)', borderBottomWidth: 2, borderRadius: 4, background: 'var(--bg-panel, #1e2028)', color: 'var(--text-dim, #9394a8)' }}>
            {k}
          </kbd>
        ))}
      </span>
    </button>
  )
}

export default CommandTrigger
