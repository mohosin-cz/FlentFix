import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TRADES = ['All', 'Electrical', 'Plumbing', 'Woodwork', 'Cleaning', 'Misc']
const TRADE_OPTS = ['electrical', 'plumbing', 'woodwork', 'cleaning', 'misc']
const TRADE_CODES = { electrical: 'EL', plumbing: 'PLB', woodwork: 'WW', cleaning: 'CLN', misc: 'MSC' }

const TRADE_META = {
  electrical: { color: '#f5c842', bg: 'rgba(245,200,66,0.08)', border: 'rgba(245,200,66,0.28)' },
  plumbing:   { color: '#5ba8e5', bg: 'rgba(91,168,229,0.08)',  border: 'rgba(91,168,229,0.28)'  },
  woodwork:   { color: '#c8963e', bg: 'rgba(200,150,62,0.08)',  border: 'rgba(200,150,62,0.28)'  },
  cleaning:   { color: '#3dba7a', bg: 'rgba(61,186,122,0.08)',  border: 'rgba(61,186,122,0.28)'  },
  misc:       { color: '#9394a8', bg: 'rgba(147,148,168,0.08)', border: 'rgba(147,148,168,0.28)' },
}

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640)
  useEffect(() => { const h = () => setM(window.innerWidth <= 640); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h) }, [])
  return m
}

function useToast() {
  const [toasts, setToasts] = useState([])
  function showToast(msg, type = 'success') {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000)
  }
  return [toasts, showToast]
}

function Toasts({ toasts }) {
  if (!toasts.length) return null
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column-reverse', gap: 8, zIndex: 300, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ padding: '10px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap', background: t.type === 'error' ? 'rgba(224,92,106,0.95)' : 'rgba(61,186,122,0.95)', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 12, padding: '24px 22px', maxWidth: 340, width: '100%' }}>
        <p style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', lineHeight: 1.6, margin: '0 0 20px', textAlign: 'center' }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '9px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '9px', background: 'rgba(224,92,106,0.15)', border: '1px solid rgba(224,92,106,0.4)', borderRadius: 7, color: '#e05c6a', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function QtyBadge({ qty }) {
  const color = qty > 5 ? '#3dba7a' : qty >= 2 ? '#f5c842' : '#e05c6a'
  const bg    = qty > 5 ? 'rgba(61,186,122,0.12)' : qty >= 2 ? 'rgba(245,200,66,0.12)' : 'rgba(224,92,106,0.12)'
  return <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, border: `1px solid ${color}33`, borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)' }}>{qty}</span>
}

function getItemCode(name) {
  return name.toUpperCase().replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, '').slice(0, 3).padEnd(3, 'X')
}
function generateFXIN(trade, name, qty) {
  return `${TRADE_CODES[(trade || '').toLowerCase()] || 'MSC'}${getItemCode(name || '')}${qty || 1}`
}

const blankAddForm = () => ({ item_name: '', trade: 'electrical', spec: '', size: '', price_inc: '', qty: '1', warranty_months: '', margin_percent: '' })

