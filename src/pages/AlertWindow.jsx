import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import AppHeader from '../components/AppHeader'
import { ScopeToggle } from '../components/home/JourneyPanels'

// The alert window. Deliberately uncomfortable: only things going WRONG, never
// things merely happening, and never mixed with the normal queue. This is what
// a supervisor opens first.
//
// Everything is alert_window(scope), computed live from the journey engine —
// nothing here is stored, so it cannot be stale. Five categories, worst first,
// counts in every heading, every row tapping straight to the place it is fixed.

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'
const RED = 'var(--red, #e05c6a)'

// Worst category first. A missed handover is a landlord standing outside a flat.
const CATEGORIES = [
  { key: 'handover_overdue',    label: 'Handover overdue',       hint: 'T-Day passed, nobody recorded the keys going over' },
  { key: 'disputed_twice',      label: 'Disputed twice',         hint: 'the vendor has been sent back to the same item at least twice' },
  { key: 'scheduled_no_vendor', label: 'Scheduled, no vendor',   hint: 'a date is set and nobody is coming' },
  { key: 'past_sla',            label: 'Past SLA',               hint: 'setup-ops steps older than their threshold' },
  { key: 'estimate_silent',     label: 'Landlord silent',        hint: 'estimate in their hands with no decision for over a week' },
]
const SEV_RANK = { critical: 0, high: 1, medium: 2 }

function useAlerts(scope) {
  const [state, setState] = useState({ loading: true, error: null, rows: null })
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase.rpc('alert_window', { p_scope: scope })
    if (error) { setState(s => ({ ...s, loading: false, error: error.message })); return }
    setState({ loading: false, error: null, rows: data || [] })
  }, [scope])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

function Sev({ s }) {
  const solid = s === 'critical'
  const color = s === 'medium' ? 'var(--amber, #c8963e)' : RED
  return (
    <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                   background: solid ? color : 'transparent', color: solid ? '#fff' : color, border: `1px solid ${color}` }}>
      {s}
    </span>
  )
}

function Row({ r, onGo, last }) {
  const age = r.overdue_by != null && r.overdue_by > 0
    ? `${r.age_days}d · over by ${r.overdue_by}`
    : `${r.age_days}d`
  return (
    <button type="button" onClick={onGo} disabled={!r.route}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 50, padding: '8px 12px', textAlign: 'left',
               background: 'none', border: 'none', borderBottom: last ? 'none' : '1px solid var(--border, #2e3040)', cursor: r.route ? 'pointer' : 'default',
               color: 'var(--text, #e8e8f0)', fontFamily: SANS, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
      <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: r.severity === 'medium' ? 'var(--amber, #c8963e)' : RED, opacity: r.severity === 'critical' ? 1 : 0.55, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: 'var(--accent, #c8963e)', flexShrink: 0 }}>{r.pid}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.property_name}</span>
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: RED, flexShrink: 0 }}>{age}</span>
        </span>
        <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.3, marginTop: 2, wordBreak: 'break-word' }}>{r.headline}</span>
        {r.detail && <span style={{ display: 'block', fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{r.detail}</span>}
      </span>
      <Sev s={r.severity} />
      {r.route && <span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 18, flexShrink: 0 }}>›</span>}
    </button>
  )
}

