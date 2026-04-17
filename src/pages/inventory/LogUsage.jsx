import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const today = new Date().toISOString().split('T')[0]

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return isMobile
}

function QtyBadge({ qty }) {
  const color = qty > 5 ? '#3dba7a' : qty >= 2 ? '#f5c842' : '#e05c6a'
  const bg    = qty > 5 ? 'rgba(61,186,122,0.12)' : qty >= 2 ? 'rgba(245,200,66,0.12)' : 'rgba(224,92,106,0.12)'
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color, background: bg, border: `1px solid ${color}33`, borderRadius: 4, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)' }}>
      {qty} in stock
    </span>
  )
}

export default function LogUsage() {
  const navigate  = useNavigate()
  const isMobile  = useIsMobile()
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
  const [success, setSuccess]     = useState(false)

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const q = query.trim()
      const { data } = await supabase
        .from('inventory_items')
        .select('id, fxin, item_name, trade, spec, size, quantity_remaining, quantity_used, price_inc')
        .or(`fxin.ilike.%${q}%,item_name.ilike.%${q}%`)
        .order('item_name')
        .limit(20)
      setResults(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  function selectItem(item) {
    setSelected(item)
    setResults([])
    setQuery('')
    setError('')
  }

  function clearSelected() {
    setSelected(null)
    setQtyUsed('')
    setPid('')
    setNotes('')
    setError('')
  }

  async function handleSubmit() {
    const qty = parseInt(qtyUsed)
    if (!selected) { setError('Select an item first.'); return }
    if (!qty || qty <= 0) { setError('Enter a valid quantity used.'); return }
    if (qty > (selected.quantity_remaining || 0)) { setError(`Only ${selected.quantity_remaining} in stock.`); return }
    if (!pid.trim()) { setError('Property ID (PID) is required.'); return }

    setSubmitting(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: usageErr } = await supabase.from('inventory_usage').insert({
        item_id: selected.id,
        fxin: selected.fxin,
        item_name: selected.item_name,
        qty_used: qty,
        pid: pid.trim(),
        use_date: useDate,
        notes: notes.trim() || null,
        logged_by: user?.email || null,
      })
      if (usageErr) throw usageErr

      const newRemaining = (selected.quantity_remaining || 0) - qty
      const newUsed      = (selected.quantity_used || 0) + qty
      const { error: updErr } = await supabase.from('inventory_items')
        .update({ quantity_remaining: newRemaining, quantity_used: newUsed })
        .eq('id', selected.id)
      if (updErr) throw updErr

      setSuccess(true)
      setSelected(prev => ({ ...prev, quantity_remaining: newRemaining, quantity_used: newUsed }))
      setQtyUsed('')
      setPid('')
      setNotes('')
    } catch (e) {
      setError(e.message || 'Something went wrong')
    }
    setSubmitting(false)
  }

  if (success) {
    return (
      <div style={s.page}>
        <header style={s.header}>
          <button style={s.backBtn} onClick={() => navigate('/inventory')}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div style={s.headerCenter}>
            <span style={s.headerTitle}>Log Usage</span>
            <span style={s.headerSub}>record items used</span>
          </div>
          <div style={{ width: 36 }} />
        </header>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(61,186,122,0.15)', border: '2px solid #3dba7a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>✓</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Usage Logged</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.6 }}>
            {selected?.item_name} — {selected?.quantity_remaining} remaining in stock
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexDirection: isMobile ? 'column' : 'row', width: '100%', maxWidth: 360 }}>
            <button onClick={() => { setSuccess(false); clearSelected() }} style={{ flex: 1, padding: '10px 16px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
              Log Another
            </button>
            <button onClick={() => navigate('/inventory')} style={{ flex: 1, padding: '10px 16px', background: 'var(--bg-panel, #1e2028)', color: 'var(--text-dim, #9394a8)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
              Back to Inventory
            </button>
          </div>
        </div>
      </div>
    )
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

      <div style={{ flex: 1, padding: isMobile ? '16px 16px 80px' : '20px 24px 60px', maxWidth: 600, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Search for item */}
        {!selected && (
          <div style={s.card}>
            <p style={s.sectionLabel}>Find Item</p>
            <div style={{ position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by FXIN or item name…"
                autoFocus
                style={{ width: '100%', padding: '10px 12px 10px 32px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
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

            {query.trim() && !searching && results.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 8 }}>No items found for "{query}"</p>
            )}
          </div>
        )}

        {/* Selected item + form */}
        {selected && (
          <>
            {/* Item card */}
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

            {/* Usage form */}
            <div style={s.card}>
              <p style={s.sectionLabel}>Usage Details</p>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <span style={s.label}>Qty Used *</span>
                  <input
                    type="number" min="1" max={selected.quantity_remaining ?? undefined}
                    value={qtyUsed}
                    onChange={e => { setQtyUsed(e.target.value); setError('') }}
                    placeholder="0"
                    style={s.inp}
                  />
                </div>
                <div>
                  <span style={s.label}>Property ID (PID) *</span>
                  <input
                    value={pid}
                    onChange={e => { setPid(e.target.value); setError('') }}
                    placeholder="e.g. FLT-2024-001"
                    style={s.inp}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <span style={s.label}>Date Used *</span>
                <input
                  type="date"
                  value={useDate}
                  onChange={e => setUseDate(e.target.value)}
                  style={s.inp}
                />
              </div>

              <div>
                <span style={{ ...s.label }}>Notes <span style={{ fontWeight: 400, color: 'var(--text-muted, #6b6d82)', textTransform: 'none' }}>optional</span></span>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any notes about usage or job…"
                  rows={3}
                  style={{ ...s.inp, resize: 'vertical', minHeight: 70 }}
                />
              </div>
            </div>

            {error && <div style={s.errorBox}>{error}</div>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ marginTop: 16, width: '100%', padding: '13px 20px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Saving…' : 'Log Usage →'}
            </button>
          </>
        )}
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
  card: { background: 'var(--bg-panel, #1e2028)', borderRadius: 10, padding: '18px 18px 20px', border: '1px solid var(--border, #2e3040)', marginBottom: 14 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 14, marginTop: 0 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 6 },
  inp: { width: '100%', padding: '9px 12px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  errorBox: { padding: '10px 14px', background: 'rgba(224,92,106,0.1)', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', marginTop: 10 },
}
