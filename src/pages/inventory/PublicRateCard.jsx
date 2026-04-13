import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function Label({ children }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 5 }}>{children}</span>
}

function Inp({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', padding: '7px 10px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg, #16171f)', border: '1px solid var(--accent, #c8963e)', borderRadius: 5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
    />
  )
}

const TRADE_ORDER = ['electrical', 'plumbing', 'woodwork', 'cleaning', 'misc', '']

export default function PublicRateCard() {
  const navigate = useNavigate()
  const [rows, setRows]         = useState([])
  const [editing, setEditing]   = useState({}) // id → { material_cost, labour_cost, unit }
  const [saving, setSaving]     = useState({})
  const [addingTo, setAddingTo] = useState(null) // trade key
  const [newRow, setNewRow]     = useState({ item_name: '', area: '', material_cost: '', labour_cost: '', unit: '' })
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('')

  useEffect(() => {
    supabase.from('rate_card').select('*').order('area').then(({ data }) => {
      setRows(data || [])
      setLoading(false)
    })
  }, [])

  // Group by area (used as trade grouping in existing table)
  const grouped = rows.reduce((acc, row) => {
    const key = row.area || 'General'
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  const filteredGroups = Object.entries(grouped).filter(([key, items]) => {
    if (!filter) return true
    return key.toLowerCase().includes(filter.toLowerCase()) ||
      items.some(r => r.item_name?.toLowerCase().includes(filter.toLowerCase()))
  })

  function startEdit(row) {
    setEditing(prev => ({ ...prev, [row.id]: { material_cost: String(row.material_cost ?? ''), labour_cost: String(row.labour_cost ?? ''), unit: row.unit || '' } }))
  }

  function cancelEdit(id) {
    setEditing(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  async function saveRow(row) {
    const e = editing[row.id]
    if (!e) return
    setSaving(prev => ({ ...prev, [row.id]: true }))
    await supabase.from('rate_card').update({
      material_cost: parseFloat(e.material_cost) || 0,
      labour_cost:   parseFloat(e.labour_cost)   || 0,
      unit:          e.unit,
    }).eq('id', row.id)
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, material_cost: parseFloat(e.material_cost) || 0, labour_cost: parseFloat(e.labour_cost) || 0, unit: e.unit } : r))
    setSaving(prev => { const next = { ...prev }; delete next[row.id]; return next })
    cancelEdit(row.id)
  }

  async function addNewItem(area) {
    if (!newRow.item_name) return
    const { data, error } = await supabase.from('rate_card').insert({
      area,
      item_name:     newRow.item_name,
      material_cost: parseFloat(newRow.material_cost) || 0,
      labour_cost:   parseFloat(newRow.labour_cost)   || 0,
      unit:          newRow.unit || '',
    }).select().single()
    if (!error && data) {
      setRows(prev => [...prev, data])
      setNewRow({ item_name: '', area: '', material_cost: '', labour_cost: '', unit: '' })
      setAddingTo(null)
    }
  }

  if (loading) return <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>loading rate card…</div>

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/inventory')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Public Rate Card</span>
          <span style={s.headerSub}>client-facing pricing</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search items or trade…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {filteredGroups.map(([area, items]) => (
          <div key={area} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>{area}</span>
              <button type="button" onClick={() => { setAddingTo(area); setNewRow({ item_name: '', area, material_cost: '', labour_cost: '', unit: '' }) }} style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.08)', border: '1px dashed rgba(200,150,62,0.3)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ Add Item</button>
            </div>

            <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>
              {/* Table header */}
              <div style={s.tableHead}>
                <span style={{ flex: 2 }}>Item</span>
                <span style={{ flex: 1, textAlign: 'right' }}>Material</span>
                <span style={{ flex: 1, textAlign: 'right' }}>Labour</span>
                <span style={{ flex: 1, textAlign: 'right' }}>Total</span>
                <span style={{ flex: 1, textAlign: 'right' }}>Unit</span>
                <span style={{ width: 60 }} />
              </div>

              {items.map((row, ri) => {
                const isEditing = !!editing[row.id]
                const e = editing[row.id] || {}
                const total = (parseFloat(row.material_cost) || 0) + (parseFloat(row.labour_cost) || 0)
                return (
                  <div key={row.id} style={{ ...s.tableRow, background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    {isEditing ? (
                      <>
                        <span style={{ flex: 2, fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                        <div style={{ flex: 1 }}><Inp value={e.material_cost} onChange={v => setEditing(prev => ({ ...prev, [row.id]: { ...prev[row.id], material_cost: v } }))} placeholder="0" type="number" /></div>
                        <div style={{ flex: 1 }}><Inp value={e.labour_cost} onChange={v => setEditing(prev => ({ ...prev, [row.id]: { ...prev[row.id], labour_cost: v } }))} placeholder="0" type="number" /></div>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>—</span>
                        <div style={{ flex: 1 }}><Inp value={e.unit} onChange={v => setEditing(prev => ({ ...prev, [row.id]: { ...prev[row.id], unit: v } }))} placeholder="nos" /></div>
                        <div style={{ width: 60, display: 'flex', gap: 4 }}>
                          <button onClick={() => saveRow(row)} disabled={saving[row.id]} style={s.saveBtnSm}>{saving[row.id] ? '…' : '✓'}</button>
                          <button onClick={() => cancelEdit(row.id)} style={s.cancelBtnSm}>✕</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 2, fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>₹{(row.material_cost || 0).toLocaleString('en-IN')}</span>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>₹{(row.labour_cost || 0).toLocaleString('en-IN')}</span>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', textAlign: 'right' }}>₹{total.toLocaleString('en-IN')}</span>
                        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>{row.unit || '—'}</span>
                        <div style={{ width: 60, display: 'flex', justifyContent: 'flex-end' }}>
                          <button onClick={() => startEdit(row)} style={s.editBtnSm}>Edit</button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}

              {/* Add new item inline */}
              {addingTo === area && (
                <div style={{ padding: '12px 14px', background: 'rgba(200,150,62,0.04)', borderTop: '1px solid var(--border, #2e3040)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8 }}>
                    <div><Label>Item Name</Label><Inp value={newRow.item_name} onChange={v => setNewRow(p => ({ ...p, item_name: v }))} placeholder="Item name" /></div>
                    <div><Label>Material ₹</Label><Inp type="number" value={newRow.material_cost} onChange={v => setNewRow(p => ({ ...p, material_cost: v }))} placeholder="0" /></div>
                    <div><Label>Labour ₹</Label><Inp type="number" value={newRow.labour_cost} onChange={v => setNewRow(p => ({ ...p, labour_cost: v }))} placeholder="0" /></div>
                    <div><Label>Unit</Label><Inp value={newRow.unit} onChange={v => setNewRow(p => ({ ...p, unit: v }))} placeholder="nos" /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => addNewItem(area)} style={{ padding: '7px 16px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Save</button>
                    <button onClick={() => setAddingTo(null)} style={{ padding: '7px 14px', background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
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
  tableHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'rgba(0,0,0,0.2)', fontSize: 9, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' },
  tableRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border, #2e3040)' },
  editBtnSm: { fontSize: 10, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' },
  saveBtnSm: { fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' },
  cancelBtnSm: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' },
}
