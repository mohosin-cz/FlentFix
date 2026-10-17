import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DraftMessageButton } from '../comms/DraftMessage'

// The journey engine on Home, as panels in Home's own idiom (mono lowercase
// panel titles, --bg-panel cards, the 1fr/380px grid). No stage logic lives
// here: every row says what it is, who it waits on, how long, and the exact
// route that does the next thing. The client sorts and groups.

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'
const DAY = 86400000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const URGENCY_RANK = { overdue: 0, today: 1, soon: 2, waiting: 3, done: 4 }

// Which threshold each stage's "overdue by N" counts against — the same keys
// journey_thresholds() publishes, so Home and the engine never disagree.
const LIMIT_KEY = {
  onboarded: 'onboarded_days', inspection_in_progress: 'inspection_draft_days',
  estimate_not_created: 'estimate_not_created_days', estimate_draft: 'estimate_draft_days',
  estimate_sent: 'estimate_unopened_days', estimate_viewed: 'landlord_silent_days',
  landlord_queried: 'query_reply_days', landlord_partially_decided: 'landlord_silent_days',
  work_order_pending: 'work_order_pending_days', wo_unassigned: 'wo_unassigned_days',
  wo_unscheduled: 'wo_unscheduled_days', qc_pending: 'qc_pending_days', disputed: 'dispute_days',
  handover_unknown: 'handover_unknown_days', invoice_draft: 'invoice_draft_days',
}

// "3 days" · "since Tuesday" · "yesterday" · "today". Human, not ISO.
export function ago(since, ageDays) {
  if (ageDays == null) return ''
  if (ageDays === 0) return 'today'
  if (ageDays === 1) return 'yesterday'
  if (ageDays < 7 && since) return `since ${WEEKDAYS[new Date(since).getDay()]}`
  if (ageDays < 30) return `${ageDays} days`
  if (ageDays < 60) return 'over a month'
  return `${Math.round(ageDays / 30)} months`
}

function overdueBy(code, ageDays, thresholds) {
  const key = LIMIT_KEY[code]
  const limit = key && thresholds ? Number(thresholds[key]) : null
  if (!limit || ageDays == null) return null
  return Math.max(1, ageDays - limit)
}

export function greetingWord() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// One scope for Home, Alerts and the digest: Mine or Team, remembered per device.
export function useScope() {
  const [team, setTeam] = useState(() => { try { return localStorage.getItem('home2.team') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('home2.team', team ? '1' : '0') } catch { /* private window */ } }, [team])
  return [team, setTeam]
}

export function ScopeToggle({ team, setTeam }) {
  return (
    <div role="group" aria-label="Scope" style={{ display: 'flex', gap: 2, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 2 }}>
      {[['me', 'Mine'], ['all', 'Team']].map(([k, l]) => {
        const on = team ? k === 'all' : k === 'me'
        return (
          <button key={k} type="button" onClick={() => setTeam(k === 'all')} aria-pressed={on}
            style={{ minHeight: 32, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
                     background: on ? 'var(--accent, #c8963e)' : 'transparent', color: on ? 'var(--on-accent, #16171f)' : 'var(--text-dim, #9394a8)',
                     WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
            {l}
          </button>
        )
      })}
    </div>
  )
}

// ─── data ────────────────────────────────────────────────────────────────────

export function useJourneyHome(scope) {
  const [state, setState] = useState({ loading: true, error: null, rows: null, counts: null, seen: null, thresholds: null })
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const [rows, counts, seen, thr] = await Promise.all([
      supabase.rpc('property_journey_state', { p_scope: scope }),
      supabase.rpc('property_journey_counts', { p_scope: scope }),
      supabase.rpc('home_touch'),
      supabase.rpc('journey_thresholds'),
    ])
    const err = rows.error || counts.error || thr.error
    if (err) { setState(s => ({ ...s, loading: false, error: err.message })); return }
    const props = rows.data || []
    setState({
      loading: false, error: null,
      rows: props, counts: counts.data || {},
      seen: seen.error ? null : seen.data,   // falls back to 24h; not worth a red strip
      thresholds: thr.data || {},
    })
    // Prospects (exploratory requests from Stage) arrive after, so Home never
    // waits on them; a failure just leaves them out.
    const prospects = await supabase.rpc('explore_journey_state')
    if (!prospects.error && (prospects.data || []).length) setState(s => s.rows === props ? { ...s, rows: [...props, ...prospects.data] } : s)
  }, [scope])
  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const { rows, seen } = state
    if (!rows) return null
    const needs = rows
      .filter(r => r.blocked_on === 'setup_ops' && r.urgency !== 'done')
      .sort((a, b) => (URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]) || (b.age_days - a.age_days))
    const today = [], landlord = [], vendor = [], moved = []
    const prev = seen?.prev_seen_at ? new Date(seen.prev_seen_at) : null
    const baseline = prev || new Date(Date.now() - DAY)
    for (const r of rows) {
      for (const t of r.open_threads || []) {
        const item = { ...t, pid: r.pid, name: r.property_name }
        if (t.code === 'execution_day' || t.code === 'handover_today') today.push(item)
        if (t.blocked_on === 'landlord' && t.urgency !== 'done') landlord.push(item)
        if (t.blocked_on === 'vendor' && t.urgency !== 'done') vendor.push(item)
        if (t.since && new Date(t.since) > baseline && t.urgency !== 'done') moved.push(item)
      }
    }
    const byAge = (a, b) => (URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]) || (b.age_days - a.age_days)
    landlord.sort(byAge); vendor.sort(byAge)
    moved.sort((a, b) => new Date(b.since) - new Date(a.since))
    return { needs, today, landlord, vendor, moved, baseline, firstVisit: !prev }
  }, [state])

  return { ...state, groups, reload: load }
}

