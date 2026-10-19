import { useMemo, useState } from 'react'
import {
  GRAINS, deploymentsByPeriod, periodKeyOf, deltaPct, countBy, isCurrentPeriod,
  monthlyCost, LIVE_STATUSES,
} from '../utils/propertyUtils'

// Deployments and cost over time, at whatever grain you ask for.
//
// The page could already tell you what the estate costs today and what went in
// last month. It could not answer "how did Q2 compare with Q1", "what is the
// run-rate doing", or "which provider did we actually buy from this year" —
// which is most of what anyone opens a dashboard for.
//
// Two rules the charts here obey, both of which the old side-panel did not
// have to think about:
//
//   One axis per chart. Deployments are counts and run-rate is rupees, so they
//   are two charts stacked, never one chart with a scale down each side. A
//   dual axis lets you place the crossing wherever flatters the story.
//
//   Colour is validated, not chosen. --viz-1 and --viz-2 come from theme.css
//   and pass the lightness band, chroma floor, CVD separation, normal-vision
//   floor and surface contrast in BOTH themes. The pair this page used before
//   (#7f93b8 with #38bdf8) scored ΔE 12.6 for normal vision — two blues that a
//   reader with no colour deficiency at all still has to squint at.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'
const money = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const compact = n => {
  const v = Math.round(Number(n || 0))
  if (Math.abs(v) >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L'
  if (Math.abs(v) >= 1000) return '₹' + Math.round(v / 1000) + 'k'
  return '₹' + v
}
const pct = d => d == null ? null : `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`

function Panel({ title, sub, right, children }) {
  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{title}</span>
        {sub && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{sub}</span>}
        {right && <span style={{ marginInlineStart: 'auto' }}>{right}</span>}
      </div>
      {children}
    </div>
  )
}

