import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

const BG_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'>
  <g transform='translate(5,5)'>
    <rect x='0' y='0' width='22' height='24' rx='1.5' fill='none' stroke='%232a2a2e' stroke-width='1'/>
    <rect x='2' y='2' width='18' height='5' rx='0.5' fill='none' stroke='%232a2a2e' stroke-width='0.8'/>
    <circle cx='11' cy='16.5' r='5.5' fill='none' stroke='%232a2a2e' stroke-width='0.8'/>
    <circle cx='11' cy='16.5' r='3' fill='none' stroke='%232a2a2e' stroke-width='0.5'/>
    <circle cx='4' cy='4' r='1' fill='%232a2a2e'/>
    <circle cx='7' cy='4' r='0.75' fill='%232a2a2e'/>
  </g>
  <g transform='translate(45,2.5)'>
    <rect x='0' y='0' width='19' height='28' rx='1.5' fill='none' stroke='%232a2a2e' stroke-width='1'/>
    <line x1='0' y1='10' x2='19' y2='10' stroke='%232a2a2e' stroke-width='0.8'/>
    <rect x='2' y='4' width='2' height='4' rx='0.5' fill='%232a2a2e'/>
    <rect x='2' y='13' width='2' height='6' rx='0.5' fill='%232a2a2e'/>
  </g>
  <g transform='translate(4,45)'>
    <rect x='0' y='0' width='26' height='13' rx='2' fill='none' stroke='%232a2a2e' stroke-width='1'/>
    <line x1='3' y1='5' x2='23' y2='5' stroke='%232a2a2e' stroke-width='0.8'/>
    <line x1='3' y1='7.5' x2='23' y2='7.5' stroke='%232a2a2e' stroke-width='0.8'/>
    <line x1='3' y1='10' x2='23' y2='10' stroke='%232a2a2e' stroke-width='0.8'/>
    <circle cx='22' cy='3' r='1' fill='%232a2a2e'/>
    <circle cx='19' cy='3' r='1' fill='%232a2a2e'/>
  </g>
  <g transform='translate(52,41)'>
    <rect x='0' y='0' width='14' height='19' rx='7' fill='none' stroke='%232a2a2e' stroke-width='1'/>
    <line x1='7' y1='19' x2='7' y2='24' stroke='%232a2a2e' stroke-width='0.8'/>
    <line x1='4' y1='18' x2='4' y2='23' stroke='%232a2a2e' stroke-width='0.8'/>
    <circle cx='7' cy='9' r='3' fill='none' stroke='%232a2a2e' stroke-width='0.8'/>
  </g>
