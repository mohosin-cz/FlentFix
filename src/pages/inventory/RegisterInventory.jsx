import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TRADES = ['Electrical', 'Plumbing', 'Woodwork', 'Cleaning', 'Misc']
const TRADE_CODES = { electrical: 'EL', plumbing: 'PLB', woodwork: 'WW', cleaning: 'CLN', misc: 'MSC' }

function getItemCode(itemName) {
  const consonants = itemName.toUpperCase().replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, '')
  return consonants.slice(0, 3).padEnd(3, 'X')
}

function generateFXIN(trade, itemName, qty) {
  const tradeCode = TRADE_CODES[trade?.toLowerCase()] || 'MSC'
  const itemCode = getItemCode(itemName || '')
  return `${tradeCode}${itemCode}${qty || 1}`
}

function blankItem() {
  return { itemName: '', qty: '', spec: '', size: '', priceInc: '' }
}

const today = new Date().toISOString().split('T')[0]

// ── UI helpers ──────────────────────────────────────────────────────────────
function Label({ children, optional }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 }}>
      {children}{optional && <span style={{ fontWeight: 400, color: 'var(--text-muted, #6b6d82)', textTransform: 'none', marginLeft: 6 }}>optional</span>}
    </span>
  )
}

function Inp({ value, onChange, placeholder, type = 'text', style = {} }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '9px 12px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', ...style }}
    />
  )
}

