import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TRADES = ['Electrical', 'Plumbing', 'Woodwork', 'Cleaning', 'Misc', 'Appliances']
const TRADE_CODES = { electrical: 'EL', plumbing: 'PLB', woodwork: 'WW', cleaning: 'CLN', misc: 'MSC', appliances: 'APL' }

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return isMobile
}

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
  return { _key: Math.random().toString(36).slice(2), itemName: '', qty: '', spec: '', size: '', priceInc: '', warranty: '', margin: '' }
}

const today = new Date().toISOString().split('T')[0]

function Label({ children, optional }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 }}>
      {children}{optional && <span style={{ fontWeight: 400, color: 'var(--text-muted, #6b6d82)', textTransform: 'none', marginLeft: 6 }}>optional</span>}
    </span>
  )
}

function Inp({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '9px 12px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
    />
  )
}

function Sel({ value, onChange, options, placeholder }) {
  return (
    <div style={{ position: 'relative' }}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '9px 32px 9px 12px', fontSize: 13, color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', appearance: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
        <path d="M2.5 5l4.5 4 4.5-4" stroke="#B0B0B0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function StepBar({ step }) {
  return (
    <div style={{ padding: '10px 20px', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', alignItems: 'center', gap: 10 }}>
      {[1, 2].map(n => (
        <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', background: step === n ? 'var(--accent, #c8963e)' : step > n ? 'var(--green, #3dba7a)' : 'var(--bg-input, #252731)', color: step >= n ? '#fff' : 'var(--text-muted, #6b6d82)', border: step >= n ? 'none' : '1px solid var(--border, #2e3040)' }}>
            {step > n ? '✓' : n}
          </div>
          <span style={{ fontSize: 11, fontWeight: step === n ? 600 : 400, color: step === n ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
            {n === 1 ? 'Purchase Details' : 'Log Items'}
          </span>
          {n < 2 && <div style={{ width: 24, height: 1, background: 'var(--border, #2e3040)', marginLeft: 2 }} />}
        </div>
      ))}
    </div>
  )
}

function downloadTemplate() {
  const csv = 'Item Name,Qty,Spec,Size,Price Inc.,Warranty (months),Margin %\n,,,,,\n,,,,,\n,,,,,\n'
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'flentfix_inventory_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

async function parseUploadedFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const lines = e.target.result.trim().split('\n').slice(1)
        const items = lines
          .map(line => {
            const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
            return { itemName: cols[0] || '', qty: cols[1] || '', spec: cols[2] || '', size: cols[3] || '', priceInc: cols[4] || '', warranty: cols[5] || '', margin: cols[6] || '' }
          })
          .filter(it => it.itemName)
        resolve(items)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}

export default function RegisterInventory() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const step     = parseInt(searchParams.get('step') || '1')
  const goToStep = (n) => setSearchParams({ step: n })
  const isMobile = useIsMobile()
  const invoiceRef = useRef(null)
  const uploadRef  = useRef(null)
  const [purchaseDate, setPurchaseDate] = useState(today)
  const [trade, setTrade]               = useState('')
  const [totalAmount, setTotalAmount]   = useState('')
  const [vendorName, setVendorName]     = useState('')
  const [vendorContact, setVendorContact] = useState('')
  const [vendorGstin, setVendorGstin]   = useState('')
  const [invoiceFile, setInvoiceFile]   = useState(null)
  const [items, setItems]               = useState([blankItem()])
  const [collapsed, setCollapsed]       = useState(new Set())
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')

  function updateItem(i, field, value) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }
  function addItem() { setItems(prev => [...prev, blankItem()]) }
  function removeItem(i) {
    const key = items[i]._key
    setCollapsed(p => { const n = new Set(p); n.delete(key); return n })
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }
  function collapseItem(key) { setCollapsed(p => new Set([...p, key])) }
  function expandItem(key) { setCollapsed(p => { const n = new Set(p); n.delete(key); return n }) }

  function handleContinue() {
    if (!trade) { setError('Please select a trade.'); return }
    if (!purchaseDate) { setError('Please enter a purchase date.'); return }
    setError('')
    goToStep(2)
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0]; if (!file) return
    try {
      const parsed = await parseUploadedFile(file)
      if (parsed.length) setItems(prev => [...prev.filter(it => it.itemName), ...parsed])
    } catch {
      setError('Could not parse file. Please use the CSV template.')
    }
    e.target.value = ''
  }

  async function handleSubmit() {
    if (items.some(it => !it.itemName)) { setError('All items must have a name.'); return }
    setSubmitting(true); setError('')
    try {
      let invoiceUrl = null
      if (invoiceFile) {
        const fileExt = invoiceFile.name.split('.').pop()
        const filePath = `invoices/${Date.now()}.${fileExt}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('inventory-invoices')
          .upload(filePath, invoiceFile, { upsert: true })
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('inventory-invoices')
            .getPublicUrl(uploadData.path)
          invoiceUrl = publicUrl
        }
      }

      const { data: reg, error: regErr } = await supabase
        .from('inventory_registry')
        .insert({ purchase_date: purchaseDate, trade: trade.toLowerCase(), total_amount: parseFloat(totalAmount) || 0, invoice_url: invoiceUrl, vendor_name: vendorName || null, vendor_contact: vendorContact || null, vendor_gstin: vendorGstin || null })
        .select('id').single()
      if (regErr) throw regErr

      const fxinCounts = {}
      const itemRows = []
      for (const it of items.map(({ _key, ...rest }) => rest)) {
        const baseFxin = generateFXIN(trade, it.itemName, it.qty || 1)
        const { count } = await supabase.from('inventory_items').select('id', { count: 'exact', head: true }).like('fxin', `${baseFxin}%`)
        const suffix = (count || 0) + (fxinCounts[baseFxin] || 0)
        fxinCounts[baseFxin] = (fxinCounts[baseFxin] || 0) + 1
        const fxin = suffix === 0 ? baseFxin : `${baseFxin}-${String(suffix).padStart(3, '0')}`
        const qty = parseInt(it.qty) || 1
        itemRows.push({ registry_id: reg.id, fxin, item_name: it.itemName, qty, spec: it.spec, size: it.size, price_inc: parseFloat(it.priceInc) || 0, trade: trade.toLowerCase(), quantity_remaining: qty, quantity_used: 0, warranty_months: parseInt(it.warranty) || 0, margin_percent: parseFloat(it.margin) || 0 })
      }

      const { data: inserted, error: itemErr } = await supabase.from('inventory_items').insert(itemRows).select('fxin, item_name, price_inc')
      if (itemErr) throw itemErr

      for (const row of inserted) {
        const { data: existing } = await supabase.from('internal_rate_card').select('avg_cost, purchase_count').eq('fxin', row.fxin).single()
        const cnt = (existing?.purchase_count || 0) + 1
        const avg = existing ? ((existing.avg_cost * existing.purchase_count) + row.price_inc) / cnt : row.price_inc
        await supabase.from('internal_rate_card').upsert({
          fxin: row.fxin, trade: trade.toLowerCase(), item_name: row.item_name,
          last_price: row.price_inc, avg_cost: Math.round(avg * 100) / 100, purchase_count: cnt,
        }, { onConflict: 'fxin' })
      }

      navigate('/inventory/history')
    } catch (e) {
      setError(e.message || 'Something went wrong')
      setSubmitting(false)
    }
  }

  const mainPadding = isMobile ? '16px 16px' : '20px 24px'
  const mainMaxWidth = isMobile ? '100%' : 600
  const stickyBtn = isMobile
    ? { position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px', background: 'var(--bg, #16171f)', borderTop: '1px solid var(--border, #2e3040)', zIndex: 20 }
    : null

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Register Inventory</span>
          <span style={s.headerSub}>Step {step} of 2 — {step === 1 ? 'Purchase Details' : 'Log Items'}</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      <StepBar step={step} />

      <div style={{ flex: 1, padding: mainPadding, maxWidth: mainMaxWidth, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, boxSizing: 'border-box', paddingBottom: isMobile ? 100 : 48 }}>

        {/* STEP 1 */}
        {step === 1 && (
          <div style={s.card}>
            <p style={s.sectionLabel}>Purchase Details</p>

            {/* Date + Trade: 2 cols on desktop, 1 col on mobile */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
              <div>
                <Label>Date of Purchase</Label>
                <Inp type="date" value={purchaseDate} onChange={setPurchaseDate} />
              </div>
              <div style={{ marginTop: isMobile ? 0 : 0 }}>
                <Label>Trade</Label>
                <Sel value={trade} onChange={setTrade} options={TRADES} placeholder="Select trade…" />
              </div>
            </div>

            {/* Total amount with ₹ prefix */}
            <div style={{ marginTop: 14 }}>
              <Label>Total Amount</Label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', pointerEvents: 'none', zIndex: 1 }}>₹</span>
                <input
                  type="number"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ width: '100%', padding: '9px 12px 9px 28px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Vendor fields */}
            <div style={{ marginTop: 14 }}>
              <Label optional>Vendor Name</Label>
              <Inp value={vendorName} onChange={setVendorName} placeholder="e.g. Sharma Electricals" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <Label optional>Vendor Contact</Label>
                <Inp value={vendorContact} onChange={setVendorContact} placeholder="Phone or email" />
              </div>
              <div>
                <Label optional>Vendor GSTIN</Label>
                <Inp value={vendorGstin} onChange={setVendorGstin} placeholder="e.g. 29AAAAA0000A1Z5" />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <Label optional>Invoice</Label>
              <input ref={invoiceRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setInvoiceFile(e.target.files[0] || null)} />
              <button type="button" onClick={() => invoiceRef.current?.click()}
                style={{ ...s.uploadBtn, borderColor: invoiceFile ? 'var(--green, #3dba7a)' : 'var(--border-dash, #3a3d52)', color: invoiceFile ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', background: invoiceFile ? 'rgba(61,186,122,0.06)' : 'var(--bg-input, #252731)' }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1 11v2a1 1 0 001 1h12a1 1 0 001-1v-2M8 1v9M5 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {invoiceFile ? invoiceFile.name : 'Attach Invoice'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <>
            <div style={s.summaryBar}>
              <span style={s.summaryLabel}>Purchase:</span>
              <span style={s.summaryVal}>{trade}</span>
              <span style={s.summaryDot}>·</span>
              <span style={s.summaryVal}>{new Date(purchaseDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              {totalAmount && <><span style={s.summaryDot}>·</span><span style={s.summaryVal}>₹{parseFloat(totalAmount).toLocaleString('en-IN')}</span></>}
            </div>

            <div style={s.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ ...s.sectionLabel, margin: 0 }}>Items Purchased</p>
                <button type="button" onClick={addItem}
                  style={{ ...s.addBtn, width: isMobile ? undefined : undefined }}>
                  + Add Item
                </button>
              </div>

              {/* Bulk upload tools — stack on mobile */}
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 16 }}>
                <button type="button" onClick={downloadTemplate} style={{ ...s.bulkBtn, justifyContent: 'center' }}>
                  ⬇ Download Template
                </button>
                <input ref={uploadRef} type="file" accept=".csv,.xlsx" style={{ display: 'none' }} onChange={handleFileUpload} />
                <button type="button" onClick={() => uploadRef.current?.click()} style={{ ...s.bulkBtn, justifyContent: 'center' }}>
                  ⬆ Upload CSV
                </button>
              </div>

              {items.map((item, i) => {
                const fxin = trade && item.itemName ? generateFXIN(trade, item.itemName, item.qty || 1) : null
                const isCollapsed = collapsed.has(item._key)

                if (isCollapsed) {
                  // Compact view
                  return (
                    <div key={item._key} style={{ ...s.itemCard, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: item.spec || item.size || item.warranty || item.margin ? 4 : 0 }}>
                          {fxin && <span style={s.fxinBadge}>{fxin}</span>}
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{item.itemName || '—'}</span>
                          {item.qty && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>× {item.qty}</span>}
                          {item.priceInc && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>₹{parseFloat(item.priceInc).toLocaleString('en-IN')}</span>}
                        </div>
                        {(item.spec || item.size) && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 2 }}>
                            {[item.spec, item.size].filter(Boolean).join(' · ')}
                          </div>
                        )}
                        {(item.warranty || item.margin) && (
                          <div style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', gap: 10 }}>
                            {item.warranty ? <span>{item.warranty}mo warranty</span> : null}
                            {item.margin ? <span>{item.margin}% margin</span> : null}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button type="button" onClick={() => expandItem(item._key)}
                          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border, #2e3040)', borderRadius: 5, background: 'var(--bg-input, #252731)', color: 'var(--accent, #c8963e)', cursor: 'pointer' }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)}
                            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 5, background: 'rgba(224,92,106,0.08)', color: 'var(--red, #e05c6a)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  )
                }

                // Edit mode (expanded)
                return (
                  <div key={item._key} style={s.itemCard}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={s.itemNum}>#{i + 1}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {item.itemName && (
                          <button type="button" onClick={() => collapseItem(item._key)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(61,186,122,0.35)', borderRadius: 4, background: 'rgba(61,186,122,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--green, #3dba7a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                            ✓ done
                          </button>
                        )}
                        {items.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)} style={s.removeBtn}>× remove</button>
                        )}
                      </div>
                    </div>

                    {/* Item Name — full width on mobile */}
                    <div style={{ marginBottom: 10 }}>
                      <Label>Item Name</Label>
                      <Inp value={item.itemName} onChange={v => updateItem(i, 'itemName', v)} placeholder="e.g. MCB 32A" />
                    </div>

                    {/* FXIN badge */}
                    {fxin && (
                      isMobile ? (
                        <div style={{ marginBottom: 10, padding: '7px 12px', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>FXIN</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' }}>{fxin}</span>
                        </div>
                      ) : (
                        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>FXIN</span>
                          <span style={s.fxinBadge}>{fxin}</span>
                        </div>
                      )
                    )}

                    {/* Qty + Price side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <Label>Qty</Label>
                        <Inp type="number" value={item.qty} onChange={v => updateItem(i, 'qty', v)} placeholder="1" />
                      </div>
                      <div>
                        <Label>Price Inc. ₹</Label>
                        <Inp type="number" value={item.priceInc} onChange={v => updateItem(i, 'priceInc', v)} placeholder="0.00" />
                      </div>
                    </div>

                    {/* Spec + Size side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <Label optional>Spec</Label>
                        <Inp value={item.spec} onChange={v => updateItem(i, 'spec', v)} placeholder="e.g. 10kA, Type B" />
                      </div>
                      <div>
                        <Label optional>Size</Label>
                        <Inp value={item.size} onChange={v => updateItem(i, 'size', v)} placeholder="e.g. 25mm" />
                      </div>
                    </div>

                    {/* Warranty + Margin side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <Label optional>Warranty (months)</Label>
                        <Inp type="number" value={item.warranty} onChange={v => updateItem(i, 'warranty', v)} placeholder="0" />
                      </div>
                      <div>
                        <Label optional>Margin %</Label>
                        <Inp type="number" value={item.margin} onChange={v => updateItem(i, 'margin', v)} placeholder="0" />
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* + Add Item full width on mobile */}
              {isMobile && (
                <button type="button" onClick={addItem} style={{ ...s.addBtn, width: '100%', justifyContent: 'center', marginTop: 4 }}>
                  + Add Item
                </button>
              )}
            </div>
          </>
        )}

        {error && <div style={s.errorBox}>{error}</div>}

        {/* Non-sticky buttons (desktop) */}
        {!isMobile && step === 1 && (
          <button type="button" onClick={handleContinue} style={s.submitBtn}>Continue →</button>
        )}
        {!isMobile && step === 2 && (
          <button type="button" onClick={handleSubmit} disabled={submitting} style={{ ...s.submitBtn, opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Saving…' : 'Save Purchase →'}
          </button>
        )}
      </div>

      {/* Sticky button on mobile */}
      {isMobile && (
        <div style={stickyBtn}>
          {step === 1 && (
            <button type="button" onClick={handleContinue} style={s.submitBtn}>Continue →</button>
          )}
          {step === 2 && (
            <button type="button" onClick={handleSubmit} disabled={submitting} style={{ ...s.submitBtn, opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Saving…' : 'Save Purchase →'}
            </button>
          )}
        </div>
      )}
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
  card: { background: 'var(--bg-panel, #1e2028)', borderRadius: 10, padding: '18px 18px 20px', border: '1px solid var(--border, #2e3040)' },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 16 },
  summaryBar: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'rgba(200,150,62,0.07)', border: '1px solid rgba(200,150,62,0.2)', borderRadius: 8, flexWrap: 'wrap' },
  summaryLabel: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' },
  summaryVal: { fontSize: 12, fontWeight: 600, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' },
  summaryDot: { fontSize: 12, color: 'var(--text-muted, #6b6d82)' },
  uploadBtn: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: '1px dashed', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' },
  bulkBtn: { display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', border: '1px solid var(--border, #2e3040)', borderRadius: 6, background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', flex: 1 },
  addBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px dashed var(--accent, #c8963e)', borderRadius: 6, background: 'rgba(200,150,62,0.06)', color: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' },
  itemCard: { background: 'var(--bg-input, #252731)', borderRadius: 8, padding: 14, border: '1px solid var(--border, #2e3040)', marginBottom: 12 },
  itemNum: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  fxinBadge: { fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em' },
  removeBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' },
  errorBox: { padding: '10px 14px', background: 'rgba(224,92,106,0.1)', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' },
  submitBtn: { width: '100%', padding: '13px 20px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em' },
}
