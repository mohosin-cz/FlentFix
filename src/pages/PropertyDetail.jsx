import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }) {
  const map = {
    draft:              { color: 'var(--text-muted, #6b6d82)', border: 'var(--border, #2e3040)',        label: 'draft' },
    submitted:          { color: '#60a5fa',                     border: 'rgba(96,165,250,0.3)',           label: 'submitted' },
    estimate_generated: { color: 'var(--green, #3dba7a)',       border: 'rgba(61,186,122,0.3)',           label: 'estimate ready' },
  }
  const c = map[status] || { color: 'var(--text-muted, #6b6d82)', border: 'var(--border, #2e3040)', label: status || '—' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: '2px 8px', borderRadius: 3,
      background: 'transparent',
      border: `1px solid ${c.border}`,
      color: c.color,
      fontFamily: 'var(--font-mono, monospace)',
      textTransform: 'lowercase',
    }}>
      {c.label}
    </span>
  )
}

function SectionEyebrow({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: 'var(--text-muted, #6b6d82)',
      marginBottom: 8, marginTop: 28,
      fontFamily: 'var(--font-mono, monospace)',
    }}>
      // {children}
    </div>
  )
}

function PlaceholderCard({ label }) {
  return (
    <div style={{
      background: 'var(--bg-panel, #1e2028)',
      borderRadius: 8,
      border: '1px dashed var(--border-dash, #3a3d52)',
      padding: '28px 20px',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 12, fontWeight: 500,
        color: 'var(--text-muted, #6b6d82)',
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        // {label.toLowerCase().replace(' ', '_')} — coming_soon
      </div>
    </div>
  )
}

export default function PropertyDetail() {
  const navigate = useNavigate()
  const { pid }  = useParams()
  const [inspections, setInspections] = useState([])
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    supabase
      .from('inspections')
      .select('*')
      .eq('pid', pid)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setInspections(data || [])
        setLoading(false)
      })
  }, [pid])

  const estimates = inspections.filter(i => i.status === 'estimate_generated')

  const latest    = inspections[0]
  const houseType = latest?.house_type || ''
  const address   = latest?.config?.address || ''

  return (
    <div style={s.page}>

      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/properties')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>{pid}</span>
          {houseType && <span style={s.headerSub}>{houseType}</span>}
        </div>
        <div style={{ width: 36 }} />
      </header>

      {/* PID hero */}
      <div style={s.heroStrip}>
        <div style={s.heroInner}>
          <div style={s.heroPid}>{pid}</div>
          <div style={s.heroMeta}>
            {houseType && <span style={s.heroBadge}>{houseType}</span>}
            {address   && <span style={s.heroAddress}>{address}</span>}
          </div>
          <div style={s.heroStats}>
            <span style={s.heroStat}><span style={s.heroStatNum}>{inspections.length}</span> inspection{inspections.length !== 1 ? 's' : ''}</span>
            <span style={s.heroStatDivider}>·</span>
            <span style={s.heroStat}><span style={s.heroStatNum}>{estimates.length}</span> estimate{estimates.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div style={s.heroGrid} aria-hidden="true" />
      </div>

      <main style={s.main}>

        {loading ? (
          <div style={s.empty}>// loading…</div>
        ) : (
          <>

            {/* ── 1. Inspections ── */}
            <SectionEyebrow>Inspections</SectionEyebrow>
            {inspections.length === 0 ? (
              <div style={s.emptyCard}>// no inspections found</div>
            ) : (
              <div style={s.card}>
                {inspections.map((ins, i) => (
                  <div key={ins.id} style={{ ...s.row, borderBottom: i < inspections.length - 1 ? '1px solid var(--border, #2e3040)' : 'none' }}>
                    <div style={s.rowLeft}>
                      <div style={s.rowDate}>{fmtDate(ins.inspection_date)}</div>
                      <div style={s.rowMeta}>
                        {ins.config?.inspection_type && <span style={s.metaChip}>{ins.config.inspection_type}</span>}
                        {ins.config?.scope           && <span style={s.metaChip}>{ins.config.scope}</span>}
                      </div>
                    </div>
                    <div style={s.rowRight}>
                      <StatusBadge status={ins.status} />
                      {ins.status === 'estimate_generated' && (
                        <button
                          style={s.viewBtn}
                          onClick={() => navigate(`/estimate/${ins.id}`)}
                        >
                          view estimate →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── 2. Estimates ── */}
            <SectionEyebrow>Estimates</SectionEyebrow>
            {estimates.length === 0 ? (
              <div style={s.emptyCard}>// no estimates generated yet</div>
            ) : (
              <div style={s.card}>
                {estimates.map((ins, i) => (
                  <div key={ins.id} style={{ ...s.row, borderBottom: i < estimates.length - 1 ? '1px solid var(--border, #2e3040)' : 'none' }}>
                    <div style={s.rowLeft}>
                      <div style={s.rowDate}>{fmtDate(ins.inspection_date)}</div>
                      {ins.config?.scope && <div style={s.rowMeta}><span style={s.metaChip}>{ins.config.scope}</span></div>}
                    </div>
                    <div style={s.rowRight}>
                      <button
                        style={s.downloadBtn}
                        onClick={() => navigate(`/estimate/${ins.id}`)}
                      >
                        download pdf
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── 3. Work Orders ── */}
            <SectionEyebrow>Work Orders</SectionEyebrow>
            <PlaceholderCard label="Work Orders" />

            {/* ── 4. Flentfit Report ── */}
            <SectionEyebrow>Flentfit Report</SectionEyebrow>
            <PlaceholderCard label="Flentfit Report" />

            {/* ── 5. Invoice ── */}
            <SectionEyebrow>Invoice</SectionEyebrow>
            <PlaceholderCard label="Invoice" />

          </>
        )}
      </main>
    </div>
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
  headerTitle: {
    fontSize: 14, fontWeight: 600,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  headerSub: {
    fontSize: 10,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },

  /* hero */
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
  heroMeta: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  heroBadge: {
    fontSize: 10, fontWeight: 600,
    padding: '3px 8px', borderRadius: 3,
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    color: 'var(--text-dim, #9394a8)',
    textTransform: 'capitalize',
    fontFamily: 'var(--font-mono, monospace)',
  },
  heroAddress: {
    fontSize: 12, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  heroStats: { display: 'flex', alignItems: 'center', gap: 8 },
  heroStat: {
    fontSize: 12, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  heroStatNum: { color: 'var(--accent, #c8963e)', fontWeight: 700 },
  heroStatDivider: { color: 'var(--border-dash, #3a3d52)' },
  heroGrid: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(var(--border, #2e3040) 1px, transparent 1px), linear-gradient(90deg, var(--border, #2e3040) 1px, transparent 1px)',
    backgroundSize: '28px 28px',
    opacity: 0.25,
    pointerEvents: 'none',
  },

  main: { flex: 1, padding: '0 20px 48px', maxWidth: 600, width: '100%', margin: '0 auto' },
  empty: {
    textAlign: 'center', padding: '40px 0',
    fontSize: 12, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  emptyCard: {
    padding: '20px', textAlign: 'center',
    fontSize: 12, color: 'var(--text-muted, #6b6d82)',
    background: 'var(--bg-panel, #1e2028)',
    border: '1px dashed var(--border-dash, #3a3d52)',
    borderRadius: 8,
    fontFamily: 'var(--font-mono, monospace)',
  },
  card: {
    background: 'var(--bg-panel, #1e2028)',
    borderRadius: 8,
    border: '1px solid var(--border, #2e3040)',
    overflow: 'hidden',
  },
  row: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 12, padding: '14px 18px',
  },
  rowLeft: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1 },
  rowRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  rowDate: {
    fontSize: 13, fontWeight: 600,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  rowMeta: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  metaChip: {
    fontSize: 10, fontWeight: 500,
    padding: '2px 7px', borderRadius: 3,
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    color: 'var(--text-dim, #9394a8)',
    textTransform: 'capitalize',
    fontFamily: 'var(--font-mono, monospace)',
  },
  viewBtn: {
    fontSize: 11, fontWeight: 600,
    color: 'var(--green, #3dba7a)',
    background: 'rgba(61,186,122,0.08)',
    border: '1px solid rgba(61,186,122,0.25)',
    borderRadius: 4, padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono, monospace)',
  },
  downloadBtn: {
    fontSize: 11, fontWeight: 600,
    color: 'var(--accent, #c8963e)',
    background: 'rgba(200,150,62,0.08)',
    border: '1px solid rgba(200,150,62,0.25)',
    borderRadius: 4, padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono, monospace)',
  },
}
