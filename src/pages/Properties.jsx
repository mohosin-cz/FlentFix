import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function titleCase(str) {
  return (str || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function StatusBadge({ status }) {
  const map = {
    draft:              { color: 'var(--text-muted, #6b6d82)',  border: 'var(--border, #2e3040)',      label: 'draft' },
    submitted:          { color: '#60a5fa',                     border: 'rgba(96,165,250,0.3)',         label: 'submitted' },
    estimate_generated: { color: 'var(--green, #3dba7a)',       border: 'rgba(61,186,122,0.3)',         label: 'estimate ready' },
  }
  const c = map[status] || { color: 'var(--text-muted, #6b6d82)', border: 'var(--border, #2e3040)', label: status || '—' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3,
      background: 'transparent', border: `1px solid ${c.border}`, color: c.color,
      fontFamily: 'var(--font-mono, monospace)', textTransform: 'lowercase', letterSpacing: '0.04em',
    }}>
      {c.label}
    </span>
  )
}

function DeleteModal({ pid, onConfirm, onCancel, deleting }) {
  return (
    <div style={m.overlay} onClick={onCancel}>
      <div style={m.sheet} onClick={e => e.stopPropagation()}>
        <div style={m.iconWrap}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <polyline points="3 6 5 6 21 6" stroke="#e05c6a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="#e05c6a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 11v6M14 11v6" stroke="#e05c6a" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="#e05c6a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={m.title}>Move PID{pid} to bin?</div>
        <div style={m.body}>
          All inspection data for <strong style={{ color: 'var(--text, #e8e8f0)' }}>PID{pid}</strong> will be moved to the bin. You can restore it later.
        </div>
        <div style={m.actions}>
          <button style={m.cancelBtn} onClick={onCancel} disabled={deleting}>Cancel</button>
          <button
            style={{ ...m.deleteBtn, opacity: deleting ? 0.6 : 1, cursor: deleting ? 'not-allowed' : 'pointer' }}
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Moving…' : 'Move to bin'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Properties() {
  const navigate = useNavigate()
  const [rows, setRows]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [confirmPid, setConfirmPid] = useState(null)
  const [deleting, setDeleting]     = useState(false)
  const [binCount, setBinCount]     = useState(0)

  useEffect(() => {
    Promise.all([
      supabase
        .from('properties')
        .select('pid, name, type, address, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('inspections')
        .select('pid, house_type, inspection_date, status, config, deleted_at')
        .order('created_at', { ascending: false }),
    ]).then(([{ data: props }, { data: insp }]) => {
      const inspections = insp || []
      const properties  = props || []

      // Build merged map: inspections first (fallback), then properties override
      const map = new Map()
      inspections.forEach(i => {
        if (!map.has(i.pid)) {
          map.set(i.pid, {
            pid:             i.pid,
            house_type:      i.house_type,
            inspection_date: i.inspection_date,
            status:          i.status,
            deleted_at:      i.deleted_at,
          })
        }
      })
      properties.forEach(p => {
        map.set(p.pid, {
          pid:             p.pid,
          house_type:      p.type || map.get(p.pid)?.house_type,
          inspection_date: map.get(p.pid)?.inspection_date,
          status:          map.get(p.pid)?.status,
          deleted_at:      null,
        })
      })

      const all = [...map.values()]
      setRows(all.filter(r => !r.deleted_at))
      const binPids = new Set(inspections.filter(r => r.deleted_at).map(r => r.pid))
      setBinCount(binPids.size)
      setLoading(false)
    })
  }, [])

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

  async function handleSoftDelete() {
    if (!confirmPid) return
    setDeleting(true)
    await supabase
      .from('inspections')
      .update({ deleted_at: new Date().toISOString() })
      .eq('pid', confirmPid)
    setRows(prev => prev.filter(r => r.pid !== confirmPid))
    setBinCount(c => c + 1)
    setDeleting(false)
    setConfirmPid(null)
  }

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
        {/* Bin button */}
        <button
          style={s.binHeaderBtn}
          onClick={() => navigate('/properties/bin')}
          title="View bin"
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(224,92,106,0.5)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border, #2e3040)'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {binCount > 0 && <span style={s.binBadge}>{binCount}</span>}
        </button>
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
          {search && <button style={s.clearBtn} onClick={() => setSearch('')}>×</button>}
        </div>
      </div>

      {/* Grid */}
      <main style={s.main}>
        {loading ? (
          <div style={s.empty}>// loading…</div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>{search ? '// no matches found' : '// no properties yet'}</div>
        ) : (
          <div style={s.list}>
            {filtered.map(row => (
              <div key={row.pid} style={s.cardWrap}>
                {/* × delete button */}
                <button
                  style={s.closeBtn}
                  onClick={() => setConfirmPid(row.pid)}
                  title="Move to bin"
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(224,92,106,0.18)'
                    e.currentTarget.style.borderColor = 'rgba(224,92,106,0.5)'
                    e.currentTarget.style.color = '#e05c6a'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--bg-input, #252731)'
                    e.currentTarget.style.borderColor = 'var(--border, #2e3040)'
                    e.currentTarget.style.color = 'var(--text-muted, #6b6d82)'
                  }}
                >
                  ×
                </button>

                <button
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
                  <div style={s.cardTop}>
                    <div style={s.pidText}>PID{row.pid}</div>
                    {row.house_type && <span style={s.houseTypeBadge}>{titleCase(row.house_type)}</span>}
                    <div style={s.dateLine}>last: {fmtDate(row.inspection_date)}</div>
                  </div>
                  <div style={s.cardBottom}>
                    <StatusBadge status={row.status} />
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
                      <path d="M5 2.5l4.5 4.5L5 11.5" stroke="var(--text, #e8e8f0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {confirmPid && (
        <DeleteModal
          pid={confirmPid}
          deleting={deleting}
          onConfirm={handleSoftDelete}
          onCancel={() => !deleting && setConfirmPid(null)}
        />
      )}
    </div>
  )
}

const s = {
  page: {
    minHeight: '100svh', background: 'var(--bg, #16171f)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)',
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
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer',
  },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  binHeaderBtn: {
    position: 'relative',
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 8, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  binBadge: {
    position: 'absolute', top: -5, right: -5,
    minWidth: 16, height: 16, borderRadius: 8,
    background: '#e05c6a', color: '#fff',
    fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px',
    border: '2px solid var(--bg-panel, #1e2028)',
  },
  searchWrap: {
    padding: '12px 20px', background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
  },
  searchInner: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 6, padding: '9px 12px',
  },
  searchInput: {
    flex: 1, background: 'transparent', border: 'none', outline: 'none',
    fontSize: 13, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)',
  },
  clearBtn: {
    background: 'transparent', border: 'none',
    color: 'var(--text-muted, #6b6d82)', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: 0,
  },
  main: { flex: 1, padding: '16px 20px 48px', maxWidth: 860, width: '100%', margin: '0 auto' },
  empty: {
    textAlign: 'center', padding: '60px 0',
    fontSize: 13, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)',
  },
  list: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10,
  },
  cardWrap: { position: 'relative' },
  closeBtn: {
    position: 'absolute', top: 8, right: 8, zIndex: 2,
    width: 22, height: 22, borderRadius: '50%',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    color: 'var(--text-muted, #6b6d82)',
    fontSize: 14, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    padding: 0,
  },
  card: {
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    gap: 12, padding: '16px 16px 14px',
    background: 'var(--bg-panel, #1e2028)',
    border: '1px dashed var(--border-dash, #3a3d52)',
    borderRadius: 10,
    cursor: 'pointer', textAlign: 'left',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    WebkitTapHighlightColor: 'transparent',
    width: '100%', fontFamily: 'inherit',
    color: 'var(--text, #e8e8f0)', minHeight: 110,
  },
  cardTop: { display: 'flex', flexDirection: 'column', gap: 5, paddingRight: 20 },
  cardBottom: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  pidText: {
    fontSize: 18, fontWeight: 700, color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.3px',
  },
  houseTypeBadge: {
    alignSelf: 'flex-start', fontSize: 10, fontWeight: 600,
    padding: '2px 8px', borderRadius: 3,
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    color: 'var(--text-dim, #9394a8)', textTransform: 'capitalize', fontFamily: 'var(--font-mono, monospace)',
  },
  dateLine: { fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
}

const m = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: '24px',
  },
  sheet: {
    width: '100%', maxWidth: 360,
    background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 14, padding: '28px 24px 24px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
    animation: 'fadeIn 0.15s ease',
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 12,
    background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: {
    fontSize: 17, fontWeight: 700, color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)', marginBottom: 8, letterSpacing: '-0.3px',
  },
  body: {
    fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)', marginBottom: 24,
  },
  actions: { display: 'flex', gap: 10 },
  cancelBtn: {
    flex: 1, padding: '11px 0',
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)',
    cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)',
  },
  deleteBtn: {
    flex: 1, padding: '11px 0',
    background: 'rgba(224,92,106,0.15)', border: '1px solid rgba(224,92,106,0.4)',
    borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#e05c6a',
    cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', transition: 'opacity 0.15s',
  },
}
