import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { supabase } from '../lib/supabase'
import { useJourneyHome } from '../components/home/JourneyPanels'
import { useTeam } from '../components/home/TeamView'
import { clean } from '../components/home/MyDesk'
import RecordStatus from '../components/property/RecordStatus'
import RecordTimeline from '../components/property/RecordTimeline'
import MilestoneStrip from '../components/property/MilestoneStrip'
import LandlordPanel from '../components/property/LandlordPanel'
import ChangeOwnerModal from '../components/property/ChangeOwnerModal'
import { isCosted, sentAmount } from '../utils/estimateHelpers'
import { liveRows, ownerOf, isCarried, bucketOf, teamLoad, firstName, WAITING } from '../utils/teamLoad'

// Team load, worked from. Home's card says who is carrying how much; this
// page is where you act on it: pick a person, see everything they carry
// sorted by what it needs, open any property and get its whole case — where
// it stands, every open step with the button that does it, the milestones to
// mark, the estimate / work orders / invoice at a glance, and everything that
// has happened to it. Same rows, owners and rules as the card
// (utils/teamLoad.js), and the property page's own components, so an action
// here is the same action there.

const F = "var(--font-nav, 'Urbanist', 'Poppins', sans-serif)"
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)', accent: 'var(--accent, #c8963e)',
}
const M = { red: '#b0645b', amber: '#a8895a', green: '#6f9a7e', blue: '#6f86a8', grey: '#7a7c90' }
const URG = {
  overdue: { label: 'Overdue', tone: 'red', rank: 0 }, today: { label: 'Today', tone: 'amber', rank: 1 },
  soon: { label: 'Soon', tone: 'blue', rank: 2 }, waiting: { label: 'Waiting', tone: 'grey', rank: 3 }, done: { label: 'Done', tone: 'green', rank: 4 },
}
// The three groups, named for what you do about them.
const GROUPS = [
  { key: 'them', title: 'Needs us', sub: 'the next move is the team’s', tone: 'red' },
  { key: 'others', title: 'Chase', sub: 'someone else has it, and it’s due or late', tone: 'amber' },
  { key: 'quiet', title: 'Quiet', sub: 'someone else has it, still on time', tone: 'green' },
]
const NOBODY = '__unowned'
const byUrgency = (a, b) => (URG[a.urgency]?.rank ?? 9) - (URG[b.urgency]?.rank ?? 9)
  || (b.open_threads?.[0]?.overdue_by || 0) - (a.open_threads?.[0]?.overdue_by || 0) || (b.age_days || 0) - (a.age_days || 0)

