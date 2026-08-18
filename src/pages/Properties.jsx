import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import LogoSpinner from '../components/LogoSpinner'

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Returns a display name from either a plain name or an email address
function parseName(str) {
  if (!str) return null
  const s = str.trim()
  if (!s) return null
  return s.includes('@') ? s.split('@')[0] : s
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

function ArchiveModal({ pid, onConfirm, onCancel, archiving }) {
  return (
    <div style={m.overlay} onClick={onCancel}>
      <div style={m.sheet} onClick={e => e.stopPropagation()}>
        <div style={{ ...m.iconWrap, background: 'rgba(200,150,62,0.12)' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="4" rx="1" stroke="var(--accent, #c8963e)" strokeWidth="1.8"/>
            <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" stroke="var(--accent, #c8963e)" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M10 12h4" stroke="var(--accent, #c8963e)" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={m.title}>Archive PID{pid}?</div>
        <div style={m.body}>
          <strong style={{ color: 'var(--text, #e8e8f0)' }}>PID{pid}</strong> moves to the archive and leaves this list.
          Nothing is deleted, and you can restore it at any time.
        </div>
        <div style={m.actions}>
          <button style={m.cancelBtn} onClick={onCancel} disabled={archiving}>Cancel</button>
          <button
            style={{ ...m.archiveBtn, opacity: archiving ? 0.6 : 1, cursor: archiving ? 'not-allowed' : 'pointer' }}
            onClick={onConfirm}
            disabled={archiving}
          >
            {archiving ? 'Archiving…' : 'Archive'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Properties() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [rows, setRows]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [confirmPid, setConfirmPid] = useState(null)
  const [deleting, setDeleting]     = useState(false)
  const [binCount, setBinCount]     = useState(0)
  const [archiveCount, setArchiveCount] = useState(0)
  const [archivePid, setArchivePid] = useState(null)
  const [archiving, setArchiving]   = useState(false)
  const [archiveError, setArchiveError] = useState(null)

  const fetchData = useCallback(() => {
    Promise.all([
      supabase
        .from('properties')
        .select('pid, name, type, address, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('inspections')
        .select('pid, house_type, inspection_date, status, config, owner_email')
        .order('created_at', { ascending: false }),
      supabase.from('properties_bin').select('pid'),
      supabase
        .from('estimates')
        .select('pid, inspector_name, created_by')
        .order('created_at', { ascending: false }),
      supabase.from('properties_archive').select('pid'),
    ]).then(([{ data: props }, { data: insp }, { data: binRows }, { data: ests }, archiveRes]) => {
      const inspections = insp || []
      const properties  = props || []
      const estimates   = ests || []
      const deletedPids = new Set((binRows || []).map(r => r.pid))
      // A failed archive read must not silently un-hide every archived
      // property; say so instead, and leave the list alone.
      setArchiveError(archiveRes.error ? archiveRes.error.message : null)
      const archivedPids = new Set((archiveRes.data || []).map(r => r.pid))

      // Most recent estimate per PID → email fallback for legacy PIDs
      const estimateEmailMap = new Map()
      for (const e of estimates) {
        if (!estimateEmailMap.has(e.pid)) {
          const name = parseName(e.inspector_name) || parseName(e.created_by)
          if (name) estimateEmailMap.set(e.pid, name)
        }
      }

      const pidMap = new Map()
      // Build from inspections first — authoritative source for all PIDs
      // Also captures owner_email (populated going forward on all new inspections)
      for (const insp of inspections) {
        if (deletedPids.has(insp.pid) || archivedPids.has(insp.pid)) continue
        if (!pidMap.has(insp.pid)) {
          pidMap.set(insp.pid, {
            pid: insp.pid, type: insp.house_type,
            inspection_date: insp.inspection_date, status: insp.status,
            owner_email: insp.owner_email || null,
          })
        }
      }
      // Layer in properties metadata without dropping any PID
      for (const p of properties) {
        if (deletedPids.has(p.pid) || archivedPids.has(p.pid)) continue
        pidMap.set(p.pid, {
          ...(pidMap.get(p.pid) || { pid: p.pid }),
          name: p.name, address: p.address,
          type: (pidMap.get(p.pid)?.type) || p.type,
          property_created_at: p.created_at,
        })
      }
      // Coalesce inspector: inspection.owner_email → estimate created_by → null
      for (const [pid, data] of pidMap) {
        const inspector = parseName(data.owner_email) || estimateEmailMap.get(pid) || null
        pidMap.set(pid, { ...data, inspector })
      }

      const allProperties = [...pidMap.values()]
      console.log('PROPERTIES LIST COUNT:', allProperties.length)

      setRows(allProperties)
      setBinCount(binRows?.length || 0)
      setArchiveCount(archivedPids.size)
      setLoading(false)
    })
  }, [])

  const { pullDistance, isRefreshing } = usePullToRefresh(fetchData)

  useEffect(() => { fetchData() }, [fetchData])

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

  // Archiving is the same shape as the soft delete, into a different bucket.
  // The properties update is best-effort on purpose: a PID can exist only in
  // inspections with no properties row, and the archive row is what actually
  // hides it, so an update touching zero rows is not a failure. A failed
  // archive insert is.
  async function handleArchive() {
    if (!archivePid) return
    setArchiving(true)
    const prop = rows.find(r => r.pid === archivePid)
    const archivedBy = user?.email || 'admin'

    await supabase.from('properties')
      .update({ archived_at: new Date().toISOString(), archived_by: archivedBy })
      .eq('pid', archivePid)

    const { error } = await supabase.from('properties_archive').insert({
      pid:           archivePid,
      name:          prop?.name || archivePid,
      type:          prop?.type,
      archived_by:   archivedBy,
      original_data: prop,
    })
    if (error) { setArchiveError(error.message); setArchiving(false); setArchivePid(null); return }

    setRows(prev => prev.filter(r => r.pid !== archivePid))
    setArchiveCount(c => c + 1)
    setArchiveError(null)
    setArchiving(false)
    setArchivePid(null)
  }

  async function handleSoftDelete() {
    if (!confirmPid) return
    setDeleting(true)
    const prop = rows.find(r => r.pid === confirmPid)
    const deletedBy = user?.email || 'admin'
    const { error } = await supabase
      .from('properties')
      .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
      .eq('pid', confirmPid)
    if (error) { alert('Delete failed: ' + error.message); setDeleting(false); return }
    await supabase.from('properties_bin').insert({
      pid:           confirmPid,
      name:          prop?.name || confirmPid,
      type:          prop?.type,
      deleted_by:    deletedBy,
      original_data: prop,
    })
    setRows(prev => prev.filter(r => r.pid !== confirmPid))
    setBinCount(c => c + 1)
    setDeleting(false)
    setConfirmPid(null)
  }

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
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
        {/* Archive + bin, as a pair. Both are places things go when they leave
            this list, so they sit together rather than in separate corners. */}
        <div style={s.headerBtns}>
          <button
            style={s.binHeaderBtn}
            onClick={() => navigate('/properties/archive')}
            title="View archive"
            aria-label="View archive"
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent, #c8963e)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border, #2e3040)'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="2"/>
              <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M10 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {archiveCount > 0 && <span style={s.archiveBadge}>{archiveCount}</span>}
          </button>

          <button
            style={s.binHeaderBtn}
            onClick={() => navigate('/properties/bin')}
            title="View bin"
            aria-label="View bin"
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
        </div>
      </header>

      {archiveError && (
        <div style={s.errorStrip}>
          Archive unavailable — {archiveError}
          {/relation|does not exist|schema cache|Could not find the table/i.test(archiveError) && (
            <> · run <code style={{ color: 'var(--text-dim, #9394a8)' }}>supabase/migrations/property_archive.sql</code></>
          )}
        </div>
      )}

      {/* Search */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 20px', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none', display: 'flex' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </span>
          <input
            type="text"
            placeholder="search by pid…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 32px 9px 34px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 100, color: 'var(--text, #e8e8f0)', fontSize: 13, fontFamily: 'var(--font-mono, monospace)', outline: 'none', boxSizing: 'border-box' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>
      </div>

      {/* Grid */}
      <main style={s.main}>
        {loading ? (
          <LogoSpinner />
        ) : filtered.length === 0 ? (
          <div style={s.empty}>{search ? '// no matches found' : '// no properties yet'}</div>
        ) : (
          <div style={s.list}>
            {filtered.map(row => (
              <div key={row.pid} style={s.cardWrap}>
                {/* Archive — sits left of the delete ×, in the order you'd
                    reach for them: put it away first, throw it out second. */}
                <button
                  style={s.archiveBtn}
                  onClick={() => setArchivePid(row.pid)}
                  title="Archive"
                  aria-label={`Archive PID ${row.pid}`}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(200,150,62,0.18)'
                    e.currentTarget.style.borderColor = 'var(--accent, #c8963e)'
                    e.currentTarget.style.color = 'var(--accent, #c8963e)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'var(--bg-input, #252731)'
                    e.currentTarget.style.borderColor = 'var(--border, #2e3040)'
                    e.currentTarget.style.color = 'var(--text-muted, #6b6d82)'
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="2.4"/>
                    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
                    <path d="M10 12h4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
                  </svg>
                </button>

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
                    <div style={s.pidText}>PID {row.pid}</div>
                    {row.type && <span style={s.houseTypeBadge}>{titleCase(row.type)}</span>}
                    <div style={s.dateLine}>inspected: {fmtDate(row.inspection_date)}</div>
                    {row.property_created_at && <div style={s.dateLine}>created: {fmtDate(row.property_created_at)}</div>}
                    <div style={s.inspectorLine}>by {row.inspector || '—'}</div>
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

      {archivePid && (
        <ArchiveModal
          pid={archivePid}
          onConfirm={handleArchive}
          onCancel={() => !archiving && setArchivePid(null)}
          archiving={archiving}
        />
      )}

      {confirmPid && (
        <DeleteModal
          pid={confirmPid}
          deleting={deleting}
          onConfirm={handleSoftDelete}
          onCancel={() => !deleting && setConfirmPid(null)}
        />
      )}
    </div>
    </>
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
  headerBtns: { display: 'flex', alignItems: 'center', gap: 8 },
  archiveBadge: {
    position: 'absolute', top: -5, right: -5,
    minWidth: 16, height: 16, borderRadius: 8,
    background: 'var(--accent, #c8963e)', color: '#1a1408',
    fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px',
    border: '2px solid var(--bg-panel, #1e2028)',
  },
  errorStrip: {
    padding: '11px 20px', background: 'rgba(224,92,106,0.10)',
    borderBottom: '1px solid rgba(224,92,106,0.35)',
    fontSize: 11.5, lineHeight: 1.6, color: '#e8697a',
    fontFamily: 'var(--font-mono, monospace)', textAlign: 'center',
  },
  cardWrap: { position: 'relative' },
  archiveBtn: {
    position: 'absolute', top: 8, right: 36, zIndex: 2,
    width: 22, height: 22, borderRadius: '50%',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    color: 'var(--text-muted, #6b6d82)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    padding: 0,
  },
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
  cardTop: { display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 20 },
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
  inspectorLine: {
    fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
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
  archiveBtn: {
    flex: 1, padding: '11px 0', borderRadius: 8,
    background: 'rgba(200,150,62,0.15)', border: '1px solid rgba(200,150,62,0.45)',
    fontSize: 13, fontWeight: 600, color: 'var(--accent, #c8963e)',
    fontFamily: 'var(--font-mono, monospace)', transition: 'opacity 0.15s',
  },
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
