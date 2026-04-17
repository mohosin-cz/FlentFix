import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const today = new Date().toISOString().split('T')[0]

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
  return <span style={{ fontSize: 12, fontWeight: 700, color, background: bg, border: `1px solid ${color}33`, borderRadius: 4, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{qty} in stock</span>
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const inpS = { width: '100%', padding: '9px 12px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
const edInp = { padding: '6px 8px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 5, outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box', width: '100%' }

export default function LogUsage() {
  const navigate  = useNavigate()
  const isMobile  = useIsMobile()
  const [toasts, showToast] = useToast()

  // Log form
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected]   = useState(null)
  const [qtyUsed, setQtyUsed]     = useState('')
  const [pid, setPid]             = useState('')
  const [useDate, setUseDate]     = useState(today)
  const [notes, setNotes]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')

  // Usage history
  const [history, setHistory]     = useState([])
  const [histLoading, setHistLoading] = useState(true)

  // Edit usage
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({})
  const [editSaving, setEditSaving] = useState(false)

  // Delete usage
  const [confirmDel, setConfirmDel] = useState(null) // { id, item_id, qty_used, item_name }

  const loadHistory = useCallback(() => {
    supabase
      .from('inventory_usage')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setHistory(data || []); setHistLoading(false) })
  }, [])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const q = query.trim()
      const { data } = await supabase
        .from('inventory_items')
        .select('id, fxin, item_name, trade, spec, size, quantity_remaining, quantity_used, price_inc')
        .or(`fxin.ilike.%${q}%,item_name.ilike.%${q}%`)
        .order('item_name').limit(20)
      setResults(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  function selectItem(item) { setSelected(item); setResults([]); setQuery(''); setError('') }
  function clearSelected() { setSelected(null); setQtyUsed(''); setPid(''); setNotes(''); setError('') }

  async function handleSubmit() {
    const qty = parseInt(qtyUsed)
    if (!selected) { setError('Select an item first.'); return }
    if (!qty || qty <= 0) { setError('Enter a valid quantity used.'); return }
    if (qty > (selected.quantity_remaining || 0)) { setError(`Only ${selected.quantity_remaining} in stock.`); return }
    if (!pid.trim()) { setError('Property ID (PID) is required.'); return }
    setSubmitting(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: usage, error: usageErr } = await supabase.from('inventory_usage').insert({
        item_id: selected.id, fxin: selected.fxin, item_name: selected.item_name,
        qty_used: qty, pid: pid.trim(), use_date: useDate, notes: notes.trim() || null, logged_by: user?.email || null,
      }).select().single()
      if (usageErr) throw usageErr
      const newRemaining = (selected.quantity_remaining || 0) - qty
      const newUsed      = (selected.quantity_used || 0) + qty
      const { error: updErr } = await supabase.from('inventory_items').update({ quantity_remaining: newRemaining, quantity_used: newUsed }).eq('id', selected.id)
      if (updErr) throw updErr
      setSelected(prev => ({ ...prev, quantity_remaining: newRemaining, quantity_used: newUsed }))
      setQtyUsed(''); setPid(''); setNotes('')
      setHistory(p => [usage, ...p])
      showToast(`Logged ${qty}× ${selected.item_name}`)
    } catch (e) { setError(e.message || 'Something went wrong') }
    setSubmitting(false)
  }

  // ── Edit usage ──
  function startEditUsage(entry) {
    setEditingId(entry.id)
    setEditForm({ qty_used: String(entry.qty_used || ''), pid: entry.pid || '', use_date: entry.use_date || today, notes: entry.notes || '' })
  }

  async function saveEditUsage(entry) {
    setEditSaving(true)
    const newQty = parseInt(editForm.qty_used) || 0
    const oldQty = entry.qty_used || 0
    const delta  = newQty - oldQty   // positive = used more, negative = used less
    const patch  = { qty_used: newQty, pid: editForm.pid, use_date: editForm.use_date, notes: editForm.notes || null }
    const prev = history.find(h => h.id === entry.id)
    setHistory(p => p.map(h => h.id === entry.id ? { ...h, ...patch } : h))
    setEditingId(null)
    const { error: usageErr } = await supabase.from('inventory_usage').update(patch).eq('id', entry.id)
    if (usageErr) { setHistory(p => p.map(h => h.id === entry.id ? prev : h)); showToast('Save failed', 'error'); setEditSaving(false); return }
    // Adjust item quantity by delta
    if (delta !== 0 && entry.item_id) {
      const { data: item } = await supabase.from('inventory_items').select('quantity_remaining, quantity_used').eq('id', entry.item_id).single()
      if (item) {
        await supabase.from('inventory_items').update({
          quantity_remaining: Math.max(0, (item.quantity_remaining || 0) - delta),
          quantity_used: Math.max(0, (item.quantity_used || 0) + delta),
        }).eq('id', entry.item_id)
        if (selected?.id === entry.item_id) {
          setSelected(p => p ? { ...p, quantity_remaining: Math.max(0, (p.quantity_remaining || 0) - delta), quantity_used: Math.max(0, (p.quantity_used || 0) + delta) } : p)
        }
      }
    }
    showToast('Usage updated')
    setEditSaving(false)
  }

  // ── Delete usage ──
  async function deleteUsage() {
    if (!confirmDel) return
    const { id, item_id, qty_used: qty, item_name } = confirmDel
    const prev = history.find(h => h.id === id)
    setHistory(p => p.filter(h => h.id !== id))
    setConfirmDel(null)
    const { error } = await supabase.from('inventory_usage').delete().eq('id', id)
    if (error) { setHistory(p => [prev, ...p]); showToast('Delete failed', 'error'); return }
    // Reverse the quantity
    if (item_id) {
      const { data: item } = await supabase.from('inventory_items').select('quantity_remaining, quantity_used').eq('id', item_id).single()
      if (item) {
        await supabase.from('inventory_items').update({
          quantity_remaining: (item.quantity_remaining || 0) + qty,
          quantity_used: Math.max(0, (item.quantity_used || 0) - qty),
        }).eq('id', item_id)
        if (selected?.id === item_id) {
          setSelected(p => p ? { ...p, quantity_remaining: (p.quantity_remaining || 0) + qty, quantity_used: Math.max(0, (p.quantity_used || 0) - qty) } : p)
        }
      }
    }
    showToast(`Reversed ${qty}× "${item_name}"`)
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/inventory')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Log Usage</span>
          <span style={s.headerSub}>record items used on a job</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      <div style={{ flex: 1, padding: isMobile ? '16px 16px 60px' : '20px 24px 60px', maxWidth: 680, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {/* ── Search ── */}
        {!selected && (
          <div style={s.card}>
            <p style={s.sectionLabel}>Find Item</p>
            <div style={{ position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by FXIN or item name…" autoFocus
                style={{ ...inpS, paddingLeft: 32 }} />
            </div>
            {searching && <p style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 8 }}>searching…</p>}
            {results.length > 0 && (
              <div style={{ marginTop: 8, border: '1px solid var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden' }}>
                {results.map((item, i) => (
                  <button key={item.id} onClick={() => selectItem(item)} style={{ width: '100%', padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: i % 2 === 0 ? 'var(--bg-input, #252731)' : 'var(--bg-panel, #1e2028)', border: 'none', borderTop: i > 0 ? '1px solid var(--border, #2e3040)' : 'none', cursor: 'pointer', textAlign: 'left', gap: 10 }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        {item.fxin && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 3, padding: '1px 6px', fontFamily: 'var(--font-mono, monospace)' }}>{item.fxin}</span>}
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</span>
                      </div>
                      {(item.spec || item.size) && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{[item.spec, item.size].filter(Boolean).join(' · ')}</div>}
                    </div>
                    <QtyBadge qty={item.quantity_remaining ?? 0} />
                  </button>
                ))}
              </div>
            )}
            {query.trim() && !searching && results.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 8 }}>No items found for "{query}"</p>}
          </div>
        )}

        {/* ── Selected item + form ── */}
        {selected && (
          <>
            <div style={{ background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 10, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  {selected.fxin && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.15)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)' }}>{selected.fxin}</span>}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', marginBottom: 4 }}>{selected.item_name}</div>
                {(selected.spec || selected.size) && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 4 }}>{[selected.spec, selected.size].filter(Boolean).join(' · ')}</div>}
                <QtyBadge qty={selected.quantity_remaining ?? 0} />
              </div>
              <button onClick={clearSelected} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
            </div>

            <div style={s.card}>
              <p style={s.sectionLabel}>Usage Details</p>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <span style={s.lbl}>Qty Used *</span>
                  <input type="number" min="1" value={qtyUsed} onChange={e => { setQtyUsed(e.target.value); setError('') }} placeholder="0" style={inpS} />
                </div>
                <div>
                  <span style={s.lbl}>Property ID (PID) *</span>
                  <input value={pid} onChange={e => { setPid(e.target.value); setError('') }} placeholder="e.g. FLT-2024-001" style={inpS} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={s.lbl}>Date Used *</span>
                <input type="date" value={useDate} onChange={e => setUseDate(e.target.value)} style={inpS} />
              </div>
              <div>
                <span style={{ ...s.lbl }}>Notes <span style={{ fontWeight: 400, color: 'var(--text-muted, #6b6d82)', textTransform: 'none' }}>optional</span></span>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes about usage or job…" rows={3} style={{ ...inpS, resize: 'vertical', minHeight: 70 }} />
              </div>
            </div>
            {error && <div style={s.errorBox}>{error}</div>}
            <button onClick={handleSubmit} disabled={submitting} style={{ marginTop: 12, width: '100%', padding: '13px 20px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Saving…' : 'Log Usage →'}
            </button>
          </>
        )}

        {/* ── Usage History ── */}
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>Usage History</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border, #2e3040)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{history.length} entries</span>
          </div>

          {histLoading ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>loading…</p>
          ) : history.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)' }}>No usage entries yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map(entry => {
                const isEd = editingId === entry.id
                const ef = editForm
                return (
                  <div key={entry.id} style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${isEd ? 'rgba(200,150,62,0.35)' : 'var(--border, #2e3040)'}`, borderRadius: 9, padding: '12px 14px' }}>
                    {isEd ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8, marginBottom: 8 }}>
                          <div>
                            <span style={s.lbl}>Qty Used</span>
                            <input type="number" value={ef.qty_used} onChange={e => setEditForm(p => ({ ...p, qty_used: e.target.value }))} style={edInp} />
                          </div>
                          <div>
                            <span style={s.lbl}>PID</span>
                            <input value={ef.pid} onChange={e => setEditForm(p => ({ ...p, pid: e.target.value }))} style={edInp} />
                          </div>
                          <div>
                            <span style={s.lbl}>Date</span>
                            <input type="date" value={ef.use_date} onChange={e => setEditForm(p => ({ ...p, use_date: e.target.value }))} style={edInp} />
                          </div>
                          <div style={{ gridColumn: isMobile ? '1/-1' : 'auto' }}>
                            <span style={s.lbl}>Notes</span>
                            <input value={ef.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="—" style={edInp} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => saveEditUsage(entry)} disabled={editSaving} style={{ padding: '6px 16px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{editSaving ? '…' : '✓ Save'}</button>
                          <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            {entry.fxin && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 3, padding: '1px 6px', fontFamily: 'var(--font-mono, monospace)' }}>{entry.fxin}</span>}
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{entry.item_name}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#e05c6a', background: 'rgba(224,92,106,0.1)', border: '1px solid rgba(224,92,106,0.25)', borderRadius: 3, padding: '1px 6px', fontFamily: 'var(--font-mono, monospace)' }}>−{entry.qty_used}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
                            <span>{entry.pid}</span>
                            <span>{formatDate(entry.use_date)}</span>
                            {entry.logged_by && <span>{entry.logged_by}</span>}
                            {entry.notes && <span style={{ color: 'var(--text-dim, #9394a8)', fontStyle: 'italic' }}>{entry.notes}</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          <button onClick={() => startEditUsage(entry)} style={s.iconBtn}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button onClick={() => setConfirmDel({ id: entry.id, item_id: entry.item_id, qty_used: entry.qty_used, item_name: entry.item_name })} style={{ ...s.iconBtn, color: '#e05c6a', borderColor: 'rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.08)' }}>
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
        </div>
      </div>

      {confirmDel && <ConfirmDialog message={`Delete this usage entry (${confirmDel.qty_used}× "${confirmDel.item_name}")? Stock will be reversed.`} onConfirm={deleteUsage} onCancel={() => setConfirmDel(null)} />}
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
  card: { background: 'var(--bg-panel, #1e2028)', borderRadius: 10, padding: '18px 18px 20px', border: '1px solid var(--border, #2e3040)', marginBottom: 14 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 14, marginTop: 0 },
  lbl: { fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 },
  errorBox: { padding: '10px 14px', background: 'rgba(224,92,106,0.1)', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', marginTop: 10 },
  iconBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border, #2e3040)', borderRadius: 5, background: 'var(--bg-input, #252731)', color: 'var(--accent, #c8963e)', cursor: 'pointer' },
}
