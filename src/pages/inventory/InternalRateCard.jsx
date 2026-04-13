import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

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

const TRADE_COLORS = {
  electrical: { color: '#f5c842', bg: 'rgba(245,200,66,0.1)', border: 'rgba(245,200,66,0.3)' },
  plumbing:   { color: '#5ba8e5', bg: 'rgba(91,168,229,0.1)',  border: 'rgba(91,168,229,0.3)' },
  woodwork:   { color: '#c8963e', bg: 'rgba(200,150,62,0.1)',  border: 'rgba(200,150,62,0.3)' },
  cleaning:   { color: '#3dba7a', bg: 'rgba(61,186,122,0.1)',  border: 'rgba(61,186,122,0.3)' },
  misc:       { color: '#9394a8', bg: 'rgba(147,148,168,0.1)', border: 'rgba(147,148,168,0.3)' },
}

function TradeBadge({ trade }) {
  const t = TRADE_COLORS[trade] || TRADE_COLORS.misc
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, borderRadius: 3, padding: '2px 6px', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {trade}
    </span>
  )
}

export default function InternalRateCard() {
  const navigate = useNavigate()
  const [rows, setRows]       = useState([])
  const [editing, setEditing] = useState({})
  const [saving, setSaving]   = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('')

  useEffect(() => {
    supabase.from('internal_rate_card').select('*').order('trade').order('item_name')
      .then(({ data }) => { setRows(data || []); setLoading(false) })
  }, [])

  const filtered = rows.filter(r =>
    !filter ||
    r.item_name?.toLowerCase().includes(filter.toLowerCase()) ||
    r.fxin?.toLowerCase().includes(filter.toLowerCase()) ||
    r.trade?.toLowerCase().includes(filter.toLowerCase())
  )

  function startEdit(row) {
    setEditing(prev => ({ ...prev, [row.fxin]: { manual_override: String(row.manual_override ?? ''), unit: row.unit || '' } }))
  }

  function cancelEdit(fxin) {
    setEditing(prev => { const next = { ...prev }; delete next[fxin]; return next })
  }

  async function saveRow(row) {
    const e = editing[row.fxin]
    if (!e) return
    setSaving(prev => ({ ...prev, [row.fxin]: true }))
    const override = e.manual_override !== '' ? parseFloat(e.manual_override) : null
    await supabase.from('internal_rate_card').update({ manual_override: override, unit: e.unit }).eq('fxin', row.fxin)
    setRows(prev => prev.map(r => r.fxin === row.fxin ? { ...r, manual_override: override, unit: e.unit } : r))
    setSaving(prev => { const next = { ...prev }; delete next[row.fxin]; return next })
    cancelEdit(row.fxin)
  }

  const effectivePrice = (row) => row.manual_override != null ? row.manual_override : row.avg_cost

  if (loading) return <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>loading internal rate card…</div>

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/inventory')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Internal Rate Card</span>
          <span style={s.headerSub}>auto-updated from registry</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px 60px' }}>

        {/* Note */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 14px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.2)', borderRadius: 8, marginBottom: 16 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent, #c8963e)' }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 6v3.5M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5, margin: 0 }}>
            Prices auto-updated from inventory registry. Use manual override to pin a specific price.
          </p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search by FXIN, item name or trade…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
            No items yet. Register inventory to populate this table.
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>
            <div style={s.tableHead}>
              <span style={{ width: 100 }}>FXIN</span>
              <span style={{ flex: 2 }}>Item</span>
              <span style={{ width: 80 }}>Trade</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Avg Cost</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Last Price</span>
              <span style={{ flex: 1, textAlign: 'right' }}>Effective</span>
              <span style={{ width: 60 }} />
            </div>

            {filtered.map((row, ri) => {
              const isEditing = !!editing[row.fxin]
              const e = editing[row.fxin] || {}
              const overridden = row.manual_override != null
              const effective = effectivePrice(row)
              return (
                <div key={row.fxin} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border, #2e3040)', background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <span style={{ width: 100, fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}>{row.fxin}</span>
                  <div style={{ flex: 2 }}>
                    <span style={{ fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                    {overridden && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#9b8af4', background: 'rgba(155,138,244,0.12)', border: '1px solid rgba(155,138,244,0.3)', borderRadius: 3, padding: '1px 5px', fontFamily: 'var(--font-mono, monospace)' }}>overridden</span>}
                  </div>
                  <div style={{ width: 80 }}><TradeBadge trade={row.trade} /></div>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>₹{(row.avg_cost || 0).toLocaleString('en-IN')}</span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right' }}>₹{(row.last_price || 0).toLocaleString('en-IN')}</span>
                  {isEditing ? (
                    <>
                      <div style={{ flex: 1 }}><Inp type="number" value={e.manual_override} onChange={v => setEditing(prev => ({ ...prev, [row.fxin]: { ...prev[row.fxin], manual_override: v } }))} placeholder="override ₹" /></div>
                      <div style={{ width: 60, display: 'flex', gap: 4 }}>
                        <button onClick={() => saveRow(row)} disabled={saving[row.fxin]} style={s.saveBtnSm}>{saving[row.fxin] ? '…' : '✓'}</button>
                        <button onClick={() => cancelEdit(row.fxin)} style={s.cancelBtnSm}>✕</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: overridden ? '#9b8af4' : 'var(--text, #e8e8f0)', textAlign: 'right' }}>₹{(effective || 0).toLocaleString('en-IN')}</span>
                      <div style={{ width: 60, display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => startEdit(row)} style={s.editBtnSm}>Edit</button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
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
  editBtnSm: { fontSize: 10, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' },
  saveBtnSm: { fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' },
  cancelBtnSm: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer' },
}
