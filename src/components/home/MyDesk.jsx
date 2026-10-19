import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DraftMessageButton } from '../comms/DraftMessage'
import { readDraftProgress } from '../../utils/draftProgress'

// My desk — the top of Home, tailored to the person signed in (or, for an
// admin, whoever they choose to view as). Everything comes from two reads:
// the journey engine rows Home already loads (passed in), and home_desk()
// for the panels the engine does not carry. Nothing is estimated; a panel
// with no data says so plainly.

// One typeface on Home: the nav's (Urbanist). Numbers stay aligned with tabular figures.
const MONO = "var(--font-nav, 'Urbanist', 'Poppins', sans-serif)"
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)',
  accent: 'var(--accent, #c8963e)', green: 'var(--green, #6f9a7e)', red: 'var(--red, #b0645b)',
}
const SOFT = { red: 'rgba(176,100,91,0.12)', amber: 'rgba(200,150,62,0.12)', green: 'rgba(111,154,126,0.12)' }
const URG = { overdue: 0, today: 1, soon: 2, waiting: 3, done: 4 }

const CSS = `
.dk{display:grid;gap:14px;padding:16px 20px 4px}
.dk-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.dk-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:14px;align-items:start}
.dk-col{display:grid;gap:14px;min-width:0}
.dk-quick{display:flex;gap:10px;flex-wrap:wrap}
.dk-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;padding:12px 14px}
.dk-today{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;padding:12px 14px}
.dk-row{display:flex;gap:10px;align-items:center;padding:10px 14px;flex-wrap:wrap}
.dk-rows>*+*{border-top:1px solid var(--border,#2e3040)}
.dk-btn{min-height:34px;padding:0 12px;border-radius:8px;font-family:var(--font-nav, Urbanist, Poppins, sans-serif);font-size:12px;font-weight:700;white-space:nowrap;cursor:pointer}
@media (max-width:1100px){.dk-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:720px){
  .dk{padding:12px 12px 4px}
  .dk-strip{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(128px,1fr);overflow-x:auto;padding-bottom:4px}
  .dk-week{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:116px;overflow-x:auto}
  .dk-today{grid-template-columns:minmax(0,1fr)}
  .dk-btn{min-height:40px}
}`

