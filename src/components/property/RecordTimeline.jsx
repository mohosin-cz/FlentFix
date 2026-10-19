import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// The record's history: everything that happened to this property, newest
// first, from every module that already logs something (property_timeline).
// A CRM record page puts this down the middle; the filters are the kinds.

const MONO = 'var(--font-mono, monospace)'

const KINDS = {
  inspection: { label: 'Inspection', color: '#c8963e' },
  journey:    { label: 'Stage',      color: 'var(--text-dim, #9394a8)' },
  estimate:   { label: 'Estimate',   color: '#6b8de6' },
  landlord:   { label: 'Landlord',   color: '#4dd9c0' },
  work:       { label: 'Work',       color: '#a78bfa' },
  site:       { label: 'On site',    color: '#a78bfa' },
  payment:    { label: 'Payment',    color: 'var(--green, #6f9a7e)' },
  invoice:    { label: 'Invoice',    color: 'var(--green, #6f9a7e)' },
}

const dayKey = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const dayLabel = (d) => {
  const k = dayKey(d), today = dayKey(new Date()), yest = dayKey(new Date(Date.now() - 86400000))
  if (k === today) return 'Today'
  if (k === yest) return 'Yesterday'
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
const timeOf = (d) => {
  const t = new Date(d)
  // payments carry a date only; midnight UTC means "no time recorded"
  if (t.getUTCHours() === 0 && t.getUTCMinutes() === 0 && t.getUTCSeconds() === 0) return ''
  return t.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

export default function RecordTimeline({ pid }) {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: null, rows: null })
  const [kind, setKind] = useState('all')
  const [limit, setLimit] = useState(60)

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase.rpc('property_timeline', { p_pid: pid, p_limit: 1000 })
    if (error) { setState({ loading: false, error: error.message, rows: null }); return }
    setState({ loading: false, error: null, rows: data || [] })
  }, [pid])
  useEffect(() => { load() }, [load])

  const { loading, error, rows } = state
  const counts = useMemo(() => {
    const c = { all: rows?.length ?? 0 }
    for (const r of rows || []) c[r.kind] = (c[r.kind] || 0) + 1
    return c
  }, [rows])
  const shown = useMemo(() => (rows || []).filter(r => kind === 'all' || r.kind === kind), [rows, kind])
  const days = useMemo(() => {
    const out = []
    for (const r of shown.slice(0, limit)) {
      const k = dayKey(r.at)
      if (!out.length || out[out.length - 1].k !== k) out.push({ k, label: dayLabel(r.at), items: [] })
      out[out.length - 1].items.push(r)
    }
    return out
  }, [shown, limit])

  const chip = (k, label, color) => {
    const on = kind === k
    return (
      <button key={k} type="button" onClick={() => { setKind(k); setLimit(60) }} aria-pressed={on}
        style={{ minHeight: 28, padding: '0 10px', borderRadius: 14, cursor: 'pointer', fontFamily: MONO, fontSize: 11, whiteSpace: 'nowrap',
                 border: `1px solid ${on ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, background: on ? 'rgba(200,150,62,0.12)' : 'transparent',
                 color: on ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />}
        {label}<span style={{ color: 'var(--text-muted, #6b6d82)' }}>{counts[k] ?? 0}</span>
      </button>
    )
  }

  return (
    <section style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>timeline</span>
        <button type="button" onClick={load} title="Refresh" style={{ background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', minHeight: 26, padding: '0 8px', fontFamily: MONO, fontSize: 11 }}>↻</button>
      </div>

      {rows && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 4 }}>
          {chip('all', 'All')}
          {Object.entries(KINDS).filter(([k]) => counts[k]).map(([k, v]) => chip(k, v.label, v.color))}
        </div>
      )}

      {loading && !rows && (
        <div aria-busy="true">
          {[0, 1, 2, 3, 4].map(i => <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0' }}><div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border, #2e3040)', marginTop: 4 }} /><div style={{ flex: 1 }}><div style={{ height: 11, width: '55%', background: 'var(--border, #2e3040)', borderRadius: 3, opacity: 0.6 }} /><div style={{ height: 9, width: '30%', background: 'var(--border, #2e3040)', borderRadius: 3, opacity: 0.4, marginTop: 6 }} /></div></div>)}
        </div>
      )}
      {error && (
        <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(176,100,91,0.3)', background: 'rgba(176,100,91,0.07)', fontFamily: MONO, fontSize: 12, color: 'var(--red, #b0645b)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>Couldn't load the timeline — {error}</span>
          <button onClick={load} style={{ background: 'none', border: '1px solid rgba(176,100,91,0.4)', borderRadius: 6, color: 'var(--red, #b0645b)', cursor: 'pointer', fontFamily: MONO, fontSize: 11 }}>Retry</button>
        </div>
      )}
      {rows && rows.length === 0 && (
        <div style={{ padding: '14px 2px', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Nothing has happened on this property yet.</div>
      )}

      {days.map(d => (
        <div key={d.k} style={{ marginTop: 6 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, padding: '8px 0 4px', position: 'sticky', top: 56, background: 'var(--bg-panel, #1e2028)', zIndex: 1 }}>{d.label}</div>
          <div style={{ borderLeft: '1px solid var(--border, #2e3040)', marginLeft: 3 }}>
            {d.items.map((r, i) => {
              const k = KINDS[r.kind] || KINDS.journey
              const go = r.route ? () => navigate(r.route) : null
              return (
                <div key={i} onClick={go || undefined} className={go ? 'tl-item' : undefined}
                  style={{ display: 'flex', gap: 12, padding: '7px 8px 7px 0', cursor: go ? 'pointer' : 'default', borderRadius: 6, position: 'relative' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: k.color, marginLeft: -4, marginTop: 5, flexShrink: 0, boxShadow: '0 0 0 3px var(--bg-panel, #1e2028)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', lineHeight: 1.4, wordBreak: 'break-word' }}>{r.title}</div>
                    {r.detail && <div style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', lineHeight: 1.45, marginTop: 2, wordBreak: 'break-word' }}>{r.detail}</div>}
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3 }}>
                      <span style={{ color: k.color }}>{k.label}</span>{timeOf(r.at) && ` · ${timeOf(r.at)}`}{r.actor && ` · ${r.actor}`}
                    </div>
                  </div>
                  {go && <span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)', alignSelf: 'center' }}>›</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {shown.length > limit && (
        <button type="button" onClick={() => setLimit(l => l + 100)}
          style={{ marginTop: 10, width: '100%', minHeight: 36, borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>
          Show older · {shown.length - limit} more
        </button>
      )}
      <style>{`.tl-item:hover { background: var(--bg-input, #252731); }`}</style>
    </section>
  )
}