const CSS = `
.tl{max-width:1440px;margin:0 auto;padding:14px 20px 48px;display:grid;gap:14px}
.tl a{color:inherit}
.tl-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px}
.tl-h1{margin:0;font-size:22px;font-weight:600}
.tl-crumb{font-size:12px;color:${C.muted};text-decoration:none;font-weight:600}
.tl-crumb:hover{color:${C.accent}}
.tl-btn{min-height:34px;padding:0 12px;border-radius:8px;border:1px solid ${C.border};background:${C.input};color:${C.dim};font-family:${F};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
.tl-btn:hover{color:${C.text}}
.tl-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px}
.tl-tile{background:${C.panel};border:1px solid ${C.border};border-radius:10px;padding:10px 12px;display:grid;gap:3px;min-width:0;text-align:left;color:${C.text};font-family:${F}}
button.tl-tile{cursor:pointer}
button.tl-tile:hover{border-color:${C.accent}}
.tl-tk{font-size:11.5px;color:${C.muted};font-weight:600}
.tl-tv{font-size:22px;font-weight:600;line-height:1.05;font-variant-numeric:tabular-nums}
.tl-th{font-size:11.5px;color:${C.dim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl-people{display:flex;gap:6px;flex-wrap:wrap}
.tl-person{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 12px;border-radius:999px;border:1px solid ${C.border};background:${C.panel};color:${C.dim};font-family:${F};font-size:13px;font-weight:600;cursor:pointer}
.tl-person[aria-pressed=true]{border-color:${C.accent};color:${C.text};background:rgba(200,150,62,0.10)}
.tl-person .n{font-variant-numeric:tabular-nums;color:${C.text}}
.tl-mini{display:inline-flex;height:6px;border-radius:3px;overflow:hidden;background:${C.input}}
.tl-mini i{display:block;height:100%}
.tl-main{display:grid;grid-template-columns:minmax(320px,400px) minmax(0,1fr);gap:14px;align-items:start}
.tl-list{background:${C.panel};border:1px solid ${C.border};border-radius:12px;min-width:0;overflow:hidden}
.tl-tools{display:flex;gap:6px;padding:10px;border-bottom:1px solid ${C.border};flex-wrap:wrap}
.tl-in{min-height:34px;padding:0 10px;border-radius:8px;border:1px solid ${C.border};background:${C.input};color:${C.text};font-family:${F};font-size:13px;flex:1;min-width:140px}
.tl-chip{min-height:30px;padding:0 10px;border-radius:999px;border:1px solid ${C.border};background:transparent;color:${C.dim};font-family:${F};font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}
.tl-chip[aria-pressed=true]{background:rgba(200,150,62,0.12);border-color:${C.accent};color:${C.accent}}
.tl-gh{display:flex;align-items:center;gap:8px;padding:12px 12px 6px;font-size:12px;font-weight:700;color:${C.text};flex-wrap:wrap}
.tl-gh span{font-weight:500;color:${C.muted};font-size:11.5px}
.tl-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:4px 10px;align-items:start;width:100%;padding:10px 12px;border:0;border-top:1px solid ${C.border};background:transparent;color:${C.text};text-align:left;font-family:${F};cursor:pointer}
.tl-row:hover{background:rgba(255,255,255,0.02)}
.tl-row[aria-current=true]{background:rgba(200,150,62,0.08);box-shadow:inset 3px 0 0 ${C.accent}}
.tl-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-top:5px;flex:none}
.tl-r1{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl-r2{font-size:12.5px;color:${C.dim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl-r3{grid-column:2/4;font-size:11.5px;color:${C.muted};display:flex;gap:8px;flex-wrap:wrap}
.tl-age{font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.tl-case{min-width:0;display:grid;gap:12px;position:sticky;top:64px;max-height:calc(100svh - 80px);overflow-y:auto;padding-bottom:8px;overscroll-behavior:contain}
.tl-card{background:${C.panel};border:1px solid ${C.border};border-radius:10px;padding:14px;min-width:0}
.tl-ey{font-size:11px;font-weight:600;color:${C.muted};text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.tl-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.tl-fact{background:${C.bg};border:1px solid ${C.border};border-radius:9px;padding:10px;display:grid;gap:3px;min-width:0;text-decoration:none;color:${C.text}}
a.tl-fact:hover{border-color:${C.accent}}
.tl-fact b{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.tl-fact span{font-size:11.5px;color:${C.muted}}
.tl-fact em{font-style:normal;font-size:11.5px;color:${C.dim};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tl-empty{padding:28px 14px;text-align:center;color:${C.muted};font-size:13px;display:grid;gap:8px;justify-items:center}
.tl-back{display:none}
details.tl-how{background:${C.panel};border:1px solid ${C.border};border-radius:10px;padding:10px 14px;font-size:13px;color:${C.dim};line-height:1.6}
details.tl-how summary{cursor:pointer;font-weight:600;color:${C.text}}
details.tl-how ul{margin:8px 0 0;padding-left:18px}
@media (max-width:1180px){.tl-strip{grid-template-columns:repeat(3,minmax(0,1fr))}.tl-facts{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:980px){
  .tl-main{grid-template-columns:minmax(0,1fr)}
  .tl-case{position:fixed;inset:0;max-height:none;z-index:60;background:${C.bg};padding:12px 16px 110px;align-content:start}
  .tl-back{display:inline-flex}
}
@media (max-width:640px){
  .tl{padding:12px 16px 40px}
  .tl-strip{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tl-person,.tl-btn{min-height:40px}
}`

