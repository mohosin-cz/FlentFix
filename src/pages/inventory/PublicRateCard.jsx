import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const ADMIN_EMAIL = 'mohosin@flent.in'

const TRADES = ['All', 'Electrical', 'Plumbing', 'Woodwork', 'Cleaning', 'Misc']

const TRADE_META = {
  electrical: { bg: 'rgba(200,150,62,0.12)', border: 'rgba(200,150,62,0.35)', color: '#c8963e' },
  plumbing:   { bg: 'rgba(56,139,220,0.12)', border: 'rgba(56,139,220,0.35)', color: '#388bdc' },
  woodwork:   { bg: 'rgba(210,120,50,0.12)', border: 'rgba(210,120,50,0.35)', color: '#d27832' },
  cleaning:   { bg: 'rgba(61,186,122,0.12)', border: 'rgba(61,186,122,0.35)', color: '#3dba7a' },
  misc:       { bg: 'rgba(147,148,168,0.12)', border: 'rgba(147,148,168,0.35)', color: '#9394a8' },
}

function TradePill({ trade, active, onClick }) {
  const key = trade.toLowerCase()
  const meta = TRADE_META[key] || TRADE_META.misc
  const isAll = trade === 'All'
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
        borderRadius: 20, fontFamily: 'var(--font-mono, monospace)',
        background: active ? (isAll ? 'rgba(200,150,62,0.15)' : meta.bg) : 'transparent',
        border: active ? `1px solid ${isAll ? 'rgba(200,150,62,0.4)' : meta.border}` : '1px solid var(--border, #2e3040)',
        color: active ? (isAll ? '#c8963e' : meta.color) : 'var(--text-muted, #6b6d82)',
        transition: 'all 0.12s',
      }}
    >{trade}</button>
  )
}

function EditInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '5px 8px', fontSize: 12,
        color: 'var(--text, #e8e8f0)', background: 'var(--bg, #16171f)',
        border: '1px solid var(--accent, #c8963e)', borderRadius: 5,
        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
      }}
    />
  )
}

const TEMPLATE_COLS = 'trade,area,item_name,material_cost,labour_cost,unit'