function Sel({ value, onChange, options, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '9px 32px 9px 12px', fontSize: 13, color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', appearance: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <path d="M2.5 5l4.5 4 4.5-4" stroke="#B0B0B0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

export default function RegisterInventory() {
  const navigate = useNavigate()
  const invoiceRef = useRef(null)

  const [purchaseDate, setPurchaseDate] = useState(today)
  const [trade, setTrade]               = useState('')
  const [totalAmount, setTotalAmount]   = useState('')
  const [invoiceFile, setInvoiceFile]   = useState(null)
  const [items, setItems]               = useState([blankItem()])
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')

  function updateItem(i, field, value) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  function addItem() { setItems(prev => [...prev, blankItem()]) }
  function removeItem(i) { setItems(prev => prev.filter((_, idx) => idx !== i)) }

  async function handleSubmit() {
    if (!trade || !purchaseDate) { setError('Trade and purchase date are required.'); return }
    if (items.some(it => !it.itemName)) { setError('All items must have a name.'); return }
    setSubmitting(true)
    setError('')

    try {
      // 1. Upload invoice
      let invoiceUrl = null
      if (invoiceFile) {
        const path = `${Date.now()}-${invoiceFile.name}`
        const { error: upErr } = await supabase.storage.from('inventory-invoices').upload(path, invoiceFile)
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage.from('inventory-invoices').getPublicUrl(path)
          invoiceUrl = publicUrl
        }
      }

      // 2. Insert registry record
      const { data: reg, error: regErr } = await supabase
        .from('inventory_registry')
        .insert({ purchase_date: purchaseDate, trade: trade.toLowerCase(), total_amount: parseFloat(totalAmount) || 0, invoice_url: invoiceUrl })
        .select('id').single()
      if (regErr) throw regErr

      // 3. Build FXINs (handle duplicates)
      const fxinCounts = {}
      const itemRows = []
      for (const it of items) {
        const baseFxin = generateFXIN(trade, it.itemName, it.qty || 1)
        // Check if FXIN exists
        const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).like('fxin', `${baseFxin}%`)
        const suffix = (count || 0) + (fxinCounts[baseFxin] || 0)
        fxinCounts[baseFxin] = (fxinCounts[baseFxin] || 0) + 1
        const fxin = suffix === 0 ? baseFxin : `${baseFxin}-${String(suffix).padStart(3, '0')}`
        itemRows.push({ registry_id: reg.id, fxin, item_name: it.itemName, qty: parseInt(it.qty) || 1, spec: it.spec, size: it.size, price_inc: parseFloat(it.priceInc) || 0, trade: trade.toLowerCase() })
      }

      // 4. Insert items
      const { data: inserted, error: itemErr } = await supabase.from('inventory_items').insert(itemRows).select('fxin, item_name, price_inc')
      if (itemErr) throw itemErr

      // 5. Upsert internal rate card
      for (const row of inserted) {
        const { data: existing } = await supabase.from('internal_rate_card').select('avg_cost, purchase_count').eq('fxin', row.fxin).single()
        const count = (existing?.purchase_count || 0) + 1
        const avg = existing ? ((existing.avg_cost * existing.purchase_count) + row.price_inc) / count : row.price_inc
        await supabase.from('internal_rate_card').upsert({
          fxin: row.fxin, trade: trade.toLowerCase(), item_name: row.item_name,
          last_price: row.price_inc, avg_cost: Math.round(avg * 100) / 100, purchase_count: count,
        }, { onConflict: 'fxin' })
      }

      navigate('/inventory/history')
    } catch (e) {
      setError(e.message || 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/inventory')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Register Inventory</span>
          <span style={s.headerSub}>log purchase</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      <div style={s.main}>
        {/* ── Purchase details ── */}
        <div style={s.card}>
          <p style={s.section}>Purchase Details</p>
          <div style={s.row2}>
            <div>
              <Label>Date of Purchase</Label>
              <Inp type="date" value={purchaseDate} onChange={setPurchaseDate} />
            </div>
            <div>
              <Label>Trade</Label>
              <Sel value={trade} onChange={setTrade} options={TRADES} placeholder="Select trade…" />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Label>Total Amount ₹</Label>
            <Inp type="number" value={totalAmount} onChange={setTotalAmount} placeholder="0.00" />
          </div>
          <div style={{ marginTop: 14 }}>
            <Label optional>Invoice</Label>
            <input ref={invoiceRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setInvoiceFile(e.target.files[0] || null)} />
            <button type="button" onClick={() => invoiceRef.current?.click()} style={{ ...s.uploadBtn, borderColor: invoiceFile ? 'var(--green, #3dba7a)' : 'var(--border-dash, #3a3d52)', color: invoiceFile ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', background: invoiceFile ? 'rgba(61,186,122,0.06)' : 'var(--bg-input, #252731)' }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1 11v2a1 1 0 001 1h12a1 1 0 001-1v-2M8 1v9M5 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {invoiceFile ? invoiceFile.name : 'Attach Invoice'}
            </button>
          </div>
        </div>

        {/* ── Line items ── */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <p style={{ ...s.section, margin: 0 }}>Items Purchased</p>
            <button type="button" onClick={addItem} style={s.addBtn}>+ Add Item</button>
          </div>

          {items.map((item, i) => {
            const fxin = trade && item.itemName ? generateFXIN(trade, item.itemName, item.qty || 1) : null
            return (
              <div key={i} style={s.itemCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={s.itemNum}>#{i + 1}</span>
                    {fxin && <span style={s.fxinBadge}>{fxin}</span>}
                  </div>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} style={s.removeBtn}>× remove</button>
                  )}
                </div>
                <div style={s.row2}>
                  <div>
                    <Label>Item Name</Label>
                    <Inp value={item.itemName} onChange={v => updateItem(i, 'itemName', v)} placeholder="e.g. MCB 32A" />
                  </div>
                  <div>
                    <Label>Qty</Label>
                    <Inp type="number" value={item.qty} onChange={v => updateItem(i, 'qty', v)} placeholder="1" />
                  </div>
                </div>
                <div style={{ ...s.row2, marginTop: 10 }}>
                  <div>
                    <Label optional>Spec</Label>
                    <Inp value={item.spec} onChange={v => updateItem(i, 'spec', v)} placeholder="e.g. 10kA, Type B" />
                  </div>
                  <div>
                    <Label optional>Size</Label>
                    <Inp value={item.size} onChange={v => updateItem(i, 'size', v)} placeholder="e.g. 25mm" />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Label>Price Inc. ₹</Label>
                  <Inp type="number" value={item.priceInc} onChange={v => updateItem(i, 'priceInc', v)} placeholder="0.00" />
                </div>
              </div>
            )
          })}
        </div>

        {error && <div style={s.errorBox}>{error}</div>}

        <button type="button" onClick={handleSubmit} disabled={submitting} style={{ ...s.submitBtn, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Saving…' : 'Save Purchase →'}
        </button>
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
  main: { flex: 1, padding: '20px 20px 48px', maxWidth: 600, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: 'var(--bg-panel, #1e2028)', borderRadius: 10, padding: '18px 18px 20px', border: '1px solid var(--border, #2e3040)' },
  section: { fontSize: 11, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 16 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  uploadBtn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: '1px dashed', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' },
  addBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px dashed var(--accent, #c8963e)', borderRadius: 6, background: 'rgba(200,150,62,0.06)', color: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' },
  itemCard: { background: 'var(--bg-input, #252731)', borderRadius: 8, padding: 14, border: '1px solid var(--border, #2e3040)', marginBottom: 12 },
  itemNum: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  fxinBadge: { fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' },
  removeBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' },
  errorBox: { padding: '10px 14px', background: 'rgba(224,92,106,0.1)', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' },
  submitBtn: { width: '100%', padding: '13px 20px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em' },
}
