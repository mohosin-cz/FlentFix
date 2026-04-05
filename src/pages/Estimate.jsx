import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Injected CSS (matches flent_estimate_v2.html exactly) ───────────────────
const CSS_STR = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400&display=swap');

  .est-root {
    background: var(--bg, #16171f) !important;
    min-height: 100svh;
    padding: 20px 20px 48px;
    font-family: 'Poppins', sans-serif;
  }

  .est-page {
    --black:       #0d0d0d;
    --white:       #ffffff;
    --surface:     #f9f8f6;
    --surface-2:   #f2f0eb;
    --ink:         #1c1c1e;
    --ink-2:       #3a3a3c;
    --muted:       #8a8a8e;
    --rule:        #e5e2db;
    --rule-dark:   #ccc9c0;
    --green:       #1a7a4a;
    --green-light: #e8f5ee;
    --green-dot:   #34c47c;
    --amber:       #a05c00;
    --amber-light: #fff4e0;
    --amber-dot:   #f5a623;
    --red:         #9b1f35;
    --red-light:   #fdeaed;
    --red-dot:     #e84057;
    --accent-2:    #2a2a2a;
  }

  .est-page {
    max-width: 900px;
    margin: 0 auto;
    background: var(--white);
    border-radius: 12px;
    box-shadow: 0 8px 60px rgba(0,0,0,0.14), 0 2px 12px rgba(0,0,0,0.06);
    overflow: hidden;
    font-family: 'Poppins', sans-serif;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }

  /* Header */
  .est-header {
    background: var(--black);
    padding: 0;
    position: relative;
    overflow: hidden;
  }
  .est-header::before {
    content: 'ESTIMATE';
    position: absolute;
    right: -20px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 130px;
    font-weight: 800;
    letter-spacing: -6px;
    color: rgba(255,255,255,0.025);
    pointer-events: none;
    white-space: nowrap;
  }
  .est-header-inner {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 32px;
    padding: 32px 48px;
    position: relative;
    z-index: 1;
  }
  .est-header-left { display: flex; align-items: center; gap: 18px; }
  .est-logo-box {
    width: 48px; height: 48px;
    background: #fff;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; overflow: hidden; padding: 5px;
  }
  .est-logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .est-brand-name { font-size: 20px; font-weight: 700; color: #fff; letter-spacing: -0.3px; line-height: 1; }
  .est-brand-tagline { font-size: 10px; font-weight: 400; color: rgba(255,255,255,0.38); letter-spacing: 0.04em; font-style: italic; margin-top: 3px; }
  .est-header-right { text-align: right; }
  .est-doc-label { font-size: 10px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.38); margin-bottom: 4px; }
  .est-doc-title { font-size: 26px; font-weight: 700; color: #fff; letter-spacing: -0.5px; line-height: 1; }
  .est-doc-number { font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.38); letter-spacing: 0.08em; margin-top: 6px; }

  /* Meta bar */
  .est-meta-bar {
    background: var(--accent-2);
    padding: 12px 48px;
    display: flex; gap: 32px;
    position: relative; z-index: 1;
  }
  .est-meta-item { display: flex; align-items: center; gap: 8px; }
  .est-meta-label { font-size: 9px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.35); }
  .est-meta-value { font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.75); }
  .est-meta-sep { width: 1px; height: 18px; background: rgba(255,255,255,0.1); align-self: center; }

  /* Health section */
  .est-health {
    background: var(--surface);
    border-bottom: 1px solid var(--rule);
    padding: 28px 48px;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 24px;
    align-items: start;
  }
  .est-eyebrow {
    font-size: 9px; font-weight: 700; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--muted);
    margin-bottom: 16px;
    display: flex; align-items: center; gap: 8px;
  }
  .est-eyebrow::after { content: ''; flex: 1; height: 1px; background: var(--rule); }

  /* Body */
  .est-body { padding: 0 48px 52px; }
  .est-section-block { margin-top: 40px; }
  .est-section-head {
    display: flex; justify-content: space-between; align-items: flex-end;
    padding-bottom: 12px;
    border-bottom: 2px solid var(--ink);
  }
  .est-section-number { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
  .est-section-title { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; color: var(--ink); line-height: 1; }
  .est-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 20px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  }
  .est-badge.green { background: var(--green-light); color: var(--green); }
  .est-badge.amber { background: var(--amber-light); color: var(--amber); }
  .est-badge.red   { background: var(--red-light);   color: var(--red); }
  .est-badge-dot { width: 7px; height: 7px; border-radius: 50%; }
  .est-badge.green .est-badge-dot { background: var(--green-dot); }
  .est-badge.amber .est-badge-dot { background: var(--amber-dot); }
  .est-badge.red   .est-badge-dot { background: var(--red-dot); }

  /* Table */
  .est-table-wrap {
    border: 1px solid var(--rule);
    border-top: none;
    border-radius: 0 0 10px 10px;
    overflow: hidden;
  }
  .est-table { width: 100%; border-collapse: collapse; }
  .est-table thead tr { background: var(--surface-2); }
  .est-table th {
    padding: 10px 14px; text-align: left;
    font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--muted);
    border-bottom: 1px solid var(--rule);
  }
  .est-table th.r { text-align: right; }
  .est-table td { vertical-align: top; border-bottom: 1px solid var(--rule); }
  .est-table tr:last-child td { border-bottom: none; }
  .est-cell { padding: 13px 14px; }
  .est-sl { font-size: 11px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
  .est-area { font-size: 12px; font-weight: 600; color: var(--ink-2); }
  .est-desc { font-size: 12px; font-weight: 400; color: var(--ink-2); line-height: 1.5; }
  .est-cost-cell { text-align: right; }
  .est-cost-cell .est-cell { display: flex; justify-content: flex-end; align-items: center; gap: 2px; white-space: nowrap; }
  .est-sym { font-size: 11px; font-weight: 500; color: var(--muted); line-height: 1; flex-shrink: 0; }
  .est-val { font-size: 12px; font-weight: 500; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* Subtotal row */
  .est-subtotal td { background: var(--surface); border-top: 1.5px solid var(--rule-dark); border-bottom: none; }
  .est-subtotal-label { font-size: 11px; font-weight: 700; color: var(--ink-2); letter-spacing: 0.02em; text-transform: uppercase; }
  .est-subtotal-val { font-size: 13px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .est-subtotal .est-cost-cell .est-cell { display: flex; justify-content: flex-end; align-items: center; gap: 2px; white-space: nowrap; }
  .est-subtotal .est-sym { font-size: 11px; font-weight: 700; color: var(--muted); flex-shrink: 0; }

  /* Cost summary */
  .est-summary-wrap { margin-top: 72px; display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start; }
  .est-summary-note { padding: 20px 24px; background: var(--surface); border: 1px solid var(--rule); border-radius: 10px; }
  .est-summary-note-title { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; }
  .est-summary-note p { font-size: 11px; font-weight: 400; color: var(--muted); line-height: 1.7; }
  .est-summary-note p + p { margin-top: 6px; }
  .est-cost-box { border: 2px solid var(--black); border-radius: 10px; overflow: hidden; }
  .est-cs-head { background: var(--black); padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; }
  .est-cs-head-title { font-size: 12px; font-weight: 700; color: #fff; letter-spacing: 0.04em; text-transform: uppercase; }
  .est-cs-head-ref { font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.35); letter-spacing: 0.08em; }
  .est-cs-row { display: flex; justify-content: space-between; align-items: center; padding: 13px 20px; border-bottom: 1px solid var(--rule); }
  .est-cs-row:last-child { border-bottom: none; }
  .est-cs-row.total { background: var(--black); padding: 16px 20px; }
  .est-cs-label { font-size: 11px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .est-cs-row.total .est-cs-label { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.6); letter-spacing: 0.1em; }
  .est-cs-val { font-size: 14px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
  .est-cs-row.total .est-cs-val { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }

  /* Footer */
  .est-footer {
    margin: 40px 48px 0;
    padding: 20px 0;
    border-top: 1px solid var(--rule);
    display: flex; justify-content: space-between; align-items: flex-end;
  }
  .est-footer-left { font-size: 10px; font-weight: 400; color: var(--muted); line-height: 1.8; max-width: 380px; }
  .est-footer-right { text-align: right; }
  .est-footer-brand { font-size: 16px; font-weight: 800; color: var(--ink); letter-spacing: -0.3px; line-height: 1; }
  .est-footer-sub { font-size: 10px; font-weight: 400; color: var(--muted); margin-top: 3px; }

  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 0; background: white; }
    .est-controls { display: none !important; }
    .est-root { background: white; padding: 0; }
    .est-page { width: 100%; max-width: 100%; box-shadow: none; border-radius: 0; }
    .est-header { background: #0d0d0d !important; color: white !important; }
    .est-meta-bar { background: #2a2a2a !important; }
    .est-health { background: #f9f8f6 !important; }
    .est-header-inner { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 24px 36px !important; }
    .est-meta-bar { display: flex !important; flex-direction: row !important; gap: 24px !important; padding: 10px 36px !important; flex-wrap: nowrap !important; }
    .est-health { display: grid !important; grid-template-columns: 1fr auto !important; gap: 16px !important; }
    .est-summary-wrap { display: grid !important; grid-template-columns: 1fr 300px !important; gap: 16px !important; }
    .est-section-block { page-break-inside: avoid; }
    .est-cost-box { page-break-inside: avoid; }
    .est-table { width: 100% !important; border-collapse: collapse !important; }
    .est-table th, .est-table td { padding: 8px 10px !important; font-size: 11px !important; }
    .est-footer { display: flex !important; justify-content: space-between !important; padding-top: 16px !important; margin-top: 24px !important; }
  }
`

// ─── Score helpers ────────────────────────────────────────────────────────────
// item_score stored 0–10; displayed 0–100; bands on raw: <4=poor, <7=amber, ≥7=good
const BAND_COLORS = {
  green: { bg: '#e8f5ee', text: '#1a7a4a', dot: '#34c47c', label: 'Good' },
  amber: { bg: '#fff4e0', text: '#a05c00', dot: '#f5a623', label: 'Needs Attention' },
  red:   { bg: '#fdeaed', text: '#9b1f35', dot: '#e84057', label: 'Poor' },
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
    document.body.style.background = '#ede9e1'
    document.body.style.padding = '32px 16px'
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontFamily: 'Poppins, sans-serif', color: '#8a8a8e', fontSize: 14 }}>
      Loading estimate…
    </div>
  )

  if (error || !inspection) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', fontFamily: 'Poppins, sans-serif', color: '#9b1f35', fontSize: 14 }}>
      {error || 'Inspection not found'}
    </div>
  )

  // ── Derived data ──
  const items = inspection.inspection_line_items || []
  const pid = inspection.pid || ''
  const refNumber = pid ? `${pid}-EST` : `RPT-${id.slice(0, 6).toUpperCase()}`

  // Group by section_name (preserve insertion order)
  const sectionMap = {}
  items.forEach(item => {
    const s = item.section_name || 'Other'
    if (!sectionMap[s]) sectionMap[s] = []
    sectionMap[s].push(item)
  })
  const sectionList = Object.entries(sectionMap)

  // Section display score (0–100). Null scores (not_available items) are excluded.
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

  // Cost totals
  const totalMaterial = items.reduce((s, r) => s + (r.material_cost || 0), 0)
  const totalLabour   = items.reduce((s, r) => s + (r.labour_cost   || 0), 0)
  const grandTotal    = totalMaterial + totalLabour

  function secMat(rows) { return rows.reduce((s, r) => s + (r.material_cost || 0), 0) }
  function secLab(rows) { return rows.reduce((s, r) => s + (r.labour_cost   || 0), 0) }

  return (
    <div className="est-root">
      <style dangerouslySetInnerHTML={{ __html: CSS_STR }} />

      {/* ── Floating controls ── */}
      <div className="est-controls" style={{ maxWidth: 900, margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border-dash, #3a3d52)', borderRadius: 6, fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}
        >
          ← back
        </button>
        <button
          onClick={() => {
            const prev = document.title
            document.title = pid ? `${pid} Estimate` : prev
            window.print()
            document.title = prev
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 6, fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer' }}
        >
          print / save PDF
        </button>
      </div>

      <div className="est-page">

        {/* ── HEADER ── */}
        <div className="est-header">
          <div className="est-header-inner">
            <div className="est-header-left">
              <div className="est-logo-box">
                <img src="/logo.svg" alt="Flent" />
              </div>
              <div>
                <div className="est-brand-name">Flent</div>
                <div className="est-brand-tagline">why rent, when you can flent?</div>
              </div>
            </div>
            <div className="est-header-right">
              <div className="est-doc-label">Document</div>
              <div className="est-doc-title">{pid ? `${pid} — Estimate & Health Report` : 'Estimate & Health Report'}</div>
              <div className="est-doc-number">{refNumber}</div>
            </div>
          </div>
          <div className="est-meta-bar">
            {pid && (
              <>
                <div className="est-meta-item">
                  <span className="est-meta-label">Property ID</span>
                  <span className="est-meta-value">{pid}</span>
                </div>
                <div className="est-meta-sep" />
              </>
            )}
            <div className="est-meta-item">
              <span className="est-meta-label">Date</span>
              <span className="est-meta-value">{fmtDate(inspection.inspection_date)}</span>
            </div>
            <div className="est-meta-sep" />
            <div className="est-meta-item">
              <span className="est-meta-label">Inspection Type</span>
              <span className="est-meta-value">{inspection.house_type || '—'}</span>
            </div>
            <div className="est-meta-sep" />
            <div className="est-meta-item">
              <span className="est-meta-label">Valid Until</span>
              <span className="est-meta-value">{addDays(inspection.inspection_date, 30)}</span>
            </div>
            <div className="est-meta-sep" />
            <div className="est-meta-item">
              <span className="est-meta-label">Prepared By</span>
              <span className="est-meta-value">Flent Operations</span>
            </div>
          </div>
        </div>

        {/* ── HEALTH SECTION ── */}
        <div className="est-health">

          {/* Trade summary table */}
          <div>
            <div className="est-eyebrow">Inspection Summary</div>
            <table className="est-table" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    { label: 'Trade',        align: 'left' },
                    { label: 'Health Score', align: 'center' },
                    { label: 'Material (₹)', align: 'right' },
                    { label: 'Labour (₹)',   align: 'right' },
                    { label: 'Total (₹)',    align: 'right' },
                  ].map(({ label, align }) => (
                    <th key={label} style={{ textAlign: align }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectionList.map(([name, rows], i) => {
                  const sc = sectionScores[name]
                  const b = band(sc)
                  const c = BAND_COLORS[b]
                  const mat = secMat(rows)
                  const lab = secLab(rows)
                  return (
                    <tr key={name} style={{ background: 'var(--white)', borderBottom: i < sectionList.length - 1 ? '1px solid var(--rule)' : 'none' }}>
                      <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{name}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.text, fontSize: 10, fontWeight: 700 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, flexShrink: 0, display: 'inline-block' }} />
                          {sc != null ? `${sc} — ${c.label}` : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>₹ {fmt(mat)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, fontWeight: 500, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>₹ {fmt(lab)}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>₹ {fmt(mat + lab)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Overall health score */}
          <div style={{ textAlign: 'center', background: '#0d0d0d', borderRadius: 12, padding: '24px 28px', minWidth: 160 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
              Overall Health
            </div>
            <div style={{ fontSize: 58, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: -2 }}>
              {overallScore ?? '—'}
            </div>
            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4, margin: '12px 0 10px' }}>
              <div style={{ width: `${overallScore || 0}%`, height: '100%', background: 'linear-gradient(90deg, #e84057, #f5a623)', borderRadius: 4 }} />
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: `${overallColors.dot}26`, color: overallColors.dot, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: overallColors.dot, display: 'inline-block' }} />
              {overallColors.label}
            </div>
            <div style={{ marginTop: 10, fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.04em' }}>
              avg. of {validScores.length} trade{validScores.length !== 1 ? 's' : ''}
            </div>
          </div>

        </div>

        {/* ── BODY ── */}
        <div className="est-body">

          {sectionList.map(([name, rows], idx) => {
            const sc = sectionScores[name]
            const b = band(sc)
            const c = BAND_COLORS[b]
            const mat = secMat(rows)
            const lab = secLab(rows)
            return (
              <div className="est-section-block" key={name}>
                <div className="est-section-head">
                  <div>
                    <div className="est-section-number">Section {String(idx + 1).padStart(2, '0')}</div>
                    <div className="est-section-title">{name}</div>
                  </div>
                  {sc != null ? (
                    <div className={`est-badge ${b}`}>
                      <span className="est-badge-dot" />
                      Score: {sc} — {c.label}
                    </div>
                  ) : (
                    <div className="est-badge" style={{ background: '#F3F4F6', color: '#9CA3AF' }}>
                      <span className="est-badge-dot" style={{ background: '#D1D5DB' }} />
                      No score
                    </div>
                  )}
                </div>
                <div className="est-table-wrap">
                  <table className="est-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>Sl</th>
                        <th style={{ width: 96 }}>Area</th>
                        <th>Issue Description</th>
                        <th className="r" style={{ width: 96 }}>Material (₹)</th>
                        <th className="r" style={{ width: 84 }}>Labour (₹)</th>
                        <th className="r" style={{ width: 84 }}>Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, ri) => (
                        <tr key={row.id ?? ri}>
                          <td><div className="est-cell"><span className="est-sl">{String(ri + 1).padStart(2, '0')}</span></div></td>
                          <td><div className="est-cell"><span className="est-area">{row.area || row.section_name || '—'}</span></div></td>
                          <td>
                            <div className="est-cell">
                              <div className="est-desc">{row.issue_description || '—'}</div>
                              {row.media_count > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
                                  {Array.from({ length: Math.min(row.media_count, 3) }).map((_, mi) => (
                                    <div key={mi} style={{ width: 50, height: 38, borderRadius: 5, background: 'var(--surface-2)', border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📷</div>
                                  ))}
                                  <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                    {row.media_count} photo{row.media_count !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="est-cost-cell"><div className="est-cell"><span className="est-sym">₹</span><span className="est-val">{fmt(row.material_cost)}</span></div></td>
                          <td className="est-cost-cell"><div className="est-cell"><span className="est-sym">₹</span><span className="est-val">{fmt(row.labour_cost)}</span></div></td>
                          <td className="est-cost-cell"><div className="est-cell"><span className="est-sym">₹</span><span className="est-val">{fmt((row.material_cost || 0) + (row.labour_cost || 0))}</span></div></td>
                        </tr>
                      ))}
                      <tr className="est-subtotal">
                        <td colSpan={3}><div className="est-cell"><span className="est-subtotal-label">Section Total</span></div></td>
                        <td className="est-cost-cell"><div className="est-cell"><span className="est-sym">₹</span><span className="est-subtotal-val">{fmt(mat)}</span></div></td>
                        <td className="est-cost-cell"><div className="est-cell"><span className="est-sym">₹</span><span className="est-subtotal-val">{fmt(lab)}</span></div></td>
                        <td className="est-cost-cell"><div className="est-cell"><span className="est-sym">₹</span><span className="est-subtotal-val">{fmt(mat + lab)}</span></div></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* ── COST SUMMARY ── */}
          <div className="est-summary-wrap">
            <div className="est-summary-note">
              <div className="est-summary-note-title">Notes &amp; Conditions</div>
              <p>Costs are estimated basis a site inspection and prevailing material &amp; labour rates in Bangalore. Final figures may vary depending on site conditions at the time of execution.</p>
              <p>This estimate is valid for <strong>30 days</strong> from the date of issue. Work to commence only upon written approval from the landlord.</p>
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
                <div className="est-summary-note-title" style={{ marginBottom: 8 }}>Labour Rate Card</div>
                <a
                  href="#"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--ink)', textDecoration: 'none', padding: '7px 12px', border: '1.5px solid var(--rule-dark)', borderRadius: 6, background: 'var(--white)' }}
                >
                  📋 View Labour Rate Card
                </a>
                <p style={{ marginTop: 8, fontSize: 10 }}>Applicable rates as per Flent standard rate card at time of inspection.</p>
              </div>
            </div>

            <div className="est-cost-box">
              <div className="est-cs-head">
                <div className="est-cs-head-title">Cost Summary</div>
                <div className="est-cs-head-ref">{refNumber}</div>
              </div>
              <div className="est-cs-row">
                <div className="est-cs-label">Total Material</div>
                <div className="est-cs-val">₹{fmt(totalMaterial)}</div>
              </div>
              <div className="est-cs-row">
                <div className="est-cs-label">Total Labour</div>
                <div className="est-cs-val">₹{fmt(totalLabour)}</div>
              </div>
              <div className="est-cs-row total">
                <div className="est-cs-label">Grand Total</div>
                <div className="est-cs-val">₹{fmt(grandTotal)}</div>
              </div>
            </div>
          </div>

        </div>

        {/* ── FOOTER ── */}
        <div className="est-footer">
          <div className="est-footer-left">
            Prepared by Flent Operations Team &nbsp;·&nbsp; {fmtDate(inspection.inspection_date)}<br />
            For queries contact: operations@flent.in &nbsp;·&nbsp; flent.in
          </div>
          <div className="est-footer-right">
            <div className="est-footer-brand">Flent</div>
            <div className="est-footer-sub">Property Management</div>
          </div>
        </div>

      </div>
    </div>
  )
}
