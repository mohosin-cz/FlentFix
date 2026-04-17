import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TRADES = ['All', 'Electrical', 'Plumbing', 'Woodwork', 'Cleaning', 'Misc']

const TRADE_META = {
  electrical: { color: '#f5c842', bg: 'rgba(245,200,66,0.08)', border: 'rgba(245,200,66,0.28)' },
  plumbing:   { color: '#5ba8e5', bg: 'rgba(91,168,229,0.08)',  border: 'rgba(91,168,229,0.28)'  },
  woodwork:   { color: '#c8963e', bg: 'rgba(200,150,62,0.08)',  border: 'rgba(200,150,62,0.28)'  },
  cleaning:   { color: '#3dba7a', bg: 'rgba(61,186,122,0.08)',  border: 'rgba(61,186,122,0.28)'  },
  misc:       { color: '#9394a8', bg: 'rgba(147,148,168,0.08)', border: 'rgba(147,148,168,0.28)' },
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return isMobile
}

function QtyBadge({ qty }) {
  const color = qty > 5 ? '#3dba7a' : qty >= 2 ? '#f5c842' : '#e05c6a'
  const bg    = qty > 5 ? 'rgba(61,186,122,0.12)' : qty >= 2 ? 'rgba(245,200,66,0.12)' : 'rgba(224,92,106,0.12)'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, border: `1px solid ${color}33`, borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)' }}>
      {qty}
    </span>
  )
}

export default function InventoryDashboard() {
  const navigate  = useNavigate()
  const isMobile  = useIsMobile()
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [tradePill, setTradePill] = useState('All')
  const [filter, setFilter]     = useState('')

  useEffect(() => {
    supabase
      .from('inventory_items')
      .select('*, inventory_registry(vendor_name, vendor_contact, purchase_date)')
      .order('purchase_date', { ascending: false })
      .then(({ data }) => {
        setItems(data || [])
        setLoading(false)
      })
  }, [])

  const filtered = items
    .filter(r => tradePill === 'All' || (r.trade || '').toLowerCase() === tradePill.toLowerCase())
    .filter(r => !filter || r.fxin?.toLowerCase().includes(filter.toLowerCase()) || r.item_name?.toLowerCase().includes(filter.toLowerCase()))

  // Stats
  const totalItems  = filtered.reduce((s, r) => s + (parseInt(r.qty) || 0), 0)
  const totalValue  = filtered.reduce((s, r) => s + (parseFloat(r.price_inc) || 0) * (parseInt(r.qty) || 0), 0)
  const tradeCount  = new Set(filtered.map(r => (r.trade || 'misc').toLowerCase())).size

  if (loading) return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
      loading…
    </div>
  )

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/inventory')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Inventory Dashboard</span>
          <span style={s.headerSub}>stock · values · details</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      <div style={{ flex: 1, padding: isMobile ? '16px 16px 60px' : '20px 24px 60px', maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total Units', value: totalItems.toLocaleString('en-IN'), color: 'var(--text, #e8e8f0)' },
            { label: 'Total Value', value: `₹${Math.round(totalValue).toLocaleString('en-IN')}`, color: 'var(--accent, #c8963e)' },
            { label: 'Trades', value: tradeCount, color: '#5ba8e5' },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: isMobile ? '12px 14px' : '16px 18px' }}>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: stat.color, fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.2 }}>{stat.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Trade pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {TRADES.map(t => {
            const meta = TRADE_META[t.toLowerCase()]
            const active = tradePill === t
            return (
              <button key={t} onClick={() => setTradePill(t)} style={{
                padding: isMobile ? '3px 9px' : '5px 13px', fontSize: isMobile ? 10 : 11, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-mono, monospace)', borderRadius: 20,
                border: active ? `1px solid ${meta?.border || 'rgba(200,150,62,0.4)'}` : '1px solid var(--border, #2e3040)',
                background: active ? (meta?.bg || 'rgba(200,150,62,0.1)') : 'var(--bg-input, #252731)',
                color: active ? (meta?.color || 'var(--accent, #c8963e)') : 'var(--text-muted, #6b6d82)',
                transition: 'all 0.15s',
              }}>{t}</button>
            )
          })}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search FXIN or item name…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={s.empty}>No items found.</div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((row, i) => {
              const meta = TRADE_META[(row.trade || 'misc').toLowerCase()] || TRADE_META.misc
              const vendor = row.inventory_registry?.vendor_name
              return (
                <div key={row.id} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '13px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {row.fxin && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)' }}>{row.fxin}</span>}
                      <span style={{ fontSize: 8, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>{row.trade}</span>
                    </div>
                    <QtyBadge qty={row.quantity_remaining ?? row.qty ?? 0} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', marginBottom: 3 }}>{row.item_name}</div>
                  {(row.spec || row.size) && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 3 }}>{[row.spec, row.size].filter(Boolean).join(' · ')}</div>}
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', marginTop: 4 }}>
                    <span>₹{(parseFloat(row.price_inc) || 0).toLocaleString('en-IN')}</span>
                    {row.quantity_used > 0 && <span>Used: {row.quantity_used}</span>}
                    {row.warranty_months > 0 && <span>{row.warranty_months}mo warranty</span>}
                    {vendor && <span>{vendor}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>
            {/* Desktop column header */}
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 100px 70px 70px 90px 90px 90px 110px 90px', padding: '10px 14px', background: '#0d0d0d', fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', gap: 8 }}>
              <span>FXIN</span>
              <span>Item Name</span>
              <span>Trade</span>
              <span style={{ textAlign: 'right' }}>Qty</span>
              <span style={{ textAlign: 'right' }}>Used</span>
              <span style={{ textAlign: 'right' }}>Price ₹</span>
              <span>Spec</span>
              <span>Size</span>
              <span>Vendor</span>
              <span style={{ textAlign: 'right' }}>Warranty</span>
            </div>
            {filtered.map((row, i) => {
              const meta = TRADE_META[(row.trade || 'misc').toLowerCase()] || TRADE_META.misc
              const vendor = row.inventory_registry?.vendor_name
              return (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 100px 70px 70px 90px 90px 90px 110px 90px', padding: '0 14px', borderTop: '1px solid var(--border, #2e3040)', minHeight: 44, alignItems: 'center', gap: 8, background: i % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }}>
                  <span>
                    {row.fxin ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 4, padding: '2px 6px', fontFamily: 'var(--font-mono, monospace)' }}>{row.fxin}</span> : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.item_name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }}>{row.trade}</span>
                  <span style={{ textAlign: 'right' }}><QtyBadge qty={row.quantity_remaining ?? row.qty ?? 0} /></span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{row.quantity_used || 0}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>₹{(parseFloat(row.price_inc) || 0).toLocaleString('en-IN')}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.spec || '—'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{row.size || '—'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor || '—'}</span>
                  <span style={{ fontSize: 11, color: row.warranty_months > 0 ? '#3dba7a' : 'var(--text-muted, #6b6d82)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{row.warranty_months > 0 ? `${row.warranty_months}mo` : '—'}</span>
                </div>
              )
            })}
          </div>
        )}

        {filtered.length > 0 && (
          <p style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textAlign: 'right', marginTop: 8 }}>
            {filtered.length} item{filtered.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  empty: { textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)' },
}
