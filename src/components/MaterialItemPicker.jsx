import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

function getPrice(r) {
  if (r.flent_price)  return r.flent_price
  if (r.market_price) return r.market_price
  const base = parseFloat(r.price_inc) || 0
  return Math.round(base * (1 + (r.margin_percent || 0) / 100))
}

export default function MaterialItemPicker({ value, materialCost, onSelect, placeholder }) {
  const [search,       setSearch]       = useState('')
  const [results,      setResults]      = useState([])
  const [open,         setOpen]         = useState(false)
  const [dropPos,      setDropPos]      = useState({})
  const [loading,      setLoading]      = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')
  const ref        = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('inventory_items')
        .select('fxin, item_name, spec, size, trade, quantity_remaining, flent_price, market_price, price_inc, margin_percent')
        .or(`item_name.ilike.%${search}%,fxin.ilike.%${search}%`)
        .gt('quantity_remaining', 0)
        .order('purchase_date', { ascending: false })
        .limit(12)
      const seen = new Set()
      const unique = (data || []).filter(r => { if (seen.has(r.fxin)) return false; seen.add(r.fxin); return true })
      setResults(unique)
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function openDropdown() {
    if (open) { setOpen(false); setSearch(''); return }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom
      setDropPos(spaceBelow < 264 && rect.top > 264
        ? { position: 'fixed', bottom: window.innerHeight - rect.top, top: 'auto', left: rect.left, width: rect.width }
        : { position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width }
      )
    }
    setOpen(true)
    setSearch('')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        ref={triggerRef}
        onClick={openDropdown}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
          border: `1px solid ${value ? 'rgba(200,150,62,0.5)' : 'var(--border, #2e3040)'}`,
          background: 'var(--bg-input, #252731)', fontSize: 12, fontFamily: 'inherit',
          color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', gap: 6, minHeight: 40,
        }}
      >
        {value ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', background: 'rgba(200,150,62,0.12)', padding: '2px 5px', borderRadius: 3, flexShrink: 0 }}>{value}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLabel || 'Selected'}</span>
          </div>
        ) : (
          <span style={{ flex: 1 }}>{placeholder || 'Pick from inventory…'}</span>
        )}
        {value && materialCost && (
          <span style={{ fontSize: 11, color: 'var(--accent, #c8963e)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            ₹{parseFloat(materialCost).toLocaleString('en-IN')} / ea
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M2 4l4 4 4-4" stroke="#B0B0B0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {open && (
        <div style={{ ...dropPos, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, zIndex: 9999, maxHeight: 260, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClick={e => e.stopPropagation()}
            placeholder="Search by name or FXIN…"
            style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-input, #252731)', border: 'none', borderBottom: '1px solid var(--border, #2e3040)', color: 'var(--text, #e8e8f0)', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />

          {loading && (
            <div style={{ padding: 12, color: 'var(--text-muted, #6b6d82)', fontSize: 12, textAlign: 'center' }}>Searching…</div>
          )}

          {!loading && search.trim() && results.length === 0 && (
            <div style={{ padding: 12, color: 'var(--text-muted, #6b6d82)', fontSize: 12, textAlign: 'center' }}>No items in stock</div>
          )}

          {!loading && !search.trim() && (
            <div style={{ padding: 12, color: 'var(--text-muted, #6b6d82)', fontSize: 12, textAlign: 'center' }}>Type a name or FXIN to search…</div>
          )}

          {!loading && results.map(r => {
            const price = getPrice(r)
            return (
              <div
                key={r.fxin}
                onClick={() => { onSelect(r.fxin, String(price)); setSelectedLabel(r.item_name); setOpen(false); setSearch('') }}
                style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #2e3040)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', background: 'rgba(200,150,62,0.12)', padding: '2px 5px', borderRadius: 3 }}>{r.fxin}</span>
                    {r.trade && <span style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.trade}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.item_name}{r.spec ? ` · ${r.spec}` : ''}{r.size ? ` · ${r.size}` : ''}
                  </div>
                  {r.quantity_remaining != null && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>
                      {r.quantity_remaining} in stock
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>
                    ₹{price.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)' }}>per unit</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
