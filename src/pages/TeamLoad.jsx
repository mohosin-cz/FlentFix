import { useState, useEffect, useMemo, Fragment } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { supabase } from '../lib/supabase'
import { useJourneyHome, ago as since } from '../components/home/JourneyPanels'
import { useTeam } from '../components/home/TeamView'
import { clean } from '../components/home/MyDesk'
import {
  liveRows, ownerOf, isCarried, bucketOf, isSetupThisWeek, teamLoad, firstName,
  WAITING, STEPS, STEP_ORDER, stepName,
} from '../utils/teamLoad'

// Team load, opened up. Home's card says who is carrying how much; this page
// says what exactly — every property and prospect each person holds, the step
// it is on, who that step waits on, the limit it is held to — and, alongside,
// how every number on the card is worked out, with the live counts that make
// it up. Same rows, same owners, same rules as the card (utils/teamLoad.js).

const F = "var(--font-nav, 'Urbanist', 'Poppins', sans-serif)"
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)', accent: 'var(--accent, #c8963e)',
}
// the Team view's matte status colours
const M = { red: '#b0645b', amber: '#a8895a', green: '#6f9a7e', blue: '#6f86a8', grey: '#7a7c90' }
const SOFT = { red: 'rgba(158,90,82,0.16)', amber: 'rgba(160,132,82,0.16)', green: 'rgba(94,138,110,0.16)', blue: 'rgba(111,134,168,0.16)', grey: 'rgba(122,124,144,0.14)' }
const BUCKET = {
  them: { label: 'On them', tone: 'red', blurb: 'the next move is the team’s' },
  others: { label: 'On others', tone: 'amber', blurb: 'someone else has it, and it’s due or late' },
  quiet: { label: 'Quiet', tone: 'green', blurb: 'someone else has it, still on time' },
}
const URG = {
  overdue: { label: 'Overdue', tone: 'red', rank: 0 }, today: { label: 'Today', tone: 'amber', rank: 1 },
  soon: { label: 'Soon', tone: 'blue', rank: 2 }, waiting: { label: 'Waiting', tone: 'grey', rank: 3 }, done: { label: 'Done', tone: 'green', rank: 4 },
}
const WAIT_TONE = { setup_ops: 'red', landlord: 'amber', vendor: 'amber', supply: 'amber', none: 'grey' }
const NOBODY = '__unowned'
const SORTS = [['urgency', 'Most urgent'], ['age', 'Longest on the step'], ['setup', 'Setup soonest'], ['pid', 'PID']]

