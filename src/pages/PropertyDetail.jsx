import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import { advanceStage, STAGES, MAIN_SEQUENCE } from '../utils/propertyJourney'

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function titleCase(str) {
  return (str || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function SectionLabel({ children }) {
  return (
    <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {children}
    </p>
  )
}

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t) }, [])
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)',
      borderRadius: 8, padding: '10px 18px', fontSize: 13, color: 'var(--text-dim, #9394a8)',
      fontFamily: 'var(--font-mono, monospace)', zIndex: 300, whiteSpace: 'nowrap',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {msg}
    </div>
  )
}

const TILES = [
  {
    key: 'estimate',
    title: 'Create Estimate',
    sub: 'Indoor + Outdoor',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: 'var(--green, #3dba7a)',
    bg: 'rgba(61,186,122,0.08)',
    border: 'rgba(61,186,122,0.25)',
  },
  {
    key: 'appliance',
    title: 'Appliance Report',
    sub: 'All appliances',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="3" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="13" y="3" width="9" height="13" rx="1" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="2" y="13" width="9" height="8" rx="1" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="6.5" cy="17" r="2" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
    color: '#7c9ef8',
    bg: 'rgba(124,158,248,0.08)',
    border: 'rgba(124,158,248,0.25)',
  },
  {
    key: 'workorder',
    title: 'Work Order',
    sub: 'Coming soon',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a1 1 0 0 0-1.4-1.4l-2.3 2.3-.9-.9a1 1 0 0 0-1.4 0z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M4 12h10M4 8h6M4 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: 'var(--text-muted, #6b6d82)',
    bg: 'var(--bg-input, #252731)',
    border: 'var(--border, #2e3040)',
    disabled: true,
  },
  {
    key: 'invoice',
    title: 'Landlord Invoice',
    sub: 'Generate invoice',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 17h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
  },
  {
    key: 'raw',
    title: 'Raw Inspection Data',
    sub: 'All line items',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 6h16M4 10h16M4 14h10M4 18h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    color: 'var(--accent, #c8963e)',
    bg: 'rgba(200,150,62,0.08)',
    border: 'rgba(200,150,62,0.25)',
  },
  {
    key: 'flentfit',
    title: 'FlentFit Report',
    sub: 'Coming soon',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
    color: 'var(--text-muted, #6b6d82)',
    bg: 'var(--bg-input, #252731)',
    border: 'var(--border, #2e3040)',
    disabled: true,
  },
]

