import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const BAND_COLORS = {
  green: { bg: '#e8f5ee', text: '#1a6b3c', dot: '#1a6b3c', label: 'Good' },
  amber: { bg: '#fff4e0', text: '#a05c00', dot: '#a05c00', label: 'Needs Attention' },
  red:   { bg: '#fdeaed', text: '#9b1f35', dot: '#9b1f35', label: 'Critical' },
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
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function addDays(str, days) {
  if (!str) return '—'
  const d = new Date(str)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

// ─── Injected styles ──────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap');

  .ep-wrap {
    min-height: 100dvh;
    background: #f0f0f0;
    font-family: 'Poppins', sans-serif;
    padding: 0 0 100px;
  }

  .ep-doc {
    max-width: 860px;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 2px 24px rgba(0,0,0,0.10);
  }

  /* ── Block 1: Header ── */
  .ep-header {
    background: #0d0d0d;
    padding: 28px 36px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
  }
  .ep-brand { display: flex; align-items: center; gap: 12px; }
  .ep-logo-box {
    width: 42px; height: 42px; border-radius: 9px;
    background: #fff; display: flex; align-items: center;
    justify-content: center; flex-shrink: 0; overflow: hidden; padding: 4px;
  }
  .ep-logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .ep-brand-text {}
  .ep-brand-name { font-size: 17px; font-weight: 700; color: #fff; line-height: 1.1; }
  .ep-brand-tag  { font-size: 10px; color: rgba(255,255,255,0.38); font-style: italic; margin-top: 2px; }
  .ep-doc-meta   { text-align: right; }
  .ep-doc-title  { font-size: 20px; font-weight: 700; color: #fff; letter-spacing: -0.3px; line-height: 1.2; }
  .ep-doc-pid    { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.45); margin-top: 5px; font-family: monospace; }

  .ep-info-strip {
    background: #1e1e1e;
    padding: 11px 36px;
    display: flex; flex-wrap: wrap; gap: 6px 20px;
  }
  .ep-info-item { display: flex; gap: 6px; align-items: center; }
  .ep-info-label { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.3); }
  .ep-info-val   { font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.65); }
  .ep-info-sep   { width: 1px; height: 14px; background: rgba(255,255,255,0.1); align-self: center; }

  /* ── Block 2: Executive Summary ── */
  .ep-summary {
    background: #f7f7f7;
    border-bottom: 1px solid #e8e8e8;
    padding: 28px 36px;
  }
  .ep-block-title {
    font-size: 13px; font-weight: 700; color: #0d0d0d;
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 20px;
  }
  .ep-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 22px;
  }
  .ep-stat-box {
    background: #fff; border: 1px solid #e8e8e8;
    border-radius: 10px; padding: 16px;
  }
  .ep-stat-val { font-size: 28px; font-weight: 800; line-height: 1; }
  .ep-stat-label { font-size: 11px; color: #888; margin-top: 5px; }
  .ep-health-bar-wrap {}
  .ep-health-row {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 8px;
  }
  .ep-health-label { font-size: 12px; font-weight: 600; color: #444; }
  .ep-health-score { font-size: 12px; font-weight: 700; }
  .ep-bar-track {
    height: 8px; background: #e8e8e8; border-radius: 4px;
    overflow: hidden; margin-bottom: 10px;
  }
  .ep-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
  .ep-verdict { font-size: 12px; color: #555; line-height: 1.5; }

  /* ── Block 3: Trade Impact ── */
  .ep-trades {
    padding: 28px 36px;
    border-bottom: 1px solid #e8e8e8;
  }
  .ep-trade-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .ep-trade-row {
    background: #fafafa;
    border: 1px solid #efefef;
    border-radius: 8px;
    padding: 12px 14px;
  }
  .ep-trade-top {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 8px;
  }
  .ep-trade-name { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #0d0d0d; }
  .ep-trade-right { display: flex; align-items: center; gap: 8px; }
  .ep-trade-cost { font-size: 12px; font-weight: 600; color: #0d0d0d; }
  .ep-score-pill {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 600;
    border-radius: 3px; padding: 2px 7px;
  }
  .ep-bar-thin { height: 5px; background: #e8e8e8; border-radius: 3px; overflow: hidden; }

  /* ── Block 4: Itemised Detail ── */
  .ep-section { border-bottom: 1px solid #ebebeb; page-break-inside: avoid; }
  .ep-section-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 36px 12px;
    border-bottom: 2px solid #0d0d0d;
  }
  .ep-section-left { display: flex; align-items: center; gap: 8px; }
  .ep-section-name { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #0d0d0d; }
  .ep-section-total { font-size: 13px; font-weight: 700; color: #0d0d0d; }
  .ep-item { padding: 14px 36px; }
  .ep-item-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
  .ep-area-pill {
    font-size: 10px; font-weight: 500; color: #555;
    background: #f2f2f2; border-radius: 3px; padding: 2px 7px;
  }
  .ep-fix-pill {
    font-size: 10px; font-weight: 500; color: #333;
    border: 1px solid #d8d8d8; border-radius: 3px; padding: 2px 7px;
  }
  .ep-issue { font-size: 13px; color: #1c1c1e; line-height: 1.5; margin-bottom: 7px; }
  .ep-costs { display: flex; align-items: center; gap: 10px; font-size: 11px; color: #888; flex-wrap: wrap; }
  .ep-cost-total { margin-left: auto; font-size: 12px; font-weight: 700; color: #0d0d0d; }
  .ep-item-rule { height: 1px; background: #f0f0f0; margin: 0 36px; }
  .ep-subtotal {
    display: flex; justify-content: flex-end;
    padding: 10px 36px 16px;
    font-size: 12px; color: #444;
    border-top: 1px solid #ebebeb;
    margin-top: 4px;
  }
  .ep-subtotal strong {
    text-decoration: underline; text-underline-offset: 2px;
    color: #0d0d0d; margin-left: 6px;
  }

  /* ── Block 5: Cost Summary ── */
  .ep-cost-summary {
    background: #0d0d0d;
    padding: 28px 36px;
  }
  .ep-cs-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 18px;
  }
  .ep-cs-title { font-size: 14px; font-weight: 700; color: #fff; }
  .ep-cs-pid   { font-size: 10px; color: rgba(255,255,255,0.3); font-family: monospace; }
  .ep-cs-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 7px 0; font-size: 12px;
  }
  .ep-cs-row-label { color: rgba(255,255,255,0.5); }
  .ep-cs-row-val   { color: rgba(255,255,255,0.75); font-weight: 500; }
  .ep-cs-rule { height: 1px; background: rgba(255,255,255,0.12); margin: 8px 0; }
  .ep-grand-row {
    display: flex; justify-content: space-between; align-items: baseline;
    padding-top: 4px;
  }
  .ep-grand-label { font-size: 14px; font-weight: 600; color: #fff; }
  .ep-grand-val   { font-size: 26px; font-weight: 800; color: #fff; }

  /* ── Block 6: Footer ── */
  .ep-footer { padding: 24px 36px 28px; }
  .ep-disclaimer {
    font-size: 11px; color: #888; line-height: 1.75;
    margin-bottom: 18px;
  }
  .ep-rate-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 16px; font-size: 11px; font-weight: 600;
    background: none; border: 1.5px solid #0d0d0d;
    border-radius: 6px; cursor: pointer; color: #0d0d0d;
    font-family: 'Poppins', sans-serif; margin-bottom: 20px;
    text-decoration: none;
  }
  .ep-prepared { font-size: 11px; color: #aaa; margin-bottom: 4px; }
  .ep-flent-sig { font-size: 10px; color: #ccc; text-align: center; padding-top: 12px; border-top: 1px solid #f0f0f0; }

  /* ── PDF Download button ── */
  .ep-pdf-btn {
    position: fixed; bottom: 24px; right: 20px;
    display: flex; align-items: center; gap: 8px;
    padding: 13px 22px; font-size: 13px; font-weight: 600;
    background: #0d0d0d; color: #fff; border: none;
    border-radius: 30px; cursor: pointer;
    box-shadow: 0 4px 20px rgba(0,0,0,0.22);
    font-family: 'Poppins', sans-serif; z-index: 999;
  }

  /* ── Back button ── */
  .ep-back {
    max-width: 860px; margin: 0 auto;
    padding: 14px 36px 0;
    background: #f0f0f0;
  }
  .ep-back button {
    background: none; border: none; cursor: pointer;
    font-size: 12px; color: #666; font-family: 'Poppins', sans-serif;
    display: flex; align-items: center; gap: 4px; padding: 0;
  }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    .ep-header  { padding: 22px 20px; }
    .ep-doc-title { font-size: 16px; }
    .ep-info-strip { padding: 10px 20px; }
    .ep-summary { padding: 22px 20px; }
    .ep-stats   { grid-template-columns: 1fr; gap: 8px; }
    .ep-stat-val { font-size: 24px; }
    .ep-trades  { padding: 22px 20px; }
    .ep-trade-grid { grid-template-columns: 1fr; }
    .ep-section-head { padding: 14px 20px 10px; }
    .ep-item    { padding: 14px 20px; }
    .ep-item-rule { margin: 0 20px; }
    .ep-subtotal { padding: 10px 20px 14px; }
    .ep-cost-summary { padding: 24px 20px; }
    .ep-footer  { padding: 22px 20px 24px; }
    .ep-back    { padding: 12px 20px 0; }
  }

  /* ── Print ── */
  @media print {
    .no-print { display: none !important; }
    body, #root { background: #fff !important; padding: 0 !important; }
    .ep-wrap { background: #fff !important; padding: 0 !important; }
    .ep-doc  { box-shadow: none !important; max-width: 100% !important; }
    .ep-section { page-break-inside: avoid; }
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

  // Set page background
  useEffect(() => {
    const prev = document.body.style.background
    const prevPad = document.body.style.padding
    document.body.style.background = '#f0f0f0'
    document.body.style.padding = '0'
    return () => {
      document.body.style.background = prev
      document.body.style.padding = prevPad
    }
  }, [])

  // Set page title from PID once inspection loads
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'Poppins, sans-serif', color: '#888', fontSize: 14 }}>
      Loading estimate…
    </div>
  )

  if (error || !inspection) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'Poppins, sans-serif', color: '#9b1f35', fontSize: 14 }}>
      {error || 'Inspection not found'}
    </div>
  )

  // ── Derived data ──
  const items = inspection.inspection_line_items || []
  const pid = inspection.pid || ''

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

  const validScores = Object.values(sectionScores).filter(v => v != null)
  const overallScore = validScores.length
    ? Math.round(validScores.reduce((s, v) => s + v, 0) / validScores.length)
    : null
  const overallBand = band(overallScore)
  const overallColors = BAND_COLORS[overallBand]

  const totalMaterial = items.reduce((s, r) => s + (r.material_cost || 0), 0)
  const totalLabour   = items.reduce((s, r) => s + (r.labour_cost   || 0), 0)
  const grandTotal    = totalMaterial + totalLabour

  function secTotal(rows) { return rows.reduce((s, r) => s + (r.material_cost || 0) + (r.labour_cost || 0), 0) }
  function secMat(rows)   { return rows.reduce((s, r) => s + (r.material_cost || 0), 0) }
  function secLab(rows)   { return rows.reduce((s, r) => s + (r.labour_cost   || 0), 0) }

  const issueCount    = items.filter(r => r.availability_status !== 'not_available').length
  const issueStatBand = issueCount > 5 ? 'red' : issueCount > 1 ? 'amber' : 'green'
  const tradesAffected = sectionList.filter(([, rows]) =>
    rows.some(r => r.availability_status !== 'not_available' && ((r.material_cost || 0) + (r.labour_cost || 0)) > 0)
  ).length

  // Verdict line
  const verdictBand = band(overallScore)
  const verdictText = verdictBand === 'green'
    ? `Property is in good condition across ${sectionList.length} trade${sectionList.length > 1 ? 's' : ''}.`
    : verdictBand === 'amber'
    ? `Property requires attention across ${tradesAffected} trade${tradesAffected > 1 ? 's' : ''} before move-in.`
    : `Property has critical issues across ${tradesAffected} trade${tradesAffected > 1 ? 's' : ''} — immediate action required.`

  function handlePrint() {
    const prev = document.title
    document.title = pid ? `${pid} Estimate` : 'Estimate'
    window.print()
    document.title = prev
  }

  return (
    <div className="ep-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Back button */}
      <div className="ep-back no-print">
        <button onClick={() => navigate(-1)}>← back</button>
      </div>

      <div className="ep-doc">

        {/* ── BLOCK 1: DOCUMENT HEADER ── */}
        <div className="ep-header">
          <div className="ep-brand">
            <div className="ep-logo-box">
              <img src="/logo.svg" alt="Flent" />
            </div>
            <div className="ep-brand-text">
              <div className="ep-brand-name">Flent</div>
              <div className="ep-brand-tag">why rent, when you can flent?</div>
            </div>
          </div>
          <div className="ep-doc-meta">
            <div className="ep-doc-title">Estimate &amp; Health Report</div>
            {pid && <div className="ep-doc-pid">PID {pid}</div>}
          </div>
        </div>

        {/* Info strip */}
        <div className="ep-info-strip">
          {[
            { label: 'Property ID',      val: pid || '—' },
            { label: 'Date',             val: fmtDate(inspection.inspection_date) },
            { label: 'Inspection Type',  val: inspection.house_type || '—' },
            { label: 'Valid Until',      val: addDays(inspection.inspection_date, 30) },
          ].map(({ label, val }, i, arr) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="ep-info-item">
                <span className="ep-info-label">{label}</span>
                <span className="ep-info-val">{val}</span>
              </span>
              {i < arr.length - 1 && <span className="ep-info-sep" />}
            </span>
          ))}
        </div>

        {/* ── BLOCK 2: EXECUTIVE SUMMARY ── */}
        <div className="ep-summary">
          <div className="ep-block-title">Property Condition Summary</div>

          <div className="ep-stats">
            {/* Issues found */}
            <div className="ep-stat-box">
              <div className="ep-stat-val" style={{ color: BAND_COLORS[issueStatBand].text }}>
                {issueCount}
              </div>
              <div className="ep-stat-label">Issues Found</div>
            </div>
            {/* Trades affected */}
            <div className="ep-stat-box">
              <div className="ep-stat-val" style={{ color: '#0d0d0d' }}>{tradesAffected}</div>
              <div className="ep-stat-label">Trades Affected</div>
            </div>
            {/* Grand total */}
            <div className="ep-stat-box">
              <div className="ep-stat-val" style={{ color: '#0d0d0d', fontSize: 22 }}>₹{fmt(grandTotal)}</div>
              <div className="ep-stat-label">Total Estimate</div>
            </div>
          </div>

          {/* Health bar */}
          <div className="ep-health-bar-wrap">
            <div className="ep-health-row">
              <span className="ep-health-label">Overall Health</span>
              <span className="ep-health-score" style={{ color: overallColors.text }}>
                {overallScore ?? '—'}% · {overallColors.label}
              </span>
            </div>
            <div className="ep-bar-track">
              <div className="ep-bar-fill" style={{ width: `${overallScore ?? 0}%`, background: overallColors.dot }} />
            </div>
            <div className="ep-verdict">{verdictText}</div>
          </div>
        </div>

        {/* ── BLOCK 3: TRADE IMPACT OVERVIEW ── */}
        <div className="ep-trades">
          <div className="ep-block-title">Trade Breakdown</div>
          <div className="ep-trade-grid">
            {sectionList.map(([name, rows]) => {
              const sc      = sectionScores[name]
              const b       = band(sc)
              const c       = BAND_COLORS[b]
              const cost    = secTotal(rows)
              const pct     = grandTotal > 0 ? Math.round((cost / grandTotal) * 100) : 0
              return (
                <div key={name} className="ep-trade-row">
                  <div className="ep-trade-top">
                    <span className="ep-trade-name">{name}</span>
                    <div className="ep-trade-right">
                      <span className="ep-trade-cost">₹{fmt(cost)}</span>
                      <span className="ep-score-pill" style={{ background: c.bg, color: c.text }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />
                        {c.label}
                      </span>
                    </div>
                  </div>
                  <div className="ep-bar-thin">
                    <div style={{ height: '100%', width: `${pct}%`, background: c.dot, borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── BLOCK 4: ITEMISED DETAIL ── */}
        {sectionList.map(([name, rows]) => {
          const sc   = sectionScores[name]
          const b    = band(sc)
          const c    = BAND_COLORS[b]
          const mat  = secMat(rows)
          const lab  = secLab(rows)
          const tot  = mat + lab

          return (
            <div key={name} className="ep-section">
              <div className="ep-section-head">
                <div className="ep-section-left">
                  <span className="ep-section-name">{name}</span>
                  {sc != null && (
                    <span className="ep-score-pill" style={{ background: c.bg, color: c.text }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, display: 'inline-block' }} />
                      {sc}% · {c.label}
                    </span>
                  )}
                </div>
                <span className="ep-section-total">₹{fmt(tot)}</span>
              </div>

              {rows.map((item, idx) => {
                const itemTotal = (item.material_cost || 0) + (item.labour_cost || 0)
                const isNA = item.availability_status === 'not_available'

                // Derive fix type from issue_description
                const fixType = item.issue_description?.startsWith('Install') ? 'Install'
                  : item.issue_description?.startsWith('Replace') ? 'Replace'
                  : item.issue_description?.startsWith('Repair') ? 'Repair'
                  : null

                return (
                  <div key={item.id || idx}>
                    <div className="ep-item">
                      <div className="ep-item-tags">
                        {item.area && <span className="ep-area-pill">{item.area}</span>}
                        {fixType  && <span className="ep-fix-pill">{fixType}</span>}
                        {isNA     && <span className="ep-fix-pill" style={{ color: '#999', borderColor: '#ddd' }}>Not Available</span>}
                      </div>
                      <div className="ep-issue">{item.issue_description || '—'}</div>
                      {!isNA && itemTotal > 0 && (
                        <div className="ep-costs">
                          {item.material_cost > 0 && <span>Material ₹{fmt(item.material_cost)}</span>}
                          {item.material_cost > 0 && item.labour_cost > 0 && <span style={{ color: '#ccc' }}>+</span>}
                          {item.labour_cost   > 0 && <span>Labour ₹{fmt(item.labour_cost)}</span>}
                          <span className="ep-cost-total">= ₹{fmt(itemTotal)}</span>
                        </div>
                      )}
                    </div>
                    {idx < rows.length - 1 && <div className="ep-item-rule" />}
                  </div>
                )
              })}

              <div className="ep-subtotal">
                Section total <strong>₹{fmt(tot)}</strong>
              </div>
            </div>
          )
        })}

        {/* ── BLOCK 5: COST SUMMARY ── */}
        <div className="ep-cost-summary">
          <div className="ep-cs-head">
            <span className="ep-cs-title">Cost Summary</span>
            {pid && <span className="ep-cs-pid">PID {pid}</span>}
          </div>
          <div className="ep-cs-row">
            <span className="ep-cs-row-label">Material</span>
            <span className="ep-cs-row-val">₹{fmt(totalMaterial)}</span>
          </div>
          <div className="ep-cs-row">
            <span className="ep-cs-row-label">Labour</span>
            <span className="ep-cs-row-val">₹{fmt(totalLabour)}</span>
          </div>
          <div className="ep-cs-rule" />
          <div className="ep-grand-row">
            <span className="ep-grand-label">Grand Total</span>
            <span className="ep-grand-val">₹{fmt(grandTotal)}</span>
          </div>
        </div>

        {/* ── BLOCK 6: NOTES + FOOTER ── */}
        <div className="ep-footer">
          <p className="ep-disclaimer">
            Costs estimated basis site inspection and prevailing Bangalore market rates. Final figures may vary subject to site conditions. This estimate is valid for 30 days from issue date. Work to commence only upon written approval from the property owner.
          </p>

          <button className="ep-rate-btn no-print" onClick={() => window.open('/rate-card', '_blank')}>
            Labour Rate Card ↗
          </button>

          <div className="ep-prepared">Prepared by Flent Operations · {fmtDate(inspection.inspection_date)} · ops@flent.in</div>
          <div className="ep-flent-sig">Flent · Bangalore</div>
        </div>

      </div>

      {/* ── PDF DOWNLOAD BUTTON ── */}
      <button className="ep-pdf-btn no-print" onClick={handlePrint}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M7.5 1v9M4 7l3.5 3.5L11 7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1 11v1a2 2 0 002 2h9a2 2 0 002-2v-1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        Download PDF
      </button>

    </div>
  )
}
