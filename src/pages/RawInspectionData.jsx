import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function fmt(n) { return `₹${(parseFloat(n) || 0).toLocaleString('en-IN')}` }

function ScoreDot({ score }) {
  if (score === null || score === undefined) return <span style={{ color: 'var(--text-muted, #6b6d82)' }}>—</span>
  const color = score >= 8 ? 'var(--green, #3dba7a)' : score >= 5 ? 'var(--accent, #c8963e)' : 'var(--red, #e05c6a)'
  return <span style={{ color, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>{score}/10</span>
}

export default function RawInspectionData() {
  const navigate = useNavigate()
  const { pid }  = useParams()
  const [rows, setRows]       = useState(null)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const [section, setSection] = useState('all')

  useEffect(() => {
    supabase
      .from('inspections')
      .select('id')
      .eq('pid', pid)
      .then(({ data: ins }) => {
        if (!ins?.length) { setRows([]); return }
        const ids = ins.map(i => i.id)
        supabase
          .from('inspection_line_items')
          .select('*')
          .in('inspection_id', ids)
          .order('section_name')
          .then(({ data, error: err }) => {
            if (err) { setError(err.message); return }
            setRows(data || [])
          })
      })
  }, [pid])

  function exportCSV() {
    if (!rows?.length) return
    const headers = ['section', 'area', 'item', 'trade', 'score', 'issue', 'action', 'material_cost', 'labour_cost']
    const lines = [
      headers.join(','),
      ...rows.map(r => [
        r.section_name, r.area, r.item_name, r.trade,
        r.item_score ?? '', r.issue_description ?? '', r.action ?? '',
        r.material_cost ?? 0, r.labour_cost ?? 0,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${pid}_inspection.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const sections = rows ? ['all', ...new Set(rows.map(r => r.section_name).filter(Boolean))] : ['all']

  const filtered = (rows || []).filter(r => {
    if (section !== 'all' && r.section_name !== section) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (r.area || '').toLowerCase().includes(q) || (r.item_name || '').toLowerCase().includes(q)
  })

  // group by section
  const grouped = {}
  filtered.forEach(r => {
    const sec = r.section_name || 'Other'
    if (!grouped[sec]) grouped[sec] = []
    grouped[sec].push(r)
  })

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>

      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(`/properties/${pid}`)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>raw_data</span>
          <span style={s.headerSub}>{pid}</span>
        </div>
        <button
          onClick={exportCSV}
          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}
          title="Export CSV"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v7M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 10v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      <div style={{ flex: 1, padding: '16px 16px 48px', maxWidth: 720, width: '100%', margin: '0 auto' }}>

        {/* search + section filter */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: '8px 12px' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: 'var(--text-muted, #6b6d82)' }}>
              <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}
              placeholder="search area or item…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button style={{ background: 'transparent', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 16, cursor: 'pointer', padding: 0 }} onClick={() => setSearch('')}>×</button>}
          </div>
        </div>

        {/* section pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {sections.map(sec => (
            <button
              key={sec}
              onClick={() => setSection(sec)}
              style={{
                padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer', border: 'none',
                background: section === sec ? 'var(--accent, #c8963e)' : 'var(--bg-panel, #1e2028)',
                color: section === sec ? '#fff' : 'var(--text-dim, #9394a8)',
                outline: section === sec ? 'none' : '1px solid var(--border, #2e3040)',
              }}
            >
              {sec === 'all' ? 'all' : sec.toLowerCase()}
            </button>
          ))}
        </div>

        {error && <div style={{ padding: 20, textAlign: 'center', color: 'var(--red, #e05c6a)', fontSize: 13 }}>{error}</div>}
        {rows === null && !error && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontSize: 13, fontFamily: 'var(--font-mono, monospace)' }}>// loading…</div>}
        {rows !== null && filtered.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontSize: 13, fontFamily: 'var(--font-mono, monospace)' }}>// no items found</div>}

        {/* Grouped rows */}
        {Object.entries(grouped).map(([sec, items]) => (
          <div key={sec} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 8, textTransform: 'uppercase' }}>
              // {sec.toLowerCase()} · {items.length} item{items.length !== 1 ? 's' : ''}
            </div>
            <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden' }}>
              {items.map((row, i) => {
                const cost = (parseFloat(row.material_cost) || 0) + (parseFloat(row.labour_cost) || 0)
                const isFaulty = row.issue_description && row.issue_description !== 'Functional' && row.issue_description !== 'Working' && row.issue_description !== 'N/A' && row.availability_status !== 'not_available' && row.availability_status !== 'no_provision'
                return (
                  <div
                    key={row.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: i < items.length - 1 ? '1px solid rgba(46,48,64,0.7)' : 'none',
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                    }}
                  >
                    {/* status dot */}
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                      background: row.availability_status === 'not_available' || row.availability_status === 'no_provision'
                        ? 'var(--text-muted, #6b6d82)'
                        : isFaulty ? 'var(--red, #e05c6a)' : 'var(--green, #3dba7a)',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                        {row.area && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{row.area}</span>}
                        {row.trade && (
                          <span style={{ fontSize: 9, padding: '1px 5px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 2, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
                            {row.trade}
                          </span>
                        )}
                      </div>
                      {row.issue_description && row.issue_description !== 'Functional' && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{row.issue_description}</div>
                      )}
                      {row.action && (
                        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10, padding: '2px 6px', background: 'rgba(224,92,106,0.1)', border: '1px solid rgba(224,92,106,0.25)', borderRadius: 3, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>
                          {row.action}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <ScoreDot score={row.item_score} />
                      {cost > 0 && <span style={{ fontSize: 11, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{fmt(cost)}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* Total cost */}
        {filtered.length > 0 && (() => {
          const total = filtered.reduce((s, r) => s + (parseFloat(r.material_cost) || 0) + (parseFloat(r.labour_cost) || 0), 0)
          return total > 0 ? (
            <div style={{ padding: '14px 18px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>total_cost · {filtered.length} items</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{fmt(total)}</span>
            </div>
          ) : null
        })()}
      </div>
    </div>
  )
}

const s = {
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 56,
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  backBtn: {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer',
  },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
}