// ─── pieces, in Home's idiom ─────────────────────────────────────────────────

const P = {
  panel: { background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: 16 },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  title: { fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' },
  hint: { fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textAlign: 'right' },
  empty: { padding: '14px 4px', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 },
  list: { display: 'flex', flexDirection: 'column' },
}

function Panel({ title, count, hint, children, style }) {
  return (
    <section style={{ ...P.panel, ...style }}>
      <div style={P.head}>
        <span style={P.title}>{title}{count != null ? <span style={{ color: 'var(--text-dim, #9394a8)', marginLeft: 8 }}>{count}</span> : null}</span>
        {hint && <span style={P.hint}>{hint}</span>}
      </div>
      {children}
    </section>
  )
}

export function Row({ pid, name, title, meta, tone, onGo, last, aside }) {
  // The text is the target. `aside` is its own control beside it.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: last ? 'none' : '1px solid var(--border, #2e3040)' }}>
      <button type="button" onClick={onGo} disabled={!onGo}
        style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, minHeight: 52, padding: '9px 6px', textAlign: 'left',
                 background: 'none', border: 'none', cursor: onGo ? 'pointer' : 'default',
                 color: 'var(--text, #e8e8f0)', fontFamily: SANS, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
            <span style={{ fontSize: 11.5, fontFamily: MONO, color: 'var(--accent, #c8963e)', flexShrink: 0 }}>{pid}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          </div>
          <div style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.35, wordBreak: 'break-word' }}>{title}</div>
          {meta && <div style={{ fontSize: 10.5, fontFamily: MONO, color: tone || 'var(--text-muted, #6b6d82)', marginTop: 3 }}>{meta}</div>}
        </div>
        {onGo && <span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 18, flexShrink: 0 }}>›</span>}
      </button>
      {aside}
    </div>
  )
}

function Skeleton({ n = 3 }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ padding: '12px 4px', borderBottom: i < n - 1 ? '1px solid var(--border, #2e3040)' : 'none' }}>
          <div style={{ height: 10, width: 120, borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.7 }} />
          <div style={{ height: 12, width: '60%', borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.5, marginTop: 8 }} />
        </div>
      ))}
    </div>
  )
}

function ErrStrip({ error, onRetry }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.07)' }}>
      <span style={{ fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Couldn't read the portfolio — {error}</span>
      <button onClick={onRetry} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(224,92,106,0.4)', background: 'transparent', color: 'var(--red, #e05c6a)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: MONO, flexShrink: 0 }}>Retry</button>
    </div>
  )
}

// The day's shape in words. One line; not a stat grid.
export function Greeting({ name, home, team }) {
  const { loading, error, rows, counts, groups } = home
  const needsN = groups?.needs.length ?? 0
  const waitingN = (groups?.landlord.length ?? 0) + (groups?.vendor.length ?? 0)
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.01em', fontFamily: SANS }}>{greetingWord()}, {name}.</div>
      <div style={{ fontSize: 13, color: 'var(--text-dim, #9394a8)', marginTop: 4, fontFamily: MONO, minHeight: 18 }}>
        {loading && !rows ? 'Reading the portfolio…'
          : error ? ' '
          : rows.length === 0 ? (team ? 'No live properties.' : 'Nothing is assigned to you.')
          : <>
              <b style={{ color: 'var(--text, #e8e8f0)' }}>{needsN}</b> need you
              {' · '}<b style={{ color: 'var(--text, #e8e8f0)' }}>{waitingN}</b> waiting on others
              {counts?.overdue > 0 && <> · <b style={{ color: 'var(--red, #e05c6a)' }}>{counts.overdue}</b> overdue</>}
              {counts?.unowned > 0 && team && <> · <span style={{ color: 'var(--amber, #c8963e)' }}>{counts.unowned} unowned</span></>}
            </>}
      </div>
    </div>
  )
}

