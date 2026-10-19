import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { clean } from './MyDesk'

// The admin's Team view — who is carrying what, where work is stuck, what
// slipped. Per-person load and the stuck grid come from the journey engine
// rows Home already holds (so they match the queue); the rest from
// home_team(). Test properties are left out of the team numbers.

// One typeface on Home: the nav's (Urbanist). Numbers stay aligned with tabular figures.
const MONO = "var(--font-nav, 'Urbanist', 'Poppins', sans-serif)"
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)',
  accent: 'var(--accent, #c8963e)', green: 'var(--green, #6f9a7e)', red: 'var(--red, #b0645b)',
}
const SOFT = { red: 'rgba(158,90,82,0.16)', amber: 'rgba(160,132,82,0.16)', green: 'rgba(94,138,110,0.16)' }
// matte: the Team view is read at a glance, so status colours are muted,
// not neon — the same red / amber / green, with the saturation taken out
const M = { red: '#b0645b', amber: '#a8895a', green: '#6f9a7e' }
const WAIT = [['setup_ops', 'Setup ops'], ['landlord', 'Landlord'], ['vendor', 'Vendor'], ['supply', 'Supply']]
// Steps whose engine label carries a count ("9 of 21 items approved") are
// grouped under one name, so the grid has one row per step.
const STEP_NAME = {
  landlord_deciding: 'Landlord approving items',
  explore_assign: 'Explore · assign someone', explore_confirm: 'Explore · confirm the visit', explore_visit: 'Explore · visit booked',
  explore_log: 'Explore · log the findings', explore_decision: 'Explore · supply to decide', explore_deal: 'Explore · supply closing the deal',
  explore_link: 'Explore · link to its PID', explore_create_pid: 'Explore · create the PID', explore_slot: 'Explore · supply to set a slot',
  explore_stale: 'Explore · stale in Stage', explore_paste: 'Explore · paste findings into Stage', explore_paste_main: 'Explore · logged, not in Stage yet', items_to_verify: 'Vendor work to verify', disputed: 'Items sent back to vendor',
  setup_day: 'Setup day', setup_in_progress: 'Work under way', vendors_on_site: 'Vendors on site', wo_awaiting_day: 'Waiting for setup day',
  wo_overdue: 'Items open past closure date', wo_unassigned: 'Work orders with no vendor', wo_undated: 'Work orders with no closure date',
}
const METRICS = [['insp_to_sent', 'Inspection → estimate sent'], ['sent_to_approved', 'Sent → approved'], ['setup_to_closed', 'Setup → closed']]

const CSS = `
.tv{display:grid;gap:14px;padding:16px 20px 4px}
.tv-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.tv-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:14px;align-items:start}
.tv-col{display:grid;gap:14px;min-width:0}
.tv-money{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:12px 14px}
.tv table{width:100%;border-collapse:collapse;font-size:13px}
.tv th{font-family:var(--font-nav, Urbanist, Poppins, sans-serif);font-size:12px;color:var(--text-muted,#6b6d82);text-align:left;font-weight:700;padding:9px 14px;border-bottom:1px solid var(--border,#2e3040);white-space:nowrap}
.tv td{padding:10px 14px;border-bottom:1px solid var(--border,#2e3040);white-space:nowrap;vertical-align:middle}
.tv tr:last-child td{border-bottom:0}
.tv .n{font-family:var(--font-nav, Urbanist, Poppins, sans-serif);font-variant-numeric:tabular-nums}
.tv-rows>*+*{border-top:1px solid var(--border,#2e3040)}
.tv-btn{min-height:32px;padding:0 11px;border-radius:8px;font-family:var(--font-nav, Urbanist, Poppins, sans-serif);font-size:11.5px;font-weight:700;white-space:nowrap;cursor:pointer;border:1px solid var(--border,#2e3040);background:var(--bg-input,#252731);color:var(--text-dim,#9394a8)}
@media (max-width:1100px){.tv-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:720px){
  .tv{padding:12px 12px 4px}
  .tv-strip{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(128px,1fr);overflow-x:auto;padding-bottom:4px}
  .tv-money{grid-template-columns:minmax(0,1fr)}
  .tv-btn{min-height:40px}
}`

