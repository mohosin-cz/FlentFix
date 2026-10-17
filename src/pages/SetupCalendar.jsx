import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'

// Setup calendar: what is happening on which day across all properties.
// One read, setup_calendar(from, to), merges
//   · Flent-Stage's dates (setups, revamps, inspections, handovers, key
//     handover, move-ins, go-live) — a snapshot synced by scripts/stage-sync.py
//   · Pulse's own setup and handover dates
//   · vendors per day from Pulse work orders, with double-bookings
//   · setup dates where Stage and Pulse disagree
// Month grid on desktop, a day-by-day agenda on a phone; a day opens its detail.

const MONO = 'var(--font-mono, monospace)'
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)',
  accent: 'var(--accent, #c8963e)', green: 'var(--green, #3dba7a)', red: 'var(--red, #e05c6a)',
}
const KINDS = {
  setup:        { label: 'Setup',        fg: '#c8963e', bg: 'rgba(200,150,62,0.14)' },
  revamp:       { label: 'Revamp',       fg: '#b08ae0', bg: 'rgba(176,138,224,0.14)' },
  inspection:   { label: 'Inspection',   fg: '#9394a8', bg: 'rgba(147,148,168,0.14)' },
  handover:     { label: 'Handover',     fg: '#3dba7a', bg: 'rgba(61,186,122,0.14)' },
  key_handover: { label: 'Key handover', fg: '#62c79a', bg: 'rgba(98,199,154,0.10)' },
  move_in:      { label: 'Move-in',      fg: '#5fa8e8', bg: 'rgba(95,168,232,0.14)' },
  go_live:      { label: 'Go-live',      fg: '#4fc3c8', bg: 'rgba(79,195,200,0.12)' },
}
const ORDER = ['setup', 'revamp', 'handover', 'key_handover', 'move_in', 'go_live', 'inspection']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s) => new Date(s + 'T00:00:00')
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const first = (email) => { const s = (email || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '' }
const cleanName = (name, pid) => (name || '').replace(new RegExp(`^(PID)?${String(pid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·:-]?\\s*`, 'i'), '') || name
function ago(at) {
  if (!at) return 'never'
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, m)}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

// The grid shows whole weeks, Monday first, around the month.
function monthWindow(anchor) {
  const firstDay = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const start = addDays(firstDay, -((firstDay.getDay() + 6) % 7))
  const end = addDays(lastDay, 6 - ((lastDay.getDay() + 6) % 7))
  return { start, end }
}

