import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useDraft } from './useDraft'
import { templateFor, prettyPhone } from './templates'

// "Draft message" — when the next action is talking to someone, Pulse writes
// the message and gets out of the way.
//
//   DraftMessageButton  a button; renders NOTHING when the thread code needs
//                       no message, so it is safe on every queue row
//   DraftMessageInline  the same as a "✎ draft" text link, for dense rows
//
// The sheet (phone: full-screen under the safe area; desktop: centred modal)
// shows who it is to, the draft in an editable box, what it is based on, and
// one primary action: Copy. There is no send. A person reads it and sends it
// from their own WhatsApp. The phone number is shown as text, not a link.
//
// Nested-button note: Home2's Row is itself a <button>. Put this trigger
// OUTSIDE the row's button (e.g. a sibling in a flex wrapper) — a button
// inside a button is invalid HTML and browsers unwrap it unpredictably. Clicks
// here stop propagation either way.

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'

async function copyText(text, textarea) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) { await navigator.clipboard.writeText(text); return 'copied' }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus(); ta.select(); ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return 'copied'
  } catch { /* fall through */ }
  // Neither path worked (older WebView, permissions). Leave the text selected
  // so a long-press / ⌘C finishes the job, and say so.
  try { textarea?.focus(); textarea?.select(); textarea?.setSelectionRange(0, text.length) } catch { /* ignore */ }
  return 'select'
}

function senderFirstName(session) {
  const full = session?.user?.user_metadata?.full_name
  const email = session?.user?.email || ''
  const raw = (full && String(full).trim()) || email.split('@')[0] || ''
  const first = raw.split(/[\s._-]+/)[0] || ''
  return first ? first[0].toUpperCase() + first.slice(1) : ''
}

// ─── the sheet ───────────────────────────────────────────────────────────────

