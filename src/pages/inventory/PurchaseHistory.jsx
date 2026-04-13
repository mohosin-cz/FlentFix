import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TRADES = ['All', 'Electrical', 'Plumbing', 'Woodwork', 'Cleaning', 'Misc']

const TRADE_COLORS = {
  electrical: { color: '#f5c842', bg: 'rgba(245,200,66,0.1)', border: 'rgba(245,200,66,0.3)' },
  plumbing:   { color: '#5ba8e5', bg: 'rgba(91,168,229,0.1)',  border: 'rgba(91,168,229,0.3)' },
  woodwork:   { color: '#c8963e', bg: 'rgba(200,150,62,0.1)',  border: 'rgba(200,150,62,0.3)' },
  cleaning:   { color: '#3dba7a', bg: 'rgba(61,186,122,0.1)',  border: 'rgba(61,186,122,0.3)' },
  misc:       { color: '#9394a8', bg: 'rgba(147,148,168,0.1)', border: 'rgba(147,148,168,0.3)' },
}

function TradeBadge({ trade }) {
  const t = TRADE_COLORS[trade?.toLowerCase()] || TRADE_COLORS.misc
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 3, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
      {trade}
    </span>
  )
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PurchaseHistory() {
  const navigate = useNavigate()
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [trade, setTrade]       = useState('All')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')

  useEffect(() => {
    supabase
      .from('inventory_registry')
      .select('*, inventory_items(*)')
      .order('purchase_date', { ascending: false })
      .then(({ data }) => { setRecords(data || []); setLoading(false) })
  }, [])

  const filtered = records.filter(r => {
    if (trade !== 'All' && r.trade?.toLowerCase() !== trade.toLowerCase()) return false
    if (fromDate && r.purchase_date < fromDate) return false
    if (toDate   && r.purchase_date > toDate)   return false
    return true
  })

  if (loading) return <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>loading history…</div>

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/inventory')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Purchase History</span>
          <span style={s.headerSub}>{records.length} entries</span>
        </div>
        <button
          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}
          onClick={() => navigate('/inventory/register')}
          title="New Purchase"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px 60px' }}>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {TRADES.map(t => (
            <button key={t} onClick={() => setTrade(t)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', border: '1px solid', borderColor: trade === t ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)', background: trade === t ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)', color: trade === t ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)' }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ flex: 1, padding: '7px 10px', fontSize: 12, color: fromDate ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit' }} />
          <input type="date" value={toDate}   onChange={e => setToDate(e.target.value)}   style={{ flex: 1, padding: '7px 10px', fontSize: 12, color: toDate   ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit' }} />
          {(fromDate || toDate) && <button onClick={() => { setFromDate(''); setToDate('') }} style={{ padding: '7px 12px', fontSize: 11, color: 'var(--text-muted, #6b6d82)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Clear</button>}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
            No purchase records found.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(rec => {
            const items = rec.inventory_items || []
            const isOpen = expanded === rec.id
            return (
              <div key={rec.id} style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>
                {/* Entry header — clickable */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : rec.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text, #e8e8f0)' }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>{formatDate(rec.purchase_date)}</span>
                      <TradeBadge trade={rec.trade} />
                    </div>
                    <div style={{ display: 'flex', align: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                      {rec.invoice_url && <a href={rec.invoice_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--accent, #c8963e)', textDecoration: 'none', fontFamily: 'var(--font-mono, monospace)' }}>invoice ↗</a>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>₹{(rec.total_amount || 0).toLocaleString('en-IN')}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: 'var(--text-muted, #6b6d82)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M2.5 5l4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* Expanded items */}
                {isOpen && items.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border, #2e3040)', padding: '0 16px 14px' }}>
                    <div style={{ display: 'flex', gap: 6, padding: '8px 0 6px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>
                      <span style={{ width: 90 }}>FXIN</span>
                      <span style={{ flex: 2 }}>Item</span>
                      <span style={{ width: 40, textAlign: 'right' }}>Qty</span>
                      <span style={{ flex: 1, textAlign: 'right' }}>Price</span>
                    </div>
                    {items.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ width: 90, fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}>{item.fxin}</span>
                        <div style={{ flex: 2 }}>
                          <div style={{ fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{item.item_name}</div>
                          {(item.spec || item.size) && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 1 }}>{[item.spec, item.size].filter(Boolean).join(' · ')}</div>}
                        </div>
                        <span style={{ width: 40, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>×{item.qty}</span>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', textAlign: 'right' }}>₹{(item.price_inc || 0).toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                )}
                {isOpen && items.length === 0 && (
                  <div style={{ borderTop: '1px solid var(--border, #2e3040)', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No items recorded.</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const s = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
}
