import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useIsMobile } from '../../hooks/useIsMobile'
import { useCommandState, openCommand, closeCommand, toggleCommand } from './commandStore'
import { useSearchIndex, scoreFields, ensureIndex } from './useSearchIndex'

// One way in. ⌘K / Ctrl-K from anywhere, or the CommandTrigger in a header,
// or a two-key chord. Mount <CommandSurface /> once, inside the router; it
// renders nothing until opened and is inert without a staff session or on a
// public (token / portal) route — a vendor on /attend with a staff member's
// session still in the browser must never see staff data.
//
//   ACTIONS     context-aware: on /properties/:pid the property's own actions
//               lead; otherwise the global ones. Chords shown as keycaps.
//   RECENT      last 8 things opened from here (empty query only)
//   PROPERTIES  local cache: "214 · Rose Villa · QC pending, 3 days"
//   VENDORS     local cache
//   WORK ORDERS · ESTIMATES · INVOICES   the long tail, from command_search()
//
// Keys: ↑↓ move · ↵ open · ⌘↵ the property's next action · Tab next section
// · Esc close. Chords (palette closed, not typing, 1s window):
//   G H home · G N new home · G P properties · G V vendors · G A payments
//   analytics · G U utilities · G W work orders · G O open property
//   N I new inspection · N E create estimate · L P log payment
// A chord that needs a property, pressed outside one, opens the palette with
// that intent: pick a property and it completes.

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'
const RECENT_KEY = 'pulse.cmd.recent.v1'
const RECENT_MAX = 8
const CHORD_WINDOW_MS = 1000
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')

// Public and token routes. Mirrors FloatingNav's list for the same reason.
const INERT_ON = ['/login', '/signup', '/reset-password', '/wo/', '/db/', '/vi/', '/attend', '/onboard', '/e/', '/rate-card', '/inventory/public-rc', '/asset-request']

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Same words as Home2.ago() and command_age() in SQL — one vocabulary for age.
function ago(since, ageDays) {
  if (ageDays == null) return ''
  if (ageDays === 0) return 'today'
  if (ageDays === 1) return 'yesterday'
  if (ageDays < 7 && since) return `since ${WEEKDAYS[new Date(since).getDay()]}`
  if (ageDays < 30) return `${ageDays} days`
  if (ageDays < 60) return 'over a month'
  return `${Math.round(ageDays / 30)} months`
}

function pidFromPath(pathname) {
  const m = pathname.match(/^\/properties\/([^/]+)/)
  if (!m) return null
  const pid = decodeURIComponent(m[1])
  return ['payments', 'archive', 'bin'].includes(pid) ? null : pid
}

// ─── actions & chords ────────────────────────────────────────────────────────

const INTENT = {
  open:        { label: 'Open property',  route: pid => `/properties/${encodeURIComponent(pid)}` },
  estimate:    { label: 'Create estimate', route: pid => `/properties/${encodeURIComponent(pid)}/estimates` },
  payment:     { label: 'Log payment',     route: pid => `/properties/${encodeURIComponent(pid)}/payments` },
  work_orders: { label: 'Work orders',     route: pid => `/properties/${encodeURIComponent(pid)}/work-orders` },
  utilities:   { label: 'Utilities',       route: pid => `/properties/${encodeURIComponent(pid)}/utilities` },
}

const PROPERTY_ACTIONS = [
  { id: 'estimate',    intent: 'estimate',    chord: 'N E' },
  { id: 'payment',     intent: 'payment',     chord: 'L P' },
  { id: 'work_orders', intent: 'work_orders', chord: 'G W' },
  { id: 'utilities',   intent: 'utilities',   chord: 'G U' },
  { id: 'open',        intent: 'open',        chord: 'G O' },
]

const GLOBAL_ACTIONS = [
  { id: 'new_inspection',     label: 'New inspection',     route: '/inspections/new',     chord: 'N I' },
  { id: 'home',               label: 'Home',               route: '/',                    chord: 'G H' },
  { id: 'home2',              label: 'New home',           route: '/home2',               chord: 'G N' },
  { id: 'properties',         label: 'Properties',         route: '/properties',          chord: 'G P' },
  { id: 'vendors',            label: 'Vendors',            route: '/vendors',             chord: 'G V' },
  { id: 'payments_analytics', label: 'Payments analytics', route: '/properties/payments', chord: 'G A' },
  { id: 'utilities_all',      label: 'Utilities overview', route: '/utilities',           chord: 'G U' },
]

