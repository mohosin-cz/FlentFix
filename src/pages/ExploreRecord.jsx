import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { FACTS, first, slotText, timeText, VERDICT, RATING, stageCopy, copyText } from '../utils/explore'

// A prospect's record — the start of a property's journey.
//
// Supply raised it in Flent-Stage; here it gets the same record a property
// has: the journey bar (Explore is the first phase), the next step with its
// action, the timeline, and the landlord. Pulse reads all of it from Stage and
// writes back only who is going. When the PID is created the property carries on.

const MONO = 'var(--font-mono, monospace)'
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)',
  accent: 'var(--accent, #c8963e)', green: 'var(--green, #6f9a7e)', red: 'var(--red, #b0645b)', pink: '#b0645b',
}
const SOFT = { red: 'rgba(176,100,91,0.12)', amber: 'rgba(200,150,62,0.12)', green: 'rgba(111,154,126,0.12)', pink: 'rgba(176,100,91,0.13)', grey: 'rgba(147,148,168,0.12)' }
const PHASES = ['Explore', 'Inspect', 'Estimate', 'Plan', 'Setup', 'Close-out', 'Finish']

const box = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, minWidth: 0 }
const title = { fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }
const btn = (kind) => ({ minHeight: 38, padding: '0 14px', borderRadius: 8, fontFamily: MONO, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${kind === 'primary' ? 'rgba(200,150,62,0.45)' : kind === 'danger' ? C.red : C.border}`,
  background: kind === 'primary' ? SOFT.amber : kind === 'danger' ? SOFT.red : C.input, color: kind === 'primary' ? C.accent : kind === 'danger' ? C.red : C.dim })
const input = { minHeight: 38, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontFamily: MONO, fontSize: 12.5, minWidth: 0 }
function Chip({ tone = 'grey', children, title: t }) {
  const col = { red: C.red, amber: C.accent, green: C.green, grey: C.dim, pink: C.pink }[tone]
  return <span title={t} style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: col, background: SOFT[tone] }}>{children}</span>
}
const fmt = (at) => at ? new Date(at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''

export default function ExploreRecord() {
  const { id } = useParams()
  const navigate = useNavigate()
  const phone = useIsMobile(900)
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [why, setWhy] = useState('')
  const [declining, setDeclining] = useState(false)
  const [props, setProps] = useState([])
  const [linkPid, setLinkPid] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('exploratory_record', { p_id: id })
    setState({ loading: false, error: error ? error.message : null, data })
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t) }, [toast])

  const d = state.data
  const r = d?.request, a = d?.assignment, row = d?.row
  const thread = row?.open_threads?.[0]
  const code = thread?.code
  const isLinkStep = code === 'explore_link'
  useEffect(() => {
    if (!isLinkStep) return
    supabase.from('properties').select('pid, name').is('deleted_at', null).order('created_at', { ascending: false }).then(({ data }) => setProps(data || []))
  }, [isLinkStep])

  async function call(fn, args, done) {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) { setErr(error.message); return false }
    if (done) setToast(done)
    await load()
    return true
  }

  if (state.loading) return <Shell><div style={{ height: 160, borderRadius: 10, background: C.border, opacity: 0.35 }} /></Shell>
  if (state.error || !d) {
    const notYet = /exploratory_record|does not exist|schema cache/i.test(state.error || '')
    return <Shell><div style={{ fontFamily: MONO, fontSize: 13, color: notYet ? C.muted : C.red, padding: 16 }}>{notYet ? 'This page appears once the explore_journey migration is applied.' : state.error || 'No such exploratory request.'}</div></Shell>
  }

  const me = d.me, isAdmin = d.is_admin
  const who = a?.assignee || (a?.stage_written_at ? null : r.stage_inspector)
  const myVisit = who && who === me
  const lastPulse = (d.logs || []).find(l => l.submitted_at)
  const stageVisits = r.visits || []
  const notTaken = r.status === 'rejected'
  const tags = d.tags || []
  const name = `${r.property_name || 'Unnamed prospect'}${r.configuration ? ` · ${r.configuration}` : ''}`
  const day = r.visit_date ? Math.round((new Date(r.visit_date + 'T00:00:00') - new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00')) / 86400000) : null

  // ── the timeline, oldest first ──
  const tl = []
  tl.push({ at: r.created_at, tone: 'pink', h: 'Raised in Stage by supply', s: r.notes ? `“${r.notes.slice(0, 140)}${r.notes.length > 140 ? '…' : ''}”` : (r.requester ? `by ${r.requester}` : '') })
  if (a?.declined_at) tl.push({ at: a.declined_at, tone: 'red', h: `${first(a.declined_by)} can’t make it`, s: a.decline_reason })
  if (a?.assigned_at && a?.assignee) tl.push({ at: a.assigned_at, tone: 'amber', h: `Assigned to ${first(a.assignee)}`, s: `by ${first(a.assigned_by)}${a.stage_written_at && a.stage_written_assignee === a.assignee ? ' · written to Stage ✓' : ' · goes to Stage on the next sync'}` })
  if (r.visit_date) tl.push({ at: `${r.visit_date}T${r.visit_time || '00:00:00'}`, tone: day != null && day > 0 ? '' : 'amber', h: `Visit slot · ${slotText(r.visit_date, r.visit_time)}`, s: r.reschedule_reason ? `rescheduled: ${r.reschedule_reason}` : '' })
  for (const l of (d.logs || []).filter(x => x.submitted_at)) {
    tl.push({ at: l.submitted_at, tone: VERDICT[l.verdict]?.[1] || 'amber', h: `${first(l.author)} logged · ${VERDICT[l.verdict]?.[0] || '—'}`, s: [l.capex_band && `capex ${l.capex_band}`, (l.checks || []).filter(c => c.rating === 'poor').map(c => c.label.toLowerCase()).join(', ')].filter(Boolean).join(' · ') })
    if (l.in_stage_at) tl.push({ at: l.in_stage_at, tone: 'green', h: 'Findings in Stage ✓', s: 'seen by the sync' })
  }
  for (const v of stageVisits) tl.push({ at: v.created_at || v.date, tone: /reject/i.test(v.outcome || '') ? 'red' : /accept/i.test(v.outcome || '') ? 'green' : '', h: `Visit recorded in Stage${v.by ? ` by ${first(v.by)}` : ''}${v.outcome ? ` · ${v.outcome}` : ''}`, s: (v.observations || v.notes || '').slice(0, 160) })
  if (['approved', 'converted', 'rejected'].includes(r.status)) tl.push({ at: r.stage_updated_at, tone: r.status === 'rejected' ? 'red' : 'green', h: r.status === 'rejected' ? 'Not taken — supply rejected it' : r.status === 'converted' ? 'Converted by supply' : 'Approved by supply', s: tags.length && r.status === 'rejected' ? `findings mention ${tags.join(', ').toLowerCase()}` : '' })
  if (d.linked_pid) tl.push({ at: null, tone: 'green', h: `Became PID ${d.linked_pid}`, s: 'the property carries on from here' })
  tl.sort((x, y) => (x.at ? new Date(x.at) : Infinity) - (y.at ? new Date(y.at) : Infinity))

  // ── the next step and its action ──
  const next = (() => {
    if (a?.stage_conflict && isAdmin) return (
      <>
        <span style={{ flex: '1 1 260px', fontSize: 14 }}><b>Stage says {first(a.stage_conflict)} is going</b> · Pulse has {first(a.assignee)}</span>
        <button style={btn('primary')} disabled={busy} onClick={() => call('exploratory_resolve_conflict', { p_id: id, p_use_stage: false }, `Keeping ${first(a.assignee)} — Stage is updated on the next sync`)}>Keep {first(a.assignee)}</button>
        <button style={btn()} disabled={busy} onClick={() => call('exploratory_resolve_conflict', { p_id: id, p_use_stage: true }, `Using Stage’s pick — ${first(a.stage_conflict)}`)}>Use {first(a.stage_conflict)}</button>
      </>)
    switch (code) {
      case 'explore_assign':
        return isAdmin ? <AssignChoice d={d} busy={busy} onAssign={(email) => call('exploratory_assign', { p_id: id, p_email: email }, `Assigned ${first(email)} — on their desk now; written to Stage on the next sync`)} />
          : <span style={{ fontSize: 14 }}>Waiting for an admin to assign someone for {slotText(r.visit_date, r.visit_time)}.</span>
      // Assigning is final now; an old unconfirmed row reads as a booked visit.
      case 'explore_confirm':
      case 'explore_visit':
        return (
          <>
            <span style={{ flex: '1 1 240px', fontSize: 14 }}><b>Visit {day === 0 ? 'today' : day === 1 ? 'tomorrow' : slotText(r.visit_date)}{r.visit_time ? `, ${timeText(r.visit_time)}` : ''}</b> · {first(who)}</span>
            {myVisit && !declining && <button style={btn('primary')} onClick={() => navigate(`/explore/${id}/log`)}>{day === 0 ? 'Start visit' : 'Open the log'}</button>}
            {/* Nothing waits on this — it's the way out if plans change. */}
            {myVisit && (declining ? (
              <>
                <input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why can’t you go? (goes to the admin)" style={{ ...input, flex: '1 1 240px' }} autoFocus />
                <button style={btn('danger')} disabled={busy || !why.trim()} onClick={async () => { if (await call('exploratory_respond', { p_id: id, p_ok: false, p_reason: why }, 'Sent back to the admin')) { setDeclining(false); setWhy('') } }}>Send</button>
                <button style={btn()} onClick={() => setDeclining(false)}>Cancel</button>
              </>
            ) : <button style={{ ...btn(), background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)' }} onClick={() => setDeclining(true)}>Can’t make it?</button>)}
          </>)
      case 'explore_log':
        return (
          <>
            <span style={{ flex: '1 1 240px', fontSize: 14, color: C.red }}><b>The visit was {slotText(r.visit_date)} — findings not logged yet</b> · {first(who)}</span>
            {(myVisit || isAdmin) && <button style={btn('primary')} onClick={() => navigate(`/explore/${id}/log`)}>Log the findings</button>}
          </>)
      case 'explore_paste_main':
        return (
          <>
            <span style={{ flex: '1 1 280px', fontSize: 14 }}><b>Logged — paste the findings into Stage.</b> Stage still shows the visit as booked; supply decides once it’s there.</span>
            {lastPulse && <CopyButton text={stageCopy(r, lastPulse, lastPulse.author)} onDone={() => setToast('Copied — paste it into the visit form in Stage. Pulse moves on when Stage’s status changes.')} />}
          </>)
      case 'explore_decision':
        return (
          <>
            <span style={{ flex: '1 1 260px', fontSize: 14 }}><b>Waiting on supply’s decision</b>{lastPulse ? ` · ${first(lastPulse.author)} said ${VERDICT[lastPulse.verdict]?.[0]}` : ''} · {thread.age_days}d</span>
            <NudgeSupply r={r} log={lastPulse} onDone={() => setToast('Copied — paste it to supply')} />
          </>)
      case 'explore_deal':
        return <span style={{ fontSize: 14 }}><b>Approved — supply is closing the deal with the landlord.</b> The PID comes once it’s signed.</span>
      case 'explore_slot':
        return <span style={{ fontSize: 14 }}><b>Waiting on supply for a visit slot.</b></span>
      case 'explore_stale':
        return <span style={{ fontSize: 14, color: C.dim }}><b>{thread.label}</b> — supply should close or update it in Stage.</span>
      case 'explore_create_pid': {
        const pid = (thread.next_action_route.match(/pid=([^&]+)/) || [])[1]
        return (
          <>
            <span style={{ flex: '1 1 260px', fontSize: 14 }}><b>{thread.label}</b></span>
            <button style={btn('primary')} onClick={() => navigate(thread.next_action_route)}>{pid ? `Create PID ${decodeURIComponent(pid)} ›` : 'Create the PID ›'}</button>
          </>)
      }
      case 'explore_link':
        return (
          <>
            <span style={{ flex: '1 1 220px', fontSize: 14 }}><b>Approved — which Pulse property is it?</b></span>
            <select value={linkPid} onChange={e => setLinkPid(e.target.value)} style={{ ...input, flex: '1 1 200px', maxWidth: 320 }} aria-label="Pick the property">
              <option value="">Pick the PID…</option>
              {props.map(p => <option key={p.pid} value={p.pid}>{p.pid} · {p.name}</option>)}
            </select>
            <button style={{ ...btn('primary'), opacity: linkPid ? 1 : 0.5 }} disabled={!linkPid || busy} onClick={() => call('exploratory_link', { p_id: id, p_pid: linkPid, p_pending: false }, `Linked to PID ${linkPid}`)}>Link</button>
          </>)
      case 'explore_not_taken':
        return <span style={{ fontSize: 14, color: C.dim }}><b>Not taken.</b> Kept here so the next visit to this building or landlord knows why.</span>
      default:
        return d.linked_pid ? <button style={btn('primary')} onClick={() => navigate(`/properties/${encodeURIComponent(d.linked_pid)}`)}>Open PID {d.linked_pid} ›</button> : null
    }
  })()
  const paste = (row?.open_threads || []).find(t => t.code === 'explore_paste')

  return (
    <Shell>
      {/* header */}
      <div style={{ display: 'flex', gap: '6px 12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{name}</h1>
        <Chip tone="pink">PROSPECT</Chip>
        {d.linked_pid && <button onClick={() => navigate(`/properties/${encodeURIComponent(d.linked_pid)}`)} style={{ ...btn('primary'), minHeight: 28 }}>PID {d.linked_pid} ›</button>}
        <span style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>{[r.property_type, r.furnishing].filter(Boolean).join(' · ')}{who ? ` · visit by ${first(who)}` : ''}</span>
      </div>

      {/* journey bar */}
      <section style={{ ...box, padding: phone ? 12 : 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(3, minmax(0,1fr))' : `repeat(${PHASES.length}, minmax(0,1fr))`, gap: 6 }}>
          {PHASES.map((p, i) => {
            const now = i === 0 && !d.linked_pid, done = i === 0 && !!d.linked_pid
            return (
              <div key={p} style={{ padding: '8px 10px', borderRadius: 8, minWidth: 0, border: `1px solid ${now ? C.pink : done ? 'rgba(111,154,126,0.30)' : C.border}`, background: now ? SOFT.pink : 'transparent', opacity: i > 0 && !d.linked_pid ? 0.55 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: now ? C.pink : done ? C.green : C.border }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: MONO, color: now ? C.pink : done ? C.green : C.muted }}>{p}</span>
                </div>
                <div style={{ fontSize: 11, color: now ? C.text : C.muted, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {i === 0 ? (notTaken ? 'not taken' : (thread?.label || '').replace(/ · .*$/, '')) : ' '}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: MONO, color: C.muted }}>Next</span>
          {next}
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: C.muted }} title="Stage's status is the verdict; Pulse's step follows it">Stage: {(r.status || '').replace('_', ' ')}</span>
        </div>
        {paste && <PasteBar r={r} log={lastPulse} onOpenLog={() => navigate(`/explore/${id}/log`)} onCopied={() => setToast('Copied — paste it into the visit form in Stage. Pulse ticks it when the sync sees it.')} />}
        {err && <div role="alert" style={{ fontFamily: MONO, fontSize: 12, color: C.red }}>{err}</div>}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: phone ? 'minmax(0,1fr)' : 'minmax(260px,0.9fr) minmax(0,1.3fr) minmax(280px,1fr)', gap: 14, alignItems: 'start' }}>
        {/* left: what supply asked, the landlord, where */}
        <div style={{ display: 'grid', gap: 14 }}>
          {r.notes && <section style={{ ...box, padding: 14, borderLeft: `3px solid ${C.pink}` }}><div style={{ ...title, color: C.pink }}>supply’s ask</div><div style={{ fontSize: 13.5, marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.notes}</div></section>}
          <section style={{ ...box, padding: 14, display: 'grid', gap: 6 }}>
            <div style={title}>landlord</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{r.owner_name || '—'}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {r.owner_phone && <a href={`tel:${r.owner_phone}`} style={{ ...btn('primary'), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Call {r.owner_phone}</a>}
              {r.owner_email && <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim, alignSelf: 'center' }}>{r.owner_email}</span>}
            </div>
          </section>
          <section style={{ ...box, padding: 14, display: 'grid', gap: 6 }}>
            <div style={title}>where</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.address || '—'}</div>
            {r.maps_link && <a href={r.maps_link} target="_blank" rel="noreferrer" style={{ color: C.accent, fontFamily: MONO, fontSize: 12.5 }}>Open in Maps ›</a>}
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted, marginTop: 4 }}>{slotText(r.visit_date, r.visit_time)}{r.visit_time_end ? `–${timeText(r.visit_time_end)}` : ''}{r.requester ? ` · raised by ${r.requester}` : ''}{r.ppid_no ? ` · ref ${r.ppid_no}` : ''}</div>
          </section>
          {(d.seen_before || []).length > 0 && (
            <section style={{ ...box, padding: 14, border: `1px solid ${d.seen_before.some(s => s.status === 'rejected') ? C.red : 'rgba(200,150,62,0.45)'}`, background: d.seen_before.some(s => s.status === 'rejected') ? SOFT.red : SOFT.amber, display: 'grid', gap: 6 }}>
              <div style={title}>seen before</div>
              {d.seen_before.map(s => (
                <button key={s.id} onClick={() => navigate(`/explore/${s.id}`)} style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.text, fontSize: 13 }}>
                  {s.why === 'same landlord' ? 'Same landlord as' : 'Same building as'} <b>{s.name}</b> · {s.status === 'rejected' ? 'not taken' : s.status.replace('_', ' ')} · {slotText(s.date)}
                  {(s.tags || []).length > 0 && <span style={{ color: C.dim }}> — findings mention {s.tags.join(', ').toLowerCase()}</span>}
                </button>
              ))}
            </section>
          )}
        </div>

        {/* middle: the timeline */}
        <section style={{ ...box, padding: '14px 14px 6px' }}>
          <div style={title}>timeline</div>
          <div style={{ marginTop: 8 }}>
            {tl.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 10, padding: '7px 0' }}>
                <i style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 5, background: { pink: C.pink, amber: C.accent, green: C.green, red: C.red }[e.tone] || C.border }} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.h}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>{e.at ? fmt(e.at) : ''}{e.s ? `${e.at ? ' · ' : ''}${e.s}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* right: findings */}
        <div style={{ display: 'grid', gap: 14 }}>
          {(d.logs || []).filter(l => l.submitted_at).map(l => <LogCard key={l.id} r={r} l={l} />)}
          {d.my_draft && (
            <section style={{ ...box, padding: 14 }}>
              <div style={title}>your draft log</div>
              <div style={{ fontSize: 13, marginTop: 6, color: C.dim }}>Saved {fmt(d.my_draft.updated_at)} — not sent yet.</div>
              <button style={{ ...btn('primary'), marginTop: 8 }} onClick={() => navigate(`/explore/${id}/log`)}>Continue the log ›</button>
            </section>
          )}
          {stageVisits.length > 0 && (
            <section style={{ ...box, padding: 14, display: 'grid', gap: 10 }}>
              <div style={title}>in stage</div>
              {stageVisits.slice().reverse().map((v, i) => (
                <div key={i} style={{ display: 'grid', gap: 4, borderTop: i ? `1px solid ${C.border}` : 'none', paddingTop: i ? 10 : 0 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontFamily: MONO, fontSize: 11.5, color: C.muted }}>
                    <span>{slotText(v.date, v.time)}</span>{v.by && <span>by {first(v.by)}</span>}
                    {v.outcome && <Chip tone={/reject/i.test(v.outcome) ? 'red' : /accept/i.test(v.outcome) ? 'green' : 'grey'}>{v.outcome}</Chip>}
                    {v.capex != null && <span>capex ₹{Math.round(v.capex).toLocaleString('en-IN')}</span>}
                  </div>
                  {(v.observations || v.notes) && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: C.dim, lineHeight: 1.45 }}>{v.observations || v.notes}</div>}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {v.report_url && <a href={v.report_url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontFamily: MONO, fontSize: 12 }}>Report ›</a>}
                    {Array.isArray(v.attachments) && v.attachments.map((u, j) => <a key={j} href={typeof u === 'string' ? u : u?.url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontFamily: MONO, fontSize: 12 }}>Photo {j + 1} ›</a>)}
                  </div>
                </div>
              ))}
            </section>
          )}
          {!stageVisits.length && !(d.logs || []).some(l => l.submitted_at) && !d.my_draft && (
            <section style={{ ...box, padding: 14, fontSize: 13, color: C.muted }}>No findings yet. They appear here once the visit is logged.</section>
          )}
        </div>
      </div>
      {toast && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', transform: 'translateX(-50%)', background: C.text, color: C.bg, padding: '10px 14px', borderRadius: 10, fontFamily: MONO, fontSize: 12, zIndex: 50, maxWidth: '92vw' }}>{toast}</div>}
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100svh', background: C.bg, color: C.text, fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <AppHeader />
      <main style={{ padding: '16px 20px calc(96px + env(safe-area-inset-bottom, 0px))', display: 'grid', gap: 14 }}>{children}</main>
    </div>
  )
}

