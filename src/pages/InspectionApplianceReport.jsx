import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const BAND = {
  green: { text: '#1E5C38', label: 'Good' },
  amber: { text: '#7A4E2D', label: 'Needs Attention' },
  red:   { text: '#8B1A28', label: 'Poor' },
}

function bandFor(score) {
  if (score == null) return 'amber'
  if (score >= 7) return 'green'
  if (score >= 4) return 'amber'
  return 'red'
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Source+Sans+3:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
  *, *::before, *::after { box-sizing: border-box; }

  .ar-wrap {
    min-height: 100dvh;
    background: #F8F6F1;
    padding: 0 0 80px;
    font-family: 'Source Sans 3', sans-serif;
    color: #1E1E1E;
    -webkit-font-smoothing: antialiased;
  }

  .ar-topbar {
    max-width: 760px; margin: 0 auto;
    padding: 16px 48px 0;
    display: flex; justify-content: space-between; align-items: center;
  }
  .ar-back {
    font-family: 'Source Sans 3', sans-serif; font-size: 12px; color: #5C5C5C;
    background: none; border: none; cursor: pointer; padding: 0;
    display: flex; align-items: center; gap: 4px;
  }
  .ar-btn-link {
    font-family: 'Source Sans 3', sans-serif; font-size: 12px; color: #1E1E1E;
    background: none; border: none; cursor: pointer;
    text-decoration: underline; text-underline-offset: 3px; padding: 0;
  }

  .ar-doc {
    max-width: 760px; margin: 12px auto 0;
    background: #fff; border: 1px solid #D4CFC6;
  }

  /* ── HEADER ── */
  .ar-header { background: #1C1C1C; padding: 22px 48px 0; }
  .ar-header-top {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 24px; padding-bottom: 16px;
  }
  .ar-brand { display: flex; align-items: center; gap: 12px; }
  .ar-logo-box {
    width: 38px; height: 38px; background: #fff; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; overflow: hidden; padding: 3px;
  }
  .ar-logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .ar-brand-name {
    font-family: 'Source Sans 3', sans-serif; font-size: 15px; font-weight: 700;
    color: #fff; line-height: 1.1; letter-spacing: -0.2px;
  }
  .ar-brand-tag {
    font-family: 'Cormorant Garamond', serif; font-size: 14px; font-weight: 400;
    color: rgba(255,255,255,0.55); font-style: italic; margin-top: 3px;
  }
  .ar-doc-right { text-align: right; }
  .ar-doc-title {
    font-family: 'Poppins', sans-serif; font-size: 22px; font-weight: 600;
    color: #fff; line-height: 1.2; letter-spacing: -0.2px;
  }
  .ar-doc-pid {
    font-family: 'Source Sans 3', sans-serif; font-size: 15px; font-weight: 700;
    color: rgba(255,255,255,0.65); margin-top: 6px; letter-spacing: 0.04em;
  }

  .ar-meta-strip {
    border-top: 1px solid rgba(255,255,255,0.12);
    padding: 11px 0; display: flex; flex-wrap: wrap; gap: 0;
  }
  .ar-meta-item {
    display: flex; flex-direction: column; gap: 2px;
    padding: 0 20px 0 0; margin-right: 20px;
    border-right: 1px solid rgba(255,255,255,0.12);
  }
  .ar-meta-item:last-child { border-right: none; margin-right: 0; padding-right: 0; }
  .ar-meta-label {
    font-family: 'Source Sans 3', sans-serif; font-size: 8px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.3);
  }
  .ar-meta-val { font-family: 'Source Sans 3', sans-serif; font-size: 11px; color: rgba(255,255,255,0.7); }

  /* ── SUMMARY ── */
  .ar-section { padding: 32px 48px; border-top: 1px solid #D4CFC6; }
  .ar-section-first { border-top: none; }
  .ar-section-label {
    font-family: 'Source Sans 3', sans-serif; font-size: 10px; font-weight: 700;
    letter-spacing: 0.16em; text-transform: uppercase; color: #1E1E1E; margin-bottom: 20px;
  }
  .ar-stats-row { display: flex; gap: 40px; }
  .ar-stat-num {
    font-family: 'Source Sans 3', sans-serif; font-size: 28px; font-weight: 500;
    color: #1E1E1E; line-height: 1; font-variant-numeric: tabular-nums;
  }
  .ar-stat-lbl {
    font-family: 'Source Sans 3', sans-serif; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em; color: #5C5C5C; margin-top: 5px;
  }
  .ar-stat-sep { width: 1px; background: #D4CFC6; align-self: stretch; flex-shrink: 0; }

  /* ── PER-APPLIANCE SECTIONS ── */
  .ar-app-section {
    border-top: 1px solid #D4CFC6; padding: 28px 48px; page-break-inside: avoid;
  }
  .ar-app-section:nth-child(even) { background: #F8F6F1; }
  .ar-app-section:nth-child(odd)  { background: #FFFFFF; }

  .ar-app-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 16px; }
  .ar-app-head-name {
    font-family: 'Source Sans 3', sans-serif; font-size: 11px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase; color: #1E1E1E; white-space: nowrap;
  }
  .ar-leader {
    flex: 1; height: 0; border-bottom: 1px dotted #D4CFC6;
    margin: 0 6px; position: relative; top: -4px;
  }
  .ar-app-head-right { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
  .ar-health-score {
    font-family: 'Source Sans 3', sans-serif; font-size: 12px; font-weight: 600;
    display: flex; align-items: center; gap: 5px;
  }
  .ar-health-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .ar-app-head-total {
    font-family: 'Source Sans 3', sans-serif; font-size: 15px; font-weight: 600; color: #1C1C1C;
  }

  .ar-comp-table {
    width: 100%; border-collapse: collapse;
    font-family: 'Source Sans 3', sans-serif; font-size: 13px;
  }
  .ar-comp-table thead tr { border-bottom: 1px solid #1E1E1E; }
  .ar-comp-table th {
    font-size: 9px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: #5C5C5C; padding: 0 0 8px; text-align: left;
  }
  .ar-comp-table th.r { text-align: right; }
  .ar-comp-table td {
    padding: 9px 0; border-bottom: 1px solid #D4CFC6;
    color: #1E1E1E; vertical-align: middle;
  }
  .ar-comp-table td.r { text-align: right; font-variant-numeric: tabular-nums; }
  .ar-comp-table tr:last-child td { border-bottom: none; }

  .ar-pill { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 600; }
  .ar-pill-working { background: #dcfce7; color: #16a34a; }
  .ar-pill-faulty  { background: #fee2e2; color: #dc2626; }
  .ar-pill-na      { background: #f3f4f6; color: #6b7280; }

  .ar-cost-row {
    display: flex; gap: 16px; font-size: 11px; color: #5C5C5C;
    padding: 10px 0 0; border-top: 1px solid #D4CFC6; margin-top: 4px;
  }
  .ar-cost-row-total { margin-left: auto; font-weight: 600; color: #1C1C1C; }

  /* ── COST SUMMARY ── */
  .ar-cost-block { background: #1C1C1C; padding: 32px 48px; }
  .ar-cs-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 20px; }
  .ar-cs-title { font-family: 'Poppins', sans-serif; font-size: 16px; font-weight: 600; color: #fff; }
  .ar-cs-pid { font-family: 'Source Sans 3', sans-serif; font-size: 10px; color: rgba(255,255,255,0.28); }
  .ar-cs-row { display: flex; justify-content: space-between; padding: 8px 0; font-family: 'Source Sans 3', sans-serif; font-size: 13px; }
  .ar-cs-lbl { color: rgba(255,255,255,0.45); }
  .ar-cs-val { color: rgba(255,255,255,0.7); font-variant-numeric: tabular-nums; }
  .ar-cs-rule { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 8px 0; }
  .ar-grand-row { display: flex; justify-content: space-between; align-items: baseline; padding-top: 6px; }
  .ar-grand-lbl { font-family: 'Source Sans 3', sans-serif; font-size: 13px; font-weight: 600; color: #fff; }
  .ar-grand-val { font-family: 'Source Sans 3', sans-serif; font-size: 28px; font-weight: 500; color: #fff; font-variant-numeric: tabular-nums; }

  /* ── RESPONSIVE ── */
  @media (max-width: 600px) {
    .ar-topbar { padding: 12px 20px 0; }
    .ar-share-bar { padding: 0 20px; }
    .ar-doc { margin: 10px auto 0; }
    .ar-header { padding: 22px 20px 0; }
    .ar-section { padding: 24px 20px; }
    .ar-app-section { padding: 22px 20px; }
    .ar-cost-block { padding: 26px 20px; }
    .ar-stats-row { gap: 20px; }
    .ar-stat-num { font-size: 22px; }
    .ar-doc-title { font-size: 18px; }
    .ar-grand-val { font-size: 22px; }
    .ar-meta-strip { gap: 8px 0; }
    .ar-meta-item { padding: 2px 14px 2px 0; margin-right: 14px; }
  }

  /* ── PRINT ── */
  @media print {
    .no-print { display: none !important; }
    body, #root { background: #fff !important; padding: 0 !important; }
    .ar-wrap { background: #fff !important; padding: 0 !important; }
    .ar-doc { border: none !important; margin: 0 !important; max-width: 100% !important; }
    .ar-app-section { page-break-inside: avoid; }
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
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
    document.body.style.background = '#F8F6F1'
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'Source Sans 3, sans-serif', color: error ? '#8b1a2a' : '#888', fontSize: 14 }}>
      {error || 'Loading…'}
    </div>
  )

  const pid = inspection.pid || ''

  // Group rows by area (appliance name)
  const grouped = {}
  rows.forEach(r => {
    if (!grouped[r.area]) grouped[r.area] = []
    grouped[r.area].push(r)
  })
  const applianceList = Object.entries(grouped)

  const totalInspected = applianceList.filter(([, comps]) =>
    !comps.every(c => c.availability_status === 'not_available')
  ).length

  const faultyAppliances = applianceList.filter(([, comps]) =>
    !comps.every(c => c.availability_status === 'not_available') &&
    comps.some(c => c.availability_status !== 'not_available' && c.issue_description !== 'Working')
  ).length

  const totalMaterial = rows.reduce((s, r) => s + (parseFloat(r.material_cost) || 0), 0)
  const totalLabour   = rows.reduce((s, r) => s + (parseFloat(r.labour_cost)   || 0), 0)
  const grandTotal    = totalMaterial + totalLabour

  return (
    <div className="ar-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Top controls */}
      <div className="ar-topbar no-print">
        <button className="ar-back" onClick={() => navigate(-1)}>← Back</button>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button className="ar-btn-link" onClick={handlePrint}>Download PDF</button>
          <button
            onClick={handleShare}
            style={{ padding: '6px 12px', border: '1px solid #c8963e', background: 'transparent', color: '#c8963e', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
          >
            {copied ? '✓ Copied!' : '↗ Share'}
          </button>
        </div>
      </div>

      {/* Share link bar */}
      <div className="ar-share-bar no-print" style={{ maxWidth: 760, margin: '10px auto 0', padding: '0 48px' }}>
        <div style={{ background: '#f8f6f1', border: '1px solid #e8e0d0', borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#999' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 12 }}>🔗 {shareUrl}</span>
          <button
            onClick={handleCopyLink}
            style={{ color: copied ? '#22c55e' : '#c8963e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: copied ? 600 : 400, transition: 'color 0.2s' }}
          >
            {copied ? '✓ Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      <div className="ar-doc">

        {/* ── HEADER ── */}
        <div className="ar-header">
          <div className="ar-header-top">
            <div className="ar-brand">
              <div className="ar-logo-box"><img src="/logo.svg" alt="Flent" /></div>
              <div>
                <div className="ar-brand-name">Flent</div>
                <div className="ar-brand-tag">why rent, when you can flent?</div>
              </div>
            </div>
            <div className="ar-doc-right">
              <div className="ar-doc-title">Appliance Health Report</div>
              {pid && <div className="ar-doc-pid">PID {pid}</div>}
            </div>
          </div>

          <div className="ar-meta-strip">
            {[
              { label: 'Property ID', val: pid || '—' },
              { label: 'Date',        val: fmtDate(inspection.inspection_date) },
              { label: 'Type',        val: inspection.house_type || '—' },
              { label: 'Prepared By', val: 'Flent Operations' },
            ].map(({ label, val }) => (
              <div key={label} className="ar-meta-item">
                <span className="ar-meta-label">{label}</span>
                <span className="ar-meta-val">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── CONDITION SUMMARY ── */}
        <div className="ar-section ar-section-first">
          <div className="ar-section-label">Appliance Condition Summary</div>
          <div className="ar-stats-row">
            <div className="ar-stat">
              <div className="ar-stat-num">{totalInspected}</div>
              <div className="ar-stat-lbl">Inspected</div>
            </div>
            <div className="ar-stat-sep" />
            <div className="ar-stat">
              <div className="ar-stat-num" style={{ color: faultyAppliances > 0 ? '#8B1A28' : '#1E1E1E' }}>
                {faultyAppliances}
              </div>
              <div className="ar-stat-lbl">Faulty</div>
            </div>
            <div className="ar-stat-sep" />
            <div className="ar-stat">
              <div className="ar-stat-num" style={{ color: grandTotal > 0 ? '#7A4E2D' : '#1E1E1E' }}>
                {grandTotal > 0 ? `₹${fmt(grandTotal)}` : '—'}
              </div>
              <div className="ar-stat-lbl">Est. Cost</div>
            </div>
          </div>
        </div>

        {/* ── PER-APPLIANCE SECTIONS ── */}
        {applianceList.map(([appName, comps]) => {
          const isNA = comps.every(c => c.availability_status === 'not_available')
          if (isNA) return null

          const scorable = comps.filter(c => c.item_score != null && c.availability_status !== 'not_available')
          const healthScore = scorable.length
            ? Math.round(scorable.reduce((s, c) => s + (c.item_score || 5), 0) / scorable.length)
            : null
          const b = bandFor(healthScore)
          const bandColors = BAND[b]

          const appMaterial = comps.reduce((s, c) => s + (parseFloat(c.material_cost) || 0), 0)
          const appLabour   = comps.reduce((s, c) => s + (parseFloat(c.labour_cost)   || 0), 0)
          const appTotal    = appMaterial + appLabour

          return (
            <div key={appName} className="ar-app-section">

              {/* Appliance header */}
              <div className="ar-app-head">
                <span className="ar-app-head-name">{appName}</span>
                <span className="ar-leader" />
                <div className="ar-app-head-right">
                  {healthScore !== null && (
                    <span className="ar-health-score" style={{ color: bandColors.text }}>
                      <span className="ar-health-dot" style={{ background: bandColors.text }} />
                      {healthScore}/10 · {bandColors.label}
                    </span>
                  )}
                  {appTotal > 0 && (
                    <span className="ar-app-head-total">₹{fmt(appTotal)}</span>
                  )}
                </div>
              </div>

              {/* Component table */}
              <table className="ar-comp-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th className="r">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {comps.map((comp, ci) => {
                    const statusKey = comp.availability_status === 'not_available' ? 'na'
                      : comp.issue_description === 'Working' ? 'working'
                      : 'faulty'
                    const statusLabel = statusKey === 'na' ? 'N/A' : statusKey === 'working' ? 'Working' : 'Faulty'
                    const compCost = (parseFloat(comp.material_cost) || 0) + (parseFloat(comp.labour_cost) || 0)
                    return (
                      <tr key={ci}>
                        <td>
                          <div>{comp.item_name}</div>
                          {statusKey === 'faulty' && comp.action && (
                            <div style={{ fontSize: 11, color: '#8B1A28', marginTop: 2 }}>{comp.action}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`ar-pill ar-pill-${statusKey}`}>{statusLabel}</span>
                        </td>
                        <td className="r" style={{ color: compCost > 0 ? '#1C1C1C' : '#bbb' }}>
                          {compCost > 0 ? `₹${fmt(compCost)}` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Per-appliance cost breakdown */}
              {appTotal > 0 && (
                <div className="ar-cost-row">
                  <span>Labour: ₹{fmt(appLabour)}</span>
                  <span>Material: ₹{fmt(appMaterial)}</span>
                  <span className="ar-cost-row-total">Total: ₹{fmt(appTotal)}</span>
                </div>
              )}
            </div>
          )
        })}

        {/* ── COST SUMMARY ── */}
        {grandTotal > 0 && (
          <div className="ar-cost-block">
            <div className="ar-cs-head">
              <span className="ar-cs-title">Cost Summary</span>
              {pid && <span className="ar-cs-pid">PID {pid}</span>}
            </div>
            <div className="ar-cs-row">
              <span className="ar-cs-lbl">Labour</span>
              <span className="ar-cs-val">₹{fmt(totalLabour)}</span>
            </div>
            <div className="ar-cs-row">
              <span className="ar-cs-lbl">Material</span>
              <span className="ar-cs-val">₹{fmt(totalMaterial)}</span>
            </div>
            <hr className="ar-cs-rule" />
            <div className="ar-grand-row">
              <span className="ar-grand-lbl">Grand Total</span>
              <span className="ar-grand-val">₹{fmt(grandTotal)}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
