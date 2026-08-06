import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import LogoSpinner from '../components/LogoSpinner'

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const tradeLabel = (t) => (t === 'Misc' ? 'Misc / untriaged' : t)
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null)

// Ordered by whose turn it is. Anything waiting on us comes first.
// A single sent-back item drops the order to in_progress, but any sibling items
// the vendor already closed are still ours to verify — bucket on the items, not
// on the order status, or those disappear from the "Waiting on you" filter.
const awaitingVerify = (w) => (w.work_order_items || []).filter(i => i.status === 'vendor_closed').length
const BUCKETS = [
  { key: 'verify',   label: 'Waiting on you', tone: 'var(--accent, #c8963e)', match: (w) => w.status === 'vendor_completed' || awaitingVerify(w) > 0 },
  { key: 'progress', label: 'With the vendor', tone: '#6b8de6', match: (w) => w.status === 'in_progress' || w.status === 'assigned' },
  { key: 'draft',    label: 'Not issued yet',  tone: 'var(--text-muted, #6b6d82)', match: (w) => w.status === 'draft' },
  { key: 'done',     label: 'Verified',        tone: 'var(--green, #3dba7a)', match: (w) => w.status === 'verified' },
]
const bucketOf = (w) => BUCKETS.find(b => b.match(w))?.key || 'progress'

function ErrStrip({ children, onRetry }) {
  return (
    <div style={{ padding: '12px 14px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontFamily: MONO }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--red, #e05c6a)' }}>⚠ {children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ marginTop: 9, fontSize: 11.5, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: '5px 11px', cursor: 'pointer', fontFamily: MONO }}>Retry</button>
      )}
    </div>
  )
}

function OrderRow({ wo, onOpen }) {
  const items = wo.work_order_items || []
  const toVerify = items.filter(i => i.status === 'vendor_closed').length
  const closed = items.filter(i => i.status !== 'pending' && i.status !== 'disputed').length
  const disputed = items.filter(i => i.status === 'disputed').length
  const bucket = BUCKETS.find(b => b.key === bucketOf(wo))
  const dates = [fmtDate(wo.scheduled_start), fmtDate(wo.scheduled_end)].filter(Boolean).join(' → ')

  return (
    <button type="button" onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '13px 14px', background: 'var(--bg-panel, #1e2028)', border: `1px solid ${toVerify > 0 ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, borderRadius: 11, cursor: 'pointer', fontFamily: SANS }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: MONO, background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 5, padding: '1px 7px' }}>PID {wo.pid}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{tradeLabel(wo.trade)}</span>
          {disputed > 0 && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--red, #e05c6a)', border: '1px solid var(--red, #e05c6a)', borderRadius: 9, padding: '1px 7px', fontFamily: MONO }}>{disputed} sent back</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{wo.vendor_name || 'no vendor'}</span>
          {dates && <span>{dates}</span>}
          <span>{closed}/{items.length} closed</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {toVerify > 0 ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{toVerify} to verify</div>
        ) : (
          <div style={{ fontSize: 11.5, color: bucket?.tone, fontFamily: MONO }}>{bucket?.label}</div>
        )}
      </div>
    </button>
  )
}

export default function WorkOrder() {
  const navigate = useNavigate()
  const phone = useIsMobile(640)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [orders, setOrders] = useState([])
  const [reloadKey, setReloadKey] = useState(0)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error: e } = await supabase
        .from('work_orders')
        .select('*, work_order_items(id, status)')
        .order('updated_at', { ascending: false })
      if (!alive) return
      if (e) { setError(e.message); setLoaded(false); setLoading(false); return }
      setOrders(data || []); setLoaded(true); setLoading(false)
    })()
    return () => { alive = false }
  }, [reloadKey])

  const retry = () => { setLoading(true); setError(''); setReloadKey(k => k + 1) }

  const counts = useMemo(() => {
    const c = {}
    for (const w of orders) { const k = bucketOf(w); c[k] = (c[k] || 0) + 1 }
    return c
  }, [orders])

  const shown = useMemo(() => {
    const list = filter === 'all' ? orders : orders.filter(w => bucketOf(w) === filter)
    const rank = (w) => BUCKETS.findIndex(b => b.key === bucketOf(w))
    return [...list].sort((a, b) => rank(a) - rank(b) || String(a.pid).localeCompare(String(b.pid)))
  }, [orders, filter])

  const waiting = counts.verify || 0

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: 'var(--text, #e8e8f0)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate('/')} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pulse-title" style={{ fontSize: 15.5 }}>Work orders</div>
          {loaded && (
            <div style={{ fontSize: 10.5, color: waiting ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>
              {waiting ? `${waiting} waiting on you` : `${orders.length} total`}
            </div>
          )}
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 860, margin: '0 auto', padding: phone ? '14px 16px 90px' : '18px 20px 60px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && <LogoSpinner />}

        {!loading && error && <ErrStrip onRetry={retry}>Couldn’t load work orders: {error}</ErrStrip>}

        {!loading && !error && loaded && orders.length === 0 && (
          <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No work orders yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 5, fontFamily: MONO }}>
              Create them from a property’s Work Orders tab.
            </div>
          </div>
        )}

        {!loading && !error && orders.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
              <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'}
                className={`tct tct-bare${filter === 'all' ? ' is-on' : ''}`}
                style={{ padding: '9px 14px', fontSize: 12.5, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
                All {orders.length}
              </button>
              {BUCKETS.filter(b => counts[b.key]).map(b => (
                <button key={b.key} type="button" onClick={() => setFilter(b.key)} aria-pressed={filter === b.key}
                  className={`tct tct-bare${filter === b.key ? ' is-on' : ''}`}
                  style={{ padding: '9px 14px', fontSize: 12.5, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {b.label} {counts[b.key]}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {shown.map(w => (
                <OrderRow key={w.id} wo={w} onOpen={() => navigate(`/properties/${encodeURIComponent(w.pid)}/work-orders`)} />
              ))}
              {shown.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Nothing in this state.</div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