export default function PropertyDetail() {
  const navigate = useNavigate()
  const { pid }  = useParams()
  const [inspections, setInspections] = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState('')
  const [stats, setStats]             = useState(null)
  const [showAllInspections, setShowAllInspections] = useState(false)
  const [quickNote, setQuickNote]     = useState(null)
  const [currentStage, setCurrentStage] = useState('T-5')
  const [journey, setJourney]           = useState([])
  const [userEmail, setUserEmail]       = useState(null)

  const fetchData = useCallback(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email || null))

    supabase.from('properties').select('stage').eq('pid', pid).maybeSingle()
      .then(({ data }) => setCurrentStage(data?.stage || 'T-5'))

    supabase.from('property_journey').select('*').eq('pid', pid).order('changed_at', { ascending: true })
      .then(({ data }) => setJourney(data || []))

    supabase
      .from('inspections')
      .select('*')
      .eq('pid', pid)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setInspections(data || [])
        setLoading(false)
      })

    supabase
      .from('quick_notes')
      .select('note, updated_at, created_by')
      .eq('pid', pid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('quick_notes fetch error:', error)
        setQuickNote(data || null)
      })

    supabase
      .from('inspection_line_items')
      .select('id, inspection_id, material_cost, labour_cost, issue_description')
      .then(({ data: allItems }) => {
        if (!allItems) return
        supabase
          .from('inspections')
          .select('id')
          .eq('pid', pid)
          .then(({ data: ins }) => {
            if (!ins) return
            const ids = new Set(ins.map(i => i.id))
            const items = allItems.filter(r => ids.has(r.inspection_id))
            const totalCost = items.reduce((s, r) => s + (parseFloat(r.material_cost) || 0) + (parseFloat(r.labour_cost) || 0), 0)
            const issues = items.filter(r => r.issue_description && r.issue_description !== 'Functional' && r.issue_description !== 'Working' && r.issue_description !== 'N/A').length
            setStats({ totalCost, issues, totalItems: items.length })
          })
      })
  }, [pid])

  const { pullDistance, isRefreshing } = usePullToRefresh(fetchData)

  useEffect(() => { fetchData() }, [fetchData])

  const latest    = inspections[0]
  const houseType = latest?.house_type || ''
  const address   = latest?.config?.address || ''
  const latestId  = latest?.id

  async function handleManualAdvance(stageName) {
    await advanceStage(supabase, pid, stageName, userEmail)
    supabase.from('properties').select('stage').eq('pid', pid).maybeSingle()
      .then(({ data }) => setCurrentStage(data?.stage || stageName))
    supabase.from('property_journey').select('*').eq('pid', pid).order('changed_at', { ascending: true })
      .then(({ data }) => setJourney(data || []))
  }

  function handleTile(key) {
    if (key === 'estimate') {
      if (!latestId) { setToast('No inspection found for this property.'); return }
      advanceStage(supabase, pid, 'estimate_created', userEmail)
      navigate(`/estimate/${latestId}`)
    } else if (key === 'appliance') {
      navigate('/inspections/appliance-report', { state: { inspectionId: latestId, pid } })
    } else if (key === 'invoice') {
      if (!latestId) { setToast('No inspection found for this property.'); return }
      navigate(`/invoice/${latestId}`)
    } else if (key === 'raw') {
      navigate(`/properties/${pid}/raw`)
    } else {
      setToast('Coming soon')
    }
  }

  const isRejected   = currentStage === 'estimate_rejected'
  const currentIndex = MAIN_SEQUENCE.findIndex(s => s.key === currentStage)

  function getStageActions() {
    switch (currentStage) {
      case 'estimate_shared':
        return [
          { label: '✓ Mark Approved', action: () => handleManualAdvance('estimate_approved'), color: '#4dd9c0' },
          { label: '✗ Mark Rejected', action: () => handleManualAdvance('estimate_rejected'), color: '#f87171' },
        ]
      case 'estimate_approved':
        return [{ label: '🔧 Plan Utility Work', action: () => handleManualAdvance('utility_planned'), color: 'var(--accent, #c8963e)' }]
      case 'utility_planned':
        return [{ label: '📅 Confirm Setup Date', action: () => handleManualAdvance('setup_date'), color: 'var(--accent, #c8963e)' }]
      case 'setup_date':
        return [{ label: '⚡ Mark T-Day', action: () => handleManualAdvance('tday'), color: 'var(--accent, #c8963e)' }]
      case 'tday':
        return [{ label: '🤝 Mark Handover Done', action: () => handleManualAdvance('handover'), color: 'var(--accent, #c8963e)' }]
      default: return []
    }
  }

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={s.page}>

      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/properties')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>PID {pid}</span>
          <span style={s.headerSub}>
            {houseType ? titleCase(houseType) : '—'}
            {latest ? ` · ${fmtDate(latest.inspection_date)}` : ''}
          </span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      {/* ── Pipeline tracker ── */}
      {!loading && (
        <div style={{ background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', padding: '14px 20px 10px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 'max-content', gap: 0 }}>
            {MAIN_SEQUENCE.map((stage, i) => {
              const isDone    = i < currentIndex
              const isCurrent = i === currentIndex
              const isFuture  = i > currentIndex
              const entry     = journey.find(j => j.stage === stage.key)
              const nodeColor = isRejected && stage.key === 'estimate_approved' ? '#2a1a1a'
                : isDone    ? 'rgba(200,150,62,0.18)'
                : isCurrent ? 'var(--accent, #c8963e)'
                : 'var(--bg-input, #252731)'
              const nodeBorder = isRejected && stage.key === 'estimate_approved' ? '#3a1a1a'
                : (isDone || isCurrent) ? 'var(--accent, #c8963e)'
                : 'var(--border, #2e3040)'
              return (
                <div key={stage.key} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div
                      onClick={() => isFuture && !isRejected && handleManualAdvance(stage.key)}
                      title={entry ? `${new Date(entry.changed_at).toLocaleDateString('en-IN')} · ${entry.changed_by}` : stage.label}
                      style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, background: nodeColor, border: `2px solid ${nodeBorder}`, cursor: isFuture && !isRejected ? 'pointer' : 'default', transition: 'all 0.2s' }}
                    >
                      {isDone ? '✓' : stage.icon}
                    </div>
                    <div style={{ fontSize: 9, color: isCurrent ? 'var(--accent, #c8963e)' : isDone ? '#888' : '#555', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em', whiteSpace: 'nowrap', fontWeight: isCurrent ? 600 : 400, textAlign: 'center', maxWidth: 52 }}>
                      {stage.label}
                    </div>
                    {entry && (
                      <div style={{ fontSize: 8, color: '#555', fontFamily: 'var(--font-mono, monospace)' }}>
                        {new Date(entry.changed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                    )}
                  </div>
                  {i < MAIN_SEQUENCE.length - 1 && (
                    <div style={{ width: 36, height: 2, background: isDone ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)', margin: '0 0 22px', transition: 'background 0.3s', flexShrink: 0 }} />
                  )}
                </div>
              )
            })}
          </div>
          {isRejected && (
            <div style={{ marginTop: 8, padding: '6px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, fontSize: 11, color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              ✗ Estimate Rejected
              <button onClick={() => handleManualAdvance('estimate_created')} style={{ fontSize: 10, color: 'var(--accent, #c8963e)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Re-create estimate
              </button>
            </div>
          )}
        </div>
      )}

      <main style={s.main}>
        {loading ? (
          <div style={s.empty}>// loading…</div>
        ) : (
          <>
            {/* Summary stats */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
                {[
                  { label: 'Line Items', value: stats.totalItems },
                  { label: 'Issues', value: stats.issues, color: stats.issues > 0 ? 'var(--red, #e05c6a)' : undefined },
                  { label: 'Est. Cost', value: `₹${(stats.totalCost || 0).toLocaleString('en-IN')}`, color: stats.totalCost > 0 ? 'var(--accent, #c8963e)' : undefined },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: stat.color || 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{stat.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Action tiles — 2x3 grid */}
            <SectionLabel>Actions</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {TILES.map(tile => (
                <button
                  key={tile.key}
                  onClick={() => handleTile(tile.key)}
                  disabled={tile.disabled}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 12,
                    padding: '16px',
                    background: tile.bg,
                    border: `1px solid ${tile.border}`,
                    borderRadius: 10,
                    cursor: tile.disabled ? 'default' : 'pointer',
                    textAlign: 'left',
                    opacity: tile.disabled ? 0.6 : 1,
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    WebkitTapHighlightColor: 'transparent',
                    color: 'var(--text, #e8e8f0)',
                    minHeight: 100,
                  }}
                  onMouseEnter={e => { if (!tile.disabled) { e.currentTarget.style.borderColor = tile.color; e.currentTarget.style.boxShadow = `0 0 0 1px ${tile.color}` } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = tile.border; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{ color: tile.color, lineHeight: 0, opacity: 0.85 }}>{tile.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tile.color, fontFamily: 'var(--font-mono, monospace)', marginBottom: 3 }}>{tile.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{tile.sub}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Stage action buttons */}
            {getStageActions().length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                {getStageActions().map(action => (
                  <button key={action.label} onClick={action.action} style={{ padding: '8px 16px', background: 'none', border: `1px solid ${action.color}`, borderRadius: 6, color: action.color, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Quick Note */}
            <div style={{ margin: '16px 0' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', marginBottom: 8 }}>
                // quick_notes
              </div>
              {quickNote?.note ? (
                <div style={{ padding: 16, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderLeft: '3px solid var(--accent, #c8963e)', borderRadius: 10 }}>
                  <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {quickNote.note}
                  </div>
                  {quickNote.updated_at && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 8 }}>
                      {new Date(quickNote.updated_at).toLocaleDateString('en-IN')}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '12px 16px', border: '1px dashed rgba(200,150,62,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
                  // no notes yet — use the ✏ button during inspection to add
                </div>
              )}
            </div>

            {/* Journey log */}
            {journey.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', marginBottom: 10 }}>// journey_log</div>
                <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden' }}>
                  {[...journey].reverse().map(entry => {
                    const stageLabel = STAGES.find(s => s.key === entry.stage)?.label || entry.stage
                    const isApproved = entry.stage === 'estimate_approved'
                    const isReject   = entry.stage === 'estimate_rejected'
                    return (
                      <div key={entry.id} style={{ display: 'flex', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--border, #2e3040)', fontSize: 12, alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, minWidth: 72, flexShrink: 0 }}>
                          {new Date(entry.changed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        <span style={{ color: isReject ? '#f87171' : isApproved ? '#4dd9c0' : 'var(--text, #e8e8f0)', flex: 1 }}>
                          {stageLabel}
                        </span>
                        <span style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 11 }}>
                          {entry.changed_by?.split('@')[0] || 'system'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Inspection History — production has one record per inspection date per PID; multiple records here are test data for PID 123 */}
            {inspections.length > 0 && (() => {
              const visible = showAllInspections ? inspections : inspections.slice(0, 1)
              return (
                <>
                  <div style={{ marginTop: 28 }}><SectionLabel>Inspection History</SectionLabel></div>
                  <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden' }}>
                    {visible.map((ins, i) => (
                      <div key={ins.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: i < visible.length - 1 ? '1px solid var(--border, #2e3040)' : 'none' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDate(ins.inspection_date)}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            {ins.house_type && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{ins.house_type}</span>}
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                              fontFamily: 'var(--font-mono, monospace)',
                              background: ins.status === 'completed' ? 'rgba(61,186,122,0.1)' : ins.status === 'estimate_generated' ? 'rgba(61,186,122,0.1)' : 'var(--bg-input, #252731)',
                              border: `1px solid ${ins.status === 'completed' || ins.status === 'estimate_generated' ? 'rgba(61,186,122,0.3)' : 'var(--border, #2e3040)'}`,
                              color: ins.status === 'completed' || ins.status === 'estimate_generated' ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)',
                            }}>
                              {ins.status || 'draft'}
                            </span>
                          </div>
                        </div>
                        {ins.status === 'estimate_generated' && (
                          <button
                            onClick={() => navigate(`/estimate/${ins.id}`)}
                            style={{ fontSize: 11, fontWeight: 600, color: 'var(--green, #3dba7a)', background: 'rgba(61,186,122,0.08)', border: '1px solid rgba(61,186,122,0.25)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}
                          >
                            view estimate →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {inspections.length > 1 && (
                    <button
                      onClick={() => setShowAllInspections(v => !v)}
                      style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                    >
                      {showAllInspections ? 'Show less ↑' : `View all ${inspections.length} inspections for this PID →`}
                    </button>
                  )}
                </>
              )
            })()}
          </>
        )}
      </main>

      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
    </div>
    </>
  )
}

const s = {
  page: {
    minHeight: '100svh',
    background: 'var(--bg, #16171f)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    color: 'var(--text, #e8e8f0)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 56,
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  backBtn: {
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 8,
    color: 'var(--text-dim, #9394a8)', cursor: 'pointer',
  },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  heroStrip: {
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    padding: '24px 20px 28px',
    position: 'relative', overflow: 'hidden',
  },
  heroInner: { position: 'relative', zIndex: 1 },
  heroPid: {
    fontSize: 34, fontWeight: 800,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '-1px', lineHeight: 1.1,
    marginBottom: 10,
  },
  heroMeta: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroBadge: {
    fontSize: 10, fontWeight: 600,
    padding: '3px 8px', borderRadius: 3,
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    color: 'var(--text-dim, #9394a8)',
    textTransform: 'capitalize',
    fontFamily: 'var(--font-mono, monospace)',
  },
  heroAddress: { fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  heroStats: { display: 'flex', alignItems: 'center', gap: 8 },
  heroStat: { fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  heroStatNum: { color: 'var(--accent, #c8963e)', fontWeight: 700 },
  heroGrid: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(var(--border, #2e3040) 1px, transparent 1px), linear-gradient(90deg, var(--border, #2e3040) 1px, transparent 1px)',
    backgroundSize: '28px 28px',
    opacity: 0.25,
    pointerEvents: 'none',
  },
  main: { flex: 1, padding: '24px 20px 48px', maxWidth: 600, width: '100%', margin: '0 auto' },
  empty: {
    textAlign: 'center', padding: '40px 0',
    fontSize: 12, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
}
