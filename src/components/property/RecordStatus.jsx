import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { DraftMessageButton } from '../comms/DraftMessage'
import { ago } from '../home/JourneyPanels'

// Where this property stands, from the journey engine: the headline (stage,
// who it waits on, how long, the next action as one button) and every other
// open thread under it. The record page's equivalent of a ticket's status
// panel — the same answer Home gives, for one property.

const MONO = 'var(--font-mono, monospace)'
const WHO = { setup_ops: 'Flent', supply: 'supply', landlord: 'the landlord', vendor: 'the vendor', none: 'nobody' }
const dot = (u) => u === 'overdue' ? 'var(--red, #e05c6a)' : (u === 'today' || u === 'soon') ? 'var(--amber, #c8963e)' : u === 'done' ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)'

// The engine's row for one property. The page reads it once and hands it to
// both the stage rail and this card, so the two can never disagree.
export function usePropertyJourneyRow(pid) {
  const [state, setState] = useState({ loading: true, error: null, row: null })
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase.rpc('property_journey_state', { p_scope: 'all' })
    if (error) { setState({ loading: false, error: error.message, row: null }); return }
    const row = (data || []).find(r => String(r.pid) === String(pid)) || null
    // no row: say why — paused at the clean slate reads differently from archived
    let paused = false
    if (!row) {
      const { data: p } = await supabase.from('properties').select('journey_paused_at').eq('pid', pid).maybeSingle()
      paused = !!p?.journey_paused_at
    }
    setState({ loading: false, error: null, row, paused })
  }, [pid])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

export default function RecordStatus({ journey }) {
  const navigate = useNavigate()
  const { loading, error, row, paused, reload: load } = journey
  const box = { background: 'var(--bg-panel, #1e2028)', border: `1px solid ${row?.urgency === 'overdue' ? 'rgba(224,92,106,0.35)' : 'var(--border, #2e3040)'}`, borderRadius: 10, padding: 16 }
  const title = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }

  if (loading && !row) return (
    <section style={box} aria-busy="true">
      <div style={title}>status</div>
      <div style={{ height: 16, width: '70%', background: 'var(--border, #2e3040)', borderRadius: 4, marginTop: 14, opacity: 0.6 }} />
      <div style={{ height: 36, width: '100%', background: 'var(--border, #2e3040)', borderRadius: 8, marginTop: 14, opacity: 0.4 }} />
    </section>
  )
  if (error) return (
    <section style={box}>
      <div style={title}>status</div>
      <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 12, color: 'var(--red, #e05c6a)' }}>Couldn't read the journey — {error} <button onClick={load} style={{ marginLeft: 6, background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: MONO, fontSize: 11 }}>Retry</button></div>
    </section>
  )
  if (!row) return (
    <section style={box}>
      <div style={title}>status</div>
      <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5 }}>
        {paused ? 'Paused at the clean slate — no tasks or alerts. Tap “Resume journey” at the top to bring it back.' : 'Not in the live portfolio (archived, deleted, or a payments-only record).'}
      </div>
    </section>
  )

  const others = (row.open_threads || []).slice(1)
  return (
    <section style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={title}>status</span>
        <span style={{ fontSize: 10.5, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)' }}>owner · {(row.owner_email || 'unowned').split('@')[0]}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot(row.urgency), flexShrink: 0 }} />
        <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{row.stage_label}</span>
      </div>
      <div style={{ fontSize: 11.5, fontFamily: MONO, color: row.urgency === 'overdue' ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)', marginTop: 5 }}>
        Waiting on {WHO[row.waiting_on || row.blocked_on] || row.blocked_on} · {ago(row.since, row.age_days)}{row.urgency === 'overdue' ? ' · overdue' : ''}
        {row.days_to_setup != null && <> · setup {row.days_to_setup === 0 ? 'today' : row.days_to_setup > 0 ? `in ${row.days_to_setup}d` : `started ${-row.days_to_setup}d ago`}</>}
      </div>
      {row.open_threads?.[0]?.note && <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>{row.open_threads[0].note}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {row.next_action_route && (
          <button type="button" onClick={() => navigate(row.next_action_route)}
            style={{ flex: '1 1 auto', minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--accent, #c8963e)', background: 'rgba(200,150,62,0.12)', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
            {row.next_action_label} ›
          </button>
        )}
        <DraftMessageButton pid={row.pid} code={row.stage_code} compact />
      </div>

      {others.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ ...title, fontSize: 10 }}>also open · {others.length}</div>
          {others.map(t => (
            <div key={t.code} onClick={() => t.next_action_route && navigate(t.next_action_route)} className="rs-thread"
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 4px', borderTop: '1px solid var(--border, #2e3040)', cursor: t.next_action_route ? 'pointer' : 'default', borderRadius: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot(t.urgency), marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5 }}>{t.label}</div>
                <div style={{ fontSize: 10.5, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{WHO[t.waiting_on || t.blocked_on]} · {ago(t.since, t.age_days)} · {t.next_action_label}{t.note ? ` · ${t.note}` : ''}</div>
              </div>
            </div>
          ))}
          <style>{`.rs-thread:hover { background: var(--bg-input, #252731); }`}</style>
        </div>
      )}
    </section>
  )
}