const CSS = `
.tl{max-width:1320px;margin:0 auto;padding:16px 20px 64px;display:grid;gap:22px}
.tl a{color:inherit}
.tl-head{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px 16px}
.tl-h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-0.01em}
.tl-sub{margin:4px 0 0;color:${C.dim};font-size:13.5px;max-width:720px;line-height:1.5}
.tl-crumb{font-size:12px;color:${C.muted};text-decoration:none;font-weight:600}
.tl-crumb:hover{color:${C.accent}}
.tl-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.tl-tile{background:${C.panel};border:1px solid ${C.border};border-radius:10px;padding:12px 14px;display:grid;gap:4px;min-width:0;text-align:left;color:${C.text};font-family:${F}}
button.tl-tile{cursor:pointer}
button.tl-tile:hover{border-color:${C.accent}}
.tl-tk{font-size:12px;color:${C.muted};font-weight:600}
.tl-tv{font-size:28px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.tl-th{font-size:12px;color:${C.dim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl-sec{display:grid;gap:12px;min-width:0}
.tl-sech{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
.tl-sech h2{margin:0;font-size:16px;font-weight:600}
.tl-sech span{font-size:12.5px;color:${C.muted}}
.tl-panel{background:${C.panel};border:1px solid ${C.border};border-radius:10px;min-width:0}
.tl-people{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.tl-person{background:${C.panel};border:1px solid ${C.border};border-radius:12px;padding:14px;display:grid;gap:12px;align-content:start;text-align:left;color:${C.text};font-family:${F};cursor:pointer;min-width:0}
.tl-person:hover{border-color:${C.dim}}
.tl-person[aria-pressed=true]{border-color:${C.accent};box-shadow:0 0 0 1px ${C.accent} inset}
.tl-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:14px;background:${C.input};color:${C.accent};flex:none}
.tl-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:${C.input}}
.tl-bar i{display:block;height:100%}
.tl-mini{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.tl-mini>div{background:${C.bg};border:1px solid ${C.border};border-radius:8px;padding:7px 8px;display:grid;gap:2px}
.tl-mini b{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.tl-mini span{font-size:11px;color:${C.muted}}
.tl-doing{display:grid;gap:5px;font-size:12.5px}
.tl-doing>div{display:flex;gap:8px;align-items:center;min-width:0}
.tl-doing .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${C.dim}}
.tl-pill{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.tl-dot{width:7px;height:7px;border-radius:50%;flex:none;display:inline-block}
.tl-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 14px;border-bottom:1px solid ${C.border}}
.tl-chips{display:flex;gap:6px;flex-wrap:wrap}
.tl-chip{min-height:32px;padding:0 12px;border-radius:999px;border:1px solid ${C.border};background:transparent;color:${C.dim};font-family:${F};font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.tl-chip[aria-pressed=true]{background:rgba(200,150,62,0.12);border-color:${C.accent};color:${C.accent}}
.tl-in{min-height:34px;padding:0 10px;border-radius:8px;border:1px solid ${C.border};background:${C.input};color:${C.text};font-family:${F};font-size:12.5px}
.tl-search{flex:1;min-width:180px}
.tl-btn{min-height:34px;padding:0 12px;border-radius:8px;border:1px solid ${C.border};background:${C.input};color:${C.dim};font-family:${F};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center}
.tl-btn:hover{color:${C.text}}
.tl-btn.acc{background:${C.accent};border-color:${C.accent};color:var(--on-accent,#16171f)}
.tl-count{padding:8px 14px;font-size:12px;color:${C.muted};border-bottom:1px solid ${C.border};display:flex;gap:10px;flex-wrap:wrap}
.tl-row{display:grid;grid-template-columns:92px minmax(0,1.3fr) minmax(0,1.8fr) 96px 150px 84px 80px 168px;gap:12px;align-items:center;padding:11px 14px;border-bottom:1px solid ${C.border};font-size:13px}
.tl-row.hd{font-size:11.5px;color:${C.muted};font-weight:700;padding-top:9px;padding-bottom:9px}
.tl-row:last-child{border-bottom:0}
.tl-pid{font-variant-numeric:tabular-nums;font-weight:700;color:${C.accent};text-decoration:none}
.tl-nm{color:${C.dim};font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl-step{min-width:0}
.tl-step b{font-weight:600;display:block}
.tl-note{font-size:11.5px;color:${C.muted};margin-top:2px}
.tl-num{font-variant-numeric:tabular-nums}
.tl-more{background:none;border:0;color:${C.muted};font-family:${F};font-size:11.5px;cursor:pointer;padding:2px 0;text-align:left}
.tl-more:hover{color:${C.accent}}
.tl-threads{grid-column:1/-1;display:grid;gap:6px;margin:2px 0 0;padding:10px 12px;border-radius:8px;background:${C.bg};border:1px solid ${C.border}}
.tl-thread{display:grid;grid-template-columns:86px minmax(0,1fr) 96px 150px 150px;gap:10px;align-items:center;font-size:12.5px}
.tl-mx{width:100%;border-collapse:collapse;font-size:13px}
.tl-mx th{font-size:11.5px;color:${C.muted};font-weight:700;text-align:center;padding:9px 10px;border-bottom:1px solid ${C.border};white-space:nowrap}
.tl-mx th:first-child,.tl-mx td:first-child{text-align:left;position:sticky;left:0;background:${C.panel};z-index:1}
.tl-mx td{padding:8px 10px;border-bottom:1px solid ${C.border};text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}
.tl-mx tr.ph td{font-size:11px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;padding-top:12px;background:${C.panel}}
.tl-mx tr:last-child td{border-bottom:0}
.tl-cell{display:inline-block;min-width:26px;padding:2px 6px;border-radius:6px}
.tl-how{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.tl-card{background:${C.panel};border:1px solid ${C.border};border-radius:12px;padding:16px;display:grid;gap:10px;align-content:start;min-width:0}
.tl-card h3{margin:0;font-size:14.5px;font-weight:600;display:flex;gap:10px;align-items:center}
.tl-card h3 i{font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11.5px;background:${C.input};color:${C.accent};flex:none}
.tl-card p{margin:0;font-size:13px;line-height:1.55;color:${C.dim}}
.tl-card ol,.tl-card ul{margin:0;padding-left:18px;font-size:13px;line-height:1.6;color:${C.dim}}
.tl-card li b,.tl-card p b{color:${C.text};font-weight:600}
.tl-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;background:${C.input};padding:1px 5px;border-radius:4px;color:${C.text}}
.tl-fun{display:grid;gap:6px}
.tl-fun>div{display:grid;grid-template-columns:minmax(0,190px) 1fr 52px;gap:10px;align-items:center;font-size:12.5px}
.tl-fun .track{height:9px;border-radius:5px;background:${C.input};overflow:hidden}
.tl-fun .track i{display:block;height:100%;border-radius:5px}
.tl-defs{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:13px;line-height:1.5}
.tl-defs dt{font-weight:600;color:${C.text};white-space:nowrap}
.tl-defs dd{margin:0;color:${C.dim}}
.tl-lim{width:100%;border-collapse:collapse;font-size:13px}
.tl-lim th{font-size:11.5px;color:${C.muted};font-weight:700;text-align:left;padding:9px 14px;border-bottom:1px solid ${C.border};white-space:nowrap}
.tl-lim td{padding:9px 14px;border-bottom:1px solid ${C.border};vertical-align:top}
.tl-lim tr:last-child td{border-bottom:0}
.tl-warn{display:grid;gap:10px}
.tl-warnrow{display:flex;gap:12px;padding:12px 14px;background:${C.panel};border:1px solid ${C.border};border-radius:10px;font-size:13px;line-height:1.55;color:${C.dim}}
.tl-warnrow>i{width:4px;border-radius:2px;flex:none}
.tl-warnrow b{color:${C.text};font-weight:600}
.tl-empty{padding:28px 14px;text-align:center;color:${C.muted};font-size:13px;display:grid;gap:8px;justify-items:center}
.tl-scroll{overflow-x:auto}
@media (max-width:1180px){
  .tl-strip{grid-template-columns:repeat(3,minmax(0,1fr))}
  .tl-row{grid-template-columns:86px minmax(0,1fr) minmax(0,1.3fr) 96px 130px 160px}
  .tl-row .c-setup,.tl-row .c-owner{display:none}
}
@media (max-width:860px){
  .tl-how{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:720px){
  .tl{padding:12px 16px 104px;gap:18px}
  .tl-h1{font-size:21px}
  .tl-strip{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tl-tv{font-size:24px}
  .tl-people{grid-template-columns:minmax(0,1fr)}
  .tl-row.hd{display:none}
  .tl-row{grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;align-items:start}
  .tl-row .c-urg{grid-column:1/-1;order:-1}
  .tl-row .c-prop{grid-column:1/2}
  .tl-row .c-act{grid-column:2/3;grid-row:2/3;align-self:start}
  .tl-row .c-step,.tl-row .c-wait,.tl-row .c-age{grid-column:1/-1}
  .tl-row .c-setup,.tl-row .c-owner{display:block;grid-column:auto}
  .tl-row .c-setup:empty{display:none}
  .tl-thread{grid-template-columns:minmax(0,1fr) auto;gap:4px 8px}
  .tl-thread>*:first-child{grid-column:1/-1}
  .tl-filters>.tl-in,.tl-filters>.tl-search{flex:1 1 calc(50% - 8px);min-width:0}
  .tl-filters>.tl-search{flex-basis:100%}
  .tl-btn,.tl-chip{min-height:40px}
  .tl-fun>div{grid-template-columns:minmax(0,130px) 1fr 40px}
  .tl-defs{grid-template-columns:minmax(0,1fr)}
  .tl-defs dt{margin-top:6px}
}`

const Pill = ({ tone, children, title }) => <span className="tl-pill" title={title} style={{ background: SOFT[tone], color: M[tone] }}>{children}</span>
const Dot = ({ tone }) => <i className="tl-dot" style={{ background: M[tone] }} />
const UrgPill = ({ u }) => { const x = URG[u] || URG.waiting; return <Pill tone={x.tone}><Dot tone={x.tone} />{x.label}</Pill> }
const WaitPill = ({ w }) => <Pill tone={WAIT_TONE[w] || 'grey'}>{WAITING[w] || w || '—'}</Pill>

