import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY = pid => `flent_quick_notes_${pid}`

export default function QuickNotes({ pid }) {
  const [open, setOpen]   = useState(false)
  const [notes, setNotes] = useState('')
  const textareaRef       = useRef(null)
  const panelRef          = useRef(null)

  // Load from localStorage on mount / pid change
  useEffect(() => {
    if (!pid) return
    const saved = localStorage.getItem(STORAGE_KEY(pid)) || ''
    setNotes(saved)
  }, [pid])

  // Persist on every change
  useEffect(() => {
    if (!pid) return
    localStorage.setItem(STORAGE_KEY(pid), notes)
  }, [notes, pid])

  // Focus textarea when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 80)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        !e.target.closest('[data-quicknotes-trigger]')
      ) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Count non-empty lines as "notes"
  const lineCount = notes.split('\n').filter(l => l.trim()).length

  // Handle keyboard shortcuts inside textarea
  function handleKeyDown(e) {
    const ta = textareaRef.current
    const { selectionStart, selectionEnd, value } = ta

    if (e.key === 'Enter') {
      // If current line starts with a bullet, auto-continue
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
      const currentLine = value.slice(lineStart, selectionStart)
      const bulletMatch = currentLine.match(/^(\s*[•\-]\s)/)
      if (bulletMatch) {
        e.preventDefault()
        const bullet = bulletMatch[1]
        // If line is just a bullet with no content, remove bullet and end list
        if (currentLine.trim() === bulletMatch[0].trim()) {
          const newVal = value.slice(0, lineStart) + '\n' + value.slice(selectionEnd)
          setNotes(newVal)
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = lineStart + 1
          }, 0)
        } else {
          const insert = '\n' + bullet
          const newVal = value.slice(0, selectionStart) + insert + value.slice(selectionEnd)
          setNotes(newVal)
          setTimeout(() => {
            ta.selectionStart = ta.selectionEnd = selectionStart + insert.length
          }, 0)
        }
      }
    }
  }

  function insertBullet() {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart, selectionEnd, value } = ta
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
    const lineText  = value.slice(lineStart, selectionStart)

    let newVal, cursor
    if (lineText.match(/^[•\-]\s/)) {
      // Already a bullet — remove it
      newVal = value.slice(0, lineStart) + lineText.slice(2) + value.slice(lineStart + lineText.length)
      cursor = selectionStart - 2
    } else {
      // Add bullet at start of line
      newVal = value.slice(0, lineStart) + '• ' + value.slice(lineStart)
      cursor = selectionStart + 2
    }
    setNotes(newVal)
    setTimeout(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = Math.max(0, cursor)
    }, 0)
  }

  function clearNotes() {
    if (window.confirm('Clear all notes for this property?')) {
      setNotes('')
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        data-quicknotes-trigger
        onClick={() => setOpen(p => !p)}
        style={{
          position: 'fixed',
          bottom: 88,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: open ? 'var(--accent, #c8963e)' : 'var(--bg-panel, #1e2028)',
          border: `2px solid ${open ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
          boxShadow: open
            ? '0 4px 20px rgba(200,150,62,0.35)'
            : '0 4px 16px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 120,
          transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
          WebkitTapHighlightColor: 'transparent',
          flexShrink: 0,
        }}
        title="Quick Notes"
      >
        {/* Note / pencil icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          style={{ color: open ? '#fff' : 'var(--text-dim, #9394a8)', transition: 'color 0.2s' }}>
          <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {/* Badge */}
        {lineCount > 0 && !open && (
          <span style={{
            position: 'absolute',
            top: -4, right: -4,
            minWidth: 17, height: 17,
            borderRadius: 9,
            background: 'var(--accent, #c8963e)',
            color: '#fff',
            fontSize: 9, fontWeight: 700,
            fontFamily: 'var(--font-mono, monospace)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
            border: '2px solid var(--bg, #16171f)',
          }}>
            {lineCount}
          </span>
        )}
      </button>

      {/* Notes panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            bottom: 148,
            right: 16,
            width: 'min(340px, calc(100vw - 32px))',
            background: 'var(--bg-panel, #1e2028)',
            border: '1px solid var(--border, #2e3040)',
            borderRadius: 14,
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            zIndex: 120,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          {/* Panel header */}
          <div style={{
            padding: '12px 14px 10px',
            borderBottom: '1px solid var(--border, #2e3040)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700,
                color: 'var(--text, #e8e8f0)',
                fontFamily: 'var(--font-mono, monospace)',
                letterSpacing: '-0.2px',
              }}>
                Quick Notes
              </div>
              <div style={{
                fontSize: 9, color: 'var(--text-muted, #6b6d82)',
                fontFamily: 'var(--font-mono, monospace)',
                marginTop: 1,
              }}>
                PID{pid} · {lineCount} line{lineCount !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {notes.trim() && (
                <button onClick={clearNotes} style={btn.icon} title="Clear notes">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              <button onClick={() => setOpen(false)} style={btn.icon} title="Close">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Toolbar */}
          <div style={{
            padding: '7px 12px',
            borderBottom: '1px solid var(--border, #2e3040)',
            display: 'flex',
            gap: 4,
          }}>
            <button onClick={insertBullet} style={btn.tool} title="Toggle bullet point">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="2.5" cy="5" r="1.5" fill="currentColor"/>
                <circle cx="2.5" cy="11" r="1.5" fill="currentColor"/>
                <line x1="6" y1="5" x2="15" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <line x1="6" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
            <div style={{ width: 1, background: 'var(--border, #2e3040)', margin: '2px 4px' }} />
            <span style={{
              fontSize: 9, color: 'var(--text-muted, #6b6d82)',
              fontFamily: 'var(--font-mono, monospace)',
              alignSelf: 'center', paddingLeft: 2,
            }}>
              Enter continues a bullet list
            </span>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={"Start typing your notes...\n\nTip: Click • in the toolbar to add a bullet list"}
            style={{
              flex: 1,
              minHeight: 220,
              maxHeight: 300,
              padding: '14px 16px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--text, #e8e8f0)',
              fontFamily: 'var(--font-mono, monospace)',
              caretColor: 'var(--accent, #c8963e)',
            }}
          />

          {/* Footer hint */}
          <div style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--border, #2e3040)',
            fontSize: 9,
            color: 'var(--text-muted, #6b6d82)',
            fontFamily: 'var(--font-mono, monospace)',
            display: 'flex',
            justifyContent: 'space-between',
          }}>
            <span>auto-saved locally</span>
            <span>{notes.length} chars</span>
          </div>
        </div>
      )}
    </>
  )
}

// Small reusable button styles
const btn = {
  icon: {
    width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 6,
    color: 'var(--text-muted, #6b6d82)',
    cursor: 'pointer',
    transition: 'background 0.12s, color 0.12s',
  },
  tool: {
    width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 5,
    color: 'var(--text-dim, #9394a8)',
    cursor: 'pointer',
    transition: 'background 0.12s, color 0.12s',
  },
}
