import { useState, useEffect } from 'react'
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

const LABOUR_KW = ['install', 'repair', 'service', 'clean', 'labour', 'labor', 'replace', 'fix', 'maintenance']
function isLabourItem(row) {
  const name = (row.item_name || '').toLowerCase()
  return LABOUR_KW.some(k => name.includes(k)) || row.trade === 'cleaning'
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

function EditInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '5px 8px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 4, outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box' }}
    />
  )
}

function FxinBadge({ value }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 4, padding: '2px 7px', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
      {value}
    </span>
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

export default function InternalRateCard() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [rows, setRows]           = useState([])
  const [isAdmin, setIsAdmin]     = useState(false)
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('Labour RC')
  const [tradePill, setTradePill] = useState('All')
  const [filter, setFilter]       = useState('')
  const [editing, setEditing]     = useState({})
  const [saving, setSaving]       = useState({})

  useEffect(() => {
    Promise.all([
      supabase.from('internal_rate_card').select('*').order('trade').order('item_name'),
      supabase.auth.getUser(),
    ]).then(([{ data }, { data: { user } }]) => {
      setRows(data || [])
      setIsAdmin(user?.email === ADMIN_EMAIL)
      setLoading(false)
    })
  }, [])

  const tabFiltered = rows.filter(r => tab === 'Labour RC' ? isLabourItem(r) : !isLabourItem(r))
  const tradeFiltered = tradePill === 'All' ? tabFiltered : tabFiltered.filter(r => r.trade?.toLowerCase() === tradePill.toLowerCase())
  const displayed = filter
    ? tradeFiltered.filter(r => r.fxin?.toLowerCase().includes(filter.toLowerCase()) || r.item_name?.toLowerCase().includes(filter.toLowerCase()))
    : tradeFiltered

  function startEdit(row) {
    setEditing(p => ({ ...p, [row.fxin]: { manual_override: row.manual_override != null ? String(row.manual_override) : '', unit: row.unit || '' } }))
  }
  function cancelEdit(fxin) { setEditing(p => { const n = { ...p }; delete n[fxin]; return n }) }

  async function saveRow(row) {
    const e = editing[row.fxin]; if (!e) return
    setSaving(p => ({ ...p, [row.fxin]: true }))
    const override = e.manual_override.trim() !== '' ? parseFloat(e.manual_override) : null
    await supabase.from('internal_rate_card').update({ manual_override: override, unit: e.unit }).eq('fxin', row.fxin)
    setRows(p => p.map(r => r.fxin === row.fxin ? { ...r, manual_override: override, unit: e.unit } : r))
    setSaving(p => { const n = { ...p }; delete n[row.fxin]; return n })
    cancelEdit(row.fxin)
  }

  const effectivePrice = r => r.manual_override != null ? r.manual_override : r.last_price

  if (loading) return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>loading internal rate card…</span>
    </div>
  )

  const containerStyle = {
    flex: 1,
    width: '100%',
    maxWidth: isMobile ? '100%' : 900,
    margin: '14px auto 40px',
    padding: isMobile ? '0 16px' : '0 24px',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/inventory')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Internal Rate Card</span>
          <span style={s.headerSub}>auto-populated from registry{isAdmin ? ' · admin' : ''}</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      {/* Tab bar — full width equal split */}
      <div style={{ display: 'flex', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        {['Labour RC', 'Material RC'].map(t => (
          <button key={t} onClick={() => { setTab(t); setTradePill('All'); setFilter('') }}
            style={{
              flex: 1, padding: isMobile ? '11px 8px' : '11px 20px',
              fontSize: isMobile ? 11 : 12, fontWeight: 600, cursor: 'pointer',
              background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent, #c8963e)' : '2px solid transparent',
              color: tab === t ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
              fontFamily: 'var(--font-mono, monospace)', transition: 'color 0.15s, border-color 0.15s',
            }}>{t}</button>
        ))}
      </div>

      {/* Trade pills */}
      <div style={{ display: 'flex', gap: 6, padding: isMobile ? '10px 16px' : '12px 24px', flexWrap: 'wrap', maxWidth: isMobile ? '100%' : 900, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {TRADES.map(t => (
          <TradePill key={t} label={t} active={tradePill === t} onClick={() => setTradePill(t)} small={isMobile} />
        ))}
      </div>

      {/* Info banner */}
      <div style={{ maxWidth: isMobile ? '100%' : 900, margin: '0 auto', width: '100%', padding: isMobile ? '0 16px' : '0 24px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 8, padding: '9px 13px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.18)', borderRadius: 7 }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent, #c8963e)' }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 6v3.5M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5, margin: 0 }}>
            Prices auto-updated from inventory registry.{isAdmin ? ' Set a manual override to pin a specific rate.' : ''}
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ maxWidth: isMobile ? '100%' : 900, margin: '12px auto 0', width: '100%', padding: isMobile ? '0 16px' : '0 24px', boxSizing: 'border-box' }}>
        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #6b6d82)', pointerEvents: 'none' }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search FXIN or item name…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Table / Cards */}
      <div style={containerStyle}>
        {displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12, background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)' }}>
            No items logged yet. Register inventory to populate this.
          </div>
        ) : isMobile ? (
          /* Mobile: card list */
          <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>
            {displayed.map((row, i) => {
              const isEditing = !!editing[row.fxin]
              const e = editing[row.fxin] || {}
              const overridden = row.manual_override != null
              const effective = effectivePrice(row)
              const meta = TRADE_META[row.trade?.toLowerCase()] || TRADE_META.misc

              return (
                <div key={row.fxin} style={{ padding: '13px 14px', borderTop: i > 0 ? '1px solid var(--border, #2e3040)' : 'none', background: i % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }}>
                  {isEditing ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <FxinBadge value={row.fxin} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        <div>
                          <span style={s.mobileLabel}>Override Price ₹</span>
                          <EditInput type="number" value={e.manual_override} onChange={v => setEditing(p => ({ ...p, [row.fxin]: { ...p[row.fxin], manual_override: v } }))} placeholder={String(row.last_price || '')} />
                        </div>
                        <div>
                          <span style={s.mobileLabel}>Unit</span>
                          <EditInput value={e.unit} onChange={v => setEditing(p => ({ ...p, [row.fxin]: { ...p[row.fxin], unit: v } }))} placeholder="nos" />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => saveRow(row)} disabled={saving[row.fxin]} style={{ flex: 1, padding: '7px', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving[row.fxin] ? '…' : '✓ Save'}</button>
                        <button onClick={() => cancelEdit(row.fxin)} style={{ flex: 1, padding: '7px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer' }}>✕ Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Row 1: item name + effective price + edit btn */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                        <div style={{ flex: 1, paddingRight: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                          {overridden && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#c8963e', background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 3, padding: '1px 5px', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase' }}>Overridden</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: overridden ? 'var(--accent, #c8963e)' : 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>₹{(effective || 0).toLocaleString('en-IN')}</span>
                          {isAdmin && (
                            <button onClick={() => startEdit(row)} style={s.editBtn}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Row 2: trade badge + FXIN */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 3, padding: '2px 6px', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.trade}</span>
                        <FxinBadge value={row.fxin} />
                      </div>
                      {/* Row 3: avg + last prices */}
                      <div style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>
                        Avg: ₹{(row.avg_cost || 0).toLocaleString('en-IN')} · Last: ₹{(row.last_price || 0).toLocaleString('en-IN')}
                        {row.unit ? ` · ${row.unit}` : ''}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* Desktop: table */
          <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 10, border: '1px solid var(--border, #2e3040)', overflow: 'hidden' }}>
            <div style={s.colHead}>
              <span style={{ width: 110 }}>FXIN</span>
              <span style={{ flex: 2 }}>Item Name</span>
              <span style={{ width: 80 }}>Trade</span>
              <span style={{ width: 90, textAlign: 'right' }}>Avg Cost</span>
              <span style={{ width: 90, textAlign: 'right' }}>Last Price</span>
              <span style={{ width: 110, textAlign: 'right' }}>Effective Price</span>
              {isAdmin && <span style={{ width: 72 }} />}
            </div>
            {displayed.map((row, i) => {
              const isEditing = !!editing[row.fxin]
              const e = editing[row.fxin] || {}
              const overridden = row.manual_override != null
              const effective = effectivePrice(row)
              const meta = TRADE_META[row.trade?.toLowerCase()] || TRADE_META.misc
              return (
                <div key={row.fxin} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderTop: '1px solid var(--border, #2e3040)', minHeight: 44, background: i % 2 !== 0 ? 'rgba(255,255,255,0.018)' : 'transparent' }}>
                  <div style={{ width: 110, flexShrink: 0 }}><FxinBadge value={row.fxin} /></div>
                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 13, color: 'var(--text, #e8e8f0)' }}>{row.item_name}</span>
                    {overridden && !isEditing && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#c8963e', background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 3, padding: '1px 6px', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overridden</span>
                    )}
                  </div>
                  <div style={{ width: 80, flexShrink: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 3, padding: '2px 6px', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.trade}</span>
                  </div>
                  <span style={{ width: 90, flexShrink: 0, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>₹{(row.avg_cost || 0).toLocaleString('en-IN')}</span>
                  <span style={{ width: 90, flexShrink: 0, fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>₹{(row.last_price || 0).toLocaleString('en-IN')}</span>
                  {isEditing ? (
                    <div style={{ width: 110, flexShrink: 0 }}>
                      <EditInput type="number" value={e.manual_override} onChange={v => setEditing(p => ({ ...p, [row.fxin]: { ...p[row.fxin], manual_override: v } }))} placeholder={String(row.last_price || '')} />
                    </div>
                  ) : (
                    <span style={{ width: 110, flexShrink: 0, fontSize: 13, fontWeight: 700, color: overridden ? 'var(--accent, #c8963e)' : 'var(--text, #e8e8f0)', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>₹{(effective || 0).toLocaleString('en-IN')}</span>
                  )}
                  {isAdmin && (
                    <div style={{ width: 72, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                      {isEditing ? (
                        <>
                          <button onClick={() => saveRow(row)} disabled={saving[row.fxin]} style={s.saveBtn}>{saving[row.fxin] ? '…' : '✓'}</button>
                          <button onClick={() => cancelEdit(row.fxin)} style={s.cancelBtn}>✕</button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(row)} style={s.editBtn}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5a1.5 1.5 0 012.1 2.1L4 10.1l-2.5.5.5-2.5L8.5 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {displayed.length > 0 && (
          <p style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 10, textAlign: 'right' }}>
            {displayed.length} item{displayed.length !== 1 ? 's' : ''}
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
  saveBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 5, background: 'var(--green, #3dba7a)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  cancelBtn: { width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border, #2e3040)', borderRadius: 5, background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  mobileLabel: { fontSize: 10, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--font-mono, monospace)', display: 'block', marginBottom: 4 },
}
