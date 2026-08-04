import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import LogoSpinner from '../components/LogoSpinner'
import { typeLabel, typeIcon, dueInfo, fmtDate } from '../utils/propertyUtils'

// Cross-property utilities overview — everything sorted by "recharge due soonest".
export default function PropertyUtilitiesOverview() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])

  const fetchData = useCallback(async () => {
    setError(null)
    const [{ data: utils, error: uErr }, { data: props }] = await Promise.all([
      supabase.from('property_utilities').select('*').in('status', ['active', 'unknown']),
      supabase.from('properties').select('pid, name, address'),
    ])
    if (uErr) { setError(uErr.message); setLoading(false); return }
    const pmap = new Map((props || []).map(p => [String(p.pid), p]))
    const enriched = (utils || []).map(u => ({ ...u, prop: pmap.get(String(u.pid)) || null, due: dueInfo(u) }))
    enriched.sort((a, b) => (a.due ? a.due.days : Infinity) - (b.due ? b.due.days : Infinity))
    setRows(enriched)
    setLoading(false)
  }, [])

  const { pullDistance, isRefreshing } = usePullToRefresh(fetchData)
  useEffect(() => { fetchData() }, [fetchData])

  const dueSoon = rows.filter(r => r.due && r.due.days <= 5).length

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={s.page}>
        <header style={s.header}>
          <button style={s.backBtn} onClick={() => navigate('/dashboard')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div style={s.headerCenter}>
            <span style={s.headerTitle}>Utilities</span>
            <span style={s.headerSub}>recharge tracker · all properties</span>
          </div>
          <div style={{ width: 36 }} />
        </header>

        <main style={s.main}>
          {loading ? <LogoSpinner /> : error ? (
            <div style={{ padding: 16, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, fontSize: 13, color: '#f87171', fontFamily: 'var(--font-mono, monospace)' }}>Couldn’t load: {error}</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '40px 20px', border: '1px dashed rgba(200,150,62,0.2)', borderRadius: 10, textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.7 }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>⚡</div>
              No active utilities yet.<br />Open a property → Utilities &amp; Access to add WiFi, gas, electricity, maintenance and more.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ color: dueSoon ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontWeight: 700 }}>{dueSoon}</span>
                <span>recharge{dueSoon === 1 ? '' : 's'} due within 5 days</span>
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted, #6b6d82)' }}>{rows.length} active</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rows.map(r => (
                  <button key={r.id} onClick={() => navigate(`/properties/${r.pid}/utilities`)} style={s.row}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{typeIcon(r)}</span>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {typeLabel(r)}{r.provider ? <span style={{ fontWeight: 400, color: 'var(--text-muted, #6b6d82)' }}> · {r.provider}</span> : null}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, overflow: 'hidden' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 5, padding: '1px 7px', letterSpacing: '0.04em', flexShrink: 0 }}>PID {r.pid}</span>
                        {r.prop && r.prop.name && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prop.name}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {r.due ? <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: r.due.color, fontFamily: 'var(--font-mono, monospace)' }}>{r.due.days <= 0 ? 'Due today' : r.due.days === 1 ? 'Tomorrow' : `${r.due.days} days`}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>{fmtDate(r.due.date)}</div>
                      </> : <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>no schedule</div>}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  )
}

const s = {
  page: { minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  main: { flex: 1, padding: '24px 20px 48px', maxWidth: 600, width: '100%', margin: '0 auto' },
  row: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, cursor: 'pointer' },
}
