import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useNotifications, groupByProperty, relTime } from './useNotifications'

// The bell. A 44px target with the unread count, opening a panel that is
// grouped BY PROPERTY — "what happened at 214" — not a flat stream.
//
//   desktop  anchored dropdown, ~380px, closes on outside click / Escape
//   phone    full-screen sheet under the safe area, with a Close button
//
// Opening the panel marks what you can see as read (the server is told once;
// the dot stays for this opening so you can still tell what was new). Tap a
// row → its route. × or a left swipe → dismissed, and it never comes back.

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'

const KIND_TONE = {
  landlord_approved:  'var(--green, #6f9a7e)',
  estimate_decided:   'var(--green, #6f9a7e)',
  landlord_queried:   'var(--amber, #c8963e)',
  estimate_unopened:  'var(--amber, #c8963e)',
  vendor_completed:   'var(--accent, #c8963e)',
  execution_tomorrow: 'var(--accent, #c8963e)',
  handover_tomorrow:  'var(--accent, #c8963e)',
  disputed_twice:     'var(--red, #b0645b)',
}

function BellIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9.5a6 6 0 0 1 12 0v4.2l1.6 2.6a.6.6 0 0 1-.5.9H4.9a.6.6 0 0 1-.5-.9L6 13.7z" />
      <path d="M9.8 20a2.4 2.4 0 0 0 4.4 0" />
    </svg>
  )
}

function Item({ n, fresh, onGo, onDismiss }) {
  const touch = useRef(null)
  const [dx, setDx] = useState(0)
  const tone = KIND_TONE[n.kind] || 'var(--text-dim, #9394a8)'
  return (
    <div
      style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--border, #2e3040)' }}
      onTouchStart={e => { touch.current = e.touches[0].clientX }}
      onTouchMove={e => { if (touch.current != null) setDx(Math.min(0, e.touches[0].clientX - touch.current)) }}
      onTouchEnd={() => { if (dx < -72) onDismiss(); setDx(0); touch.current = null }}>
      {/* the red reveal behind a swiping row */}
      {dx < 0 && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 16px', background: 'rgba(176,100,91,0.18)', color: 'var(--red, #b0645b)', fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>
          dismiss
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'stretch', transform: `translateX(${dx}px)`, transition: dx === 0 ? 'transform 160ms ease' : 'none', background: 'var(--bg-panel, #1e2028)' }}>
        <button type="button" onClick={onGo} disabled={!n.route}
          style={{ flex: 1, minWidth: 0, minHeight: 56, display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 4px 10px 14px', textAlign: 'left',
                   background: 'none', border: 'none', cursor: n.route ? 'pointer' : 'default', color: 'var(--text, #e8e8f0)', fontFamily: SANS,
                   WebkitTapHighlightColor: 'transparent', touchAction: 'pan-y' }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0, background: fresh ? tone : 'transparent', border: `1.5px solid ${tone}` }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.35, fontWeight: fresh ? 600 : 400, wordBreak: 'break-word' }}>{n.title}</span>
            {n.body && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-dim, #9394a8)', marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' }}>{n.body}</span>}
            <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 4 }}>{relTime(n.created_at)}{n.route ? ' · open ›' : ''}</span>
          </span>
        </button>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" title="Dismiss"
          style={{ width: 44, minHeight: 44, alignSelf: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #6b6d82)', fontSize: 18, lineHeight: 1, fontFamily: MONO, WebkitTapHighlightColor: 'transparent' }}>
          ×
        </button>
      </div>
    </div>
  )
}

