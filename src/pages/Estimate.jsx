import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── Print CSS ────────────────────────────────────────────────────────────────
const PRINT_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; padding: 0 !important; }
    #root { padding: 0 !important; }
    .est-wrap { padding: 0 !important; background: #fff !important; }
    .est-card { box-shadow: none !important; border-radius: 0 !important; }
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
    document.body.style.background = '#f5f5f5'
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

  const issueCount = items.filter(r => r.availability_status !== 'not_available').length

  function handlePrint() {
    const prev = document.title
    document.title = pid ? `${pid} Estimate` : 'Estimate'
    window.print()
    document.title = prev
  }

  return (
    <div className="est-wrap" style={{
      minHeight: '100dvh',
      background: '#f5f5f5',
      fontFamily: "'Poppins', sans-serif",
      padding: '20px 16px 100px',
    }}>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Back button */}
      <div className="no-print" style={{ maxWidth: 480, margin: '0 auto 12px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: '#666', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 4, padding: 0,
          }}
        >
          ← back
        </button>
      </div>

      <div className="est-card" style={{
        maxWidth: 480,
        margin: '0 auto',
        background: '#fff',
        borderRadius: 14,
        boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
        overflow: 'hidden',
      }}>

        {/* ── SECTION 1: HEADER ── */}
        <div style={{ background: '#0d0d0d', padding: '28px 24px 22px' }}>
          {/* Brand row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 9, background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, overflow: 'hidden', padding: 4,
            }}>
              <img src="/logo.svg" alt="Flent" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>Flent</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', fontStyle: 'italic', marginTop: 2 }}>
                why rent, when you can flent?
              </div>
            </div>
          </div>

          {/* Document title */}
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
            Estimate &amp; Health Report
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, marginBottom: 14 }}>
            {pid ? `PID ${pid}` : 'Property Inspection'}
          </div>

          {/* Meta pills row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              fmtDate(inspection.inspection_date),
              inspection.house_type || '—',
              `Valid until ${addDays(inspection.inspection_date, 30)}`,
            ].map((val, i) => (
              <span key={i} style={{
                fontSize: 10, fontWeight: 500,
                color: 'rgba(255,255,255,0.55)',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 4, padding: '3px 8px',
              }}>{val}</span>
            ))}
          </div>
        </div>

        {/* ── SECTION 2: INSPECTION SUMMARY ── */}
        <div style={{ background: '#f7f7f7', padding: '22px 24px', borderBottom: '1px solid #e8e8e8' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', marginBottom: 16 }}>
            Inspection Summary
          </div>

          {/* Big numbers row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#0d0d0d', lineHeight: 1 }}>{issueCount}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>issues found</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0d0d0d', lineHeight: 1 }}>₹{fmt(grandTotal)}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>total estimate</div>
            </div>
          </div>

          {/* Trade pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {sectionList.map(([name, rows]) => {
              const sc = sectionScores[name]
              const b  = band(sc)
              const c  = BAND_COLORS[b]
              return (
                <span key={name} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 500,
                  background: '#fff', border: '1px solid #e8e8e8',
                  borderRadius: 20, padding: '4px 10px',
                  color: '#333',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                  {name} ({rows.length})
                </span>
              )
            })}
          </div>

          {/* Overall health bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>Overall Health</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: overallColors.text }}>
                {overallScore ?? '—'}% · {overallColors.label}
              </span>
            </div>
            <div style={{ height: 7, background: '#e8e8e8', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${overallScore ?? 0}%`,
                background: overallColors.dot,
                borderRadius: 4,
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        </div>

        {/* ── SECTION 3: PER-TRADE SECTIONS ── */}
        {sectionList.map(([name, rows]) => {
          const sc = sectionScores[name]
          const b  = band(sc)
          const c  = BAND_COLORS[b]
          const mat = secMat(rows)
          const lab = secLab(rows)
          const secTotal = mat + lab

          return (
            <div key={name} style={{ borderBottom: '1px solid #e8e8e8' }}>
              {/* Trade header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 24px 10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d' }}>
                    {name}
                  </span>
                  {sc != null && (
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      background: c.bg, color: c.text,
                      borderRadius: 4, padding: '2px 7px',
                    }}>
                      {c.label}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d0d0d' }}>₹{fmt(secTotal)}</span>
              </div>
              <div style={{ height: 1, background: '#0d0d0d', margin: '0 24px 2px' }} />

              {/* Line items */}
              {rows.map((item, idx) => {
                const itemTotal = (item.material_cost || 0) + (item.labour_cost || 0)
                const isNA = item.availability_status === 'not_available'
                return (
                  <div key={item.id || idx}>
                    <div style={{ padding: '12px 24px' }}>
                      {/* Area tag + fix type row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {item.area && (
                          <span style={{
                            fontSize: 10, fontWeight: 500, color: '#666',
                            background: '#f2f2f2', borderRadius: 3,
                            padding: '2px 6px', flexShrink: 0,
                          }}>
                            {item.area}
                          </span>
                        )}
                        {isNA && (
                          <span style={{ fontSize: 10, color: '#999' }}>not available</span>
                        )}
                      </div>

                      {/* Issue description */}
                      <div style={{ fontSize: 13, fontWeight: 400, color: '#1c1c1e', marginBottom: 6, lineHeight: 1.45 }}>
                        {item.issue_description || '—'}
                      </div>

                      {/* Cost row */}
                      {!isNA && itemTotal > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#888' }}>
                          {item.material_cost > 0 && (
                            <span>Material ₹{fmt(item.material_cost)}</span>
                          )}
                          {item.labour_cost > 0 && (
                            <span>Labour ₹{fmt(item.labour_cost)}</span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#0d0d0d' }}>
                            ₹{fmt(itemTotal)}
                          </span>
                        </div>
                      )}
                    </div>
                    {idx < rows.length - 1 && (
                      <div style={{ height: 1, background: '#f0f0f0', margin: '0 24px' }} />
                    )}
                  </div>
                )
              })}

              {/* Section subtotal */}
              <div style={{
                display: 'flex', justifyContent: 'flex-end',
                padding: '10px 24px 14px',
                fontSize: 11, color: '#555',
              }}>
                Section total &nbsp;<strong style={{ color: '#0d0d0d' }}>₹{fmt(secTotal)}</strong>
              </div>
            </div>
          )
        })}

        {/* ── SECTION 4: COST SUMMARY ── */}
        <div style={{ background: '#0d0d0d', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Cost Summary</span>
            {pid && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>PID {pid}</span>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Material</span>
              <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>₹{fmt(totalMaterial)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Labour</span>
              <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>₹{fmt(totalLabour)}</span>
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Grand Total</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>₹{fmt(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* ── SECTION 5: NOTES + FOOTER ── */}
        <div style={{ padding: '22px 24px', borderTop: '1px solid #e8e8e8' }}>
          <p style={{ fontSize: 11, color: '#888', lineHeight: 1.7, marginBottom: 16 }}>
            Costs estimated basis site inspection. Prevailing Bangalore market rates apply. Final figures may vary based on actual site conditions. Estimate valid 30 days from inspection date. Work commences only on written landlord approval.
          </p>

          <button
            className="no-print"
            onClick={() => window.open('/rate-card', '_blank')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', fontSize: 11, fontWeight: 600,
              background: 'none', border: '1.5px solid #0d0d0d',
              borderRadius: 6, cursor: 'pointer', color: '#0d0d0d',
              fontFamily: 'inherit', marginBottom: 20,
            }}
          >
            Labour Rate Card ↗
          </button>

          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
            Prepared by Flent Operations · {fmtDate(inspection.inspection_date)}
          </div>
          <div style={{ fontSize: 10, color: '#ccc', textAlign: 'center', paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
            Flent · flent.in · Bangalore
          </div>
        </div>

      </div>

      {/* ── FIXED PDF BUTTON ── */}
      <button
        className="no-print"
        onClick={handlePrint}
        style={{
          position: 'fixed', bottom: 24, right: 20,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '13px 20px',
          background: '#0d0d0d', color: '#fff',
          fontSize: 13, fontWeight: 600,
          border: 'none', borderRadius: 30,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          zIndex: 999,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M7.5 1v9M4 7l3.5 3.5L11 7" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M1 11v1a2 2 0 002 2h9a2 2 0 002-2v-1" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        Download PDF
      </button>

    </div>
  )
}
