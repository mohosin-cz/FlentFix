import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useIsMobile } from '../../hooks/useIsMobile'
import { DraftMessageButton } from '../comms/DraftMessage'
import { useJourneyHome, ago } from './JourneyPanels'

// Home as a work queue, the way a CRM does it: the property is the unit of
// work, VIEWS are saved filters with live counts, the list is a dense sortable
// table (or a board of the same rows by stage), rows select for bulk actions,
// one click opens the record. Nothing else lives on Home.
//
// Every row comes from property_journey_state('all'); the views are filters
// over it, and "mine" is a filter too, not a mode.

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'
const URGENCY_RANK = { overdue: 0, today: 1, soon: 2, waiting: 3, done: 4 }

const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private window */ } },
}

const local = (email) => (email || '').split('@')[0] || '—'
const isMine = (r, assigned, me) => !!me && ((r.owner_email || '').toLowerCase() === me || (assigned.get(r.pid) || '').toLowerCase() === me)
const headline = (r) => (r.open_threads && r.open_threads[0]) || { code: r.stage_code, label: r.stage_label, blocked_on: r.blocked_on, since: r.since, age_days: r.age_days, next_action_label: r.next_action_label, next_action_route: r.next_action_route, urgency: r.urgency, stage_no: 0 }

// The views. Each yields { r, t }: the property and the thread the row shows —
// the headline, or in the waiting views the thread that is actually waiting.
const VIEWS = [
  { key: 'needs_me',  label: 'Needs me',           pick: (rows, ctx) => rows.filter(r => r.blocked_on === 'setup_ops' && r.urgency !== 'done' && isMine(r, ctx.assigned, ctx.me)).map(r => ({ r, t: headline(r) })) },
  { key: 'needs_team', label: 'Needs the team',    pick: (rows) => rows.filter(r => r.blocked_on === 'setup_ops' && r.urgency !== 'done').map(r => ({ r, t: headline(r) })) },
  { key: 'landlord',  label: 'Waiting on landlord', pick: (rows) => rows.flatMap(r => { const t = (r.open_threads || []).find(x => x.blocked_on === 'landlord' && x.urgency !== 'done'); return t ? [{ r, t }] : [] }) },
  { key: 'vendor',    label: 'Waiting on vendor',   pick: (rows) => rows.flatMap(r => { const t = (r.open_threads || []).find(x => x.blocked_on === 'vendor' && x.urgency !== 'done'); return t ? [{ r, t }] : [] }) },
  { key: 'overdue',   label: 'Overdue',            pick: (rows) => rows.filter(r => r.urgency === 'overdue').map(r => ({ r, t: headline(r) })) },
  { key: 'unowned',   label: 'Unowned',            pick: (rows, ctx) => rows.filter(r => !r.owner_email && !ctx.assigned.get(r.pid)).map(r => ({ r, t: headline(r) })) },
  { key: 'all',       label: 'All',                pick: (rows) => rows.map(r => ({ r, t: headline(r) })) },
]
const EMPTY = {
  needs_me: 'Nothing needs you.', needs_team: 'Nothing needs the team.', landlord: 'No landlord is holding anything up.',
  vendor: 'No vendor is holding anything up.', overdue: 'Nothing is past its threshold.', unowned: 'Every property has an owner.', all: 'No live properties.',
}

const COLS = [
  { key: 'pid',     label: 'PID',         sort: (x) => String(x.r.pid) },
  { key: 'name',    label: 'Property',    sort: (x) => (x.r.property_name || '').toLowerCase() },
  { key: 'stage',   label: 'Stage',       sort: (x) => x.t.stage_no ?? 0 },
  { key: 'blocked', label: 'Waiting on',  sort: (x) => x.t.blocked_on },
  { key: 'age',     label: 'Age',         sort: (x) => (URGENCY_RANK[x.t.urgency] ?? 9) * -10000 + (x.t.age_days ?? 0) },
  { key: 'action',  label: 'Next action', sort: (x) => x.t.next_action_label || '' },
  { key: 'owner',   label: 'Owner',       sort: (x) => x.owner },
]

const WHO = { setup_ops: 'you', landlord: 'landlord', vendor: 'vendor', none: '—' }
const dotFor = (u) => u === 'overdue' ? 'var(--red, #e05c6a)' : (u === 'today' || u === 'soon') ? 'var(--amber, #c8963e)' : u === 'done' ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)'