// chord → a route string, or { intent } when it needs a property it hasn't got
const CHORDS = {
  'g h': () => '/',
  'g n': () => '/home2',
  'g p': () => '/properties',
  'g v': () => '/vendors',
  'g a': () => '/properties/payments',
  'n i': () => '/inspections/new',
  'g u': pid => pid ? INTENT.utilities.route(pid) : '/utilities',
  'g w': pid => pid ? INTENT.work_orders.route(pid) : { intent: 'work_orders' },
  'g o': pid => pid ? INTENT.open.route(pid) : { intent: 'open' },
  'n e': pid => pid ? INTENT.estimate.route(pid) : { intent: 'estimate' },
  'l p': pid => pid ? INTENT.payment.route(pid) : { intent: 'payment' },
}
const CHORD_STARTS = new Set(Object.keys(CHORDS).map(c => c[0]))

function isTypingTarget(el) {
  if (!el || el === document.body) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

// ─── recent ──────────────────────────────────────────────────────────────────

function loadRecent() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(v) ? v.filter(r => r && r.kind && r.id && r.route) : []
  } catch { return [] }
}
function pushRecent(item) {
  try {
    const slim = { kind: item.kind, id: item.id, pid: item.pid ?? null, label: item.label, sub: item.sub ?? '', route: item.route, at: Date.now() }
    const rest = loadRecent().filter(r => !(r.kind === slim.kind && r.id === slim.id))
    localStorage.setItem(RECENT_KEY, JSON.stringify([slim, ...rest].slice(0, RECENT_MAX)))
  } catch { /* private window */ }
}

// ─── pieces ──────────────────────────────────────────────────────────────────

const KIND_TAG = { vendor: 'VND', work_order: 'WO', estimate: 'EST', invoice: 'INV', action: '→', recent: '↺' }
const SECTION_LABEL = { action: 'Actions', recent: 'Recent', property: 'Properties', vendor: 'Vendors', work_order: 'Work orders', estimate: 'Estimates', invoice: 'Invoices' }

export function Keys({ chord, dim }) {
  if (!chord) return null
  return (
    <span aria-label={`shortcut ${chord}`} style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
      {chord.split(' ').map((k, i) => (
        <kbd key={i} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, minWidth: 18, padding: '1px 5px', textAlign: 'center', lineHeight: '16px',
                              border: '1px solid var(--border, #2e3040)', borderBottomWidth: 2, borderRadius: 4,
                              background: 'var(--bg-input, #252731)', color: dim ? 'var(--text-muted, #6b6d82)' : 'var(--text-dim, #9394a8)' }}>
          {k}
        </kbd>
      ))}
    </span>
  )
}

function SectionHead({ label, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 14px 4px', position: 'sticky', top: 0, background: 'var(--bg-panel, #1e2028)', zIndex: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{label}</span>
      {hint && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginLeft: 'auto' }}>{hint}</span>}
    </div>
  )
}

