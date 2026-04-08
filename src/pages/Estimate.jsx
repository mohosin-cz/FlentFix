import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const BAND = {
  green: { text: '#1E5C38', dot: '#1E5C38', label: 'Good',             shortLabel: 'Good' },
  amber: { text: '#6B2A3A', dot: '#6B2A3A', label: 'Needs Attention',  shortLabel: 'Att.' },
  red:   { text: '#8B1A28', dot: '#8B1A28', label: 'Critical',         shortLabel: 'Poor' },
}

function band(displayScore) {
  if (displayScore == null) return 'amber'
  const raw = displayScore / 10
  if (raw >= 7) return 'green'
  if (raw >= 4) return 'amber'
  return 'red'
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function addDays(str, days) {
  if (!str) return '—'
  const d = new Date(str)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

// ─── Styles ───────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Source+Sans+3:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; }

  .er-wrap {
    min-height: 100dvh;
    background: #F8F6F1;
    padding: 0 0 80px;
    font-family: 'Source Sans 3', sans-serif;
    color: #1E1E1E;
    -webkit-font-smoothing: antialiased;
  }

  .er-topbar {
    max-width: 760px;
    margin: 0 auto;
    padding: 16px 48px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .er-back {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 12px;
    color: #5C5C5C;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .er-pdf-link {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 12px;
    color: #1E1E1E;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    padding: 0;
  }

  .er-doc {
    max-width: 760px;
    margin: 12px auto 0;
    background: #fff;
    border: 1px solid #D4CFC6;
  }

  /* ── HEADER ── */
  .er-header {
    background: #1C1C1C;
    padding: 22px 48px 0;
  }
  .er-header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    padding-bottom: 16px;
  }
  .er-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .er-logo-box {
    width: 38px; height: 38px;
    background: #fff;
    border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; overflow: hidden; padding: 3px;
  }
  .er-logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .er-brand-name {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 15px; font-weight: 700;
    color: #fff; line-height: 1.1;
    letter-spacing: -0.2px;
  }
  .er-brand-tag {
    font-family: 'Cormorant Garamond', serif;
    font-size: 14px; font-weight: 400;
    color: rgba(255,255,255,0.55);
    font-style: italic; margin-top: 3px;
  }
  .er-doc-right { text-align: right; }
  .er-doc-title {
    font-family: 'Poppins', sans-serif;
    font-size: 22px; font-weight: 600;
    color: #fff; line-height: 1.2;
    letter-spacing: -0.2px;
  }
  .er-doc-pid {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 15px; font-weight: 700; color: rgba(255,255,255,0.65);
    margin-top: 6px; letter-spacing: 0.04em;
  }

  .er-meta-strip {
    border-top: 1px solid rgba(255,255,255,0.12);
    padding: 11px 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0;
  }
  .er-meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 20px 0 0;
    margin-right: 20px;
    border-right: 1px solid rgba(255,255,255,0.12);
  }
  .er-meta-item:last-child { border-right: none; margin-right: 0; padding-right: 0; }
  .er-meta-label {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 8px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: rgba(255,255,255,0.3);
  }
  .er-meta-val {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px; color: rgba(255,255,255,0.7);
  }

  /* ── SECTIONS ── */
  .er-section {
    padding: 32px 48px;
    border-top: 1px solid #D4CFC6;
  }
  .er-section:first-of-type { border-top: none; }
  .er-section-label {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: #1E1E1E; margin-bottom: 20px;
  }

  /* ── EXECUTIVE SUMMARY ── */
  .er-stats-row {
    display: flex;
    gap: 40px;
    margin-bottom: 28px;
  }
  .er-stat {}
  .er-stat-num {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 28px; font-weight: 500;
    color: #1E1E1E; line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .er-stat-lbl {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.08em;
    color: #5C5C5C; margin-top: 5px;
  }
  .er-stat-sep {
    width: 1px; background: #D4CFC6; align-self: stretch; flex-shrink: 0;
  }
  .er-health-line {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 12px; color: #5C5C5C; margin-bottom: 8px;
    display: flex; gap: 6px; align-items: center;
  }
  .er-health-score-val {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 12px; font-weight: 500;
  }
  .er-bar-track {
    height: 4px; background: #D4CFC6; border-radius: 2px;
    overflow: hidden; margin-bottom: 12px;
  }
  .er-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
  .er-verdict {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 13px; color: #5C5C5C; line-height: 1.7;
    font-style: italic;
  }

  /* ── TRADE TABLE ── */
  .er-trade-table {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Source Sans 3', sans-serif;
    font-size: 13px;
  }
  .er-trade-table thead tr {
    border-bottom: 1px solid #1E1E1E;
  }
  .er-trade-table th {
    font-size: 9px; font-weight: 700;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: #5C5C5C; padding: 0 0 8px; text-align: left;
  }
  .er-trade-table th.r { text-align: right; }
  .er-trade-table td {
    padding: 10px 0;
    border-bottom: 1px solid #D4CFC6;
    color: #1E1E1E; vertical-align: middle;
  }
  .er-trade-table td.r {
    text-align: right;
    font-family: 'Source Sans 3', sans-serif;
    font-size: 13px; font-variant-numeric: tabular-nums;
  }
  .er-trade-table td.muted { color: #5C5C5C; font-family: 'DM Mono', monospace; font-size: 12px; }
  .er-trade-table tfoot tr {
    border-top: 1px solid #1E1E1E;
  }
  .er-trade-table tfoot td {
    padding: 10px 0 0;
    font-weight: 700; border-bottom: none;
  }
  .er-score-dot {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: 'Source Sans 3', sans-serif; font-size: 11px;
  }

  /* ── ITEMISED SECTIONS ── */
  .er-trade-section {
    border-top: 1px solid #D4CFC6;
    padding: 28px 48px;
    page-break-inside: avoid;
  }
  .er-trade-section:nth-child(even) { background: #F8F6F1; }
  .er-trade-section:nth-child(odd)  { background: #FFFFFF; }
  .er-trade-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 16px;
  }
  .er-trade-head-name {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: #1E1E1E; white-space: nowrap;
  }
  .er-leader {
    flex: 1; height: 0;
    border-bottom: 1px dotted #D4CFC6;
    margin: 0 6px; position: relative; top: -4px;
  }
  .er-trade-head-right {
    display: flex; align-items: center; gap: 10px;
    white-space: nowrap;
  }
  .er-trade-head-total {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 15px; font-weight: 600; color: #1C1C1C;
  }

  .er-item { padding: 12px 0; border-bottom: 1px solid #D4CFC6; }
  .er-item:last-of-type { border-bottom: none; }
  .er-item-row1 {
    display: flex; align-items: baseline; gap: 10px; margin-bottom: 5px;
  }
  .er-item-num {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 10px; color: #aaa; flex-shrink: 0; width: 18px;
  }
  .er-item-area {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px; font-weight: 500; color: #5C5C5C;
    background: #EEECE8; border-radius: 2px;
    padding: 1px 6px; flex-shrink: 0;
  }
  .er-item-desc {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 14px; color: #1E1E1E; line-height: 1.7; flex: 1;
  }
  .er-item-total {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 15px; font-weight: 600; color: #1C1C1C;
    white-space: nowrap; flex-shrink: 0;
  }
  .er-item-row2 {
    display: flex; align-items: center; gap: 8px;
    padding-left: 28px;
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px; color: #5C5C5C;
    flex-wrap: wrap;
  }
  .er-fix-type {
    font-size: 10px; font-weight: 600; color: #1E1E1E;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .er-cost-detail {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px; color: #5C5C5C;
  }

  .er-section-subtotal {
    display: flex; justify-content: flex-end;
    padding-top: 12px; margin-top: 4px;
    border-top: 1px solid #D4CFC6;
  }
  .er-subtotal-label {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px; color: #5C5C5C; margin-right: 8px;
  }
  .er-subtotal-val {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 15px; font-weight: 600; color: #1C1C1C;
  }

  /* ── COST SUMMARY ── */
  .er-cost-block {
    background: #1C1C1C;
    padding: 32px 48px;
  }
  .er-cs-head {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 20px;
  }
  .er-cs-title {
    font-family: 'Poppins', sans-serif;
    font-size: 16px; font-weight: 600; color: #fff;
  }
  .er-cs-pid {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 10px; color: rgba(255,255,255,0.28);
  }
  .er-cs-row {
    display: flex; justify-content: space-between;
    padding: 8px 0; font-family: 'Source Sans 3', sans-serif; font-size: 13px;
  }
  .er-cs-lbl { color: rgba(255,255,255,0.45); }
  .er-cs-val {
    font-family: 'Source Sans 3', sans-serif;
    color: rgba(255,255,255,0.7);
    font-variant-numeric: tabular-nums;
  }
  .er-cs-rule { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 8px 0; }
  .er-grand-row {
    display: flex; justify-content: space-between; align-items: baseline;
    padding-top: 6px;
  }
  .er-grand-lbl {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 13px; font-weight: 600; color: #fff;
  }
  .er-grand-val {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 28px; font-weight: 500; color: #fff;
    font-variant-numeric: tabular-nums;
  }

  /* ── FOOTER ── */
  .er-footer {
    padding: 24px 48px 32px;
    border-top: 1px solid #D4CFC6;
  }
  .er-disclaimer {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px; color: #5C5C5C; line-height: 1.75;
    margin-bottom: 16px;
  }
  .er-rate-link {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px; color: #1E1E1E;
    text-decoration: underline;
    text-underline-offset: 3px;
    background: none; border: none;
    cursor: pointer; padding: 0; margin-bottom: 16px;
    display: inline-block;
  }
  .er-prepared {
    font-family: 'Source Sans 3', sans-serif;
    font-size: 11px; color: #5C5C5C; line-height: 1.6;
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 600px) {
    .er-topbar { padding: 12px 20px 0; }
    .er-doc    { margin: 10px auto 0; }
    .er-header { padding: 22px 20px 0; }
    .er-section { padding: 24px 20px; }
    .er-trade-section { padding: 22px 20px; }
    .er-cost-block    { padding: 26px 20px; }
    .er-footer        { padding: 22px 20px 24px; }
    .er-stats-row { gap: 20px; }
    .er-stat-num  { font-size: 22px; }
    .er-doc-title { font-size: 18px; }
    .er-grand-val { font-size: 22px; }
    .er-trade-table td.hide-mobile { display: none; }
    .er-trade-table th.hide-mobile { display: none; }
    .er-item-row1 { flex-wrap: wrap; }
    .er-item-total { margin-left: auto; }
    .er-meta-strip { gap: 8px 0; }
    .er-meta-item { padding: 2px 14px 2px 0; margin-right: 14px; }
  }

  /* ── PRINT ── */
  @media print {
    .no-print { display: none !important; }
    body, #root { background: #fff !important; padding: 0 !important; }
    .er-wrap  { background: #fff !important; padding: 0 !important; }
    .er-doc   { border: none !important; margin: 0 !important; max-width: 100% !important; }
    .er-trade-section { page-break-inside: avoid; }
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
`

// ─── Component ────────────────────────────────────────────────────────────────
export default function Estimate() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const prev = document.body.style.background
    const prevPad = document.body.style.padding
    document.body.style.background = '#f4f4f4'
    document.body.style.padding = '0'
    return () => {
      document.body.style.background = prev
      document.body.style.padding = prevPad
    }
  }, [])

  useEffect(() => {
    if (!inspection?.pid) return
    const prev = document.title
    document.title = `${inspection.pid} Estimate`
    return () => { document.title = prev }
  }, [inspection?.pid])

  useEffect(() => {
    supabase
      .from('inspections')
      .select('*, inspection_line_items(*)')
      .eq('id', id)
      .single()
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setInspection(data)
        setLoading(false)
      })
  }, [id])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'Inter, sans-serif', color: '#888', fontSize: 14 }}>
      Loading…
    </div>
  )

  if (error || !inspection) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'Inter, sans-serif', color: '#8b1a2a', fontSize: 14 }}>
      {error || 'Inspection not found'}
    </div>
  )

  // ── Derived data ─────────────────────────────────────────────────────────────
  const items = inspection.inspection_line_items || []
  const pid   = inspection.pid || ''

  const sectionMap = {}
  items.forEach(item => {
    const s = item.section_name || 'Other'
    if (!sectionMap[s]) sectionMap[s] = []
    sectionMap[s].push(item)
  })
  const sectionList = Object.entries(sectionMap)

  function sectionScore(rows) {
    const scorable = rows.filter(r => r.item_score != null && r.availability_status !== 'not_available')
    if (!scorable.length) return null
    const avg = scorable.reduce((s, r) => s + (r.item_score !== 0 ? r.item_score : 5), 0) / scorable.length
    return Math.round(avg * 10)
  }

  const sectionScores = Object.fromEntries(
    sectionList.map(([name, rows]) => [name, sectionScore(rows)])
  )

  const validScores   = Object.values(sectionScores).filter(v => v != null)
  const overallScore  = validScores.length ? Math.round(validScores.reduce((s, v) => s + v, 0) / validScores.length) : null
  const overallBand   = band(overallScore)
  const overallColors = BAND[overallBand]

  const totalMaterial = items.reduce((s, r) => s + (r.material_cost || 0), 0)
  const totalLabour   = items.reduce((s, r) => s + (r.labour_cost   || 0), 0)
  const grandTotal    = totalMaterial + totalLabour

  function secTotal(rows) { return rows.reduce((s, r) => s + (r.material_cost || 0) + (r.labour_cost || 0), 0) }

  const issueCount     = items.filter(r => r.availability_status !== 'not_available').length
  const tradesAffected = sectionList.filter(([, rows]) =>
    rows.some(r => r.availability_status !== 'not_available' && ((r.material_cost || 0) + (r.labour_cost || 0)) > 0)
  ).length

  const issueNumColor = issueCount > 5 ? BAND.red.text : issueCount > 1 ? BAND.amber.text : BAND.green.text

  const verdictText = overallBand === 'green'
    ? `This property is in good condition across all inspected trades.`
    : overallBand === 'amber'
    ? `This property requires remedial work across ${tradesAffected} trade${tradesAffected !== 1 ? 's' : ''} prior to tenant move-in.`
    : `This property has critical maintenance requirements across ${tradesAffected} trade${tradesAffected !== 1 ? 's' : ''} — immediate action required.`

  function handlePrint() {
    const prev = document.title
    document.title = pid ? `${pid} Estimate` : 'Estimate'
    window.print()
    document.title = prev
  }

  return (
    <div className="er-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Top controls */}
      <div className="er-topbar no-print">
        <button className="er-back" onClick={() => navigate(-1)}>← Back</button>
        <button className="er-pdf-link" onClick={handlePrint}>Download PDF</button>
      </div>

      <div className="er-doc">

        {/* ── HEADER ── */}
        <div className="er-header">
          <div className="er-header-top">
            <div className="er-brand">
              <div className="er-logo-box">
                <img src="/logo.svg" alt="Flent" />
              </div>
              <div>
                <div className="er-brand-name">Flent</div>
                <div className="er-brand-tag">why rent, when you can flent?</div>
              </div>
            </div>
            <div className="er-doc-right">
              <div className="er-doc-title">Estimate and Health Report</div>
              {pid && <div className="er-doc-pid">PID {pid}</div>}
            </div>
          </div>

          <div className="er-meta-strip">
            {[
              { label: 'Property ID',     val: pid || '—' },
              { label: 'Date',            val: fmtDate(inspection.inspection_date) },
              { label: 'Type',            val: inspection.house_type || '—' },
              { label: 'Valid Until',     val: addDays(inspection.inspection_date, 30) },
              { label: 'Prepared By',     val: 'Flent Operations' },
            ].map(({ label, val }) => (
              <div key={label} className="er-meta-item">
                <span className="er-meta-label">{label}</span>
                <span className="er-meta-val">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── EXECUTIVE SUMMARY ── */}
        <div className="er-section">
          <div className="er-section-label">Property Condition Summary</div>

          <div className="er-stats-row">
            <div className="er-stat">
              <div className="er-stat-num" style={{ color: issueNumColor }}>{issueCount}</div>
              <div className="er-stat-lbl">Issues Found</div>
            </div>
            <div className="er-stat-sep" />
            <div className="er-stat">
              <div className="er-stat-num">{tradesAffected}</div>
              <div className="er-stat-lbl">Trades Affected</div>
            </div>
            <div className="er-stat-sep" />
            <div className="er-stat">
              <div className="er-stat-num" style={{ fontSize: 24 }}>₹{fmt(grandTotal)}</div>
              <div className="er-stat-lbl">Total Estimate</div>
            </div>
          </div>

          <div className="er-health-line">
            <span>Overall Health Score:</span>
            <span className="er-health-score-val" style={{ color: overallColors.text }}>
              {overallScore ?? '—'}/100 — {overallColors.label}
            </span>
          </div>
          <div className="er-bar-track">
            <div className="er-bar-fill" style={{ width: `${overallScore ?? 0}%`, background: overallColors.dot }} />
          </div>
          <div className="er-verdict">{verdictText}</div>
        </div>

        {/* ── TRADE BREAKDOWN TABLE ── */}
        <div className="er-section">
          <div className="er-section-label">Trade Breakdown</div>
          <table className="er-trade-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Trade</th>
                <th className="hide-mobile" style={{ width: '12%' }}>Items</th>
                <th style={{ width: '28%' }}>Score</th>
                <th className="r" style={{ width: '20%' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {sectionList.map(([name, rows]) => {
                const sc   = sectionScores[name]
                const b    = band(sc)
                const c    = BAND[b]
                const cost = secTotal(rows)
                return (
                  <tr key={name}>
                    <td style={{ fontWeight: 500 }}>{name}</td>
                    <td className="muted hide-mobile">{rows.length}</td>
                    <td>
                      <span className="er-score-dot">
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontFamily: 'Source Sans 3, sans-serif', fontSize: 11, color: c.text }}>{sc ?? '—'}</span>
                        <span style={{ color: '#aaa', fontSize: 11 }}>·</span>
                        <span style={{ color: c.text, fontSize: 11 }}>{c.shortLabel}</span>
                      </span>
                    </td>
                    <td className="r">₹{fmt(cost)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} style={{ color: '#888', fontSize: 11, fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Total</td>
                <td className="hide-mobile" />
                <td className="r" style={{ color: '#111' }}>₹{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── ITEMISED SECTIONS ── */}
        {sectionList.map(([name, rows]) => {
          const sc   = sectionScores[name]
          const b    = band(sc)
          const c    = BAND[b]
          const tot  = secTotal(rows)

          return (
            <div key={name} className="er-trade-section">
              <div className="er-trade-head">
                <span className="er-trade-head-name">{name}</span>
                <span className="er-leader" />
                <div className="er-trade-head-right">
                  {sc != null && (
                    <span className="er-score-dot">
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: c.text }}>{sc}/100 · {c.label}</span>
                    </span>
                  )}
                  <span className="er-trade-head-total">₹{fmt(tot)}</span>
                </div>
              </div>

              {rows.map((item, idx) => {
                const itemMat   = item.material_cost || 0
                const itemLab   = item.labour_cost   || 0
                const itemTotal = itemMat + itemLab
                const isNA      = item.availability_status === 'not_available'

                const fixType = item.issue_description?.match(/^(Install|Replace|Repair)/i)?.[1] ?? null

                return (
                  <div key={item.id || idx} className="er-item">
                    <div className="er-item-row1">
                      <span className="er-item-num">{String(idx + 1).padStart(2, '0')}</span>
                      {item.area && <span className="er-item-area">{item.area}</span>}
                      <span className="er-item-desc">{item.issue_description || '—'}</span>
                      {!isNA && itemTotal > 0 && (
                        <span className="er-item-total">₹{fmt(itemTotal)}</span>
                      )}
                    </div>
                    {!isNA && (
                      <div className="er-item-row2">
                        {fixType && <span className="er-fix-type">{fixType}</span>}
                        {fixType && (itemMat > 0 || itemLab > 0) && <span style={{ color: '#ddd' }}>·</span>}
                        {itemMat > 0 && <span className="er-cost-detail">Material: ₹{fmt(itemMat)}</span>}
                        {itemMat > 0 && itemLab > 0 && <span style={{ color: '#ddd' }}>·</span>}
                        {itemLab > 0 && <span className="er-cost-detail">Labour: ₹{fmt(itemLab)}</span>}
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="er-section-subtotal">
                <span className="er-subtotal-label">Section total</span>
                <span className="er-subtotal-val">₹{fmt(tot)}</span>
              </div>
            </div>
          )
        })}

        {/* ── COST SUMMARY ── */}
        <div className="er-cost-block">
          <div className="er-cs-head">
            <span className="er-cs-title">Cost Summary</span>
            {pid && <span className="er-cs-pid">PID {pid}</span>}
          </div>
          <div className="er-cs-row">
            <span className="er-cs-lbl">Material</span>
            <span className="er-cs-val">₹{fmt(totalMaterial)}</span>
          </div>
          <div className="er-cs-row">
            <span className="er-cs-lbl">Labour</span>
            <span className="er-cs-val">₹{fmt(totalLabour)}</span>
          </div>
          <hr className="er-cs-rule" />
          <div className="er-grand-row">
            <span className="er-grand-lbl">Grand Total</span>
            <span className="er-grand-val">₹{fmt(grandTotal)}</span>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="er-footer">
          <p className="er-disclaimer">
            Costs estimated basis site inspection and prevailing Bangalore market rates. Final figures may vary subject to actual site conditions. This estimate is valid for 30 days from issue date. Work to commence only upon written approval from the property owner.
          </p>
          <button className="er-rate-link no-print" onClick={() => window.open('/rate-card', '_blank')}>
            Labour Rate Card ↗
          </button>
          <div className="er-prepared">
            Prepared by Flent Operations · ops@flent.in · flent.in
          </div>
        </div>

      </div>
    </div>
  )
}