function Sheet({ pid, code, onClose }) {
  const phone = useIsMobile(640)
  const navigate = useNavigate()
  const { session } = useAuth()
  const sender = senderFirstName(session)
  const { loading, error, draft, reload } = useDraft(pid, code, { sender })
  const [text, setText] = useState('')
  const [copyState, setCopyState] = useState('idle') // idle · copied · select
  const ta = useRef(null)
  const sheet = useRef(null)

  // the draft lands once per open; after that the box is the person's
  useEffect(() => { if (draft?.text != null) setText(draft.text) }, [draft])

  // Escape closes; body scroll locked under the sheet on both form factors
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  useEffect(() => {
    if (copyState === 'idle') return
    const t = setTimeout(() => setCopyState('idle'), copyState === 'copied' ? 2000 : 4000)
    return () => clearTimeout(t)
  }, [copyState])

  const copy = async () => {
    if (!text.trim()) return
    setCopyState(await copyText(text, ta.current))
  }

  const audienceWord = draft?.audience === 'vendor' ? 'the vendor' : 'the landlord'
  const to = draft?.to
  const noPhone = draft && !draft.empty && (!to || !to.phone)

  const btn = (primary) => ({
    minHeight: 44, padding: '0 16px', borderRadius: 9, cursor: 'pointer', fontFamily: MONO, fontSize: 12.5, fontWeight: 700,
    border: `1px solid ${primary ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
    background: primary ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
    color: primary ? 'var(--on-accent, #16171f)' : 'var(--text, #e8e8f0)',
    WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  })

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: phone ? '8px 8px 8px 16px' : '10px 10px 10px 16px', borderBottom: '1px solid var(--border, #2e3040)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)' }}>Draft message</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: MONO, color: 'var(--accent, #c8963e)' }}>{pid}</span>
          {draft?.subject ? ` · ${draft.subject}` : ''}
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="Close"
        style={{ minHeight: 44, minWidth: 44, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
        Close
      </button>
    </div>
  )

  const body = (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div role="alert" style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(176,100,91,0.32)', background: 'rgba(176,100,91,0.10)', fontFamily: MONO, fontSize: 11.5, color: 'var(--red, #b0645b)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 160 }}>Couldn't read the property — {error}</span>
          <button type="button" onClick={reload} style={{ minHeight: 36, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {loading && !draft && !error && (
        <div aria-busy="true">
          <div style={{ height: 28, width: 220, maxWidth: '80%', borderRadius: 999, background: 'var(--border, #2e3040)', opacity: 0.7 }} />
          <div style={{ height: 180, borderRadius: 10, background: 'var(--border, #2e3040)', opacity: 0.45, marginTop: 12 }} />
          <div style={{ height: 10, width: 160, borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.6, marginTop: 12 }} />
        </div>
      )}

      {draft && draft.empty && (
        <div style={{ padding: '18px 14px', borderRadius: 10, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', fontFamily: MONO, fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5 }}>
          Nothing to draft. {draft.empty}
        </div>
      )}

      {draft && !draft.empty && (
        <>
          {/* who it is to — the number is text, never a link */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 32, padding: '0 12px', borderRadius: 999, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', fontFamily: MONO, fontSize: 12, color: 'var(--text, #e8e8f0)', maxWidth: '100%' }}>
              <span style={{ color: 'var(--text-dim, #9394a8)' }}>To {audienceWord}</span>
              {to?.name && <><span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)' }}>·</span><span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{to.name}</span></>}
              {to?.phone && <><span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)' }}>·</span><span style={{ userSelect: 'all' }}>{prettyPhone(to.phone)}</span></>}
            </span>
          </div>

          {noPhone && (
            <div style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(200,150,62,0.35)', background: 'rgba(200,150,62,0.10)', fontFamily: MONO, fontSize: 11.5, color: 'var(--amber, #c8963e)', lineHeight: 1.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 180 }}>
                {draft.audience === 'vendor'
                  ? `No phone on file for ${to?.name || 'this vendor'} — check their vendor profile.`
                  : `No landlord ${to?.name ? 'phone' : 'name or phone'} on file — add it on the invoice or estimate.`}
              </span>
              {to?.route && (
                <button type="button" onClick={() => { onClose(); navigate(to.route) }}
                  style={{ minHeight: 34, padding: '0 10px', borderRadius: 7, border: '1px solid rgba(200,150,62,0.45)', background: 'none', color: 'var(--amber, #c8963e)', fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                  Add it →
                </button>
              )}
            </div>
          )}

          <label style={{ display: 'block' }}>
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Message text</span>
            <textarea ref={ta} value={text} onChange={e => setText(e.target.value)} rows={phone ? 12 : 11} spellCheck
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 200, padding: '12px 14px', borderRadius: 10,
                       border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)',
                       fontFamily: SANS, fontSize: phone ? 16 : 14, lineHeight: 1.5, outline: 'none' }} />
          </label>

          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5 }}>
            Based on: {draft.basedOn?.label || code}{draft.basedOn?.waited ? ` · ${draft.basedOn.waited}` : ''}
            {' · '}edit freely, then copy. Nothing is sent from here.
          </div>
        </>
      )}
    </div>
  )

  const foot = draft && !draft.empty ? (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderTop: '1px solid var(--border, #2e3040)', background: 'var(--bg-panel, #1e2028)', paddingBottom: phone ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : 12 }}>
      <button type="button" onClick={copy} disabled={!text.trim()} aria-live="polite"
        style={{ ...btn(true), flex: phone ? 1 : 'none', minWidth: 140, opacity: text.trim() ? 1 : 0.5,
                 background: copyState === 'copied' ? 'var(--green, #6f9a7e)' : btn(true).background,
                 borderColor: copyState === 'copied' ? 'var(--green, #6f9a7e)' : btn(true).borderColor }}>
        {copyState === 'copied' ? 'Copied ✓' : 'Copy'}
      </button>
      {copyState === 'select' && (
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--amber, #c8963e)', flex: 1, minWidth: 0 }}>
          Clipboard blocked — the text is selected; copy it with ⌘C / long-press.
        </span>
      )}
      {!phone && <span style={{ flex: 1 }} />}
      <button type="button" onClick={onClose} style={btn(false)}>Close</button>
    </div>
  ) : null

  if (phone) {
    return createPortal(
      <div role="dialog" aria-modal="true" aria-label="Draft message" ref={sheet}
        style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', flexDirection: 'column', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', paddingTop: 'env(safe-area-inset-top, 0px)', fontFamily: SANS }}>
        {head}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--bg-panel, #1e2028)' }}>{body}</div>
        {foot}
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(0,0,0,0.55)' }}>
      <div role="dialog" aria-modal="true" aria-label="Draft message" ref={sheet}
        style={{ width: 560, maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel, #1e2028)', color: 'var(--text, #e8e8f0)',
                 border: '1px solid var(--border, #2e3040)', borderRadius: 14, boxShadow: 'var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.3))', overflow: 'hidden', fontFamily: SANS }}>
        {head}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 120 }}>{body}</div>
        {foot}
      </div>
    </div>,
    document.body,
  )
}

// ─── triggers ────────────────────────────────────────────────────────────────

/**
 * DraftMessageButton({ pid, code, label = 'Draft message', compact, style })
 * Renders null when templateFor(code) is null — safe on every row.
 */
export function DraftMessageButton({ pid, code, label = 'Draft message', compact = false, style }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  if (!pid || !templateFor(code)) return null
  return (
    <>
      <button type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true) }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-haspopup="dialog" aria-expanded={open} title={label}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: compact ? 34 : 44, padding: compact ? '0 10px' : '0 14px', borderRadius: 8,
                 border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--accent, #c8963e)',
                 fontFamily: MONO, fontSize: compact ? 11 : 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                 WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', ...style }}>
        <span aria-hidden="true">✎</span>{label}
      </button>
      {open && <Sheet pid={pid} code={code} onClose={close} />}
    </>
  )
}

/** DraftMessageInline({ pid, code }) — the same thing as a "✎ draft" text link for dense rows. */
export function DraftMessageInline({ pid, code, label = 'draft', style }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  if (!pid || !templateFor(code)) return null
  return (
    <>
      <button type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true) }}
        onMouseDown={(e) => e.stopPropagation()}
        aria-haspopup="dialog" aria-expanded={open} title="Draft message"
        style={{ background: 'none', border: 'none', padding: '6px 4px', margin: '-6px -4px', minHeight: 32, cursor: 'pointer', color: 'var(--accent, #c8963e)',
                 fontFamily: MONO, fontSize: 11.5, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap',
                 WebkitTapHighlightColor: 'transparent', ...style }}>
        ✎ {label}
      </button>
      {open && <Sheet pid={pid} code={code} onClose={close} />}
    </>
  )
}

export default DraftMessageButton
