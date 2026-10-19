import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, anonSupabase } from '../lib/supabase'

// The thread, made visible. One compact horizontal chain per object:
//
//   finding → estimate line → decision → work order item → QC → on site → payment → invoice line
//
// Every one of the eight steps is a slot. A slot is a real node, a "not yet"
// (the chain hasn't got there), a GAP (something downstream exists but the
// link is missing — rendered loudly, never as a shorter chain that looks
// complete), or HIDDEN (this audience may not see it; the server collapses
// hidden steps to one row so counts don't leak).
//
// Data comes from item_lineage(kind, id, token). Staff call it signed in;
// the landlord and vendor pages pass their token through the anon client so a
// staff member who happens to be logged in sees the same slice the vendor does.

const MONO = 'var(--font-mono, monospace)'

const STEPS = [
  { n: 1, short: 'Finding',   long: 'Inspection finding' },
  { n: 2, short: 'Estimate',  long: 'Estimate line' },
  { n: 3, short: 'Landlord',  long: 'Landlord decision' },
  { n: 4, short: 'Work',      long: 'Work order item' },
  { n: 5, short: 'QC',        long: 'QC outcome' },
  { n: 6, short: 'On site',   long: 'Vendor on site' },
  { n: 7, short: 'Paid',      long: 'Payment' },
  { n: 8, short: 'Invoiced',  long: 'Invoice line' },
]

const STATUS_TONE = {
  approved: 'var(--green, #6f9a7e)', verified: 'var(--green, #6f9a7e)', attended: 'var(--green, #6f9a7e)',
  paid: 'var(--green, #6f9a7e)', sent: 'var(--green, #6f9a7e)',
  disputed: 'var(--red, #b0645b)', overdue: 'var(--red, #b0645b)',
  vendor_closed: 'var(--accent, #c8963e)', pending: 'var(--text-muted, #6b6d82)', draft: 'var(--text-muted, #6b6d82)',
  removed: 'var(--text-muted, #6b6d82)', excluded: 'var(--text-muted, #6b6d82)',
}

