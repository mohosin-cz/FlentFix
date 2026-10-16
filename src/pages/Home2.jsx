import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { CommandTrigger } from '../components/command/CommandTrigger'
import { NotificationBell } from '../components/alerts/NotificationBell'

// Home, organised around what to do next rather than what exists.
//
// Everything on this screen comes from property_journey_state(scope). There is
// no stage logic here: a row says what it is, who it waits on, how long, and
// the exact route that does the next thing. The client only sorts and groups.
//
//   greeting      · the day's shape in one line of words
//   NEEDS YOU     · setup-ops threads, urgency then age — the screen
//   TODAY         · execution days and T-Days dated today
//   WAITING       · landlord and vendor lanes, ages showing, not actionable
//   RECENTLY MOVED· threads that began after this person last looked

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'

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

const DAY = 86400000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// "3 days" · "since Tuesday" · "yesterday" · "today". Human, not ISO.
function ago(since, ageDays) {
  if (ageDays == null) return ''
  if (ageDays === 0) return 'today'
  if (ageDays === 1) return 'yesterday'
  if (ageDays < 7 && since) return `since ${WEEKDAYS[new Date(since).getDay()]}`
  if (ageDays < 30) return `${ageDays} days`
  if (ageDays < 60) return 'over a month'
  return `${Math.round(ageDays / 30)} months`
}

function overdueBy(thread, thresholds) {
  const key = LIMIT_KEY[thread.code]
  const limit = key && thresholds ? Number(thresholds[key]) : null
  if (!limit || thread.age_days == null) return null
  return Math.max(1, thread.age_days - limit)
}

function greetingWord() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

const URGENCY_RANK = { overdue: 0, today: 1, soon: 2, waiting: 3, done: 4 }

// ─── data ────────────────────────────────────────────────────────────────────

function useHome(scope) {
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
    setState({
      loading: false, error: null,
      rows: rows.data || [], counts: counts.data || {},
      // home_touch failing is not worth a red strip; the list just falls back to 24h
      seen: seen.error ? null : seen.data,
      thresholds: thr.data || {},
    })
  }, [scope])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// ─── pieces ──────────────────────────────────────────────────────────────────

function Section({ label, count, hint, children }) {
  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{label}</span>
        {count != null && <span style={{ fontSize: 10.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{count}</span>}
        {hint && <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginLeft: 'auto', textAlign: 'right' }}>{hint}</span>}
      </div>
      {children}
    </section>
  )
}

const panel = { background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }

function Row({ pid, name, title, meta, tone, onGo, last, badge }) {
  // Whole row is the target — 56px tall, one thumb.
  return (
    <button type="button" onClick={onGo} disabled={!onGo}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '10px 14px', textAlign: 'left',
               background: 'none', border: 'none', borderBottom: last ? 'none' : '1px solid var(--border, #2e3040)', cursor: onGo ? 'pointer' : 'default',
               color: 'var(--text, #e8e8f0)', fontFamily: SANS, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
          <span style={{ fontSize: 12, fontFamily: MONO, color: 'var(--accent, #c8963e)', flexShrink: 0 }}>{pid}</span>
          <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        </div>
        <div style={{ fontSize: 14, marginTop: 2, lineHeight: 1.35, wordBreak: 'break-word' }}>{title}</div>
        {meta && <div style={{ fontSize: 11, fontFamily: MONO, color: tone || 'var(--text-muted, #6b6d82)', marginTop: 3 }}>{meta}</div>}
      </div>
      {badge}
      {onGo && <span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 18, flexShrink: 0 }}>›</span>}
    </button>
  )
}

function Skeleton({ n = 3 }) {
  return (
    <div style={panel} aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ padding: '14px', borderBottom: i < n - 1 ? '1px solid var(--border, #2e3040)' : 'none' }}>
          <div style={{ height: 10, width: 120, borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.7 }} />
          <div style={{ height: 13, width: '60%', borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.5, marginTop: 8 }} />
        </div>
      ))}
    </div>
  )
}

