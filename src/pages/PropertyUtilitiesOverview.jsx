import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import { useIsMobile } from '../hooks/useIsMobile'
import LogoSpinner from '../components/LogoSpinner'
import UtilitiesAnalytics from '../components/UtilitiesAnalytics'
import { UTILITY_TYPES, typeLabel, typeIcon, typeColor, dueInfo, dueBucket } from '../utils/propertyUtils'

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const DUE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'due', label: '⚠ Due ≤7d', color: 'var(--red, #e05c6a)' },
  { key: 'month', label: 'This month', color: 'var(--accent, #c8963e)' },
  { key: 'later', label: 'Later', color: 'var(--green, #3dba7a)' },
  { key: 'none', label: 'No date', color: 'var(--text-muted, #6b6d82)' },
]

export default function PropertyUtilitiesOverview() {
  const navigate = useNavigate()
  const narrow = useIsMobile(980)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [q, setQ] = useState('')
  const [typeF, setTypeF] = useState('all')
  const [dueF, setDueF] = useState('all')
  const [showAnalytics, setShowAnalytics] = useState(false)

  const fetchData = useCallback(async () => {
    setError(null)
    const [{ data: utils, error: uErr }, { data: props }] = await Promise.all([
      supabase.from('property_utilities').select('*').in('status', ['active', 'unknown']),
      supabase.from('properties').select('pid, name, address'),
    ])
    if (uErr) { setError(uErr.message); setLoading(false); return }
    const pmap = new Map((props || []).map(p => [String(p.pid), p]))
    const enriched = (utils || []).map(u => ({ ...u, prop: pmap.get(String(u.pid)) || null, due: dueInfo(u), bucket: dueBucket(u) }))
    enriched.sort((a, b) => (a.due ? a.due.days : Infinity) - (b.due ? b.due.days : Infinity))
    setRows(enriched)
    setLoading(false)
  }, [])

  const { pullDistance, isRefreshing } = usePullToRefresh(fetchData)
  useEffect(() => { fetchData() }, [fetchData])

  const presentTypes = useMemo(() => {
    const set = new Set(rows.map(r => r.utility_type))
    return UTILITY_TYPES.filter(t => set.has(t.key))
  }, [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (typeF !== 'all' && r.utility_type !== typeF) return false
      if (dueF !== 'all' && r.bucket !== dueF) return false
      if (needle) {
        const hay = [r.pid, r.prop && r.prop.name, r.prop && r.prop.address, r.provider, r.plan_type, r.account_number, typeLabel(r)].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [rows, q, typeF, dueF])

  const chip = (on, color) => ({ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', fontFamily: SANS, whiteSpace: 'nowrap', background: on ? `${color || 'var(--accent, #c8963e)'}1e` : 'var(--bg-input, #252731)', border: `1px solid ${on ? (color || 'var(--accent, #c8963e)') : 'var(--border, #2e3040)'}`, color: on ? (color || 'var(--accent, #c8963e)') : 'var(--text-dim, #9394a8)', fontWeight: on ? 600 : 400 })

  const left = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {narrow && rows.length > 0 && (
        <button onClick={() => setShowAnalytics(true)} style={{ width: '100%', marginBottom: 12, padding: '11px 0', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 10, fontSize: 13.5, fontWeight: 700, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: SANS }}>📊 Analytics &amp; spend</button>
      )}

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted, #6b6d82)' }}>⌕</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search PID, property, provider, account…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px 11px 34px', fontSize: 14, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, outline: 'none', fontFamily: SANS }} />
        {q && <button onClick={() => setQ('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 6, border: 'none', background: 'var(--bg-panel, #1e2028)', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 13 }}>✕</button>}
      </div>

      {presentTypes.length > 1 && (
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
          <button onClick={() => setTypeF('all')} style={chip(typeF === 'all')}>All types</button>
          {presentTypes.map(t => <button key={t.key} onClick={() => setTypeF(t.key)} style={chip(typeF === t.key, t.color)}><span>{t.icon}</span>{t.label}</button>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 8, marginBottom: 12, WebkitOverflowScrolling: 'touch' }}>
        {DUE_FILTERS.map(f => <button key={f.key} onClick={() => setDueF(f.key)} style={chip(dueF === f.key, f.color)}>{f.label}</button>)}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginBottom: 10 }}>
        {filtered.length} of {rows.length}{(q || typeF !== 'all' || dueF !== 'all') ? ' · filtered' : ''}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '36px 20px', border: '1px dashed rgba(200,150,62,0.2)', borderRadius: 10, textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: SANS, lineHeight: 1.7 }}>
          {rows.length === 0 ? 'No active utilities yet — add them from a property.' : 'Nothing matches these filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => {
            const color = typeColor(r)
            return (
              <button key={r.id} onClick={() => navigate(`/properties/${r.pid}/utilities`)} style={s.row}>
                <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: `${color}22`, border: `1px solid ${color}44` }}>{typeIcon(r)}</div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typeLabel(r)}{r.provider ? <span style={{ fontWeight: 400, color: 'var(--text-muted, #6b6d82)' }}> · {r.provider}</span> : null}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, overflow: 'hidden' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: MONO, background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 5, padding: '1px 7px', flexShrink: 0 }}>PID {r.pid}</span>
                    {r.prop && r.prop.name && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prop.name}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {r.due ? <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: r.due.color, fontFamily: SANS }}>{r.due.days <= 0 ? 'Due today' : r.due.days === 1 ? 'Tomorrow' : `${r.due.days} days`}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>{r.due.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                  </> : <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>no date</div>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={s.page}>
        <header style={s.header}>
          <button style={s.backBtn} onClick={() => navigate('/dashboard')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>Utilities</span>
          <div style={{ width: 36 }} />
        </header>

        <main style={{ ...s.main, maxWidth: narrow ? 640 : 1140 }}>
          {loading ? <LogoSpinner /> : error ? (
            <div style={{ padding: 16, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, fontSize: 13, color: '#f87171', fontFamily: MONO }}>Couldn’t load: {error}</div>
          ) : (
            <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
              {left}
              {!narrow && rows.length > 0 && (
                <aside style={{ width: 360, flexShrink: 0, position: 'sticky', top: 78, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto' }}>
                  <UtilitiesAnalytics rows={rows} onType={setTypeF} onDue={setDueF} />
                </aside>
              )}
            </div>
          )}
        </main>
      </div>

      {narrow && showAnalytics && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,9,13,0.6)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-end' }} onClick={e => { if (e.target === e.currentTarget) setShowAnalytics(false) }}>
          <div style={{ width: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg, #16171f)', borderTop: '1px solid var(--border, #2e3040)', borderRadius: '18px 18px 0 0', padding: '16px 18px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border, #2e3040)', margin: '0 auto' }} />
              <button onClick={() => setShowAnalytics(false)} style={{ position: 'absolute', right: 22, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}>✕</button>
            </div>
            <UtilitiesAnalytics rows={rows} onType={(k) => { setTypeF(k); setShowAnalytics(false) }} onDue={(d) => { setDueF(d); setShowAnalytics(false) }} />
          </div>
        </div>
      )}
    </>
  )
}

const s = {
  page: { minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: 'var(--text, #e8e8f0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  main: { flex: 1, padding: '20px 20px 48px', width: '100%', margin: '0 auto' },
  row: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer' },
}