function Row({ item, active, phone, onPick, onHover, idx }) {
  const isProp = item.kind === 'property'
  const tag = isProp ? item.pid : (KIND_TAG[item.kind] || '')
  return (
    <button type="button" role="option" aria-selected={active} data-idx={idx} id={`pulse-cmd-opt-${idx}`}
      onClick={e => onPick(item, e.metaKey || e.ctrlKey)} onMouseMove={() => onHover(idx)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: phone ? 56 : 46, padding: '7px 14px 7px 12px', textAlign: 'left',
               background: active ? 'var(--bg-input, #252731)' : 'none', border: 'none',
               borderLeft: `2px solid ${active ? 'var(--accent, #c8963e)' : 'transparent'}`, cursor: 'pointer',
               color: 'var(--text, #e8e8f0)', fontFamily: SANS, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
      <span style={{ fontFamily: MONO, fontSize: isProp ? 12 : 9.5, fontWeight: isProp ? 500 : 700, letterSpacing: isProp ? 0 : '0.08em',
                     color: isProp ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', minWidth: 34, flexShrink: 0 }}>
        {tag}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.label}
          {!isProp && item.pid && <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--text-dim, #9394a8)', marginLeft: 8 }}>{item.pid}</span>}
        </span>
        {item.sub && (
          <span style={{ display: 'block', fontSize: 11, fontFamily: MONO, marginTop: 2, color: item.tone || 'var(--text-muted, #6b6d82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.sub}
          </span>
        )}
      </span>
      {item.chord && <Keys chord={item.chord} dim={!active} />}
      {!phone && active && !item.chord && item.altLabel && (
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <kbd style={{ fontFamily: MONO, border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '0 4px', marginRight: 6, color: 'var(--text-dim, #9394a8)' }}>{IS_MAC ? '⌘' : 'Ctrl'}↵</kbd>
          {item.altLabel}
        </span>
      )}
      {!phone && active && !item.chord && !item.altLabel && <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>↵</span>}
      {phone && <span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 18, flexShrink: 0 }}>›</span>}
    </button>
  )
}

// ─── the surface ─────────────────────────────────────────────────────────────

export default function CommandSurface() {
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const phone = useIsMobile(640)
  const store = useCommandState()

  const inert = !session || INERT_ON.some(r => location.pathname.startsWith(r))
  const open = store.open && !inert
  const ctxPid = store.pid || pidFromPath(location.pathname)
  const intent = store.intent

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pendingChord, setPendingChord] = useState(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const returnFocus = useRef(null)
  const chordRef = useRef({ key: null, timer: null })

  // Preload the local index once the app is up, so the first ⌘K is instant.
  useEffect(() => {
    if (inert) return
    const t = setTimeout(() => ensureIndex(), 1200)
    return () => clearTimeout(t)
  }, [inert])

  // Each open starts from the store's query; the store bumps openedAt per open.
  useEffect(() => {
    if (!open) return
    setQuery(store.query || '')
    setActive(0)
    returnFocus.current = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prevOverflow
      const el = returnFocus.current
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus()
    }
  }, [open, store.openedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  const { properties, vendors, remote, searching, searched, indexReady, indexError, remoteError, allProperties } =
    useSearchIndex(query, { enabled: open })
  const q = query.trim().toLowerCase()
  const ctxName = useMemo(() => ctxPid ? (allProperties.find(p => p.pid === ctxPid)?.name || '') : '', [ctxPid, allProperties])

  const go = useCallback((route) => {
    if (!route) return
    const [path, hash] = route.split('#')
    if (hash && window.location.pathname === path) {
      window.history.replaceState(null, '', `${path}#${hash}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    } else {
      navigate(route)
    }
  }, [navigate])

  // ── global keys: ⌘K, chords ──
  useEffect(() => {
    if (inert) return
    const clearChord = () => {
      if (chordRef.current.timer) clearTimeout(chordRef.current.timer)
      chordRef.current = { key: null, timer: null }
      setPendingChord(null)
    }
    const onKey = (e) => {
      const key = (e.key || '').toLowerCase()
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && key === 'k') {
        if (isTypingTarget(e.target) && e.target !== inputRef.current) return
        e.preventDefault()
        toggleCommand({ pid: pidFromPath(window.location.pathname) })
        return
      }
      if (store.open) return                      // the input owns the keys while open
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      if (chordRef.current.key) {
        const chord = `${chordRef.current.key} ${key}`
        clearChord()
        const fn = CHORDS[chord]
        if (!fn) return
        e.preventDefault()
        const out = fn(pidFromPath(window.location.pathname))
        if (typeof out === 'string') go(out)
        else if (out && out.intent) openCommand({ intent: out.intent })
        return
      }
      if (CHORD_STARTS.has(key) && key.length === 1) {
        chordRef.current = { key, timer: setTimeout(clearChord, CHORD_WINDOW_MS) }
        setPendingChord(key.toUpperCase())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearChord() }
  }, [inert, store.open, go])

  // ── items ──
  const sections = useMemo(() => {
    if (!open) return []
    const out = []
    const push = (section, rows) => { if (rows.length) out.push({ section, rows }) }

    // ACTIONS
    if (!intent) {
      let actions = []
      if (ctxPid) {
        actions = PROPERTY_ACTIONS.map(a => ({ kind: 'action', id: a.id, label: INTENT[a.intent].label, sub: `${ctxPid}${ctxName ? ' · ' + ctxName : ''}`, route: INTENT[a.intent].route(ctxPid), chord: a.chord }))
      }
      for (const a of GLOBAL_ACTIONS) {
        actions.push({ kind: 'action', id: a.id, label: a.label, sub: a.route, route: a.route, chord: ctxPid && a.id === 'utilities_all' ? null : a.chord })
      }
      if (q) {
        actions = actions.map(a => ({ a, s: scoreFields(q, [a.label]) })).filter(x => x.s > 0).sort((x, y) => y.s - x.s).map(x => x.a)
      }
      push('action', actions)
    }

    // RECENT (empty query, no intent)
    if (!q && !intent) {
      push('recent', loadRecent().map(r => ({ ...r, section: 'recent' })))
    }

    // PROPERTIES — the local cache, or all of them when an intent is waiting
    const propRows = (q ? properties : (intent ? allProperties : [])).map(p => ({
      kind: 'property', id: p.pid, pid: p.pid, label: p.name || 'Unnamed property',
      sub: `${p.stage_label || 'No stage'} · ${ago(p.since, p.age_days)}`,
      tone: p.urgency === 'overdue' ? 'var(--red, #e05c6a)' : undefined,
      route: INTENT.open.route(p.pid), altRoute: p.next_action_route || null, altLabel: p.next_action_label || null,
    }))
    for (const r of remote.property) propRows.push({ kind: 'property', id: r.pid, pid: r.pid, label: r.label, sub: r.sub, route: r.route })
    push('property', propRows)

    // VENDORS
    const vendRows = vendors.map(v => ({ kind: 'vendor', id: v.id, pid: null, label: v.full_name || v.vendor_code, sub: [v.trade, String(v.status || '').replace(/_/g, ' ')].filter(Boolean).join(' · '), route: '/vendors' }))
    for (const r of remote.vendor) vendRows.push({ kind: 'vendor', id: r.id, pid: null, label: r.label, sub: r.sub, route: r.route })
    push('vendor', vendRows)

    // LONG TAIL
    for (const k of ['work_order', 'estimate', 'invoice']) {
      push(k, remote[k].map(r => ({ kind: k, id: r.id, pid: r.pid, label: r.label, sub: r.sub, route: r.route })))
    }
    return out
  }, [open, q, intent, ctxPid, ctxName, properties, vendors, remote, allProperties])

  const items = useMemo(() => sections.flatMap(s => s.rows.map(r => ({ ...r, section: s.section }))), [sections])
  useEffect(() => { setActive(0) }, [q, intent])
  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1))
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, items.length])

  const pick = useCallback((item, alt) => {
    if (!item) return
    let route = item.route
    if (intent && item.kind === 'property') route = INTENT[intent].route(item.pid)
    else if (alt && item.altRoute) route = item.altRoute
    if (item.kind !== 'action') pushRecent(item)
    closeCommand()
    go(route)
  }, [intent, go])

  const onInputKey = (e) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); if (items.length) setActive(i => (i + 1) % items.length); break
      case 'ArrowUp':   e.preventDefault(); if (items.length) setActive(i => (i - 1 + items.length) % items.length); break
      case 'Home':      if (items.length) { e.preventDefault(); setActive(0) } break
      case 'End':       if (items.length) { e.preventDefault(); setActive(items.length - 1) } break
      case 'Tab': {
        // cycle sections: jump to the first row of the next (or previous) section
        if (!items.length) break
        e.preventDefault()
        const cur = items[active]?.section
        const order = sections.map(s => s.section)
        const ci = order.indexOf(cur)
        const ni = (ci + (e.shiftKey ? -1 : 1) + order.length) % order.length
        setActive(items.findIndex(it => it.section === order[ni]))
        break
      }
      case 'Enter':     e.preventDefault(); pick(items[active], e.metaKey || e.ctrlKey); break
      case 'Escape':    e.preventDefault(); closeCommand(); break
      default: break
    }
  }

  // ── render ──
  // The pending-chord pill is the only thing drawn while closed.
  if (!open) {
    return pendingChord ? (
      <div aria-live="polite" style={{ position: 'fixed', right: 16, bottom: phone ? 'calc(72px + env(safe-area-inset-bottom, 0px))' : 20, zIndex: 10000, display: 'flex', alignItems: 'center', gap: 6,
                                       padding: '6px 10px', borderRadius: 8, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', boxShadow: '0 8px 24px var(--shadow-card, rgba(0,0,0,0.38))' }}>
        <Keys chord={`${pendingChord} …`} />
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)' }}>then {pendingChord === 'G' ? 'H P V A U W O' : pendingChord === 'N' ? 'I E' : 'P'}</span>
      </div>
    ) : null
  }

  const nothing = !!q && items.length === 0 && !searching
  const placeholder = intent ? `${INTENT[intent].label} for which property?` : (ctxPid ? `Search, or act on ${ctxPid}…` : 'Search properties, vendors, work orders… or an action')
  const activeId = items[active] ? `pulse-cmd-opt-${active}` : undefined

  const input = (
    <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onInputKey}
      placeholder={placeholder} aria-label="Search or jump to" role="combobox" aria-expanded="true" aria-controls="pulse-cmd-list" aria-activedescendant={activeId} aria-autocomplete="list"
      inputMode="search" enterKeyHint="go" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off"
      style={{ flex: 1, minWidth: 0, minHeight: 44, padding: '0 4px', background: 'none', border: 'none', outline: 'none',
               color: 'var(--text, #e8e8f0)', fontFamily: SANS, fontSize: 16, caretColor: 'var(--accent, #c8963e)' }} />
  )

  const list = (
    <div ref={listRef} id="pulse-cmd-list" role="listbox" aria-label="Results" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', paddingBottom: phone ? 'calc(16px + env(safe-area-inset-bottom, 0px))' : 8 }}>
      {intent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border, #2e3040)', background: 'rgba(200,150,62,0.08)' }}>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--accent, #c8963e)', flex: 1 }}>{INTENT[intent].label} — pick a property</span>
          <button type="button" onClick={() => openCommand({ pid: ctxPid, query })}
            style={{ minHeight: 32, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>
            cancel
          </button>
        </div>
      )}
      {(() => { let idx = -1; return sections.map(s => (
        <div key={s.section} role="group" aria-label={SECTION_LABEL[s.section]}>
          <SectionHead label={SECTION_LABEL[s.section]} hint={s.section === 'property' && intent && !q ? `${s.rows.length} live` : undefined} />
          {s.rows.map(r => { idx++; const i = idx; return (
            <Row key={`${s.section}:${r.kind}:${r.id}`} item={items[i]} idx={i} active={i === active} phone={phone} onPick={pick} onHover={setActive} />
          ) })}
        </div>
      )) })()}

      {/* states — words, never a spinner in place of results */}
      {searching && (
        <div style={{ padding: '10px 14px', fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>searching work orders, estimates, invoices…</div>
      )}
      {nothing && (
        <div style={{ padding: '22px 14px', fontFamily: MONO, fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5 }}>
          Nothing for ‘{query.trim()}’.
          {remoteError && <div style={{ fontSize: 11, marginTop: 6, color: 'var(--red, #e05c6a)' }}>Long-tail search failed: {remoteError}</div>}
          {!searched && !remoteError && q.length < 2 && <div style={{ fontSize: 11, marginTop: 6 }}>Type one more character to search work orders, estimates and invoices.</div>}
        </div>
      )}
      {!q && !intent && !indexReady && !indexError && (
        <div style={{ padding: '10px 14px', fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>loading your properties and vendors…</div>
      )}
      {indexError && (
        <div style={{ margin: '8px 14px', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(224,92,106,0.32)', background: 'rgba(224,92,106,0.10)', fontFamily: MONO, fontSize: 11, color: 'var(--red, #e05c6a)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>Couldn't load the index — {indexError}</span>
          <button type="button" onClick={() => ensureIndex({ force: true })} style={{ minHeight: 30, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 11, cursor: 'pointer' }}>Retry</button>
        </div>
      )}
      {!q && !intent && indexReady && (
        <div style={{ padding: '14px 14px 6px', fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.6 }}>
          Type a PID, a name, a vendor, a trade. {!phone && <>Two-key chords work with this closed: <Keys chord="G P" /> properties, <Keys chord="N I" /> new inspection.</>}
        </div>
      )}
    </div>
  )

  if (phone) {
    return (
      <div role="dialog" aria-modal="true" aria-label="Search and actions"
           style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', flexDirection: 'column', background: 'var(--bg-panel, #1e2028)', color: 'var(--text, #e8e8f0)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 6px 14px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          <span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 16 }}>⌕</span>
          {input}
          <button type="button" onClick={closeCommand}
            style={{ minHeight: 44, minWidth: 64, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 12, fontWeight: 600, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
            Close
          </button>
        </div>
        {list}
      </div>
    )
  }

  return (
    <div onMouseDown={closeCommand}
         style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(8,9,13,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 16px 16px' }}>
      <div role="dialog" aria-modal="true" aria-label="Search and actions" onMouseDown={e => e.stopPropagation()}
           style={{ width: 'min(640px, 100%)', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
                    background: 'var(--bg-panel, #1e2028)', color: 'var(--text, #e8e8f0)', border: '1px solid var(--border, #2e3040)', borderRadius: 14,
                    boxShadow: '0 24px 64px var(--shadow-card, rgba(0,0,0,0.38))', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 4px 16px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          <span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 16 }}>⌕</span>
          {input}
          {ctxPid && !intent && (
            <span title={ctxName || undefined} style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--accent, #c8963e)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
              {ctxPid}
            </span>
          )}
          <kbd style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '1px 5px' }}>esc</kbd>
        </div>
        {list}
        <div style={{ display: 'flex', gap: 14, padding: '7px 14px', borderTop: '1px solid var(--border, #2e3040)', fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', flexShrink: 0, flexWrap: 'wrap' }}>
          <span>↑↓ move</span><span>↵ open</span><span>{IS_MAC ? '⌘' : 'Ctrl'}↵ next action</span><span>tab section</span>
          <span style={{ marginLeft: 'auto' }}>{IS_MAC ? '⌘' : 'Ctrl'} K anywhere</span>
        </div>
      </div>
    </div>
  )
}