// Who should go: each person with what they already have that day.
function AssignChoice({ d, busy, onAssign }) {
  const people = useMemo(() => (d.people || []).map(p => ({ ...p, free: !(p.day || []).length }))
    .sort((a, b) => (b.free - a.free) || ((a.week || 0) - (b.week || 0))), [d.people])
  return (
    <div style={{ display: 'grid', gap: 8, flex: '1 1 100%' }}>
      <div style={{ fontSize: 14 }}><b>Who should go · {slotText(d.request.visit_date, d.request.visit_time)}</b></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
        {people.map((p, i) => (
          <button key={p.email} disabled={busy} onClick={() => onAssign(p.email)}
            style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', color: C.text, display: 'grid', gap: 4,
                     border: `1px solid ${i === 0 && p.free ? 'rgba(200,150,62,0.45)' : C.border}`, background: i === 0 && p.free ? SOFT.amber : C.input }}>
            <span style={{ fontWeight: 600 }}>Assign {first(p.email)}{i === 0 && p.free ? <span style={{ fontFamily: MONO, fontSize: 11, color: C.accent }}> · best fit</span> : ''}</span>
            <span style={{ fontFamily: MONO, fontSize: 11.5, color: p.free ? C.green : C.accent }}>{p.free ? 'nothing else that day' : `also: ${p.day.join(' · ')}`}</span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>{p.week || 0} visit{p.week === 1 ? '' : 's'} around then{p.seen ? ' · has visited this building/landlord' : ''}</span>
          </button>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted }}>Assigning is the one thing Pulse writes to Stage (on the next sync).</div>
    </div>
  )
}

