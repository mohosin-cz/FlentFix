import { useState } from 'react'

// One search field for the vendor hub.
//
// Defined by its fill rather than a drawn box — a hard 1px border at rest is
// what made the assets search read as a form input bolted onto the page. The
// accent ring appears only on focus, which is the moment it matters.
//
// It also carries its own result count. A "0 of 0" floating at the far end of
// a filter row belongs to nothing; sitting inside the field, it plainly
// belongs to the search.

export default function SearchField({
  value, onChange, placeholder = 'Search…', ariaLabel,
  count, total, style,
}) {
  const [focused, setFocused] = useState(false)
  const showCount = count != null && total != null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, minWidth: 0,
      flex: '1 1 300px', maxWidth: 440, height: 42, padding: '0 12px',
      background: 'var(--bg-input, #252731)', borderRadius: 11,
      border: '1px solid transparent',
      boxShadow: focused ? '0 0 0 3px rgba(200,150,62,0.10)' : 'none',
      borderColor: focused ? 'var(--accent, #c8963e)' : 'transparent',
      transition: 'border-color .16s, box-shadow .16s, background .16s',
      ...style,
    }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" stroke={focused ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)'} strokeWidth="1.6" />
        <path d="M10.5 10.5L14 14" stroke={focused ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)'} strokeWidth="1.6" strokeLinecap="round" />
      </svg>

      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => { if (e.key === 'Escape' && value) { e.stopPropagation(); onChange('') } }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        style={{
          flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'none', outline: 'none',
          color: 'var(--text, #e8e8f0)', fontSize: 13.5, fontFamily: 'inherit',
        }}
      />

      {value && (
        <button type="button" onClick={() => onChange('')} title="Clear search" aria-label="Clear search"
          style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 15, lineHeight: 1, cursor: 'pointer' }}>
          ×
        </button>
      )}

      {showCount && (
        <span style={{ flexShrink: 0, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums', paddingInlineStart: 8, borderInlineStart: '1px solid var(--border, #2e3040)' }}>
          {count === total ? total : `${count}/${total}`}
        </span>
      )}
    </div>
  )
}
