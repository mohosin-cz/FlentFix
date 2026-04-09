import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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

export default function PropertyBin() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null) // { type: 'restore'|'delete', pid }
  const [working, setWorking] = useState(false)

  useEffect(() => {
    supabase
      .from('inspections')
      .select('pid, house_type, inspection_date, status, deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .then(({ data }) => {
        // group by pid, keep latest deleted_at per pid
        const grouped = []
        const seen = new Set()
        for (const r of (data || [])) {
          if (!r.pid || seen.has(r.pid)) continue
          seen.add(r.pid)
          grouped.push(r)
        }
        setRows(grouped)
        setLoading(false)
      })
  }, [])

  async function handleRestore() {
    if (!modal) return
    setWorking(true)
    await supabase
      .from('inspections')
      .update({ deleted_at: null })
      .eq('pid', modal.pid)
    setRows(prev => prev.filter(r => r.pid !== modal.pid))
    setWorking(false)
    setModal(null)
  }

  async function handlePermanentDelete() {
    if (!modal) return
    setWorking(true)
    await supabase.from('inspections').delete().eq('pid', modal.pid)
    setRows(prev => prev.filter(r => r.pid !== modal.pid))
    setWorking(false)
    setModal(null)
  }

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
          <span style={s.headerTitle}>bin</span>
          <span style={s.headerSub}>{loading ? '…' : `${rows.length} item${rows.length !== 1 ? 's' : ''}`}</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      {/* Hint */}
      {!loading && rows.length > 0 && (
        <div style={s.hint}>
          Items in the bin can be restored or permanently deleted.
        </div>
      )}

      {/* Grid */}
      <main style={s.main}>
        {loading ? (
          <div style={s.empty}>// loading…</div>
        ) : rows.length === 0 ? (
          <div style={s.emptyState}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 12, opacity: 0.25 }}>
              <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={s.emptyTitle}>Bin is empty</div>
            <div style={s.emptySubtitle}>Deleted properties will appear here</div>
          </div>
        ) : (
          <div style={s.list}>
            {rows.map(row => (
              <div key={row.pid} style={s.card}>
                <div style={s.cardInfo}>
                  <div style={s.pidText}>PID{row.pid}</div>
                  {row.house_type && <span style={s.houseTypeBadge}>{row.house_type}</span>}
                  <div style={s.dateLine}>deleted: {fmtDate(row.deleted_at)}</div>
                </div>
                <div style={s.cardActions}>
                  <button
                    style={s.restoreBtn}
                    onClick={() => setModal({ type: 'restore', pid: row.pid })}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(61,186,122,0.5)'
                      e.currentTarget.style.color = 'var(--green, #3dba7a)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border, #2e3040)'
                      e.currentTarget.style.color = 'var(--text-muted, #6b6d82)'
                    }}
                  >
                    ↩ Restore
                  </button>
                  <button
                    style={s.deleteBtn}
                    onClick={() => setModal({ type: 'delete', pid: row.pid })}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(224,92,106,0.5)'
                      e.currentTarget.style.color = '#e05c6a'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border, #2e3040)'
                      e.currentTarget.style.color = 'var(--text-muted, #6b6d82)'
                    }}
                  >
                    Delete
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

      {modal?.type === 'delete' && (
        <ConfirmModal
          title={`Permanently delete PID${modal.pid}?`}
          body={<>All data for <strong style={{ color: 'var(--text, #e8e8f0)' }}>PID{modal.pid}</strong> will be erased forever. This cannot be undone.</>}
          confirmLabel="Delete forever"
          confirmStyle={{ background: 'rgba(224,92,106,0.15)', border: '1px solid rgba(224,92,106,0.4)', color: '#e05c6a' }}
          onConfirm={handlePermanentDelete}
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
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  hint: {
    padding: '10px 20px',
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    fontSize: 11, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    textAlign: 'center',
  },
  main: { flex: 1, padding: '16px 20px 48px', maxWidth: 860, width: '100%', margin: '0 auto' },
  empty: { textAlign: 'center', padding: '60px 0', fontSize: 13, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '80px 0', color: 'var(--text-muted, #6b6d82)',
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--text-dim, #9394a8)', marginBottom: 6, fontFamily: 'var(--font-mono, monospace)' },
  emptySubtitle: { fontSize: 12, fontFamily: 'var(--font-mono, monospace)' },
  list: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10,
  },
  card: {
    display: 'flex', flexDirection: 'column', gap: 14,
    padding: '16px 16px 14px',
    background: 'var(--bg-panel, #1e2028)',
    border: '1px dashed var(--border-dash, #3a3d52)',
    borderRadius: 10, opacity: 0.85,
  },
  cardInfo: { display: 'flex', flexDirection: 'column', gap: 5 },
  pidText: {
    fontSize: 18, fontWeight: 700, color: 'var(--text-dim, #9394a8)',
    fontFamily: 'var(--font-mono, monospace)', letterSpacing: '-0.3px',
    textDecoration: 'line-through', textDecorationColor: 'rgba(147,148,168,0.4)',
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
    flex: 1, padding: '7px 0', borderRadius: 6,
    background: 'transparent', border: '1px solid var(--border, #2e3040)',
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)',
    cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)',
    transition: 'border-color 0.15s, color 0.15s',
  },
  deleteBtn: {
    flex: 1, padding: '7px 0', borderRadius: 6,
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