export default function SetupCalendar() {
  const navigate = useNavigate()
  const phone = useIsMobile(760)
  const { session } = useAuth()
  const me = (session?.user?.email || '').toLowerCase()
  const [anchor, setAnchor] = useState(() => { const t = parse(todayIso()); return new Date(t.getFullYear(), t.getMonth(), 1) })
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [on, setOn] = useState(() => { try { return JSON.parse(localStorage.getItem('pulse.cal.kinds')) || {} } catch { return {} } })
  const [mine, setMine] = useState(false)
  const [day, setDay] = useState(null)
  useEffect(() => { try { localStorage.setItem('pulse.cal.kinds', JSON.stringify(on)) } catch { /* private window */ } }, [on])
  const shown = (k) => on[k] !== false

  const { start, end } = useMemo(() => monthWindow(anchor), [anchor])
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    const { data, error } = await supabase.rpc('setup_calendar', { p_from: iso(start), p_to: iso(end) })
    setState({ loading: false, error: error ? error.message : null, data })
  }, [start, end])
  useEffect(() => { load() }, [load])

  // One entry per property/kind/day: when Stage and Pulse both carry the
  // same date it shows once, marked with both sources.
  const byDay = useMemo(() => {
    const m = new Map()
    for (const e of state.data?.events || []) {
      if (!shown(e.kind) || (mine && e.owner !== me)) continue
      const list = m.get(e.date) || []
      const twin = list.find(x => x.pid === e.pid && x.kind === e.kind)
      if (twin) { twin.src = [...new Set([...twin.src, e.src])]; twin.actual ||= e.state === 'actual'; twin.detail = { ...twin.detail, ...e.detail } }
      else list.push({ ...e, src: [e.src], actual: e.state === 'actual' })
      m.set(e.date, list)
    }
    for (const list of m.values()) list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || String(a.pid).localeCompare(String(b.pid), undefined, { numeric: true }))
    return m
  }, [state.data, on, mine, me])
  const vendorsByDay = useMemo(() => {
    const m = new Map()
    if (!shown('vendors')) return m
    for (const v of state.data?.vendors || []) { const l = m.get(v.day) || []; l.push(v); m.set(v.day, l) }
    return m
  }, [state.data, on])
  const clashes = state.data?.clashes || []

  const days = []
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(iso(d))
  const t = todayIso()
  const monthLabel = anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const move = (n) => { setAnchor(a => new Date(a.getFullYear(), a.getMonth() + n, 1)); setDay(null) }

  const chip = (k, label, fg, bg) => {
    const active = shown(k)
    return (
      <button key={k} type="button" aria-pressed={active} onClick={() => setOn(o => ({ ...o, [k]: !active }))}
        style={{ minHeight: 32, padding: '0 10px', borderRadius: 8, border: `1px solid ${active ? fg : C.border}`, background: active ? bg : 'transparent',
                 color: active ? fg : C.muted, fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
    )
  }
  const btn = { minHeight: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.dim, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, color: C.text, fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <AppHeader />
      <main style={{ padding: phone ? '12px 12px 96px' : '16px 20px 40px', display: 'grid', gap: 12 }}>
        {/* title + month */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Setup calendar</h1>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <button type="button" style={btn} onClick={() => move(-1)} aria-label="Previous month">‹</button>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, minWidth: 128, textAlign: 'center' }}>{monthLabel}</span>
            <button type="button" style={btn} onClick={() => move(1)} aria-label="Next month">›</button>
            <button type="button" style={btn} onClick={() => { const x = parse(t); setAnchor(new Date(x.getFullYear(), x.getMonth(), 1)); setDay(t) }}>Today</button>
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, color: C.muted }} title="Flent-Stage dates are a snapshot; run scripts/stage-sync.py to refresh">
            Flent-Stage synced {ago(state.data?.synced_at)}
          </span>
        </div>

        {/* filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {ORDER.map(k => chip(k, KINDS[k].label, KINDS[k].fg, KINDS[k].bg))}
          {chip('vendors', 'Vendors', '#e8e8f0', 'rgba(232,232,240,0.08)')}
          <span style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
          <button type="button" aria-pressed={mine} onClick={() => setMine(m => !m)}
            style={{ ...btn, minHeight: 32, borderColor: mine ? 'rgba(200,150,62,0.45)' : C.border, color: mine ? C.accent : C.dim, background: mine ? 'rgba(200,150,62,0.12)' : C.input }}>Only my properties</button>
        </div>

        {clashes.length > 0 && (
          <div role="status" style={{ border: `1px solid ${C.red}`, background: 'rgba(224,92,106,0.10)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
            <b style={{ color: C.red }}>Stage and Pulse disagree on {clashes.length} setup date{clashes.length === 1 ? '' : 's'}:</b>{' '}
            {clashes.map((c, i) => (
              <span key={c.pid}>{i ? ' · ' : ''}
                <button type="button" onClick={() => navigate(`/properties/${encodeURIComponent(c.pid)}`)} style={{ background: 'none', border: 'none', padding: 0, color: C.accent, fontFamily: MONO, cursor: 'pointer' }}>{c.pid}</button>
                {' '}Stage {parse(c.stage_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, Pulse {parse(c.pulse_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            ))}
            <span style={{ color: C.dim }}> — fix whichever is wrong.</span>
          </div>
        )}

        {state.error ? (
          <div style={{ padding: 16, fontFamily: MONO, fontSize: 12.5, color: /setup_calendar|does not exist|schema cache/i.test(state.error) ? C.muted : C.red }}>
            {/setup_calendar|does not exist|schema cache/i.test(state.error) ? 'The calendar appears once the setup_calendar migration is applied.' : `Couldn't load the calendar — ${state.error}`}
          </div>
        ) : phone ? (
          <Agenda days={days.filter(d => d.slice(0, 7) === iso(anchor).slice(0, 7))} byDay={byDay} vendorsByDay={vendorsByDay} today={t} navigate={navigate} loading={state.loading} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: day ? 'minmax(0,1fr) 360px' : 'minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: C.panel, opacity: state.loading ? 0.6 : 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', borderBottom: `1px solid ${C.border}` }}>
                {WEEKDAYS.map(w => <div key={w} style={{ padding: '8px 10px', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>{w}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))' }}>
                {days.map((d, i) => {
                  const inMonth = d.slice(0, 7) === iso(anchor).slice(0, 7)
                  const evs = byDay.get(d) || [], vs = vendorsByDay.get(d) || []
                  const dbl = vs.filter(v => v.double).length
                  const sel = d === day
                  return (
                    <button key={d} type="button" onClick={() => setDay(sel ? null : d)}
                      style={{ minHeight: 118, textAlign: 'left', padding: 6, display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer', minWidth: 0,
                               border: 'none', borderRight: (i % 7) < 6 ? `1px solid ${C.border}` : 'none', borderBottom: `1px solid ${C.border}`,
                               background: sel ? 'rgba(200,150,62,0.10)' : d === t ? 'rgba(200,150,62,0.05)' : 'transparent', color: C.text, opacity: inMonth ? 1 : 0.45 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: d === t ? C.accent : C.dim, ...(d === t ? { background: 'rgba(200,150,62,0.18)', borderRadius: 6, padding: '0 5px' } : {}) }}>{parse(d).getDate()}</span>
                        {vs.length > 0 && <span title={`${vs.length} vendor${vs.length === 1 ? '' : 's'} booked${dbl ? `, ${dbl} double-booked` : ''}`} style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10.5, color: dbl ? C.red : C.muted }}>{vs.length} vendor{vs.length === 1 ? '' : 's'}{dbl ? ` · ${dbl}×2` : ''}</span>}
                      </span>
                      {evs.slice(0, 4).map(e => (
                        <span key={e.kind + e.pid} title={`${KINDS[e.kind].label} · ${e.pid} ${cleanName(e.name, e.pid)} · ${e.actual ? 'done' : 'planned'} · ${e.src.join(' + ')}`}
                          style={{ fontSize: 11, lineHeight: 1.3, padding: '2px 5px', borderRadius: 5, color: KINDS[e.kind].fg, background: KINDS[e.kind].bg,
                                   whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: e.actual && d < t ? 0.75 : 1 }}>
                          {e.actual && d <= t ? '✓ ' : ''}{e.pid} {KINDS[e.kind].label.toLowerCase()}
                        </span>
                      ))}
                      {evs.length > 4 && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>+{evs.length - 4} more</span>}
                    </button>
                  )
                })}
              </div>
            </div>
            {day && <DayDetail day={day} evs={byDay.get(day) || []} vs={vendorsByDay.get(day) || []} navigate={navigate} onClose={() => setDay(null)} />}
          </div>
        )}

        <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>✓ = done (an actual date)</span><span>Stage = Flent-Stage pipeline</span><span>Pulse = journey dates set in Pulse</span><span>vendors = booked from Pulse work orders · ×2 = double-booked</span>
        </div>
      </main>
    </div>
  )
}

function EventRow({ e, navigate }) {
  const k = KINDS[e.kind]
  return (
    <button type="button" onClick={() => navigate(`/properties/${encodeURIComponent(e.pid)}`)} disabled={!e.in_pulse}
      title={e.in_pulse ? 'Open the property' : 'This property is not in Pulse yet'}
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: e.in_pulse ? 'pointer' : 'default', color: C.text }}>
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: k.fg, flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.accent, marginRight: 6 }}>{e.pid}</span>{cleanName(e.name, e.pid)}
        </span>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 11.5, color: C.muted, marginTop: 2 }}>
          <span style={{ color: k.fg }}>{k.label}</span> · {e.actual ? 'done' : 'planned'}
          {e.detail?.type === 'revamp' && e.detail?.run ? ` · run ${e.detail.run}` : ''}
          {e.owner ? ` · ${first(e.owner)}` : ''} · {e.src.map(s => s === 'stage' ? 'Stage' : 'Pulse').join(' + ')}
          {!e.in_pulse && ' · not in Pulse'}
        </span>
      </span>
    </button>
  )
}

function VendorRows({ vs }) {
  if (!vs.length) return null
  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 14px 10px' }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>Vendors booked</div>
      <div style={{ display: 'grid', gap: 5 }}>
        {vs.map(v => (
          <div key={v.vendor_id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 13 }}>
            <b style={{ color: v.double ? C.red : C.text }}>{v.vendor}</b>
            {v.trade && <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{v.trade}</span>}
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: v.double ? C.red : C.dim }}>at {v.pids.join(', ')}{v.double ? ' — double-booked' : ''}</span>
            {v.phone && <a href={`tel:${v.phone}`} style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, color: C.accent, textDecoration: 'none' }}>{v.phone}</a>}
          </div>
        ))}
      </div>
    </div>
  )
}

function DayDetail({ day, evs, vs, navigate, onClose }) {
  return (
    <aside style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel, position: 'sticky', top: 'calc(env(safe-area-inset-top, 0px) + 70px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', borderBottom: `1px solid ${C.border}` }}>
        <b>{parse(day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</b>
        <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      {evs.length === 0 && vs.length === 0 ? <div style={{ padding: '12px 14px', fontSize: 12.5, color: C.muted }}>Nothing on this day.</div> : (
        <>
          <div>{evs.map(e => <EventRow key={e.kind + e.pid} e={e} navigate={navigate} />)}</div>
          <VendorRows vs={vs} />
        </>
      )}
    </aside>
  )
}

function Agenda({ days, byDay, vendorsByDay, today, navigate, loading }) {
  const withStuff = days.filter(d => (byDay.get(d) || []).length || (vendorsByDay.get(d) || []).length)
  if (loading && !withStuff.length) return <div style={{ height: 120, borderRadius: 10, background: C.border, opacity: 0.35 }} />
  if (!withStuff.length) return <div style={{ padding: 16, fontSize: 13, color: C.muted }}>Nothing scheduled this month with these filters.</div>
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {withStuff.map(d => (
        <section key={d} style={{ border: `1px solid ${d === today ? 'rgba(200,150,62,0.45)' : C.border}`, borderRadius: 10, background: C.panel, overflow: 'hidden' }}>
          <div style={{ padding: '9px 14px', borderBottom: `1px solid ${C.border}`, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: d === today ? C.accent : C.dim }}>
            {d === today ? 'Today · ' : ''}{parse(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          {(byDay.get(d) || []).map(e => <EventRow key={e.kind + e.pid} e={e} navigate={navigate} />)}
          <VendorRows vs={vendorsByDay.get(d) || []} />
        </section>
      ))}
    </div>
  )
}
