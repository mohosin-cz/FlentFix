import { useState, useRef, useEffect } from 'react'
import { Field, Input } from './ui'

/**
 * RateCardPicker
 *
 * Props:
 *   rateCardRows  — full array from supabase rate_card table
 *   areaFilter    — string (or array of strings) to pre-filter by area
 *   value         — { itemName, materialCost, labourCost }
 *   onChange      — (patch) => void  (partial update merged by caller)
 */
export default function RateCardPicker({ rateCardRows = [], areaFilter, value, onChange }) {
  const [query,  setQuery]  = useState(value?.itemName ?? '')
  const [open,   setOpen]   = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef(null)
  const listRef  = useRef(null)

  const areas = Array.isArray(areaFilter)
    ? areaFilter
    : areaFilter
      ? [areaFilter]
      : null

  // Filter rows by area then by search query
  const filtered = rateCardRows.filter(row => {
    const areaMatch = !areas || areas.some(a => row.area?.toLowerCase().includes(a.toLowerCase()))
    const q = query.trim().toLowerCase()
    const textMatch = !q
      || row.item_name?.toLowerCase().includes(q)
      || row.area?.toLowerCase().includes(q)
    return areaMatch && textMatch
  })

  // Group by area
  const grouped = filtered.reduce((acc, row) => {
    const a = row.area ?? 'Other'
    if (!acc[a]) acc[a] = []
    acc[a].push(row)
    return acc
  }, {})

  // Flat list for keyboard nav
  const flat = filtered

  const total = ((parseFloat(value?.materialCost) || 0) + (parseFloat(value?.labourCost) || 0)).toFixed(2)

  function select(row) {
    setQuery(row.item_name)
    setOpen(false)
    onChange({
      itemName:     row.item_name,
      materialCost: String(row.material_cost ?? ''),
      labourCost:   String(row.labour_cost ?? ''),
    })
  }

  function handleKeyDown(e) {
    if (!open) { if (e.key === 'ArrowDown') setOpen(true); return }
    if (e.key === 'ArrowDown') setActive(p => Math.min(p + 1, flat.length - 1))
    if (e.key === 'ArrowUp')   setActive(p => Math.max(p - 1, 0))
    if (e.key === 'Enter' && active >= 0) select(flat[active])
    if (e.key === 'Escape') setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (inputRef.current && !inputRef.current.closest('[data-rcpicker]')?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Search input ── */}
      <Field label="Rate Card Item" hint="Search and select a line item to auto-fill costs">
        <div data-rcpicker style={{ position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <svg
              width="16" height="16" viewBox="0 0 16 16" fill="none"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="7" cy="7" r="5" stroke="#B0B0B0" strokeWidth="1.5"/>
              <path d="M11 11l2.5 2.5" stroke="#B0B0B0" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              placeholder="Search items…"
              autoComplete="off"
              onChange={e => { setQuery(e.target.value); setOpen(true); setActive(-1) }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%', padding: '10px 36px 10px 34px',
                fontSize: 14, color: '#222',
                border: '1.5px solid #DDDDDD', borderRadius: 10,
                background: '#fff', outline: 'none',
              }}
            />
            {query && (
              <button
                onClick={() => { setQuery(''); onChange({ itemName: '', materialCost: '', labourCost: '' }); inputRef.current?.focus() }}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#B0B0B0', lineHeight: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {/* ── Dropdown ── */}
          {open && flat.length > 0 && (
            <div
              ref={listRef}
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                background: '#fff', border: '1.5px solid #EBEBEB',
                borderRadius: 12, zIndex: 200,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                maxHeight: 280, overflowY: 'auto',
              }}
            >
              {Object.entries(grouped).map(([area, rows]) => (
                <div key={area}>
                  {/* Group header */}
                  <div style={{
                    padding: '8px 14px 4px',
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.7px',
                    textTransform: 'uppercase', color: '#B0B0B0',
                    borderBottom: '1px solid #F5F5F5',
                    position: 'sticky', top: 0, background: '#fff',
                  }}>
                    {area}
                  </div>
                  {/* Items */}
                  {rows.map((row, _) => {
                    const flatIdx = flat.indexOf(row)
                    const isActive = flatIdx === active
                    const isSelected = value?.itemName === row.item_name
                    return (
                      <button
                        key={row.id ?? row.item_name}
                        onMouseDown={() => select(row)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '10px 14px',
                          background: isActive ? '#F7F7F7' : isSelected ? '#FFF1F3' : '#fff',
                          border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 12, transition: 'background 0.1s',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: '#222' }}>
                            {row.item_name}
                          </div>
                          {row.description && (
                            <div style={{ fontSize: 11, color: '#B0B0B0', marginTop: 1 }}>{row.description}</div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#222' }}>
                            ₹{((row.material_cost ?? 0) + (row.labour_cost ?? 0)).toLocaleString('en-IN')}
                          </div>
                          <div style={{ fontSize: 10, color: '#B0B0B0' }}>total</div>
                        </div>
                        {isSelected && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M2.5 7l3 3 6-6" stroke="#FF385C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
              {flat.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 13, color: '#B0B0B0' }}>
                  No items found
                </div>
              )}
            </div>
          )}
        </div>
      </Field>

      {/* ── Cost fields — shown once item selected ── */}
      {value?.itemName && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Material Cost (₹)">
            <Input
              value={value.materialCost}
              onChange={v => onChange({ materialCost: v })}
              placeholder="0"
              type="number"
            />
          </Field>
          <Field label="Labour Cost (₹)">
            <Input
              value={value.labourCost}
              onChange={v => onChange({ labourCost: v })}
              placeholder="0"
              type="number"
            />
          </Field>
        </div>
      )}

      {/* ── Total — read-only ── */}
      {value?.itemName && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          background: '#F7F7F7', borderRadius: 10,
          border: '1px solid #EBEBEB',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#484848' }}>Total Cost</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#222' }}>
            ₹{parseFloat(total).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  )
}