const Dot = ({ tone }) => <i className="tl-dot" style={{ background: M[tone] }} />
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`
const inr = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
function lastActive(at) {
  if (!at) return 'never'
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (m < 60) return m < 2 ? 'now' : `${m}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
const keyOf = (r) => String(r.pid)
function titleOf(r) {
  const nm = clean(r.property_name, r.pid)
  if (r.is_prospect) return nm || 'Prospect'
  return nm && nm !== String(r.pid) ? `${r.pid} · ${nm}` : String(r.pid)
}
function ageText(r) {
  const h = r.open_threads?.[0] || {}
  const parts = [r.age_days == null ? '' : r.age_days === 0 ? 'today' : `${r.age_days}d`]
  if (h.overdue_by) parts.push(`${h.overdue_by}d over`)
  else if (h.limit_days != null) parts.push(`limit ${h.limit_days}d`)
  return parts.filter(Boolean).join(' · ')
}

export default function TeamLoad() {
  const [params, setParams] = useSearchParams()
  const home = useJourneyHome('all')
  const team = useTeam(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [owned, setOwned] = useState({})          // pid → owner just set here, until the next reload
  const [at, setAt] = useState(() => new Date())
  const [q, setQ] = useState('')
  useEffect(() => { supabase.rpc('pulse_is_admin').then(({ data }) => setIsAdmin(!!data)) }, [])

  const who = params.get('who') || ''
  const bucket = params.get('b') || ''
  const sel = params.get('pid') || ''
  const setParam = useCallback((k, v) => setParams(p => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true }), [setParams])

  const t = team.data
  const owners = useMemo(() => ({ ...(t?.owners || {}), ...owned }), [t, owned])
  const rows = useMemo(() => liveRows(home.rows), [home.rows])
  const carried = useMemo(() => rows.filter(isCarried), [rows])
  const people = useMemo(() => t ? teamLoad(t.people, rows, owners) : [], [t, rows, owners])
  const emails = useMemo(() => new Set(people.map(p => p.email)), [people])
  const unowned = useMemo(() => carried.filter(r => !emails.has(ownerOf(r, owners))), [carried, emails, owners])

  const base = useMemo(() => who === NOBODY ? unowned : who ? carried.filter(r => ownerOf(r, owners) === who) : carried, [who, unowned, carried, owners])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return base.filter(r => (!bucket || bucketOf(r) === bucket) &&
      (!n || [r.pid, r.property_name, r.stage_label, ...(r.open_threads || []).map(x => x.label)].some(v => String(v || '').toLowerCase().includes(n))))
  }, [base, bucket, q])
  const selected = useMemo(() => carried.find(r => keyOf(r) === sel) || null, [carried, sel])

  // On a wide screen, open the most urgent item so the case is never empty.
  useEffect(() => {
    if (sel || !shown.length || typeof window === 'undefined' || window.innerWidth <= 980) return
    const first = GROUPS.map(g => shown.filter(r => bucketOf(r) === g.key).sort(byUrgency)[0]).find(Boolean)
    if (first) setParam('pid', keyOf(first))
  }, [sel, shown, setParam])

  const reload = () => { home.reload(); team.reload(); setAt(new Date()) }

  if (team.error) {
    return <Shell><div className="tl-card tl-empty"><b style={{ color: C.text, fontSize: 15 }}>{/admin/i.test(team.error) ? 'Team load is for admins' : 'Couldn’t load the team'}</b><span>{/admin/i.test(team.error) ? 'Your own work is on your desk on Home.' : team.error}</span><Link className="tl-btn" to="/">Back to Home</Link></div></Shell>
  }
  if (team.loading || home.loading || !t) {
    return <Shell><div aria-busy="true" style={{ display: 'grid', gap: 12 }}>{[64, 40, 420].map(h => <div key={h} style={{ height: h, borderRadius: 10, background: C.border, opacity: 0.35 }} />)}</div></Shell>
  }

  const sum = (k) => people.reduce((s, p) => s + p[k], 0)
  const verifyAll = people.reduce((s, p) => s + (p.verify || 0), 0)
  const maxOwned = Math.max(1, unowned.length, ...people.map(p => p.owned))
  const person = people.find(p => p.email === who)
  const overdueN = carried.filter(r => r.urgency === 'overdue').length

  return (
    <Shell>
      <header className="tl-head">
        <div style={{ display: 'grid', gap: 2, flex: '1 1 300px' }}>
          <Link to="/" className="tl-crumb">‹ Home · Team</Link>
          <h1 className="tl-h1">Team load</h1>
        </div>
        <span style={{ fontSize: 12, color: C.muted }}>as of {at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
        <button type="button" className="tl-btn" onClick={reload}>Refresh</button>
      </header>

      <div className="tl-strip">
        <Tile k="Carried" v={carried.length} h={`${carried.filter(r => !r.is_prospect).length} properties · ${carried.filter(r => r.is_prospect).length} prospects`} go={() => { setParam('b', ''); setParam('who', '') }} />
        <Tile k="Needs us" v={sum('onThem')} tone={sum('onThem') ? M.red : null} h="the next move is ours" go={() => setParam('b', 'them')} />
        <Tile k="Chase" v={sum('onOthers')} tone={sum('onOthers') ? M.amber : null} h="others due or late" go={() => setParam('b', 'others')} />
        <Tile k="Overdue" v={overdueN} tone={overdueN ? M.red : null} h={people.filter(p => p.overdue).map(p => `${p.overdue} ${firstName(p.email)}`).join(' · ') || 'none'} />
        <Tile k="To verify" v={verifyAll} tone={verifyAll ? M.amber : null} h="vendor-closed items" />
        <Tile k="Unowned" v={unowned.length} tone={unowned.length ? M.amber : null} h="carried by nobody" go={() => setParam('who', NOBODY)} />
      </div>

      <div className="tl-people" role="group" aria-label="Whose work">
        <button type="button" className="tl-person" aria-pressed={!who} onClick={() => setParam('who', '')}>Everyone <span className="n">{carried.length}</span></button>
        {people.map(p => (
          <button key={p.email} type="button" className="tl-person" aria-pressed={who === p.email} onClick={() => setParam('who', who === p.email ? '' : p.email)}
            title={`${p.onThem} need us · ${p.onOthers} to chase · ${p.quiet} quiet · last active ${lastActive(p.last_active)}`}>
            {firstName(p.email)} <span className="n">{p.owned}</span>
            <span className="tl-mini" style={{ width: Math.max(14, Math.round(46 * p.owned / maxOwned)) }}>
              {[[p.onThem, 'red'], [p.onOthers, 'amber'], [p.quiet, 'green']].map(([v, tn], i) => <i key={i} style={{ width: `${p.owned ? 100 * v / p.owned : 0}%`, background: M[tn] }} />)}
            </span>
          </button>
        ))}
        {unowned.length > 0 && <button type="button" className="tl-person" aria-pressed={who === NOBODY} onClick={() => setParam('who', who === NOBODY ? '' : NOBODY)}>Unowned <span className="n">{unowned.length}</span></button>}
      </div>
      {person && (
        <div style={{ fontSize: 12.5, color: C.dim }}>
          <b style={{ color: C.text }}>{firstName(person.email)}</b> · {person.onThem} need us · {person.onOthers} to chase · {person.quiet} quiet
          {person.overdue ? <> · <span style={{ color: M.red }}>{person.overdue} overdue</span></> : ''}{person.setups ? ` · ${plural(person.setups, 'setup')} this week` : ''}
          {person.verify ? ` · ${person.verify} to verify` : ''} · last active {lastActive(person.last_active)}
        </div>
      )}

      <div className="tl-main">
        <section className="tl-list" aria-label="Carried items">
          <div className="tl-tools">
            <input id="tl-search" className="tl-in" type="search" placeholder="Search PID, name or step…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['', 'All'], ...GROUPS.map(g => [g.key, g.title])].map(([k, l]) => (
                <button key={k || 'all'} type="button" className="tl-chip" aria-pressed={bucket === k} onClick={() => setParam('b', k)}>
                  {l} {k ? base.filter(r => bucketOf(r) === k).length : base.length}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="tl-empty">
              {base.length === 0 ? (who ? 'Nothing carried here right now.' : 'Nobody is carrying anything right now.') : 'Nothing matches.'}
              {(q || bucket) && <button type="button" className="tl-btn" onClick={() => { setQ(''); setParam('b', '') }}>Clear filters</button>}
            </div>
          ) : GROUPS.map(g => {
            const list = shown.filter(r => bucketOf(r) === g.key).sort(byUrgency)
            if (!list.length) return null
            return (
              <div key={g.key}>
                <div className="tl-gh"><Dot tone={g.tone} />{g.title} · {list.length} <span>{g.sub}</span></div>
                {list.map(r => {
                  const u = URG[r.urgency] || URG.waiting
                  const more = (r.open_threads || []).filter(x => x.urgency !== 'done').length - 1
                  const o = ownerOf(r, owners)
                  return (
                    <button key={keyOf(r)} type="button" className="tl-row" aria-current={keyOf(r) === sel} onClick={() => setParam('pid', keyOf(r))}>
                      <Dot tone={u.tone} />
                      <span style={{ minWidth: 0 }}>
                        <div className="tl-r1">{titleOf(r)}</div>
                        <div className="tl-r2">{r.stage_label}</div>
                      </span>
                      <span className="tl-age" style={{ color: r.urgency === 'overdue' ? M.red : C.muted }}>{ageText(r)}</span>
                      <span className="tl-r3">
                        <span>waiting on {WAITING[r.blocked_on] || r.blocked_on || '—'}</span>
                        {more > 0 && <span>+{more} more open</span>}
                        {r.days_to_setup != null && r.days_to_setup >= 0 && <span>setup in {r.days_to_setup}d</span>}
                        {!who && <span style={{ color: emails.has(o) ? C.muted : M.amber }}>{o ? firstName(o) : 'no owner'}</span>}
                        {r.is_prospect && <span>prospect</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </section>

        {selected ? (
          <section className="tl-case" aria-label="Case">
            <CaseFile key={keyOf(selected)} row={selected} owner={ownerOf(selected, owners)} isAdmin={isAdmin}
              onClose={() => setParam('pid', '')}
              onOwner={(email) => setOwned(o => ({ ...o, [selected.pid]: email || null }))}
              onChanged={reload} />
          </section>
        ) : (
          <section className="tl-case tl-case-empty" aria-label="Case"><div className="tl-card tl-empty">Pick an item to see its whole case.</div></section>
        )}
      </div>

      <details className="tl-how">
        <summary>How is load counted?</summary>
        <ul>
          <li>Every live property (not paused, closed, archived or a test PID) and every open prospect from Stage counts once, for its owner: the person assigned, else whoever created it.</li>
          <li>Each is judged on its most urgent open step. <b>Needs us</b>: that step is the team’s. <b>Chase</b>: it waits on a landlord, vendor or supply and is due or late. <b>Quiet</b>: it waits on someone else and is still on time.</li>
          <li>Overdue means the step has been open longer than its limit, or the setup date is inside its lead time.</li>
          <li>Open an item to see every step still open on it, not just the main one.</li>
        </ul>
      </details>
      <style>{'@media (max-width:980px){.tl-case-empty{display:none}}'}</style>
    </Shell>
  )
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
  const body = <><span className="tl-tk">{k}</span><span className="tl-tv" style={{ color: v && tone ? tone : C.text }}>{v}</span><span className="tl-th" title={h}>{h}</span></>
  return go ? <button type="button" className="tl-tile" onClick={go}>{body}</button> : <div className="tl-tile">{body}</div>
}

// What a property's paperwork says right now: its estimate, work orders and
// invoice, each with the link that opens it.
function useCaseFacts(pid, enabled) {
  const [state, setState] = useState({ loading: true, data: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    Promise.all([
      supabase.from('estimates').select('id, status, total, sent_at, sent_total, locked, estimate_items(status, cost_type, material_cost, labour_cost, qty)')
        .eq('pid', pid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('work_orders').select('id, work_order_items(status)').eq('pid', pid),
      supabase.from('landlord_invoices').select('status, total, landlord_invoice_items(id)').eq('pid', pid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('inspections').select('id').eq('pid', pid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]).then(([e, w, v, i]) => {
      if (!alive) return
      const items = (e.data?.estimate_items || []).filter(x => !['removed', 'excluded'].includes(x.status))
      const val = (x) => ((Number(x.material_cost) || 0) + (Number(x.labour_cost) || 0)) * (Number(x.qty) || 1)
      const woItems = (w.data || []).flatMap(o => o.work_order_items || [])
      setState({ loading: false, data: {
        estimate: e.data ? {
          id: e.data.id, status: e.data.status, locked: e.data.locked,
          // A sent estimate is shown at what went out; a draft at its running total.
          total: e.data.status === 'draft' && !e.data.sent_at ? Number(e.data.total) || 0 : sentAmount(e.data, items),
          sent: e.data.status !== 'draft' || !!e.data.sent_at,
          approved: items.filter(x => x.status === 'approved' && isCosted(x)).reduce((s, x) => s + val(x), 0),
          nApproved: items.filter(x => x.status === 'approved').length,
          nRejected: items.filter(x => x.status === 'rejected').length,
          undecided: items.filter(x => !['approved', 'rejected'].includes(x.status || 'pending') && x.cost_type !== 'nil').length,
          n: items.filter(x => x.cost_type !== 'nil').length,
        } : null,
        orders: (w.data || []).length,
        open: woItems.filter(x => ['pending', 'disputed'].includes(x.status)).length,
        toVerify: woItems.filter(x => x.status === 'vendor_closed').length,
        verified: woItems.filter(x => x.status === 'verified').length,
        invoice: v.data ? { status: v.data.status, total: Number(v.data.total) || 0, lines: (v.data.landlord_invoice_items || []).length } : null,
        inspectionId: i.data?.id || null,
      } })
    })
    return () => { alive = false }
  }, [pid, enabled, tick])
  return [state, () => setTick(n => n + 1)]
}

function CaseFile({ row, owner, isAdmin, onClose, onOwner, onChanged }) {
  const navigate = useNavigate()
  const prop = !row.is_prospect
  const [facts, reloadFacts] = useCaseFacts(row.pid, prop)
  const [ownerOpen, setOwnerOpen] = useState(false)
  const changed = () => { onChanged(); reloadFacts() }
  const journey = { loading: false, error: null, row, paused: false, reload: changed }
  const d = facts.data
  const est = d?.estimate
  const setup = row.days_to_setup == null ? null : row.days_to_setup === 0 ? 'today' : row.days_to_setup > 0 ? `in ${row.days_to_setup} days` : `${-row.days_to_setup} days ago`

  return (
    <>
      <div className="tl-card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="tl-btn tl-back" onClick={onClose}>‹ Back</button>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.accent, fontWeight: 700 }}>{prop ? `PID ${row.pid}` : 'Prospect from Stage'}</div>
            <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.3 }}>{clean(row.property_name, row.pid) || row.pid}</div>
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span>Owner: <b style={{ color: owner ? C.text : M.amber }}>{owner ? firstName(owner) : 'nobody'}</b></span>
              {prop && isAdmin && <button type="button" className="tl-chip" onClick={() => setOwnerOpen(true)}>{owner ? 'Change owner' : 'Add owner'}</button>}
              {setup && <span>· setup {setup}{row.setup_date ? ` (${new Date(row.setup_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : ''}</span>}
            </div>
          </div>
          <Link className="tl-btn" to={prop ? `/properties/${encodeURIComponent(row.pid)}` : `/explore/${row.request_id}`}>{prop ? 'Open property ›' : 'Open request ›'}</Link>
        </div>
      </div>

      {/* where it stands and every open step, each with its action — the property page's own card */}
      <RecordStatus journey={journey} />

      {prop && (
        <div className="tl-card">
          <div className="tl-ey">Mark</div>
          <MilestoneStrip pid={row.pid} controlsOnly onChange={changed} />
        </div>
      )}

      {prop && (
        <div className="tl-card">
          <div className="tl-ey">At a glance</div>
          {facts.loading || !d ? <div style={{ height: 64, borderRadius: 8, background: C.border, opacity: 0.35 }} /> : (
            <div className="tl-facts">
              <Fact to={est ? `/estimate/${est.id}` : `/properties/${encodeURIComponent(row.pid)}/estimates`} k="Estimate"
                v={est ? (est.locked ? 'Final' : est.status === 'draft' ? 'Draft' : 'Sent') : 'None'}
                sub={est ? `${inr(est.total)}${est.sent ? ' sent' : ''} · ${est.nApproved}/${est.n} approved` : 'not created yet'}
                note={est && !est.locked && est.status !== 'draft' ? (est.undecided ? `${est.undecided} awaiting a decision` : 'all decided — mark final') : est?.nRejected ? `${est.nRejected} dropped` : ''}
                warn={!!est && !est.locked && est.undecided > 0} />
              <Fact to={`/properties/${encodeURIComponent(row.pid)}/work-orders`} k="Work orders"
                v={d.orders ? plural(d.orders, 'order') : 'None'}
                sub={d.orders ? `${d.verified} verified · ${d.open} open` : est?.locked ? 'ready to raise' : 'after the estimate is final'}
                note={d.toVerify ? `${d.toVerify} to verify` : ''} warn={d.toVerify > 0} />
              <Fact to={d.inspectionId ? `/invoice/${d.inspectionId}` : null} k="Invoice"
                v={d.invoice ? (['sent', 'paid', 'overdue'].includes(d.invoice.status) ? 'Final' : 'Draft') : 'None'}
                sub={d.invoice ? `${inr(d.invoice.total)} · ${plural(d.invoice.lines, 'line')}` : 'not started'} />
              <Fact to={`/properties/${encodeURIComponent(row.pid)}/payments`} k="Approved value"
                v={est ? inr(est.approved) : '—'} sub="priced + on actuals" />
            </div>
          )}
        </div>
      )}

      {prop && <LandlordPanel pid={row.pid} />}

      {prop
        ? <RecordTimeline pid={row.pid} stickyTop={0} />
        : <div className="tl-card" style={{ fontSize: 13, color: C.dim, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>Prospects have no Pulse history yet. <button type="button" className="tl-chip" onClick={() => navigate(`/explore/${row.request_id}`)}>Open the request ›</button></div>}

      {ownerOpen && (
        <ChangeOwnerModal pid={row.pid} current={owner} onClose={() => setOwnerOpen(false)}
          onSuccess={(email) => { setOwnerOpen(false); onOwner(email); changed() }} />
      )}
    </>
  )
}

function Fact({ to, k, v, sub, note, warn }) {
  const body = <>
    <span>{k}</span>
    <b>{v}</b>
    <em title={sub}>{sub}</em>
    {note && <em style={{ color: warn ? M.amber : C.dim }}>{note}</em>}
  </>
  return to ? <Link className="tl-fact" to={to}>{body}</Link> : <div className="tl-fact">{body}</div>
}
