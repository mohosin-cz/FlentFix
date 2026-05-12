import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

// ── helpers ───────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640)
  useEffect(() => {
    const h = () => setM(window.innerWidth <= 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

const CHART_COLORS = {
  electrical: '#4a9eff', plumbing: '#4dd9c0', woodwork: '#c8963e',
  cleaning: '#a78bfa', misc: '#9898a4', appliances: '#f0a050', lights: '#f0c040',
}

function fmtCost(n) { return `₹${(parseFloat(n) || 0).toLocaleString('en-IN')}` }

function isFunctional(item) {
  if (item.availability_status === 'not_available') return false
  const d = (item.issue_description || '').toLowerCase()
  return d === 'functional' || d.includes('no issues') || d.includes('no issue')
}

function healthColor(score) {
  if (score == null) return '#666'
  if (score >= 8) return '#4dd9c0'
  if (score >= 5) return '#f0a050'
  return '#f87171'
}

// ── Analytics sidebar ─────────────────────────────────────────────────────────

function AnalyticsSidebar({ lineItems }) {
  const healthRef  = useRef(null)
  const costRef    = useRef(null)
  const healthInst = useRef(null)
  const costInst   = useRef(null)

  const tradeStats = useMemo(() => {
    const map = {}
    lineItems.forEach(item => {
      const t = (item.trade || 'misc').toLowerCase()
      if (!map[t]) map[t] = { scores: [], cost: 0, issues: 0, functional: 0 }
      if (item.item_score != null) map[t].scores.push(item.item_score)
      map[t].cost += (item.material_cost || 0) + (item.labour_cost || 0)
      if (isFunctional(item)) map[t].functional++; else map[t].issues++
    })
    return Object.entries(map)
      .map(([name, d]) => ({
        name,
        avgHealth: d.scores.length
          ? Math.round(d.scores.reduce((a, b) => a + b, 0) / d.scores.length * 10)
          : null,
        cost: d.cost, issues: d.issues, functional: d.functional,
      }))
      .sort((a, b) => (b.avgHealth ?? -1) - (a.avgHealth ?? -1))
  }, [lineItems])

  const issueCounts = useMemo(() => {
    const map = {}
    lineItems.filter(i => !isFunctional(i) && i.availability_status !== 'not_available')
      .forEach(i => { const k = i.issue_description || 'Unknown'; map[k] = (map[k] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [lineItems])

  const actionSummary = useMemo(() => {
    const map = {}
    lineItems.filter(i => i.action).forEach(i => { map[i.action] = (map[i.action] || 0) + 1 })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [lineItems])

  useEffect(() => {
    if (!healthRef.current || !costRef.current) return
    if (healthInst.current) { healthInst.current.destroy(); healthInst.current = null }
    if (costInst.current)   { costInst.current.destroy();   costInst.current = null }

    const scored = tradeStats.filter(t => t.avgHealth != null)
    if (scored.length > 0) {
      healthInst.current = new Chart(healthRef.current, {
        type: 'bar',
        data: {
          labels: scored.map(t => t.name),
          datasets: [{
            data: scored.map(t => t.avgHealth),
            backgroundColor: scored.map(t => CHART_COLORS[t.name] || '#888'),
            borderRadius: 3, borderSkipped: false,
          }],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          scales: {
            x: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#666', font: { size: 10 } } },
            y: { grid: { display: false }, ticks: { color: '#999', font: { size: 11 } } },
          },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw}/100` } } },
        },
      })
    }

    const costTrades = tradeStats.filter(t => t.cost > 0)
    if (costTrades.length > 0) {
      costInst.current = new Chart(costRef.current, {
        type: 'doughnut',
        data: {
          labels: costTrades.map(t => t.name),
          datasets: [{
            data: costTrades.map(t => t.cost),
            backgroundColor: costTrades.map(t => CHART_COLORS[t.name] || '#888'),
            borderWidth: 0, hoverOffset: 4,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => `${ctx.label}: ₹${Math.round(ctx.raw).toLocaleString('en-IN')}` } },
          },
        },
      })
    }

    return () => {
      if (healthInst.current) { healthInst.current.destroy(); healthInst.current = null }
      if (costInst.current)   { costInst.current.destroy();   costInst.current = null }
    }
  }, [tradeStats])

  const scored = tradeStats.filter(t => t.avgHealth != null)
  const hasCost = tradeStats.some(t => t.cost > 0)
  const functionalCount = lineItems.filter(isFunctional).length
  const issueCount = lineItems.filter(i => !isFunctional(i) && i.availability_status !== 'not_available').length

  return (
    <div style={{ background: '#1a1a1e', border: '1px solid #2a2a2e', borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: 10, color: '#666', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', marginBottom: 16 }}>// ANALYTICS</div>

      {/* Health by trade */}
      {scored.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>Health by Trade</div>
          <div style={{ height: Math.max(80, scored.length * 28 + 16) }}>
            <canvas ref={healthRef} role="img" aria-label="Health by trade" />
          </div>
        </div>
      )}

      {/* Issue breakdown */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>Issues vs Functional</div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f87171', fontFamily: 'var(--font-mono, monospace)' }}>{issueCount}</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>issues</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(77,217,192,0.08)', border: '1px solid rgba(77,217,192,0.2)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#4dd9c0', fontFamily: 'var(--font-mono, monospace)' }}>{functionalCount}</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>functional</div>
          </div>
        </div>
        {issueCounts.length > 0 && issueCounts.map(([desc, count]) => (
          <div key={desc} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #222', fontSize: 11 }}>
            <span style={{ color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{desc}</span>
            <span style={{ color: '#555', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0, marginLeft: 8 }}>×{count}</span>
          </div>
        ))}
      </div>

      {/* Cost by trade donut */}
      {hasCost && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>Cost by Trade</div>
          <div style={{ height: 140, position: 'relative' }}>
            <canvas ref={costRef} role="img" aria-label="Cost by trade" />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {tradeStats.filter(t => t.cost > 0).map(t => (
              <span key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#666' }}>
                <span style={{ width: 6, height: 6, borderRadius: 1, background: CHART_COLORS[t.name] || '#888', flexShrink: 0 }} />
                <span style={{ textTransform: 'capitalize' }}>{t.name}: {fmtCost(t.cost)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action summary */}
      {actionSummary.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>Action Summary</div>
          {actionSummary.map(([action, count]) => (
            <div key={action} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #222', fontSize: 11 }}>
              <span style={{ color: '#aaa', textTransform: 'capitalize' }}>{action}</span>
              <span style={{ color: '#c8963e', fontFamily: 'var(--font-mono, monospace)' }}>{count} item{count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}

      {/* Trade detail rows */}
      <div>
        <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase' }}>By Trade</div>
        {tradeStats.map(t => (
          <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #222', fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[t.name] || '#888', flexShrink: 0 }} />
              <span style={{ color: '#aaa', textTransform: 'capitalize' }}>{t.name}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {t.avgHealth != null && (
                <span style={{ fontSize: 10, color: healthColor(t.avgHealth / 10), fontFamily: 'var(--font-mono, monospace)' }}>{t.avgHealth}/100</span>
              )}
              {t.cost > 0 && (
                <span style={{ fontSize: 10, color: '#c8963e', fontFamily: 'var(--font-mono, monospace)' }}>{fmtCost(t.cost)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RawInspectionData() {
  const navigate = useNavigate()
  const { pid, inspectionId: paramInspId } = useParams()
  const isMobile = useIsMobile()

  const [inspection,  setInspection]  = useState(null)
  const [lineItems,   setLineItems]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [mobileTab,   setMobileTab]   = useState('items')
  const [filter,      setFilter]      = useState('all')   // all | issues | functional | notavailable
  const [search,      setSearch]      = useState('')

  useEffect(() => {
    async function load() {
      try {
        let inspId = paramInspId
        if (!inspId && pid) {
          const { data: ins } = await supabase
            .from('inspections').select('id').eq('pid', pid)
            .order('created_at', { ascending: false }).limit(1)
          inspId = ins?.[0]?.id
        }
        if (!inspId) { setLoading(false); setError('No inspection found.'); return }

        const { data, error: err } = await supabase
          .from('inspections')
          .select('*, inspection_line_items(*, line_item_media(*))')
          .eq('id', inspId)
          .single()

        if (err) { setError(err.message); setLoading(false); return }
        setInspection(data)
        setLineItems(data?.inspection_line_items || [])
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [pid, paramInspId])

  const filtered = useMemo(() => {
    return lineItems.filter(item => {
      if (filter === 'issues' && (isFunctional(item) || item.availability_status === 'not_available')) return false
      if (filter === 'functional' && !isFunctional(item)) return false
      if (filter === 'notavailable' && item.availability_status !== 'not_available') return false
      if (search) {
        const q = search.toLowerCase()
        return (item.item_name || '').toLowerCase().includes(q) ||
               (item.area || '').toLowerCase().includes(q) ||
               (item.issue_description || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [lineItems, filter, search])

  const grouped = useMemo(() => {
    const map = {}
    filtered.forEach(item => {
      const sec = item.section_name || 'Other'
      if (!map[sec]) map[sec] = []
      map[sec].push(item)
    })
    return map
  }, [filtered])

  const stats = useMemo(() => {
    const total = lineItems.length
    const issueItems = lineItems.filter(i => !isFunctional(i) && i.availability_status !== 'not_available').length
    const functionalItems = lineItems.filter(isFunctional).length
    const scored = lineItems.filter(i => i.item_score != null)
    const avgScore = scored.length ? scored.reduce((s, i) => s + i.item_score, 0) / scored.length : null
    const totalCost = lineItems.reduce((s, i) => s + (i.material_cost || 0) + (i.labour_cost || 0), 0)
    return { total, issueItems, functionalItems, avgScore, totalCost }
  }, [lineItems])

  function exportCSV() {
    if (!lineItems.length) return
    const headers = ['section', 'area', 'item', 'trade', 'score', 'issue', 'action', 'material_cost', 'labour_cost', 'notes', 'excluded_from_estimate']
    const lines = [
      headers.join(','),
      ...lineItems.map(r => [
        r.section_name, r.area, r.item_name, r.trade,
        r.item_score ?? '', r.issue_description ?? '', r.action ?? '',
        r.material_cost ?? 0, r.labour_cost ?? 0, r.notes ?? '',
        r.excluded_from_estimate ? 'yes' : 'no',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${inspection?.pid || pid}_inspection.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: '#13141a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
      // loading inspection data…
    </div>
  )

  if (error || !inspection) return (
    <div style={{ minHeight: '100svh', background: '#13141a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#666', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
      <div>{error || 'Inspection not found.'}</div>
      <button onClick={() => navigate(-1)} style={{ padding: '8px 16px', background: 'none', border: '1px solid #333', borderRadius: 6, color: '#888', fontSize: 12, cursor: 'pointer' }}>← Go back</button>
    </div>
  )

  const displayPid  = inspection.pid || pid || '—'
  const displayDate = inspection.inspection_date
    ? new Date(inspection.inspection_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'
  const displayType = inspection.house_type || inspection.config?.propertyType || inspection.config?.inspectionType || '—'

  const filterOpts = [
    { key: 'all',         label: `All (${lineItems.length})` },
    { key: 'issues',      label: `Issues (${stats.issueItems})` },
    { key: 'functional',  label: `Functional (${stats.functionalItems})` },
    { key: 'notavailable',label: `N/A (${lineItems.filter(i => i.availability_status === 'not_available').length})` },
  ]

  const itemsList = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Filter pills + search */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {filterOpts.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', border: '1px solid', borderColor: filter === f.key ? '#c8963e' : '#2a2a2e', background: filter === f.key ? 'rgba(200,150,62,0.12)' : '#1a1a1e', color: filter === f.key ? '#c8963e' : '#555' }}>
            {f.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1a1a1e', border: '1px solid #2a2a2e', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: '#555', flexShrink: 0 }}>
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M9.5 9.5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#e8e8f0', fontFamily: 'var(--font-mono, monospace)' }}
          placeholder="search item, area, issue…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button onClick={() => setSearch('')} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 16, cursor: 'pointer', padding: 0 }}>×</button>}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#444', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>// no items found</div>
      )}

      {/* Grouped item cards */}
      {Object.entries(grouped).map(([section, items]) => (
        <div key={section} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#444', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
            <span>// {section.toUpperCase()}</span>
            <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
          </div>

          {items.map(item => {
            const func = isFunctional(item)
            const na   = item.availability_status === 'not_available'
            const cost = (item.material_cost || 0) + (item.labour_cost || 0)
            const borderColor = na ? '#2a2a2e' : func ? '#1d4a2e' : '#4a1e1e'
            const borderLeft  = na ? '#444' : func ? '#1d6a40' : '#a05050'

            return (
              <div key={item.id} style={{ background: '#1a1a1e', border: `1px solid ${borderColor}`, borderLeft: `3px solid ${borderLeft}`, borderRadius: 6, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#e8e8f0' }}>{item.item_name}</span>
                    {item.area && item.area !== item.item_name && (
                      <span style={{ fontSize: 11, color: '#555', marginLeft: 8 }}>{item.area}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {item.item_score != null && (
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: healthColor(item.item_score) }}>{item.item_score * 10}/100</span>
                    )}
                    {item.trade && (
                      <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 4, background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.2)', color: '#c8963e', textTransform: 'capitalize', fontFamily: 'var(--font-mono, monospace)' }}>{item.trade}</span>
                    )}
                    {item.excluded_from_estimate && (
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(107,109,130,0.1)', border: '1px solid #333', color: '#555', fontFamily: 'var(--font-mono, monospace)' }}>excl.</span>
                    )}
                  </div>
                </div>

                {item.issue_description && (
                  <div style={{ fontSize: 12, color: na ? '#555' : func ? '#4dd9c0' : '#aaa', marginBottom: 4 }}>
                    {item.issue_description}
                  </div>
                )}

                {item.action && (
                  <span style={{ display: 'inline-block', marginBottom: 6, fontSize: 10, padding: '2px 8px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 3, color: '#f87171', fontFamily: 'var(--font-mono, monospace)' }}>
                    {item.action}
                  </span>
                )}

                {cost > 0 && (
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#555', marginTop: 4 }}>
                    {item.material_cost > 0 && <span>Material: {fmtCost(item.material_cost)}</span>}
                    {item.labour_cost > 0 && <span>Labour: {fmtCost(item.labour_cost)}</span>}
                    <span style={{ color: '#c8963e', marginLeft: 'auto', fontWeight: 600 }}>{fmtCost(cost)}</span>
                  </div>
                )}

                {item.notes && (
                  <div style={{ fontSize: 11, color: '#555', marginTop: 6, fontStyle: 'italic' }}>"{item.notes}"</div>
                )}

                {item.line_item_media?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {item.line_item_media.map(m => (
                      <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer">
                        <img src={m.url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 4, border: '1px solid #2a2a2e' }} onError={e => { e.target.style.display = 'none' }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Total cost */}
      {stats.totalCost > 0 && (
        <div style={{ padding: '14px 18px', background: '#1a1a1e', border: '1px solid #2a2a2e', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: '#555', fontFamily: 'var(--font-mono, monospace)' }}>total_cost · {lineItems.length} items</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#c8963e', fontFamily: 'var(--font-mono, monospace)' }}>{fmtCost(stats.totalCost)}</span>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: '#13141a', color: '#e8e8f0', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>

      {/* ── Header ── */}
      <div style={{ background: '#1a1a1e', padding: '20px 28px', borderBottom: '1px solid #2a2a2e', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <button onClick={() => navigate(-1)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#252731', border: '1px solid #2e3040', borderRadius: 7, color: '#888', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div>
              <div style={{ fontSize: 11, color: '#555', fontFamily: 'var(--font-mono, monospace)', marginBottom: 4 }}>// raw_inspection_data</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>PID {displayPid}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{displayType} · {displayDate}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={() => navigate(`/estimate/${inspection.id}`)} style={{ padding: '8px 14px', background: 'rgba(200,150,62,0.15)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 6, color: '#c8963e', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              View Estimate →
            </button>
            <button onClick={exportCSV} style={{ padding: '8px 14px', background: 'none', border: '1px solid #333', borderRadius: 6, color: '#666', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: '#2a2a2e' }}>
        {[
          { label: 'Items Inspected', value: stats.total },
          { label: 'Issues Found',    value: stats.issueItems,   color: stats.issueItems > 0 ? '#f87171' : '#4dd9c0' },
          { label: 'Functional',      value: stats.functionalItems, color: '#4dd9c0' },
          { label: 'Avg Health',      value: stats.avgScore != null ? `${Math.round(stats.avgScore * 10)}/100` : '—', color: stats.avgScore != null ? healthColor(stats.avgScore) : '#666' },
          { label: 'Est. Cost',       value: fmtCost(stats.totalCost), color: '#c8963e' },
        ].map(st => (
          <div key={st.label} style={{ background: '#13141a', padding: isMobile ? '12px 10px' : '16px 20px' }}>
            <div style={{ fontSize: isMobile ? 16 : 22, fontWeight: 600, color: st.color || '#fff', fontFamily: 'var(--font-mono, monospace)' }}>{st.value}</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{st.label}</div>
          </div>
        ))}
      </div>

      {/* ── Mobile tab bar ── */}
      {isMobile && (
        <div style={{ display: 'flex', background: '#1a1a1e', borderBottom: '1px solid #2a2a2e' }}>
          {['items', 'analytics'].map(tab => (
            <button key={tab} onClick={() => setMobileTab(tab)} style={{ flex: 1, padding: '11px', background: 'none', border: 'none', borderBottom: mobileTab === tab ? '2px solid #c8963e' : '2px solid transparent', color: mobileTab === tab ? '#c8963e' : '#555', fontSize: 12, fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer' }}>
              // {tab}
            </button>
          ))}
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ padding: isMobile ? '16px 14px 60px' : '20px 28px 60px', display: isMobile ? 'block' : 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 1200, margin: '0 auto' }}>

        {/* Left: item list */}
        {(!isMobile || mobileTab === 'items') && itemsList}

        {/* Right: analytics sidebar */}
        {(!isMobile || mobileTab === 'analytics') && (
          <div style={isMobile ? {} : { width: 280, flexShrink: 0, position: 'sticky', top: 80 }}>
            <AnalyticsSidebar lineItems={lineItems} />
          </div>
        )}
      </div>
    </div>
  )
}