const fmtDate = (d) => {
  if (!d) return ''
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return ''
  return t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function useLineage(kind, id, { token, enabled = true } = {}) {
  const [state, setState] = useState({ loading: !!enabled, error: null, rows: null })
  const load = useCallback(async () => {
    if (!kind || !id) return
    setState(s => ({ ...s, loading: true, error: null }))
    const client = token ? anonSupabase : supabase
    const { data, error } = await client.rpc('item_lineage', { p_kind: kind, p_id: id, p_token: token ?? null })
    if (error) { setState({ loading: false, error: error.message, rows: null }); return }
    setState({ loading: false, error: null, rows: data || [] })
  }, [kind, id, token])
  useEffect(() => { if (enabled) load() }, [enabled, load])
  return { ...state, reload: load }
}

// Group the flat rows by step so each slot knows what it holds.
function bySteps(rows) {
  const m = new Map(STEPS.map(s => [s.n, []]))
  for (const r of rows) if (m.has(r.step)) m.get(r.step).push(r)
  return m
}

function Slot({ step, rows, onGo, palette }) {
  const [open, setOpen] = useState(false)
  const real = rows.filter(r => r.kind !== 'missing' && r.visible)
  const hidden = rows.some(r => r.visible === false)
  const missing = rows.find(r => r.kind === 'missing')
  const isRoot = real.some(r => r.is_root)
  const head = real.find(r => r.is_root) || real[0]
  const more = real.length - 1

  // What this slot is, in one word, and how loudly to say it.
  let tone, border, bg, text, title
  if (hidden) {
    tone = 'hidden'; border = `1px dashed ${palette.border}`; bg = 'transparent'; text = palette.muted
    title = 'Hidden for this audience'
  } else if (real.length) {
    const c = STATUS_TONE[head.status] || palette.text
    tone = 'node'; border = `1px solid ${isRoot ? palette.accent : palette.border}`; bg = isRoot ? palette.accentFaint : palette.panel; text = c
    title = head.label
  } else if (missing?.is_gap) {
    tone = 'gap'; border = '1px dashed var(--red, #b0645b)'; bg = 'rgba(176,100,91,0.08)'; text = 'var(--red, #b0645b)'
    title = missing.reason
  } else {
    tone = 'notyet'; border = `1px dashed ${palette.border}`; bg = 'transparent'; text = palette.muted
    title = missing?.reason || 'not yet'
  }

  const go = (r) => { if (r?.route) onGo(r) }
  const tappable = tone === 'node' && !!head?.route && !isRoot

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 0 auto', scrollSnapAlign: 'start' }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: isRoot ? palette.accent : palette.muted, fontFamily: MONO, whiteSpace: 'nowrap' }}>
        {step.short}{isRoot ? ' · here' : ''}
      </span>
      <button type="button" title={title}
        onClick={() => {
          if (tone === 'node' && more > 0) setOpen(o => !o)
          else if (tappable) go(head)
          else if (tone === 'gap' || tone === 'notyet' || tone === 'hidden') setOpen(o => !o)
        }}
        aria-expanded={open}
        style={{
          minHeight: 40, maxWidth: 220, padding: '6px 10px', borderRadius: 9, border, background: bg,
          color: text, fontFamily: MONO, fontSize: 11, lineHeight: 1.35, textAlign: 'left',
          cursor: (tappable || more > 0 || tone !== 'node') ? 'pointer' : 'default',
          display: 'flex', flexDirection: 'column', gap: 2, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        }}>
        {tone === 'node' && (
          <>
            <span style={{ color: palette.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{head.label}</span>
            <span style={{ display: 'flex', gap: 8, color: text }}>
              {head.status && <span>{String(head.status).replace(/_/g, ' ')}</span>}
              {head.at && <span style={{ color: palette.muted }}>{fmtDate(head.at)}</span>}
              {more > 0 && <span style={{ color: palette.accent }}>+{more}</span>}
              {tappable && <span style={{ color: palette.muted, marginLeft: 'auto' }}>›</span>}
            </span>
          </>
        )}
        {tone === 'hidden' && <span>🔒 hidden</span>}
        {tone === 'gap' && <span style={{ fontWeight: 700 }}>⚠ {missing.label}</span>}
        {tone === 'notyet' && <span>{missing?.label || 'not yet'}</span>}
      </button>

      {/* Expanded: every node in this step, or the reason the link is missing. */}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
          {tone === 'node' && real.map(r => (
            <button key={r.id || r.label} type="button" onClick={() => go(r)} disabled={!r.route || r.is_root}
              style={{ textAlign: 'left', padding: '6px 9px', borderRadius: 7, border: `1px solid ${r.is_root ? palette.accent : palette.border}`, background: palette.panel, color: palette.text, fontFamily: MONO, fontSize: 10.5, lineHeight: 1.4, cursor: r.route && !r.is_root ? 'pointer' : 'default' }}>
              <div style={{ fontWeight: 600 }}>{r.label}</div>
              <div style={{ color: STATUS_TONE[r.status] || palette.muted, display: 'flex', gap: 8 }}>
                {r.status && <span>{String(r.status).replace(/_/g, ' ')}</span>}
                {r.at && <span style={{ color: palette.muted }}>{fmtDate(r.at)}</span>}
                {r.reason && <span style={{ color: 'var(--amber, #c8963e)' }}>· {r.reason}</span>}
              </div>
            </button>
          ))}
          {tone !== 'node' && (
            <div style={{ padding: '6px 9px', borderRadius: 7, border: `1px solid ${palette.border}`, background: palette.panel, color: tone === 'gap' ? 'var(--red, #b0645b)' : palette.muted, fontFamily: MONO, fontSize: 10.5, lineHeight: 1.45 }}>
              {step.long}: {title}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const DARK = {
  text: 'var(--text, #e8e8f0)', muted: 'var(--text-muted, #6b6d82)', border: 'var(--border, #2e3040)',
  panel: 'var(--bg-input, #252731)', accent: 'var(--accent, #c8963e)', accentFaint: 'rgba(200,150,62,0.12)',
}
// The landlord invoice is a printed, light document with no theme tokens.
const LIGHT = {
  text: '#1a1a1e', muted: '#6b6d82', border: '#d9dbe3', panel: '#f4f5f8', accent: '#9a6f1f', accentFaint: 'rgba(154,111,31,0.10)',
}

/**
 * LineageStrip — the chain for one object.
 *   kind   'inspection_line_item' | 'estimate_item' | 'work_order_item' | 'payment' | 'invoice_item' | 'work_order' | 'estimate' | 'invoice'
 *   id     uuid
 *   token  work-order token or estimate share token on the anon pages; omit for staff
 *   onGo   override navigation (e.g. open a drawer instead of leaving the page)
 */
export function LineageStrip({ kind, id, token, light = false, onGo, style }) {
  const navigate = useNavigate()
  const { loading, error, rows, reload } = useLineage(kind, id, { token })
  const palette = light ? LIGHT : DARK

  const go = useCallback((r) => {
    if (onGo && onGo(r) === true) return
    if (!r.route) return
    const [path, hash] = r.route.split('#')
    const here = window.location.pathname === path
    if (here && hash) {
      window.history.replaceState(null, '', `${path}#${hash}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    } else {
      navigate(r.route)
    }
  }, [navigate, onGo])

  if (loading) {
    return (
      <div className="lineage-strip" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0', ...style }} aria-busy="true" aria-label="Loading lineage">
        {STEPS.map(s => (
          <div key={s.n} style={{ flex: '1 0 auto', minWidth: 84 }}>
            <div style={{ height: 9, width: 40, borderRadius: 3, background: palette.border, marginBottom: 6, opacity: 0.7 }} />
            <div style={{ height: 40, borderRadius: 9, background: palette.panel, border: `1px solid ${palette.border}`, opacity: 0.7 }} />
          </div>
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <div className="lineage-strip" style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(176,100,91,0.32)', background: 'rgba(176,100,91,0.10)', fontFamily: MONO, fontSize: 11, color: 'var(--red, #b0645b)', ...style }}>
        ⚠ Lineage failed: {error}
        <button type="button" onClick={reload} style={{ marginLeft: 10, fontSize: 10.5, color: palette.accent, background: 'none', border: `1px solid ${palette.border}`, borderRadius: 5, padding: '2px 8px', cursor: 'pointer', fontFamily: MONO }}>Retry</button>
      </div>
    )
  }
  if (!rows || rows.length === 0) {
    // A successful empty read: the server had nothing to show this caller.
    return (
      <div className="lineage-strip" style={{ fontFamily: MONO, fontSize: 11, color: palette.muted, ...style }}>
        Lineage not available for this view.
      </div>
    )
  }

  const steps = bySteps(rows)
  // Staff always get all eight. A token audience gets only the steps it may
  // know about, so render exactly what came back — no padding to eight, which
  // would show a vendor "Paid: not yet" about money that is none of theirs.
  const shown = STEPS.filter(s => steps.get(s.n).length > 0)
  const gaps = rows.filter(r => r.kind === 'missing' && r.is_gap).length
  return (
    <div className="lineage-strip" style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0 4px', scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch' }}>
        {shown.map((s, i) => (
          <div key={s.n} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: '1 0 auto' }}>
            <Slot step={s} rows={steps.get(s.n)} onGo={go} palette={palette} />
            {i < shown.length - 1 && <span aria-hidden="true" style={{ color: palette.border, paddingTop: 24, flexShrink: 0 }}>→</span>}
          </div>
        ))}
      </div>
      {gaps > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--red, #b0645b)' }}>
          {gaps} broken link{gaps > 1 ? 's' : ''} in this chain — tap the red slot to see why.
        </div>
      )}
    </div>
  )
}

/**
 * LineageToggle — a one-line "Thread" control that loads the strip on demand.
 * Rows in long lists use this so a page with forty items makes zero RPCs
 * until someone asks.
 */
export function LineageToggle({ kind, id, token, light = false, onGo, label = 'Thread', style }) {
  const [open, setOpen] = useState(false)
  const palette = light ? LIGHT : DARK
  return (
    <div style={style}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ minHeight: 30, padding: '0 10px', borderRadius: 7, border: `1px solid ${open ? palette.accent : palette.border}`, background: open ? palette.accentFaint : 'transparent', color: open ? palette.accent : palette.muted, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: MONO, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
        ⛓ {label}{open ? ' ▾' : ' ▸'}
      </button>
      {open && <LineageStrip kind={kind} id={id} token={token} light={light} onGo={onGo} style={{ marginTop: 8 }} />}
    </div>
  )
}
