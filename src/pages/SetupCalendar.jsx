import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { first, copyText } from '../utils/explore'
import HomeMark from '../components/HomeMark'

// Calendar — dates first, and everything on it can be acted on where it sits.
//
// One read, setup_calendar(from, to): Pulse's setup and handover dates,
// Stage's setup plans and move-ins, exploratory visits, vendors booked per
// day, and the tray of properties ready for a setup date (with Stage's plan
// when it has one). Actions write to Pulse; assigning a visit is the one
// thing that also goes to Stage (on the next sync).

const MONO = 'var(--font-mono, monospace)'
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)',
  accent: 'var(--accent, #c8963e)', green: 'var(--green, #3dba7a)', red: 'var(--red, #e05c6a)',
}
const KIND = {
  visit:       { label: 'Exploratory visit',  short: 'visit',         fg: '#b0645b', bg: 'rgba(176,100,91,0.16)', group: 'visits' },
  setup:       { label: 'Setup',              short: 'setup',         fg: '#c8963e', bg: 'rgba(200,150,62,0.14)',  group: 'setups' },
  stage_setup: { label: 'Setup · Stage plan', short: 'setup (Stage)', fg: '#c8963e', bg: 'transparent',            group: 'setups', dashed: true },
  revamp:      { label: 'Revamp · Stage',     short: 'revamp',        fg: '#b08ae0', bg: 'rgba(176,138,224,0.12)', group: 'setups', dashed: true },
  handover:    { label: 'Handover',           short: 'handover',      fg: '#3dba7a', bg: 'rgba(61,186,122,0.14)',  group: 'handovers' },
  move_in:     { label: 'Move-in · Stage',    short: 'move-in',       fg: '#5fa8e8', bg: 'rgba(95,168,232,0.14)',  group: 'moveins' },
}
const GROUPS = [['visits', 'Visits', '#b0645b'], ['setups', 'Setups', '#c8963e'], ['moveins', 'Move-ins', '#5fa8e8'], ['handovers', 'Handovers', '#3dba7a'], ['vendors', 'Vendors', '#9394a8']]
const ORDER = ['visit', 'setup', 'stage_setup', 'revamp', 'handover', 'move_in']
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s) => new Date(s + 'T00:00:00')
const add = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return toIso(d) }
const monday = (s) => add(s, -((parse(s).getDay() + 6) % 7))
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const nice = (s, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parse(s).toLocaleDateString('en-IN', o)
const clean = (name, pid) => (name || '').replace(new RegExp(`^(PID)?${String(pid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·:-]?\\s*`, 'i'), '') || name
function ago(at) {
  if (!at) return 'never'
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, m)}m ago`
  const h = Math.round(m / 60); return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}
function range(view, anchor, sel) {
  if (view === 'month') {
    const f = parse(anchor), last = new Date(f.getFullYear(), f.getMonth() + 1, 0)
    return { from: monday(anchor), to: add(toIso(last), 6 - ((last.getDay() + 6) % 7)) }
  }
  if (view === 'week') { const m = monday(sel); return { from: m, to: add(m, 6) } }
  if (view === 'agenda') return { from: sel, to: add(sel, 20) }
  return { from: sel, to: sel }
}
const btn = (kind) => ({ minHeight: 34, padding: '0 12px', borderRadius: 8, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left',
  border: `1px solid ${kind === 'primary' ? 'rgba(200,150,62,0.45)' : C.border}`, background: kind === 'primary' ? 'rgba(200,150,62,0.12)' : C.input, color: kind === 'primary' ? C.accent : C.dim })
const trayHead = { fontFamily: MONO, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.muted }

export default function SetupCalendar() {
  const navigate = useNavigate()
  const phone = useIsMobile(760)
  const { session } = useAuth()
  const me = (session?.user?.email || '').toLowerCase()
  const t = todayIso()
  const [view, setView] = useState(() => phone ? 'agenda' : 'month')
  const [anchor, setAnchor] = useState(() => t.slice(0, 8) + '01')
  const [sel, setSel] = useState(t)
  const [open, setOpen] = useState(null)
  const [picked, setPicked] = useState(null)
  const [who, setWho] = useState('all')
  const [show, setShow] = useState(() => { try { return JSON.parse(localStorage.getItem('pulse.cal.groups')) || {} } catch { return {} } })
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [team, setTeam] = useState([])
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  useEffect(() => { try { localStorage.setItem('pulse.cal.groups', JSON.stringify(show)) } catch { /* private window */ } }, [show])
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(null), 3400); return () => clearTimeout(x) }, [toast])
  useEffect(() => { supabase.rpc('team_members').then(({ data }) => setTeam((data || []).filter(m => m.email.endsWith('@flent.in') && m.properties > 0))) }, [])
  const on = useCallback((g) => show[g] !== false, [show])

  const { from, to } = useMemo(() => range(view, anchor, sel), [view, anchor, sel])
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    const { data, error } = await supabase.rpc('setup_calendar', { p_from: from, p_to: to })
    setState({ loading: false, error: error ? error.message : null, data })
  }, [from, to])
  useEffect(() => { load() }, [load])

  const d = state.data
  const isAdmin = !!d?.is_admin
  const evKey = (e) => `${e.kind}:${e.pid}:${e.date}`
  const byDay = useMemo(() => {
    const m = new Map()
    for (const e of d?.events || []) {
      if (!KIND[e.kind] || !on(KIND[e.kind].group)) continue
      if (who !== 'all' && (who === 'none' ? !!e.owner : e.owner !== who)) continue
      const l = m.get(e.date) || []; l.push(e); m.set(e.date, l)
    }
    for (const l of m.values()) l.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.x?.hour ?? 99) - (b.x?.hour ?? 99))
    return m
  }, [d, on, who])
  const vendors = useMemo(() => {
    const m = new Map(); if (!on('vendors')) return m
    for (const v of d?.vendors || []) { const l = m.get(v.day) || []; l.push(v); m.set(v.day, l) }
    return m
  }, [d, on])
  const openEv = (d?.events || []).find(e => evKey(e) === open)
  const unassigned = (d?.events || []).filter(e => e.kind === 'visit' && !e.owner && ['new_request', 'visit_scheduled'].includes(e.x?.status) && e.date >= t)
  const tray = d?.tray || []

  async function act(fn, args, msg, after) {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { setToast({ tone: 'red', text: error.message }); return false }
    setToast({ text: msg }); if (after) after(); await load(); return true
  }
  const setSetup = (pid, date, how) => act('property_mark_milestone', { p_pid: pid, p_key: 'setup_date', p_date: date, p_note: null },
    `${pid} setup set for ${nice(date)} — ${how}. The owner sees it on their desk.`, () => { setPicked(null); setSel(date); setOpen(null) })

  function clickDay(day) {
    if (picked) { setSetup(picked.pid, day, picked.moving ? 'moved on the calendar' : 'placed on the calendar'); return }
    setSel(day); setOpen(null)
  }
  function move(n) {
    setOpen(null)
    if (view === 'month') { const a = parse(anchor); a.setMonth(a.getMonth() + n); setAnchor(toIso(a)); return }
    const s = add(sel, view === 'week' ? 7 * n : view === 'agenda' ? 21 * n : n); setSel(s); setAnchor(s.slice(0, 8) + '01')
  }
  const goToday = () => { setSel(t); setAnchor(t.slice(0, 8) + '01'); setOpen(null) }
  const openItem = (e) => { setOpen(evKey(e)); setSel(e.date) }

  const pillText = (e) => e.kind === 'visit' ? `${e.time ? e.time.replace(':00', '') + ' ' : ''}${(e.name || '').split(',')[0]}${e.owner ? '' : ' · assign'}` : `${e.pid} ${KIND[e.kind].short}`
  const warnOf = (e) => e.x?.warn || (e.kind === 'setup' && e.x?.stage_date ? `Stage says ${nice(e.x.stage_date)}` : null)
  const doneOf = (e) => !!(e.x?.closed || e.x?.done || (e.kind === 'visit' && e.x?.logged) || (e.kind === 'stage_setup' && e.x?.state === 'actual'))
  const pill = (e, full) => {
    const k = KIND[e.kind], warn = warnOf(e), unass = e.kind === 'visit' && !e.owner
    return (
      <span key={evKey(e)} role="button" tabIndex={0} onClick={ev => { ev.stopPropagation(); openItem(e) }}
        onKeyDown={ev => { if (ev.key === 'Enter') { ev.stopPropagation(); openItem(e) } }}
        title={`${k.label} · ${e.kind === 'visit' ? e.name : `${e.pid} ${clean(e.name, e.pid)}`}${e.owner ? ` · ${first(e.owner)}` : ''}${warn ? ` · ⚠ ${warn}` : ''}`}
        style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 11, lineHeight: 1.3, padding: '2px 5px', borderRadius: 5, cursor: 'pointer', boxSizing: 'border-box',
                 whiteSpace: full ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: k.fg, background: unass ? 'transparent' : k.bg,
                 border: k.dashed || unass ? `1px dashed ${k.fg}` : '1px solid transparent', boxShadow: warn ? `inset 3px 0 0 ${C.red}` : 'none',
                 opacity: doneOf(e) ? 0.6 : 1, outline: open === evKey(e) ? `2px solid ${k.fg}` : 'none' }}>
        {doneOf(e) ? '✓ ' : ''}{pillText(e)}
      </span>
    )
  }

  const title = view === 'month' ? parse(anchor).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : view === 'week' ? `Week of ${nice(monday(sel))}` : view === 'agenda' ? `From ${nice(sel)}` : nice(sel, { weekday: 'long', day: 'numeric', month: 'long' })
  const seg = (items, value, set) => (
    <span style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {items.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => set(k)}
        style={{ border: 0, background: value === k ? 'rgba(200,150,62,0.12)' : 'transparent', color: value === k ? C.accent : C.dim, padding: '7px 11px', fontFamily: MONO, fontSize: 11.5, fontWeight: value === k ? 700 : 500, cursor: 'pointer' }}>{l}</button>)}
    </span>
  )
  const dropProps = (x) => ({ onDragOver: e => { if (picked) e.preventDefault() }, onDrop: e => { e.preventDefault(); if (picked) clickDay(x) } })

  const days = []; for (let x = from; x <= to; x = add(x, 1)) days.push(x)
  const monthGrid = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))' }}>
      {WD.map(w => <div key={w} style={{ padding: '7px 8px', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.muted, borderBottom: `1px solid ${C.border}` }}>{w}</div>)}
      {days.map((x, i) => {
        const ev = byDay.get(x) || [], vs = vendors.get(x) || [], dbl = vs.filter(v => v.double).length
        const out = x.slice(0, 7) !== anchor.slice(0, 7)
        return (
          <div key={x} role="button" tabIndex={0} onClick={() => clickDay(x)} onKeyDown={e => { if (e.key === 'Enter') clickDay(x) }} {...dropProps(x)}
            style={{ minHeight: phone ? 64 : 116, padding: 5, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, cursor: 'pointer',
                     borderRight: (i % 7) < 6 ? `1px solid ${C.border}` : 'none', borderBottom: `1px solid ${C.border}`, opacity: out ? 0.45 : 1,
                     background: picked ? 'rgba(61,186,122,0.06)' : x === sel ? 'rgba(200,150,62,0.10)' : x === t ? 'rgba(200,150,62,0.05)' : 'transparent' }}>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: x === t ? C.accent : C.dim, ...(x === t ? { background: 'rgba(200,150,62,0.18)', borderRadius: 6, padding: '0 5px' } : {}) }}>{parse(x).getDate()}</span>
              {vs.length > 0 && !phone && <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: dbl ? C.red : C.muted }}>{vs.length} vendor{vs.length === 1 ? '' : 's'}{dbl ? ` · ${dbl}×2` : ''}</span>}
            </span>
            {phone ? <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>{ev.slice(0, 6).map(e => <i key={evKey(e)} style={{ width: 7, height: 7, borderRadius: '50%', background: KIND[e.kind].fg }} />)}</span>
              : <>{ev.slice(0, 4).map(e => pill(e))}{ev.length > 4 && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>+{ev.length - 4} more</span>}</>}
          </div>
        )
      })}
    </div>
  )
  const weekGrid = (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `54px repeat(${days.length}, minmax(112px,1fr))`, minWidth: 54 + days.length * 112 }}>
        <div />
        {days.map(x => <div key={x} style={{ padding: '7px 6px', fontFamily: MONO, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: x === t ? C.accent : C.muted, borderBottom: `1px solid ${C.border}` }}>{nice(x)}</div>)}
        <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, padding: '6px 6px 0 0', textAlign: 'right', background: 'var(--bg-sunken, #14151c)' }}>all day</div>
        {days.map(x => (
          <div key={x} onClick={() => clickDay(x)} {...dropProps(x)}
            style={{ padding: 4, display: 'grid', gap: 3, alignContent: 'start', minHeight: 54, borderLeft: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: 'var(--bg-sunken, #14151c)', cursor: 'pointer' }}>
            {(byDay.get(x) || []).filter(e => e.kind !== 'visit' || e.x?.hour == null).map(e => pill(e))}
            {(vendors.get(x) || []).length > 0 && <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>{vendors.get(x).length} vendors booked</span>}
          </div>
        ))}
        {HOURS.map(h => (
          <div key={h} style={{ display: 'contents' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, padding: '4px 6px 0 0', textAlign: 'right' }}>{((h + 11) % 12) + 1} {h < 12 ? 'am' : 'pm'}</div>
            {days.map(x => (
              <div key={x + h} style={{ minHeight: 38, padding: 3, borderLeft: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, display: 'grid', gap: 3, alignContent: 'start' }}>
                {(byDay.get(x) || []).filter(e => e.kind === 'visit' && e.x?.hour != null && (h === 9 ? e.x.hour <= 9 : h === 18 ? e.x.hour >= 18 : e.x.hour === h)).map(e => pill(e, true))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
  const dayList = (list) => (
    <div style={{ display: 'grid' }}>
      {list.map(x => {
        const ev = byDay.get(x) || [], vs = vendors.get(x) || []
        if (view === 'agenda' && !ev.length && !vs.length) return null
        return (
          <div key={x} style={{ borderBottom: `1px solid ${C.border}` }}>
            {view === 'agenda' && <div onClick={() => clickDay(x)} style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 12, fontWeight: 700, color: x === t ? C.accent : C.dim, background: picked ? 'rgba(61,186,122,0.06)' : 'transparent', cursor: 'pointer' }}>{x === t ? 'Today · ' : ''}{nice(x)}{picked ? ' — tap to place here' : ''}</div>}
            {!ev.length && !vs.length && <div style={{ padding: '12px 14px', fontSize: 13, color: C.muted }}>Nothing on this day.</div>}
            {ev.map(e => <EventRow key={evKey(e)} e={e} onOpen={() => openItem(e)} warn={warnOf(e)} done={doneOf(e)} />)}
            {vs.length > 0 && <div style={{ padding: '8px 14px', fontFamily: MONO, fontSize: 11.5, color: C.muted }}>Vendors: {vs.map(v => `${v.vendor}${v.double ? ' (×2)' : ''} at ${v.pids.join(', ')}`).join(' · ')}</div>}
          </div>
        )
      })}
      {view === 'agenda' && !days.some(x => (byDay.get(x) || []).length || (vendors.get(x) || []).length) && <div style={{ padding: 16, fontSize: 13, color: C.muted }}>Nothing in the next three weeks with these filters.</div>}
    </div>
  )

  const side = openEv
    ? <Sheet e={openEv} isAdmin={isAdmin} team={team} busy={busy} vendors={vendors.get(openEv.date) || []} warn={warnOf(openEv)}
        onClose={() => setOpen(null)} navigate={navigate} act={act} setSetup={setSetup}
        onMove={(e) => { setPicked({ pid: e.pid, name: e.name, moving: true }); setOpen(null); setToast({ text: `Now tap the new day for ${e.pid}` }) }}
        onCopied={() => setToast({ text: 'Copied — paste it to supply' })} />
    : <DayPanel day={sel} ev={byDay.get(sel) || []} vs={vendors.get(sel) || []} onOpen={openItem} warnOf={warnOf} doneOf={doneOf} />

  return (
    <div style={{ minHeight: '100svh', background: C.bg, color: C.text, fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: phone ? '8px 12px' : '8px 20px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', minHeight: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 100, boxSizing: 'border-box' }}>
        <HomeMark />
        <span className="pulse-title" style={{ fontSize: 15.5 }}>Calendar</span>
        {!phone && <span style={{ fontSize: 12.5, color: C.dim }}>visits, setups, move-ins and handovers — act on anything where it sits</span>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }} title="Stage dates and visits refresh every 30 minutes">Stage synced {ago(d?.synced_at)}</span>
          <SyncNow syncedAt={d?.synced_at} onReload={load} onDone={(t) => setToast({ text: t })} />
        </span>
      </div>
      <main style={{ padding: phone ? '12px 12px calc(96px + env(safe-area-inset-bottom, 0px))' : '16px 20px 40px', display: 'grid', gap: 12 }}>

        <div style={{ display: 'grid', gridTemplateColumns: phone ? 'minmax(0,1fr)' : '270px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 12, order: phone ? 2 : 0 }}>
            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b style={trayHead}>Needs a date</b>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{tray.length} · estimate final, no setup date</span>
              </div>
              {tray.length === 0 ? <div style={{ padding: 12, fontSize: 12.5, color: C.muted }}>Every property ready for setup has a date.</div> : tray.map(p => {
                const isPicked = picked?.pid === p.pid
                return (
                  <div key={p.pid} draggable onDragStart={() => setPicked({ pid: p.pid, name: p.name })}
                    style={{ padding: '9px 12px', borderTop: `1px solid ${C.border}`, display: 'grid', gap: 4, background: isPicked ? 'rgba(200,150,62,0.10)' : 'transparent', outline: isPicked ? '2px solid rgba(200,150,62,0.45)' : 'none', outlineOffset: -2, cursor: 'grab' }}>
                    <button type="button" onClick={() => setPicked(isPicked ? null : { pid: p.pid, name: p.name })} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: C.text, cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}><span style={{ fontFamily: MONO, fontSize: 11.5, color: C.accent, marginRight: 6 }}>{p.pid}</span>{clean(p.name, p.pid)}</div>
                      <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{first(p.owner) || 'no owner'}{p.since ? ` · waiting ${Math.max(0, Math.round((Date.now() - new Date(p.since)) / 86400000))}d` : ''}</div>
                    </button>
                    {p.stage_date && (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent }}>Stage {p.stage_state === 'actual' ? 'says set up' : 'plans'} {nice(p.stage_date)}</span>
                        <button type="button" disabled={busy} onClick={() => setSetup(p.pid, p.stage_date, 'Stage’s date')} style={{ ...btn('primary'), minHeight: 26, padding: '0 8px', fontSize: 11 }}>Use it</button>
                      </span>
                    )}
                  </div>
                )
              })}
              <div style={{ padding: '8px 12px', borderTop: `1px dashed ${C.border}`, fontFamily: MONO, fontSize: 11, color: picked ? C.green : C.muted }}>
                {picked ? <>Now tap a day for <b>{picked.pid}</b> · <button type="button" onClick={() => setPicked(null)} style={{ background: 'none', border: 0, color: C.accent, fontFamily: MONO, fontSize: 11, cursor: 'pointer', padding: 0 }}>cancel</button></> : 'Drag one onto a day — or tap it, then tap the day.'}
              </div>
            </section>
            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}><b style={trayHead}>Needs someone</b></div>
              {unassigned.length === 0 ? <div style={{ padding: 12, fontSize: 12.5, color: C.muted }}>Every upcoming visit has someone.</div> : unassigned.map(e => (
                <button key={evKey(e)} type="button" onClick={() => { openItem(e); setAnchor(e.date.slice(0, 8) + '01') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', borderTop: `1px solid ${C.border}`, borderLeft: 0, borderRight: 0, borderBottom: 0, background: 'none', color: C.text, cursor: 'pointer' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: '#b0645b' }}>{nice(e.date)}{e.time ? ` · ${e.time}` : ''} · assign ›</div>
                </button>
              ))}
            </section>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: phone ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(280px, 330px)', gap: 12, alignItems: 'start', minWidth: 0 }}>
            <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', minWidth: 0, opacity: state.loading ? 0.7 : 1 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', borderBottom: `1px solid ${C.border}` }}>
                {seg(phone ? [['agenda', 'List'], ['month', 'Month'], ['day', 'Day']] : [['month', 'Month'], ['week', 'Week'], ['day', 'Day'], ['agenda', 'List']], view, (v) => { setView(v); setOpen(null) })}
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  <button type="button" onClick={() => move(-1)} aria-label="Previous" style={btn()}>‹</button>
                  <button type="button" onClick={goToday} style={btn()}>Today</button>
                  <button type="button" onClick={() => move(1)} aria-label="Next" style={btn()}>›</button>
                </span>
                <b style={{ fontSize: 14 }}>{title}</b>
                <select value={who} onChange={e => setWho(e.target.value)} aria-label="Whose" style={{ marginLeft: phone ? 0 : 'auto', minHeight: 34, padding: '0 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontFamily: MONO, fontSize: 12 }}>
                  <option value="all">Everyone</option>
                  {team.map(m => <option key={m.email} value={m.email}>{m.email === me ? 'Me' : first(m.email)}</option>)}
                  <option value="none">Unassigned</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '7px 12px', borderBottom: `1px solid ${C.border}` }}>
                {GROUPS.map(([g, l, col]) => (
                  <button key={g} type="button" aria-pressed={on(g)} onClick={() => setShow(s => ({ ...s, [g]: !on(g) }))}
                    style={{ minHeight: 28, padding: '0 9px', borderRadius: 7, border: `1px solid ${on(g) ? col : C.border}`, background: 'transparent', color: on(g) ? col : C.muted, fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: on(g) ? 1 : 0.6 }}>{l}</button>
                ))}
                {!phone && <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10.5, color: C.muted }}>dashed = Stage plan or nobody yet · red edge = needs attention · ✓ = done</span>}
              </div>
              {state.error ? <div style={{ padding: 16, fontFamily: MONO, fontSize: 12.5, color: C.red }}>{/setup_calendar|does not exist|schema cache/i.test(state.error) ? 'The calendar appears once its migration is applied.' : state.error}</div>
                : view === 'month' ? monthGrid : view === 'week' ? weekGrid : dayList(view === 'day' ? [sel] : days)}
            </section>
            <div style={{ position: phone ? 'static' : 'sticky', top: 'calc(env(safe-area-inset-top, 0px) + 70px)' }}>{side}</div>
          </div>
        </div>
      </main>
      {toast && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', transform: 'translateX(-50%)', background: toast.tone === 'red' ? C.red : C.text, color: C.bg, padding: '10px 14px', borderRadius: 10, fontFamily: MONO, fontSize: 12, zIndex: 50, maxWidth: '92vw' }}>{toast.text}</div>}
    </div>
  )
}

function EventRow({ e, onOpen, warn, done }) {
  const k = KIND[e.kind]
  return (
    <button type="button" onClick={onOpen} style={{ display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 0, color: C.text, cursor: 'pointer', alignItems: 'flex-start' }}>
      <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: k.fg, flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{done ? '✓ ' : ''}{e.kind === 'visit' ? e.name : <><span style={{ fontFamily: MONO, fontSize: 11.5, color: C.accent, marginRight: 6 }}>{e.pid}</span>{clean(e.name, e.pid)}</>}</span>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 11.5, color: C.muted, marginTop: 2 }}>
          <span style={{ color: k.fg }}>{k.label}</span>{e.time ? ` · ${e.time}` : ''} · {e.owner ? first(e.owner) : 'nobody yet'}{warn ? <span style={{ color: C.red }}> · ⚠ {warn}</span> : ''}
        </span>
      </span>
    </button>
  )
}

function DayPanel({ day, ev, vs, onOpen, warnOf, doneOf }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.border}` }}><b>{nice(day, { weekday: 'long', day: 'numeric', month: 'long' })}</b></div>
      {!ev.length && !vs.length && <div style={{ padding: '12px 14px', fontSize: 13, color: C.muted }}>Nothing on this day. Tap an item on the calendar to act on it.</div>}
      {ev.map(e => <EventRow key={`${e.kind}${e.pid}`} e={e} onOpen={() => onOpen(e)} warn={warnOf(e)} done={doneOf(e)} />)}
      {vs.length > 0 && (
        <div style={{ padding: '8px 14px 12px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, marginBottom: 6 }}>Vendors booked</div>
          {vs.map(v => (
            <div key={v.vendor_id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5, padding: '2px 0' }}>
              <b style={{ color: v.double ? C.red : C.text }}>{v.vendor}</b><span style={{ fontFamily: MONO, fontSize: 11, color: v.double ? C.red : C.muted }}>{v.trade ? `${v.trade} · ` : ''}at {v.pids.join(', ')}{v.double ? ' — double-booked' : ''}</span>
              {v.phone && <a href={`tel:${v.phone}`} style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, color: C.accent, textDecoration: 'none' }}>{v.phone}</a>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// What can be done with one item, right here.
function Sheet({ e, isAdmin, team, busy, vendors, warn, onClose, navigate, act, setSetup, onMove, onCopied }) {
  const k = KIND[e.kind]
  const rid = e.x?.request_id
  // for a visit: what each person already has that day, to choose who goes
  const [people, setPeople] = useState(null)
  useEffect(() => {
    setPeople(null)
    if (e.kind !== 'visit' || !rid || !isAdmin) return
    let alive = true
    supabase.rpc('exploratory_record', { p_id: rid }).then(({ data }) => { if (alive) setPeople(data?.people || []) })
    return () => { alive = false }
  }, [e.kind, rid, isAdmin])
  const facts = []
  let actions = null
  const openProp = () => navigate(`/properties/${encodeURIComponent(e.pid)}`)
  if (e.kind === 'visit') {
    facts.push(['When', `${nice(e.date)}${e.time ? ` · ${e.time}` : ''}`],
      ['Who goes', e.owner ? `${first(e.owner)}${e.x?.pulse_assigned ? (e.x?.confirmed ? ' · confirmed' : ' · not confirmed yet') : ' · from Stage'}` : 'nobody yet'],
      ['Status', e.x?.logged ? 'visited · logged' : (e.x?.status || '').replace('_', ' ')])
    const live = ['new_request', 'visit_scheduled'].includes(e.x?.status) && !e.x?.logged
    actions = (
      <>
        {isAdmin && live && (people ? [...people].sort((a, b) => (!(a.day || []).length === !(b.day || []).length ? (a.week || 0) - (b.week || 0) : (a.day || []).length ? 1 : -1)) : team.map(m => ({ email: m.email }))).map((m, i) => {
          const free = people && !(m.day || []).length
          return (
            <button key={m.email} type="button" disabled={busy || e.owner === m.email} onClick={() => act('exploratory_assign', { p_id: rid, p_email: m.email }, `Assigned ${first(m.email)} — on their desk now; written to Stage on the next sync`)}
              style={{ ...btn(e.owner === m.email ? '' : i === 0 && free ? 'primary' : ''), opacity: e.owner === m.email ? 0.6 : 1, whiteSpace: 'normal', display: 'grid', gap: 2, padding: '7px 12px', height: 'auto' }}>
              <span>{e.owner === m.email ? `✓ ${first(m.email)} is going` : `Assign ${first(m.email)}`}{i === 0 && free && e.owner !== m.email ? ' · best fit' : ''}</span>
              {people && <span style={{ fontWeight: 500, fontSize: 11, color: free ? C.green : C.accent }}>{free ? 'nothing else that day' : `also: ${m.day.join(' · ')}`}</span>}
              {people && <span style={{ fontWeight: 500, fontSize: 10.5, color: C.muted }}>{m.week || 0} visit{m.week === 1 ? '' : 's'} around then{m.seen ? ' · has seen this building/landlord' : ''}</span>}
            </button>
          )
        })}
        {isAdmin && live && <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>Assigning is the one thing Pulse writes to Stage.</div>}
        <button type="button" onClick={() => navigate(`/explore/${rid}`)} style={btn()}>Open the record ›</button>
        {live && <button type="button" onClick={async () => { if (await copyText(`Hi — could we move the exploratory visit to ${e.name} (${nice(e.date)}${e.time ? `, ${e.time}` : ''})? Please update the slot in Stage.`)) onCopied() }} style={btn()}>✎ Copy a note to supply to move the slot</button>}
        {live && <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>The slot belongs to Stage — Pulse drafts the ask instead of changing it.</div>}
      </>)
  } else if (e.kind === 'setup') {
    facts.push(['Setup', `${nice(e.date)}${e.x?.closed ? ' · closed ✓' : ''}`], ['Owner', first(e.owner) || '—'])
    if (e.x?.stage_date) facts.push(['Stage', `says ${nice(e.x.stage_date)}`])
    if (vendors.length) facts.push(['Vendors', `${vendors.length} booked`])
    actions = e.x?.closed ? <button type="button" onClick={openProp} style={btn()}>Open the record ›</button> : (
      <>
        {e.x?.stage_date && <>
          <button type="button" disabled={busy} onClick={() => setSetup(e.pid, e.x.stage_date, 'Stage’s date')} style={btn('primary')}>Use Stage’s date · {nice(e.x.stage_date)}</button>
          <button type="button" disabled={busy} onClick={() => act('setup_clash_keep', { p_pid: e.pid, p_stage_date: e.x.stage_date }, `Kept ${nice(e.date)} for ${e.pid} — Pulse stops flagging the difference`)} style={btn()}>Keep {nice(e.date)} · Pulse is right</button>
        </>}
        <button type="button" onClick={() => onMove(e)} style={btn()}>Move to another day…</button>
        <button type="button" onClick={openProp} style={btn()}>Open the record ›</button>
      </>)
  } else if (e.kind === 'stage_setup' || e.kind === 'revamp') {
    facts.push(['Stage', `${e.kind === 'revamp' ? 'revamp' : 'setup'} ${e.x?.state === 'actual' ? 'done' : 'planned'} ${nice(e.date)}`], ['In Pulse', e.x?.in_pulse ? 'no setup date yet' : 'no property yet'])
    actions = e.x?.in_pulse ? (
      <>
        <button type="button" disabled={busy} onClick={() => setSetup(e.pid, e.date, 'Stage’s date')} style={btn('primary')}>Use as the setup date</button>
        <button type="button" onClick={openProp} style={btn()}>Open the record ›</button>
      </>) : (
      <>
        <button type="button" onClick={() => navigate(`/inspections/new?pid=${encodeURIComponent(e.pid)}`)} style={btn('primary')}>Create PID {e.pid} in Pulse ›</button>
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>Supply has it in Stage; Pulse doesn’t yet.</div>
      </>)
  } else if (e.kind === 'move_in') {
    facts.push(['Move-in', `${nice(e.date)} · from Stage`], ['Owner', first(e.owner) || '—'])
    actions = (
      <>
        {e.x?.in_pulse && <button type="button" onClick={openProp} style={btn('primary')}>Open the record ›</button>}
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>A move-in is a deadline from Stage — Pulse flags it when setup isn’t ready.</div>
      </>)
  } else if (e.kind === 'handover') {
    facts.push(['Handover', `${nice(e.date)}${e.x?.done ? ' · done ✓' : ''}`], ['Owner', first(e.owner) || '—'])
    actions = (
      <>
        {!e.x?.done && <button type="button" disabled={busy} onClick={() => act('property_mark_milestone', { p_pid: e.pid, p_key: 'handover_done', p_date: null, p_note: null }, `${e.pid} marked handed over`)} style={btn('primary')}>Mark handed over</button>}
        <button type="button" onClick={openProp} style={btn()}>Open the record ›</button>
      </>)
  }
  return (
    <section style={{ background: C.panel, border: `1px solid ${k.fg}`, borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
        <b style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.09em', textTransform: 'uppercase', color: k.fg }}>{k.label}</b>
        <button type="button" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 0, color: C.muted, fontSize: 18, cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ padding: '10px 14px 4px', fontSize: 15, fontWeight: 600 }}>
        {e.kind !== 'visit' && <span style={{ fontFamily: MONO, fontSize: 12, color: C.accent, marginRight: 6 }}>{e.pid}</span>}
        {e.kind === 'visit' ? e.name : clean(e.name, e.pid)}{e.x?.config ? <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}> · {e.x.config}</span> : ''}
      </div>
      <dl style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: '4px 10px', padding: '6px 14px', margin: 0, fontSize: 12.5 }}>
        {facts.map(([a, b]) => <div key={a} style={{ display: 'contents' }}><dt style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{a}</dt><dd style={{ margin: 0 }}>{b}</dd></div>)}
        {warn && <div style={{ display: 'contents' }}><dt style={{ fontFamily: MONO, fontSize: 10.5, color: C.red, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Watch</dt><dd style={{ margin: 0, color: C.red }}>{warn}</dd></div>}
      </dl>
      <div style={{ display: 'grid', gap: 6, padding: '8px 14px 14px' }}>{actions}</div>
    </section>
  )
}

// "Sync now": asks GitHub to run the Stage sync straight away (see
// supabase/functions/stage-sync-now), then watches for the new sync time and
// reloads the calendar when it lands. A run takes about a minute.
function SyncNow({ syncedAt, onReload, onDone }) {
  const [phase, setPhase] = useState('idle')     // idle | starting | running | error
  const [msg, setMsg] = useState('')
  const [since, setSince] = useState(null)       // the sync time when we asked
  useEffect(() => {
    if (phase !== 'running') return undefined
    if (syncedAt && since !== undefined && syncedAt !== since) {
      const t = setTimeout(() => { setPhase('idle'); onDone && onDone('Synced with Stage just now') }, 0)
      return () => clearTimeout(t)
    }
    const iv = setInterval(() => onReload(), 15000)
    const stop = setTimeout(() => { setPhase('error'); setMsg('Still running on GitHub — it will show up on the next refresh.') }, 5 * 60000)
    return () => { clearInterval(iv); clearTimeout(stop) }
  }, [phase, syncedAt, since, onReload, onDone])

  async function go() {
    setPhase('starting'); setMsg(''); setSince(syncedAt || null)
    const { data, error } = await supabase.functions.invoke('stage-sync-now', { body: {} })
    if (error) {
      let text = error.message
      try { const j = await error.context?.json?.(); if (j?.error) text = j.error } catch { /* not json */ }
      setPhase('error'); setMsg(text); return
    }
    if (!data?.ok) { setPhase('error'); setMsg(data?.error || 'Couldn’t start the sync'); return }
    setPhase('running')
  }

  const busy = phase === 'starting' || phase === 'running'
  return (
    <>
      <button type="button" onClick={go} disabled={busy} title={msg || 'Pull dates and visits from Stage now (about a minute)'}
        style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: `1px solid ${phase === 'error' ? 'rgba(176,100,91,0.55)' : 'var(--border, #2e3040)'}`, background: 'var(--bg-input, #252731)', color: phase === 'error' ? '#b0645b' : 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 11.5, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
        {phase === 'starting' ? 'Starting…' : phase === 'running' ? '↻ Syncing… ~1 min' : phase === 'error' ? '↻ Retry sync' : '↻ Sync now'}
      </button>
      {phase === 'error' && msg && <span role="alert" style={{ fontFamily: MONO, fontSize: 11, color: '#b0645b', maxWidth: 260 }}>{msg}</span>}
    </>
  )
}