export default function AlertWindow() {
  const navigate = useNavigate()
  const phone = useIsMobile(640)
  // one Mine/Team setting across Home, Alerts and the digest
  const [team, setTeam] = useState(() => { try { return localStorage.getItem('home2.team') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('home2.team', team ? '1' : '0') } catch { /* private window */ } }, [team])
  const { loading, error, rows, reload } = useAlerts(team ? 'all' : 'me')

  const groups = useMemo(() => {
    if (!rows) return null
    const by = new Map(CATEGORIES.map(c => [c.key, []]))
    const stray = []
    for (const r of rows) (by.get(r.category) || stray).push(r)
    const sort = (a, b) => (SEV_RANK[a.severity] - SEV_RANK[b.severity]) || (b.age_days - a.age_days) || a.pid.localeCompare(b.pid)
    for (const list of by.values()) list.sort(sort)
    stray.sort(sort)
    return { by, stray, critical: rows.filter(r => r.severity === 'critical').length, properties: new Set(rows.map(r => r.pid)).size }
  }, [rows])

  const total = rows?.length ?? 0
  const nothing = rows && total === 0

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>
      <AppHeader accent={nothing ? 'var(--green, #3dba7a)' : RED} below={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 24px', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
          <style>{`
            .aw-grid { display: grid; grid-template-columns: 1fr; gap: 20px; align-items: start; }
            @media (min-width: 1100px) { .aw-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
            @media (min-width: 1700px) { .aw-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
          `}</style>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: nothing ? 'var(--green, #3dba7a)' : RED, fontFamily: MONO }}>Alert window</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>what is going wrong, not what is merely happening</span>
          <div style={{ marginLeft: 'auto' }}><ScopeToggle team={team} setTeam={setTeam} /></div>
        </div>
      } />

      <main style={{ width: '100%', boxSizing: 'border-box', padding: phone ? '16px 16px calc(32px + env(safe-area-inset-bottom, 0px))' : '18px 24px 48px' }}>

        {/* the number, big and red, before anything else */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: phone ? 34 : 44, fontWeight: 700, lineHeight: 1, fontFamily: MONO, color: nothing ? 'var(--green, #3dba7a)' : RED, minWidth: 40 }}>
            {loading && !rows ? '…' : error ? '—' : total}
          </span>
          <span style={{ fontSize: 13.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, lineHeight: 1.4 }}>
            {loading && !rows ? 'Reading the portfolio…'
              : error ? ' '
              : nothing ? (team ? 'across the team' : 'on your properties')
              : <>going wrong {team ? 'across the team' : 'on your properties'} · <b style={{ color: RED }}>{groups.critical}</b> critical · {groups.properties} propert{groups.properties === 1 ? 'y' : 'ies'}</>}
          </span>
        </div>

        {/* category chips — a jump list and a summary in one */}
        {groups && total > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            {CATEGORIES.filter(c => groups.by.get(c.key).length > 0).map(c => (
              <button key={c.key} type="button" onClick={() => document.getElementById(`aw-${c.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                style={{ minHeight: 32, padding: '0 10px', borderRadius: 16, border: `1px solid ${RED}`, background: 'rgba(224,92,106,0.10)', color: RED, fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                {c.label} · {groups.by.get(c.key).length}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(224,92,106,0.32)', background: 'rgba(224,92,106,0.10)', fontFamily: MONO, fontSize: 12, color: RED, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}>Couldn't read the alert window — {error}</span>
            <button type="button" onClick={reload} style={{ minHeight: 34, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {loading && !rows && (
          <div aria-busy="true" style={{ marginTop: 22, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{ padding: 12, borderBottom: i < 4 ? '1px solid var(--border, #2e3040)' : 'none' }}>
                <div style={{ height: 9, width: 110, borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.7 }} />
                <div style={{ height: 12, width: '55%', borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.5, marginTop: 8 }} />
              </div>
            ))}
          </div>
        )}

        {nothing && !error && (
          <div style={{ marginTop: 26, padding: '28px 18px', borderRadius: 12, border: '1px solid var(--green, #3dba7a)', background: 'rgba(61,186,122,0.08)', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--green, #3dba7a)' }}>Nothing is going wrong.</div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', marginTop: 6 }}>
              No SLA breached, no double disputes, no silent landlord, nothing scheduled without a vendor, no missed handover.
            </div>
          </div>
        )}

        <div className="aw-grid">
        {groups && CATEGORIES.map(c => {
          const list = groups.by.get(c.key)
          if (list.length === 0) return null
          return (
            <section key={c.key} id={`aw-${c.key}`} style={{ marginTop: 24, scrollMarginTop: 72 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: RED, fontFamily: MONO }}>{c.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: RED }}>{list.length}</span>
                {!phone && <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginLeft: 'auto', textAlign: 'right' }}>{c.hint}</span>}
              </div>
              <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid rgba(224,92,106,0.35)', borderRadius: 12, overflow: 'hidden' }}>
                {list.map((r, i) => <Row key={`${r.category}:${r.pid}:${r.headline}:${i}`} r={r} onGo={() => r.route && navigate(r.route)} last={i === list.length - 1} />)}
              </div>
            </section>
          )
        })}

        </div>

        {/* silence is a defect: a category the client does not know still shows */}
        {groups && groups.stray.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--amber, #c8963e)', fontFamily: MONO, marginBottom: 8 }}>
              Unclassified · {groups.stray.length}
            </div>
            <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
              {groups.stray.map((r, i) => <Row key={`${r.category}:${r.pid}:${i}`} r={{ ...r, headline: `${r.category}: ${r.headline}` }} onGo={() => r.route && navigate(r.route)} last={i === groups.stray.length - 1} />)}
            </div>
          </section>
        )}

        <div style={{ marginTop: 32, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textAlign: 'center' }}>
          Computed live from the journey engine · nothing here is stored ·{' '}
          <button type="button" onClick={() => navigate('/digest')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>your day</button>
        </div>
      </main>
    </div>
  )
}
