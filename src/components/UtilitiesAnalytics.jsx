import { useMemo } from 'react'
import { monthlyCost, spendInMonth, typeLabel, typeColor } from '../utils/propertyUtils'
import UtilityIcon from './UtilityIcon'

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'
const money = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const shortType = (k, label) => ({ water_purifier: 'Water', wifi: 'WiFi', maintenance: 'Maintenance' }[k] || label)

function analyze(rows) {
  const monthly = rows.reduce((a, r) => a + monthlyCost(r), 0)

  // what was actually billed last calendar month
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last = spendInMonth(rows, prev.getFullYear(), prev.getMonth())
  const lastMonthLabel = prev.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const props = new Set(rows.map(r => r.pid)).size

  const byType = {}
  for (const r of rows) {
    const k = r.utility_type
    ;(byType[k] = byType[k] || { key: k, count: 0, monthly: 0 })
    byType[k].count++; byType[k].monthly += monthlyCost(r)
  }
  const typeList = Object.values(byType)
    .map(t => ({ ...t, spend: (last.byType[t.key] || {}).spend || 0, paid: (last.byType[t.key] || {}).count || 0 }))
    .sort((a, b) => b.spend - a.spend || b.count - a.count)

  const byProv = {}
  for (const r of rows) {
    const p = (r.provider || '—').trim() || '—'
    ;(byProv[p] = byProv[p] || { name: p, count: 0, monthly: 0 })
    byProv[p].count++; byProv[p].monthly += monthlyCost(r)
  }
  const providers = Object.values(byProv).filter(p => p.name !== '—').sort((a, b) => b.count - a.count).slice(0, 6)

  const cycles = {}
  for (const r of rows) { const c = r.billing_cycle || '—'; cycles[c] = (cycles[c] || 0) + 1 }

  return {
    count: rows.length, props, monthly,
    last, lastMonthLabel,
    typeList, providers,
    cycles: Object.entries(cycles).sort((a, b) => b[1] - a[1]),
    dueToday: rows.filter(r => r.due && r.due.days <= 0).length,
    dueWeek: rows.filter(r => r.bucket === 'due').length,
    dueMonth: rows.filter(r => r.bucket === 'due' || r.bucket === 'month').length,
    upcoming: rows.filter(r => r.due).sort((a, b) => a.due.days - b.due.days).slice(0, 6),
    noSchedule: rows.filter(r => !r.due).length,
    noAmount: rows.filter(r => r.billing_amount == null).length,
    unknown: rows.filter(r => r.status === 'unknown').length,
    notInPulse: rows.filter(r => !r.prop).length,
  }
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  )
}
function MiniStat({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 19, fontWeight: 800, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function UtilitiesAnalytics({ rows, onType, onDue }) {
  const a = useMemo(() => analyze(rows), [rows])
  const maxTypeSpend = Math.max(1, ...a.typeList.map(t => t.spend))
  const maxProv = Math.max(1, ...a.providers.map(p => p.count))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>Analytics <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>· {a.count} active</span></div>

      {/* Spend */}
      <Card title="Spend">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{a.lastMonthLabel}</div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 7 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{money(a.last.installs.monthlyAdded)}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>/mo · {a.last.installs.count} new</span>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>New installs</div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 11 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text, #e8e8f0)', fontFamily: MONO }}>{money(a.last.recharges.paid)}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>· {a.last.recharges.count} renewed</span>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 1 }}>Recharges</div>
          </div>

          <div style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{money(a.monthly)}</div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>RUNNING NOW /MO</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, marginTop: 6 }}>{money(a.monthly * 12)}</div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>PER YEAR</div>
          </div>
        </div>
        {a.last.undated > 0 && (
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5, marginTop: -4 }}>
            {a.last.undated} with no date or amount not counted
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 2 }}>
          {a.typeList.map(t => (
            <button key={t.key} onClick={() => onType && onType(t.key)} style={{ display: 'flex', flexDirection: 'column', gap: 5, background: 'none', border: 'none', padding: 0, cursor: onType ? 'pointer' : 'default', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontFamily: MONO }}>
                <UtilityIcon type={t.key} size={14} />
                <span style={{ color: 'var(--text-dim, #9394a8)' }}>{shortType(t.key, typeLabel({ utility_type: t.key }))}</span>
                <span style={{ color: 'var(--text-muted, #6b6d82)' }}>· {t.paid}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{money(t.spend)}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-input, #252731)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(3, t.spend / maxTypeSpend * 100)}%`, background: typeColor({ utility_type: t.key }), borderRadius: 3 }} /></div>
            </button>
          ))}
        </div>
      </Card>

      {/* Recharges */}
      <Card title="Recharges">
        <div style={{ display: 'flex', gap: 6 }}>
          <MiniStat label="Due today" value={a.dueToday} color={a.dueToday ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)'} />
          <MiniStat label="≤ 7 days" value={a.dueWeek} color={a.dueWeek ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)'} />
          <MiniStat label="≤ 30 days" value={a.dueMonth} color={a.dueMonth ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)'} />
        </div>
        {a.upcoming.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2, borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border, #2e3040)' }}>
            {a.upcoming.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', background: 'var(--bg-input, #252731)' }}>
                <UtilityIcon type={r.utility_type} size={14} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>PID {r.pid}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortType(r.utility_type, typeLabel(r))}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: r.due.color, fontFamily: MONO, whiteSpace: 'nowrap' }}>{r.due.days <= 0 ? 'today' : r.due.days === 1 ? '1 day' : `${r.due.days} days`}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Portfolio */}
      <Card title="Portfolio">
        <div style={{ display: 'flex', gap: 6 }}>
          <MiniStat label="Properties" value={a.props} color="var(--text, #e8e8f0)" />
          <MiniStat label="Utilities" value={a.count} color="var(--text, #e8e8f0)" />
          <MiniStat label="Avg / prop" value={money(a.props ? a.monthly / a.props : 0)} color="var(--text-dim, #9394a8)" />
        </div>
        {a.providers.length > 0 && <>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>Top providers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {a.providers.map(p => (
              <div key={p.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontFamily: MONO }}>
                  <span style={{ color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted, #6b6d82)' }}>{p.count} · {money(p.monthly)}/mo</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-input, #252731)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(4, p.count / maxProv * 100)}%`, background: 'var(--accent, #c8963e)', borderRadius: 2 }} /></div>
              </div>
            ))}
          </div>
        </>}
      </Card>

      {/* Needs attention */}
      {(a.noSchedule || a.unknown || a.noAmount || a.notInPulse) > 0 && (
        <Card title="Needs attention">
          {a.noSchedule > 0 && <AttnRow label="No recharge date" value={a.noSchedule} action={onDue ? () => onDue('none') : null} />}
          {a.unknown > 0 && <AttnRow label="Status ‘unknown’" value={a.unknown} />}
          {a.noAmount > 0 && <AttnRow label="No amount set" value={a.noAmount} />}
          {a.notInPulse > 0 && <AttnRow label="Property not in Pulse" value={a.notInPulse} />}
        </Card>
      )}
    </div>
  )
}

function AttnRow({ label, value, action }) {
  return (
    <button onClick={action || undefined} disabled={!action} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', background: 'none', border: 'none', borderTop: '1px solid var(--border, #2e3040)', width: '100%', cursor: action ? 'pointer' : 'default', fontFamily: MONO }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, color: 'var(--accent, #c8963e)' }}>{value}</span>
      {action && <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>›</span>}
    </button>
  )
}
