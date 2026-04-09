import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatusBadge({ status }) {
  const map = {
    draft:              { color: 'var(--text-muted, #6b6d82)',  border: 'var(--border, #2e3040)',         label: 'draft' },
    submitted:          { color: '#60a5fa',                      border: 'rgba(96,165,250,0.3)',            label: 'submitted' },
    estimate_generated: { color: 'var(--green, #3dba7a)',        border: 'rgba(61,186,122,0.3)',            label: 'estimate ready' },
  }
  const c = map[status] || { color: 'var(--text-muted, #6b6d82)', border: 'var(--border, #2e3040)', label: status || '—' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 3,
      background: 'transparent',
      border: `1px solid ${c.border}`,
      color: c.color,
      fontFamily: 'var(--font-mono, monospace)',
      textTransform: 'lowercase',
      letterSpacing: '0.04em',
    }}>
      {c.label}
    </span>
  )
}

export default function Properties() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    supabase
      .from('inspections')
      .select('pid, house_type, inspection_date, status, config')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRows(data || [])
        setLoading(false)
      })
  }, [])

  // Group by PID — keep latest inspection per PID
  const grouped = []
  const seen = new Set()
  for (const row of rows) {
    if (!row.pid || seen.has(row.pid)) continue
    seen.add(row.pid)
    grouped.push(row)
  }

  const filtered = grouped.filter(r =>
    !search || r.pid?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={s.page}>

      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>properties</span>
          <span style={s.headerSub}>{loading ? '…' : `${grouped.length} unit${grouped.length !== 1 ? 's' : ''}`}</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      {/* Search */}
      <div style={s.searchWrap}>
        <div style={s.searchInner}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: 'var(--text-muted, #6b6d82)' }}>
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            style={s.searchInput}
            type="text"
            placeholder="search by pid…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button style={s.clearBtn} onClick={() => setSearch('')}>×</button>
          )}
        </div>
      </div>

      {/* List */}
      <main style={s.main}>
        {loading ? (
          <div style={s.empty}>// loading…</div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>{search ? '// no matches found' : '// no properties yet'}</div>
        ) : (
          <div style={s.list}>
            {filtered.map(row => (
              <button
                key={row.pid}
                style={s.card}
                onClick={() => navigate(`/properties/${row.pid}`)}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent, #c8963e)'
                  e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent, #c8963e)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-dash, #3a3d52)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={s.cardLeft}>
                  <div style={s.pidText}>{row.pid}</div>
                  {row.house_type && (
                    <span style={s.houseTypeBadge}>{row.house_type}</span>
                  )}
                  <div style={s.dateLine}>last: {fmtDate(row.inspection_date)}</div>
                </div>
                <div style={s.cardRight}>
                  <StatusBadge status={row.status} />
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.3 }}>
                    <path d="M5 2.5l4.5 4.5L5 11.5" stroke="var(--text, #e8e8f0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </button>
            ))}
          </div>
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
    color: 'var(--text-dim, #9394a8)',
    cursor: 'pointer',
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
  searchWrap: {
    padding: '12px 20px',
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
  },
  searchInner: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 6, padding: '9px 12px',
  },
  searchInput: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    fontSize: 13, color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  clearBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted, #6b6d82)',
    fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: 0,
  },
  main: { flex: 1, padding: '16px 20px 48px', maxWidth: 860, width: '100%', margin: '0 auto' },
  empty: {
    textAlign: 'center', padding: '60px 0',
    fontSize: 13, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  list: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 10,
  },
  card: {
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    gap: 12, padding: '18px 18px',
    background: 'var(--bg-panel, #1e2028)',
    border: '1px dashed var(--border-dash, #3a3d52)',
    borderRadius: 10,
    cursor: 'pointer', textAlign: 'left',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    WebkitTapHighlightColor: 'transparent',
    width: '100%', fontFamily: 'inherit',
    color: 'var(--text, #e8e8f0)',
    minHeight: 110,
  },
  cardLeft: { display: 'flex', flexDirection: 'column', gap: 5 },
  cardRight: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  pidText: {
    fontSize: 18, fontWeight: 700,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '-0.3px',
  },
  houseTypeBadge: {
    alignSelf: 'flex-start',
    fontSize: 10, fontWeight: 600,
    padding: '2px 8px', borderRadius: 3,
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    color: 'var(--text-dim, #9394a8)',
    textTransform: 'capitalize',
    fontFamily: 'var(--font-mono, monospace)',
  },
  dateLine: {
    fontSize: 11, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
}