// Delta wears a text token, never the series colour — and it is only shown
// when there is a previous period to compare against.
function Stat({ label, value, delta, sub, partial }) {
  // Zero change is not a fall. Rounding to 0% and painting it red with a down
  // arrow was telling people a flat month went backwards.
  const flat = delta != null && Math.round(delta * 100) === 0
  const good = delta != null && delta > 0
  return (
    <div style={{ flex: '1 1 150px', minWidth: 0, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, letterSpacing: '0.09em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 21, fontWeight: 800, fontFamily: MONO, color: 'var(--text, #e8e8f0)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {/* A period still in progress has nothing honest to compare against. */}
        {partial ? (
          <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)' }}>so far</span>
        ) : delta != null && (
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO,
            color: flat ? 'var(--text-muted, #6b6d82)' : good ? 'var(--green, #6f9a7e)' : 'var(--red, #b0645b)' }}>
            {flat ? 'flat' : `${good ? '▲' : '▼'} ${pct(delta).replace('-', '')}`}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Legend() {
  const items = [['var(--viz-1)', 'WiFi'], ['var(--viz-2)', 'Water purifier']]
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {items.map(([c, l]) => (
        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: c, flexShrink: 0 }} />{l}
        </span>
      ))}
    </div>
  )
}

// ── stacked bars: deployments per period ────────────────────────────────────
// Counts only. The 2px gap between the two segments is a surface-coloured
// spacer, so the boundary reads as a boundary rather than relying on the two
// hues being told apart — which is also what keeps it legible in greyscale.
function DeployChart({ data, selected, onSelect }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map(d => d.deploys))
  const H = 168, GAP = 6
  const w = 100 / Math.max(data.length, 1)

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: GAP, height: H }}>
        {data.map(d => {
          const on = selected === d.key
          const total = (d.deploys / max) * (H - 22)
          const wifiH = d.deploys ? (d.wifi / d.deploys) * total : 0
          const waterH = Math.max(0, total - wifiH)
          return (
            <button
              key={d.key} type="button"
              onClick={() => onSelect(on ? null : d.key)}
              onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)}
              aria-pressed={on}
              title={`${d.label}: ${d.deploys} deployments`}
              style={{ flex: `1 1 ${w}%`, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                alignItems: 'stretch', gap: 2, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                opacity: selected && !on ? 0.45 : 1, transition: 'opacity .15s' }}>
              {/* the count sits above its own bar — a direct label, not a number on every mark */}
              <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: MONO, color: on || hover === d.key ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', marginBottom: 2 }}>
                {d.deploys}
              </span>
              {d.water > 0 && (
                <span style={{ height: Math.max(waterH, 3), background: 'var(--viz-2)', borderRadius: d.wifi ? '4px 4px 0 0' : 4 }} />
              )}
              {d.wifi > 0 && (
                <span style={{ height: Math.max(wifiH, 3), background: 'var(--viz-1)', borderRadius: d.water ? '0 0 4px 4px' : 4 }} />
              )}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: GAP, marginTop: 7 }}>
        {data.map(d => (
          <span key={d.key} style={{ flex: `1 1 ${w}%`, minWidth: 0, textAlign: 'center', fontSize: 9.5, fontFamily: MONO,
            color: selected === d.key ? 'var(--text-dim, #9394a8)' : 'var(--text-muted, #6b6d82)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
        ))}
      </div>
      {hover && (() => {
        const d = data.find(x => x.key === hover)
        return (
          <div role="status" style={{ position: 'absolute', top: -6, right: 0, padding: '7px 10px', background: 'var(--bg-input, #252731)',
            border: '1px solid var(--border-dash, #3a3d52)', borderRadius: 8, fontFamily: MONO, fontSize: 11, color: 'var(--text-dim, #9394a8)',
            pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-sm)' }}>
            <b style={{ color: 'var(--text, #e8e8f0)' }}>{d.label}</b> · {d.deploys} deployed · {d.properties} propert{d.properties === 1 ? 'y' : 'ies'}<br />
            WiFi {d.wifi} · Water {d.water} · cash {money(d.paid)}
          </div>
        )
      })()}
    </div>
  )
}

// ── line: cumulative run-rate ───────────────────────────────────────────────
// Its own chart, with its own axis. This is rupees-per-month and the chart
// above is counts; putting them on one frame would need two scales, and the
// crossing point of a dual axis is decoration you can place anywhere.
function RunRateChart({ data }) {
  const [hover, setHover] = useState(null)
  const W = 640, H = 150, PAD = { l: 8, r: 8, t: 14, b: 6 }
  const max = Math.max(1, ...data.map(d => d.cumulativeMonthly))
  const x = i => PAD.l + (i / Math.max(data.length - 1, 1)) * (W - PAD.l - PAD.r)
  const y = v => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b)
  const pts = data.map((d, i) => [x(i), y(d.cumulativeMonthly)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - PAD.b} L${PAD.l},${H - PAD.b} Z`

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ width: '100%', height: H, display: 'block' }} role="img"
        aria-label={`Cumulative monthly run-rate, ending at ${money(data[data.length - 1]?.cumulativeMonthly)} per month`}
        onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--viz-grid)" strokeWidth="1" />
        ))}
        <path d={area} fill="var(--viz-1)" opacity="0.10" />
        <path d={line} fill="none" stroke="var(--viz-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t - 6} y2={H - PAD.b} stroke="var(--border-dash, #3a3d52)" strokeWidth="1" />
        )}
        {pts.map((p, i) => (
          <g key={data[i].key}>
            {/* hit target larger than the mark */}
            <rect x={p[0] - 14} y={0} width="28" height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
            <circle cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3.5} fill="var(--viz-1)"
              stroke="var(--bg-panel, #1e2028)" strokeWidth="2" />
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>
        <span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span>
      </div>
      {hover != null && (
        <div role="status" style={{ position: 'absolute', top: -4, left: 0, padding: '7px 10px', background: 'var(--bg-input, #252731)',
          border: '1px solid var(--border-dash, #3a3d52)', borderRadius: 8, fontFamily: MONO, fontSize: 11, color: 'var(--text-dim, #9394a8)',
          pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-sm)' }}>
          <b style={{ color: 'var(--text, #e8e8f0)' }}>{data[hover].label}</b> · {money(data[hover].cumulativeMonthly)}/mo running<br />
          {money(data[hover].spend)}/mo added here
        </div>
      )}
    </div>
  )
}

// horizontal bars for a breakdown — magnitude by identity, one hue
function Breakdown({ rows, total, unit = 'n' }) {
  if (!rows.length) return <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Nothing in this period.</div>
  const max = Math.max(1, ...rows.map(r => r.count))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map(r => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 104, flexShrink: 0, fontSize: 11.5, color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>{r.name}</span>
          <span style={{ flex: 1, height: 8, background: 'var(--bg-input, #252731)', borderRadius: 4, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${(r.count / max) * 100}%`, height: '100%', background: 'var(--viz-1)', borderRadius: 4 }} />
          </span>
          <span style={{ width: 72, textAlign: 'right', flexShrink: 0, fontSize: 11.5, fontFamily: MONO, color: 'var(--text, #e8e8f0)', fontVariantNumeric: 'tabular-nums' }}>
            {unit === 'money' ? compact(r.paid) : r.count}
            {total ? <span style={{ color: 'var(--text-muted, #6b6d82)' }}> · {Math.round((r.count / total) * 100)}%</span> : null}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function UtilitiesTrends({ rows, onOpenPid }) {
  const [grain, setGrain] = useState('month')
  const [selected, setSelected] = useState(null)
  const [showTable, setShowTable] = useState(false)

  const series = useMemo(() => deploymentsByPeriod(rows, grain), [rows, grain])
  // Months run long; a year of them is the useful window, and the table below
  // still holds everything.
  const shown = useMemo(() => grain === 'month' ? series.slice(-14) : series, [series, grain])

  const cur = selected ? series.find(s => s.key === selected) : series[series.length - 1]
  const idx = cur ? series.findIndex(s => s.key === cur.key) : -1
  const prev = idx > 0 ? series[idx - 1] : null
  // The newest period is usually today's, and today's is not finished.
  const partial = cur ? isCurrentPeriod(cur.key, grain) : false

  // rows that landed in the focused period — drives the breakdowns below
  const inPeriod = useMemo(() => {
    if (!cur) return []
    return (rows || []).filter(r => LIVE_STATUSES.has(r.status) && periodKeyOf(r.start_date, grain) === cur.key)
  }, [rows, grain, cur])

  const liveMonthly = useMemo(() => (rows || []).reduce((a, r) => a + monthlyCost(r), 0), [rows])

  if (!series.length) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
      No deployments with an install date yet.
    </div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* grain + what is in focus */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {GRAINS.map(g => (
          <button key={g.key} type="button" onClick={() => { setGrain(g.key); setSelected(null) }}
            aria-pressed={grain === g.key} className={`tct tct-raised${grain === g.key ? ' is-on' : ''}`}
            style={{ padding: '9px 15px', fontSize: 12.5, lineHeight: 1, minHeight: 38, cursor: 'pointer' }}>{g.label}</button>
        ))}
        <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
          {selected ? `${cur.label} · click again to clear` : `latest · ${cur.label}`}
          {partial && <span style={{ color: 'var(--accent, #c8963e)' }}> · in progress</span>}
        </span>
        <button type="button" onClick={() => setShowTable(t => !t)} className="tct tct-bare"
          style={{ padding: '9px 12px', fontSize: 12, cursor: 'pointer' }}>{showTable ? 'Hide table' : 'Table'}</button>
      </div>

      {/* headline, against the period before */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Stat label="Deployed" value={cur.deploys} delta={deltaPct(cur.deploys, prev?.deploys)} sub={partial ? `${prev ? prev.deploys : 0} in ${prev ? prev.label : "—"}, complete` : prev ? `vs ${prev.deploys} in ${prev.label}` : 'no earlier period'} partial={partial} />
        <Stat label="Properties" value={cur.properties} delta={deltaPct(cur.properties, prev?.properties)} sub="distinct PIDs" partial={partial} />
        <Stat label="Cash committed" value={compact(cur.paid)} delta={deltaPct(cur.paid, prev?.paid)} sub="what was actually paid" partial={partial} />
        <Stat label="Run-rate added" value={compact(cur.spend) + '/mo'} delta={deltaPct(cur.spend, prev?.spend)} sub="monthly equivalent" partial={partial} />
        <Stat label="Avg per install" value={compact(cur.avgPaid)} sub={`${cur.wifi} WiFi · ${cur.water} water`} />
      </div>

      <Panel title="Deployments" sub={`by ${grain}${grain === 'month' && series.length > 14 ? ' · last 14' : ''} · click a bar to focus`} right={<Legend />}>
        <DeployChart data={shown} selected={selected} onSelect={setSelected} />
      </Panel>

      <Panel title="Monthly run-rate" sub={`cumulative · the estate now costs ${money(liveMonthly)}/mo`}>
        <RunRateChart data={shown} />
      </Panel>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Panel title="Providers" sub={cur.label}>
          <Breakdown rows={countBy(inPeriod, r => r.provider)} total={inPeriod.length} />
        </Panel>
        <Panel title="Billing cycle" sub={cur.label}>
          <Breakdown rows={countBy(inPeriod, r => r.billing_cycle)} total={inPeriod.length} />
        </Panel>
        <Panel title="Plan" sub={cur.label}>
          <Breakdown rows={countBy(inPeriod, r => r.plan_type)} total={inPeriod.length} />
        </Panel>
      </div>

      {/* The table view is not a fallback — it is how you read exact numbers,
          and how this is usable without colour at all. */}
      {showTable && (
        <Panel title="Every period" sub={`${series.length} ${grain}s`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
              <thead><tr>
                {['Period', 'Deployed', 'WiFi', 'Water', 'Properties', 'Cash', 'Run-rate added', 'Cumulative /mo'].map((h, i) => (
                  <th key={h} style={{ textAlign: i ? 'right' : 'left', fontSize: 9, fontWeight: 700, color: 'var(--text-muted, #6b6d82)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: MONO, padding: '8px 9px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {[...series].reverse().map(p => (
                  <tr key={p.key} style={{ background: p.key === cur.key ? 'var(--bg-input, #252731)' : 'transparent', cursor: 'pointer' }}
                      onClick={() => setSelected(p.key === selected ? null : p.key)}>
                    <td style={{ textAlign: 'left', fontFamily: MONO, fontSize: 12.5, padding: '8px 9px', borderTop: '1px solid var(--border, #2e3040)', color: 'var(--text, #e8e8f0)' }}>{p.label}</td>
                    {[p.deploys, p.wifi, p.water, p.properties, money(p.paid), money(p.spend), money(p.cumulativeMonthly)].map((v, i) => (
                      <td key={i} style={{ textAlign: 'right', fontFamily: MONO, fontSize: 12.5, padding: '8px 9px', borderTop: '1px solid var(--border, #2e3040)',
                        color: i >= 4 ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontVariantNumeric: 'tabular-nums' }}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* What this cannot tell you, said once, where the numbers are. */}
      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
        Everything here is anchored on the install date. No recharge has ever been logged —
        {' '}0 of {(rows || []).length} rows carry one — so renewals are not in these figures and
        a “paid this period” built on them would be a projection, not a fact.
      </div>

      {onOpenPid && inPeriod.length > 0 && (
        <Panel title={`Deployed in ${cur.label}`} sub={`${inPeriod.length} connection${inPeriod.length === 1 ? '' : 's'}`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {inPeriod.slice(0, 60).map(r => (
              <button key={r.id} type="button" onClick={() => onOpenPid(r.pid)} className="tct tct-raised"
                style={{ padding: '6px 10px', fontSize: 11.5, fontFamily: MONO, cursor: 'pointer' }}>
                PID {r.pid}
                <span style={{ marginInlineStart: 6, color: r.utility_type === 'wifi' ? 'var(--viz-1)' : 'var(--viz-2)' }}>●</span>
              </button>
            ))}
            {inPeriod.length > 60 && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, alignSelf: 'center' }}>+{inPeriod.length - 60} more</span>}
          </div>
        </Panel>
      )}
    </div>
  )
}