function SlaDot({ urgency, title }) {
  return <span title={title} aria-label={urgency} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: dotFor(urgency), marginRight: 7, verticalAlign: 'middle', flexShrink: 0 }} />
}

const btn = (on) => ({ minHeight: 34, padding: '0 12px', borderRadius: 7, border: `1px solid ${on ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, background: on ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)', color: on ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' })

export default function WorkQueue() {
  const navigate = useNavigate()
  const phone = useIsMobile(640)
  const { session } = useAuth()
  const me = (session?.user?.email || '').toLowerCase()

  const home = useJourneyHome('all')
  const { loading, error, rows, thresholds, reload } = home

  // assigned_to is not on the engine's rows (and is empty today); one cheap read.
  const [assigned, setAssigned] = useState(() => new Map())
  const [team, setTeam] = useState([])
  const loadMeta = useCallback(async () => {
    const [a, t] = await Promise.all([
      supabase.from('properties').select('pid, assigned_to').is('deleted_at', null),
      supabase.rpc('team_members'),
    ])
    if (!a.error) setAssigned(new Map((a.data || []).map(p => [p.pid, p.assigned_to || ''])))
    if (!t.error) setTeam(t.data || [])
  }, [])
  useEffect(() => { loadMeta() }, [loadMeta])

  const [view, setView] = useState(() => LS.get('pulse.queue.view', 'needs_me'))
  const [mode, setMode] = useState(() => LS.get('pulse.queue.mode', 'table'))
  const [sort, setSort] = useState(() => LS.get('pulse.queue.sort', { key: 'age', dir: 'desc' }))
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [busy, setBusy] = useState(null)
  const [toast, setToast] = useState(null)
  useEffect(() => LS.set('pulse.queue.view', view), [view])
  useEffect(() => LS.set('pulse.queue.mode', mode), [mode])
  useEffect(() => LS.set('pulse.queue.sort', sort), [sort])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t) }, [toast])

  const ctx = useMemo(() => ({ assigned, me }), [assigned, me])
  const counts = useMemo(() => Object.fromEntries(VIEWS.map(v => [v.key, rows ? v.pick(rows, ctx).length : null])), [rows, ctx])

  const list = useMemo(() => {
    if (!rows) return null
    const v = VIEWS.find(x => x.key === view) || VIEWS[0]
    let items = v.pick(rows, ctx).map(x => ({ ...x, owner: (assigned.get(x.r.pid) || x.r.owner_email || '').toLowerCase() }))
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      items = items.filter(x => [x.r.pid, x.r.property_name, x.t.label, x.t.next_action_label, x.owner].some(s => String(s || '').toLowerCase().includes(needle)))
    }
    const col = COLS.find(c => c.key === sort.key) || COLS[4]
    items.sort((a, b) => { const A = col.sort(a), B = col.sort(b); return (A < B ? -1 : A > B ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1) })
    return items
  }, [rows, view, ctx, assigned, q, sort])

  // Board: the same rows, columned by stage in journey order.
  const board = useMemo(() => {
    if (!list) return null
    const m = new Map()
    for (const x of list) {
      const k = x.t.code || 'unclassified'
      if (!m.has(k)) m.set(k, { code: k, label: x.t.label, no: x.t.stage_no ?? 0, items: [] })
      m.get(k).items.push(x)
    }
    return [...m.values()].sort((a, b) => a.no - b.no)
  }, [list])

  const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'age' ? 'desc' : 'asc' })
  const toggle = (pid) => setSel(s => { const n = new Set(s); n.has(pid) ? n.delete(pid) : n.add(pid); return n })
  const allSelected = list && list.length > 0 && list.every(x => sel.has(x.r.pid))
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(list.map(x => x.r.pid)))

  async function assign(email) {
    const pids = [...sel]; if (!pids.length) return
    setBusy('assign')
    const { data, error } = await supabase.rpc('property_assign', { p_pids: pids, p_email: email })
    setBusy(null)
    if (error) { setToast({ tone: 'red', text: error.message }); return }
    setToast({ tone: 'green', text: `${data} propert${data === 1 ? 'y' : 'ies'} ${email ? 'assigned to ' + local(email) : 'unassigned'}` })
    setSel(new Set()); loadMeta(); reload()
  }
  async function setHandover(date) {
    const pids = [...sel]; if (!pids.length) return
    setBusy('handover')
    const { data, error } = await supabase.rpc('property_set_handover', { p_pids: pids, p_date: date || null })
    setBusy(null)
    if (error) { setToast({ tone: 'red', text: error.message }); return }
    setToast({ tone: 'green', text: `T-Day ${date ? 'set on' : 'cleared on'} ${data} propert${data === 1 ? 'y' : 'ies'}` })
    setSel(new Set()); reload()
  }

  const overdueBy = (x) => {
    const limitKey = { onboarded: 'onboarded_days', inspection_in_progress: 'inspection_draft_days', estimate_not_created: 'estimate_not_created_days', estimate_draft: 'estimate_draft_days', estimate_sent: 'estimate_unopened_days', estimate_viewed: 'landlord_silent_days', landlord_queried: 'query_reply_days', landlord_partially_decided: 'landlord_silent_days', work_order_pending: 'work_order_pending_days', wo_unassigned: 'wo_unassigned_days', wo_unscheduled: 'wo_unscheduled_days', qc_pending: 'qc_pending_days', disputed: 'dispute_days', handover_unknown: 'handover_unknown_days', invoice_draft: 'invoice_draft_days' }[x.t.code]
    const lim = limitKey && thresholds ? Number(thresholds[limitKey]) : null
    return x.t.urgency === 'overdue' && lim ? Math.max(1, (x.t.age_days ?? 0) - lim) : null
  }
  const ageText = (x) => { const od = overdueBy(x); return od ? `${x.t.age_days}d · over by ${od}` : `${x.t.age_days ?? '—'}d · ${ago(x.t.since, x.t.age_days)}` }

  const openRecord = (pid) => navigate(`/properties/${encodeURIComponent(pid)}`)
  const openAction = (e, x) => { e.stopPropagation(); if (x.t.next_action_route) navigate(x.t.next_action_route) }

  // ── chrome ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', boxSizing: 'border-box', padding: phone ? '10px 12px calc(90px + env(safe-area-inset-bottom, 0px))' : '12px 24px 48px', fontFamily: SANS, color: 'var(--text, #e8e8f0)' }}>

      {/* VIEWS — saved filters with live counts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Views" style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: phone ? '1 1 100%' : 1, minWidth: 0, paddingBottom: 2 }}>
          {VIEWS.map(v => {
            const on = v.key === view
            const n = counts[v.key]
            return (
              <button key={v.key} role="tab" aria-selected={on} onClick={() => { setView(v.key); setSel(new Set()) }}
                style={{ ...btn(on), display: 'flex', gap: 7, alignItems: 'center', border: on ? '1px solid var(--accent, #c8963e)' : '1px solid transparent', background: on ? 'rgba(200,150,62,0.12)' : 'transparent' }}>
                {v.label}
                <span style={{ fontSize: 10.5, color: on ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontVariantNumeric: 'tabular-nums' }}>{n ?? '…'}</span>
              </button>
            )
          })}
        </div>
        {!phone && (
          <div role="group" aria-label="Layout" style={{ display: 'flex', gap: 2, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 2 }}>
            {[['table', 'Table'], ['board', 'Board']].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k}
                style={{ minHeight: 30, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 11.5, fontWeight: 700, background: mode === k ? 'var(--accent, #c8963e)' : 'transparent', color: mode === k ? 'var(--on-accent, #16171f)' : 'var(--text-dim, #9394a8)' }}>{l}</button>
            ))}
          </div>
        )}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter this view…" aria-label="Filter this view"
          style={{ minHeight: 34, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontFamily: MONO, fontSize: 12, outline: 'none', width: phone ? undefined : 220, flex: phone ? '1 1 160px' : undefined, minWidth: 0 }} />
        <button onClick={() => { reload(); loadMeta() }} title="Refresh" style={btn(false)}>↻</button>
      </div>

      {/* bulk bar */}
      {sel.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, padding: '8px 12px', borderRadius: 9, background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.35)' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--accent, #c8963e)', fontWeight: 700 }}>{sel.size} selected</span>
          <select disabled={busy === 'assign'} onChange={e => { if (e.target.value !== '') assign(e.target.value === '__none' ? null : e.target.value); e.target.value = '' }} defaultValue=""
            style={{ minHeight: 32, padding: '0 10px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontFamily: MONO, fontSize: 11.5 }}>
            <option value="" disabled>{busy === 'assign' ? 'Assigning…' : 'Assign to ▾'}</option>
            {me && <option value={me}>me · {local(me)}</option>}
            {team.filter(t => t.email !== me).map(t => <option key={t.email} value={t.email}>{local(t.email)} · {t.properties}</option>)}
            <option value="__none">— unassign</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 11.5, color: 'var(--text-dim, #9394a8)' }}>
            T-Day
            <input type="date" disabled={busy === 'handover'} onChange={e => e.target.value && setHandover(e.target.value)}
              style={{ minHeight: 32, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontFamily: MONO, fontSize: 11.5 }} />
          </label>
          <button onClick={() => setSel(new Set())} style={{ ...btn(false), marginLeft: 'auto' }}>Clear</button>
        </div>
      )}
      {toast && (
        <div role="status" style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontFamily: MONO, fontSize: 12, color: toast.tone === 'red' ? 'var(--red, #e05c6a)' : 'var(--green, #3dba7a)', background: toast.tone === 'red' ? 'rgba(224,92,106,0.10)' : 'rgba(61,186,122,0.10)', border: `1px solid ${toast.tone === 'red' ? 'rgba(224,92,106,0.35)' : 'rgba(61,186,122,0.35)'}` }}>{toast.text}</div>
      )}

      {/* states */}
      {error && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.07)' }}>
          <span style={{ fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Couldn't read the portfolio — {error}</span>
          <button onClick={reload} style={btn(false)}>Retry</button>
        </div>
      )}
      {loading && !rows && (
        <div aria-busy="true" style={{ marginTop: 14 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={{ height: 40, borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', alignItems: 'center', gap: 16, padding: '0 10px' }}><div style={{ width: 40, height: 10, background: 'var(--border, #2e3040)', borderRadius: 3, opacity: 0.7 }} /><div style={{ width: '30%', height: 10, background: 'var(--border, #2e3040)', borderRadius: 3, opacity: 0.5 }} /><div style={{ width: '20%', height: 10, background: 'var(--border, #2e3040)', borderRadius: 3, opacity: 0.4 }} /></div>)}
        </div>
      )}
      {list && list.length === 0 && !error && (
        <div style={{ marginTop: 14, padding: '26px 16px', borderRadius: 10, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-panel, #1e2028)', fontFamily: MONO, fontSize: 12.5, color: 'var(--text-muted, #6b6d82)' }}>
          {q ? `Nothing in this view matches "${q}".` : EMPTY[view]}
        </div>
      )}

      {/* TABLE */}
      {list && list.length > 0 && (phone || mode === 'table') && (
        phone ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(x => (
              <div key={x.r.pid + x.t.code} onClick={() => openRecord(x.r.pid)}
                style={{ display: 'flex', gap: 10, padding: '11px 12px', borderRadius: 10, background: 'var(--bg-panel, #1e2028)', border: `1px solid ${sel.has(x.r.pid) ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, cursor: 'pointer' }}>
                <input type="checkbox" checked={sel.has(x.r.pid)} onChange={() => toggle(x.r.pid)} onClick={e => e.stopPropagation()} aria-label={`Select ${x.r.pid}`} style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--accent, #c8963e)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--accent, #c8963e)' }}>{x.r.pid}</span><span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.r.property_name}</span></div>
                  <div style={{ fontSize: 13.5, marginTop: 2 }}>{x.t.label}</div>
                  <div style={{ fontSize: 10.5, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', marginTop: 3, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span><SlaDot urgency={x.t.urgency} />{ageText(x)}</span><span>· {WHO[x.t.blocked_on]}</span><span>· {local(x.owner)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={e => openAction(e, x)} style={{ ...btn(true), minHeight: 36, flex: '1 1 auto', minWidth: 0, textAlign: 'left', whiteSpace: 'normal' }}>{x.t.next_action_label} ›</button>
                    <span onClick={e => e.stopPropagation()}><DraftMessageButton pid={x.r.pid} code={x.t.code} compact /></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 12, border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'auto', background: 'var(--bg-panel, #1e2028)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-input, #252731)' }}>
                  <th style={{ width: 36, padding: '9px 10px' }}><input type="checkbox" checked={!!allSelected} onChange={toggleAll} aria-label="Select all" style={{ accentColor: 'var(--accent, #c8963e)' }} /></th>
                  {COLS.map(c => (
                    <th key={c.key} onClick={() => toggleSort(c.key)} aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      style={{ textAlign: 'left', padding: '9px 10px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: sort.key === c.key ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {c.label}{sort.key === c.key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </th>
                  ))}
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {list.map(x => (
                  <tr key={x.r.pid + x.t.code} onClick={() => openRecord(x.r.pid)} className="q-row"
                    style={{ borderTop: '1px solid var(--border, #2e3040)', cursor: 'pointer', background: sel.has(x.r.pid) ? 'rgba(200,150,62,0.07)' : 'transparent' }}>
                    <td style={{ padding: '8px 10px' }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(x.r.pid)} onChange={() => toggle(x.r.pid)} aria-label={`Select ${x.r.pid}`} style={{ accentColor: 'var(--accent, #c8963e)' }} /></td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO, color: 'var(--accent, #c8963e)', whiteSpace: 'nowrap' }}>{x.r.pid}</td>
                    <td style={{ padding: '8px 10px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.r.property_name}</td>
                    <td style={{ padding: '8px 10px', color: 'var(--text-dim, #9394a8)' }}>{x.t.label}</td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO, fontSize: 11.5, color: x.t.blocked_on === 'setup_ops' ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)' }}>{WHO[x.t.blocked_on]}</td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO, fontSize: 11.5, whiteSpace: 'nowrap', color: x.t.urgency === 'overdue' ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)' }}><SlaDot urgency={x.t.urgency} />{ageText(x)}</td>
                    <td style={{ padding: '6px 10px' }}><button onClick={e => openAction(e, x)} style={{ ...btn(true), minHeight: 30, padding: '0 10px' }}>{x.t.next_action_label} ›</button></td>
                    <td style={{ padding: '8px 10px', fontFamily: MONO, fontSize: 11.5, color: x.owner === me ? 'var(--text, #e8e8f0)' : 'var(--text-dim, #9394a8)', whiteSpace: 'nowrap' }}>{local(x.owner)}</td>
                    <td style={{ padding: '4px 6px' }} onClick={e => e.stopPropagation()}><DraftMessageButton pid={x.r.pid} code={x.t.code} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <style>{`.q-row:hover { background: var(--bg-input, #252731) !important; }`}</style>
          </div>
        )
      )}

      {/* BOARD — the same rows by stage, in journey order */}
      {list && list.length > 0 && !phone && mode === 'board' && (
        <div style={{ marginTop: 12, display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 8 }}>
          {board.map(col => (
            <div key={col.code} style={{ flex: '0 0 280px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-dim, #9394a8)' }}>{col.items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
                {col.items.map(x => (
                  <div key={x.r.pid} onClick={() => openRecord(x.r.pid)} className="q-card"
                    style={{ padding: '10px 11px', borderRadius: 9, background: 'var(--bg-input, #252731)', border: `1px solid ${sel.has(x.r.pid) ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <input type="checkbox" checked={sel.has(x.r.pid)} onChange={() => toggle(x.r.pid)} onClick={e => e.stopPropagation()} aria-label={`Select ${x.r.pid}`} style={{ accentColor: 'var(--accent, #c8963e)' }} />
                      <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--accent, #c8963e)' }}>{x.r.pid}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.r.property_name}</span>
                    </div>
                    <div style={{ fontSize: 10.5, fontFamily: MONO, color: x.t.urgency === 'overdue' ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', marginTop: 6 }}><SlaDot urgency={x.t.urgency} />{ageText(x)} · {local(x.owner)}</div>
                    <button onClick={e => openAction(e, x)} style={{ ...btn(true), minHeight: 30, padding: '0 10px', marginTop: 8, width: '100%', textAlign: 'left' }}>{x.t.next_action_label} ›</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <style>{`.q-card:hover { border-color: var(--accent, #c8963e) !important; }`}</style>
        </div>
      )}
    </div>
  )
}
