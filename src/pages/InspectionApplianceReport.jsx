import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { NavBar } from '../components/ui'

function scoreColor(s) {
  if (s === null || s === undefined) return 'var(--text-muted, #6b6d82)'
  if (s >= 8) return 'var(--green, #3dba7a)'
  if (s >= 5) return 'var(--accent, #c8963e)'
  return 'var(--red, #e05c6a)'
}

function StatusDot({ status }) {
  const color = status === 'Working' ? 'var(--green, #3dba7a)'
    : status === 'Faulty' ? 'var(--red, #e05c6a)'
    : 'var(--text-muted, #6b6d82)'
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 1 }} />
}

function fmt(n) { return `₹${(parseFloat(n) || 0).toLocaleString('en-IN')}` }

export default function InspectionApplianceReport() {
  const navigate     = useNavigate()
  const { state }    = useLocation()
  const [rows, setRows]   = useState(null)
  const [error, setError] = useState('')

  const inspectionId = state?.inspectionId
  const pid          = state?.pid

  useEffect(() => {
    if (!inspectionId) { setError('No inspection ID provided.'); return }
    supabase
      .from('inspection_line_items')
      .select('*')
      .eq('inspection_id', inspectionId)
      .eq('section_name', 'Appliances')
      .then(({ data, error: err }) => {
        if (err) { setError(err.message); return }
        setRows(data || [])
      })
  }, [inspectionId])

  if (error) return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <NavBar title="appliance_report" onBack={() => navigate(-1)} />
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--red, #e05c6a)', fontSize: 13 }}>{error}</div>
    </div>
  )

  if (!rows) return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <NavBar title="appliance_report" onBack={() => navigate(-1)} />
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontSize: 13 }}>Loading report…</div>
    </div>
  )

  // Group rows by area (appliance name)
  const grouped = {}
  rows.forEach(r => {
    if (!grouped[r.area]) grouped[r.area] = { components: [], health: null }
    grouped[r.area].components.push(r)
    if (r.item_score !== null && grouped[r.area].health === null) grouped[r.area].health = r.item_score
  })

  const applianceList = Object.entries(grouped)
  const totalAppliances = applianceList.length
  const faultyComponents = rows.filter(r => r.issue_description === 'Faulty' || (r.issue_description && r.issue_description !== 'Working' && r.issue_description !== 'N/A' && r.availability_status !== 'not_available')).length
  const totalCost = rows.reduce((sum, r) => sum + (parseFloat(r.material_cost) || 0) + (parseFloat(r.labour_cost) || 0), 0)
  const notAvailableAppliances = applianceList.filter(([, g]) => g.components.every(c => c.availability_status === 'not_available')).length

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          .report-card { border: 1px solid #ddd !important; background: #fff !important; }
        }
      `}</style>

      <div className="no-print">
        <NavBar title="appliance_report" subtitle={pid} onBack={() => navigate(-1)} />
      </div>

      <div style={{ flex: 1, padding: '24px 16px 48px', maxWidth: 640, width: '100%', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>// appliances_report</p>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', color: 'var(--text, #e8e8f0)', letterSpacing: '-0.4px' }}>Appliance Inspection Report</h2>
          {pid && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>{pid}</p>}
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
          {[
            { label: 'Inspected', value: totalAppliances - notAvailableAppliances, sub: `of ${totalAppliances}` },
            { label: 'Faulty Parts', value: faultyComponents, color: faultyComponents > 0 ? 'var(--red, #e05c6a)' : undefined },
            { label: 'Est. Cost', value: fmt(totalCost), color: totalCost > 0 ? 'var(--accent, #c8963e)' : undefined },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: stat.color || 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{stat.label}</div>
              {stat.sub && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', opacity: 0.7 }}>{stat.sub}</div>}
            </div>
          ))}
        </div>

        {/* Per-appliance cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {applianceList.map(([appName, group]) => {
            const health = group.health
            const appTotal = group.components.reduce((s, c) => s + (parseFloat(c.material_cost) || 0) + (parseFloat(c.labour_cost) || 0), 0)
            const isNA = group.components.every(c => c.availability_status === 'not_available')

            return (
              <div key={appName} className="report-card" style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{appName}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {!isNA && health !== null && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(health), fontFamily: 'var(--font-mono, monospace)' }}>{health}/10</span>
                    )}
                    {isNA && (
                      <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 3, padding: '2px 6px', fontFamily: 'var(--font-mono, monospace)' }}>N/A</span>
                    )}
                    {appTotal > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{fmt(appTotal)}</span>
                    )}
                  </div>
                </div>

                {/* Components table */}
                {!isNA && (
                  <div style={{ padding: '4px 0' }}>
                    {group.components.map((comp, ci) => {
                      const isFaulty = comp.availability_status !== 'not_available' && comp.issue_description !== 'Working'
                      const compStatus = comp.availability_status === 'not_available' ? 'N/A' : comp.issue_description === 'Working' ? 'Working' : 'Faulty'
                      const compCost = (parseFloat(comp.material_cost) || 0) + (parseFloat(comp.labour_cost) || 0)
                      return (
                        <div key={ci} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 16px', borderBottom: ci < group.components.length - 1 ? '1px solid rgba(46,48,64,0.6)' : 'none' }}>
                          <StatusDot status={compStatus} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontWeight: 500 }}>{comp.item_name}</div>
                            {isFaulty && comp.issue_description && comp.issue_description !== 'Faulty' && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{comp.issue_description}</div>
                            )}
                            {isFaulty && comp.action && (
                              <div style={{ fontSize: 10, marginTop: 3, display: 'inline-block', padding: '2px 6px', background: 'rgba(224,92,106,0.1)', border: '1px solid rgba(224,92,106,0.25)', borderRadius: 3, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>{comp.action}</div>
                            )}
                          </div>
                          {compCost > 0 && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>{fmt(compCost)}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Total cost footer */}
        {totalCost > 0 && (
          <div style={{ marginTop: 20, padding: '14px 18px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>total_estimate</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{fmt(totalCost)}</span>
          </div>
        )}

        {/* Actions */}
        <div className="no-print" style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{ flex: 1, padding: '13px 18px', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 5V2h9v3M3 10H1V6h13v4h-2M3 10v3h9v-3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 13h9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => navigate('/inspections/mode', { state })}
            style={{ flex: 1, padding: '13px 18px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text, #e8e8f0)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Back to Mode
          </button>
        </div>
      </div>
    </div>
  )
}
