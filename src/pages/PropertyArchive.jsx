import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LogoSpinner from '../components/LogoSpinner'

// The archive bucket. Sits beside the bin and reads the same way on purpose,
// but the two mean different things: the bin is for things that were a mistake
// and can be erased forever, the archive is for finished work you intend to
// keep. Nothing here expires or is destroyed on its own — the only ways out are
// Restore and an explicit move to the bin.

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ConfirmModal({ title, body, confirmLabel, confirmStyle, onConfirm, onCancel, loading }) {
  return (
    <div style={m.overlay} onClick={onCancel}>
      <div style={m.sheet} onClick={e => e.stopPropagation()}>
        <div style={m.title}>{title}</div>
        <div style={m.body}>{body}</div>
        <div style={m.actions}>
          <button style={m.cancelBtn} onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            style={{ ...m.confirmBtn, ...confirmStyle, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PropertyArchive() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [search, setSearch]   = useState('')
  const [modal, setModal]     = useState(null) // { type: 'restore'|'bin', pid }
  const [working, setWorking] = useState(false)

  useEffect(() => {
    supabase
      .from('properties_archive')
      .select('pid, name, type, archived_by, archived_at, original_data')
      .order('archived_at', { ascending: false })
      .then(({ data, error }) => {
        // A missing table or a denied read must say so. An empty grid that
        // means "the migration has not been run" is indistinguishable from
        // one that means "nothing is archived", and that is a defect.
        if (error) setError(error.message)
        else setRows(data || [])
        setLoading(false)
      })
  }, [])

  async function handleRestore() {
    if (!modal) return
    setWorking(true)
    const { error: upErr } = await supabase.from('properties')
      .update({ archived_at: null, archived_by: null }).eq('pid', modal.pid)
    if (upErr) { setError(upErr.message); setWorking(false); setModal(null); return }
    const { error: delErr } = await supabase.from('properties_archive').delete().eq('pid', modal.pid)
    if (delErr) { setError(delErr.message); setWorking(false); setModal(null); return }
    setRows(prev => prev.filter(r => r.pid !== modal.pid))
    setWorking(false)
    setModal(null)
  }

  // Archive → bin. Deliberately routed through the same soft delete the
  // properties page uses, so a property that came out of the archive lands in
  // the bin in exactly the state the bin expects — with its original_data
  // snapshot intact and restorable from there.
  async function handleMoveToBin() {
    if (!modal) return
    setWorking(true)
    const row = rows.find(r => r.pid === modal.pid)
    const { data: { user } } = await supabase.auth.getUser()
    const actor = user?.email || 'admin'

    const { error: upErr } = await supabase.from('properties')
      .update({ deleted_at: new Date().toISOString(), deleted_by: actor, archived_at: null, archived_by: null })
      .eq('pid', modal.pid)
    if (upErr) { setError(upErr.message); setWorking(false); setModal(null); return }

    const { error: binErr } = await supabase.from('properties_bin').insert({
      pid:           modal.pid,
      name:          row?.name || modal.pid,
      type:          row?.type,
      deleted_by:    actor,
      original_data: row?.original_data || row,
    })
    if (binErr) { setError(binErr.message); setWorking(false); setModal(null); return }

    await supabase.from('properties_archive').delete().eq('pid', modal.pid)
    setRows(prev => prev.filter(r => r.pid !== modal.pid))
    setWorking(false)
    setModal(null)
  }

  const filtered = rows.filter(r =>
    !search || `${r.pid} ${r.name || ''} ${r.type || ''}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={s.page}>

      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/properties')} aria-label="Back to properties">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>archive</span>
          <span style={s.headerSub}>{loading ? '…' : `${rows.length} propert${rows.length !== 1 ? 'ies' : 'y'}`}</span>
        </div>
        <button style={s.binHeaderBtn} onClick={() => navigate('/properties/bin')} title="View bin" aria-label="View bin"
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(224,92,106,0.5)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border, #2e3040)'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </header>

      {error && (
        <div style={s.errorStrip}>
          Could not load the archive — {error}
          {/relation|does not exist|schema cache|Could not find the table/i.test(error) && (
            <> · run <code style={s.code}>supabase/migrations/property_archive.sql</code></>
          )}
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          <div style={s.hint}>Archived properties are kept indefinitely. Restore one to bring it back to the list.</div>
          <div style={s.searchWrap}>
            <div style={{ position: 'relative', width: '100%', maxWidth: 340 }}>
              <span style={s.searchIcon}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M9.5 9.5l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </span>
              <input type="text" placeholder="search archive…" value={search}
                onChange={e => setSearch(e.target.value)} style={s.searchInput} aria-label="Search the archive" />
              {search && <button onClick={() => setSearch('')} style={s.searchClear} aria-label="Clear search">×</button>}
            </div>
          </div>
        </>
      )}

      {/* Grid */}
      <main style={s.main}>
        {loading ? (
          <LogoSpinner />
        ) : error ? null : rows.length === 0 ? (
          <div style={s.emptyState}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 12, opacity: 0.25 }}>
              <rect x="3" y="4" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M10 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            <div style={s.emptyTitle}>Archive is empty</div>
            <div style={s.emptySubtitle}>Archived properties will appear here</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>// no matches found</div>
        ) : (
          <div style={s.list}>
            {filtered.map(row => (
              <div key={row.pid} style={s.card}>
                <div style={s.cardInfo}>
                  <div style={s.pidText}>PID {row.pid}</div>
                  {(row.name || row.type) && <span style={s.houseTypeBadge}>{row.name || row.type}</span>}
                  <div style={s.dateLine}>archived: {fmtDate(row.archived_at)}{row.archived_by ? ` · ${row.archived_by}` : ''}</div>
                </div>
                <div style={s.cardActions}>
                  <button style={s.restoreBtn} onClick={() => setModal({ type: 'restore', pid: row.pid })}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(61,186,122,0.5)'; e.currentTarget.style.color = 'var(--green, #3dba7a)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #2e3040)'; e.currentTarget.style.color = 'var(--text-muted, #6b6d82)' }}>
                    ↩ Restore
                  </button>
                  <button style={s.binBtn} onClick={() => setModal({ type: 'bin', pid: row.pid })}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(224,92,106,0.5)'; e.currentTarget.style.color = '#e05c6a' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #2e3040)'; e.currentTarget.style.color = 'var(--text-muted, #6b6d82)' }}>
                    To bin
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {modal?.type === 'restore' && (
        <ConfirmModal
          title={`Restore PID${modal.pid}?`}
          body={<>PID{modal.pid} will be moved back to your properties list.</>}
          confirmLabel="Restore"
          confirmStyle={{ background: 'rgba(61,186,122,0.12)', border: '1px solid rgba(61,186,122,0.4)', color: 'var(--green, #3dba7a)' }}
          onConfirm={handleRestore}
          onCancel={() => !working && setModal(null)}
          loading={working}
        />
      )}

      {modal?.type === 'bin' && (
        <ConfirmModal
          title={`Move PID${modal.pid} to the bin?`}
          body={<>PID{modal.pid} leaves the archive and goes to the bin, where it can be restored or permanently deleted. Nothing is erased by this step.</>}
          confirmLabel="Move to bin"
          confirmStyle={{ background: 'rgba(224,92,106,0.15)', border: '1px solid rgba(224,92,106,0.4)', color: '#e05c6a' }}
          onConfirm={handleMoveToBin}
          onCancel={() => !working && setModal(null)}
          loading={working}
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
  binHeaderBtn: {
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 8, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  errorStrip: {
    padding: '11px 20px', background: 'rgba(224,92,106,0.10)',
    borderBottom: '1px solid rgba(224,92,106,0.35)',
    fontSize: 11.5, lineHeight: 1.6, color: '#e8697a',
    fontFamily: 'var(--font-mono, monospace)', textAlign: 'center',
  },
  code: { color: 'var(--text-dim, #9394a8)' },
  hint: {
    padding: '10px 20px',
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    fontSize: 11, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)', textAlign: 'center',
  },
  searchWrap: {
    display: 'flex', justifyContent: 'center', padding: '12px 20px',
    background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)',
  },
  searchIcon: {
    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
    color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none', display: 'flex',
  },
  searchInput: {
    width: '100%', padding: '9px 32px 9px 34px',
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 100, color: 'var(--text, #e8e8f0)', fontSize: 13,
    fontFamily: 'var(--font-mono, monospace)', outline: 'none', boxSizing: 'border-box',
  },
  searchClear: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'transparent', border: 'none', color: 'var(--text-muted, #6b6d82)',
    fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: 0,
  },
  main: { flex: 1, padding: '16px 20px 48px', maxWidth: 860, width: '100%', margin: '0 auto' },
  empty: { textAlign: 'center', padding: '60px 0', fontSize: 13, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '80px 0', color: 'var(--text-muted, #6b6d82)',
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-dim, #9394a8)', marginBottom: 6, fontFamily: 'var(--font-mono, monospace)' },
  emptySubtitle: { fontSize: 12, fontFamily: 'var(--font-mono, monospace)' },
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 },
  card: {
    display: 'flex', flexDirection: 'column', gap: 14,
    padding: '16px 16px 14px',
    background: 'var(--bg-panel, #1e2028)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 10,
  },
  cardInfo: { display: 'flex', flexDirection: 'column', gap: 5 },
  pidText: {
    fontSize: 18, fontWeight: 700, color: 'var(--text-dim, #9394a8)',
    fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.3px',
  },
  houseTypeBadge: {
    alignSelf: 'flex-start', fontSize: 10, fontWeight: 600,
    padding: '2px 8px', borderRadius: 3,
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    color: 'var(--text-dim, #9394a8)', textTransform: 'capitalize', fontFamily: 'var(--font-mono, monospace)',
  },
  dateLine: { fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  cardActions: { display: 'flex', gap: 8 },
  restoreBtn: {
    flex: 1, padding: '7px 0', borderRadius: 6, minHeight: 34,
    background: 'transparent', border: '1px solid var(--border, #2e3040)',
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)',
    cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)',
    transition: 'border-color 0.15s, color 0.15s',
  },
  binBtn: {
    flex: 1, padding: '7px 0', borderRadius: 6, minHeight: 34,
    background: 'transparent', border: '1px solid var(--border, #2e3040)',
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)',
    cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)',
    transition: 'border-color 0.15s, color 0.15s',
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
    boxShadow: '0 24px 64px rgba(0,0,0,0.5)', animation: 'fadeIn 0.15s ease',
  },
  title: {
    fontSize: 17, fontWeight: 700, color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)', marginBottom: 10, letterSpacing: '-0.3px',
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
  confirmBtn: {
    flex: 1, padding: '11px 0', borderRadius: 8,
    fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', transition: 'opacity 0.15s',
  },
}
