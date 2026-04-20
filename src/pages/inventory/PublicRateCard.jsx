import { useState, useEffect, useRef } from 'react'
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

// Labour RC CSV template (rate_card table)
function downloadLabourTemplate() {
  const sample = [
    'trade,area,item_name,labour_cost,unit',
    'electrical,Main DB,DB Inspection,,500,per session',
    'plumbing,Bathroom,Tap Replacement,200,nos',
  ].join('\n')
  const blob = new Blob([sample], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'labour_rc_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

// Material RC CSV template (inventory_items table)
function downloadMatTemplate() {
  const sample = [
    'item_name,trade,spec,market_price,flent_price,warranty_months',
    'MCB 10A,electrical,10kA Type B Single Pole,350,280,24',
    'Basin Tap,plumbing,Chrome 1/2" Quarter Turn,600,450,12',
  ].join('\n')
  const blob = new Blob([sample], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'material_rc_template.csv'; a.click()
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

  // Shared state
  const [isAdmin, setIsAdmin]     = useState(false)
  const [tab, setTab]             = useState('Material RC')
  const [tradePill, setTradePill] = useState('All')
  const [filter, setFilter]       = useState('')
  const [loading, setLoading]     = useState(true)

  // ── Material RC state (inventory_items) ──────────────────────────────────
  const [invItems, setInvItems]       = useState([])
  const [editingInv, setEditingInv]   = useState({})
  const [savingInv, setSavingInv]     = useState({})
  const [addingToMat, setAddingToMat] = useState(null)
  const [newInvRow, setNewInvRow]     = useState({ item_name: '', spec: '', market_price: '', flent_price: '', warranty_months: '' })
  const [invSelected, setInvSelected] = useState(new Set())
  const [confirmDeleteInv, setConfirmDeleteInv] = useState(null)
  const [deletingInv, setDeletingInv] = useState(false)
  const [matPreview, setMatPreview]   = useState(null)
  const [matImporting, setMatImporting] = useState(false)
  const matFileRef = useRef()

  // ── Labour RC state (rate_card) ──────────────────────────────────────────
  const [rows, setRows]           = useState([])
  const [editing, setEditing]     = useState({})
  const [saving, setSaving]       = useState({})
  const [addingTo, setAddingTo]   = useState(null)
  const [newRow, setNewRow]       = useState({ item_name: '', area: '', labour_cost: '', unit: '' })
  const [labSelected, setLabSelected] = useState(new Set())
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting]   = useState(false)
  const [preview, setPreview]     = useState(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    Promise.all([
      supabase.from('rate_card').select('*').order('trade').order('item_name'),
      supabase.from('inventory_items').select('*').order('item_name'),
      supabase.auth.getUser(),
    ]).then(([{ data: rcData }, { data: invData }, { data: { user } }]) => {
      setRows(rcData || [])
      setInvItems(invData || [])
      setIsAdmin(user?.email === ADMIN_EMAIL)
      setLoading(false)
    })
  }, [])

  // ── Material RC derived ──────────────────────────────────────────────────
  const matPillItems = tradePill === 'All'
    ? invItems
    : invItems.filter(item => (item.trade || '').toLowerCase() === tradePill.toLowerCase())
  const matDisplayed = filter
    ? matPillItems.filter(item => item.item_name?.toLowerCase().includes(filter.toLowerCase()) || item.spec?.toLowerCase().includes(filter.toLowerCase()))
    : matPillItems
  const matDisplayedIds = matDisplayed.map(r => r.id)
  const matAllSelected = matDisplayedIds.length > 0 && matDisplayedIds.every(id => invSelected.has(id))
  const matGrouped = matDisplayed.reduce((acc, item) => {
    const key = (item.trade || 'misc').toLowerCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  // ── Labour RC derived ────────────────────────────────────────────────────
  const labRows = rows.filter(r => parseFloat(r.labour_cost) > 0)
  const labPillRows = tradePill === 'All' ? labRows : labRows.filter(r => (r.trade || '').toLowerCase() === tradePill.toLowerCase())
  const labDisplayed = filter
    ? labPillRows.filter(r => r.item_name?.toLowerCase().includes(filter.toLowerCase()) || r.area?.toLowerCase().includes(filter.toLowerCase()))
    : labPillRows
  const labDisplayedIds = labDisplayed.map(r => r.id)
  const labAllSelected = labDisplayedIds.length > 0 && labDisplayedIds.every(id => labSelected.has(id))
  const labGrouped = labDisplayed.reduce((acc, row) => {
    const key = (row.trade || 'misc').toLowerCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  // ── Material RC functions ────────────────────────────────────────────────
  function toggleInvSelect(id) {
    setInvSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleInvSelectAll() {
    if (matAllSelected) setInvSelected(new Set())
    else setInvSelected(new Set(matDisplayedIds))
  }

  function startEditInv(item) {
    setEditingInv(p => ({ ...p, [item.id]: {
      spec: item.spec || '',
      market_price: String(item.market_price ?? ''),
      flent_price: String(item.flent_price ?? ''),
      warranty_months: String(item.warranty_months ?? ''),
    }}))
  }
  function cancelEditInv(id) { setEditingInv(p => { const n = { ...p }; delete n[id]; return n }) }

  async function saveInvRow(item) {
    const e = editingInv[item.id]; if (!e) return
    setSavingInv(p => ({ ...p, [item.id]: true }))
    const patch = {
      spec: e.spec,
      market_price: parseFloat(e.market_price) || 0,
      flent_price: parseFloat(e.flent_price) || 0,
      warranty_months: parseInt(e.warranty_months) || 0,
    }
    const prev = { ...item }
    setInvItems(p => p.map(r => r.id === item.id ? { ...r, ...patch } : r))
    cancelEditInv(item.id)
    const { error } = await supabase.from('inventory_items').update(patch).eq('id', item.id)
    setSavingInv(p => { const n = { ...p }; delete n[item.id]; return n })
    if (error) { setInvItems(p => p.map(r => r.id === item.id ? prev : r)); showToast('Save failed', 'error') }
    else showToast('Item updated')
  }

  async function addInvItem(trade) {
    if (!newInvRow.item_name) return
    const insert = {
      trade,
      item_name: newInvRow.item_name,
      spec: newInvRow.spec || '',
      market_price: parseFloat(newInvRow.market_price) || 0,
      flent_price: parseFloat(newInvRow.flent_price) || 0,
      warranty_months: parseInt(newInvRow.warranty_months) || 0,
    }
    const { data, error } = await supabase.from('inventory_items').insert(insert).select().single()
    if (!error && data) {
      setInvItems(p => [...p, data].sort((a, b) => (a.item_name || '').localeCompare(b.item_name || '')))
      setNewInvRow({ item_name: '', spec: '', market_price: '', flent_price: '', warranty_months: '' })
      setAddingToMat(null)
      showToast(`Added "${insert.item_name}"`)
    } else {
      showToast('Add failed', 'error')
    }
  }

  async function deleteInvRows() {
    if (!confirmDeleteInv) return
    const { ids, label } = confirmDeleteInv
    setDeletingInv(true)
    const prevItems = invItems
    setInvItems(p => p.filter(r => !ids.includes(r.id)))
    setInvSelected(p => { const n = new Set(p); ids.forEach(id => n.delete(id)); return n })
    setConfirmDeleteInv(null)
    let failed = false
    for (const id of ids) {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id)
      if (error) { failed = true; break }
    }
    setDeletingInv(false)
    if (failed) { setInvItems(prevItems); showToast('Delete failed', 'error') }
    else showToast(ids.length === 1 ? `Deleted "${label}"` : `Deleted ${ids.length} items`)
  }

  function handleMatFileSelect(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean)
      const header = lines[0].toLowerCase().split(',').map(h => h.trim())
      if (!header.includes('item_name') || !header.includes('trade')) {
        alert('CSV missing required columns: item_name, trade'); return
      }
      const parsed = lines.slice(1).map(line => {
        const vals = line.split(','); const obj = {}
        header.forEach((h, i) => { obj[h] = vals[i]?.trim() || '' })
        return {
          item_name: obj.item_name || '',
          trade: obj.trade || 'misc',
          spec: obj.spec || '',
          market_price: parseFloat(obj.market_price) || 0,
          flent_price: parseFloat(obj.flent_price) || 0,
          warranty_months: parseInt(obj.warranty_months) || 0,
        }
      }).filter(r => r.item_name)
      setMatPreview(parsed)
    }
    reader.readAsText(file); e.target.value = ''
  }

  async function confirmMatImport() {
    if (!matPreview?.length) return
    setMatImporting(true)
    const { data, error } = await supabase.from('inventory_items').insert(matPreview).select()
    if (!error && data) {
      setInvItems(p => [...p, ...data].sort((a, b) => (a.item_name || '').localeCompare(b.item_name || '')))
      setMatPreview(null)
      showToast(`Imported ${data.length} items`)
    } else {
      showToast('Import failed', 'error')
    }
    setMatImporting(false)
  }

  // ── Labour RC functions ──────────────────────────────────────────────────
  function toggleLabSelect(id) {
    setLabSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleLabSelectAll() {
    if (labAllSelected) setLabSelected(new Set())
    else setLabSelected(new Set(labDisplayedIds))
  }

  function startEdit(row) {
    setEditing(p => ({ ...p, [row.id]: { item_name: row.item_name || '', area: row.area || '', labour_cost: String(row.labour_cost ?? ''), unit: row.unit || '' } }))
  }
  function cancelEdit(id) { setEditing(p => { const n = { ...p }; delete n[id]; return n }) }

  async function saveRow(row) {
    const e = editing[row.id]; if (!e) return
    setSaving(p => ({ ...p, [row.id]: true }))
    const patch = { item_name: e.item_name, area: e.area, labour_cost: parseFloat(e.labour_cost) || 0, unit: e.unit }
    const prev = { ...row }
    setRows(p => p.map(r => r.id === row.id ? { ...r, ...patch } : r))
    cancelEdit(row.id)
    const { error } = await supabase.from('rate_card').update(patch).eq('id', row.id)
    setSaving(p => { const n = { ...p }; delete n[row.id]; return n })
    if (error) { setRows(p => p.map(r => r.id === row.id ? prev : r)); showToast('Save failed', 'error') }
    else showToast('Item updated')
  }

  async function addLabItem(trade) {
    if (!newRow.item_name) return
    const insert = { trade, area: newRow.area || '', item_name: newRow.item_name, labour_cost: parseFloat(newRow.labour_cost) || 0, unit: newRow.unit || '' }
    const { data, error } = await supabase.from('rate_card').insert(insert).select().single()
    if (!error && data) {
      setRows(p => [...p, data])
      setNewRow({ item_name: '', area: '', labour_cost: '', unit: '' })
      setAddingTo(null)
      showToast(`Added "${insert.item_name}"`)
    } else {
      showToast('Add failed', 'error')
    }
  }

  async function deleteLabRows() {
    if (!confirmDelete) return
    const { ids, label } = confirmDelete
    setDeleting(true)
    const prevRows = rows
    setRows(p => p.filter(r => !ids.includes(r.id)))
    setLabSelected(p => { const n = new Set(p); ids.forEach(id => n.delete(id)); return n })
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

  function handleLabFileSelect(e) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean)
      const header = lines[0].toLowerCase().split(',').map(h => h.trim())
      if (!header.includes('trade') || !header.includes('item_name')) { alert('CSV missing required columns: trade, item_name'); return }
      const parsed = lines.slice(1).map(line => {
        const vals = line.split(','); const obj = {}
        header.forEach((h, i) => { obj[h] = vals[i]?.trim() || '' })
        return { trade: obj.trade || 'misc', area: obj.area || '', item_name: obj.item_name || '', labour_cost: parseFloat(obj.labour_cost) || 0, unit: obj.unit || '' }
      }).filter(r => r.item_name)
      setPreview(parsed)
    }
    reader.readAsText(file); e.target.value = ''
  }

  async function confirmLabImport() {
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

      {/* Confirm delete dialogs */}
      {confirmDeleteInv && (
        <ConfirmDialog
          message={confirmDeleteInv.ids.length === 1
            ? `Delete "${confirmDeleteInv.label}"? This cannot be undone.`
            : `Delete ${confirmDeleteInv.ids.length} selected items? This cannot be undone.`}
          onConfirm={deleteInvRows}
          onCancel={() => setConfirmDeleteInv(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          message={confirmDelete.ids.length === 1
            ? `Delete "${confirmDelete.label}"? This cannot be undone.`
            : `Delete ${confirmDelete.ids.length} selected items? This cannot be undone.`}
          onConfirm={deleteLabRows}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

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

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        {['Material RC', 'Labour RC'].map(t => (
          <button key={t} onClick={() => {
            setTab(t); setTradePill('All'); setFilter('')
            setAddingTo(null); setAddingToMat(null)
            setLabSelected(new Set()); setInvSelected(new Set())
          }} style={{
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
            <TradePill key={t} label={t} active={tradePill === t} onClick={() => {
              setTradePill(t); setLabSelected(new Set()); setInvSelected(new Set())
            }} small={isMobile} />
          ))}
        </div>

        {/* ── MATERIAL RC ─────────────────────────────────────────────────── */}
        {tab === 'Material RC' && (
          <>
            {/* Admin toolbar */}
            {isAdmin && (
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 14 }}>
                <button onClick={downloadMatTemplate} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Download Template
                </button>
                <button onClick={() => matFileRef.current?.click()} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 6, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V2M3 5l3-3 3 3M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Import CSV
                </button>
                <input ref={matFileRef} type="file" accept=".csv" onChange={handleMatFileSelect} style={{ display: 'none' }} />
                {invSelected.size > 0 && (
                  <button
                    onClick={() => setConfirmDeleteInv({ ids: [...invSelected], label: '' })}
                    disabled={deletingInv}
                    style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(224,82,82,0.12)', border: '1px solid rgba(224,82,82,0.4)', borderRadius: 6, color: 'var(--red, #e05252)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginLeft: isMobile ? 0 : 'auto' }}>
                    <TrashIcon />
                    Delete {invSelected.size} selected
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
                Material pricing shown to clients. Market price is for reference. Flent price is what the client is charged.
              </span>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search item or spec…"
                style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            {/* Material import preview modal */}
            {matPreview && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '85svh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>Import Preview — {matPreview.length} rows</span>
                    <button onClick={() => setMatPreview(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {isMobile ? matPreview.map((row, i) => (
                      <div key={i} style={{ padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--border, #2e3040)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                          <div style={{ textAlign: 'right' }}>
                            {row.flent_price > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>Flent: ₹{row.flent_price}</div>}
                            {row.market_price > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textDecoration: 'line-through' }}>₹{row.market_price}</div>}
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: TRADE_META[row.trade?.toLowerCase()]?.color || '#9394a8', fontFamily: 'var(--font-mono, monospace)', marginTop: 3 }}>
                          {row.trade}{row.spec ? ` · ${row.spec}` : ''}
                        </div>
                      </div>
                    )) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 90px 90px', padding: '8px 16px', background: '#0d0d0d', fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', position: 'sticky', top: 0 }}>
                          <span>Trade</span><span>Item Name</span><span>Spec</span><span style={{ textAlign: 'right' }}>Market ₹</span><span style={{ textAlign: 'right' }}>Flent ₹</span>
                        </div>
                        {matPreview.map((row, i) => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 90px 90px', padding: '9px 16px', borderTop: '1px solid var(--border, #2e3040)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', fontSize: 12, color: 'var(--text, #e8e8f0)' }}>
                            <span style={{ color: TRADE_META[row.trade?.toLowerCase()]?.color || '#9394a8', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>{row.trade}</span>
                            <span>{row.item_name}</span>
                            <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{row.spec || '—'}</span>
                            <span style={{ textAlign: 'right', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>₹{row.market_price}</span>
                            <span style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>₹{row.flent_price}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border, #2e3040)', display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
                    <button onClick={confirmMatImport} disabled={matImporting} style={{ padding: '9px 20px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: matImporting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', opacity: matImporting ? 0.6 : 1 }}>
                      {matImporting ? 'Importing…' : `Confirm Import (${matPreview.length} rows)`}
                    </button>
                    <button onClick={() => setMatPreview(null)} style={{ padding: '9px 16px', background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* No data */}
            {Object.keys(matGrouped).length === 0 && (
              <div style={{ border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                No items in this category.
              </div>
            )}

            {/* Material trade groups */}
            {Object.entries(matGrouped).map(([trade, items]) => {
              const meta = TRADE_META[trade] || TRADE_META.misc
              const tradeIds = items.map(r => r.id)
              const tradeAllSelected = tradeIds.length > 0 && tradeIds.every(id => invSelected.has(id))
              return (
                <div key={trade} style={{ marginBottom: 28 }}>
                  {/* Trade heading */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {isAdmin && (
                      <input type="checkbox" checked={tradeAllSelected} onChange={() => {
                        setInvSelected(p => {
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
                      <button onClick={() => { setAddingToMat(trade); setNewInvRow({ item_name: '', spec: '', market_price: '', flent_price: '', warranty_months: '' }) }}
                        style={{ fontSize: 10, fontWeight: 600, color: meta.color, background: meta.bg, border: `1px dashed ${meta.border}`, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                        + Add
                      </button>
                    )}
                  </div>

                  <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>
                    {/* Desktop column header */}
                    {!isMobile && (
                      <div style={s.colHead}>
                        {isAdmin && <span style={{ width: 22, flexShrink: 0 }}><input type="checkbox" checked={matAllSelected} onChange={toggleInvSelectAll} style={{ accentColor: 'var(--accent, #c8963e)', cursor: 'pointer' }} /></span>}
                        <span style={{ flex: 2 }}>Item Description</span>
                        <span style={{ flex: 1 }}>Spec</span>
                        <span style={{ width: 90, textAlign: 'right' }}>Warranty</span>
                        <span style={{ width: 110, textAlign: 'right' }}>Market ₹</span>
                        <span style={{ width: 110, textAlign: 'right' }}>Flent ₹</span>
                        {isAdmin && <span style={{ width: 60 }} />}
                      </div>
                    )}

                    {items.map((item, ri) => {
                      const isEdit = !!editingInv[item.id]
                      const e = editingInv[item.id] || {}
                      const isSel = invSelected.has(item.id)

                      if (isMobile) {
                        return (
                          <div key={item.id} style={{ padding: '12px 14px', borderTop: ri > 0 ? '1px solid var(--border, #2e3040)' : 'none', background: isSel ? 'rgba(200,150,62,0.06)' : ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                            {isEdit ? (
                              <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                  <div style={{ gridColumn: '1/-1' }}><span style={s.label}>Spec</span><input value={e.spec} onChange={ev => setEditingInv(p => ({ ...p, [item.id]: { ...p[item.id], spec: ev.target.value } }))} style={s.editInput} /></div>
                                  <div><span style={s.label}>Warranty (mo)</span><input type="number" value={e.warranty_months} onChange={ev => setEditingInv(p => ({ ...p, [item.id]: { ...p[item.id], warranty_months: ev.target.value } }))} style={s.editInput} /></div>
                                  <div><span style={s.label}>Market ₹</span><input type="number" value={e.market_price} onChange={ev => setEditingInv(p => ({ ...p, [item.id]: { ...p[item.id], market_price: ev.target.value } }))} style={s.editInput} /></div>
                                  <div><span style={s.label}>Flent ₹</span><input type="number" value={e.flent_price} onChange={ev => setEditingInv(p => ({ ...p, [item.id]: { ...p[item.id], flent_price: ev.target.value } }))} style={s.editInput} /></div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button onClick={() => saveInvRow(item)} disabled={savingInv[item.id]} style={{ flex: 1, padding: '7px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{savingInv[item.id] ? '…' : '✓ Save'}</button>
                                  <button onClick={() => cancelEditInv(item.id)} style={{ flex: 1, padding: '7px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                {isAdmin && <input type="checkbox" checked={isSel} onChange={() => toggleInvSelect(item.id)} style={{ accentColor: meta.color, cursor: 'pointer', marginRight: 8, marginTop: 2, flexShrink: 0 }} />}
                                <div style={{ flex: 1, paddingRight: 10 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', marginBottom: 2 }}>{item.item_name}</div>
                                  {item.spec && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 2 }}>{item.spec}</div>}
                                  {item.warranty_months > 0 && <div style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{item.warranty_months}mo warranty</div>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                  <div style={{ textAlign: 'right' }}>
                                    {parseFloat(item.flent_price) > 0 && <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>₹{parseFloat(item.flent_price).toLocaleString('en-IN')}</div>}
                                    {parseFloat(item.market_price) > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textDecoration: 'line-through' }}>₹{parseFloat(item.market_price).toLocaleString('en-IN')}</div>}
                                  </div>
                                  {isAdmin && <button onClick={() => startEditInv(item)} style={s.editBtn}><EditIcon /></button>}
                                  {isAdmin && <button onClick={() => setConfirmDeleteInv({ ids: [item.id], label: item.item_name })} style={s.deleteBtn}><TrashIcon /></button>}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      }

                      // Desktop row
                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderTop: '1px solid var(--border, #2e3040)', minHeight: 44, background: isSel ? 'rgba(200,150,62,0.06)' : ri % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }}>
                          {isAdmin && <input type="checkbox" checked={isSel} onChange={() => toggleInvSelect(item.id)} style={{ accentColor: meta.color, cursor: 'pointer', flexShrink: 0, width: 22 }} />}
                          {isEdit ? (
                            <>
                              <span style={{ flex: 2, fontSize: 13, color: 'var(--text, #e8e8f0)' }}>{item.item_name}</span>
                              <input value={e.spec} onChange={ev => setEditingInv(p => ({ ...p, [item.id]: { ...p[item.id], spec: ev.target.value } }))} style={{ ...s.editInput, flex: 1 }} placeholder="Spec" />
                              <input type="number" value={e.warranty_months} onChange={ev => setEditingInv(p => ({ ...p, [item.id]: { ...p[item.id], warranty_months: ev.target.value } }))} style={{ ...s.editInput, width: 70, flexShrink: 0 }} placeholder="Mo" />
                              <input type="number" value={e.market_price} onChange={ev => setEditingInv(p => ({ ...p, [item.id]: { ...p[item.id], market_price: ev.target.value } }))} style={{ ...s.editInput, width: 90, flexShrink: 0 }} placeholder="Market ₹" />
                              <input type="number" value={e.flent_price} onChange={ev => setEditingInv(p => ({ ...p, [item.id]: { ...p[item.id], flent_price: ev.target.value } }))} style={{ ...s.editInput, width: 90, flexShrink: 0 }} placeholder="Flent ₹" />
                              <div style={{ width: 60, flexShrink: 0, display: 'flex', gap: 4 }}>
                                <button onClick={() => saveInvRow(item)} disabled={savingInv[item.id]} style={s.saveBtn}>{savingInv[item.id] ? '…' : '✓'}</button>
                                <button onClick={() => cancelEditInv(item.id)} style={s.cancelBtn}>✕</button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span style={{ flex: 2, fontSize: 13, color: 'var(--text, #e8e8f0)' }}>{item.item_name}</span>
                              <span style={{ flex: 1, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{item.spec || '—'}</span>
                              <span style={{ width: 90, flexShrink: 0, fontSize: 11, color: item.warranty_months > 0 ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                                {item.warranty_months > 0 ? `${item.warranty_months}mo` : '—'}
                              </span>
                              <span style={{ width: 110, flexShrink: 0, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', textDecoration: parseFloat(item.market_price) > 0 ? 'line-through' : 'none' }}>
                                {parseFloat(item.market_price) > 0 ? `₹${parseFloat(item.market_price).toLocaleString('en-IN')}` : '—'}
                              </span>
                              <span style={{ width: 110, flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--text, #e8e8f0)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                                {parseFloat(item.flent_price) > 0 ? `₹${parseFloat(item.flent_price).toLocaleString('en-IN')}` : '—'}
                              </span>
                              {isAdmin && (
                                <div style={{ width: 60, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                                  <button onClick={() => startEditInv(item)} style={s.editBtn}><EditIcon /></button>
                                  <button onClick={() => setConfirmDeleteInv({ ids: [item.id], label: item.item_name })} style={s.deleteBtn}><TrashIcon /></button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}

                    {/* Add new item form */}
                    {isAdmin && addingToMat === trade && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border, #2e3040)', background: 'rgba(200,150,62,0.04)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <input value={newInvRow.item_name} onChange={e => setNewInvRow(p => ({ ...p, item_name: e.target.value }))} placeholder="Item name" style={s.editInput} />
                          <input value={newInvRow.spec} onChange={e => setNewInvRow(p => ({ ...p, spec: e.target.value }))} placeholder="Spec" style={s.editInput} />
                          <input type="number" value={newInvRow.market_price} onChange={e => setNewInvRow(p => ({ ...p, market_price: e.target.value }))} placeholder="Market ₹" style={s.editInput} />
                          <input type="number" value={newInvRow.flent_price} onChange={e => setNewInvRow(p => ({ ...p, flent_price: e.target.value }))} placeholder="Flent ₹" style={s.editInput} />
                          <input type="number" value={newInvRow.warranty_months} onChange={e => setNewInvRow(p => ({ ...p, warranty_months: e.target.value }))} placeholder="Warranty mo" style={s.editInput} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => addInvItem(trade)} style={{ flex: 1, padding: '6px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                          <button onClick={() => setAddingToMat(null)} style={{ flex: 1, padding: '6px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {matDisplayed.length > 0 && (
              <p style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textAlign: 'right', marginTop: -16 }}>
                {matDisplayed.length} item{matDisplayed.length !== 1 ? 's' : ''}{invSelected.size > 0 ? ` · ${invSelected.size} selected` : ''}
              </p>
            )}
          </>
        )}

        {/* ── LABOUR RC ────────────────────────────────────────────────────── */}
        {tab === 'Labour RC' && (
          <>
            {/* Admin toolbar */}
            {isAdmin && (
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 14 }}>
                <button onClick={downloadLabourTemplate} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v7M3 5l3 3 3-3M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Download Template
                </button>
                <button onClick={() => fileRef.current?.click()} style={{ padding: '7px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 6, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 9V2M3 5l3-3 3 3M2 10h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Import CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleLabFileSelect} style={{ display: 'none' }} />
                {labSelected.size > 0 && (
                  <button
                    onClick={() => setConfirmDelete({ ids: [...labSelected], label: '' })}
                    disabled={deleting}
                    style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'rgba(224,82,82,0.12)', border: '1px solid rgba(224,82,82,0.4)', borderRadius: 6, color: 'var(--red, #e05252)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginLeft: isMobile ? 0 : 'auto' }}>
                    <TrashIcon />
                    Delete {labSelected.size} selected
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
                Service pricing shown to clients. Labour costs are what the client is charged per visit or unit.
              </span>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search work type or area…"
                style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            {/* Labour import preview modal */}
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
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>₹{row.labour_cost}</div>
                        </div>
                        <div style={{ fontSize: 10, color: TRADE_META[row.trade?.toLowerCase()]?.color || '#9394a8', fontFamily: 'var(--font-mono, monospace)', marginTop: 3 }}>
                          {row.trade}{row.area ? ` · ${row.area}` : ''}{row.unit ? ` · per ${row.unit}` : ''}
                        </div>
                      </div>
                    )) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 100px 70px', padding: '8px 16px', background: '#0d0d0d', fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', position: 'sticky', top: 0 }}>
                          <span>Trade</span><span>Area</span><span>Work Type</span><span style={{ textAlign: 'right' }}>Labour ₹</span><span style={{ textAlign: 'right' }}>Unit</span>
                        </div>
                        {preview.map((row, i) => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 100px 70px', padding: '9px 16px', borderTop: '1px solid var(--border, #2e3040)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', fontSize: 12, color: 'var(--text, #e8e8f0)' }}>
                            <span style={{ color: TRADE_META[row.trade?.toLowerCase()]?.color || '#9394a8', fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }}>{row.trade}</span>
                            <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{row.area || '—'}</span>
                            <span>{row.item_name}</span>
                            <span style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>₹{row.labour_cost}</span>
                            <span style={{ textAlign: 'right', color: 'var(--text-muted, #6b6d82)' }}>{row.unit || '—'}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                  <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border, #2e3040)', display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
                    <button onClick={confirmLabImport} disabled={importing} style={{ padding: '9px 20px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: importing ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', opacity: importing ? 0.6 : 1 }}>
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
            {Object.keys(labGrouped).length === 0 && (
              <div style={{ border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                No items in this category.
              </div>
            )}

            {/* Labour trade groups */}
            {Object.entries(labGrouped).map(([trade, items]) => {
              const meta = TRADE_META[trade] || TRADE_META.misc
              const tradeIds = items.map(r => r.id)
              const tradeAllSelected = tradeIds.length > 0 && tradeIds.every(id => labSelected.has(id))
              return (
                <div key={trade} style={{ marginBottom: 28 }}>
                  {/* Trade heading */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {isAdmin && (
                      <input type="checkbox" checked={tradeAllSelected} onChange={() => {
                        setLabSelected(p => {
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
                      <button onClick={() => { setAddingTo(trade); setNewRow({ item_name: '', area: '', labour_cost: '', unit: '' }) }}
                        style={{ fontSize: 10, fontWeight: 600, color: meta.color, background: meta.bg, border: `1px dashed ${meta.border}`, borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                        + Add
                      </button>
                    )}
                  </div>

                  <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>
                    {/* Desktop column header */}
                    {!isMobile && (
                      <div style={s.colHead}>
                        {isAdmin && <span style={{ width: 22, flexShrink: 0 }}><input type="checkbox" checked={labAllSelected} onChange={toggleLabSelectAll} style={{ accentColor: 'var(--accent, #c8963e)', cursor: 'pointer' }} /></span>}
                        <span style={{ flex: 2 }}>Work Type</span>
                        <span style={{ flex: 1 }}>Area</span>
                        <span style={{ width: 130, textAlign: 'right' }}>₹ Cost / Unit</span>
                        {isAdmin && <span style={{ width: 60 }} />}
                      </div>
                    )}

                    {items.map((row, ri) => {
                      const isEdit = !!editing[row.id]
                      const e = editing[row.id] || {}
                      const cost = parseFloat(row.labour_cost) || 0
                      const isSel = labSelected.has(row.id)

                      if (isMobile) {
                        return (
                          <div key={row.id} style={{ padding: '12px 14px', borderTop: ri > 0 ? '1px solid var(--border, #2e3040)' : 'none', background: isSel ? 'rgba(200,150,62,0.06)' : ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                            {isEdit ? (
                              <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                  <div style={{ gridColumn: '1/-1' }}><span style={s.label}>Work Type</span><input value={e.item_name} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], item_name: ev.target.value } }))} style={s.editInput} /></div>
                                  <div><span style={s.label}>Area</span><input value={e.area} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], area: ev.target.value } }))} style={s.editInput} /></div>
                                  <div><span style={s.label}>Labour ₹</span><input type="number" value={e.labour_cost} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], labour_cost: ev.target.value } }))} style={s.editInput} /></div>
                                  <div><span style={s.label}>Unit</span><input value={e.unit} onChange={ev => setEditing(p => ({ ...p, [row.id]: { ...p[row.id], unit: ev.target.value } }))} style={s.editInput} /></div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button onClick={() => saveRow(row)} disabled={saving[row.id]} style={{ flex: 1, padding: '7px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving[row.id] ? '…' : '✓ Save'}</button>
                                  <button onClick={() => cancelEdit(row.id)} style={{ flex: 1, padding: '7px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                {isAdmin && <input type="checkbox" checked={isSel} onChange={() => toggleLabSelect(row.id)} style={{ accentColor: meta.color, cursor: 'pointer', marginRight: 8, marginTop: 2, flexShrink: 0 }} />}
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
                      return (
                        <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderTop: '1px solid var(--border, #2e3040)', minHeight: 44, background: isSel ? 'rgba(200,150,62,0.06)' : ri % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }}>
                          {isAdmin && <input type="checkbox" checked={isSel} onChange={() => toggleLabSelect(row.id)} style={{ accentColor: meta.color, cursor: 'pointer', flexShrink: 0, width: 22 }} />}
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

                    {/* Add new labour row form */}
                    {isAdmin && addingTo === trade && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border, #2e3040)', background: 'rgba(200,150,62,0.04)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                          <input value={newRow.item_name} onChange={e => setNewRow(p => ({ ...p, item_name: e.target.value }))} placeholder="Work type" style={s.editInput} />
                          <input value={newRow.area} onChange={e => setNewRow(p => ({ ...p, area: e.target.value }))} placeholder="Area" style={s.editInput} />
                          <input type="number" value={newRow.labour_cost} onChange={e => setNewRow(p => ({ ...p, labour_cost: e.target.value }))} placeholder="Cost ₹" style={s.editInput} />
                          <input value={newRow.unit} onChange={e => setNewRow(p => ({ ...p, unit: e.target.value }))} placeholder="Unit" style={s.editInput} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => addLabItem(trade)} style={{ flex: 1, padding: '6px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                          <button onClick={() => setAddingTo(null)} style={{ flex: 1, padding: '6px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {labDisplayed.length > 0 && (
              <p style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textAlign: 'right', marginTop: -16 }}>
                {labDisplayed.length} item{labDisplayed.length !== 1 ? 's' : ''}{labSelected.size > 0 ? ` · ${labSelected.size} selected` : ''}
              </p>
            )}
          </>
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