const first = (email) => { const s = (email || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '—' }
const inr = (n) => { const v = Math.round(Number(n || 0)); return v >= 100000 ? `₹${(v / 100000).toFixed(2).replace(/\.?0+$/, '')} L` : '₹' + v.toLocaleString('en-IN') }
function ago(at) {
  if (!at) return '—'
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (m < 2) return 'now'; if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
const days = (v) => v == null ? null : v < 1 ? '<1d' : `${Math.round(v * 10) / 10}d`

function Panel({ title, meta, action, children }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 13.5, color: C.text, fontWeight: 600 }}>{title}</h2>
        {meta && <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{meta}</span>}
        {action && <span style={{ marginLeft: 'auto', alignSelf: 'center' }}>{action}</span>}
      </div>
      {children}
    </section>
  )
}
const Empty = ({ children }) => <div style={{ padding: '12px 14px', fontSize: 12.5, color: C.muted }}>{children}</div>
const Scroll = ({ children }) => <div style={{ overflowX: 'auto' }}>{children}</div>

export function useTeam(enabled) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const load = useCallback(async () => {
    if (!enabled) return
    const { data, error } = await supabase.rpc('home_team')
    setState({ loading: false, error: error ? error.message : null, data })
  }, [enabled])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

export default function TeamView({ home, team, onViewDesk, onPickView, queue }) {
  const navigate = useNavigate()
  const t = team.data
  const rows = useMemo(() => (home.rows || []).filter(r => !/^test/i.test(r.pid)), [home.rows])
  const owners = t?.owners || {}

  const people = useMemo(() => {
    if (!t) return []
    return t.people.map(p => {
      const mine = rows.filter(r => (r.is_prospect ? (r.owner_email || '').toLowerCase() : owners[r.pid]) === p.email && r.stage_code !== 'explore_not_taken')
      const open = mine.filter(r => r.urgency !== 'done')
      return {
        ...p, owned: mine.length,
        overdue: mine.filter(r => r.urgency === 'overdue').length,
        today: mine.filter(r => r.urgency === 'today').length,
        setups: mine.filter(r => r.days_to_setup != null && r.days_to_setup >= 0 && r.days_to_setup <= 6).length,
        onThem: open.filter(r => r.blocked_on === 'setup_ops').length,
        onOthers: open.filter(r => r.blocked_on && r.blocked_on !== 'setup_ops').length,
        quiet: mine.length - open.length,
      }
    }).sort((a, b) => b.owned - a.owned)
  }, [t, rows, owners])

  const stuck = useMemo(() => {
    const m = new Map()
    for (const r of rows) for (const th of (r.open_threads || [])) {
      if (th.urgency === 'done') continue
      const w = th.waiting_on || th.blocked_on || 'setup_ops'
      const k = th.code || th.label
      if (!m.has(k)) m.set(k, { label: STEP_NAME[th.code] || th.label || th.code, stage: th.stage_no ?? 99, cells: {} })
      const row = m.get(k); (row.cells[w] ||= []).push({ pid: r.pid, overdue: th.urgency === 'overdue' })
    }
    return [...m.values()].sort((a, b) => a.stage - b.stage)
  }, [rows])

  if (team.error) return <div className="tv"><style>{CSS}</style><Empty>{/home_team|does not exist|schema cache/i.test(team.error) ? 'The team view appears once the home_team migration is applied.' : `Couldn't load the team view — ${team.error}`}</Empty></div>
  if (team.loading || !t || home.loading) return <div className="tv" aria-busy="true"><style>{CSS}</style><div style={{ height: 76, borderRadius: 10, background: C.border, opacity: 0.35 }} /></div>

  const live = rows.filter(r => r.urgency !== 'done' && !r.is_prospect)
  const unowned = rows.filter(r => !r.is_prospect && !owners[r.pid])
  const unownedMoving = unowned.filter(r => r.urgency !== 'done' && (r.age_days ?? 999) <= 30)
  const verifyAll = t.people.reduce((s, p) => s + (p.verify || 0), 0)
  const oldestVerify = t.people.map(p => p.verify_oldest).filter(Boolean).sort()[0]
  const overdueBy = people.filter(p => p.overdue).map(p => `${p.overdue} ${first(p.email)}`).join(' · ')
  const stats = [
    { k: 'Live properties', v: live.length, h: `${rows.length - live.length} done or quiet`, go: () => onPickView('all') },
    { k: 'Overdue', v: rows.filter(r => r.urgency === 'overdue').length, tone: M.red, h: overdueBy || 'none', go: () => onPickView('overdue') },
    { k: 'Setups this week', v: rows.filter(r => r.days_to_setup != null && r.days_to_setup >= 0 && r.days_to_setup <= 6).length, h: people.filter(p => p.setups).map(p => `${p.setups} ${first(p.email)}`).join(' · ') || 'none dated', go: () => onPickView('setups') },
    { k: 'To verify', v: verifyAll, tone: verifyAll ? M.amber : C.text, h: oldestVerify ? `oldest ${ago(oldestVerify)}` : 'all clear' },
    { k: 'Unowned', v: unowned.length, tone: unownedMoving.length ? M.amber : C.text, h: `${unownedMoving.length} moving this month`, go: () => onPickView('unowned') },
  ]
  const maxOwned = Math.max(1, ...people.map(p => p.owned))
  const speedOf = (email, k) => t.speed.find(s => s.email === email && s.k === k)

  return (
    <div className="tv">
      <style>{CSS}</style>
      <div className="tv-strip">
        {stats.map(s => (
          <button key={s.k} type="button" onClick={s.go} disabled={!s.go}
            style={{ textAlign: 'left', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', display: 'grid', gap: 4, cursor: s.go ? 'pointer' : 'default', color: C.text, minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{s.k}</span>
            <span style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, color: s.v ? (s.tone || C.text) : C.text, fontVariantNumeric: 'tabular-nums' }}>{s.v}</span>
            <span style={{ fontSize: 12, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.h}</span>
          </button>
        ))}
      </div>

      <div className="tv-grid">
        <div className="tv-col">
          <Panel title="Team load" meta="who is carrying what · bar: waiting on them / on others / quiet">
            <Scroll><table>
              <thead><tr><th>Person</th><th>Owns</th><th>Load</th><th>Overdue</th><th>Due today</th><th>Setups wk</th><th>To verify</th><th>Last active</th><th></th></tr></thead>
              <tbody>{people.map(p => (
                <tr key={p.email}>
                  <td><b>{first(p.email)}</b></td>
                  <td className="n">{p.owned}</td>
                  <td>
                    <span title={`${p.onThem} waiting on them · ${p.onOthers} waiting on others · ${p.quiet} quiet`}
                      style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: C.input, width: Math.max(24, Math.round(140 * p.owned / maxOwned)) }}>
                      {[[p.onThem, M.red], [p.onOthers, M.amber], [p.quiet, M.green]].map(([v, col], i) => <i key={i} style={{ display: 'block', height: '100%', width: `${p.owned ? 100 * v / p.owned : 0}%`, background: col }} />)}
                    </span>
                  </td>
                  <td className="n" style={{ color: p.overdue ? M.red : undefined }}>{p.overdue}</td>
                  <td className="n">{p.today}</td>
                  <td className="n">{p.setups}</td>
                  <td className="n" style={{ color: p.verify ? M.amber : undefined }} title={p.verify_oldest ? `oldest closed ${ago(p.verify_oldest)}` : ''}>{p.verify}{p.verify_oldest ? <span style={{ color: C.muted, fontSize: 11 }}> · {ago(p.verify_oldest)}</span> : ''}</td>
                  <td className="n" style={{ color: C.muted, fontSize: 11.5 }}>{ago(p.last_active)}</td>
                  <td><button type="button" className="tv-btn" onClick={() => onViewDesk(p.email)}>Their desk ›</button></td>
                </tr>
              ))}</tbody>
            </table></Scroll>
          </Panel>

          <Panel title="Speed per person" meta="median days, last 60 days (vs the 60 before) · n = how many · still waiting counts the slow ones">
            <Scroll><table>
              <thead><tr><th>Person</th>{METRICS.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
              <tbody>{people.map(p => (
                <tr key={p.email}>
                  <td><b>{first(p.email)}</b></td>
                  {METRICS.map(([k]) => {
                    const s = speedOf(p.email, k)
                    if (!s || (!s.now_n && !s.open_n)) return <td key={k} style={{ color: C.muted, fontSize: 12 }}>no data yet</td>
                    const delta = s.now != null && s.prev != null && s.prev_n ? s.now - s.prev : null
                    return (
                      <td key={k}>
                        <span className="n" style={{ fontWeight: 700 }}>{s.now_n ? days(s.now) : '—'}</span>
                        {s.now_n > 0 && <span className="n" style={{ color: C.muted, fontSize: 11 }}> n={s.now_n}</span>}
                        {delta != null && Math.abs(delta) >= 0.5 && <span className="n" style={{ fontSize: 11, marginLeft: 6, color: delta > 0 ? M.red : M.green }}>{delta > 0 ? '+' : '−'}{Math.abs(Math.round(delta * 10) / 10)}d</span>}
                        {s.open_n > 0 && <div className="n" style={{ fontSize: 11, color: M.amber }}>{s.open_n} still waiting</div>}
                      </td>
                    )
                  })}
                </tr>
              ))}</tbody>
            </table></Scroll>
          </Panel>

          <Panel title="Where things are stuck" meta="open items by step × who it waits on · hover a number for the PIDs">
            {stuck.length === 0 ? <Empty>Nothing open.</Empty> : (
              <Scroll><table>
                <thead><tr><th>Step</th>{WAIT.map(([k, l]) => <th key={k} style={{ textAlign: 'center' }}>{l}</th>)}</tr></thead>
                <tbody>{stuck.map(s => (
                  <tr key={s.label}>
                    <td style={{ whiteSpace: 'normal', minWidth: 180 }}>{s.label}</td>
                    {WAIT.map(([k]) => {
                      const c = s.cells[k] || []
                      const od = c.filter(x => x.overdue).length
                      return (
                        <td key={k} className="n" style={{ textAlign: 'center' }} title={c.map(x => x.pid + (x.overdue ? ' (overdue)' : '')).join(', ')}>
                          {c.length ? <span style={{ display: 'inline-block', minWidth: 26, padding: '2px 6px', borderRadius: 6, background: od ? SOFT.red : SOFT.amber, color: od ? M.red : M.amber }}>{c.length}</span> : <span style={{ color: C.muted }}>·</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}</tbody>
              </table></Scroll>
            )}
          </Panel>
          {queue}
        </div>

        <div className="tv-col">
          <Panel title="Money at risk">
            <div className="tv-money">
              {[['With landlords', t.money.with_landlords, 'undecided estimates, sent in 60 days'],
                ['Approved, not invoiced', t.money.not_invoiced, 'final estimates with no invoice yet'],
                ['Closed, no invoice', t.money.closed_no_invoice, 'approved value, last 30 days']].map(([k, m, h]) => (
                <div key={k} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '11px 12px', background: C.bg, display: 'grid', gap: 4 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{k}</span>
                  <span style={{ fontSize: 21, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{inr(m?.value)}</span>
                  <span style={{ fontSize: 12, color: C.dim }}>{m?.n || 0} propert{m?.n === 1 ? 'y' : 'ies'} · {h}</span>
                </div>
              ))}
            </div>
          </Panel>

          <ExploreFunnel f={t.funnel} calls={t.calls || []} people={people.map(p => p.email)} />

          <Exceptions list={t.exceptions} navigate={navigate} />

          <Panel title="Vendor reliability" meta="last 60 days">
            {t.vendors.length === 0 ? <Empty>No vendor work in the last 60 days.</Empty> : (
              <Scroll><table>
                <thead><tr><th>Vendor</th><th>Items</th><th>Sent back</th><th>Days to close</th><th title="Setup days they were assigned to but did not punch in">No-show</th></tr></thead>
                <tbody>{t.vendors.map(v => {
                  const back = v.closed ? Math.round(100 * v.sent_back / v.closed) : null
                  return (
                    <tr key={v.id}>
                      <td><b>{v.name}</b> <span style={{ color: C.muted, fontFamily: MONO, fontSize: 11 }}>{v.trade}</span></td>
                      <td className="n">{v.closed}/{v.items}</td>
                      <td className="n" style={{ color: back >= 15 ? M.red : back > 0 ? M.amber : undefined }}>{back == null ? '—' : `${back}%`}</td>
                      <td className="n">{days(v.days_to_close) || '—'}</td>
                      <td className="n" style={{ color: v.noshow_missed ? M.red : C.muted }}>{v.noshow_chances ? `${v.noshow_missed} of ${v.noshow_chances}` : <span title="No setup days with this vendor assigned yet">—</span>}</td>
                    </tr>
                  )
                })}</tbody>
              </table></Scroll>
            )}
          </Panel>

        </div>
      </div>
    </div>
  )
}

// Exploratory work, end to end: raised → visited → decided → approved → set up,
// and how often each person's verdict matched supply's call — over the last
// 1, 3 or 6 months. Three months comes with the Team view; the others are
// fetched when picked, and the choice is remembered on this device.
const WINDOWS = [[30, '1 month'], [90, '3 months'], [180, '6 months']]
function ExploreFunnel({ f: f90, calls: calls90, people }) {
  const [days, setDays] = useState(() => { try { return Number(localStorage.getItem('pulse.team.explore.days')) || 90 } catch { return 90 } })
  const [other, setOther] = useState({})        // days → { funnel, calls }
  useEffect(() => { try { localStorage.setItem('pulse.team.explore.days', String(days)) } catch { /* private window */ } }, [days])
  useEffect(() => {
    if (days === 90 || other[days]) return undefined
    let alive = true
    supabase.rpc('home_explore_funnel', { p_days: days }).then(({ data, error }) => {
      if (!alive) return
      setOther(o => ({ ...o, [days]: error || !data ? { failed: true } : data }))
    })
    return () => { alive = false }
  }, [days, other])
  const loadingDays = days !== 90 && !other[days] ? days : null
  const f = days === 90 ? f90 : other[days]?.funnel || f90
  const calls = days === 90 ? calls90 : other[days]?.calls || calls90
  if (!f) return null
  const steps = [['Raised', f.raised], ['Visited', f.visited], ['Decided', f.decided], ['Approved', f.approved], ['Set up', f.set_up]]
  const max = Math.max(1, f.raised || 0)
  const mine = calls.filter(c => people.includes(c.email))
  const others = calls.filter(c => !people.includes(c.email))
  return (
    <Panel title="Exploratory" action={
      <span role="group" aria-label="Window" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 8, background: C.input }}>
        {WINDOWS.map(([d, l]) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}
            style={{ border: 'none', borderRadius: 6, padding: '4px 9px', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer', background: days === d ? C.panel : 'transparent', color: days === d ? C.text : C.muted, fontWeight: days === d ? 600 : 500 }}>
            {loadingDays === d ? '…' : l}
          </button>
        ))}
      </span>
    } meta={[f.raise_to_visit != null && `visited ~${Math.round(f.raise_to_visit)}d after raised`, f.visit_to_decision != null && `decided ~${Math.round(f.visit_to_decision)}d after the visit`].filter(Boolean).join(' · ')}>
      <div style={{ padding: '12px 14px', display: 'grid', gap: 6 }}>
        {steps.map(([k, v], i) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '78px 1fr 90px', gap: 10, alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, }}>{k}</span>
            <span style={{ height: 10, borderRadius: 5, background: C.input, overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${Math.round(100 * (v || 0) / max)}%`, background: i === 4 ? M.green : '#9e5a52', opacity: 1 - i * 0.12 }} /></span>
            <span className="n" style={{ fontSize: 12.5 }}><b>{v || 0}</b>{i > 0 && steps[i - 1][1] ? <span style={{ color: C.muted, fontSize: 11 }}> · {Math.round(100 * (v || 0) / steps[i - 1][1])}%</span> : ''}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 14px', display: 'grid', gap: 6 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted, }}>Whose calls match supply’s</div>
        {mine.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>No decided visits with a verdict yet.</div>}
        {[...mine, ...others].map(c => (
          <div key={c.email} title={(c.misses || []).map(m => `${m.name}: said ${m.said === 'go' ? 'Accept' : 'Reject'}, supply ${m.supply}`).join('\n')}
            style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13, opacity: people.includes(c.email) ? 1 : 0.6 }}>
            <b style={{ minWidth: 80 }}>{first(c.email)}</b>
            <span className="n" style={{ color: c.match === c.n ? M.green : M.amber }}>{c.match} of {c.n}</span>
            {(c.misses || []).length > 0 && <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>· {c.misses.map(m => m.name).join(', ')}</span>}
            {!people.includes(c.email) && <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>supply / other</span>}
          </div>
        ))}
        <div style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>A verdict is the visitor’s Accept / Reject in Pulse, or the outcome they recorded in Stage. Counts visits raised in the window.</div>
      </div>
    </Panel>
  )
}

const SEV = { red: M.red, amber: M.amber, grey: C.border }
function Exceptions({ list, navigate }) {
  const [open, setOpen] = useState({})
  const shown = list.filter(e => e.n > 0)
  return (
    <Panel title="Exceptions" meta="things that slipped through">
      {shown.length === 0 ? <Empty>Nothing slipped.</Empty> : (
        <div className="tv-rows">
          {shown.map(e => (
            <div key={e.key}>
              <button type="button" onClick={() => e.items.length && setOpen(o => ({ ...o, [e.key]: !o[e.key] }))} aria-expanded={!!open[e.key]}
                style={{ display: 'flex', gap: 10, alignItems: 'stretch', width: '100%', padding: '10px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: e.items.length ? 'pointer' : 'default', color: C.text }}>
                <span style={{ width: 4, borderRadius: 2, background: SEV[e.sev], flex: 'none' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{e.title}</span>
                  {e.key === 'empty_invoices' && <span style={{ display: 'block', fontFamily: MONO, fontSize: 11.5, color: C.muted }}>opened, never filled — safe to clean up once you decide</span>}
                  {e.key === 'utilities_stale' && <span style={{ display: 'block', fontFamily: MONO, fontSize: 11.5, color: C.muted }}>register the details on each property’s Utilities page</span>}
                </span>
                <span className="n" style={{ fontFamily: MONO, fontWeight: 700, color: SEV[e.sev] === C.border ? C.dim : SEV[e.sev], alignSelf: 'center' }}>{e.n}{e.items.length ? (open[e.key] ? ' ▾' : ' ▸') : ''}</span>
              </button>
              {open[e.key] && (
                <div style={{ padding: '0 14px 10px 28px', display: 'grid', gap: 4 }}>
                  {e.items.slice(0, 12).map((it, i) => (
                    <button key={i} type="button" onClick={() => it.request_id ? navigate(`/explore/${it.request_id}`) : it.pid && navigate(`/properties/${encodeURIComponent(it.pid)}`)}
                      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', background: 'none', border: 'none', padding: '3px 0', textAlign: 'left', cursor: 'pointer', color: C.text, fontSize: 12.5 }}>
                      <span style={{ fontFamily: MONO, color: M.amber }}>{it.pid}</span>
                      <span>{clean(it.name, it.pid)}</span>
                      <span style={{ color: C.dim }}>· {it.line}</span>
                      {it.who && <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>· {first(it.who)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