function Panel({ phone, onClose, inbox, fresh }) {
  const navigate = useNavigate()
  const { loading, error, list, unreadCount, reload, markRead, markAllRead, dismiss } = inbox
  const groups = useMemo(() => groupByProperty(list), [list])

  const go = (n) => {
    markRead([n.id])
    onClose()
    if (n.route) navigate(n.route)
  }
  const link = (label, to) => (
    <button type="button" onClick={() => { onClose(); navigate(to) }}
      style={{ minHeight: 40, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
      {label}
    </button>
  )

  const body = (
    <>
      {error && (
        <div style={{ margin: 12, padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(176,100,91,0.32)', background: 'rgba(176,100,91,0.10)', fontFamily: MONO, fontSize: 11.5, color: 'var(--red, #b0645b)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 160 }}>Couldn't read notifications — {error}</span>
          <button type="button" onClick={reload} style={{ minHeight: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>Retry</button>
        </div>
      )}
      {loading && !list && (
        <div aria-busy="true" style={{ padding: 14 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--border, #2e3040)' }}>
              <div style={{ height: 9, width: 90, borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.7 }} />
              <div style={{ height: 12, width: '70%', borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.5, marginTop: 8 }} />
            </div>
          ))}
        </div>
      )}
      {list && list.length === 0 && !error && (
        <div style={{ padding: '28px 16px', textAlign: 'center', fontFamily: MONO, fontSize: 12.5, color: 'var(--text-muted, #6b6d82)' }}>
          Nothing new.
        </div>
      )}
      {groups.map(g => (
        <section key={g.pid || '—'}>
          <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 14px', background: 'var(--bg-input, #252731)', borderBottom: '1px solid var(--border, #2e3040)', borderTop: '1px solid var(--border, #2e3040)' }}>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: 'var(--accent, #c8963e)' }}>{g.pid || 'General'}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{g.name || ''}</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)' }}>{g.items.length}</span>
          </div>
          {g.items.map(n => <Item key={n.id} n={n} fresh={fresh.has(n.id)} onGo={() => go(n)} onDismiss={() => dismiss([n.id])} />)}
        </section>
      ))}
    </>
  )

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: phone ? '8px 8px 8px 16px' : '10px 10px 10px 14px', borderBottom: '1px solid var(--border, #2e3040)', minHeight: 52 }}>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)' }}>Notifications</span>
      {unreadCount > 0 && <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--red, #b0645b)' }}>{unreadCount} unread</span>}
      <span style={{ flex: 1 }} />
      {list && list.length > 0 && (
        <button type="button" onClick={markAllRead}
          style={{ minHeight: 36, padding: '0 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 11, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
          Mark all read
        </button>
      )}
      {phone && (
        <button type="button" onClick={onClose} aria-label="Close"
          style={{ minHeight: 44, minWidth: 44, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
          Close
        </button>
      )}
    </div>
  )

  const foot = (
    <div style={{ display: 'flex', gap: 8, padding: 10, borderTop: '1px solid var(--border, #2e3040)', background: 'var(--bg-panel, #1e2028)', paddingBottom: phone ? 'calc(10px + env(safe-area-inset-bottom, 0px))' : 10 }}>
      {link('Alert window →', '/alerts')}
      {link('Your day →', '/digest')}
    </div>
  )

  if (phone) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Notifications"
        style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', paddingTop: 'env(safe-area-inset-top, 0px)', fontFamily: SANS }}>
        {head}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--bg-panel, #1e2028)' }}>{body}</div>
        {foot}
      </div>
    )
  }
  return (
    <div role="dialog" aria-label="Notifications"
      style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 380, maxWidth: 'calc(100vw - 24px)', zIndex: 1000, display: 'flex', flexDirection: 'column', maxHeight: '72vh',
               background: 'var(--bg-panel, #1e2028)', color: 'var(--text, #e8e8f0)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, boxShadow: 'var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.3))', overflow: 'hidden', fontFamily: SANS }}>
      {head}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 80 }}>{body}</div>
      {foot}
    </div>
  )
}

/**
 * NotificationBell — mount once, in a header. Needs an AuthProvider above it
 * and a Router (it navigates). `style` goes on the wrapper, which is
 * position: relative so the desktop dropdown anchors to the bell.
 */
export function NotificationBell({ style }) {
  const phone = useIsMobile(640)
  const inbox = useNotifications()
  const { unreadCount, list, markRead, email } = inbox
  const [open, setOpen] = useState(false)
  const [fresh, setFresh] = useState(() => new Set())
  const wrap = useRef(null)

  // Opening marks what is visible as read, once per opening. The dots stay
  // for this opening so "what was new" is still legible.
  useEffect(() => {
    if (!open || !list) return
    const unread = list.filter(n => !n.read_at).map(n => n.id)
    if (unread.length === 0) return
    setFresh(prev => new Set([...prev, ...unread]))
    markRead(unread)
  }, [open, list, markRead])
  const close = useCallback(() => { setOpen(false); setFresh(new Set()) }, [])

  // outside click + Escape (desktop); the phone sheet has its own Close
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!phone && wrap.current && !wrap.current.contains(e.target)) close() }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, phone, close])

  // lock body scroll under the phone sheet
  useEffect(() => {
    if (!(open && phone)) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open, phone])

  if (!email) return null
  const badge = unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null

  return (
    <div ref={wrap} style={{ position: 'relative', display: 'inline-flex', ...style }}>
      <button type="button" onClick={() => (open ? close() : setOpen(true))} aria-haspopup="dialog" aria-expanded={open}
        aria-label={badge ? `Notifications, ${unreadCount} unread` : 'Notifications'} title="Notifications"
        style={{ position: 'relative', width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border, #2e3040)', background: open ? 'var(--bg-input, #252731)' : 'transparent',
                 color: badge ? 'var(--text, #e8e8f0)' : 'var(--text-dim, #9394a8)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                 WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
        <BellIcon />
        {badge && (
          <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--red, #b0645b)', color: '#fff', fontFamily: MONO, fontSize: 10.5, fontWeight: 700, lineHeight: '18px', textAlign: 'center', boxShadow: '0 0 0 2px var(--bg-panel, #1e2028)' }}>
            {badge}
          </span>
        )}
      </button>
      {open && <Panel phone={phone} onClose={close} inbox={inbox} fresh={fresh} />}
    </div>
  )
}

export default NotificationBell
