import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TRADES     = ['All', 'Electrical', 'Plumbing', 'Woodwork', 'Cleaning', 'Misc', 'Appliances']
const TRADE_OPTS = ['electrical', 'plumbing', 'woodwork', 'cleaning', 'misc', 'appliances']

const TRADE_COLORS = {
  electrical: { color: '#f5c842', bg: 'rgba(245,200,66,0.1)', border: 'rgba(245,200,66,0.3)' },
  plumbing:   { color: '#5ba8e5', bg: 'rgba(91,168,229,0.1)',  border: 'rgba(91,168,229,0.3)' },
  woodwork:   { color: '#c8963e', bg: 'rgba(200,150,62,0.1)',  border: 'rgba(200,150,62,0.3)' },
  cleaning:   { color: '#3dba7a', bg: 'rgba(61,186,122,0.1)',  border: 'rgba(61,186,122,0.3)' },
  misc:       { color: '#9394a8', bg: 'rgba(147,148,168,0.1)', border: 'rgba(147,148,168,0.3)' },
  appliances: { color: '#4a9eff', bg: 'rgba(74,158,255,0.1)',  border: 'rgba(74,158,255,0.3)'  },
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

function TradeBadge({ trade }) {
  const t = TRADE_COLORS[trade?.toLowerCase()] || TRADE_COLORS.misc
  return <span style={{ fontSize: 9, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 3, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{trade}</span>
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inpS = { padding: '7px 9px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 5, outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box', width: '100%' }
const lbl  = { fontSize: 10, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 4 }

export default function PurchaseHistory() {
  const navigate  = useNavigate()
  const isMobile  = useIsMobile()
  const [toasts, showToast] = useToast()
  const [records, setRecords]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [trade, setTrade]       = useState('All')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')

  // Edit registry
  const [editingRec, setEditingRec] = useState(null) // id
  const [recForm, setRecForm]       = useState({})
  const [recSaving, setRecSaving]   = useState(false)

  // Delete registry
  const [confirmDelRec, setConfirmDelRec] = useState(null) // { id, date }

  // Edit item
  const [editingItem, setEditingItem] = useState(null) // item id
  const [itemForm, setItemForm]       = useState({})
  const [itemSaving, setItemSaving]   = useState(false)

  // Delete item
  const [confirmDelItem, setConfirmDelItem] = useState(null) // { id, name, registry_id }

  // Invoice hover
  const [hoveredInvoice, setHoveredInvoice] = useState(null)

  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAdmin(user?.email === 'mohosin@flent.in')
    })
  }, [])

  useEffect(() => {
    load()
  }, [])

  function load() {
    supabase
      .from('inventory_registry')
      .select('*, inventory_items(*)')
      .order('purchase_date', { ascending: false })
      .then(({ data }) => { setRecords(data || []); setLoading(false) })
  }

  const filtered = records.filter(r => {
    if (trade !== 'All' && r.trade?.toLowerCase() !== trade.toLowerCase()) return false
    if (fromDate && r.purchase_date < fromDate) return false
    if (toDate   && r.purchase_date > toDate)   return false
    return true
  })

  // ── Registry edit ──
  function startEditRec(rec) {
    setEditingRec(rec.id)
    setExpanded(rec.id)
    setRecForm({
      purchase_date: rec.purchase_date || '',
      trade:         rec.trade || 'electrical',
      total_amount:  String(rec.total_amount || ''),
      vendor_name:   rec.vendor_name || '',
      vendor_contact: rec.vendor_contact || '',
      vendor_gstin:  rec.vendor_gstin || '',
    })
  }

  function cancelEditRec() { setEditingRec(null); setRecForm({}) }

  async function saveRec(rec) {
    setRecSaving(true)
    const patch = {
      purchase_date:  recForm.purchase_date,
      trade:          recForm.trade,
      total_amount:   parseFloat(recForm.total_amount) || 0,
      vendor_name:    recForm.vendor_name || null,
      vendor_contact: recForm.vendor_contact || null,
      vendor_gstin:   recForm.vendor_gstin || null,
    }
    const prev = records.find(r => r.id === rec.id)
    setRecords(p => p.map(r => r.id === rec.id ? { ...r, ...patch } : r))
    cancelEditRec()
    const { error } = await supabase.from('inventory_registry').update(patch).eq('id', rec.id)
    if (error) { setRecords(p => p.map(r => r.id === rec.id ? prev : r)); showToast('Save failed', 'error') }
    else showToast('Purchase updated')
    setRecSaving(false)
  }

  // ── Registry delete ──
  async function deletePurchase() {
    if (!confirmDelRec) return
    const { id } = confirmDelRec
    const prev = records.find(r => r.id === id)
    setRecords(p => p.filter(r => r.id !== id))
    setConfirmDelRec(null)
    if (expanded === id) setExpanded(null)
    // Delete items first, then registry
    await supabase.from('inventory_items').delete().eq('registry_id', id)
    const { error } = await supabase.from('inventory_registry').delete().eq('id', id)
    if (error) { setRecords(p => [prev, ...p]); showToast('Delete failed', 'error') }
    else showToast('Purchase deleted')
  }

  // ── Item edit ──
  function startEditItem(item) {
    setEditingItem(item.id)
    setItemForm({
      item_name:         item.item_name || '',
      spec:              item.spec || '',
      size:              item.size || '',
      qty:               String(item.qty || ''),
      price_inc:         String(item.price_inc || ''),
      warranty_months:   String(item.warranty_months || ''),
      margin_percent:    String(item.margin_percent || ''),
    })
  }

  function cancelEditItem() { setEditingItem(null); setItemForm({}) }

  async function saveItem(item) {
    setItemSaving(true)
    const patch = {
      item_name:       itemForm.item_name.trim(),
      spec:            itemForm.spec || null,
      size:            itemForm.size || null,
      qty:             parseInt(itemForm.qty) || 1,
      price_inc:       parseFloat(itemForm.price_inc) || 0,
      warranty_months: parseInt(itemForm.warranty_months) || 0,
      margin_percent:  parseFloat(itemForm.margin_percent) || 0,
    }
    const prev = item
    setRecords(p => p.map(r => ({
      ...r,
      inventory_items: (r.inventory_items || []).map(it => it.id === item.id ? { ...it, ...patch } : it)
    })))
    cancelEditItem()
    const { error } = await supabase.from('inventory_items').update(patch).eq('id', item.id)
    if (error) {
      setRecords(p => p.map(r => ({ ...r, inventory_items: (r.inventory_items || []).map(it => it.id === item.id ? prev : it) })))
      showToast('Save failed', 'error')
    } else showToast('Item updated')
    setItemSaving(false)
  }

  // ── Item delete ──
  async function deleteItem() {
    if (!confirmDelItem) return
    const { id, name, registry_id } = confirmDelItem
    setRecords(p => p.map(r => r.id === registry_id
      ? { ...r, inventory_items: (r.inventory_items || []).filter(it => it.id !== id) }
      : r
    ))
    setConfirmDelItem(null)
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) { load(); showToast('Delete failed', 'error') }
    else showToast(`Deleted "${name}"`)
  }

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
        {isAdmin ? (
          <button style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }} onClick={() => navigate('/inventory/register')} title="New Purchase">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        ) : <div style={{ width: 36 }} />}
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 60px' }}>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
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

        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>No purchase records found.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(rec => {
            const items  = rec.inventory_items || []
            const isOpen = expanded === rec.id
            const isEdRec = editingRec === rec.id
            const rf = recForm

            return (
              <div key={rec.id} style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: `1px solid ${isEdRec ? 'rgba(200,150,62,0.4)' : 'var(--border, #2e3040)'}`, overflow: 'hidden' }}>

                {/* ── Entry header ── */}
                {isEdRec ? (
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
                      <div>
                        <span style={lbl}>Date</span>
                        <input type="date" value={rf.purchase_date} onChange={e => setRecForm(p => ({ ...p, purchase_date: e.target.value }))} style={inpS} />
                      </div>
                      <div>
                        <span style={lbl}>Trade</span>
                        <select value={rf.trade} onChange={e => setRecForm(p => ({ ...p, trade: e.target.value }))} style={{ ...inpS, appearance: 'none', cursor: 'pointer' }}>
                          {TRADE_OPTS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                      </div>
                      <div>
                        <span style={lbl}>Total Amount ₹</span>
                        <input type="number" value={rf.total_amount} onChange={e => setRecForm(p => ({ ...p, total_amount: e.target.value }))} style={inpS} />
                      </div>
                      <div>
                        <span style={lbl}>Vendor Name</span>
                        <input value={rf.vendor_name} onChange={e => setRecForm(p => ({ ...p, vendor_name: e.target.value }))} placeholder="—" style={inpS} />
                      </div>
                      <div>
                        <span style={lbl}>Vendor Contact</span>
                        <input value={rf.vendor_contact} onChange={e => setRecForm(p => ({ ...p, vendor_contact: e.target.value }))} placeholder="—" style={inpS} />
                      </div>
                      <div>
                        <span style={lbl}>Vendor GSTIN</span>
                        <input value={rf.vendor_gstin} onChange={e => setRecForm(p => ({ ...p, vendor_gstin: e.target.value }))} placeholder="—" style={inpS} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => saveRec(rec)} disabled={recSaving} style={{ padding: '7px 20px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{recSaving ? '…' : '✓ Save'}</button>
                      <button onClick={cancelEditRec} style={{ padding: '7px 14px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px' }}>
                    <button type="button" onClick={() => setExpanded(isOpen ? null : rec.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text, #e8e8f0)', padding: 0 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>{formatDate(rec.purchase_date)}</span>
                          <TradeBadge trade={rec.trade} />
                          {rec.vendor_name && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{rec.vendor_name}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginRight: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)', whiteSpace: 'nowrap' }}>₹{(rec.total_amount || 0).toLocaleString('en-IN')}</div>
                      </div>
                      {rec.invoice_url ? (
                        <a
                          href={rec.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.08)', border: '1px solid var(--accent, #c8963e)', borderRadius: 4, padding: '3px 8px', textDecoration: 'none', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap', flexShrink: 0 }}
                        >📄 Invoice</a>
                      ) : (
                        <span onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                          <label
                            htmlFor={`invoice-upload-${rec.id}`}
                            style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', border: '1px dashed var(--border, #2e3040)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}
                          >⬆ Upload</label>
                          <input
                            id={`invoice-upload-${rec.id}`}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            style={{ display: 'none' }}
                            onChange={async e => {
                              const file = e.target.files[0]; if (!file) return
                              const fileExt = file.name.split('.').pop()
                              const filePath = `invoices/${Date.now()}.${fileExt}`
                              const { data: uploadData, error: upErr } = await supabase.storage
                                .from('inventory-invoices')
                                .upload(filePath, file, { upsert: true })
                              if (upErr) { showToast('Upload failed: ' + upErr.message, 'error'); return }
                              const { data: { publicUrl } } = supabase.storage
                                .from('inventory-invoices')
                                .getPublicUrl(uploadData.path)
                              const { error: dbErr } = await supabase
                                .from('inventory_registry')
                                .update({ invoice_url: publicUrl })
                                .eq('id', rec.id)
                              if (dbErr) { showToast('Save failed: ' + dbErr.message, 'error'); return }
                              showToast('Invoice uploaded')
                              load()
                            }}
                          />
                        </span>
                      )}
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: 'var(--text-muted, #6b6d82)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <path d="M2.5 5l4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {/* Actions */}
                    {isAdmin && (
                      <button onClick={() => startEditRec(rec)} style={s.iconBtn} title="Edit purchase">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    )}
                    {isAdmin && (
                      <button onClick={() => setConfirmDelRec({ id: rec.id, date: formatDate(rec.purchase_date) })} style={{ ...s.iconBtn, color: '#e05c6a', borderColor: 'rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.08)' }} title="Delete purchase">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    )}
                  </div>
                )}

                {/* ── Expanded items ── */}
                {isOpen && !isEdRec && (
                  <div style={{ borderTop: '1px solid var(--border, #2e3040)' }}>
                    {items.length === 0 ? (
                      <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No items recorded.</div>
                    ) : (
                      <>
                        {!isMobile && (
                          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 50px 80px 64px', gap: 6, padding: '8px 16px', fontSize: 9, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>
                            <span>FXIN</span><span>Item</span><span>Spec</span>
                            <span style={{ textAlign: 'right' }}>Qty</span>
                            <span style={{ textAlign: 'right' }}>Price</span>
                            <span style={{ textAlign: 'right' }}>Actions</span>
                          </div>
                        )}
                        {items.map(item => {
                          const isEdItem = editingItem === item.id
                          const itf = itemForm
                          return (
                            <div key={item.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                              {isEdItem ? (
                                <div style={{ padding: '10px 16px', background: 'rgba(200,150,62,0.03)' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                                    <div style={{ gridColumn: isMobile ? '1/-1' : '1/3' }}>
                                      <span style={lbl}>Item Name</span>
                                      <input value={itf.item_name} onChange={e => setItemForm(p => ({ ...p, item_name: e.target.value }))} style={inpS} />
                                    </div>
                                    <div><span style={lbl}>Spec</span><input value={itf.spec} onChange={e => setItemForm(p => ({ ...p, spec: e.target.value }))} placeholder="—" style={inpS} /></div>
                                    <div><span style={lbl}>Size</span><input value={itf.size} onChange={e => setItemForm(p => ({ ...p, size: e.target.value }))} placeholder="—" style={inpS} /></div>
                                    <div><span style={lbl}>Qty</span><input type="number" value={itf.qty} onChange={e => setItemForm(p => ({ ...p, qty: e.target.value }))} style={inpS} /></div>
                                    <div><span style={lbl}>Price ₹</span><input type="number" value={itf.price_inc} onChange={e => setItemForm(p => ({ ...p, price_inc: e.target.value }))} style={inpS} /></div>
                                    <div><span style={lbl}>Warranty (mo)</span><input type="number" value={itf.warranty_months} onChange={e => setItemForm(p => ({ ...p, warranty_months: e.target.value }))} style={inpS} /></div>
                                    <div><span style={lbl}>Margin %</span><input type="number" value={itf.margin_percent} onChange={e => setItemForm(p => ({ ...p, margin_percent: e.target.value }))} style={inpS} /></div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => saveItem(item)} disabled={itemSaving} style={{ padding: '6px 16px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{itemSaving ? '…' : '✓ Save'}</button>
                                    <button onClick={cancelEditItem} style={{ padding: '6px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                                  </div>
                                </div>
                              ) : isMobile ? (
                                <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{item.fxin}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text, #e8e8f0)', marginBottom: 2 }}>{item.item_name}</div>
                                    {(item.spec || item.size) && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)' }}>{[item.spec, item.size].filter(Boolean).join(' · ')}</div>}
                                    <div style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', marginTop: 3 }}>×{item.qty} · ₹{(item.price_inc || 0).toLocaleString('en-IN')}</div>
                                  </div>
                                  {isAdmin && (
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => startEditItem(item)} style={s.iconBtn}>
                                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      </button>
                                      <button onClick={() => setConfirmDelItem({ id: item.id, name: item.item_name, registry_id: rec.id })} style={{ ...s.iconBtn, color: '#e05c6a', borderColor: 'rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.08)' }}>
                                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 80px 50px 80px 64px', gap: 6, padding: '8px 16px', alignItems: 'center' }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}>{item.fxin}</span>
                                  <div>
                                    <div style={{ fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{item.item_name}</div>
                                    {(item.spec || item.size) && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 1 }}>{[item.spec, item.size].filter(Boolean).join(' · ')}</div>}
                                  </div>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{item.spec || '—'}</span>
                                  <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>×{item.qty}</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', textAlign: 'right' }}>₹{(item.price_inc || 0).toLocaleString('en-IN')}</span>
                                  {isAdmin && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                      <button onClick={() => startEditItem(item)} style={s.iconBtn}>
                                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      </button>
                                      <button onClick={() => setConfirmDelItem({ id: item.id, name: item.item_name, registry_id: rec.id })} style={{ ...s.iconBtn, color: '#e05c6a', borderColor: 'rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.08)' }}>
                                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4 3v6h4V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {confirmDelRec && <ConfirmDialog message={`Delete purchase from ${confirmDelRec.date}? All items in this purchase will also be deleted.`} onConfirm={deletePurchase} onCancel={() => setConfirmDelRec(null)} />}
      {confirmDelItem && <ConfirmDialog message={`Delete "${confirmDelItem.name}"? This cannot be undone.`} onConfirm={deleteItem} onCancel={() => setConfirmDelItem(null)} />}
      <Toasts toasts={toasts} />
    </div>
  )
}

const s = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  iconBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border, #2e3040)', borderRadius: 5, background: 'var(--bg-input, #252731)', color: 'var(--accent, #c8963e)', cursor: 'pointer', flexShrink: 0 },
}
