import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const ADMIN_EMAIL = 'mohosin@flent.in'
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
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100, display: 'flex', flexDirection: 'column-reverse', gap: 6, alignItems: 'center', pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ padding: '9px 18px', background: t.type === 'error' ? 'var(--red, #e05252)' : 'var(--green, #3dba7a)', color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid rgba(245,166,35,0.4)', borderRadius: 12, padding: '20px 24px', maxWidth: 340, width: '100%' }}>
        <p style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', margin: '0 0 18px', lineHeight: 1.55 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '8px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '8px', background: 'var(--red, #e05252)', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Delete</button>
        </div>
      </div>
    </div>
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

const TEMPLATE_COLS = 'trade,area,item_name,spec,market_price,flent_price,warranty_months,material_cost,labour_cost,unit'

function downloadTemplate() {
  const sample = [
    TEMPLATE_COLS,
    'electrical,Main DB,MCB Replacement,10kA Type B,350,280,24,280,0,nos',
    'electrical,Main DB,DB Inspection,,0,0,0,0,500,per session',
    'plumbing,Bathroom,Basin Tap Replacement,Chrome 1/2",600,450,12,450,200,nos',
  ].join('\n')
  const blob = new Blob([sample], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'rate_card_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 3h8M5 3V2h2v1M4 3v6h4V3H4z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export default function PublicRateCard() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [toasts, showToast] = useToast()
  const [rows, setRows]           = useState([])
  const [isAdmin, setIsAdmin]     = useState(false)
  const [tab, setTab]             = useState('Material RC')
  const [tradePill, setTradePill] = useState('All')
  const [filter, setFilter]       = useState('')
  const [editing, setEditing]     = useState({})
  const [saving, setSaving]       = useState({})
  const [addingTo, setAddingTo]   = useState(null)
  const [newRow, setNewRow]       = useState({ item_name: '', area: '', spec: '', market_price: '', flent_price: '', warranty_months: '', material_cost: '', labour_cost: '', unit: '' })
  const [loading, setLoading]     = useState(true)
  const [preview, setPreview]     = useState(null)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected]   = useState(new Set())
  const [confirmDelete, setConfirmDelete] = useState(null) // { ids: [], label: string }
  const [deleting, setDeleting]   = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    Promise.all([
      supabase.from('rate_card').select('*').order('trade').order('item_name'),
      supabase.auth.getUser(),
    ]).then(([{ data }, { data: { user } }]) => {
      setRows(data || [])
      setIsAdmin(user?.email === ADMIN_EMAIL)
      setLoading(false)
    })
  }, [])

  // Material RC: rows with material_cost > 0
  // Labour RC: rows with labour_cost > 0
  const tabRows = rows.filter(r =>
    tab === 'Material RC'
      ? parseFloat(r.material_cost) > 0
      : parseFloat(r.labour_cost) > 0
  )
  const pillRows = tradePill === 'All' ? tabRows : tabRows.filter(r => (r.trade || '').toLowerCase() === tradePill.toLowerCase())
  const displayed = filter
    ? pillRows.filter(r => r.item_name?.toLowerCase().includes(filter.toLowerCase()) || r.area?.toLowerCase().includes(filter.toLowerCase()))
    : pillRows

  const displayedIds = displayed.map(r => r.id)
  const allSelected = displayedIds.length > 0 && displayedIds.every(id => selected.has(id))

  // Group by trade
  const grouped = displayed.reduce((acc, row) => {
    const key = (row.trade || 'misc').toLowerCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  function toggleSelect(id) {
    setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(displayedIds))
  }

  function startEdit(row) {
    setEditing(p => ({ ...p, [row.id]: { item_name: row.item_name || '', area: row.area || '', spec: row.spec || '', market_price: String(row.market_price ?? ''), flent_price: String(row.flent_price ?? ''), warranty_months: String(row.warranty_months ?? ''), material_cost: String(row.material_cost ?? ''), labour_cost: String(row.labour_cost ?? ''), unit: row.unit || '' } }))
  }
  function cancelEdit(id) { setEditing(p => { const n = { ...p }; delete n[id]; return n }) }

  async function saveRow(row) {
    const e = editing[row.id]; if (!e) return
    setSaving(p => ({ ...p, [row.id]: true }))
    const patch = { item_name: e.item_name, area: e.area, spec: e.spec, market_price: parseFloat(e.market_price) || 0, flent_price: parseFloat(e.flent_price) || 0, warranty_months: parseInt(e.warranty_months) || 0, material_cost: parseFloat(e.material_cost) || 0, labour_cost: parseFloat(e.labour_cost) || 0, unit: e.unit }
    const prev = { ...row }
    setRows(p => p.map(r => r.id === row.id ? { ...r, ...patch } : r))
    cancelEdit(row.id)
    const { error } = await supabase.from('rate_card').update(patch).eq('id', row.id)
    setSaving(p => { const n = { ...p }; delete n[row.id]; return n })
    if (error) { setRows(p => p.map(r => r.id === row.id ? prev : r)); showToast('Save failed', 'error') }
    else showToast('Item updated')
  }

  async function addItem(trade) {
    if (!newRow.item_name) return
    const insert = {
      trade,
      area: newRow.area || '',
      item_name: newRow.item_name,
      spec: newRow.spec || '',
      market_price: parseFloat(newRow.market_price) || 0,
      flent_price: parseFloat(newRow.flent_price) || 0,
      warranty_months: parseInt(newRow.warranty_months) || 0,
      material_cost: parseFloat(newRow.material_cost) || 0,
      labour_cost: parseFloat(newRow.labour_cost) || 0,
      unit: newRow.unit || '',
    }
    const { data, error } = await supabase.from('rate_card').insert(insert).select().single()
    if (!error && data) {
      setRows(p => [...p, data])
      setNewRow({ item_name: '', area: '', spec: '', market_price: '', flent_price: '', warranty_months: '', material_cost: '', labour_cost: '', unit: '' })
      setAddingTo(null)
      showToast(`Added "${insert.item_name}"`)
    } else {
      showToast('Add failed', 'error')
    }
  }

  async function deleteRows() {
    if (!confirmDelete) return
    const { ids, label } = confirmDelete
    setDeleting(true)
    const prevRows = rows
    setRows(p => p.filter(r => !ids.includes(r.id)))
    setSelected(p => { const n = new Set(p); ids.forEach(id => n.delete(id)); return n })
    setConfirmDelete(null)
    let failed = false
    for (const id of ids) {
      const { error } = await supabase.from('rate_card').delete().eq('id', id)
      if (error) { failed = true; break }
    }
    setDeleting(false)
    if (failed) { setRows(prevRows); showToast('Delete failed', 'error') }
    else showToast(ids.length === 1 ? `Deleted "${label}"` : `Deleted ${ids.length} items`)
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean)
      const header = lines[0].toLowerCase().split(',').map(h => h.trim())
      const required = ['trade', 'item_name', 'material_cost', 'labour_cost']
      if (!required.every(c => header.includes(c))) { alert('CSV missing required columns: ' + required.join(', ')); return }
      const parsed = lines.slice(1).map(line => {
        const vals = line.split(','); const obj = {}
        header.forEach((h, i) => { obj[h] = vals[i]?.trim() || '' })
        return { trade: obj.trade || 'misc', area: obj.area || '', item_name: obj.item_name || '', spec: obj.spec || '', market_price: parseFloat(obj.market_price) || 0, flent_price: parseFloat(obj.flent_price) || 0, warranty_months: parseInt(obj.warranty_months) || 0, material_cost: parseFloat(obj.material_cost) || 0, labour_cost: parseFloat(obj.labour_cost) || 0, unit: obj.unit || '' }
      }).filter(r => r.item_name)
      setPreview(parsed)
    }
    reader.readAsText(file); e.target.value = ''
  }

  async function confirmImport() {
    if (!preview?.length) return
    setImporting(true)
    const { data, error } = await supabase.from('rate_card').insert(preview).select()
    if (!error && data) { setRows(p => [...p, ...data]); setPreview(null); showToast(`Imported ${data.length} items`) }
    else { showToast('Import failed', 'error') }
    setImporting(false)
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
      loading…
    </div>
  )

  const containerStyle = {
    width: '100%', maxWidth: isMobile ? '100%' : 900,
    margin: '0 auto', padding: isMobile ? '14px 16px 60px' : '14px 24px 60px',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>

      <Toasts toasts={toasts} />
      {confirmDelete && (
        <ConfirmDialog
          message={confirmDelete.ids.length === 1
            ? `Delete "${confirmDelete.label}"? This cannot be undone.`
            : `Delete ${confirmDelete.ids.length} selected items? This cannot be undone.`}
          onConfirm={deleteRows}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

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

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        {['Material RC', 'Labour RC'].map(t => (
          <button key={t} onClick={() => { setTab(t); setTradePill('All'); setFilter(''); setAddingTo(null); setSelected(new Set()) }} style={{
            flex: 1, padding: isMobile ? '11px 8px' : '11px 20px',
            fontSize: isMobile ? 11 : 12, fontWeight: 600, cursor: 'pointer',
            background: 'none', border: 'none',
            borderBottom: tab === t ? '2px solid var(--accent, #c8963e)' : '2px solid transparent',
            color: tab === t ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
            fontFamily: 'var(--font-mono, monospace)', transition: 'color 0.15s, border-color 0.15s',
          }}>{t}</button>
        ))}
      </div>

      <div style={containerStyle}>

        {/* Trade pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {TRADES.map(t => (
            <TradePill key={t} label={t} active={tradePill === t} onClick={() => { setTradePill(t); setSelected(new Set()) }} small={isMobile} />
          ))}
        </div>

        {/* Admin toolbar */}
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 14 }}>
            <button onClick={downloadTemplate} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Download Template
            </button>
            <button onClick={() => fileRef.current?.click()} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 6, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V2M3 5l3-3 3 3M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Import from Excel / CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={handleFileSelect} style={{ display: 'none' }} />
            {selected.size > 0 && (
              <button
                onClick={() => setConfirmDelete({ ids: [...selected], label: '' })}
                disabled={deleting}
                style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(224,82,82,0.12)', border: '1px solid rgba(224,82,82,0.4)', borderRadius: 6, color: 'var(--red, #e05252)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginLeft: isMobile ? 0 : 'auto' }}>
                <TrashIcon />
                Delete {selected.size} selected
              </button>
            )}
          </div>
        )}

        {/* Info banner */}
        <div style={{ padding: '8px 12px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.15)', borderRadius: 7, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent, #c8963e)' }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 6v3.5M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5 }}>
            {tab === 'Material RC' ? 'Items where material cost is set. Shown to clients as supply pricing.' : 'Items where labour cost is set. Shown to clients as service pricing.'}
          </span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search item or area…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {/* Import preview modal */}
        {preview && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '85svh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>Import Preview — {preview.length} rows</span>
                <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {isMobile ? preview.map((row, i) => (
                  <div key={i} style={{ padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--border, #2e3040)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                      <div style={{ textAlign: 'right' }}>
                        {row.material_cost > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>Mat: ₹{row.material_cost}</div>}
                        {row.labour_cost > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>Lab: ₹{row.labour_cost}</div>}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: TRADE_META[row.trade?.toLowerCase()]?.color || '#9394a8', fontFamily: 'var(--font-mono, monospace)', marginTop: 3 }}>
                      {row.trade}{row.area ? ` · ${row.area}` : ''}{row.unit ? ` · ${row.unit}` : ''}
                    </div>
                  </div>
                )) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 90px 90px 60px', padding: '8px 16px', background: '#0d0d0d', fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', position: 'sticky', top: 0 }}>
                      <span>Trade</span><span>Area</span><span>Item Name</span><span style={{ textAlign: 'right' }}>Material ₹</span><span style={{ textAlign: 'right' }}>Labour ₹</span><span style={{ textAlign: 'right' }}>Unit</span>
                    </div>
                    {preview.map((row, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 90px 90px 60px', padding: '9px 16px', borderTop: '1px solid var(--border, #2e3040)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', fontSize: 12, color: 'var(--text, #e8e8f0)' }}>
                        <span style={{ color: TRADE_META[row.trade?.toLowerCase()]?.color || '#9394a8', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>{row.trade}</span>
                        <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{row.area || '—'}</span>
                        <span>{row.item_name}</span>
                        <span style={{ textAlign: 'right', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>₹{row.material_cost}</span>
                        <span style={{ textAlign: 'right', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>₹{row.labour_cost}</span>
                        <span style={{ textAlign: 'right', color: 'var(--text-muted, #6b6d82)' }}>{row.unit || '—'}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
              <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border, #2e3040)', display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
                <button onClick={confirmImport} disabled={importing} style={{ padding: '9px 20px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', opacity: importing ? 0.6 : 1 }}>
                  {importing ? 'Importing…' : `Confirm Import (${preview.length} rows)`}
                </button>
                <button onClick={() => setPreview(null)} style={{ padding: '9px 16px', background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
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

        {/* Trade groups */}
        {Object.entries(grouped).map(([trade, items]) => {
          const meta = TRADE_META[trade] || TRADE_META.misc
          const tradeIds = items.map(r => r.id)
          const tradeAllSelected = tradeIds.length > 0 && tradeIds.every(id => selected.has(id))
          return (
            <div key={trade} style={{ marginBottom: 28 }}>

              {/* Trade heading */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {isAdmin && (
                  <input type="checkbox" checked={tradeAllSelected} onChange={() => {
                    setSelected(p => {
                      const n = new Set(p)
                      if (tradeAllSelected) tradeIds.forEach(id => n.delete(id))
                      else tradeIds.forEach(id => n.add(id))
                      return n
                    })
                  }} style={{ accentColor: meta.color, cursor: 'pointer', flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono, monospace)' }}>
                  {trade.charAt(0).toUpperCase() + trade.slice(1)}
                </span>
                <div style={{ flex: 1, height: 1, background: meta.border }} />
                <span style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{items.length}</span>
                {isAdmin && (
                  <button onClick={() => { setAddingTo(trade); setNewRow({ item_name: '', area: '', spec: '', market_price: '', flent_price: '', warranty_months: '', material_cost: '', labour_cost: '', unit: '' }) }}
                    style={{ fontSize: 10, fontWeight: 600, color: meta.color, background: meta.bg, border: `1px dashed ${meta.border}`, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                    + Add
                  </button>
                )}
              </div>

              <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>

                {/* Desktop column header */}
                {!isMobile && tab === 'Material RC' && (
                  <div style={s.colHead}>
                    {isAdmin && <span style={{ width: 22, flexShrink: 0 }}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ accentColor: 'var(--accent, #c8963e)', cursor: 'pointer' }} /></span>}
                    <span style={{ flex: 2 }}>Item Description</span>
                    <span style={{ flex: 1 }}>Spec</span>
                    <span style={{ width: 110, textAlign: 'right' }}>Market ₹</span>
                    <span style={{ width: 110, textAlign: 'right' }}>Flent ₹</span>
                    <span style={{ width: 80, textAlign: 'right' }}>Warranty</span>
                    <span style={{ width: 60, textAlign: 'right' }}>Unit</span>
                    {isAdmin && <span style={{ width: 60 }} />}
                  </div>
                )}
                {!isMobile && tab === 'Labour RC' && (
                  <div style={s.colHead}>
                    {isAdmin && <span style={{ width: 22, flexShrink: 0 }}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ accentColor: 'var(--accent, #c8963e)', cursor: 'pointer' }} /></span>}
                    <span style={{ flex: 2 }}>Work Type</span>
                    <span style={{ flex: 1 }}>Area</span>
                    <span style={{ width: 130, textAlign: 'right' }}>₹ Cost / Unit</span>
                    {isAdmin && <span style={{ width: 60 }} />}
                  </div>
                )}

                {items.map((row, ri) => {
                  const isEdit = !!editing[row.id]
                  const e = editing[row.id] || {}
                  const cost = tab === 'Material RC' ? parseFloat(row.material_cost) || 0 : parseFloat(row.labour_cost) || 0
                  const isSel = selected.has(row.id)

                  if (isMobile) {
                    return (
                      <div key={row.id} style={{ padding: '12px 14px', borderTop: ri > 0 ? '1px solid var(--border, #2e3040)' : 'none', background: isSel ? 'rgba(200,150,62,0.06)' : ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        {isEdit ? (
                          <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                              <div style={{ gridColumn: '1/-1' }}><span style={s.label}>Item Name</span><input value={e.item_name} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], item_name: ev.target.value } }))} style={s.editInput} /></div>
                              {tab === 'Material RC' && <>
                                <div><span style={s.label}>Spec</span><input value={e.spec} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], spec: ev.target.value } }))} style={s.editInput} /></div>
                                <div><span style={s.label}>Unit</span><input value={e.unit} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], unit: ev.target.value } }))} style={s.editInput} /></div>
                                <div><span style={s.label}>Market ₹</span><input type="number" value={e.market_price} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], market_price: ev.target.value } }))} style={s.editInput} /></div>
                                <div><span style={s.label}>Flent ₹</span><input type="number" value={e.flent_price} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], flent_price: ev.target.value } }))} style={s.editInput} /></div>
                                <div><span style={s.label}>Warranty (mo)</span><input type="number" value={e.warranty_months} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], warranty_months: ev.target.value } }))} style={s.editInput} /></div>
                                <div><span style={s.label}>Material ₹</span><input type="number" value={e.material_cost} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], material_cost: ev.target.value } }))} style={s.editInput} /></div>
                              </>}
                              {tab === 'Labour RC' && <>
                                <div><span style={s.label}>Area</span><input value={e.area} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], area: ev.target.value } }))} style={s.editInput} /></div>
                                <div><span style={s.label}>Labour ₹</span><input type="number" value={e.labour_cost} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], labour_cost: ev.target.value } }))} style={s.editInput} /></div>
                                <div><span style={s.label}>Unit</span><input value={e.unit} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], unit: ev.target.value } }))} style={s.editInput} /></div>
                              </>}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => saveRow(row)} disabled={saving[row.id]} style={{ flex: 1, padding: '7px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving[row.id] ? '…' : '✓ Save'}</button>
                              <button onClick={() => cancelEdit(row.id)} style={{ flex: 1, padding: '7px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                            </div>
                          </div>
                        ) : tab === 'Material RC' ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            {isAdmin && <input type="checkbox" checked={isSel} onChange={() => toggleSelect(row.id)} style={{ accentColor: meta.color, cursor: 'pointer', marginRight: 8, marginTop: 2, flexShrink: 0 }} />}
                            <div style={{ flex: 1, paddingRight: 10 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', marginBottom: 2 }}>{row.item_name}</div>
                              {row.spec && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 2 }}>{row.spec}</div>}
                              {row.warranty_months > 0 && <div style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{row.warranty_months}mo warranty</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <div style={{ textAlign: 'right' }}>
                                {parseFloat(row.flent_price) > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>₹{parseFloat(row.flent_price).toLocaleString('en-IN')}</div>}
                                {parseFloat(row.market_price) > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textDecoration: 'line-through' }}>₹{parseFloat(row.market_price).toLocaleString('en-IN')}</div>}
                                {row.unit && <div style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{row.unit}</div>}
                              </div>
                              {isAdmin && <button onClick={() => startEdit(row)} style={s.editBtn}><EditIcon /></button>}
                              {isAdmin && <button onClick={() => setConfirmDelete({ ids: [row.id], label: row.item_name })} style={s.deleteBtn}><TrashIcon /></button>}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            {isAdmin && <input type="checkbox" checked={isSel} onChange={() => toggleSelect(row.id)} style={{ accentColor: meta.color, cursor: 'pointer', marginRight: 8, marginTop: 2, flexShrink: 0 }} />}
                            <div style={{ flex: 1, paddingRight: 10 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', marginBottom: 3 }}>{row.item_name}</div>
                              {row.area && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{row.area}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>₹{cost.toLocaleString('en-IN')}</div>
                                {row.unit && <div style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>per {row.unit}</div>}
                              </div>
                              {isAdmin && <button onClick={() => startEdit(row)} style={s.editBtn}><EditIcon /></button>}
                              {isAdmin && <button onClick={() => setConfirmDelete({ ids: [row.id], label: row.item_name })} style={s.deleteBtn}><TrashIcon /></button>}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  }

                  // Desktop row
                  if (tab === 'Material RC') {
                    return (
                      <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderTop: '1px solid var(--border, #2e3040)', minHeight: 44, background: isSel ? 'rgba(200,150,62,0.06)' : ri % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }}>
                        {isAdmin && <input type="checkbox" checked={isSel} onChange={() => toggleSelect(row.id)} style={{ accentColor: meta.color, cursor: 'pointer', flexShrink: 0, width: 22 }} />}
                        {isEdit ? (
                          <>
                            <input value={e.item_name} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], item_name: ev.target.value } }))} style={{ ...s.editInput, flex: 2 }} placeholder="Item name" />
                            <input value={e.spec} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], spec: ev.target.value } }))} style={{ ...s.editInput, flex: 1 }} placeholder="Spec" />
                            <input type="number" value={e.market_price} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], market_price: ev.target.value } }))} style={{ ...s.editInput, width: 80, flexShrink: 0 }} placeholder="Market ₹" />
                            <input type="number" value={e.flent_price} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], flent_price: ev.target.value } }))} style={{ ...s.editInput, width: 80, flexShrink: 0 }} placeholder="Flent ₹" />
                            <input type="number" value={e.warranty_months} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], warranty_months: ev.target.value } }))} style={{ ...s.editInput, width: 60, flexShrink: 0 }} placeholder="Mo" />
                            <input value={e.unit} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], unit: ev.target.value } }))} style={{ ...s.editInput, width: 50, flexShrink: 0 }} placeholder="unit" />
                            <div style={{ width: 60, flexShrink: 0, display: 'flex', gap: 4 }}>
                              <button onClick={() => saveRow(row)} disabled={saving[row.id]} style={s.saveBtn}>{saving[row.id] ? '…' : '✓'}</button>
                              <button onClick={() => cancelEdit(row.id)} style={s.cancelBtn}>✕</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span style={{ flex: 2, fontSize: 13, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                            <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{row.spec || '—'}</span>
                            <span style={{ width: 110, flexShrink: 0, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', textDecoration: parseFloat(row.market_price) > 0 ? 'line-through' : 'none' }}>
                              {parseFloat(row.market_price) > 0 ? `₹${parseFloat(row.market_price).toLocaleString('en-IN')}` : '—'}
                            </span>
                            <span style={{ width: 110, flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--text, #e8e8f0)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                              {parseFloat(row.flent_price) > 0 ? `₹${parseFloat(row.flent_price).toLocaleString('en-IN')}` : '—'}
                            </span>
                            <span style={{ width: 80, flexShrink: 0, fontSize: 11, color: row.warranty_months > 0 ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                              {row.warranty_months > 0 ? `${row.warranty_months}mo` : '—'}
                            </span>
                            <span style={{ width: 60, flexShrink: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>{row.unit || '—'}</span>
                            {isAdmin && (
                              <div style={{ width: 60, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                <button onClick={() => startEdit(row)} style={s.editBtn}><EditIcon /></button>
                                <button onClick={() => setConfirmDelete({ ids: [row.id], label: row.item_name })} style={s.deleteBtn}><TrashIcon /></button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderTop: '1px solid var(--border, #2e3040)', minHeight: 44, background: isSel ? 'rgba(200,150,62,0.06)' : ri % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }}>
                      {isAdmin && <input type="checkbox" checked={isSel} onChange={() => toggleSelect(row.id)} style={{ accentColor: meta.color, cursor: 'pointer', flexShrink: 0, width: 22 }} />}
                      {isEdit ? (
                        <>
                          <input value={e.item_name} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], item_name: ev.target.value } }))} style={{ ...s.editInput, flex: 2 }} />
                          <input value={e.area} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], area: ev.target.value } }))} style={{ ...s.editInput, flex: 1 }} />
                          <input type="number" value={e.labour_cost} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], labour_cost: ev.target.value } }))} style={{ ...s.editInput, width: 90, flexShrink: 0 }} placeholder="₹" />
                          <input value={e.unit} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], unit: ev.target.value } }))} style={{ ...s.editInput, width: 70, flexShrink: 0 }} placeholder="unit" />
                          <div style={{ width: 60, flexShrink: 0, display: 'flex', gap: 4 }}>
                            <button onClick={() => saveRow(row)} disabled={saving[row.id]} style={s.saveBtn}>{saving[row.id] ? '…' : '✓'}</button>
                            <button onClick={() => cancelEdit(row.id)} style={s.cancelBtn}>✕</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 2, fontSize: 13, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                          <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{row.area || '—'}</span>
                          <span style={{ width: 130, flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--text, #e8e8f0)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                            ₹{cost.toLocaleString('en-IN')}{row.unit ? ` / ${row.unit}` : ''}
                          </span>
                          {isAdmin && (
                            <div style={{ width: 60, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                              <button onClick={() => startEdit(row)} style={s.editBtn}><EditIcon /></button>
                              <button onClick={() => setConfirmDelete({ ids: [row.id], label: row.item_name })} style={s.deleteBtn}><TrashIcon /></button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}

                {/* Add new row form */}
                {isAdmin && addingTo === trade && (
                  <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border, #2e3040)', background: 'rgba(200,150,62,0.04)' }}>
                    {tab === 'Material RC' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <input value={newRow.item_name} onChange={e => setNewRow(p => ({ ...p, item_name: e.target.value }))} placeholder="Item name" style={s.editInput} />
                        <input value={newRow.spec} onChange={e => setNewRow(p => ({ ...p, spec: e.target.value }))} placeholder="Spec" style={s.editInput} />
                        <input type="number" value={newRow.market_price} onChange={e => setNewRow(p => ({ ...p, market_price: e.target.value }))} placeholder="Market ₹" style={s.editInput} />
                        <input type="number" value={newRow.flent_price} onChange={e => setNewRow(p => ({ ...p, flent_price: e.target.value }))} placeholder="Flent ₹" style={s.editInput} />
                        <input type="number" value={newRow.warranty_months} onChange={e => setNewRow(p => ({ ...p, warranty_months: e.target.value }))} placeholder="Warranty mo" style={s.editInput} />
                        <input value={newRow.unit} onChange={e => setNewRow(p => ({ ...p, unit: e.target.value }))} placeholder="Unit" style={s.editInput} />
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <input value={newRow.item_name} onChange={e => setNewRow(p => ({ ...p, item_name: e.target.value }))} placeholder="Work type" style={s.editInput} />
                        <input value={newRow.area} onChange={e => setNewRow(p => ({ ...p, area: e.target.value }))} placeholder="Area" style={s.editInput} />
                        <input type="number" value={newRow.labour_cost} onChange={e => setNewRow(p => ({ ...p, labour_cost: e.target.value }))} placeholder="Cost ₹" style={s.editInput} />
                        <input value={newRow.unit} onChange={e => setNewRow(p => ({ ...p, unit: e.target.value }))} placeholder="Unit" style={s.editInput} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => addItem(trade)} style={{ flex: 1, padding: '6px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                      <button onClick={() => setAddingTo(null)} style={{ flex: 1, padding: '6px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {displayed.length > 0 && (
          <p style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textAlign: 'right', marginTop: -16 }}>
            {displayed.length} item{displayed.length !== 1 ? 's' : ''}{selected.size > 0 ? ` · ${selected.size} selected` : ''}
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
  colHead: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#0d0d0d', fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' },
  editBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border, #2e3040)', borderRadius: 5, background: 'var(--bg-input, #252731)', color: 'var(--accent, #c8963e)', cursor: 'pointer' },
  deleteBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(224,82,82,0.35)', borderRadius: 5, background: 'rgba(224,82,82,0.08)', color: 'var(--red, #e05252)', cursor: 'pointer' },
  saveBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 5, background: 'var(--green, #3dba7a)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  cancelBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border, #2e3040)', borderRadius: 5, background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  editInput: { width: '100%', padding: '5px 8px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 4, outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box' },
  label: { fontSize: 10, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 3 },
}