function lastActive(at) {
  if (!at) return 'never'
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (m < 2) return 'now'; if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const setupText = (r) => r.days_to_setup == null ? '' : r.days_to_setup === 0 ? 'Setup today' : r.days_to_setup > 0 ? `Setup in ${r.days_to_setup}d` : `Setup ${-r.days_to_setup}d ago`
const hrefOf = (r) => r.is_prospect ? `/explore/${r.request_id}` : `/properties/${encodeURIComponent(r.pid)}`
const shownPid = (r) => r.is_prospect ? 'Prospect' : r.pid

// "12 days · limit 3 · 9 over" — how long the step has been open and how far past its limit
function ageLine(x) {
  const parts = [x.age_days == null ? '' : x.age_days === 0 ? 'opened today' : `${plural(x.age_days, 'day')} on it`]
  if (x.limit_days != null) parts.push(`limit ${x.limit_days}d`)
  if (x.overdue_by) parts.push(`${x.overdue_by}d over`)
  return parts.filter(Boolean).join(' · ')
}

function useCounted() {
  // Properties the engine never sees, so the page can show what is left out and why.
  const [state, setState] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    supabase.from('properties')
      .select('pid, journey_paused_at, closed_at, archived_at, source, assigned_to, owner_email').is('deleted_at', null)
      .then(({ data, error }) => { if (alive) setState(error ? { error: error.message } : { rows: data || [] }) })
    return () => { alive = false }
  }, [tick])
  return [state, () => setTick(n => n + 1)]
}

