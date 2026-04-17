import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const ADMIN_EMAIL = 'mohosin@flent.in'
const TRADES = ['All', 'Electrical', 'Plumbing', 'Woodwork', 'Cleaning', 'Misc']
const TRADE_OPTS = ['electrical', 'plumbing', 'woodwork', 'cleaning', 'misc']

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

function processInventoryItems(items) {
  // items ordered purchase_date desc → first occurrence = most recent price
  const groups = {}
  const order = []
  items.forEach(item => {
    const key = `${item.item_name}|||${(item.trade || '').toLowerCase()}`
    if (!groups[key]) {
      groups[key] = { item_name: item.item_name, trade: item.trade, fxin: item.fxin, spec: item.spec, size: item.size, margin_percent: item.margin_percent || 0, prices: [] }
      order.push(key)
    }
    groups[key].prices.push(parseFloat(item.price_inc) || 0)
  })
  return order.map(key => {
    const g = groups[key]
    const prices = g.prices
    const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
    const last = prices[0]
    return { ...g, avg_cost: avg, last_price: last, count: prices.length }
  })
}

function groupByTrade(items) {
  const groups = {}
  const order = []
  items.forEach(item => {
    const t = (item.trade || 'misc').toLowerCase()
    if (!groups[t]) { groups[t] = []; order.push(t) }
    groups[t].push(item)
  })
  return order.map(t => ({ trade: t, items: groups[t] }))
}

function FxinBadge({ value }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {value}
    </span>
  )
}

function TradePill({ label, active, onClick, small }) {
  const meta = TRADE_META[label.toLowerCase()]
  return (
    <button onClick={onClick} style={{
      padding: small ? '3px 9px' : '5px 13px',
      fontSize: small ? 10 : 11, fontWeight: 600, cursor: 'pointer',
      fontFamily: 'var(--font-mono, monospace)', borderRadius: 20,
      border: active ? `1px solid ${meta?.border || 'rgba(200,150,62,0.4)'}` : '1px solid var(--border, #2e3040)',
      background: active ? (meta?.bg || 'rgba(200,150,62,0.1)') : 'var(--bg-input, #252731)',
      color: active ? (meta?.color || 'var(--accent, #c8963e)') : 'var(--text-muted, #6b6d82)',
      transition: 'all 0.15s',
    }}>{label}</button>
  )
}

const TrendUpIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 2 }}>
    <path d="M1 7.5L4 4.5l2 2 3-4" stroke="#f5c842" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export default function InternalRateCard() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [materialItems, setMaterialItems] = useState([])
  const [labourRates, setLabourRates]     = useState([])
  const [isAdmin, setIsAdmin]             = useState(false)
  const [loading, setLoading]             = useState(true)
  const [tab, setTab]                     = useState('Material RC')
  const [tradePill, setTradePill]         = useState('All')
  const [filter, setFilter]               = useState('')
  const [editingL, setEditingL]           = useState({})
  const [savingL, setSavingL]             = useState({})
  const [editingMargin, setEditingMargin] = useState({})
  const [savingMargin, setSavingMargin]   = useState({})
  const [addingTo, setAddingTo]           = useState(null)
  const [newRow, setNewRow]               = useState({ work_type: '', area: '', cost: '', unit: '', trade: 'electrical' })

  useEffect(() => {
    Promise.all([
      supabase.from('inventory_items').select('item_name,trade,fxin,spec,size,price_inc,purchase_date,margin_percent').order('purchase_date', { ascending: false }),
      supabase.from('labour_rates').select('*').order('trade').order('work_type'),
      supabase.auth.getUser(),
    ]).then(([{ data: invData }, { data: lData }, { data: { user } }]) => {
      setMaterialItems(processInventoryItems(invData || []))
      setLabourRates(lData || [])
      setIsAdmin(user?.email === ADMIN_EMAIL)
      setLoading(false)
    })
  }, [])

  // Material RC filters
  const matFiltered = tradePill === 'All' ? materialItems : materialItems.filter(r => (r.trade || '').toLowerCase() === tradePill.toLowerCase())
  const matDisplayed = filter
    ? matFiltered.filter(r => r.fxin?.toLowerCase().includes(filter.toLowerCase()) || r.item_name?.toLowerCase().includes(filter.toLowerCase()))
    : matFiltered

  // Labour RC filters
  const labFiltered = tradePill === 'All' ? labourRates : labourRates.filter(r => (r.trade || '').toLowerCase() === tradePill.toLowerCase())
  const labDisplayed = filter
    ? labFiltered.filter(r => r.work_type?.toLowerCase().includes(filter.toLowerCase()))
    : labFiltered

  function startEditL(row) {
    setEditingL(p => ({ ...p, [row.id]: { work_type: row.work_type || '', area: row.area || '', cost: String(row.cost || ''), unit: row.unit || '' } }))
  }
  function cancelEditL(id) { setEditingL(p => { const n = { ...p }; delete n[id]; return n }) }

  async function saveLabourRow(row) {
    const e = editingL[row.id]; if (!e) return
    setSavingL(p => ({ ...p, [row.id]: true }))
    const patch = { work_type: e.work_type, area: e.area, cost: parseFloat(e.cost) || 0, unit: e.unit }
    await supabase.from('labour_rates').update(patch).eq('id', row.id)
    setLabourRates(p => p.map(r => r.id === row.id ? { ...r, ...patch } : r))
    setSavingL(p => { const n = { ...p }; delete n[row.id]; return n })
    cancelEditL(row.id)
  }

  async function saveMargin(fxin, value) {
    setSavingMargin(p => ({ ...p, [fxin]: true }))
    const pct = parseFloat(value) || 0
    await supabase.from('inventory_items').update({ margin_percent: pct }).eq('fxin', fxin)
    setMaterialItems(p => p.map(r => r.fxin === fxin ? { ...r, margin_percent: pct } : r))
    setSavingMargin(p => { const n = { ...p }; delete n[fxin]; return n })
    setEditingMargin(p => { const n = { ...p }; delete n[fxin]; return n })
  }

  async function addLabourRow() {
    const trade = addingTo === '__new__' ? newRow.trade : addingTo
    const insert = { trade, work_type: newRow.work_type, area: newRow.area, cost: parseFloat(newRow.cost) || 0, unit: newRow.unit }
    const { data } = await supabase.from('labour_rates').insert(insert).select().single()
    if (data) setLabourRates(p => [...p, data])
    setAddingTo(null)
    setNewRow({ work_type: '', area: '', cost: '', unit: '', trade: 'electrical' })
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>loading rate card…</span>
    </div>
  )

  const containerStyle = {
    flex: 1, width: '100%',
    maxWidth: isMobile ? '100%' : 900,
    margin: '14px auto 40px',
    padding: isMobile ? '0 16px' : '0 24px',
    boxSizing: 'border-box',
  }

  const matGroups = groupByTrade(matDisplayed)
  const labGroups = groupByTrade(labDisplayed)

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)', display: 'flex', flexDirection: 'column' }}>

      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/inventory')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Internal Rate Card</span>
          <span style={s.headerSub}>auto-populated from registry{isAdmin ? ' · admin' : ''}</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        {['Material RC', 'Labour RC'].map(t => (
          <button key={t} onClick={() => { setTab(t); setTradePill('All'); setFilter('') }} style={{
            flex: 1, padding: isMobile ? '11px 8px' : '11px 20px',
            fontSize: isMobile ? 11 : 12, fontWeight: 600, cursor: 'pointer',
            background: 'none', border: 'none',
            borderBottom: tab === t ? '2px solid var(--accent, #c8963e)' : '2px solid transparent',
            color: tab === t ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
            fontFamily: 'var(--font-mono, monospace)', transition: 'color 0.15s, border-color 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* Trade pills */}
      <div style={{ display: 'flex', gap: 6, padding: isMobile ? '10px 16px' : '12px 24px', flexWrap: 'wrap', maxWidth: isMobile ? '100%' : 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {TRADES.map(t => (
          <TradePill key={t} label={t} active={tradePill === t} onClick={() => setTradePill(t)} small={isMobile} />
        ))}
      </div>

      {/* Info banner */}
      <div style={{ maxWidth: isMobile ? '100%' : 900, margin: '0 auto', width: '100%', padding: isMobile ? '0 16px' : '0 24px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 8, padding: '9px 13px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.18)', borderRadius: 7 }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent, #c8963e)' }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 6v3.5M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5, margin: 0 }}>
            {tab === 'Material RC'
              ? 'Material costs auto-calculated from purchase history. Avg and Last price shown per unique item.'
              : 'Labour rates managed manually by admin. Reflects current field labour benchmarks.'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ maxWidth: isMobile ? '100%' : 900, margin: '12px auto 0', width: '100%', padding: isMobile ? '0 16px' : '0 24px', boxSizing: 'border-box' }}>
        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input value={filter} onChange={e => setFilter(e.target.value)}
            placeholder={tab === 'Material RC' ? 'Search FXIN or item name…' : 'Search work type…'}
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Content */}
      <div style={containerStyle}>

        {/* ── MATERIAL RC ── */}
        {tab === 'Material RC' && (
          matGroups.length === 0 ? (
            <div style={s.empty}>No items registered yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {matGroups.map(({ trade, items }) => {
                const meta = TRADE_META[trade] || TRADE_META.misc
                return (
                  <div key={trade}>
                    <div style={s.tradeHeader}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono, monospace)' }}>{trade}</span>
                      <div style={{ flex: 1, height: 1, background: meta.border }} />
                      <span style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{items.length}</span>
                    </div>

                    <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>
                      {!isMobile && (
                        <div style={s.colHead}>
                          <span style={{ width: 110 }}>FXIN</span>
                          <span style={{ flex: 2 }}>Item Name</span>
                          <span style={{ flex: 1 }}>Spec</span>
                          <span style={{ width: 80, textAlign: 'right' }}>Last ₹</span>
                          <span style={{ width: 90, textAlign: 'right' }}>Avg ₹</span>
                          {isAdmin && <span style={{ width: 90, textAlign: 'right' }}>Margin %</span>}
                          {isAdmin && <span style={{ width: 100, textAlign: 'right' }}>Margin Cost</span>}
                        </div>
                      )}
                      {items.map((row, i) => (
                        <div key={`${row.item_name}-${i}`} style={isMobile
                          ? { padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--border, #2e3040)' : 'none' }
                          : { display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderTop: '1px solid var(--border, #2e3040)', minHeight: 44, background: i % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }
                        }>
                          {isMobile ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                {row.fxin && <FxinBadge value={row.fxin} />}
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                              </div>
                              {(row.spec || row.size) && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 4 }}>
                                  {[row.spec, row.size].filter(Boolean).join(' · ')}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                <span>Last: <span style={{ color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>₹{(row.last_price || 0).toLocaleString('en-IN')}</span></span>
                                <span>Avg: <span style={{ color: row.avg_cost > row.last_price ? '#f5c842' : 'var(--text, #e8e8f0)', fontWeight: 600 }}>₹{(row.avg_cost || 0).toLocaleString('en-IN')}</span>{row.avg_cost > row.last_price && <TrendUpIcon />}</span>
                                {row.count > 1 && <span>{row.count} purchases</span>}
                                {isAdmin && <span>Margin: <span style={{ color: 'var(--accent, #c8963e)', fontWeight: 600 }}>{row.margin_percent || 0}% → ₹{Math.round((row.last_price || 0) * (1 + (row.margin_percent || 0) / 100)).toLocaleString('en-IN')}</span></span>}
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ width: 110, flexShrink: 0 }}>{row.fxin ? <FxinBadge value={row.fxin} /> : <span style={{ color: 'var(--text-dim)' }}>—</span>}</div>
                              <span style={{ flex: 2, fontSize: 13, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                              <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{[row.spec, row.size].filter(Boolean).join(' · ') || '—'}</span>
                              <span style={{ width: 80, flexShrink: 0, fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>₹{(row.last_price || 0).toLocaleString('en-IN')}</span>
                              <span style={{ width: 90, flexShrink: 0, fontSize: 12, fontWeight: 600, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', color: row.avg_cost > row.last_price ? '#f5c842' : 'var(--text-muted, #6b6d82)' }}>
                                ₹{(row.avg_cost || 0).toLocaleString('en-IN')}{row.avg_cost > row.last_price && <TrendUpIcon />}
                              </span>
                              {isAdmin && (
                                <div style={{ width: 90, flexShrink: 0, textAlign: 'right' }}>
                                  {editingMargin[row.fxin] !== undefined ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                                      <input type="number" value={editingMargin[row.fxin]} onChange={ev => setEditingMargin(p => ({ ...p, [row.fxin]: ev.target.value }))}
                                        style={{ width: 44, padding: '3px 5px', fontSize: 11, color: 'var(--text, #e8e8f0)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 4, outline: 'none', fontFamily: 'var(--font-mono, monospace)', textAlign: 'right' }} />
                                      <button onClick={() => saveMargin(row.fxin, editingMargin[row.fxin])} disabled={savingMargin[row.fxin]} style={{ ...s.saveBtn, width: 22, height: 22, fontSize: 10 }}>{savingMargin[row.fxin] ? '…' : '✓'}</button>
                                      <button onClick={() => setEditingMargin(p => { const n = { ...p }; delete n[row.fxin]; return n })} style={{ ...s.cancelBtn, width: 22, height: 22, fontSize: 10 }}>✕</button>
                                    </div>
                                  ) : (
                                    <span onClick={() => setEditingMargin(p => ({ ...p, [row.fxin]: String(row.margin_percent || 0) }))}
                                      style={{ fontSize: 12, color: (row.margin_percent || 0) > 0 ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer', borderBottom: '1px dashed rgba(200,150,62,0.4)' }}>
                                      {(row.margin_percent || 0)}%
                                    </span>
                                  )}
                                </div>
                              )}
                              {isAdmin && (
                                <span style={{ width: 100, flexShrink: 0, fontSize: 12, fontWeight: 700, textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', color: 'var(--green, #3dba7a)' }}>
                                  ₹{Math.round((row.last_price || 0) * (1 + (row.margin_percent || 0) / 100)).toLocaleString('en-IN')}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ── LABOUR RC ── */}
        {tab === 'Labour RC' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Admin: "+ New Labour Rate" button when no groups visible */}
            {isAdmin && labGroups.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)' }}>
                No labour rates yet.
                <br />
                <button onClick={() => setAddingTo('__new__')} style={{ marginTop: 12, padding: '7px 18px', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 6, color: 'var(--accent, #c8963e)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                  + Add First Rate
                </button>
              </div>
            )}

            {!isAdmin && labGroups.length === 0 && (
              <div style={s.empty}>No labour rates added yet.</div>
            )}

            {/* Trade groups */}
            {labGroups.map(({ trade, items }) => {
              const meta = TRADE_META[trade] || TRADE_META.misc
              return (
                <div key={trade}>
                  <div style={s.tradeHeader}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono, monospace)' }}>{trade}</span>
                    <div style={{ flex: 1, height: 1, background: meta.border }} />
                  </div>

                  <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>
                    {!isMobile && (
                      <div style={s.colHead}>
                        <span style={{ flex: 2 }}>Work Type</span>
                        <span style={{ flex: 1 }}>Area</span>
                        <span style={{ width: 130, textAlign: 'right' }}>₹ Cost / Unit</span>
                        {isAdmin && <span style={{ width: 30 }} />}
                      </div>
                    )}

                    {items.map((row, i) => {
                      const isEditing = !!editingL[row.id]
                      const e = editingL[row.id] || {}
                      return (
                        <div key={row.id} style={isMobile
                          ? { padding: '12px 14px', borderTop: i > 0 ? '1px solid var(--border, #2e3040)' : 'none' }
                          : { display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderTop: '1px solid var(--border, #2e3040)', minHeight: 44, background: i % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }
                        }>
                          {isEditing ? (
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <input value={e.work_type} onChange={ev => setEditingL(p => ({ ...p, [row.id]: { ...p[row.id], work_type: ev.target.value } }))} placeholder="Work type" style={s.editInput} />
                                <input value={e.area} onChange={ev => setEditingL(p => ({ ...p, [row.id]: { ...p[row.id], area: ev.target.value } }))} placeholder="Area" style={s.editInput} />
                                <input type="number" value={e.cost} onChange={ev => setEditingL(p => ({ ...p, [row.id]: { ...p[row.id], cost: ev.target.value } }))} placeholder="Cost ₹" style={s.editInput} />
                                <input value={e.unit} onChange={ev => setEditingL(p => ({ ...p, [row.id]: { ...p[row.id], unit: ev.target.value } }))} placeholder="Unit" style={s.editInput} />
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button onClick={() => saveLabourRow(row)} disabled={savingL[row.id]} style={{ flex: 1, padding: '6px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{savingL[row.id] ? '…' : '✓ Save'}</button>
                                <button onClick={() => cancelEditL(row.id)} style={{ flex: 1, padding: '6px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                              </div>
                            </div>
                          ) : isMobile ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', marginBottom: 3 }}>{row.work_type}</div>
                                {row.area && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{row.area}</div>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>₹{(row.cost || 0).toLocaleString('en-IN')}</div>
                                  {row.unit && <div style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>per {row.unit}</div>}
                                </div>
                                {isAdmin && (
                                  <button onClick={() => startEditL(row)} style={s.editBtn}>
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <>
                              <span style={{ flex: 2, fontSize: 13, color: 'var(--text, #e8e8f0)' }}>{row.work_type}</span>
                              <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{row.area || '—'}</span>
                              <span style={{ width: 130, flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--text, #e8e8f0)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                                ₹{(row.cost || 0).toLocaleString('en-IN')}{row.unit ? ` / ${row.unit}` : ''}
                              </span>
                              {isAdmin && (
                                <div style={{ width: 30, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                                  <button onClick={() => startEditL(row)} style={s.editBtn}>
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}

                    {/* Add form for this trade */}
                    {isAdmin && addingTo === trade && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border, #2e3040)', background: 'rgba(200,150,62,0.04)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <input value={newRow.work_type} onChange={e => setNewRow(p => ({ ...p, work_type: e.target.value }))} placeholder="Work type" style={s.editInput} />
                          <input value={newRow.area} onChange={e => setNewRow(p => ({ ...p, area: e.target.value }))} placeholder="Area" style={s.editInput} />
                          <input type="number" value={newRow.cost} onChange={e => setNewRow(p => ({ ...p, cost: e.target.value }))} placeholder="Cost ₹" style={s.editInput} />
                          <input value={newRow.unit} onChange={e => setNewRow(p => ({ ...p, unit: e.target.value }))} placeholder="Unit" style={s.editInput} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={addLabourRow} style={{ flex: 1, padding: '6px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                          <button onClick={() => { setAddingTo(null); setNewRow({ work_type: '', area: '', cost: '', unit: '', trade: 'electrical' }) }} style={{ flex: 1, padding: '6px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {isAdmin && addingTo !== trade && (
                    <button onClick={() => { setAddingTo(trade); setNewRow({ work_type: '', area: '', cost: '', unit: '', trade }) }}
                      style={{ marginTop: 6, width: '100%', padding: '7px', background: 'transparent', border: `1px dashed ${meta.border}`, borderRadius: 7, color: meta.color, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                      + Add {trade} rate
                    </button>
                  )}
                </div>
              )
            })}

            {/* New rate form (when table is empty) */}
            {isAdmin && addingTo === '__new__' && (
              <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 10, padding: '14px' }}>
                <div style={{ marginBottom: 10 }}>
                  <span style={s.mobileLabel}>Trade</span>
                  <select value={newRow.trade} onChange={e => setNewRow(p => ({ ...p, trade: e.target.value }))}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 4, outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box' }}>
                    {TRADE_OPTS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input value={newRow.work_type} onChange={e => setNewRow(p => ({ ...p, work_type: e.target.value }))} placeholder="Work type" style={s.editInput} />
                  <input value={newRow.area} onChange={e => setNewRow(p => ({ ...p, area: e.target.value }))} placeholder="Area" style={s.editInput} />
                  <input type="number" value={newRow.cost} onChange={e => setNewRow(p => ({ ...p, cost: e.target.value }))} placeholder="Cost ₹" style={s.editInput} />
                  <input value={newRow.unit} onChange={e => setNewRow(p => ({ ...p, unit: e.target.value }))} placeholder="Unit" style={s.editInput} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={addLabourRow} style={{ flex: 1, padding: '7px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                  <button onClick={() => setAddingTo(null)} style={{ flex: 1, padding: '7px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {(tab === 'Material RC' ? matDisplayed : labDisplayed).length > 0 && (
          <p style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 10, textAlign: 'right' }}>
            {(tab === 'Material RC' ? matDisplayed : labDisplayed).length} item{(tab === 'Material RC' ? matDisplayed : labDisplayed).length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

const s = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 20 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  tradeHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  colHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#0d0d0d', fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' },
  editBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border, #2e3040)', borderRadius: 5, background: 'var(--bg-input, #252731)', color: 'var(--accent, #c8963e)', cursor: 'pointer' },
  editInput: { width: '100%', padding: '5px 8px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 4, outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box' },
  mobileLabel: { fontSize: 10, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 4 },
  empty: { textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)' },
}