function LogCard({ r, l }) {
  const [tone] = [VERDICT[l.verdict]?.[1] || 'grey']
  return (
    <section style={{ ...box, padding: 14, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={title}>visit log · {first(l.author)}</div>
        <Chip tone={tone}>{VERDICT[l.verdict]?.[0] || '—'}</Chip>
        {l.capex_band && <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>capex {l.capex_band}</span>}
        <span style={{ marginLeft: 'auto' }}>{l.in_stage_at ? <Chip tone="green">in Stage ✓</Chip> : <Chip tone="amber">not in Stage yet</Chip>}</span>
      </div>
      <div style={{ display: 'grid', gap: 5 }}>
        {(l.checks || []).filter(c => c.rating || c.note).map(c => (
          <div key={c.key} style={{ fontSize: 13 }}>
            <b>{c.label}</b> <span style={{ fontFamily: MONO, fontSize: 11.5, color: c.rating === 'poor' ? C.red : c.rating === 'fix' ? C.accent : C.green }}>{c.score != null ? `${c.score}/10` : RATING[c.rating] || ''}</span>
            {c.note && <span style={{ color: C.dim }}> — {c.note}</span>}
            {(c.photos || []).length > 0 && <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6 }}>{c.photos.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 11, color: C.accent }}>📷{i + 1}</a>)}</span>}
          </div>
        ))}
      </div>
      {l.detail?.facts && FACTS.some(([k]) => l.detail.facts[k]?.v) && (
        <div style={{ fontSize: 12.5, color: C.dim }}><b style={{ color: C.text }}>Site:</b> {FACTS.filter(([k]) => l.detail.facts[k]?.v).map(([k, label, opts]) => `${label} ${((opts.find(o => o[0] === l.detail.facts[k].v) || [])[1] || '').toLowerCase()}${l.detail.facts[k].note ? ` (${l.detail.facts[k].note})` : ''}`).join(' · ')}{l.detail.facts.other ? ` · ${l.detail.facts.other}` : ''}</div>
      )}
      {l.detail?.follow_up?.needed && <div style={{ fontSize: 12.5 }}><b>Follow-up:</b> <span style={{ color: C.dim }}>{l.detail.follow_up.what || 'needed'}</span></div>}
      {(l.retain || []).length > 0 && <div style={{ fontSize: 12.5, color: C.dim }}><b style={{ color: C.text }}>{l.detail ? 'Not to retain:' : 'Furniture:'}</b> {l.retain.map(x => l.detail ? `${x.item}${x.note ? ` (${x.note})` : ''}` : `${x.item} (${x.keep ? 'keep' : 'replace'})`).join(', ')}</div>}
      {l.landlord_note && <div style={{ fontSize: 13 }}><b>Landlord:</b> <span style={{ color: C.dim }}>{l.landlord_note}</span></div>}
      {l.notes && !l.detail && <div style={{ fontSize: 13, color: C.dim, whiteSpace: 'pre-wrap' }}>{l.notes}</div>}
      {l.detail?.internal && <div style={{ fontSize: 12.5 }}><b>Internal:</b> <span style={{ color: C.dim }}>{l.detail.internal}</span></div>}
      <CopyButton text={stageCopy(r, l, l.author)} />
    </section>
  )
}