export default function InventoryDashboard() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [toasts, showToast] = useToast()
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [tradePill, setTradePill] = useState('All')
  const [filter, setFilter] = useState('')

  // Edit
  const [editing, setEditing]     = useState(null)   // item id
  const [editForm, setEditForm]   = useState({})
  const [saving, setSaving]       = useState(false)

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(null)  // { id, name }

  // Add modal
  const [showAdd, setShowAdd]   = useState(false)
  const [addForm, setAddForm]   = useState(blankAddForm())
  const [addSaving, setAddSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*, inventory_registry(vendor_name, vendor_contact, purchase_date, trade)')
        .order('created_at', { ascending: false })
      if (error) console.error('Dashboard fetch error:', error)
      setItems(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = items
    .filter(r => tradePill === 'All' || (r.trade || '').toLowerCase() === tradePill.toLowerCase())
    .filter(r => !filter || r.fxin?.toLowerCase().includes(filter.toLowerCase()) || r.item_name?.toLowerCase().includes(filter.toLowerCase()))

  const totalItems = filtered.reduce((s, r) => s + (parseInt(r.quantity_remaining ?? r.qty) || 0), 0)
  const totalValue = filtered.reduce((s, r) => s + (parseFloat(r.price_inc) || 0) * (parseInt(r.quantity_remaining ?? r.qty) || 0), 0)
  const tradeCount = new Set(filtered.map(r => (r.trade || 'misc').toLowerCase())).size

  function startEdit(row) {
    setEditing(row.id)
    setEditForm({
      item_name: row.item_name || '',
      spec: row.spec || '',
      size: row.size || '',
      price_inc: String(row.price_inc || ''),
      quantity_remaining: String(row.quantity_remaining ?? row.qty ?? ''),
      warranty_months: String(row.warranty_months || ''),
      margin_percent: String(row.margin_percent || ''),
    })
  }

  function cancelEdit() { setEditing(null); setEditForm({}) }

  async function saveEdit(row) {
    setSaving(true)
    const patch = {
      item_name: editForm.item_name.trim(),
      spec: editForm.spec || null,
      size: editForm.size || null,
      price_inc: parseFloat(editForm.price_inc) || 0,
      quantity_remaining: parseInt(editForm.quantity_remaining) || 0,
      warranty_months: parseInt(editForm.warranty_months) || 0,
      margin_percent: parseFloat(editForm.margin_percent) || 0,
    }
    const prev = row
    setItems(p => p.map(r => r.id === row.id ? { ...r, ...patch } : r))
    cancelEdit()
    const { error } = await supabase.from('inventory_items').update(patch).eq('id', row.id)
    if (error) { setItems(p => p.map(r => r.id === row.id ? prev : r)); showToast('Save failed', 'error') }
    else showToast('Item updated')
    setSaving(false)
  }

  async function confirmDeleteItem() {
    if (!confirmDelete) return
    const { id, name } = confirmDelete
    const prev = items.find(r => r.id === id)
    setItems(p => p.filter(r => r.id !== id))
    setConfirmDelete(null)
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) { setItems(p => [prev, ...p]); showToast('Delete failed', 'error') }
    else showToast(`Deleted "${name}"`)
  }

  async function handleAddItem() {
    if (!addForm.item_name.trim() || !addForm.trade) return
    setAddSaving(true)
    try {
      const baseFxin = generateFXIN(addForm.trade, addForm.item_name, addForm.qty || 1)
      const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).like('fxin', `${baseFxin}%`)
      const suffix = count || 0
      const fxin = suffix === 0 ? baseFxin : `${baseFxin}-${String(suffix).padStart(3, '0')}`
      const qty = parseInt(addForm.qty) || 1
      const newItem = {
        fxin, item_name: addForm.item_name.trim(), trade: addForm.trade,
        spec: addForm.spec || null, size: addForm.size || null,
        price_inc: parseFloat(addForm.price_inc) || 0,
        qty, quantity_remaining: qty, quantity_used: 0,
        warranty_months: parseInt(addForm.warranty_months) || 0,
        margin_percent: parseFloat(addForm.margin_percent) || 0,
        registry_id: null,
      }
      // Fetch without join — new items have no registry_id, join would always be null anyway
      const { data, error } = await supabase.from('inventory_items').insert(newItem).select('*').single()
      if (error) throw error
      setItems(p => [data, ...p])
      setShowAdd(false)
      setAddForm(blankAddForm())
      showToast('Item added')
    } catch (e) {
      showToast(e.message || 'Failed to add item', 'error')
    }
    setAddSaving(false)
  }

  if (loading) return <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>loading…</div>

  const ef = editForm
  const inpS = { padding: '6px 8px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 5, outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box', width: '100%' }

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
        <button onClick={() => setShowAdd(true)} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </header>

      <div style={{ flex: 1, padding: isMobile ? '16px 16px 60px' : '20px 24px 60px', maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total Units',  value: totalItems.toLocaleString('en-IN'),                   color: 'var(--text, #e8e8f0)' },
            { label: 'Total Value',  value: `₹${Math.round(totalValue).toLocaleString('en-IN')}`, color: 'var(--accent, #c8963e)' },
            { label: 'Trades',       value: tradeCount,                                            color: '#5ba8e5' },
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
              <button key={t} onClick={() => setTradePill(t)} style={{ padding: isMobile ? '3px 9px' : '5px 13px', fontSize: isMobile ? 10 : 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', borderRadius: 20, border: active ? `1px solid ${meta?.border || 'rgba(200,150,62,0.4)'}` : '1px solid var(--border, #2e3040)', background: active ? (meta?.bg || 'rgba(200,150,62,0.1)') : 'var(--bg-input, #252731)', color: active ? (meta?.color || 'var(--accent, #c8963e)') : 'var(--text-muted, #6b6d82)', transition: 'all 0.15s' }}>{t}</button>
            )
          })}
        </div>

        {/* Search + Add */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search FXIN or item name…"
              style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
          {!isMobile && (
            <button onClick={() => setShowAdd(true)} style={{ padding: '8px 16px', background: 'rgba(200,150,62,0.1)', border: '1px dashed rgba(200,150,62,0.4)', borderRadius: 7, color: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>
              + Add Item
            </button>
          )}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={s.empty}>No items found.{' '}
            <button onClick={() => setShowAdd(true)} style={{ background: 'none', border: 'none', color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>Add one?</button>
          </div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(row => {
              const meta = TRADE_META[(row.trade || 'misc').toLowerCase()] || TRADE_META.misc
              const vendor = row.inventory_registry?.vendor_name
              const isEd = editing === row.id
              return (
                <div key={row.id} style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${isEd ? 'rgba(200,150,62,0.4)' : 'var(--border, #2e3040)'}`, borderRadius: 10, padding: '13px 14px' }}>
                  {isEd ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div style={{ gridColumn: '1/-1' }}>
                          <span style={s.lbl}>Item Name</span>
                          <input value={ef.item_name} onChange={e => setEditForm(p => ({ ...p, item_name: e.target.value }))} style={inpS} />
                        </div>
                        <div><span style={s.lbl}>Spec</span><input value={ef.spec} onChange={e => setEditForm(p => ({ ...p, spec: e.target.value }))} style={inpS} placeholder="—" /></div>
                        <div><span style={s.lbl}>Size</span><input value={ef.size} onChange={e => setEditForm(p => ({ ...p, size: e.target.value }))} style={inpS} placeholder="—" /></div>
                        <div><span style={s.lbl}>Price ₹</span><input type="number" value={ef.price_inc} onChange={e => setEditForm(p => ({ ...p, price_inc: e.target.value }))} style={inpS} /></div>
                        <div><span style={s.lbl}>Qty Remaining</span><input type="number" value={ef.quantity_remaining} onChange={e => setEditForm(p => ({ ...p, quantity_remaining: e.target.value }))} style={inpS} /></div>
                        <div><span style={s.lbl}>Warranty (mo)</span><input type="number" value={ef.warranty_months} onChange={e => setEditForm(p => ({ ...p, warranty_months: e.target.value }))} style={inpS} /></div>
                        <div><span style={s.lbl}>Margin %</span><input type="number" value={ef.margin_percent} onChange={e => setEditForm(p => ({ ...p, margin_percent: e.target.value }))} style={inpS} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => saveEdit(row)} disabled={saving} style={{ flex: 1, padding: '8px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? '…' : '✓ Save'}</button>
                        <button onClick={cancelEdit} style={{ flex: 1, padding: '8px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {row.fxin && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)' }}>{row.fxin}</span>}
                          <span style={{ fontSize: 8, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>{row.trade}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <QtyBadge qty={row.quantity_remaining ?? row.qty ?? 0} />
                          <button onClick={() => startEdit(row)} style={s.iconBtn} title="Edit">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button onClick={() => setConfirmDelete({ id: row.id, name: row.item_name })} style={{ ...s.iconBtn, color: '#e05c6a', borderColor: 'rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.08)' }} title="Delete">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', marginBottom: 3 }}>{row.item_name}</div>
                      {(row.spec || row.size) && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 3 }}>{[row.spec, row.size].filter(Boolean).join(' · ')}</div>}
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', marginTop: 4 }}>
                        <span>₹{(parseFloat(row.price_inc) || 0).toLocaleString('en-IN')}</span>
                        {row.quantity_used > 0 && <span>Used: {row.quantity_used}</span>}
                        {row.warranty_months > 0 && <span>{row.warranty_months}mo warranty</span>}
                        {vendor && <span>{vendor}</span>}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px 60px 60px 80px 80px 80px 80px', padding: '10px 14px', background: '#0d0d0d', fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', gap: 8 }}>
              <span>FXIN</span><span>Item Name</span><span>Trade</span>
              <span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Used</span>
              <span style={{ textAlign: 'right' }}>Price ₹</span><span>Spec</span><span>Warranty</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>
            {filtered.map((row, i) => {
              const meta = TRADE_META[(row.trade || 'misc').toLowerCase()] || TRADE_META.misc
              const vendor = row.inventory_registry?.vendor_name
              const isEd = editing === row.id
              return (
                <div key={row.id}>
                  {isEd ? (
                    <div style={{ padding: '14px', borderTop: '1px solid var(--border, #2e3040)', background: 'rgba(200,150,62,0.04)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
                        <div style={{ gridColumn: '1/3' }}><span style={s.lbl}>Item Name</span><input value={ef.item_name} onChange={e => setEditForm(p => ({ ...p, item_name: e.target.value }))} style={inpS} /></div>
                        <div><span style={s.lbl}>Spec</span><input value={ef.spec} onChange={e => setEditForm(p => ({ ...p, spec: e.target.value }))} style={inpS} placeholder="—" /></div>
                        <div><span style={s.lbl}>Size</span><input value={ef.size} onChange={e => setEditForm(p => ({ ...p, size: e.target.value }))} style={inpS} placeholder="—" /></div>
                        <div><span style={s.lbl}>Price ₹</span><input type="number" value={ef.price_inc} onChange={e => setEditForm(p => ({ ...p, price_inc: e.target.value }))} style={inpS} /></div>
                        <div><span style={s.lbl}>Qty Remaining</span><input type="number" value={ef.quantity_remaining} onChange={e => setEditForm(p => ({ ...p, quantity_remaining: e.target.value }))} style={inpS} /></div>
                        <div><span style={s.lbl}>Warranty (mo)</span><input type="number" value={ef.warranty_months} onChange={e => setEditForm(p => ({ ...p, warranty_months: e.target.value }))} style={inpS} /></div>
                        <div><span style={s.lbl}>Margin %</span><input type="number" value={ef.margin_percent} onChange={e => setEditForm(p => ({ ...p, margin_percent: e.target.value }))} style={inpS} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => saveEdit(row)} disabled={saving} style={{ padding: '7px 20px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{saving ? '…' : '✓ Save'}</button>
                        <button onClick={cancelEdit} style={{ padding: '7px 16px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 90px 60px 60px 80px 80px 80px 80px', padding: '0 14px', borderTop: '1px solid var(--border, #2e3040)', minHeight: 44, alignItems: 'center', gap: 8, background: i % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }}>
                      <span>{row.fxin ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 4, padding: '2px 6px', fontFamily: 'var(--font-mono, monospace)' }}>{row.fxin}</span> : '—'}</span>
                      <span style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.item_name}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }}>{row.trade}</span>
                      <span style={{ textAlign: 'right' }}><QtyBadge qty={row.quantity_remaining ?? row.qty ?? 0} /></span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>{row.quantity_used || 0}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>₹{(parseFloat(row.price_inc) || 0).toLocaleString('en-IN')}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.spec || '—'}</span>
                      <span style={{ fontSize: 11, color: row.warranty_months > 0 ? '#3dba7a' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{row.warranty_months > 0 ? `${row.warranty_months}mo` : '—'}</span>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                        <button onClick={() => startEdit(row)} style={s.iconBtn} title="Edit">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button onClick={() => setConfirmDelete({ id: row.id, name: row.item_name })} style={{ ...s.iconBtn, color: '#e05c6a', borderColor: 'rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.08)' }} title="Delete">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
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

      {/* Add Item Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 150, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: isMobile ? 0 : 20 }}>
          <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: isMobile ? '14px 14px 0 0' : 12, width: '100%', maxWidth: 560, maxHeight: '90svh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>Add Inventory Item</span>
              <button onClick={() => { setShowAdd(false); setAddForm(blankAddForm()) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {addForm.item_name && addForm.trade && (
                <div style={{ padding: '7px 12px', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.2)', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent, #c8963e)' }}>
                  FXIN preview: <strong>{generateFXIN(addForm.trade, addForm.item_name, addForm.qty || 1)}</strong>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <span style={s.lbl}>Item Name *</span>
                  <input value={addForm.item_name} onChange={e => setAddForm(p => ({ ...p, item_name: e.target.value }))} placeholder="e.g. MCB 32A" style={{ ...inpS, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }} />
                </div>
                <div>
                  <span style={s.lbl}>Trade *</span>
                  <select value={addForm.trade} onChange={e => setAddForm(p => ({ ...p, trade: e.target.value }))} style={{ ...inpS, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', appearance: 'none', cursor: 'pointer' }}>
                    {TRADE_OPTS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <span style={s.lbl}>Qty</span>
                  <input type="number" value={addForm.qty} onChange={e => setAddForm(p => ({ ...p, qty: e.target.value }))} placeholder="1" style={{ ...inpS, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }} />
                </div>
                <div>
                  <span style={s.lbl}>Price Inc. ₹</span>
                  <input type="number" value={addForm.price_inc} onChange={e => setAddForm(p => ({ ...p, price_inc: e.target.value }))} placeholder="0" style={{ ...inpS, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }} />
                </div>
                <div>
                  <span style={s.lbl}>Spec</span>
                  <input value={addForm.spec} onChange={e => setAddForm(p => ({ ...p, spec: e.target.value }))} placeholder="optional" style={{ ...inpS, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }} />
                </div>
                <div>
                  <span style={s.lbl}>Size</span>
                  <input value={addForm.size} onChange={e => setAddForm(p => ({ ...p, size: e.target.value }))} placeholder="optional" style={{ ...inpS, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }} />
                </div>
                <div>
                  <span style={s.lbl}>Warranty (months)</span>
                  <input type="number" value={addForm.warranty_months} onChange={e => setAddForm(p => ({ ...p, warranty_months: e.target.value }))} placeholder="0" style={{ ...inpS, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }} />
                </div>
                <div>
                  <span style={s.lbl}>Margin %</span>
                  <input type="number" value={addForm.margin_percent} onChange={e => setAddForm(p => ({ ...p, margin_percent: e.target.value }))} placeholder="0" style={{ ...inpS, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }} />
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border, #2e3040)', display: 'flex', gap: 8 }}>
              <button onClick={handleAddItem} disabled={addSaving || !addForm.item_name.trim()} style={{ flex: 1, padding: '10px', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 700, cursor: addSaving || !addForm.item_name.trim() ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', opacity: addSaving || !addForm.item_name.trim() ? 0.6 : 1 }}>
                {addSaving ? 'Adding…' : 'Add Item →'}
              </button>
              <button onClick={() => { setShowAdd(false); setAddForm(blankAddForm()) }} style={{ padding: '10px 16px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <ConfirmDialog
          message={`Delete "${confirmDelete.name}"? This cannot be undone.`}
          onConfirm={confirmDeleteItem}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <Toasts toasts={toasts} />
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
  iconBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border, #2e3040)', borderRadius: 5, background: 'var(--bg-input, #252731)', color: 'var(--accent, #c8963e)', cursor: 'pointer' },
  lbl: { fontSize: 10, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 4 },
}
