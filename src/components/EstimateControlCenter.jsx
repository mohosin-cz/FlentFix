import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateEstimate, resolveInspectionWithData } from '../utils/generateEstimate'

const STATUS_COLOR = {
  draft:              '#9898a4',
  sent:               '#4a9eff',
  viewed:             '#c8963e',
  partially_approved: '#f0a050',
  approved:           '#4dd9c0',
  rejected:           '#f87171',
}

const pillBtn = {
  padding: '5px 12px', fontSize: '11px', background: 'none',
  border: '1px solid var(--border, #2e3040)', borderRadius: 6,
  color: 'var(--text, #e8e8f0)', cursor: 'pointer',
  fontFamily: 'var(--font-mono, monospace)',
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function EstimateControlCenter({ pid, userEmail, onClose }) {
  const navigate = useNavigate()
  const [estimates, setEstimates]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)

  async function fetchEstimates() {
    setLoading(true)
    const { data } = await supabase
      .from('estimates')
      .select('*, estimate_items(count), estimate_disputes(count), estimate_events(event_type, created_at, actor)')
      .eq('pid', pid)
      .order('created_at', { ascending: false })
    setEstimates(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchEstimates() }, [pid])

  async function handleGenerate() {
    setGenerating(true)
    const inspId = await resolveInspectionWithData(pid)
    if (!inspId) { setGenerating(false); alert('No inspection with data found for this PID.'); return }
    const estId = await generateEstimate(inspId, pid, userEmail)
    setGenerating(false)
    if (estId) { await fetchEstimates(); navigate(`/estimate/${estId}`) }
  }

  async function handleRegenerate(est) {
    setGenerating(true)
    const inspId = await resolveInspectionWithData(pid)
    if (!inspId) { setGenerating(false); return }
    await generateEstimate(inspId, pid, userEmail)
    setGenerating(false)
    await fetchEstimates()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid var(--border, #2e3040)' }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em' }}>// estimate_control_center</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text, #e8e8f0)', marginTop: 2 }}>PID {pid}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* Actions */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{ flex: 1, padding: '10px', background: 'var(--accent, #c8963e)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: generating ? 'wait' : 'pointer', opacity: generating ? 0.7 : 1, fontFamily: 'var(--font-mono, monospace)' }}
          >
            {generating ? 'Generating…' : '+ Generate New Estimate'}
          </button>
          {estimates.length > 0 && (
            <button
              onClick={() => handleRegenerate(estimates[0])}
              disabled={generating}
              style={{ padding: '10px 14px', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted, #6b6d82)', cursor: generating ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
            >
              ↻ Regenerate Latest
            </button>
          )}
        </div>

        {/* Estimate list */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '14px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', marginBottom: 10 }}>
            ESTIMATES ({estimates.length})
          </div>

          {loading ? (
            <div style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Loading…</div>
          ) : estimates.length === 0 ? (
            <div style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No estimates yet. Generate one above.</div>
          ) : (
            estimates.map((est, i) => {
              const itemCount    = est.estimate_items?.[0]?.count    || 0
              const disputeCount = est.estimate_disputes?.[0]?.count || 0
              const version      = estimates.length - i
              const events       = est.estimate_events || []
              const sentEvent    = events.find(e => e.event_type === 'sent')
              const viewedEvent  = events.find(e => e.event_type === 'viewed')
              const color        = STATUS_COLOR[est.status] || STATUS_COLOR.draft
              const total        = est.total_cost ?? null

              return (
                <div key={est.id} style={{ background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: 14, marginBottom: 10 }}>

                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>v{version}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: `${color}22`, color, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'var(--font-mono, monospace)' }}>
                        {est.status || 'draft'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
                      {fmtDate(est.created_at)}
                    </span>
                  </div>

                  {/* Meta */}
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 6 }}>
                    {itemCount} items
                    {total != null ? ` · ₹${Number(total).toLocaleString('en-IN')}` : ''}
                    {est.created_by ? ` · ${est.created_by.split('@')[0]}` : ''}
                  </div>

                  {/* Timeline pills */}
                  {(sentEvent || viewedEvent || disputeCount > 0 || est.approved_at) && (
                    <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 10, flexWrap: 'wrap' }}>
                      {sentEvent    && <span>✓ sent {fmtDate(sentEvent.created_at)}</span>}
                      {viewedEvent  && <span>👁 viewed {fmtDate(viewedEvent.created_at)}</span>}
                      {disputeCount > 0 && <span style={{ color: '#f0a050' }}>⚠ {disputeCount} dispute{disputeCount > 1 ? 's' : ''}</span>}
                      {est.approved_at && <span style={{ color: '#4dd9c0' }}>✓ approved</span>}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => navigate(`/estimate/${est.id}`)} style={pillBtn}>Open</button>
                    <button onClick={() => navigate(`/estimate/${est.id}?edit=1`)} style={pillBtn}>Edit</button>
                    {disputeCount > 0 && (
                      <button
                        onClick={() => navigate(`/estimate/${est.id}?tab=disputes`)}
                        style={{ ...pillBtn, color: '#f0a050', borderColor: '#f0a050' }}
                      >
                        Disputes ({disputeCount})
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