export default function TeamLoad() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const home = useJourneyHome('all')
  const team = useTeam(true)
  const [counted, reloadCounted] = useCounted()
  const [at, setAt] = useState(() => new Date())

  const who = params.get('who') || ''
  const bucket = params.get('b') || ''
  const setParam = (k, v) => setParams(p => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })
  const [q, setQ] = useState('')
  const [wait, setWait] = useState('')
  const [urg, setUrg] = useState('')
  const [sort, setSort] = useState(() => { try { return localStorage.getItem('pulse.teamload.sort') || 'urgency' } catch { return 'urgency' } })
  useEffect(() => { try { localStorage.setItem('pulse.teamload.sort', sort) } catch { /* private window */ } }, [sort])
  const [open, setOpen] = useState({})
  const [allThreads, setAllThreads] = useState(false)

  const t = team.data
  const owners = useMemo(() => t?.owners || {}, [t])
  const rows = useMemo(() => liveRows(home.rows), [home.rows])
  const people = useMemo(() => t ? teamLoad(t.people, rows, owners) : [], [t, rows, owners])
  const emails = useMemo(() => new Set(people.map(p => p.email)), [people])
  const carried = useMemo(() => rows.filter(isCarried), [rows])
  // carried by nobody on the team: no owner, or an owner who isn't one of the people
  const unowned = useMemo(() => carried.filter(r => !emails.has(ownerOf(r, owners))), [carried, emails, owners])

  const reload = () => { home.reload(); team.reload(); reloadCounted(); setAt(new Date()) }

  if (team.error) {
    return (
      <Shell>
        <div className="tl-empty" style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10 }}>
          <b style={{ color: C.text, fontSize: 15 }}>{/admin/i.test(team.error) ? 'Team load is for admins' : 'Couldn’t load the team'}</b>
          <span>{/admin/i.test(team.error) ? 'Your own load is on your desk on Home.' : team.error}</span>
          <Link className="tl-btn" to="/">Back to Home</Link>
        </div>
      </Shell>
    )
  }
  if (team.loading || home.loading || !t) {
    return (
      <Shell>
        <div aria-busy="true" style={{ display: 'grid', gap: 12 }}>
          {[76, 220, 320].map(h => <div key={h} style={{ height: h, borderRadius: 10, background: C.border, opacity: 0.35 }} />)}
        </div>
      </Shell>
    )
  }

  const sum = (k) => people.reduce((s, p) => s + p[k], 0)
  const owned = sum('owned'), onThem = sum('onThem'), onOthers = sum('onOthers'), quiet = sum('quiet')
  const othersBy = (list) => ['landlord', 'vendor', 'supply'].map(w => [w, list.filter(r => r.urgency !== 'done' && r.blocked_on === w).length]).filter(([, n]) => n)
  const teamCarried = carried.filter(r => emails.has(ownerOf(r, owners)))
  const verifyAll = people.reduce((s, p) => s + (p.verify || 0), 0)
  const maxAll = Math.max(1, unowned.length, ...people.map(x => x.owned))

  return (
    <Shell>
      <header className="tl-head">
        <div style={{ flex: '1 1 420px', minWidth: 0 }}>
          <Link to="/" className="tl-crumb">‹ Home · Team</Link>
          <h1 className="tl-h1" style={{ marginTop: 6 }}>Team load</h1>
          <p className="tl-sub">Everything each person is carrying right now — the step every property and prospect is on, who that step is waiting on and how long it has sat there — and, further down, exactly how each number on Home’s Team load card is worked out.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.muted }}>as of {at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
          <button type="button" className="tl-btn" onClick={reload}>Refresh</button>
        </div>
      </header>

      <div className="tl-strip">
        <Tile k="Carried" v={owned} h={`${teamCarried.filter(r => !r.is_prospect).length} properties · ${teamCarried.filter(r => r.is_prospect).length} prospects`} />
        <Tile k="On the team" v={onThem} tone={onThem ? M.red : null} h={owned ? `${Math.round(100 * onThem / owned)}% of the load` : 'nothing carried'} go={() => setParam('b', 'them')} />
        <Tile k="Others due or late" v={onOthers} tone={onOthers ? M.amber : null} h={othersBy(teamCarried.filter(r => bucketOf(r) === 'others')).map(([w, n]) => `${n} ${WAITING[w].toLowerCase()}`).join(' · ') || `nobody to chase · ${quiet} quiet`} go={() => setParam('b', 'others')} />
        <Tile k="Overdue" v={sum('overdue')} tone={sum('overdue') ? M.red : null} h={people.filter(p => p.overdue).map(p => `${p.overdue} ${firstName(p.email)}`).join(' · ') || 'none'} go={() => setUrg('overdue')} />
        <Tile k="To verify" v={verifyAll} tone={verifyAll ? M.amber : null} h="vendor-closed items" />
        <Tile k="Unowned" v={unowned.length} tone={unowned.length ? M.amber : null} h="carried by nobody" go={() => setParam('who', NOBODY)} />
      </div>

      <section className="tl-sec">
        <div className="tl-sech"><h2>Who is carrying what</h2><span>tap a person to see their list below · bar length is relative to the biggest load</span></div>
        {people.length === 0 ? <div className="tl-panel"><div className="tl-empty">Nobody on the team owns a live property yet.</div></div> : (
          <div className="tl-people">
            {people.map(p => <PersonCard key={p.email} p={p} max={maxAll} on={who === p.email}
              onPick={() => { setParam('who', who === p.email ? '' : p.email); document.getElementById('tl-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />)}
            {unowned.length > 0 && <PersonCard p={{ email: NOBODY, rows: unowned, owned: unowned.length, onThem: unowned.filter(r => bucketOf(r) === 'them').length, onOthers: unowned.filter(r => bucketOf(r) === 'others').length, quiet: unowned.filter(r => bucketOf(r) === 'quiet').length, overdue: unowned.filter(r => r.urgency === 'overdue').length, today: unowned.filter(r => r.urgency === 'today').length, setups: unowned.filter(isSetupThisWeek).length }}
              max={maxAll} on={who === NOBODY} onPick={() => { setParam('who', who === NOBODY ? '' : NOBODY); document.getElementById('tl-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} />}
          </div>
        )}
      </section>

      <ItemList id="tl-list" carried={carried} people={people} owners={owners} unownedCount={unowned.length} emails={emails}
        who={who} setWho={(v) => setParam('who', v)} bucket={bucket} setBucket={(v) => setParam('b', v)}
        q={q} setQ={setQ} wait={wait} setWait={setWait} urg={urg} setUrg={setUrg} sort={sort} setSort={setSort}
        open={open} setOpen={setOpen} navigate={navigate} />

      <StepMatrix carried={carried} people={people} owners={owners} emails={emails} allThreads={allThreads} setAllThreads={setAllThreads}
        onCell={(email, code) => { setParam('who', email); setQ(''); setWait(''); setUrg(''); setParam('b', ''); setStepFilter(code) }} />

      <HowItWorks rows={rows} carried={carried} people={people} unowned={unowned} counted={counted}
        owned={owned} onThem={onThem} onOthers={onOthers} quiet={quiet} />

      <Limits thresholds={home.thresholds || {}} carried={carried} />

      <Caveats rows={rows} carried={carried} people={people} owners={owners} emails={emails} counted={counted} />
    </Shell>
  )

  // A step cell in the matrix narrows the list to that person and step via the search box.
  function setStepFilter(code) {
    setQ(`step:${code}`)
    document.getElementById('tl-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100svh', background: C.bg, color: C.text, fontFamily: F }}>
      <AppHeader />
      <style>{CSS}</style>
      <main className="tl">{children}</main>
    </div>
  )
}

function Tile({ k, v, h, tone, go }) {
  const body = <>
    <span className="tl-tk">{k}</span>
    <span className="tl-tv" style={{ color: v && tone ? tone : C.text }}>{v}</span>
    <span className="tl-th" title={h}>{h}</span>
  </>
  return go ? <button type="button" className="tl-tile" onClick={go}>{body}</button> : <div className="tl-tile">{body}</div>
}

function PersonCard({ p, max, on, onPick }) {
  const nobody = p.email === NOBODY
  const steps = useMemo(() => {
    const m = new Map()
    for (const r of p.rows) {
      const k = r.stage_code
      if (!m.has(k)) m.set(k, { name: stepName(k, r.stage_label), n: 0, od: 0, w: r.blocked_on })
      const s = m.get(k); s.n++; if (r.urgency === 'overdue') s.od++
    }
    return [...m.values()].sort((a, b) => b.od - a.od || b.n - a.n)
  }, [p.rows])
  // setup-ops threads the bar can't see: open on the team, but behind a headline that waits on someone else
  const hidden = p.rows.filter(r => bucketOf(r) !== 'them').reduce((s, r) => s + (r.open_threads || []).filter(th => th.urgency !== 'done' && th.waiting_on === 'setup_ops').length, 0)
  const seg = [[p.onThem, 'red', 'on them'], [p.onOthers, 'amber', 'on others'], [p.quiet, 'green', 'quiet']]
  return (
    <button type="button" className="tl-person" aria-pressed={on} onClick={onPick}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="tl-av" style={nobody ? { color: M.amber } : undefined}>{nobody ? '?' : firstName(p.email)[0]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{nobody ? 'Unowned' : firstName(p.email)}</div>
          <div style={{ fontSize: 11.5, color: C.muted }}>{nobody ? 'no owner, or an owner outside the team' : `last active ${lastActive(p.last_active)}`}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{p.owned}</div>
          <div style={{ fontSize: 11, color: C.muted }}>carrying</div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ width: `${p.owned ? Math.max(8, Math.round(100 * p.owned / max)) : 100}%`, opacity: p.owned ? 1 : 0.4 }}>
          <div className="tl-bar" title={seg.map(([v, , l]) => `${v} ${l}`).join(' · ')}>
            {seg.map(([v, tone], i) => <i key={i} style={{ width: `${p.owned ? 100 * v / p.owned : 0}%`, background: M[tone] }} />)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: C.dim }}>
          {seg.map(([v, tone, l]) => <span key={l} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Dot tone={tone} /><b style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>{v}</b> {l}</span>)}
        </div>
      </div>
      <div className="tl-mini">
        <div><b style={{ color: p.overdue ? M.red : undefined }}>{p.overdue}</b><span>overdue</span></div>
        <div><b>{p.today}</b><span>due today</span></div>
        <div><b>{p.setups}</b><span>setups wk</span></div>
        <div title={p.verify_oldest ? `oldest closed ${lastActive(p.verify_oldest)}` : ''}><b style={{ color: p.verify ? M.amber : undefined }}>{nobody ? '—' : p.verify || 0}</b><span>to verify</span></div>
      </div>
      <div className="tl-doing">
        <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>Doing now</div>
        {steps.length === 0 && <div style={{ color: C.muted }}>Nothing carried.</div>}
        {steps.slice(0, 5).map(s => (
          <div key={s.name}>
            <Dot tone={s.od ? 'red' : WAIT_TONE[s.w] || 'grey'} />
            <span className="lbl">{s.name}</span>
            <span className="tl-num" style={{ fontWeight: 700 }}>{s.n}</span>
            {s.od > 0 && <Pill tone="red">{s.od} late</Pill>}
          </div>
        ))}
        {steps.length > 5 && <div style={{ color: C.muted }}>+ {plural(steps.length - 5, 'more step')}</div>}
      </div>
      {hidden > 0 && <div style={{ fontSize: 11.5, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        + {plural(hidden, 'more thing')} on them behind a step that waits on someone else — not in the bar
      </div>}
    </button>
  )
}

function ItemList({ id, carried, people, owners, unownedCount, emails, who, setWho, bucket, setBucket, q, setQ, wait, setWait, urg, setUrg, sort, setSort, open, setOpen, navigate }) {
  const base = useMemo(() => who === NOBODY ? carried.filter(r => !emails.has(ownerOf(r, owners))) : who ? carried.filter(r => ownerOf(r, owners) === who) : carried, [carried, who, owners, emails])
  const shown = useMemo(() => {
    const step = q.startsWith('step:') ? q.slice(5) : null
    const needle = step ? '' : q.trim().toLowerCase()
    const list = base.filter(r =>
      (!bucket || bucketOf(r) === bucket) && (!wait || r.blocked_on === wait) && (!urg || r.urgency === urg) &&
      (!step || r.stage_code === step) &&
      (!needle || [r.pid, r.property_name, r.stage_label, r.next_action_label, ownerOf(r, owners)].some(v => (v || '').toLowerCase().includes(needle))))
    const by = {
      urgency: (a, b) => (URG[a.urgency]?.rank ?? 9) - (URG[b.urgency]?.rank ?? 9) || (b.open_threads?.[0]?.overdue_by || 0) - (a.open_threads?.[0]?.overdue_by || 0) || (b.age_days || 0) - (a.age_days || 0),
      age: (a, b) => (b.age_days || 0) - (a.age_days || 0),
      setup: (a, b) => (a.days_to_setup ?? 9999) - (b.days_to_setup ?? 9999),
      pid: (a, b) => String(a.pid).localeCompare(String(b.pid), undefined, { numeric: true }),
    }[sort]
    return [...list].sort(by)
  }, [base, bucket, wait, urg, q, sort, owners])
  const filtered = bucket || wait || urg || q
  const clear = () => { setBucket(''); setWait(''); setUrg(''); setQ('') }

  const exportCsv = () => {
    const head = ['PID', 'Name', 'Owner', 'Bucket', 'Urgency', 'Step', 'Waiting on', 'Days on step', 'Limit (days)', 'Days over', 'Setup date', 'Next action', 'Open threads']
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines = shown.map(r => {
      const h = r.open_threads?.[0] || {}
      return [shownPid(r), clean(r.property_name, r.pid), firstName(ownerOf(r, owners)), BUCKET[bucketOf(r)]?.label || '', r.urgency, r.stage_label, WAITING[r.blocked_on] || r.blocked_on,
        r.age_days, h.limit_days, h.overdue_by, r.setup_date, r.next_action_label, (r.open_threads || []).filter(x => x.urgency !== 'done').length].map(esc).join(',')
    })
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `team-load-${who && who !== NOBODY ? firstName(who).toLowerCase() : who ? 'unowned' : 'all'}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <section className="tl-sec" id={id} style={{ scrollMarginTop: 72 }}>
      <div className="tl-sech"><h2>Everything being carried</h2><span>one row per property or prospect, judged on its headline step · open a row for every step still open on it</span></div>
      <div className="tl-panel">
        <div className="tl-filters">
          <div className="tl-chips" role="group" aria-label="Person">
            <button type="button" className="tl-chip" aria-pressed={!who} onClick={() => setWho('')}>Everyone · {carried.length}</button>
            {people.map(p => <button key={p.email} type="button" className="tl-chip" aria-pressed={who === p.email} onClick={() => setWho(p.email)}>{firstName(p.email)} · {p.owned}</button>)}
            {unownedCount > 0 && <button type="button" className="tl-chip" aria-pressed={who === NOBODY} onClick={() => setWho(NOBODY)}>Unowned · {unownedCount}</button>}
          </div>
        </div>
        <div className="tl-filters">
          <div className="tl-chips" role="group" aria-label="Bucket">
            {[['', 'All'], ['them', 'On them'], ['others', 'On others'], ['quiet', 'Quiet']].map(([k, l]) => {
              const n = k ? base.filter(r => bucketOf(r) === k).length : base.length
              return <button key={k || 'all'} type="button" className="tl-chip" aria-pressed={bucket === k} onClick={() => setBucket(k)}>
                {k && <Dot tone={BUCKET[k].tone} />} {l} · {n}
              </button>
            })}
          </div>
          <input className="tl-in tl-search" type="search" placeholder="Search PID, name, step, action…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
          <select className="tl-in" value={wait} onChange={e => setWait(e.target.value)} aria-label="Waiting on">
            <option value="">Waiting on: anyone</option>
            {['setup_ops', 'landlord', 'vendor', 'supply'].map(w => <option key={w} value={w}>{WAITING[w]}</option>)}
          </select>
          <select className="tl-in" value={urg} onChange={e => setUrg(e.target.value)} aria-label="Urgency">
            <option value="">Any urgency</option>
            {Object.entries(URG).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
          </select>
          <select className="tl-in" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button type="button" className="tl-btn" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
        </div>
        <div className="tl-count">
          <span>Showing <b style={{ color: C.text }}>{shown.length}</b> of {base.length}{who ? ` · ${who === NOBODY ? 'unowned' : firstName(who)}` : ''}</span>
          {q.startsWith('step:') && <span>step: <b style={{ color: C.text }}>{stepName(q.slice(5))}</b></span>}
          {filtered && <button type="button" className="tl-more" onClick={clear}>Clear filters</button>}
        </div>
        {shown.length === 0 ? (
          <div className="tl-empty">
            {base.length === 0 ? (who ? 'Nothing carried here right now.' : 'Nobody is carrying anything right now.') : 'Nothing matches these filters.'}
            {filtered && <button type="button" className="tl-btn" onClick={clear}>Clear filters</button>}
          </div>
        ) : (
          <div role="table" aria-label="Carried items">
            <div className="tl-row hd" role="row">
              <span>Urgency</span><span>Property</span><span>Headline step</span><span>Waiting on</span><span>Time on step</span><span className="c-setup">Setup</span><span className="c-owner">Owner</span><span />
            </div>
            {shown.map(r => {
              const key = r.pid
              const threads = (r.open_threads || []).filter(x => x.urgency !== 'done')
              const h = threads[0] || {}
              const more = threads.length - 1
              return (
                <div key={key} className="tl-row" role="row">
                  <span className="c-urg"><UrgPill u={r.urgency} /></span>
                  <span className="c-prop" style={{ minWidth: 0 }}>
                    <Link to={hrefOf(r)} className="tl-pid">{shownPid(r)}</Link>
                    <div className="tl-nm" title={r.property_name}>{clean(r.property_name, r.pid)}</div>
                  </span>
                  <span className="c-step tl-step">
                    <b>{r.stage_label}</b>
                    {h.note && <div className="tl-note">{h.note}</div>}
                    {more > 0 && <button type="button" className="tl-more" aria-expanded={!!open[key]} onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))}>
                      {open[key] ? '▾' : '▸'} {plural(more, 'more open step')}
                    </button>}
                  </span>
                  <span className="c-wait"><WaitPill w={r.blocked_on} /></span>
                  <span className="c-age tl-num" style={{ fontSize: 12, color: h.overdue_by ? M.red : C.dim }}>{ageLine({ age_days: r.age_days, limit_days: h.limit_days, overdue_by: h.overdue_by }) || since(r.since, r.age_days)}</span>
                  <span className="c-setup tl-num" style={{ fontSize: 12, color: C.dim }}>{setupText(r)}</span>
                  <span className="c-owner" style={{ fontSize: 12, color: emails.has(ownerOf(r, owners)) ? C.dim : M.amber }}>{ownerOf(r, owners) ? firstName(ownerOf(r, owners)) : 'nobody'}</span>
                  <span className="c-act" style={{ justifySelf: 'end' }}>{r.next_action_route
                    ? <button type="button" className="tl-btn" onClick={() => navigate(r.next_action_route)}>{r.next_action_label || 'Open'} ›</button>
                    : <Link className="tl-btn" to={hrefOf(r)}>Open ›</Link>}</span>
                  {open[key] && (
                    <div className="tl-threads">
                      <div style={{ fontSize: 11.5, color: C.muted }}>Every step still open on {shownPid(r)} — the first is the headline the bar counts</div>
                      {threads.map((x, i) => (
                        <div key={i} className="tl-thread">
                          <span><UrgPill u={x.urgency} /></span>
                          <span style={{ minWidth: 0 }}>{i === 0 && <b style={{ color: C.accent, fontSize: 11, marginRight: 6 }}>HEADLINE</b>}{x.label}{x.note && <div className="tl-note">{x.note}</div>}</span>
                          <span><WaitPill w={x.waiting_on} /></span>
                          <span className="tl-num" style={{ fontSize: 12, color: x.overdue_by ? M.red : C.dim }}>{ageLine(x)}</span>
                          <span>{x.next_action_route && <button type="button" className="tl-more" onClick={() => navigate(x.next_action_route)}>{x.next_action_label || 'Open'} ›</button>}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function StepMatrix({ carried, people, owners, emails, allThreads, setAllThreads, onCell }) {
  const cols = useMemo(() => [...people.map(p => [p.email, firstName(p.email)]), [NOBODY, 'Unowned']], [people])
  const { phases, totals } = useMemo(() => {
    const m = new Map()
    for (const r of carried) {
      const o = emails.has(ownerOf(r, owners)) ? ownerOf(r, owners) : NOBODY
      const items = allThreads ? (r.open_threads || []).filter(x => x.urgency !== 'done').map(x => ({ code: x.code, label: x.label, urgency: x.urgency, w: x.waiting_on })) : [{ code: r.stage_code, label: r.stage_label, urgency: r.urgency, w: r.blocked_on }]
      for (const x of items) {
        if (!m.has(x.code)) m.set(x.code, { code: x.code, name: stepName(x.code, x.label), w: x.w, cells: {}, n: 0 })
        const s = m.get(x.code); s.n++
        const c = (s.cells[o] ||= { n: 0, od: 0 }); c.n++; if (x.urgency === 'overdue') c.od++
      }
    }
    const meta = Object.fromEntries(STEPS.map(s => [s.code, s]))
    const list = [...m.values()].sort((a, b) => (STEP_ORDER[a.code] ?? 999) - (STEP_ORDER[b.code] ?? 999))
    const ph = []
    for (const s of list) {
      const name = meta[s.code]?.phase || (s.code.startsWith('explore') ? 'Explore' : 'Other')
      if (!ph.length || ph[ph.length - 1].name !== name) ph.push({ name, steps: [] })
      ph[ph.length - 1].steps.push(s)
    }
    const tot = {}; for (const s of list) for (const [k, c] of Object.entries(s.cells)) tot[k] = (tot[k] || 0) + c.n
    return { phases: ph, totals: tot }
  }, [carried, owners, emails, allThreads])
  const shownCols = cols.filter(([k]) => k !== NOBODY || totals[NOBODY])
  return (
    <section className="tl-sec">
      <div className="tl-sech">
        <h2>What the team is doing, step by step</h2>
        <span>journey order, Explore → Close · red = some are overdue · tap a number to list them</span>
        <span role="group" aria-label="Count" style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
          <button type="button" className="tl-chip" aria-pressed={!allThreads} onClick={() => setAllThreads(false)}>Headline step</button>
          <button type="button" className="tl-chip" aria-pressed={allThreads} onClick={() => setAllThreads(true)}>Every open step</button>
        </span>
      </div>
      <div className="tl-panel tl-scroll">
        {phases.length === 0 ? <div className="tl-empty">Nothing in flight.</div> : (
          <table className="tl-mx">
            <thead><tr><th>Step</th><th style={{ textAlign: 'left' }}>Waits on</th>{shownCols.map(([k, l]) => <th key={k}>{l}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {phases.map(ph => (
                <Fragment key={ph.name}>
                  <tr className="ph"><td colSpan={shownCols.length + 3}>{ph.name}</td></tr>
                  {ph.steps.map(s => (
                    <tr key={s.code}>
                      <td style={{ whiteSpace: 'normal', minWidth: 190 }}>{s.name}</td>
                      <td style={{ textAlign: 'left' }}><span style={{ fontSize: 12, color: C.dim }}>{WAITING[s.w] || '—'}</span></td>
                      {shownCols.map(([k]) => {
                        const c = s.cells[k]
                        return <td key={k}>{c ? (
                          <button type="button" onClick={() => onCell(k, s.code)} className="tl-cell" title={`${c.n} at this step${c.od ? `, ${c.od} overdue` : ''}`}
                            style={{ border: 0, cursor: 'pointer', fontFamily: F, fontSize: 13, fontWeight: 600, background: c.od ? SOFT.red : SOFT.grey, color: c.od ? M.red : C.text }}>{c.n}</button>
                        ) : <span style={{ color: C.muted }}>·</span>}</td>
                      })}
                      <td style={{ fontWeight: 700 }}>{s.n}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr><td style={{ fontWeight: 700 }}>Total</td><td />{shownCols.map(([k]) => <td key={k} style={{ fontWeight: 700 }}>{totals[k] || 0}</td>)}<td style={{ fontWeight: 700 }}>{Object.values(totals).reduce((a, b) => a + b, 0)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function HowItWorks({ rows, carried, people, unowned, counted, owned, onThem, onOthers, quiet }) {
  const props = counted?.rows || []
  const inPulse = props.filter(p => p.source !== 'payments_backfill')
  const paused = inPulse.filter(p => p.journey_paused_at)
  const test = inPulse.filter(p => !p.journey_paused_at && /^test/i.test(p.pid))
  const done = inPulse.filter(p => !p.journey_paused_at && !/^test/i.test(p.pid) && (p.closed_at || p.archived_at))
  const liveProps = rows.filter(r => !r.is_prospect).length
  const prospects = rows.filter(r => r.is_prospect)
  const notTaken = prospects.filter(r => r.stage_code === 'explore_not_taken').length
  const multi = carried.filter(r => (r.open_threads || []).filter(x => x.urgency !== 'done').length > 1).length
  const hiddenOnThem = carried.filter(r => bucketOf(r) !== 'them' && (r.open_threads || []).some(x => x.urgency !== 'done' && x.waiting_on === 'setup_ops')).length
  const max = Math.max(1, ...people.map(p => p.owned))
  const busiest = people.find(p => p.owned === max)
  const fun = counted?.rows ? [
    ['Properties in Pulse', inPulse.length, C.dim],
    ['− paused (clean slate)', paused.length, M.grey],
    ['− test PIDs', test.length, M.grey],
    ['− closed or archived', done.length, M.grey],
    ['= live properties', liveProps, M.green],
    ['+ open prospects from Stage', prospects.length - notTaken, M.blue],
    ['− carried by nobody on the team', unowned.length, M.amber],
    ['= on someone’s bar', owned, C.accent],
  ] : []
  const fmax = Math.max(1, ...fun.map(f => f[1]))
  return (
    <section className="tl-sec">
      <div className="tl-sech"><h2>How load is worked out</h2><span>the rules behind every number on the card, with today’s figures</span></div>
      <div className="tl-how">
        <div className="tl-card" style={{ gridColumn: '1 / -1' }}>
          <h3><i>1</i>What gets counted</h3>
          <p>Load is built from the journey engine — the same rows that fill everyone’s queue — so the card and the queue can never disagree. A property only counts while it is <b>being worked</b>: not paused, not closed, not archived, not deleted, and not a test PID. Exploratory requests from Stage count too, as <b>prospects</b>, until they become a PID; a prospect supply turned down (“not taken”) is history and drops out.</p>
          {counted?.error && <p style={{ color: M.amber }}>Couldn’t read the property list for the breakdown below — {counted.error}</p>}
          {fun.length > 0 && <div className="tl-fun">
            {fun.map(([k, v, col]) => (
              <div key={k}>
                <span style={{ color: k.startsWith('=') ? C.text : C.dim, fontWeight: k.startsWith('=') ? 600 : 400 }}>{k}</span>
                <span className="track"><i style={{ width: `${Math.round(100 * v / fmax)}%`, background: col }} /></span>
                <span className="tl-num" style={{ textAlign: 'right', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>}
        </div>

        <div className="tl-card">
          <h3><i>2</i>Whose it is</h3>
          <ul>
            <li><b>A property</b> belongs to the person in its <span className="tl-code">assigned_to</span>; if that’s empty, to its <span className="tl-code">owner_email</span> (who created it).</li>
            <li><b>A prospect</b> belongs to whoever is assigned the visit in Pulse; else the inspector Stage named; else — for visits nobody is on yet, and requests gone stale in Stage — to the <b>first admin</b>, so they land on someone.</li>
            <li><b>The team</b> is everyone with a <span className="tl-code">@flent.in</span> address who owns any property in Pulse — paused ones included, which is why someone can show with 0.</li>
            <li>Anything with no owner, or an owner outside the team, is <b>Unowned</b> — today that is <b>{unowned.length}</b>.</li>
          </ul>
        </div>

        <div className="tl-card">
          <h3><i>3</i>One headline step per property</h3>
          <p>A property can have several steps open at once (today <b>{multi}</b> do). Load judges each property on <b>one</b> — its headline — picked in this order:</p>
          <ol>
            <li>most urgent first: overdue → today → soon → waiting</li>
            <li>then a step the team can act on (waits on setup ops)</li>
            <li>then the earliest step in the journey</li>
            <li>then the one open longest</li>
          </ol>
          <p>So a property counts once, never twice. The cost: <b>{hiddenOnThem}</b> {hiddenOnThem === 1 ? 'property has' : 'properties have'} a setup-ops step open behind a headline that waits on someone else — open a row above to see every step.</p>
        </div>

        <div className="tl-card">
          <h3><i>4</i>The bar</h3>
          <dl className="tl-defs">
            {Object.entries(BUCKET).map(([k, b]) => (
              <Fragment key={k}><dt><Dot tone={b.tone} /> {b.label}</dt><dd>{
                k === 'them' ? <>headline step waits on <b>setup ops</b> — the next move is ours, whatever its urgency. Team total <b>{onThem}</b>.</>
                : k === 'others' ? <>headline step waits on a <b>landlord</b>, <b>vendor</b> or <b>supply</b>, and is <b>overdue, due today or soon</b> — worth a chase. Team total <b>{onOthers}</b>.</>
                : <>headline step waits on someone else and is <b>still inside its limit</b> (or has none, like vendors working or supply closing a deal) — nobody needs to act yet. Team total <b>{quiet}</b>.</>
              }</dd></Fragment>
            ))}
            <dt>Length</dt><dd>On Home each bar is scaled to the busiest person{busiest ? ` (${firstName(busiest.email)}, ${max})` : ''}, who gets the full 140px; nobody drops below 24px, so a light load still shows.</dd>
          </dl>
        </div>

        <div className="tl-card">
          <h3><i>5</i>Urgency</h3>
          <dl className="tl-defs">
            <dt><Dot tone="red" /> Overdue</dt><dd>open longer than its step’s limit (see the table below), or — for planning steps — the setup date is inside the lead time. A visit is overdue once its date passes.</dd>
            <dt><Dot tone="amber" /> Today</dt><dd>the team can act on it now and it is still inside its limit; also setup day itself, and a visit booked for today.</dd>
            <dt><Dot tone="blue" /> Soon</dt><dd>planning steps with the setup date close but not yet inside the lead time; setup a couple of days out; a visit tomorrow.</dd>
            <dt><Dot tone="grey" /> Waiting</dt><dd>someone else has the next move and is still inside the limit, or the step has no limit (vendors working, supply closing a deal).</dd>
          </dl>
        </div>

        <div className="tl-card" style={{ gridColumn: '1 / -1' }}>
          <h3><i>6</i>The other columns on the card</h3>
          <dl className="tl-defs">
            <dt>Owns</dt><dd>properties + prospects carried (everything above, per person).</dd>
            <dt>Overdue · Due today</dt><dd>how many of those have an overdue / today headline. Only the headline — a property with a late step behind a later-due headline isn’t counted.</dd>
            <dt>Setups wk</dt><dd>carried properties whose setup date is today or in the next 6 days.</dd>
            <dt>To verify</dt><dd>work-order items a vendor has marked closed, not yet verified, on that person’s active properties. The grey age is the oldest one. Counted from items, not from properties — one property can hold many.</dd>
            <dt>Last active</dt><dd>the latest of: signing in, opening Home, moving a property’s journey, starting an inspection, logging a payment.</dd>
            <dt>Their desk ›</dt><dd>opens Home as that person sees it — their queue, not yours.</dd>
          </dl>
        </div>
      </div>
    </section>
  )
}

function Limits({ thresholds, carried }) {
  const live = useMemo(() => {
    const m = {}
    for (const r of carried) for (const x of (r.open_threads || [])) if (x.urgency !== 'done') {
      const c = (m[x.code] ||= { n: 0, od: 0 }); c.n++; if (x.urgency === 'overdue') c.od++
    }
    return m
  }, [carried])
  const [phase, setPhase] = useState('')
  const [onlyLive, setOnlyLive] = useState(false)
  const phases = [...new Set(STEPS.map(s => s.phase))]
  const list = STEPS.filter(s => (!phase || s.phase === phase) && (!onlyLive || live[s.code]))
  const limitText = (s) => {
    const parts = []
    if (s.lead) parts.push(`done ${thresholds[s.lead] ?? '?'}d before setup`)
    if (s.limit) parts.push(`${thresholds[s.limit] ?? '?'}d${s.lead ? ' when no setup date' : ''}`)
    if (s.fixed != null) parts.push(s.fixed === 0 ? 'overdue at once' : `${s.fixed}d`)
    if (s.rule) parts.push(s.rule)
    return parts.join(' · ')
  }
  return (
    <section className="tl-sec">
      <div className="tl-sech"><h2>The limit each step is held to</h2><span>days a step may sit before it turns overdue · live from journey_thresholds()</span></div>
      <div className="tl-panel">
        <div className="tl-filters">
          <div className="tl-chips" role="group" aria-label="Phase">
            <button type="button" className="tl-chip" aria-pressed={!phase} onClick={() => setPhase('')}>All</button>
            {phases.map(p => <button key={p} type="button" className="tl-chip" aria-pressed={phase === p} onClick={() => setPhase(p)}>{p}</button>)}
          </div>
          <label style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: C.dim }}>
            <input type="checkbox" checked={onlyLive} onChange={e => setOnlyLive(e.target.checked)} /> Only steps open right now
          </label>
        </div>
        <div className="tl-scroll">
          <table className="tl-lim">
            <thead><tr><th>Phase</th><th>Step</th><th>Waits on</th><th>Limit</th><th style={{ textAlign: 'right' }}>Open now</th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={5} style={{ color: C.muted, textAlign: 'center', padding: 20 }}>No steps open in this phase.</td></tr>}
              {list.map(s => {
                const l = live[s.code]
                return (
                  <tr key={s.code}>
                    <td style={{ color: C.muted, fontSize: 12 }}>{s.phase}</td>
                    <td style={{ minWidth: 200 }}>{s.name}</td>
                    <td><WaitPill w={s.wait} /></td>
                    <td style={{ color: C.dim, fontSize: 12.5, minWidth: 180 }}>{limitText(s)}</td>
                    <td className="tl-num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{l ? <><b>{l.n}</b>{l.od > 0 && <span style={{ color: M.red, fontSize: 12 }}> · {l.od} late</span>}</> : <span style={{ color: C.muted }}>·</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Caveats({ rows, carried, people, owners, emails, counted }) {
  const unset = carried.filter(r => emails.has(ownerOf(r, owners)) && bucketOf(r) === 'unset').length
  // the engine also falls back to the first inspector for an owner; Home's owners map doesn't
  const inspectorOnly = rows.filter(r => !r.is_prospect && !owners[r.pid] && r.owner_email).length
  const paused = (counted?.rows || []).filter(p => p.journey_paused_at && !/^test/i.test(p.pid) && p.source !== 'payments_backfill').length
  const adminHeld = carried.filter(r => r.is_prospect && ['explore_assign', 'explore_stale'].includes(r.stage_code)).length
  const items = [
    { tone: 'grey', show: paused > 0, body: <><b>{paused} paused {paused === 1 ? 'property counts' : 'properties count'} nowhere.</b> The clean slate paused older work so it raises no tasks; it isn’t on anyone’s bar until it’s resumed.</> },
    { tone: 'grey', show: adminHeld > 0, body: <><b>{adminHeld} {adminHeld === 1 ? 'prospect sits' : 'prospects sit'} on the admin by default</b> — visits nobody has been assigned, or requests gone stale in Stage. They inflate the admin’s bar until someone is put on them.</> },
    { tone: 'amber', show: inspectorOnly > 0, body: <><b>{inspectorOnly} {inspectorOnly === 1 ? 'property is' : 'properties are'} Unowned here but on someone’s queue.</b> The engine falls back to whoever did the first inspection; the card only reads <span className="tl-code">assigned_to</span> / <span className="tl-code">owner_email</span>. Assign them on the property page to settle it.</> },
    { tone: 'red', show: unset > 0, body: <><b>{unset} carried {unset === 1 ? 'item has' : 'items have'} no “waiting on”</b>, so {unset === 1 ? 'it’s' : 'they’re'} in Owns but in no bar segment.</> },
    { tone: 'grey', show: true, body: <><b>Speed, money and vendor numbers on Home are separate.</b> They come from home_team() over 30–120 day windows; load is a snapshot of right now. People: {people.map(p => firstName(p.email)).join(', ') || 'none'}.</> },
  ].filter(x => x.show)
  return (
    <section className="tl-sec">
      <div className="tl-sech"><h2>Read with care</h2><span>where the numbers can mislead</span></div>
      <div className="tl-warn">
        {items.map((x, i) => <div key={i} className="tl-warnrow"><i style={{ background: M[x.tone] }} /><div>{x.body}</div></div>)}
      </div>
    </section>
  )
}
