import { useState, useMemo } from 'react'
import { deploymentsByMonth, monthLabel, typeLabel, typeColor, fmtDate } from '../utils/propertyUtils'
import UtilityIcon from './UtilityIcon'

// Deployments month by month. The rows handed in are already filtered, so every
// number on screen answers the same question — previously the counts split by
// type while the money column silently summed all of them, which made the water
// column and the spend column impossible to reconcile against each other.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'
const money = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const th = { fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.05em' }

export default function UtilitiesByMonth({ rows, navigate, typeKey = 'all', typeName = '' }) {
  const months = useMemo(() => deploymentsByMonth(rows), [rows])
  const [open, setOpen] = useState(null)
  const maxPaid = Math.max(1, ...months.map(m => m.paid))

  // One type selected: the WiFi/Water split columns say nothing, so they give
  // way to a single count of what was actually deployed.
  const single = typeKey !== 'all'
  const GRID = single
    ? 'minmax(120px,1.4fr) 74px 58px minmax(104px,1fr) 20px'
    : 'minmax(120px,1.4fr) 58px 58px 58px minmax(104px,1fr) 20px'

  if (months.length === 0) {
    return (
      <div style={{ padding: '40px 20px', border: '1px dashed rgba(200,150,62,0.2)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: SANS, lineHeight: 1.7 }}>
        {single ? <>No {typeName || 'matching'} deployments with an install date.<br />Clear the filter to see everything.</>
                : <>No installation dates recorded yet.<br />Add an install date on a utility to see the month-on-month breakdown.</>}
      </div>
    )
  }

  const tot = months.reduce((a, m) => ({
    deploys: a.deploys + m.deploys, wifi: a.wifi + m.wifi, water: a.water + m.water,
    spend: a.spend + m.spend, paid: a.paid + m.paid,
  }), { deploys: 0, wifi: 0, water: 0, spend: 0, paid: 0 })

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth: 460 }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, alignItems: 'center', padding: '0 14px 10px' }}>
          <span style={th}>Month</span>
          {single ? (
            <span style={{ ...th, textAlign: 'center' }}>Deployed</span>
          ) : (
            <>
              <span style={{ ...th, textAlign: 'center' }}>WiFi</span>
              <span style={{ ...th, textAlign: 'center' }}>Water</span>
            </>
          )}
          <span style={{ ...th, textAlign: 'center' }}>Props</span>
          <span style={{ ...th, textAlign: 'right' }}>Paid</span>
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
                  {single ? (
                    <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{m.deploys}</div>
                  ) : (
                    <>
                      <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: m.wifi ? '#5b8def' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{m.wifi}</div>
                      <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: m.water ? '#38bdf8' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{m.water}</div>
                    </>
                  )}
                  <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{m.properties}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{money(m.paid)}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>{money(m.spend)}/mo</div>
                    <div style={{ height: 3, marginTop: 4, borderRadius: 2, background: 'var(--bg-input, #252731)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(4, m.paid / maxPaid * 100)}%`, background: 'var(--accent, #c8963e)', borderRadius: 2 }} /></div>
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border, #2e3040)', display: 'flex', flexDirection: 'column' }}>
                    {items.map(r => (
                      <button key={r.id} onClick={() => navigate(`/properties/${r.pid}/utilities`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-input, #252731)', border: 'none', borderTop: '1px solid var(--border, #2e3040)', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                        <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${typeColor(r)}22`, border: `1px solid ${typeColor(r)}44`, color: typeColor(r) }}><UtilityIcon type={r.utility_type} size={14} /></span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: MONO, flexShrink: 0 }}>PID {r.pid}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeLabel(r)}{r.provider ? ` · ${r.provider}` : ''}{r.prop && r.prop.name ? ` · ${r.prop.name}` : ''}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, flexShrink: 0 }}>{fmtDate(r.start_date)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO, flexShrink: 0, minWidth: 56, textAlign: 'right' }}>{money(r.billing_amount)}</span>
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
          {single ? (
            <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{tot.deploys}</span>
          ) : (
            <>
              <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#5b8def', fontFamily: MONO }}>{tot.wifi}</span>
              <span style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#38bdf8', fontFamily: MONO }}>{tot.water}</span>
            </>
          )}
          <span />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{money(tot.paid)}</div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>{money(tot.spend)}/mo</div>
          </div>
          <span />
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, padding: '8px 14px 0', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text-dim, #9394a8)' }}>Paid</strong> is the plan cost committed by that month&rsquo;s deployments — the figure that reconciles against an invoice.
          The smaller <strong style={{ color: 'var(--text-dim, #9394a8)' }}>/mo</strong> below it is the recurring monthly-equivalent those deployments added.
          {single && <> Showing <strong style={{ color: 'var(--accent, #c8963e)' }}>{typeName}</strong> only.</>}
          {' '}Tap a month to see its installs.
        </div>
      </div>
    </div>
  )
}