</svg>`

const BG_DATA_URL = `url("data:image/svg+xml,${BG_SVG.replace(/\n\s*/g, ' ')}")`

function healthBand(score) {
  if (score == null) return { color: '#9898a4', label: 'N/A' }
  if (score >= 7) return { color: '#4a7a52', label: 'Good' }
  if (score >= 4) return { color: '#7a6a3a', label: 'Fair' }
  return { color: '#a05050', label: 'Poor' }
}

const PRINT_CSS = `
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; }
    .ar-page { background: #fff !important; padding: 0 !important; }
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media (max-width: 600px) {
    .ar-topbar { padding: 12px 16px 0 !important; }
    .ar-share-bar { padding: 0 16px !important; }
    .ar-doc { padding: 0 !important; }
    .ar-header-inner { padding: 20px 16px !important; }
    .ar-meta-bar { gap: 16px !important; padding: 12px 16px !important; }
    .ar-stats-grid { grid-template-columns: 1fr !important; }
    .ar-appliance-head { padding: 10px 14px !important; }
    .ar-comp-td, .ar-comp-th { padding-left: 14px !important; padding-right: 14px !important; }
    .ar-cost-footer { padding: 8px 14px !important; }
    .ar-summary-block { padding: 20px 16px !important; }
  }
`

export default function InspectionApplianceReport() {
  const { id: paramId }  = useParams()
  const { state }        = useLocation()
  const navigate         = useNavigate()
  const [rows, setRows]             = useState(null)
  const [inspection, setInspection] = useState(null)
  const [error, setError]           = useState('')
  const [copied, setCopied]         = useState(false)

  const inspectionId = paramId || state?.inspectionId

  useEffect(() => {
    const prev = document.body.style.background
    document.body.style.background = '#f5f5f6'
    return () => { document.body.style.background = prev }
  }, [])

  useEffect(() => {
    if (!inspectionId) { setError('No inspection ID provided.'); return }
    Promise.all([
      supabase.from('inspections').select('id, pid, house_type, inspection_date').eq('id', inspectionId).single(),
      supabase.from('inspection_line_items').select('*').eq('inspection_id', inspectionId).eq('section_name', 'Appliances'),
    ]).then(([{ data: insp, error: e1 }, { data: items, error: e2 }]) => {
      if (e1 || e2) { setError((e1 || e2).message); return }
      setInspection(insp)
      setRows(items || [])
    })
  }, [inspectionId])

  const shareUrl = `${window.location.origin}/appliance-report/${inspectionId}`

  async function handleCopyLink() {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); return } catch (_) {}
    }
    const ta = document.createElement('textarea')
    ta.value = shareUrl
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch (e) { console.error('Copy failed:', e) }
    document.body.removeChild(ta)
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: `Flent Appliance Report — PID ${inspection?.pid}`, url: shareUrl })
    } else {
      handleCopyLink()
    }
  }

  function handlePrint() {
    const prev = document.title
    document.title = inspection?.pid ? `${inspection.pid} Appliance Report` : 'Appliance Report'
    window.print()
    document.title = prev
  }

  if (!rows || !inspection) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'system-ui, sans-serif', color: error ? '#a05050' : '#9898a4', fontSize: 14 }}>
      {error || 'Loading…'}
    </div>
  )

  const pid = inspection.pid || ''

  // Group by area (appliance name)
  const grouped = {}
  rows.forEach(r => {
    if (!grouped[r.area]) grouped[r.area] = []
    grouped[r.area].push(r)
  })
  const applianceList = Object.entries(grouped)

  const inspectedCount = applianceList.filter(([, comps]) =>
    !comps.every(c => c.availability_status === 'not_available')
  ).length

  const faultyCount = applianceList.filter(([, comps]) =>
    !comps.every(c => c.availability_status === 'not_available') &&
    comps.some(c => c.availability_status !== 'not_available' && c.issue_description !== 'Working')
  ).length

  const totalMaterial = rows.reduce((s, r) => s + (parseFloat(r.material_cost) || 0), 0)
  const totalLabour   = rows.reduce((s, r) => s + (parseFloat(r.labour_cost)   || 0), 0)
  const grandTotal    = totalMaterial + totalLabour

  return (
    <div style={{ minHeight: '100dvh', background: '#f5f5f6', position: 'relative' }}>
      <div style={{ position: 'fixed', inset: 0, backgroundImage: BG_DATA_URL, backgroundRepeat: 'repeat', backgroundSize: '80px 80px', opacity: 0.04, pointerEvents: 'none', zIndex: 0 }} />
      <div className="ar-page" style={{ position: 'relative', zIndex: 1, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#2a2a2e', paddingBottom: 80 }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* ── TOP BAR ── */}
      <div className="ar-topbar no-print" style={{ maxWidth: 760, margin: '0 auto', padding: '16px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ fontSize: 12, color: '#9898a4', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button
            onClick={handlePrint}
            style={{ fontSize: 12, color: '#505058', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0 }}
          >
            Download PDF
          </button>
          <button
            onClick={handleShare}
            style={{ padding: '6px 12px', border: '1px solid #505058', background: 'transparent', color: '#505058', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
          >
            {copied ? '✓ Copied!' : '↗ Share'}
          </button>
        </div>
      </div>

      {/* ── SHARE LINK BAR ── */}
      <div className="ar-share-bar no-print" style={{ maxWidth: 760, margin: '10px auto 0', padding: '0 32px' }}>
        <div style={{ background: '#fff', border: '1px solid #dadadc', borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#9898a4' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 12 }}>🔗 {shareUrl}</span>
          <button
            onClick={handleCopyLink}
            style={{ color: copied ? '#4a7a52' : '#505058', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: copied ? 600 : 400, transition: 'color 0.2s' }}
          >
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      {/* ── DOCUMENT ── */}
      <div className="ar-doc" style={{ maxWidth: 760, margin: '12px auto 0', background: '#fff', border: '1px solid #dadadc' }}>

        {/* ── HEADER ── */}
        <div className="ar-header-inner" style={{ background: '#2a2a2e', padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, background: '#3a3a40', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', padding: 4 }}>
                <img src="/logo.svg" alt="Flent" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = '⚡' }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>Flent</div>
                <div style={{ fontSize: 11, color: '#9898a4', fontStyle: 'italic', marginTop: 2 }}>why rent, when you can flent?</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Appliance Health Report</div>
              {pid && <div style={{ fontSize: 12, color: '#9898a4', marginTop: 4 }}>PID {pid}</div>}
            </div>
          </div>

          {/* Meta bar */}
          <div className="ar-meta-bar" style={{ display: 'flex', gap: 32, marginTop: 16, paddingTop: 16, borderTop: '1px solid #3a3a40', flexWrap: 'wrap' }}>
            {[
              { label: 'Property ID', val: pid || '—' },
              { label: 'Date',        val: fmtDate(inspection.inspection_date) },
              { label: 'Type',        val: inspection.house_type || '—' },
              { label: 'Prepared By', val: 'Flent Operations' },
            ].map(({ label, val }) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: '#6a6a72', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 11, color: '#9898a4' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SUMMARY STATS ── */}
        <div style={{ padding: '24px 32px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#505058', marginBottom: 14 }}>Appliance Condition Summary</div>
          <div className="ar-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#dadadc' }}>
            {[
              { label: 'Appliances Inspected', value: inspectedCount, color: '#2a2a2e' },
              { label: 'Faulty Appliances',    value: faultyCount,     color: faultyCount > 0 ? '#a05050' : '#2a2a2e' },
              { label: 'Est. Repair Cost',     value: grandTotal > 0 ? `₹${fmt(grandTotal)}` : '—', color: grandTotal > 0 ? '#505058' : '#9898a4' },
            ].map(s => (
              <div key={s.label} style={{ background: '#fff', padding: '20px 24px' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#9898a4', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── PER-APPLIANCE SECTIONS ── */}
        <div style={{ padding: '24px 32px' }}>
          {applianceList.map(([appName, comps]) => {
            const isNA = comps.every(c => c.availability_status === 'not_available')
            if (isNA) return null

            const scorable = comps.filter(c => c.item_score != null && c.availability_status !== 'not_available')
            const healthScore = scorable.length
              ? Math.round(scorable.reduce((s, c) => s + (c.item_score || 5), 0) / scorable.length)
              : null
            const { color: hColor, label: hLabel } = healthBand(healthScore)

            const appMaterial = comps.reduce((s, c) => s + (parseFloat(c.material_cost) || 0), 0)
            const appLabour   = comps.reduce((s, c) => s + (parseFloat(c.labour_cost)   || 0), 0)
            const appTotal    = appMaterial + appLabour

            return (
              <div key={appName} style={{ background: '#fff', border: '1px solid #dadadc', borderRadius: 6, marginBottom: 12, overflow: 'hidden' }}>

                {/* Appliance header */}
                <div className="ar-appliance-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: '#f5f5f6', borderBottom: '1px solid #dadadc' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#2a2a2e' }}>{appName}</span>
                  <span style={{ fontSize: 12, color: hColor, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: hColor, display: 'inline-block', flexShrink: 0 }} />
                    {healthScore !== null ? `${healthScore}/10 · ` : ''}{hLabel}
                  </span>
                </div>

                {/* Component table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #ededef' }}>
                      <th className="ar-comp-th" style={{ textAlign: 'left', padding: '8px 20px', color: '#9898a4', fontWeight: 500, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Component</th>
                      <th style={{ textAlign: 'center', padding: '8px', color: '#9898a4', fontWeight: 500, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                      <th className="ar-comp-th" style={{ textAlign: 'right', padding: '8px 20px', color: '#9898a4', fontWeight: 500, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comps.map((comp, ci) => {
                      const statusKey = comp.availability_status === 'not_available' ? 'na'
                        : comp.issue_description === 'Working' ? 'working'
                        : 'faulty'
                      const statusLabel = statusKey === 'na' ? 'N/A' : statusKey === 'working' ? 'Working' : 'Faulty'
                      const pillStyle = statusKey === 'working'
                        ? { background: '#f0f5f1', color: '#4a7a52' }
                        : statusKey === 'faulty'
                        ? { background: '#f8f0f0', color: '#a05050' }
                        : { background: '#f0f0f2', color: '#9898a4' }
                      const compCost = (parseFloat(comp.material_cost) || 0) + (parseFloat(comp.labour_cost) || 0)

                      return (
                        <tr key={ci} style={{ borderBottom: ci < comps.length - 1 ? '1px solid #f0f0f2' : 'none' }}>
                          <td className="ar-comp-td" style={{ padding: '9px 20px', color: '#38383e', verticalAlign: 'middle' }}>
                            <div>{comp.item_name}</div>
                            {statusKey === 'faulty' && comp.action && (
                              <div style={{ fontSize: 10, color: '#a05050', marginTop: 2 }}>{comp.action}</div>
                            )}
                          </td>
                          <td style={{ padding: '9px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                            <span style={{ padding: '2px 10px', borderRadius: 100, fontSize: 10, fontWeight: 500, ...pillStyle }}>{statusLabel}</span>
                          </td>
                          <td className="ar-comp-td" style={{ padding: '9px 20px', textAlign: 'right', color: compCost > 0 ? '#38383e' : '#bbb', fontFamily: 'monospace', fontSize: 12, verticalAlign: 'middle' }}>
                            {compCost > 0 ? `₹${fmt(compCost)}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Per-appliance cost footer */}
                {appTotal > 0 && (
                  <div className="ar-cost-footer" style={{ display: 'flex', gap: 20, padding: '10px 20px', background: '#fafafa', borderTop: '1px solid #ededef', fontSize: 11, color: '#9898a4' }}>
                    <span>Labour: ₹{fmt(appLabour)}</span>
                    <span>Material: ₹{fmt(appMaterial)}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#505058' }}>Total: ₹{fmt(appTotal)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── COST SUMMARY ── */}
        {grandTotal > 0 && (
          <div className="ar-summary-block" style={{ background: '#2a2a2e', padding: '24px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Cost Summary</span>
              {pid && <span style={{ fontSize: 10, color: '#6a6a72' }}>PID {pid}</span>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
              <span style={{ color: '#9898a4' }}>Labour</span>
              <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>₹{fmt(totalLabour)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
              <span style={{ color: '#9898a4' }}>Material</span>
              <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>₹{fmt(totalMaterial)}</span>
            </div>
            <div style={{ borderTop: '1px solid #3a3a40', marginTop: 8, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Grand Total</span>
              <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>₹{fmt(grandTotal)}</span>
            </div>
          </div>
        )}

      </div>
      </div>
    </div>
  )
}