const name1 = (email) => { const s = (email || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '' }
const dayLbl = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })
const isoDay = (offset = 0) => { const t = new Date(Date.now() + offset * 86400000); return t.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
function ago(at) {
  if (!at) return ''
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (m < 60) return `${Math.max(m, 1)}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24); return d < 30 ? `${d}d ago` : new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
const when = (at) => at ? new Date(at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''
const inr = (n) => n == null ? '' : '₹' + Math.round(Number(n)).toLocaleString('en-IN')

const btnStyle = (kind) => ({
  border: `1px solid ${kind === 'primary' ? 'rgba(200,150,62,0.45)' : kind === 'done' ? 'transparent' : C.border}`,
  background: kind === 'primary' ? SOFT.amber : kind === 'done' ? SOFT.green : C.input,
  color: kind === 'primary' ? C.accent : kind === 'done' ? C.green : C.dim,
})
function Btn({ kind, children, ...rest }) { return <button type="button" className="dk-btn" style={btnStyle(kind)} {...rest}>{children}</button> }
function Chip({ tone = 'grey', children, title }) {
  const t = { red: [C.red, SOFT.red], amber: [C.accent, SOFT.amber], green: [C.green, SOFT.green], grey: [C.dim, C.input] }[tone]
  return <span title={title} style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: t[0], background: t[1] }}>{children}</span>
}
function Panel({ title, meta, action, children, id, style }) {
  return (
    <section id={id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '11px 14px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontFamily: MONO, fontSize: 13.5, color: C.text, fontWeight: 600 }}>{title}</h2>
        {meta && <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{meta}</span>}
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      {children}
    </section>
  )
}
const Empty = ({ children }) => <div style={{ padding: '12px 14px', fontSize: 12.5, color: C.muted }}>{children}</div>
// Some names carry their PID in front ("Test1089 · Dummy Residency"); it is
// already shown beside them.
export const clean = (name, pid) => (name || '').replace(new RegExp(`^${String(pid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·:-]?\\s*`), '') || name
const Pid = ({ pid }) => <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.accent, marginRight: 6 }}>{pid}</span>
const T1 = ({ children }) => <div style={{ fontWeight: 600, fontSize: 13.5 }}>{children}</div>
const T2 = ({ children }) => <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted, marginTop: 2 }}>{children}</div>

// ── data ──────────────────────────────────────────────────────────────────
export function useDesk(since, as, enabled = true) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const load = useCallback(async () => {
    if (!enabled) return
    const { data, error } = await supabase.rpc('home_desk', { p_since: since || null, p_as: as || null })
    setState({ loading: false, error: error ? error.message : null, data })
  }, [since, as, enabled])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// ── the desk ──────────────────────────────────────────────────────────────
export default function MyDesk({ home, desk, viewing, onPickView, onChanged }) {
  const navigate = useNavigate()
  const d = desk.data
  const mine = useMemo(() => new Set(d?.mine || []), [d])
  // my properties, plus prospects (exploratory requests) whose open step is mine
  const rows = useMemo(() => (home.rows || []).filter(r => r.is_prospect ? (r.owner_email || '').toLowerCase() === d?.me && r.stage_code !== 'explore_not_taken' : mine.has(r.pid)), [home.rows, mine, d])

  if (desk.error) {
    const notYet = /home_desk|does not exist|schema cache/i.test(desk.error)
    return <div className="dk"><style>{CSS}</style><Empty>{notYet ? 'Your desk appears once the home_desk migration is applied.' : `Couldn't load your desk — ${desk.error}`}</Empty></div>
  }
  if (desk.loading || !d) return <div className="dk" aria-busy="true"><style>{CSS}</style><div style={{ height: 76, borderRadius: 10, background: C.border, opacity: 0.35 }} /></div>

  const verifyItems = d.verify.reduce((s, g) => s + g.items.length, 0)
  const handovers = d.week.filter(w => w.kind === 'handover')
  const setupsWk = rows.filter(r => r.days_to_setup != null && r.days_to_setup >= 0 && r.days_to_setup <= 6)
  const overdue = rows.filter(r => r.urgency === 'overdue')
  const dueToday = rows.filter(r => r.urgency === 'today')
  const stats = [
    { k: 'Overdue', v: overdue.length, tone: overdue.length ? C.red : C.text, h: 'past their threshold', go: () => onPickView('my_overdue') },
    { k: 'Due today', v: dueToday.length, tone: dueToday.length ? C.accent : C.text, h: 'on your properties', go: () => onPickView('needs_me') },
    { k: 'Setups this week', v: setupsWk.length, tone: C.text, h: setupsWk.map(r => `${r.pid} ${r.days_to_setup === 0 ? 'today' : dayLbl(r.setup_date)}`).join(' · ') || 'none set', go: () => onPickView('setups') },
    { k: 'Handovers', v: handovers.length, tone: C.text, h: handovers.map(w => `${w.pid} ${dayLbl(w.date)}`).join(' · ') || 'next 7 days', go: () => document.getElementById('dk-week')?.scrollIntoView({ behavior: 'smooth' }) },
    { k: 'To verify', v: verifyItems, tone: verifyItems ? C.green : C.text, h: d.verify.length ? `across ${new Set(d.verify.map(v => v.pid)).size} propert${new Set(d.verify.map(v => v.pid)).size === 1 ? 'y' : 'ies'}` : 'all clear', go: () => document.getElementById('dk-verify')?.scrollIntoView({ behavior: 'smooth' }) },
  ]
  const moves = rows.filter(r => r.blocked_on === 'setup_ops' && r.urgency !== 'done')
    .sort((a, b) => ((URG[a.urgency] ?? 9) - (URG[b.urgency] ?? 9)) || ((a.days_to_setup ?? 9999) - (b.days_to_setup ?? 9999)) || ((b.age_days ?? 0) - (a.age_days ?? 0)))
    .slice(0, 6)

  return (
    <div className="dk">
      <style>{CSS}</style>

      {/* day strip */}
      <div className="dk-strip">
        {stats.map(s => (
          <button key={s.k} type="button" onClick={s.go}
            style={{ textAlign: 'left', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 13px', display: 'grid', gap: 4, cursor: 'pointer', color: C.text, minWidth: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{s.k}</span>
            <span style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, color: s.tone, fontVariantNumeric: 'tabular-nums' }}>{s.v}</span>
            <span style={{ fontSize: 12, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.h}</span>
          </button>
        ))}
      </div>

      <QuickStart drafts={d.drafts} viewing={viewing} navigate={navigate} />

      {d.noshow.map(n => (
        <section key={n.pid + n.vendor} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.red}`, background: SOFT.red }}>
          <span style={{ fontWeight: 700, color: C.red, fontFamily: MONO }}>!</span>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <T1>{n.vendor}{n.trade ? ` (${n.trade})` : ''} hasn’t punched in at <Pid pid={n.pid} />{clean(n.name, n.pid)}</T1>
            <T2>setup day · assigned with open work · no punch-in today</T2>
          </div>
          {n.phone && <a href={`tel:${n.phone}`} className="dk-btn" style={{ ...btnStyle('primary'), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Call {n.phone}</a>}
          <Btn onClick={() => navigate(`/properties/${n.pid}`)}>Open setup ›</Btn>
        </section>
      ))}

      <div className="dk-grid">
        <div className="dk-col">
          <ExploratoryVisits list={d.exploratory || []} navigate={navigate} onChanged={onChanged} viewing={viewing} />
          <WeekAhead week={d.week} navigate={navigate} />
          <Today today={d.today} navigate={navigate} />

          <Panel title="Your next moves" meta={moves.length ? `${moves.length} on your properties · most urgent first` : null}>
            {moves.length === 0 ? <Empty>Nothing is waiting on you right now.</Empty> : (
              <div className="dk-rows">
                {moves.map(r => (
                  <div key={r.pid + r.stage_code} className="dk-row">
                    <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                      <T1>{r.is_prospect ? <span style={{ fontFamily: MONO, fontSize: 11, color: '#b0645b', marginRight: 6 }}>Explore</span> : <Pid pid={r.pid} />}{r.is_prospect ? r.stage_label.replace(/^Explore · /, '') : (r.next_action_label || r.stage_label)}</T1>
                      <T2>{r.is_prospect ? r.property_name : `${clean(r.property_name, r.pid) || r.pid} · ${r.stage_label}`}</T2>
                    </div>
                    <Chip tone={r.urgency === 'overdue' ? 'red' : r.urgency === 'today' ? 'amber' : 'grey'}>
                      {r.urgency === 'overdue' && r.open_threads?.[0]?.overdue_by ? `overdue ${r.open_threads[0].overdue_by}d`
                        : r.days_to_setup != null && r.days_to_setup >= 0 ? (r.days_to_setup === 0 ? 'setup today' : `setup in ${r.days_to_setup}d`)
                        : r.age_days != null ? `${r.age_days}d` : r.urgency}
                    </Chip>
                    {!r.is_prospect && <DraftMessageButton pid={r.pid} code={r.stage_code} compact />}
                    {r.next_action_route && <Btn kind="primary" onClick={() => navigate(r.next_action_route)}>{(r.next_action_label || 'Open').split(' ').slice(0, 3).join(' ')} ›</Btn>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Renewals list={d.renewals} navigate={navigate} onChanged={onChanged} readOnly={!!viewing} />
        </div>

        <div className="dk-col">
          <SinceFeed feed={d.feed} since={d.since} navigate={navigate} />
          <WaitingOnSupply rows={(home.rows || []).filter(r => r.is_prospect && r.stage_code === 'explore_decision' && (d.is_admin && !viewing ? true : (r.owner_email || '').toLowerCase() === d.me))} navigate={navigate} />
          <Verify groups={d.verify} navigate={navigate} onChanged={onChanged} readOnly={!!viewing} />
          <Estimates list={d.estimates} navigate={navigate} />
          <Pins pins={d.pins} rows={rows} navigate={navigate} onChanged={onChanged} readOnly={!!viewing} />
        </div>
      </div>
    </div>
  )
}

// ── panels ────────────────────────────────────────────────────────────────
function QuickStart({ drafts, viewing, navigate }) {
  if (viewing) return null
  const card = { flex: '1 1 260px', display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', color: C.text, minWidth: 0 }
  const big = { width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center', background: SOFT.amber, color: C.accent, fontSize: 19, fontWeight: 700, flex: 'none' }
  // what this phone has saved for the draft: the section furthest along
  const progress = (pid) => {
    const p = readDraftProgress(pid)
    const parts = [['outdoor', p.outdoor], ['indoor', p.indoor], ['appliances', p.appliances]].filter(([, x]) => x.started && x.total)
    if (!parts.length) return null
    return parts.map(([k, x]) => `${k} ${x.done} of ${x.total}`).join(' · ')
  }
  return (
    <div className="dk-quick">
      <button type="button" style={card} onClick={() => navigate('/inspections/new')}>
        <span style={big}>+</span><span><T1>New inspection</T1><T2>start on site</T2></span>
      </button>
      {drafts.map(dr => {
        const c = dr.config || {}
        const state = { pid: dr.pid, inspectionType: c.inspectionType, propertyType: c.propertyType, layout: c.layout, rooms: c.rooms }
        const prog = progress(dr.pid)
        return (
          <button key={dr.id} type="button" style={card} onClick={() => navigate('/inspections/mode', { state })}>
            <span style={big}>↺</span>
            <span style={{ minWidth: 0 }}>
              <T1>Continue: <Pid pid={dr.pid} />{dr.name !== dr.pid ? clean(dr.name, dr.pid) : ''}</T1>
              <T2>{prog ? `${prog} · saved on this device` : `started ${ago(dr.created_at)} · progress is on the device that started it`}</T2>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Exploratory visits supply raised in Stage that I'm going on — the slot, the
// map, the landlord's number; and any whose date passed with no findings yet.
function ExploratoryVisits({ list, navigate, onChanged, viewing }) {
  const [busy, setBusy] = useState(null)
  const [why, setWhy] = useState({})
  const [asking, setAsking] = useState(null)
  if (!list.length) return null
  const t = (s) => { if (!s) return ''; const [h, m] = s.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` }
  async function respond(x, ok) {
    setBusy(x.id)
    const { error } = await supabase.rpc('exploratory_respond', { p_id: x.id, p_ok: ok, p_reason: ok ? null : why[x.id] })
    setBusy(null)
    if (!error) { setAsking(null); onChanged && onChanged() }
  }
  return (
    <Panel title="Your exploratory visits" meta="raised by supply in Stage"
      action={<button type="button" onClick={() => navigate('/calendar')} style={{ background: 'none', border: 'none', padding: 0, color: C.accent, fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>Calendar ›</button>}>
      <div className="dk-rows">
        {list.map(x => {
          const live = x.days === 0
          return (
            <div key={x.id} style={{ padding: '11px 14px', display: 'grid', gap: 8, background: x.overdue ? SOFT.red : live ? 'rgba(176,100,91,0.08)' : undefined, borderLeft: live ? '3px solid #b0645b' : undefined }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: x.overdue ? C.red : '#b0645b', }}>
                  {x.overdue ? `● Visit was ${dayLbl(x.date)} — findings due` : `${live ? '● ' : ''}Explore · ${x.days === 0 ? 'today' : x.days === 1 ? 'tomorrow' : dayLbl(x.date)}${x.time ? `, ${t(x.time)}` : ''}`}
                </span>
              </div>
              <button type="button" onClick={() => navigate(`/explore/${x.id}`)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: C.text }}>
                <T1>{x.name}{x.config ? <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}> · {x.config}</span> : ''}</T1>
                <T2>{(x.address || '').split('\n')[0]}{x.owner_name ? ` · landlord ${x.owner_name}` : ''}</T2>
              </button>
              {x.notes && <div style={{ borderLeft: '3px solid #b0645b', background: 'rgba(176,100,91,0.10)', padding: '6px 10px', borderRadius: '0 8px 8px 0', fontSize: 12.5 }}><span style={{ fontFamily: MONO, fontSize: 10, color: '#b0645b', display: 'block' }}>Supply’s ask</span>{x.notes}</div>}
              {asking === x.id ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input value={why[x.id] || ''} onChange={e => setWhy(w => ({ ...w, [x.id]: e.target.value }))} placeholder="Why can’t you go? (goes to the admin)" autoFocus
                    style={{ flex: '1 1 200px', minHeight: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontSize: 13 }} />
                  <Btn disabled={!why[x.id]?.trim() || busy === x.id} onClick={() => respond(x, false)}>Send</Btn>
                  <Btn onClick={() => setAsking(null)}>Cancel</Btn>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {!viewing && (live || x.overdue || x.draft) && <Btn kind="primary" onClick={() => navigate(`/explore/${x.id}/log`)}>{x.draft ? 'Continue the log' : live ? 'Start visit' : 'Log the findings'}</Btn>}
                  {x.maps_link && <a href={x.maps_link} target="_blank" rel="noreferrer" className="dk-btn" style={{ ...btnStyle(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Map</a>}
                  {x.owner_phone && <a href={`tel:${x.owner_phone}`} className="dk-btn" style={{ ...btnStyle(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Call landlord</a>}
                  {/* assigning is final; this is only the way out if plans change */}
                  {!viewing && x.pulse_assigned && !x.overdue && <button type="button" onClick={() => setAsking(x.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: '0 4px', color: C.muted, fontSize: 12, cursor: 'pointer' }}>Can’t make it?</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

// Visits logged, waiting on supply's decision — with a nudge ready to send.
function WaitingOnSupply({ rows, navigate }) {
  const [copied, setCopied] = useState(null)
  if (!rows.length) return null
  async function nudge(r) {
    const text = `Hi — ${r.property_name} was visited and the findings are in Stage. Could you share the decision so we can plan next steps?`
    try { await navigator.clipboard.writeText(text) } catch { /* clipboard blocked */ }
    setCopied(r.request_id); setTimeout(() => setCopied(null), 2200)
  }
  return (
    <Panel title="Waiting on supply" meta="visited, not decided yet">
      <div className="dk-rows">
        {rows.sort((a, b) => (b.age_days || 0) - (a.age_days || 0)).map(r => (
          <div key={r.pid} className="dk-row">
            <button type="button" onClick={() => navigate(`/explore/${r.request_id}`)} style={{ flex: '1 1 200px', minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: C.text }}>
              <T1><span style={{ fontFamily: MONO, fontSize: 11, color: '#b0645b', marginRight: 6 }}>Explore</span>{r.property_name}</T1>
              <T2>{name1(r.owner_email)} visited · supply hasn’t decided</T2>
            </button>
            <Chip tone={r.urgency === 'overdue' ? 'red' : 'grey'}>{r.age_days || 0}d</Chip>
            <Btn onClick={() => nudge(r)}>{copied === r.request_id ? '✓ Copied' : '✎ Nudge supply'}</Btn>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function WeekAhead({ week, navigate }) {
  const days = Array.from({ length: 7 }, (_, i) => isoDay(i))
  const tone = { setup: [C.accent, SOFT.amber, 'setup'], handover: [C.green, SOFT.green, 'handover'], close_by: [C.dim, C.input, 'close by'], exploratory: ['#b0645b', 'rgba(176,100,91,0.13)', 'exploratory'] }
  return (
    <Panel id="dk-week" title="Week ahead" meta="setups · handovers · work-order close-by dates"
      action={<button type="button" onClick={() => navigate('/calendar')} style={{ background: 'none', border: 'none', padding: 0, color: C.accent, fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>Full calendar ›</button>}>
      {week.length === 0 ? <Empty>Nothing dated in the next 7 days. Setup and handover dates appear here once they’re set on the journey.</Empty> : (
        <div className="dk-week">
          {days.map((iso, i) => {
            const evs = week.filter(w => w.date === iso)
            return (
              <div key={iso} style={{ border: `1px solid ${i === 0 ? 'rgba(200,150,62,0.45)' : C.border}`, borderRadius: 8, padding: 8, minHeight: 78, display: 'grid', alignContent: 'start', gap: 5, background: C.bg }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted, }}>{i === 0 ? 'Today' : dayLbl(iso)}</span>
                {evs.map(e => (
                  <button key={e.kind + e.pid} type="button" onClick={() => e.kind === 'exploratory' ? navigate(`/explore/${e.request_id}`) : navigate(`/properties/${e.pid}`)} title={`${e.name} · ${tone[e.kind][2]}`}
                    style={{ textAlign: 'left', fontSize: 11.5, lineHeight: 1.25, padding: '3px 6px', borderRadius: 5, border: 'none', cursor: 'pointer', color: tone[e.kind][0], background: tone[e.kind][1] }}>
                    {e.kind === 'exploratory' ? `${(e.name || '').split(',')[0]} · visit` : `${e.pid} ${tone[e.kind][2]}`}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

// One card per setup or handover in the next 7 days, each carrying what that
// step needs: arrivals on the day, utilities and vendors before it, QC and the
// landlord message before a handover.
function utilLine(k, u, active) {
  const n = k === 'wifi' ? 'WiFi' : 'RO'
  if (active) return [`${n} active`, C.green]
  if (u?.requested_at && u.months === 0) return [`${n} not needed`, C.muted]
  if (u?.requested_at) return [`${n} requested`, C.accent]
  return [`${n} not requested`, C.red]
}
function Today({ today, navigate }) {
  if (!today.length) return null
  const whenTxt = (x) => x.days === 0 ? 'today' : x.days === 1 ? 'tomorrow' : new Date(x.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <Panel title="Coming up" meta="setups and handovers, next 7 days">
      <div className="dk-today">
        {today.map(x => {
          const p = x.panel, vendors = p?.vendors || []
          const arrived = vendors.filter(v => v.first_in_today), missing = vendors.filter(v => !v.first_in_today)
          const total = vendors.reduce((s, v) => s + (v.items_total || 0), 0), closed = vendors.reduce((s, v) => s + (v.items_closed || 0), 0)
          const live = x.days === 0
          const lines = []
          if (x.kind === 'setup' && live) {
            lines.push([vendors.length ? `${arrived.length} of ${vendors.length} vendors in${missing.length ? ` · ${missing.slice(0, 2).map(v => v.name.split(' ')[0]).join(', ')} not arrived` : ''}` : 'no vendors assigned', vendors.length && !missing.length ? C.green : missing.length ? C.red : C.red])
          } else if (x.kind === 'setup') {
            const w = utilLine('wifi', x.wifi, p?.utilities?.wifi), r = utilLine('ro', x.ro, p?.utilities?.ro)
            lines.push([<><span style={{ color: w[1] }}>{w[0]}</span> · <span style={{ color: r[1] }}>{r[0]}</span></>, C.muted])
            lines.push([vendors.length ? `${vendors.length} vendor${vendors.length === 1 ? '' : 's'} assigned` : 'no vendors assigned yet', vendors.length ? C.muted : C.red])
          } else {
            lines.push([x.qc_done ? 'QC done' : 'QC not marked yet', x.qc_done ? C.green : C.accent])
          }
          return (
            <div key={x.kind + x.pid} style={{ border: `1px solid ${live ? 'rgba(200,150,62,0.45)' : C.border}`, borderRadius: 9, padding: '11px 12px', display: 'grid', gap: 6, background: live ? SOFT.amber : C.bg, minWidth: 0 }}>
              <button type="button" onClick={() => navigate(`/properties/${x.pid}`)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: C.text, display: 'grid', gap: 6 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent, fontWeight: 700, }}>{live ? '● ' : ''}{x.kind} · {whenTxt(x)}</span>
                <span><Pid pid={x.pid} /><b>{clean(x.name, x.pid)}</b></span>
                {lines.map(([t, col], i) => <span key={i} style={{ fontFamily: MONO, fontSize: 11.5, color: col }}>{t}</span>)}
              </button>
              {x.kind === 'setup' && total > 0 && <>
                <span style={{ height: 6, borderRadius: 3, background: C.input, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.round(100 * closed / total)}%`, background: C.green }} /></span>
                <T2>items {closed} of {total} closed</T2>
              </>}
              {x.kind === 'handover' && <span><DraftMessageButton pid={x.pid} code={live ? 'handover_today' : 'handover_scheduled'} label="Draft the handover message" compact /></span>}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

const FEED_ICON = { explore_raised: ['+', '#b0645b', 'rgba(176,100,91,0.13)'], explore_logged: ['◉', '#b0645b', 'rgba(176,100,91,0.13)'], explore_decided: ['✓', C.green, SOFT.green], approved: ['✓', C.green, SOFT.green], queried: ['?', C.red, SOFT.red], viewed: ['◉', C.dim, C.input], vendor_closed: ['◆', C.accent, SOFT.amber], payment: ['₹', C.dim, C.input], journey: ['·', C.dim, C.input] }
function feedText(f) {
  switch (f.kind) {
    case 'approved': return [f.whole ? 'Landlord approved the estimate' : `Landlord approved ${f.n} line${f.n === 1 ? '' : 's'}`, f.who ? `by ${f.who}` : '']
    case 'queried': return [`Landlord asked a question${f.detail ? ` · ${f.detail.replace(/_/g, ' ')}` : ''}`, f.who ? `by ${f.who}` : '']
    case 'viewed': return [`Landlord opened the estimate${f.n > 1 ? ` ${f.n}×` : ''}`, '']
    case 'vendor_closed': return [`${f.who || 'Vendor'} closed ${f.n} item${f.n === 1 ? '' : 's'}${f.whole ? ' · verified' : ' — verify'}`, f.detail || '']
    case 'payment': return [`Payment logged · ${f.detail}`, f.who ? `by ${f.who}` : '']
    case 'explore_raised': return [`Supply raised ${(f.detail || '').split(' · ')[0]} for an exploratory`, (f.detail || '').split(' · ').slice(1).join(' · ')]
    case 'explore_logged': return [`${name1(f.who)} logged ${f.detail} — ${({ 1: 'Go', 2: 'No-go', 3: 'Unsure' })[f.n]}`, f.whole ? 'findings in Stage ✓' : 'not pasted into Stage yet']
    case 'explore_decided': return [`Supply ${f.who === 'rejected' ? 'turned down' : f.who === 'converted' ? 'converted' : 'approved'} ${f.detail}`, '']
    default: return [f.detail || 'Journey updated', f.who ? `by ${f.who}` : '']
  }
}
function SinceFeed({ feed, since, navigate }) {
  return (
    <Panel title="Since you last looked" meta={since ? `since ${when(since)}` : null}>
      {feed.length === 0 ? <Empty>Nothing new on your properties since then.</Empty> : (
        <div className="dk-rows">
          {feed.slice(0, 12).map((f, i) => {
            const [t, sub] = feedText(f), ic = FEED_ICON[f.kind] || FEED_ICON.journey
            return (
              <button key={i} type="button" className="dk-row" onClick={() => navigate(String(f.pid).startsWith('explore:') ? `/explore/${f.pid.slice(8)}` : `/properties/${f.pid}`)}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: C.text, alignItems: 'flex-start' }}>
                <span style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 12, fontWeight: 700, color: ic[1], background: ic[2], flex: 'none' }}>{ic[0]}</span>
                <span style={{ flex: '1 1 180px', minWidth: 0 }}><T1>{t}</T1><T2>{String(f.pid).startsWith('explore:') ? <span style={{ color: '#b0645b', marginRight: 6 }}>Explore</span> : <><Pid pid={f.pid} />{clean(f.name, f.pid)}</>}{sub ? `${String(f.pid).startsWith('explore:') ? '' : ' · '}${sub}` : ''}</T2></span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{ago(f.at)}</span>
              </button>
            )
          })}
          {feed.length > 12 && <Empty>+{feed.length - 12} more — open the property timelines for the rest.</Empty>}
        </div>
      )}
    </Panel>
  )
}

function Verify({ groups, navigate, onChanged, readOnly }) {
  const [open, setOpen] = useState({})
  const [busy, setBusy] = useState(null)
  const [done, setDone] = useState({})
  const [err, setErr] = useState('')
  async function verifyAll(g) {
    setBusy(g.wo_id); setErr('')
    const { error } = await supabase.rpc('wo_verify_all', { p_work_order_id: g.wo_id })
    setBusy(null)
    if (error) { setErr(error.message); return }
    setDone(x => ({ ...x, [g.wo_id]: true }))
    onChanged && onChanged()
  }
  return (
    <Panel id="dk-verify" title="Ready to verify" meta="vendor closed, waiting on you">
      {groups.length === 0 ? <Empty>Nothing waiting — no vendor has closed new work.</Empty> : (
        <div className="dk-rows">
          {groups.map(g => (
            <div key={g.wo_id}>
              <div className="dk-row">
                <button type="button" onClick={() => setOpen(o => ({ ...o, [g.wo_id]: !o[g.wo_id] }))} aria-expanded={!!open[g.wo_id]}
                  style={{ flex: '1 1 200px', minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: C.text, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Chip tone="amber">{g.items.length}</Chip>
                  <span style={{ minWidth: 0 }}><T1><Pid pid={g.pid} />{clean(g.name, g.pid)}</T1><T2>{g.vendor}{g.trade ? ` · ${g.trade}` : ''} · closed {ago(g.oldest)}</T2></span>
                </button>
                {done[g.wo_id] ? <Btn kind="done" disabled>✓ Verified</Btn>
                  : readOnly ? <Btn onClick={() => navigate(`/properties/${g.pid}/work-orders`)}>Open ›</Btn>
                  : <Btn kind="primary" disabled={busy === g.wo_id} onClick={() => verifyAll(g)}>{busy === g.wo_id ? 'Verifying…' : 'Verify all'}</Btn>}
              </div>
              {open[g.wo_id] && (
                <div style={{ padding: '0 14px 10px 46px', display: 'grid', gap: 5 }}>
                  {g.items.map(i => (
                    <div key={i.id} style={{ fontSize: 13 }}>
                      <b>{i.name}</b>{i.what && i.what !== i.name ? <span style={{ color: C.dim }}> — {i.what}</span> : ''}
                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{i.area ? ` · ${i.area}` : ''}</span>
                      {i.note && <div style={{ fontSize: 12, color: C.dim, fontStyle: 'italic' }}>“{i.note}”</div>}
                    </div>
                  ))}
                  <button type="button" onClick={() => navigate(`/properties/${g.pid}/work-orders`)} style={{ justifySelf: 'start', background: 'none', border: 'none', padding: 0, color: C.accent, fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}>Check photos on work orders ›</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {err && <Empty><span style={{ color: C.red }}>Not verified — {err}</span></Empty>}
    </Panel>
  )
}

// What the landlord's behaviour says, from the opens and approvals we record.
function readEstimate(e) {
  const days = e.sent_at ? Math.floor((Date.now() - new Date(e.sent_at).getTime()) / 86400000) : null
  if (e.questions > 0 && e.approved < e.lines) return ['amber', `${e.questions} question${e.questions === 1 ? '' : 's'} open — reply`]
  if (!e.views) return [days != null && days >= 2 ? 'red' : 'grey', days != null && days >= 2 ? 'never opened — re-send link + code' : 'not opened yet']
  if (e.approved > 0) return ['amber', `${e.approved} of ${e.lines} approved — follow up on the rest`]
  if (e.views >= 2) return ['amber', `opened ${e.views}×, no decision — call them`]
  return [days != null && days >= 3 ? 'amber' : 'grey', days != null && days >= 3 ? 'opened once, gone quiet — nudge' : 'opened — give it a day']
}
function Estimates({ list, navigate }) {
  return (
    <Panel title="Estimates with landlords" meta="sent in the last 60 days, still undecided">
      {list.length === 0 ? <Empty>No estimate is waiting on a landlord.</Empty> : (
        <div className="dk-rows">
          {list.map(e => {
            const [tone, read] = readEstimate(e)
            return (
              <button key={e.id} type="button" className="dk-row" onClick={() => navigate(`/estimate/${e.id}`)}
                style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: C.text }}>
                <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <T1><Pid pid={e.pid} />{clean(e.name, e.pid)}</T1>
                  <T2>sent {ago(e.sent_at)} · {inr(e.total)} · {e.views ? `opened ${e.views}×, last ${ago(e.last_view)}` : 'never opened'}</T2>
                </span>
                <Chip tone={tone}>{read}</Chip>
              </button>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function Renewals({ list, navigate, onChanged, readOnly }) {
  const [paid, setPaid] = useState({})
  const [err, setErr] = useState('')
  async function markPaid(r) {
    setErr('')
    const { error } = await supabase.rpc('utility_mark_recharged', { p_id: r.id, p_on: r.due })
    if (error) { setErr(error.message); return }
    setPaid(p => ({ ...p, [r.id]: true }))
    onChanged && onChanged()
  }
  return (
    <Panel title="Recharges & renewals" meta="WiFi and RO due in the next 14 days, from each plan’s start date and cycle">
      {list.length === 0 ? <Empty>Nothing due in the next 14 days.</Empty> : (
        <div className="dk-rows">
          {list.map(r => (
            <div key={r.id} className="dk-row">
              <button type="button" onClick={() => navigate(`/properties/${r.pid}/utilities`)} style={{ flex: '1 1 200px', minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: C.text }}>
                <T1><Pid pid={r.pid} />{r.type === 'wifi' ? 'WiFi' : 'RO'}{r.provider ? ` · ${r.provider}` : ''}</T1>
                <T2>{[clean(r.name, r.pid), inr(r.amount), r.cycle && r.cycle.toLowerCase()].filter(Boolean).join(' · ')}{r.last_recharged_on ? ` · last paid ${new Date(r.last_recharged_on + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</T2>
              </button>
              <Chip tone={r.days <= 0 ? 'red' : r.days <= 3 ? 'amber' : 'grey'}>{r.days <= 0 ? 'due today' : `due ${dayLbl(r.due)} · ${r.days}d`}</Chip>
              {!readOnly && (paid[r.id] ? <Btn kind="done" disabled>✓ Paid</Btn> : <Btn onClick={() => markPaid(r)} title="Records this cycle as paid; the next due date moves on">Mark paid</Btn>)}
            </div>
          ))}
        </div>
      )}
      {err && <Empty><span style={{ color: C.red }}>Not saved — {err}</span></Empty>}
    </Panel>
  )
}

function Pins({ pins, rows, navigate, onChanged, readOnly }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)      // pid
  const [form, setForm] = useState({ pid: '', note: '', remind: '' })
  const [err, setErr] = useState('')
  const toLocal = (at) => { if (!at) return ''; const d = new Date(at); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
  async function save() {
    setErr('')
    if (!form.pid) { setErr('Pick a property'); return }
    const { error } = await supabase.rpc('home_pin_set', { p_pid: form.pid, p_note: form.note || null, p_remind_at: form.remind ? new Date(form.remind).toISOString() : null })
    if (error) { setErr(error.message); return }
    setAdding(false); setEditing(null); setForm({ pid: '', note: '', remind: '' })
    onChanged && onChanged()
  }
  async function remove(pid) {
    const { error } = await supabase.rpc('home_pin_remove', { p_pid: pid })
    if (error) { setErr(error.message); return }
    onChanged && onChanged()
  }
  const input = { minHeight: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontFamily: MONO, fontSize: 12.5, minWidth: 0 }
  const editor = (lockPid) => (
    <div className="dk-row" style={{ alignItems: 'stretch' }}>
      {lockPid ? <span style={{ alignSelf: 'center' }}><Pid pid={form.pid} /></span> : (
        <select value={form.pid} onChange={e => setForm(f => ({ ...f, pid: e.target.value }))} style={{ ...input, flex: '1 1 180px' }} aria-label="Property">
          <option value="">Pick one of your properties</option>
          {rows.filter(r => !pins.some(p => p.pid === r.pid)).map(r => <option key={r.pid} value={r.pid}>{r.pid} · {r.property_name || ''}</option>)}
        </select>
      )}
      <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Note to self" style={{ ...input, flex: '2 1 200px' }} aria-label="Note" />
      <input type="datetime-local" value={form.remind} onChange={e => setForm(f => ({ ...f, remind: e.target.value }))} style={input} aria-label="Remind me at" />
      <Btn kind="primary" onClick={save}>Save</Btn>
      <Btn onClick={() => { setAdding(false); setEditing(null); setErr('') }}>Cancel</Btn>
    </div>
  )
  return (
    <Panel title="Pinned" meta="your notes and reminders"
      action={!readOnly && !adding && <button type="button" onClick={() => { setAdding(true); setEditing(null); setForm({ pid: '', note: '', remind: '' }) }} style={{ background: 'none', border: 'none', padding: 0, color: C.accent, fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>+ Pin a property</button>}>
      {adding && editor(false)}
      {pins.length === 0 && !adding ? <Empty>Pin a property to keep a note on it or get reminded about it here.</Empty> : (
        <div className="dk-rows">
          {pins.map(p => editing === p.pid ? <div key={p.pid}>{editor(true)}</div> : (
            <div key={p.pid} className="dk-row" style={p.due ? { background: SOFT.amber } : undefined}>
              <button type="button" onClick={() => navigate(`/properties/${p.pid}`)} style={{ flex: '1 1 200px', minWidth: 0, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: C.text }}>
                <T1><Pid pid={p.pid} />{clean(p.name, p.pid)}</T1>
                {p.note && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 3 }}>{p.note}</div>}
                {p.remind_at && <div style={{ fontFamily: MONO, fontSize: 11, color: p.due ? C.accent : C.muted, marginTop: 2 }}>{p.due ? '⏰ Reminder due · ' : '⏰ '}{when(p.remind_at)}</div>}
              </button>
              {!readOnly && <>
                <Btn onClick={() => { setEditing(p.pid); setAdding(false); setForm({ pid: p.pid, note: p.note || '', remind: toLocal(p.remind_at) }) }}>Edit</Btn>
                <Btn onClick={() => remove(p.pid)} title="Unpin">Unpin</Btn>
              </>}
            </div>
          ))}
        </div>
      )}
      {err && <Empty><span style={{ color: C.red }}>{err}</span></Empty>}
    </Panel>
  )
}

export { name1 }
