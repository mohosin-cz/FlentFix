import { useState, useMemo } from 'react'
import { deploymentsByMonth, monthLabel, typeIcon, typeLabel, typeColor, monthlyCost, fmtDate } from '../utils/propertyUtils'

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'
const money = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const GRID = 'minmax(120px,1.4fr) 58px 58px 58px minmax(96px,1fr) 20px'
const th = { fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function UtilitiesByMonth({ rows, navigate }) {
  const months = useMemo(() => deploymentsByMonth(rows), [rows])
  const [open, setOpen] = useState(null)
  const maxSpend = Math.max(1, ...months.map(m => m.spend))

  if (months.length === 0) {
    return <div style={{ padding: '40px 20px', border: '1px dashed rgba(200,150,62,0.2)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: SANS, lineHeight: 1.7 }}>No installation dates recorded yet.<br />Add an install date on a utility to see the month-on-month breakdown.</div>
  }

  const tot = months.reduce((a, m) => ({ deploys: a.deploys + m.deploys, wifi: a.wifi + m.wifi, water: a.water + m.water, spend: a.spend + m.spend }), { deploys: 0, wifi: 0, water: 0, spend: 0 })

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: 460 }}>
        {/* header */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, alignItems: 'center', padding: '0 14px 10px' }}>
          <span style={th}>Month</span>
          <span style={{ ...th, textAlign: 'center' }}>📶 WiFi</span>
          <span style={{ ...th, textAlign: 'center' }}>💧 Water</span>
          <span style={{ ...th, textAlign: 'center' }}>Props</span>
          <span style={{ ...th, textAlign: 'right' }}>Spend/mo</span>
          <span />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {months.map(m => {
            const isOpen = open === m.ym
            const items = isOpen ? rows.filter(r => r.start_date && r.start_date.slice(0, 7) === m.ym).sort((a, b) => b.start_date.localeCompare(a.start_date)) : []
            return (
              <div key={m.ym} style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${isOpen ? 'var(--accent, #c8963e)55' : 'var(--border, #2e3040)'}`, borderRadius: 12, overflow: 'hidden' }}>
                <button onClick={() => setOpen(isOpen ? null : m.ym)} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, alignItems: 'center', width: '100%', padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>{monthLabel(m.ym)}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>{m.deploys} deployed</div>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: m.wifi ? '#5b8def' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{m.wifi}</div>
                  <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: m.water ? '#38bdf8' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{m.water}</div>
                  <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{m.properties}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{money(m.spend)}</div>
                    <div style={{ height: 3, marginTop: 4, borderRadius: 2, background: 'var(--bg-input, #252731)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(4, m.spend / maxSpend * 100)}%`, background: 'var(--accent, #c8963e)', borderRadius: 2 }} /></div>
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border, #2e3040)', display: 'flex', flexDirection: 'column' }}>
                    {items.map(r => (
                      <button key={r.id} onClick={() => navigate(`/properties/${r.pid}/utilities`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-input, #252731)', border: 'none', borderTop: '1px solid var(--border, #2e3040)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                        <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: `${typeColor(r)}22`, border: `1px solid ${typeColor(r)}44` }}>{typeIcon(r)}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: MONO, flexShrink: 0 }}>PID {r.pid}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeLabel(r)}{r.provider ? ` · ${r.provider}` : ''}{r.prop && r.prop.name ? ` · ${r.prop.name}` : ''}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, flexShrink: 0 }}>{fmtDate(r.start_date)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO, flexShrink: 0, minWidth: 56, textAlign: 'right' }}>{money(monthlyCost(r))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* totals */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, alignItems: 'center', padding: '14px 14px 0', marginTop: 4, borderTop: '1px solid var(--border, #2e3040)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
          <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#5b8def', fontFamily: MONO }}>{tot.wifi}</span>
          <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#38bdf8', fontFamily: MONO }}>{tot.water}</span>
          <span />
          <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{money(tot.spend)}</span>
          <span />
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, padding: '8px 14px 0', lineHeight: 1.5 }}>Spend is the recurring monthly-equivalent added that month. Tap a month to see its installs.</div>
      </div>
    </div>
  )
}