function downloadTemplate() {
  const sample = [
    TEMPLATE_COLS,
    'electrical,Living Room,LED Downlight Install,0,350,nos',
    'plumbing,Bathroom,Basin Tap Replacement,450,200,nos',
    'woodwork,Kitchen,Cabinet Door Hinge,120,80,nos',
  ].join('\n')
  const blob = new Blob([sample], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'rate_card_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function PublicRateCard() {
  const navigate = useNavigate()
  const [rows, setRows]             = useState([])
  const [isAdmin, setIsAdmin]       = useState(false)
  const [tab, setTab]               = useState('Labour RC')
  const [tradePill, setTradePill]   = useState('All')
  const [filter, setFilter]         = useState('')
  const [editing, setEditing]       = useState({})
  const [saving, setSaving]         = useState({})
  const [addingTo, setAddingTo]     = useState(null)
  const [newRow, setNewRow]         = useState({ item_name: '', area: '', material_cost: '', labour_cost: '', unit: '' })
  const [loading, setLoading]       = useState(true)
  const [preview, setPreview]       = useState(null) // parsed CSV rows before confirm
  const [importing, setImporting]   = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    Promise.all([
      supabase.from('rate_card').select('*').order('trade').order('area'),
      supabase.auth.getUser(),
    ]).then(([{ data }, { data: { user } }]) => {
      setRows(data || [])
      setIsAdmin(user?.email === ADMIN_EMAIL)
      setLoading(false)
    })
  }, [])

  // Tab filter
  const tabRows = rows.filter(r =>
    tab === 'Labour RC'
      ? (parseFloat(r.material_cost) === 0 || !r.material_cost) && parseFloat(r.labour_cost) > 0
      : parseFloat(r.material_cost) > 0
  )

  // Trade pill filter
  const pillRows = tradePill === 'All'
    ? tabRows
    : tabRows.filter(r => r.trade?.toLowerCase() === tradePill.toLowerCase())

  // Search filter then group by trade
  const searchRows = filter
    ? pillRows.filter(r =>
        r.item_name?.toLowerCase().includes(filter.toLowerCase()) ||
        r.area?.toLowerCase().includes(filter.toLowerCase()) ||
        r.trade?.toLowerCase().includes(filter.toLowerCase())
      )
    : pillRows

  const grouped = searchRows.reduce((acc, row) => {
    const key = (row.trade || 'misc').toLowerCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  // Edit helpers
  function startEdit(row) {
    setEditing(prev => ({
      ...prev,
      [row.id]: {
        material_cost: String(row.material_cost ?? ''),
        labour_cost:   String(row.labour_cost ?? ''),
        unit:          row.unit || '',
        area:          row.area || '',
      }
    }))
  }
  function cancelEdit(id) { setEditing(prev => { const n = { ...prev }; delete n[id]; return n }) }

  async function saveRow(row) {
    const e = editing[row.id]; if (!e) return
    setSaving(prev => ({ ...prev, [row.id]: true }))
    const patch = {
      material_cost: parseFloat(e.material_cost) || 0,
      labour_cost:   parseFloat(e.labour_cost) || 0,
      unit:          e.unit,
      area:          e.area,
    }
    await supabase.from('rate_card').update(patch).eq('id', row.id)
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...patch } : r))
    setSaving(prev => { const n = { ...prev }; delete n[row.id]; return n })
    cancelEdit(row.id)
  }

  async function addItem(trade) {
    if (!newRow.item_name) return
    const { data, error } = await supabase.from('rate_card').insert({
      trade,
      area:          newRow.area || '',
      item_name:     newRow.item_name,
      material_cost: parseFloat(newRow.material_cost) || 0,
      labour_cost:   parseFloat(newRow.labour_cost) || 0,
      unit:          newRow.unit || '',
    }).select().single()
    if (!error && data) {
      setRows(prev => [...prev, data])
      setNewRow({ item_name: '', area: '', material_cost: '', labour_cost: '', unit: '' })
      setAddingTo(null)
    }
  }

  // CSV import
  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean)
      const header = lines[0].toLowerCase().split(',').map(h => h.trim())
      const requiredCols = ['trade', 'item_name', 'material_cost', 'labour_cost']
      if (!requiredCols.every(c => header.includes(c))) {
        alert('CSV missing required columns: ' + requiredCols.join(', '))
        return
      }
      const parsed = lines.slice(1).map(line => {
        const vals = line.split(',')
        const obj = {}
        header.forEach((h, i) => { obj[h] = vals[i]?.trim() || '' })
        return {
          trade:         obj.trade || 'misc',
          area:          obj.area || '',
          item_name:     obj.item_name || '',
          material_cost: parseFloat(obj.material_cost) || 0,
          labour_cost:   parseFloat(obj.labour_cost) || 0,
          unit:          obj.unit || '',
        }
      }).filter(r => r.item_name)
      setPreview(parsed)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function confirmImport() {
    if (!preview?.length) return
    setImporting(true)
    const { data, error } = await supabase.from('rate_card').insert(preview).select()
    if (!error && data) {
      setRows(prev => [...prev, ...data])
      setPreview(null)
    } else {
      alert('Import failed: ' + (error?.message || 'unknown error'))
    }
    setImporting(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>
      loading…
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>

      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/inventory')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Public Rate Card</span>
          <span style={s.headerSub}>client-facing pricing{isAdmin ? ' · admin' : ''}</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '12px 16px 0', maxWidth: 820, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {['Labour RC', 'Material RC'].map(t => (
          <button key={t} onClick={() => { setTab(t); setTradePill('All'); setFilter('') }}
            style={{
              padding: '7px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent, #c8963e)' : '2px solid transparent',
              color: tab === t ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
              fontFamily: 'var(--font-mono, monospace)', transition: 'color 0.12s',
            }}>{t}</button>
        ))}
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: '14px 16px 80px', boxSizing: 'border-box' }}>

        {/* Trade pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {TRADES.map(t => (
            <TradePill key={t} trade={t} active={tradePill === t} onClick={() => setTradePill(t)} />
          ))}
        </div>

        {/* Admin toolbar */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button onClick={downloadTemplate}
              style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Download Template
            </button>
            <button onClick={() => fileRef.current?.click()}
              style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 6, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V2M3 5l3-3 3 3M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Import from Excel / CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={handleFileSelect} style={{ display: 'none' }} />
          </div>
        )}

        {/* Info banner */}
        <div style={{ padding: '8px 12px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.15)', borderRadius: 7, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ color: 'var(--accent, #c8963e)', fontSize: 13, lineHeight: 1 }}>ℹ</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5 }}>
            {tab === 'Labour RC'
              ? 'Labour RC — items with labour cost and no material cost.'
              : 'Material RC — items with material cost.'}
          </span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search items, area, or trade…"
            style={{ width: '100%', padding: '9px 12px 9px 32px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {/* CSV Import Preview Modal */}
        {preview && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, width: '100%', maxWidth: 700, maxHeight: '80svh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>Import Preview — {preview.length} rows</span>
                <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 80px 80px 60px', gap: 0, padding: '8px 16px', background: '#0d0d0d', fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', position: 'sticky', top: 0 }}>
                  <span>Trade</span><span>Area</span><span>Item Name</span><span style={{ textAlign: 'right' }}>Material ₹</span><span style={{ textAlign: 'right' }}>Labour ₹</span><span style={{ textAlign: 'right' }}>Unit</span>
                </div>
                {preview.map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 80px 80px 60px', gap: 0, padding: '9px 16px', borderTop: '1px solid var(--border, #2e3040)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', fontSize: 12, color: 'var(--text, #e8e8f0)' }}>
                    <span style={{ color: TRADE_META[row.trade?.toLowerCase()]?.color || '#9394a8', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>{row.trade}</span>
                    <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{row.area || '—'}</span>
                    <span>{row.item_name}</span>
                    <span style={{ textAlign: 'right', color: 'var(--text-muted, #6b6d82)' }}>₹{row.material_cost}</span>
                    <span style={{ textAlign: 'right', color: 'var(--text-muted, #6b6d82)' }}>₹{row.labour_cost}</span>
                    <span style={{ textAlign: 'right', color: 'var(--text-muted, #6b6d82)' }}>{row.unit || '—'}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border, #2e3040)', display: 'flex', gap: 8 }}>
                <button onClick={confirmImport} disabled={importing}
                  style={{ padding: '8px 20px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', opacity: importing ? 0.6 : 1 }}>
                  {importing ? 'Importing…' : `Confirm Import (${preview.length} rows)`}
                </button>
                <button onClick={() => setPreview(null)}
                  style={{ padding: '8px 16px', background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* No data */}
        {Object.keys(grouped).length === 0 && (
          <div style={{ border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
            No items in this category.
          </div>
        )}

        {/* Tables per trade */}
        {Object.entries(grouped).map(([trade, items]) => {
          const meta = TRADE_META[trade] || TRADE_META.misc
          return (
            <div key={trade} style={{ marginBottom: 28 }}>
              {/* Trade heading */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>
                    {trade.charAt(0).toUpperCase() + trade.slice(1)}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                </div>
                {isAdmin && (
                  <button type="button"
                    onClick={() => { setAddingTo(trade); setNewRow({ item_name: '', area: '', material_cost: '', labour_cost: '', unit: '' }) }}
                    style={{ fontSize: 10, fontWeight: 600, color: meta.color, background: meta.bg, border: `1px dashed ${meta.border}`, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                    + Add Item
                  </button>
                )}
              </div>

              <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>

                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: `minmax(0,2.5fr) 90px 90px 90px 90px 70px${isAdmin ? ' 72px' : ''}`, gap: 0, padding: '9px 14px', background: '#0d0d0d', fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>
                  <span>Item Name</span>
                  <span style={{ textAlign: 'center' }}>Area</span>
                  <span style={{ textAlign: 'right' }}>Material ₹</span>
                  <span style={{ textAlign: 'right' }}>Labour ₹</span>
                  <span style={{ textAlign: 'right' }}>Total ₹</span>
                  <span style={{ textAlign: 'right' }}>Unit</span>
                  {isAdmin && <span />}
                </div>

                {items.map((row, ri) => {
                  const isEdit = !!editing[row.id]
                  const e = editing[row.id] || {}
                  const total = (parseFloat(row.material_cost) || 0) + (parseFloat(row.labour_cost) || 0)
                  return (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: `minmax(0,2.5fr) 90px 90px 90px 90px 70px${isAdmin ? ' 72px' : ''}`, gap: 0, padding: '10px 14px', borderTop: '1px solid var(--border, #2e3040)', background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', minHeight: 44, alignItems: 'center' }}>

                      {isEdit ? (
                        <>
                          <span style={{ fontSize: 12, color: 'var(--text, #e8e8f0)', paddingRight: 8 }}>{row.item_name}</span>
                          <div style={{ paddingRight: 6 }}><EditInput value={e.area} onChange={v => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], area: v } }))} placeholder="area" /></div>
                          <div style={{ paddingRight: 6 }}><EditInput type="number" value={e.material_cost} onChange={v => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], material_cost: v } }))} placeholder="0" /></div>
                          <div style={{ paddingRight: 6 }}><EditInput type="number" value={e.labour_cost}   onChange={v => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], labour_cost: v } }))}   placeholder="0" /></div>
                          <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>—</span>
                          <div><EditInput value={e.unit} onChange={v => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], unit: v } }))} placeholder="nos" /></div>
                          <div style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
                            <button onClick={() => saveRow(row)} disabled={saving[row.id]}
                              style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, fontWeight: 700, cursor: saving[row.id] ? 'not-allowed' : 'pointer' }}>
                              {saving[row.id] ? '…' : '✓'}
                            </button>
                            <button onClick={() => cancelEdit(row.id)}
                              style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 4, color: 'var(--text-muted, #6b6d82)', fontSize: 11, cursor: 'pointer' }}>
                              ✕
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 12, color: 'var(--text, #e8e8f0)', paddingRight: 8 }}>{row.item_name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', textAlign: 'center' }}>{row.area || '—'}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>₹{(row.material_cost || 0).toLocaleString('en-IN')}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>₹{(row.labour_cost || 0).toLocaleString('en-IN')}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', textAlign: 'right' }}>₹{total.toLocaleString('en-IN')}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>{row.unit || '—'}</span>
                          {isAdmin && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button onClick={() => startEdit(row)}
                                style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer' }}
                                title="Edit row">
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                  <path d="M9 2l2 2-7 7H2v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}

                {/* Add item form */}
                {isAdmin && addingTo === trade && (
                  <div style={{ padding: '14px 14px', background: 'rgba(200,150,62,0.04)', borderTop: '1px solid var(--border, #2e3040)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                      <div>
                        <span style={s.label}>Item Name</span>
                        <EditInput value={newRow.item_name} onChange={v => setNewRow(p => ({ ...p, item_name: v }))} placeholder="item name" />
                      </div>
                      <div>
                        <span style={s.label}>Area</span>
                        <EditInput value={newRow.area} onChange={v => setNewRow(p => ({ ...p, area: v }))} placeholder="e.g. Bathroom" />
                      </div>
                      <div>
                        <span style={s.label}>Material ₹</span>
                        <EditInput type="number" value={newRow.material_cost} onChange={v => setNewRow(p => ({ ...p, material_cost: v }))} placeholder="0" />
                      </div>
                      <div>
                        <span style={s.label}>Labour ₹</span>
                        <EditInput type="number" value={newRow.labour_cost} onChange={v => setNewRow(p => ({ ...p, labour_cost: v }))} placeholder="0" />
                      </div>
                      <div>
                        <span style={s.label}>Unit</span>
                        <EditInput value={newRow.unit} onChange={v => setNewRow(p => ({ ...p, unit: v }))} placeholder="nos" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => addItem(trade)}
                        style={{ padding: '7px 18px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                        Save Item
                      </button>
                      <button onClick={() => setAddingTo(null)}
                        style={{ padding: '7px 14px', background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div style={{ padding: '7px 14px', background: 'rgba(0,0,0,0.15)', borderTop: '1px solid var(--border, #2e3040)', display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s = {
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 56,
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  backBtn: {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer',
  },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  label: {
    fontSize: 10, fontWeight: 600, color: 'var(--text-dim, #9394a8)',
    textTransform: 'uppercase', letterSpacing: '0.07em',
    fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 4,
  },
}
