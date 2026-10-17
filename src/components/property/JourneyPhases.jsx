import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { DraftMessageButton } from '../comms/DraftMessage'

// Where this property is, and what happens next — without interpreting
// anything. The 24 journey steps (pulse-journey-prompt.md §1) collapse into
// six phases. The current phase is the one holding the earliest open step,
// straight from the engine; finished phases say when and by whom where a
// person marked the milestone that ends them. Tap a phase to open the screen
// that owns it. NEXT is one line and one button.

const MONO = 'var(--font-mono, monospace)'

const PHASES = [
  { key: 'inspection', label: 'Inspection', from: 1,  to: 4,  route: p => `/properties/${p}/raw` },
  { key: 'estimate',   label: 'Estimate',   from: 5,  to: 8,  route: p => `/properties/${p}/estimates`, ends: 'estimate_final' },
  { key: 'planning',   label: 'Planning',   from: 9,  to: 12, route: p => `/properties/${p}/work-orders`, ends: 'setup_date' },
  { key: 'setup',      label: 'Setup',      from: 13, to: 17, route: p => `/properties/${p}/work-orders`, ends: 'setup_closed' },
  { key: 'closeout',   label: 'Close-out',  from: 18, to: 21, route: p => `/properties/${p}/payments`,    ends: 'handover_done' },
  { key: 'finish',     label: 'Finish',     from: 22, to: 24, route: p => `/properties/${p}`,             ends: 'closed' },
]
const WHO = { setup_ops: 'Flent', supply: 'supply', landlord: 'the landlord', vendor: 'vendors', none: 'nobody' }

const who = (e) => (e || '').split('@')[0] || 'someone'
function when(at) {
  if (!at) return ''
  const d = new Date(at), days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return d.toLocaleDateString('en-IN', { weekday: 'long' })
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function ago(days) {
  if (days == null) return ''
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  return days < 60 ? `${days} days` : `${Math.round(days / 30)} months`
}

export default function JourneyPhases({ pid, row }) {
  const navigate = useNavigate()
  const phone = useIsMobile(720)
  const [ms, setMs] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('property_milestones', { p_pid: pid }).then(({ data }) => { if (alive) setMs(data) })
    return () => { alive = false }
  }, [pid, row?.stage_code])

  if (!row) return null
  const threads = row.open_threads || []
  const open = threads.map(t => t.stage_no).filter(n => n > 0 && n < 25)
  const closed = row.stage_code === 'closed'
  const current = closed ? 25 : open.length ? Math.min(...open) : 0
  const curIdx = closed ? PHASES.length : PHASES.findIndex(p => current >= p.from && current <= p.to)
  const mark = (key) => ms?.milestones?.find(m => m.key === key)

  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', padding: phone ? '12px 16px' : '14px 24px' }}>
      {/* the phases */}
      <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(3, minmax(0, 1fr))' : `repeat(${PHASES.length}, minmax(0, 1fr))`, gap: 6 }}>
        {PHASES.map((p, i) => {
          const done = i < curIdx, now = i === curIdx
          const m = p.ends ? mark(p.ends) : null
          const sub = now ? (row.stage_label || '')
            : done ? (m?.done ? (p.ends === 'setup_date' && m.date ? `setup ${new Date(m.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : `${who(m.by)}, ${when(m.at)}`) : 'done')
            : ''
          return (
            <button key={p.key} type="button" onClick={() => navigate(p.route(pid))} title={`Open ${p.label.toLowerCase()}`}
              style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', minWidth: 0, fontFamily: 'inherit',
                       border: `1px solid ${now ? 'var(--accent, #c8963e)' : done ? 'rgba(61,186,122,0.30)' : 'var(--border, #2e3040)'}`,
                       background: now ? 'rgba(200,150,62,0.10)' : 'transparent', color: 'var(--text, #e8e8f0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--green, #3dba7a)' : now ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)' }} />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: MONO, color: now ? 'var(--accent, #c8963e)' : done ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }}>{p.label}</span>
              </div>
              <div style={{ fontSize: 11, color: now ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: now ? 'inherit' : MONO }}>{sub || ' '}</div>
            </button>
          )
        })}
      </div>

      {/* NEXT — one line, one button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: MONO, color: 'var(--text-muted, #6b6d82)' }}>Next</span>
        {closed ? (
          <span style={{ fontSize: 13.5, color: 'var(--green, #3dba7a)' }}>Nothing — the property is closed.</span>
        ) : (
          <>
            <span style={{ fontSize: 13.5, flex: '1 1 260px', minWidth: 0 }}>
              {row.waiting_on && row.waiting_on !== 'setup_ops'
                ? <>Waiting on <b>{WHO[row.waiting_on]}</b> · {row.stage_label} · {ago(row.age_days)}</>
                : <><b>{row.next_action_label}</b> · {row.stage_label}{row.urgency === 'overdue' && row.open_threads?.[0]?.overdue_by ? <span style={{ color: 'var(--red, #e05c6a)' }}> · overdue by {row.open_threads[0].overdue_by}d</span> : ''}</>}
              {row.days_to_setup != null && <span style={{ color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, fontSize: 12 }}> · setup {row.days_to_setup === 0 ? 'today' : row.days_to_setup > 0 ? `in ${row.days_to_setup}d` : `started ${-row.days_to_setup}d ago`}</span>}
            </span>
            {row.next_action_route && (
              <button type="button" onClick={() => navigate(row.next_action_route)}
                style={{ minHeight: 38, padding: '0 14px', borderRadius: 8, border: '1px solid var(--accent, #c8963e)', background: 'rgba(200,150,62,0.12)', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {row.next_action_label} ›
              </button>
            )}
            <DraftMessageButton pid={pid} code={row.stage_code} compact />
          </>
        )}
      </div>
    </div>
  )
}