function Empty({ children }) {
  return <div style={{ ...panel, padding: '16px 14px', fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 }}>{children}</div>
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function Home2() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const phone = useIsMobile(640)
  const email = session?.user?.email ?? ''
  const name = session?.user?.user_metadata?.full_name?.split(' ')[0] ?? email.split('@')[0]

  const [team, setTeam] = useState(() => { try { return localStorage.getItem('home2.team') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('home2.team', team ? '1' : '0') } catch { /* private window */ } }, [team])
  const { loading, error, rows, counts, seen, thresholds, reload } = useHome(team ? 'all' : 'me')

  const go = (route) => route && navigate(route)

  // ── derive the five groups from the rows; no stage rules live here ──
  const groups = useMemo(() => {
    if (!rows) return null
    const needs = rows
      .filter(r => r.blocked_on === 'setup_ops' && r.urgency !== 'done')
      .sort((a, b) => (URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]) || (b.age_days - a.age_days))

    const today = []
    const landlord = []
    const vendor = []
    const moved = []
    // baseline for "recently": the previous visit, or the last 24h on a first visit
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
  }, [rows, seen])

  const overdueN = counts?.overdue ?? 0
  const needsN = groups?.needs.length ?? 0
  const waitingN = (groups?.landlord.length ?? 0) + (groups?.vendor.length ?? 0)

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>
      {/* ── header ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, minHeight: 56,
                       padding: '0 16px', paddingTop: 'env(safe-area-inset-top, 0px)',
                       background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        <button type="button" onClick={() => navigate('/')} title="Classic home"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 14, fontWeight: 700, color: 'var(--accent, #c8963e)', letterSpacing: '0.04em' }}>
          pulse
        </button>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>home · beta</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {!phone && <CommandTrigger />}
          <NotificationBell />
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 2 }}>
          {[['me', 'Mine'], ['all', 'Team']].map(([k, l]) => {
            const on = team ? k === 'all' : k === 'me'
            return (
              <button key={k} type="button" onClick={() => setTeam(k === 'all')} aria-pressed={on}
                style={{ minHeight: 34, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
                         background: on ? 'var(--accent, #c8963e)' : 'transparent', color: on ? 'var(--on-accent, #16171f)' : 'var(--text-dim, #9394a8)',
                         WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
                {l}
              </button>
            )
          })}
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: phone ? '18px 16px calc(32px + env(safe-area-inset-bottom, 0px))' : '26px 24px 48px' }}>

        {/* ── greeting: the day's shape in words ── */}
        <div style={{ fontSize: phone ? 20 : 24, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {greetingWord()}, {name}.
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-dim, #9394a8)', marginTop: 6, fontFamily: MONO, minHeight: 20 }}>
          {loading && !rows ? 'Reading the portfolio…'
            : error ? ' '
            : rows.length === 0 ? (team ? 'No live properties.' : 'Nothing is assigned to you.')
            : <>
                <b style={{ color: 'var(--text, #e8e8f0)' }}>{needsN}</b> need you
                {' · '}<b style={{ color: 'var(--text, #e8e8f0)' }}>{waitingN}</b> waiting on others
                {overdueN > 0 && <> · <b style={{ color: 'var(--red, #e05c6a)' }}>{overdueN}</b> overdue</>}
                {counts?.unowned > 0 && team && <> · <span style={{ color: 'var(--amber, #c8963e)' }}>{counts.unowned} unowned</span></>}
              </>}
        </div>

        {error && (
          <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(224,92,106,0.32)', background: 'rgba(224,92,106,0.10)', fontFamily: MONO, fontSize: 12, color: 'var(--red, #e05c6a)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}>Couldn't read the portfolio — {error}</span>
            <button type="button" onClick={reload} style={{ minHeight: 34, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {/* ── NEEDS YOU ── */}
        <Section label="Needs you" count={groups ? groups.needs.length : null}>
          {loading && !rows ? <Skeleton n={4} />
            : !groups ? null
            : groups.needs.length === 0 ? <Empty>Nothing waiting on you{team ? ' or the team' : ''}. {waitingN > 0 ? 'Everything open is with a landlord or a vendor.' : ''}</Empty>
            : (
              <div style={panel}>
                {groups.needs.map((r, i) => {
                  // headline rows carry stage_code; threads carry code
                  const od = r.urgency === 'overdue' ? overdueBy({ code: r.stage_code, age_days: r.age_days }, thresholds) : null
                  return (
                    <Row key={r.pid} pid={r.pid} name={r.property_name} title={r.next_action_label}
                      meta={`${r.stage_label} · ${od ? `overdue by ${od}` : ago(r.since, r.age_days)}`}
                      tone={r.urgency === 'overdue' ? 'var(--red, #e05c6a)' : undefined}
                      onGo={() => go(r.next_action_route)} last={i === groups.needs.length - 1} />
                  )
                })}
              </div>
            )}
        </Section>

        {/* ── TODAY ── */}
        <Section label="Today" count={groups ? groups.today.length : null}>
          {loading && !rows ? <Skeleton n={1} />
            : !groups ? null
            : groups.today.length === 0 ? <Empty>No execution days or handovers scheduled today.</Empty>
            : (
              <div style={panel}>
                {groups.today.map((t, i) => (
                  <Row key={t.pid + t.code} pid={t.pid} name={t.name} title={t.label} meta={t.next_action_label}
                    onGo={() => go(t.next_action_route)} last={i === groups.today.length - 1} />
                ))}
              </div>
            )}
        </Section>

        {/* ── WAITING ON OTHERS ── */}
        <Section label="Waiting on others" count={groups ? waitingN : null} hint="not yours to do · ages showing">
          {loading && !rows ? <Skeleton n={2} />
            : !groups ? null
            : waitingN === 0 ? <Empty>Nobody is holding anything up.</Empty>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 12 }}>
                {[['Landlords', groups.landlord], ['Vendors', groups.vendor]].map(([lane, items]) => (
                  <div key={lane} style={panel}>
                    <div style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, borderBottom: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)' }}>
                      {lane} · {items.length}
                    </div>
                    {items.length === 0
                      ? <div style={{ padding: '14px', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>none</div>
                      : items.map((t, i) => {
                          const od = t.urgency === 'overdue' ? overdueBy(t, thresholds) : null
                          return (
                            <Row key={t.pid + t.code} pid={t.pid} name={t.name} title={t.label}
                              meta={od ? `overdue by ${od} · ${t.next_action_label}` : ago(t.since, t.age_days)}
                              tone={od ? 'var(--red, #e05c6a)' : undefined}
                              onGo={() => go(t.next_action_route)} last={i === items.length - 1} />
                          )
                        })}
                  </div>
                ))}
              </div>
            )}
        </Section>

        {/* ── RECENTLY MOVED ── */}
        <Section label="Recently moved" count={groups ? groups.moved.length : null}
          hint={groups ? (groups.firstVisit ? 'first visit · last 24 hours' : `since ${groups.baseline.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`) : null}>
          {loading && !rows ? <Skeleton n={2} />
            : !groups ? null
            : groups.moved.length === 0 ? <Empty>Nothing crossed a stage since you last looked.</Empty>
            : (
              <div style={panel}>
                {groups.moved.map((t, i) => (
                  <Row key={t.pid + t.code} pid={t.pid} name={t.name} title={`→ ${t.label}`}
                    meta={`${t.blocked_on === 'setup_ops' ? 'with you' : 'with ' + t.blocked_on} · ${ago(t.since, t.age_days)}`}
                    onGo={() => go(t.next_action_route)} last={i === groups.moved.length - 1} />
                ))}
              </div>
            )}
        </Section>

        <div style={{ marginTop: 32, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textAlign: 'center' }}>
          Everything here is derived live from the portfolio · <button type="button" onClick={() => navigate('/')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>classic home</button>
        </div>
      </main>
    </div>
  )
}
