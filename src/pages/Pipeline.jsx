import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'

// Pipeline: supply's exploratory requests from Flent-Stage, for setup ops.
//   Inbox     new / scheduled / visited / under review — assign who goes
//   Approved  heading for setup — link each to the Pulse property it became
//   Rejected  the register of every no, with the findings, so nobody visits
//             the same building or landlord twice without knowing
// Everything is read from Stage (synced by scripts/stage-sync.py); assigning
// and linking happen in Pulse. Admins assign; anyone can link.

const MONO = 'var(--font-mono, monospace)'
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)',
  accent: 'var(--accent, #c8963e)', green: 'var(--green, #3dba7a)', red: 'var(--red, #e05c6a)',
}
const SOFT = { red: 'rgba(224,92,106,0.12)', amber: 'rgba(200,150,62,0.12)', green: 'rgba(61,186,122,0.12)', grey: 'rgba(147,148,168,0.12)' }
const STATUS = {
  new_request:     ['New request', 'amber'],
  visit_scheduled: ['Visit scheduled', 'amber'],
  inspection_done: ['Visited', 'grey'],
  under_review:    ['Under review', 'grey'],
  approved:        ['Approved', 'green'],
  converted:       ['Converted', 'green'],
  rejected:        ['Rejected', 'red'],
}
const TABS = [['inbox', 'Inbox'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']]

const first = (email) => { const s = (email || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '' }
const dayTxt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
const timeTxt = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` }
const inr = (n) => n == null ? '' : '₹' + Math.round(Number(n)).toLocaleString('en-IN')
const daysFrom = (d) => d ? Math.round((new Date(d + 'T00:00:00') - new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00')) / 86400000) : null
function ago(at) {
  if (!at) return 'never'
  const m = Math.round((Date.now() - new Date(at).getTime()) / 60000)
  if (m < 60) return `${Math.max(1, m)}m ago`
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function Chip({ tone = 'grey', children, title }) {
  const col = { red: C.red, amber: C.accent, green: C.green, grey: C.dim }[tone]
  return <span title={title} style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: col, background: SOFT[tone] }}>{children}</span>
}
const btn = (primary) => ({ minHeight: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${primary ? 'rgba(200,150,62,0.45)' : C.border}`, background: primary ? SOFT.amber : C.input, color: primary ? C.accent : C.dim, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' })
const input = { minHeight: 34, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontFamily: MONO, fontSize: 12.5, minWidth: 0 }

export default function Pipeline() {
  const navigate = useNavigate()
  const phone = useIsMobile(760)
  const { session } = useAuth()
  const me = (session?.user?.email || '').toLowerCase()
  const [params, setParams] = useSearchParams()
  const focus = params.get('r')
  const [tab, setTab] = useState(() => params.get('tab') || 'inbox')
  const [q, setQ] = useState('')
  const [tag, setTag] = useState(null)
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [team, setTeam] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [props, setProps] = useState([])

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    const { data, error } = await supabase.rpc('exploratory_list', { p_tab: focus && tab === 'inbox' ? 'all' : tab })
    setState({ loading: false, error: error ? error.message : null, data })
  }, [tab, focus])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.rpc('team_members').then(({ data }) => setTeam((data || []).filter(t => t.email.endsWith('@flent.in') && t.properties > 0)))
    supabase.rpc('pulse_is_admin').then(({ data }) => setIsAdmin(!!data))
    supabase.from('properties').select('pid, name').is('deleted_at', null).order('created_at', { ascending: false }).then(({ data }) => setProps(data || []))
  }, [])

  const rows = useMemo(() => {
    let r = state.data?.rows || []
    if (tag) r = r.filter(x => (x.tags || []).includes(tag))
    if (q.trim()) {
      const n = q.trim().toLowerCase()
      r = r.filter(x => [x.name, x.address, x.owner_name, x.owner_phone, x.config, x.assignee, x.stage_inspector, x.linked_pid].some(v => (v || '').toLowerCase().includes(n)))
    }
    return r
  }, [state.data, q, tag])
  const counts = state.data?.counts || {}

  return (
    <div style={{ minHeight: '100svh', background: C.bg, color: C.text, fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <AppHeader />
      <main style={{ padding: phone ? '12px 12px 96px' : '16px 20px 40px', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px 14px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Pipeline</h1>
          <span style={{ fontSize: 13, color: C.dim }}>exploratory visits from supply, through to the property</span>
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, color: C.muted }} title="Requests are read from Flent-Stage by scripts/stage-sync.py">Flent-Stage synced {ago(state.data?.synced_at)}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TABS.map(([k, l]) => {
              const on = k === tab
              const extra = k === 'inbox' && counts.unassigned ? ` · ${counts.unassigned} unassigned` : k === 'approved' && counts.unlinked ? ` · ${counts.unlinked} not linked` : ''
              return (
                <button key={k} role="tab" aria-selected={on} type="button" onClick={() => { setTab(k); setTag(null); if (focus) setParams({}) }}
                  style={{ minHeight: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${on ? 'rgba(200,150,62,0.45)' : C.border}`, background: on ? SOFT.amber : 'transparent', color: on ? C.accent : C.dim, fontFamily: MONO, fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {l} {counts[k] != null && <span style={{ opacity: 0.75 }}>{counts[k]}</span>}{extra && <span style={{ color: k === 'inbox' ? C.red : C.accent }}>{extra}</span>}
                </button>
              )
            })}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a building, landlord, phone, person…" aria-label="Search" style={{ ...input, flex: '1 1 220px', maxWidth: 380, marginLeft: 'auto' }} />
        </div>

        {tab === 'rejected' && (state.data?.reasons || []).length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted, marginRight: 4 }}>What rejected findings mention:</span>
            {state.data.reasons.map(r => (
              <button key={r.tag} type="button" aria-pressed={tag === r.tag} onClick={() => setTag(t => t === r.tag ? null : r.tag)}
                style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: `1px solid ${tag === r.tag ? C.red : C.border}`, background: tag === r.tag ? SOFT.red : 'transparent', color: tag === r.tag ? C.red : C.dim, fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>
                {r.tag} <b>{r.n}</b>
              </button>
            ))}
          </div>
        )}

        {state.error ? (
          <div style={{ padding: 16, fontFamily: MONO, fontSize: 12.5, color: /exploratory_list|does not exist|schema cache/i.test(state.error) ? C.muted : C.red }}>
            {/exploratory_list|does not exist|schema cache/i.test(state.error) ? 'The pipeline appears once the exploratory migration is applied and Stage is synced.' : `Couldn't load the pipeline — ${state.error}`}
          </div>
        ) : state.loading && !state.data ? (
          <div style={{ height: 140, borderRadius: 10, background: C.border, opacity: 0.35 }} />
        ) : rows.length === 0 ? (
          <div style={{ padding: 16, fontSize: 13, color: C.muted }}>{q || tag ? 'Nothing matches.' : tab === 'inbox' ? 'No open exploratory requests.' : 'Nothing here yet.'}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: phone ? 'minmax(0,1fr)' : 'repeat(auto-fill, minmax(460px, 1fr))', gap: 12, alignItems: 'start' }}>
            {rows.map(r => <RequestCard key={r.id} r={r} focus={r.id === focus} isAdmin={isAdmin} team={team} me={me} props={props} navigate={navigate} onChanged={load} />)}
          </div>
        )}
      </main>
    </div>
  )
}

function RequestCard({ r, focus, isAdmin, team, me, props, navigate, onChanged }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(!!focus)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [linkPid, setLinkPid] = useState('')
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [focus])
  const [label, tone] = STATUS[r.status] || [r.status, 'grey']
  const who = r.assignee || r.stage_inspector
  const d = daysFrom(r.visit_date)
  const lv = r.last_visit || null
  const findings = [lv?.observations, lv?.notes].filter(Boolean).join('\n\n')
  const live = ['new_request', 'visit_scheduled'].includes(r.status)
  const load = (r.day_load || []).filter(x => x.who)

  async function assign(email) {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('exploratory_assign', { p_id: r.id, p_email: email || null })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onChanged()
  }
  async function link(pid) {
    if (!pid) return
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('exploratory_link', { p_id: r.id, p_pid: pid })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onChanged()
  }
  async function unlink() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('exploratory_unlink', { p_id: r.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onChanged()
  }

  // likely Pulse properties for an approved request, by building name
  const key = (s) => (s || '').toLowerCase().split(',')[0].replace(/\b(\d\s*bhk|\d\s*b\s*\d\s*b|bhk|apartments?|residency)\b/g, '').replace(/[^a-z]/g, '')
  const likely = r.linked_pid ? [] : props.filter(p => { const a = key(p.name), b = key(r.name); return a && b && (a.startsWith(b) || b.startsWith(a)) })

  return (
    <article ref={ref} style={{ background: C.panel, border: `1px solid ${focus ? C.accent : r.stale ? 'rgba(224,92,106,0.35)' : C.border}`, borderRadius: 10, minWidth: 0, boxShadow: focus ? '0 0 0 2px rgba(200,150,62,0.25)' : 'none' }}>
      <div style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
        {/* headline */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{r.name || 'Unnamed property'}</div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted, marginTop: 2 }}>
              {[r.config, r.type, r.furnishing].filter(Boolean).join(' · ')}{r.requester ? ` · raised by ${r.requester}` : ''}
            </div>
          </div>
          <Chip tone={tone}>{label}</Chip>
          {r.stale && <Chip tone="red" title="The visit date has passed but Stage still shows it as new or scheduled">visit date passed</Chip>}
          {r.linked_pid && <Chip tone="green">→ PID {r.linked_pid}</Chip>}
        </div>

        {/* when and where */}
        <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', fontSize: 13 }}>
          {r.visit_date ? <span><b style={{ color: live && d != null && d <= 1 && d >= 0 ? C.accent : C.text }}>{dayTxt(r.visit_date)}{r.visit_time ? `, ${timeTxt(r.visit_time)}` : ''}{r.visit_time_end ? `–${timeTxt(r.visit_time_end)}` : ''}</b>
            {live && d != null && <span style={{ color: C.muted, fontFamily: MONO, fontSize: 11.5 }}> · {d === 0 ? 'today' : d === 1 ? 'tomorrow' : d > 0 ? `in ${d}d` : `${-d}d ago`}</span>}</span>
            : <span style={{ color: C.muted }}>No visit slot yet</span>}
          {r.address && <span style={{ color: C.dim, minWidth: 0 }}>{r.address}</span>}
          {r.maps_link && <a href={r.maps_link} target="_blank" rel="noreferrer" style={{ color: C.accent, fontFamily: MONO, fontSize: 12 }}>Map ›</a>}
        </div>

        {/* landlord */}
        {(r.owner_name || r.owner_phone) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 13, alignItems: 'baseline' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>LANDLORD</span>
            <span>{r.owner_name}</span>
            {r.owner_phone && <a href={`tel:${r.owner_phone}`} style={{ fontFamily: MONO, fontSize: 12, color: C.accent, textDecoration: 'none' }}>{r.owner_phone}</a>}
            {r.owner_email && <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{r.owner_email}</span>}
          </div>
        )}

        {/* seen before */}
        {(r.seen_before || []).length > 0 && (
          <div style={{ border: `1px solid ${r.seen_before.some(s => s.status === 'rejected') ? C.red : 'rgba(200,150,62,0.45)'}`, background: r.seen_before.some(s => s.status === 'rejected') ? SOFT.red : SOFT.amber, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, display: 'grid', gap: 3 }}>
            <b>Seen before</b>
            {r.seen_before.map(s => (
              <span key={s.id}>{s.why === 'same landlord' ? 'Same landlord as' : 'Same building as'} <b>{s.name}</b> · {(STATUS[s.status] || [s.status])[0].toLowerCase()} · {dayTxt(s.date)}
                {(s.tags || []).length > 0 && <span style={{ color: C.dim }}> — findings mention {s.tags.join(', ').toLowerCase()}</span>}</span>
            ))}
          </div>
        )}

        {/* who goes */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>VISIT BY</span>
          {isAdmin && live ? (
            <select value={r.assignee || ''} disabled={busy} onChange={e => assign(e.target.value)} style={input} aria-label="Assign who goes">
              <option value="">{r.assignee ? 'Unassign' : 'Assign someone…'}</option>
              {team.map(t => {
                const busyThatDay = load.filter(x => x.who === t.email)
                return <option key={t.email} value={t.email}>{first(t.email)}{busyThatDay.length ? ` — also ${busyThatDay.map(x => x.what.split(' · ')[0].toLowerCase() + (x.at ? ' ' + x.at : '')).join(', ')} that day` : ''}</option>
              })}
            </select>
          ) : <b style={{ color: who ? C.text : C.red }}>{who ? first(who) : 'nobody yet'}</b>}
          {r.assignee && r.stage_inspector && r.assignee !== r.stage_inspector && <Chip tone="amber" title="Stage has someone else down for this visit">Stage says {first(r.stage_inspector)}</Chip>}
          {!r.assignee && r.stage_inspector && isAdmin && live && <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>Stage has {first(r.stage_inspector)}</span>}
          {r.assigned_by && <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>assigned by {first(r.assigned_by)}</span>}
        </div>
        {isAdmin && live && load.length > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>That day: {load.map(x => `${first(x.who)} — ${x.what}${x.at ? ` ${x.at}` : ''}`).join(' · ')}</div>
        )}

        {/* approved: link to the property it became */}
        {['approved', 'converted'].includes(r.status) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>PROPERTY</span>
            {r.linked_pid ? <>
              <button type="button" onClick={() => navigate(`/properties/${encodeURIComponent(r.linked_pid)}`)} style={{ ...btn(true) }}>PID {r.linked_pid} ›</button>
              <button type="button" onClick={unlink} disabled={busy} style={btn(false)}>Unlink</button>
            </> : <>
              {likely.slice(0, 3).map(p => <button key={p.pid} type="button" disabled={busy} onClick={() => link(p.pid)} style={btn(true)} title={`Link to ${p.name}`}>Link {p.pid} · {p.name}</button>)}
              <select value={linkPid} onChange={e => setLinkPid(e.target.value)} style={{ ...input, flex: '1 1 160px', maxWidth: 260 }} aria-label="Pick the property">
                <option value="">{likely.length ? 'Or pick another…' : 'Pick the Pulse property…'}</option>
                {props.map(p => <option key={p.pid} value={p.pid}>{p.pid} · {p.name}</option>)}
              </select>
              <button type="button" disabled={!linkPid || busy} onClick={() => link(linkPid)} style={{ ...btn(false), opacity: linkPid ? 1 : 0.5 }}>Link</button>
            </>}
          </div>
        )}

        {err && <div style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>{err}</div>}

        {/* findings */}
        {(r.visits || []).length > 0 && (
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
            style={{ justifySelf: 'start', background: 'none', border: 'none', padding: 0, color: C.accent, fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}>
            {open ? '▾' : '▸'} {r.visits.length} visit{r.visits.length === 1 ? '' : 's'}{lv?.outcome ? ` · ${lv.outcome}` : ''}{lv?.capex ? ` · capex ${inr(lv.capex)}` : ''}{(r.tags || []).length && r.status === 'rejected' ? ` · mentions ${r.tags.slice(0, 3).join(', ').toLowerCase()}` : ''}
          </button>
        )}
        {open && (r.visits || []).slice().reverse().map((v, i) => (
          <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 11px', display: 'grid', gap: 5, background: C.bg }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: MONO, fontSize: 11.5, color: C.muted }}>
              <span>{dayTxt(v.date)}{v.time ? ` · ${timeTxt(v.time)}` : ''}</span>
              {v.by && <span>by {first(v.by)}</span>}
              {v.outcome && <Chip tone={/reject/i.test(v.outcome) ? 'red' : /accept/i.test(v.outcome) ? 'green' : 'grey'}>{v.outcome}</Chip>}
              {v.capex != null && <span>capex {inr(v.capex)}</span>}
              {v.follow_up && <Chip tone="amber">follow-up</Chip>}
            </div>
            {v.observations && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}><span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, display: 'block' }}>INTERNAL OBSERVATIONS</span>{v.observations}</div>}
            {v.notes && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: C.dim }}><span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted, display: 'block' }}>VISIT NOTES</span>{v.notes}</div>}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {v.report_url && <a href={v.report_url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontFamily: MONO, fontSize: 12 }}>Inspection report ›</a>}
              {Array.isArray(v.attachments) && v.attachments.length > 0 && v.attachments.map((u, j) => <a key={j} href={typeof u === 'string' ? u : u?.url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontFamily: MONO, fontSize: 12 }}>Photo {j + 1} ›</a>)}
            </div>
          </div>
        ))}
        {!findings && !open && r.notes && <div style={{ fontSize: 12.5, color: C.dim, whiteSpace: 'pre-wrap' }}>{r.notes}</div>}
      </div>
    </article>
  )
}