function CopyButton({ text, label = 'Copy for Stage', onDone }) {
  const [done, setDone] = useState(false)
  return <button style={{ ...btn(done ? '' : 'primary'), justifySelf: 'start' }} onClick={async () => { if (await copyText(text)) { setDone(true); onDone && onDone(); setTimeout(() => setDone(false), 2500) } }}>{done ? '✓ Copied' : label}</button>
}

function PasteBar({ r, log, onCopied, onOpenLog }) {
  if (!log) return null
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 8, background: SOFT.amber, border: '1px solid rgba(200,150,62,0.35)' }}>
      <span style={{ flex: '1 1 260px', fontSize: 13 }}><b>Paste the findings into Stage</b> — Pulse ticks this off by itself once the next sync sees them there.</span>
      {log.detail
        ? <button style={btn('primary')} onClick={onOpenLog}>Fill Stage field by field ›</button>
        : <CopyButton text={stageCopy(r, log, log.author)} onDone={onCopied} />}
    </div>
  )
}

function NudgeSupply({ r, log, onDone }) {
  const text = `Hi — ${r.property_name || 'the property'}${r.configuration ? ` (${r.configuration})` : ''} was visited ${slotText(r.visit_date)}${log ? ` by ${first(log.author)}, verdict ${VERDICT[log.verdict]?.[0]}` : ''}. The findings are in Stage — could you share the decision so we can plan next steps?`
  return <CopyButton text={text} label="✎ Copy a nudge for supply" onDone={onDone} />
}
