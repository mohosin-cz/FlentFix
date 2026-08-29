import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Public page. The token in the URL is the only credential, and this URL gets
// forwarded — so nothing here may show a price, a rate, a total, or anything
// about the landlord. wo_fetch is the only source; anon has no table access.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const OPEN = new Set(['pending', 'disputed'])
const isOpen = (it) => OPEN.has(it.status)

const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null)

const shell = { minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS }
const wrap = { width: '100%', maxWidth: 620, margin: '0 auto', padding: '0 14px calc(120px + env(safe-area-inset-bottom))', boxSizing: 'border-box' }

// ── plain states ─────────────────────────────────────────────────────────────
function Centered({ title, body }) {
  return (
    <div style={{ ...shell, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
        {body && <div style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', marginTop: 8, lineHeight: 1.6 }}>{body}</div>}
      </div>
    </div>
  )
}

function Banner({ tone = 'red', children, onRetry }) {
  const c = tone === 'amber' ? '200,150,62' : '224,92,106'
  const fg = tone === 'amber' ? 'var(--accent, #c8963e)' : 'var(--red, #e05c6a)'
  return (
    <div style={{ padding: '11px 13px', background: `rgba(${c},0.10)`, border: `1px solid rgba(${c},0.32)`, borderRadius: 9, fontSize: 12.5, color: fg, lineHeight: 1.5, fontFamily: MONO, wordBreak: 'break-word' }}>
      {children}
      {onRetry && (
        <button type="button" onClick={onRetry}
          style={{ display: 'block', marginTop: 9, minHeight: 40, padding: '0 14px', background: 'none', border: `1px solid ${fg}`, borderRadius: 7, color: fg, fontSize: 12.5, cursor: 'pointer', fontFamily: MONO }}>
          Try again
        </button>
      )}
    </div>
  )
}

// ── one item ─────────────────────────────────────────────────────────────────
function ItemCard({ item, index, busy, error, onDone, onUndo, closed }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [photoOpen, setPhotoOpen] = useState(false)
  const done = !isOpen(item)
  const sentBack = item.status === 'disputed'

  return (
    <li id={`wo-item-${item.id}`} style={{
      listStyle: 'none',
      background: 'var(--bg-panel, #1e2028)',
      border: `1px solid ${sentBack ? 'rgba(200,150,62,0.42)' : done ? 'rgba(61,186,122,0.30)' : 'var(--border, #2e3040)'}`,
      borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 9,
      opacity: done ? 0.78 : 1,
      scrollMarginTop: 96,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, minWidth: 22, flexShrink: 0, paddingTop: 2 }}>{index}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, lineHeight: 1.45, wordBreak: 'break-word', textDecoration: done ? 'line-through' : 'none' }}>{item.description}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
            {item.fix_type && (
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim, #9394a8)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: '3px 9px', fontFamily: MONO }}>{item.fix_type}</span>
            )}
            {item.quantity != null && (
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-dim, #9394a8)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: '3px 9px', fontFamily: MONO }}>QTY {item.quantity}</span>
            )}
          </div>
        </div>
        {/* Tap to load. The originals are inspection photos straight off a phone —
            ~2.7MB each, and this project has no storage image transform (the
            render endpoint 403s), so auto-loading a dozen would cost tens of
            megabytes on the 4G this page is read over. */}
        {item.photo_path && (
          photoOpen ? (
            <img src={item.photo_path} alt="" loading="lazy" decoding="async"
              style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 9, flexShrink: 0, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)' }} />
          ) : (
            <button type="button" onClick={() => setPhotoOpen(true)} aria-label="Load photo"
              style={{ width: 62, height: 62, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2" /><path d="M21 16l-5-5-4 4-2-2-4 4" />
              </svg>
              <span style={{ fontSize: 9, fontFamily: MONO }}>PHOTO</span>
            </button>
          )
        )}
      </div>

      {/* What they have to buy or carry — the reason this page is read before leaving. */}
      {item.material && (
        <div style={{ padding: '9px 11px', background: 'rgba(107,141,230,0.10)', border: '1px solid rgba(107,141,230,0.34)', borderRadius: 9 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: '#8fa9ee', fontFamily: MONO }}>MATERIAL REQUIRED</div>
          <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', marginTop: 3, lineHeight: 1.4, wordBreak: 'break-word' }}>{item.material}</div>
        </div>
      )}

      {/* Sent back by Flent — still actionable, so it keeps its Mark done. */}
      {sentBack && item.dispute_reason && (
        <Banner tone="amber"><strong>Sent back:</strong> {item.dispute_reason}</Banner>
      )}

      {done && item.vendor_note && (
        <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 }}>Your note: {item.vendor_note}</div>
      )}

      {error && <Banner>{error}</Banner>}

      {done ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>✓ Done</span>
          {/* Tapped the wrong row? Undo it yourself — until Flent has looked at it. */}
          {!closed && item.status === 'vendor_closed' && (
            <button type="button" onClick={onUndo} disabled={busy}
              style={{ marginLeft: 'auto', minHeight: 40, padding: '0 14px', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: SANS, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
              {busy ? '…' : 'Undo'}
            </button>
          )}
          {item.status === 'verified' && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>checked by Flent</span>
          )}
        </div>
      ) : closed ? null : (
        <>
          {noteOpen && (
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Note for Flent (optional)"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', fontSize: 16, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
          )}
          {/* Sized for a thumb (44px) but not a slab — a checklist of thirty
              rows should read as the work, not as thirty green buttons. */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {/* Adding a note is the rare case; it was a button the same size
                and weight as the one action on the row. Still a 44px target,
                just no longer competing to be read first. */}
            {!noteOpen && (
              <button type="button" onClick={() => setNoteOpen(true)} aria-label="Add a note" title="Add a note"
                style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
            <button type="button" onClick={() => onDone(note.trim() || null)} disabled={busy}
              style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '0 17px', borderRadius: 9, border: '1px solid var(--green, #3dba7a)', background: 'rgba(61,186,122,0.14)', color: 'var(--green, #3dba7a)', fontSize: 13.5, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: SANS, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {busy ? 'Saving…' : 'Mark done'}
            </button>
          </div>
        </>
      )}
    </li>
  )
}

const VIEWS = [
  { key: 'todo', label: 'To do', match: isOpen },
  { key: 'done', label: 'Done', match: (i) => !isOpen(i) },
]

// ─────────────────────────────────────────────────────────────────────────────
// Two ways in, one page.
//
// On /wo/:token it is the whole screen, opened from a link. Inside the vendor
// portal it is handed the token directly and drops its own full-height shell so
// it sits in the portal's scroller under the portal's nav. Everything below
// this line — every fetch, every action, every rule — is identical either way;
// a second implementation of a page a vendor signs work off on is how the two
// come to disagree about what was signed.
export default function VendorWorkOrder({ token: tokenProp, embedded, onBack }) {
  const params = useParams()
  const token = tokenProp || params.token
  const [state, setState] = useState('loading')   // loading | ok | invalid | error
  const [wo, setWo] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [itemErr, setItemErr] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [view, setView] = useState('all')

  // The fetch lives inside the effect so nothing writes state synchronously on
  // mount; `state` already starts as 'loading'. Retry bumps reloadKey.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.rpc('wo_fetch', { p_token: token })
      if (!alive) return
      if (error) {
        // Never distinguish "no such token" from "wrong token" — same dead end.
        if (/not found/i.test(error.message)) { setState('invalid'); return }
        setLoadErr(error.message); setState('error'); return
      }
      if (!data) { setState('invalid'); return }
      setWo(data); setState('ok')
    })()
    return () => { alive = false }
  }, [token, reloadKey])

  const retry = () => { setState('loading'); setLoadErr(''); setReloadKey(k => k + 1) }

  // anon gets no realtime (it has no table access, by design), so seeing that
  // Flent sent something back means asking for it.
  const refresh = useCallback(async () => {
    setRefreshing(true)
    const { data, error } = await supabase.rpc('wo_fetch', { p_token: token })
    setRefreshing(false)
    if (!error && data) setWo(data)
  }, [token])

  const items = useMemo(() => wo?.items || [], [wo])
  const openCount = useMemo(() => items.filter(isOpen).length, [items])
  const doneCount = items.length - openCount
  const sentBackCount = useMemo(() => items.filter(i => i.status === 'disputed').length, [items])
  const submitted = wo?.status === 'vendor_completed' || wo?.status === 'verified'
  const closed = wo?.status === 'verified'

  const indexOf = useMemo(() => {
    const m = new Map()
    items.forEach((it, i) => m.set(it.id, i + 1))
    return m
  }, [items])

  const shown = view === 'all' ? items : items.filter(VIEWS.find(v => v.key === view)?.match || (() => true))

  // Grouped by area because that is how the work is walked — room by room,
  // not in one flat list of thirty.
  const byArea = useMemo(() => {
    const m = new Map()
    for (const it of shown) {
      const k = it.area || 'Other'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(it)
    }
    return [...m.entries()]
  }, [shown])

  async function markDone(item, note) {
    setBusyId(item.id)
    setItemErr(p => ({ ...p, [item.id]: '' }))
    const before = wo
    // optimistic — the button is the whole interaction, it should feel instant
    setWo(w => ({ ...w, items: w.items.map(i => (i.id === item.id ? { ...i, status: 'vendor_closed', vendor_note: note || i.vendor_note } : i)) }))
    const { data, error } = await supabase.rpc('wo_close_item', { p_token: token, p_item_id: item.id, p_note: note })
    setBusyId(null)
    if (error) {
      setWo(before)                                    // put it back
      setItemErr(p => ({ ...p, [item.id]: error.message }))
      return
    }
    if (data) setWo(data)
  }

  async function undoDone(item) {
    setBusyId(item.id)
    setItemErr(p => ({ ...p, [item.id]: '' }))
    const before = wo
    setWo(w => ({ ...w, items: w.items.map(i => (i.id === item.id ? { ...i, status: 'pending' } : i)) }))
    const { data, error } = await supabase.rpc('wo_reopen_item', { p_token: token, p_item_id: item.id })
    setBusyId(null)
    if (error) {
      setWo(before)
      setItemErr(p => ({ ...p, [item.id]: error.message }))
      return
    }
    if (data) setWo(data)
  }

  async function submit() {
    setSubmitting(true); setSubmitErr('')
    const { data, error } = await supabase.rpc('wo_submit', { p_token: token })
    setSubmitting(false)
    if (error) { setSubmitErr(error.message); return }
    if (data) setWo(data)
  }

  const jumpToNextOpen = () => {
    setView('todo')
    const next = items.find(isOpen)
    if (next) {
      requestAnimationFrame(() => {
        document.getElementById(`wo-item-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  if (state === 'loading') return <Centered title="Loading…" />
  if (state === 'invalid') return <Centered title="This work order link isn’t valid" body="Check with the Flent team for a current link." />
  if (state === 'error') {
    return (
      <div style={{ ...shell, padding: '24px 14px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <Banner onRetry={retry}>Couldn’t load this work order: {loadErr}</Banner>
        </div>
      </div>
    )
  }

  const dates = [fmtDate(wo.scheduled_start), fmtDate(wo.scheduled_end)].filter(Boolean).join(' → ')
  const pctDone = items.length ? Math.round((doneCount / items.length) * 100) : 0

  return (
    <div style={embedded ? { background: 'transparent' } : shell}>
      {/* Sticky: on a long list the vendor should always be able to see how much
          is left without scrolling back up. */}
      <header style={{ background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', paddingTop: 'env(safe-area-inset-top)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ ...wrap, padding: '12px 14px 11px' }}>
          {embedded && onBack && (
            <button type="button" onClick={onBack}
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>
              ‹ All work orders
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{wo.trade}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>PID {wo.pid}</span>
            <button type="button" onClick={refresh} disabled={refreshing} aria-label="Check for updates"
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 11.5, cursor: refreshing ? 'wait' : 'pointer', fontFamily: MONO, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                style={{ transformOrigin: 'center', animation: refreshing ? 'wo-spin 0.8s linear infinite' : 'none' }}>
                <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
              </svg>
              {refreshing ? '…' : 'Refresh'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, fontSize: 12.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
            {wo.vendor_name && <span>{wo.vendor_name}</span>}
            {dates && <span>{dates}</span>}
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-input, #252731)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pctDone}%`, background: 'var(--green, #3dba7a)', borderRadius: 4, transition: 'width .2s' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 7 }}>
              {/* The filter chips already carry every one of these numbers —
                  "All 10 · To do 10 · Done 0" was being restated as "0 of 10
                  done" on the same line, in a header that is 29% of a phone
                  screen before the first item. */}
              {sentBackCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', border: '1px solid var(--accent, #c8963e)', borderRadius: 10, padding: '2px 8px', fontFamily: MONO }}>
                  {sentBackCount} sent back
                </span>
              )}
              {/* Filling the row rather than huddling at its right end: three
                  equal segments read as one control and give a thumb a third of
                  the width each. */}
              {items.length > 3 && (
                <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6 }}>
                  {[{ key: 'all', label: 'All', n: items.length },
                    { key: 'todo', label: 'To do', n: openCount },
                    { key: 'done', label: 'Done', n: doneCount }].map(v => (
                    <button key={v.key} type="button" onClick={() => setView(v.key)} aria-pressed={view === v.key}
                      style={{ flex: 1, minHeight: 34, padding: '0 8px', borderRadius: 8, fontSize: 11.5, fontFamily: MONO, cursor: 'pointer',
                        border: `1px solid ${view === v.key ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
                        background: view === v.key ? 'rgba(200,150,62,0.14)' : 'transparent',
                        color: view === v.key ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
                        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
                      {v.label} {v.n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <style>{'@keyframes wo-spin{to{transform:rotate(360deg)}}'}</style>
      </header>

      <main style={wrap}>
        {submitted && (
          <div style={{ margin: '14px 0', padding: '15px 14px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.34)', borderRadius: 11 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green, #3dba7a)' }}>
              {closed ? 'Verified — thank you' : 'Waiting for Flent to verify'}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)', marginTop: 5, lineHeight: 1.55 }}>
              {closed
                ? 'This work order is closed. Nothing else to do.'
                : 'You’ve sent all items. Flent will check them and come back to you if anything needs another look. You can still undo an item until they do.'}
            </div>
          </div>
        )}

        {wo.notes && (
          <div style={{ margin: '14px 0', padding: '12px 13px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 11 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>NOTES</div>
            <div style={{ fontSize: 13.5, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{wo.notes}</div>
          </div>
        )}

        {items.length === 0 ? (
          <div style={{ margin: '20px 0', padding: '30px 18px', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 11, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nothing on this work order yet</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', marginTop: 5 }}>Check with the Flent team before starting.</div>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ margin: '20px 0', padding: '30px 18px', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 11, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {view === 'todo' ? 'Nothing left to do' : 'Nothing done yet'}
            </div>
            <button type="button" onClick={() => setView('all')}
              style={{ marginTop: 10, minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12.5, cursor: 'pointer', fontFamily: MONO }}>
              Show all {items.length}
            </button>
          </div>
        ) : (
          byArea.map(([area, rows]) => (
            <section key={area} style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{area}</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{rows.length}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--border, #2e3040)' }} />
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 11, margin: 0, padding: 0 }}>
                {rows.map(it => (
                  <ItemCard
                    key={it.id}
                    item={it}
                    index={indexOf.get(it.id)}
                    busy={busyId === it.id}
                    error={itemErr[it.id]}
                    closed={closed}
                    onDone={(note) => markDone(it, note)}
                    onUndo={() => undoDone(it)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      {/* The submit bar is fixed to the viewport, so inside the portal it has
          to clear the portal's own tab bar rather than sit on top of it. */}
      {!closed && items.length > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: embedded ? 'calc(53px + env(safe-area-inset-bottom))' : 0, background: 'var(--bg-panel, #1e2028)', borderTop: '1px solid var(--border, #2e3040)', padding: embedded ? '11px 14px' : '11px 14px calc(11px + env(safe-area-inset-bottom))', zIndex: 20 }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            {submitErr && <div style={{ marginBottom: 9 }}><Banner>{submitErr}</Banner></div>}
            {/* A dead disabled button wastes the most reachable control on the
                screen. While work remains it takes you to the next open item. */}
            <button type="button"
              onClick={openCount > 0 ? jumpToNextOpen : submit}
              disabled={submitting || (submitted && openCount === 0)}
              style={{
                width: '100%', minHeight: 54, borderRadius: 11,
                border: openCount > 0 ? '1px solid var(--border, #2e3040)' : 'none',
                background: openCount > 0 ? 'var(--bg-input, #252731)' : 'var(--green, #3dba7a)',
                color: openCount > 0 ? 'var(--text-dim, #9394a8)' : '#062012',
                fontSize: 15.5, fontWeight: 700, fontFamily: SANS,
                cursor: submitting ? 'wait' : 'pointer',
                WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
              }}>
              {submitting ? 'Sending…'
                : openCount > 0 ? `${openCount} still open — go to next`
                : submitted ? 'Sent — waiting for Flent' : 'Submit for verification'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