export function NeedsYouPanel({ home, team }) {
  const navigate = useNavigate()
  const { loading, error, rows, groups, thresholds, reload } = home
  const waitingN = (groups?.landlord.length ?? 0) + (groups?.vendor.length ?? 0)
  return (
    <Panel title="needs_you" count={groups?.needs.length}>
      {loading && !rows ? <Skeleton n={4} />
        : error ? <ErrStrip error={error} onRetry={reload} />
        : !groups ? null
        : groups.needs.length === 0 ? <div style={P.empty}>Nothing waiting on you{team ? ' or the team' : ''}.{waitingN > 0 ? ' Everything open is with a landlord or a vendor.' : ''}</div>
        : (
          <div style={P.list}>
            {groups.needs.map((r, i) => {
              const od = r.urgency === 'overdue' ? overdueBy(r.stage_code, r.age_days, thresholds) : null
              return (
                <Row key={r.pid} pid={r.pid} name={r.property_name} title={r.next_action_label}
                  meta={`${r.stage_label} · ${od ? `overdue by ${od}` : ago(r.since, r.age_days)}`}
                  tone={r.urgency === 'overdue' ? 'var(--red, #e05c6a)' : undefined}
                  onGo={() => r.next_action_route && navigate(r.next_action_route)} last={i === groups.needs.length - 1}
                  aside={<DraftMessageButton pid={r.pid} code={r.stage_code} compact />} />
              )
            })}
          </div>
        )}
    </Panel>
  )
}

export function TodayPanel({ home }) {
  const navigate = useNavigate()
  const { loading, rows, groups } = home
  return (
    <Panel title="today" count={groups?.today.length}>
      {loading && !rows ? <Skeleton n={1} />
        : !groups ? null
        : groups.today.length === 0 ? <div style={P.empty}>No execution days or handovers scheduled today.</div>
        : (
          <div style={P.list}>
            {groups.today.map((t, i) => (
              <Row key={t.pid + t.code} pid={t.pid} name={t.name} title={t.label} meta={t.next_action_label}
                onGo={() => t.next_action_route && navigate(t.next_action_route)} last={i === groups.today.length - 1} />
            ))}
          </div>
        )}
    </Panel>
  )
}

// Landlord and vendor lanes: deliberately present, deliberately not actionable.
export function WaitingPanel({ home }) {
  const navigate = useNavigate()
  const { loading, rows, groups, thresholds } = home
  const n = (groups?.landlord.length ?? 0) + (groups?.vendor.length ?? 0)
  return (
    <Panel title="waiting_on_others" count={groups ? n : null} hint="not yours to do">
      {loading && !rows ? <Skeleton n={2} />
        : !groups ? null
        : n === 0 ? <div style={P.empty}>Nobody is holding anything up.</div>
        : [['landlords', groups.landlord], ['vendors', groups.vendor]].map(([lane, items]) => (
            <div key={lane} style={{ marginTop: 6 }}>
              <div style={{ ...P.title, fontSize: 10, padding: '6px 0' }}>{lane} · {items.length}</div>
              {items.length === 0
                ? <div style={{ ...P.empty, padding: '6px 4px 10px' }}>none</div>
                : items.map((t, i) => {
                    const od = t.urgency === 'overdue' ? overdueBy(t.code, t.age_days, thresholds) : null
                    return (
                      <Row key={t.pid + t.code} pid={t.pid} name={t.name} title={t.label}
                        meta={od ? `overdue by ${od} · ${t.next_action_label}` : ago(t.since, t.age_days)}
                        tone={od ? 'var(--red, #e05c6a)' : undefined}
                        onGo={() => t.next_action_route && navigate(t.next_action_route)} last={i === items.length - 1}
                        aside={<DraftMessageButton pid={t.pid} code={t.code} compact />} />
                    )
                  })}
            </div>
          ))}
    </Panel>
  )
}

// The "landlord approved overnight" moment: what crossed a stage since this
// person last looked.
export function MovedPanel({ home }) {
  const navigate = useNavigate()
  const { loading, rows, groups } = home
  const hint = groups ? (groups.firstVisit ? 'first visit · last 24h' : `since ${groups.baseline.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`) : null
  return (
    <Panel title="recently_moved" count={groups?.moved.length} hint={hint}>
      {loading && !rows ? <Skeleton n={2} />
        : !groups ? null
        : groups.moved.length === 0 ? <div style={P.empty}>Nothing crossed a stage since you last looked.</div>
        : (
          <div style={P.list}>
            {groups.moved.map((t, i) => (
              <Row key={t.pid + t.code} pid={t.pid} name={t.name} title={`→ ${t.label}`}
                meta={`${t.blocked_on === 'setup_ops' ? 'with you' : 'with ' + t.blocked_on} · ${ago(t.since, t.age_days)}`}
                onGo={() => t.next_action_route && navigate(t.next_action_route)} last={i === groups.moved.length - 1} />
            ))}
          </div>
        )}
    </Panel>
  )
}
