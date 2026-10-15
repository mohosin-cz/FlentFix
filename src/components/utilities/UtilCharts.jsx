// Charts for the utilities record room.
//
// Both are measured before they are drawn: a ResizeObserver gives the real
// pixel width and the SVG is built at that width, so nothing is stretched with
// preserveAspectRatio and rounded data-ends stay round at every breakpoint.
import { useEffect, useRef, useState } from 'react'
import { MEASURES, seriesOf, periodOf, periodLabel, monthlyOf, money, DIMS } from '../../utils/utilitiesModel'

const MONO = 'var(--font-mono, monospace)'

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function Tip({ tip }) {
  if (!tip) return null
  return (
    <div style={{ position: 'fixed', left: tip.x, top: tip.y, transform: 'translate(-50%, -115%)', zIndex: 400, pointerEvents: 'none',
      background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border-dash, #3a3d52)', borderRadius: 8,
      boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,.5))', padding: '7px 10px', fontSize: 11.5, maxWidth: 240, color: 'var(--text, #e8e8f0)' }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{tip.title}</div>
      {tip.lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', color: 'var(--text-dim, #9394a8)' }}>
          <span>{l[0]}</span><span style={{ fontFamily: MONO, color: 'var(--text, #e8e8f0)' }}>{l[1]}</span>
        </div>
      ))}
    </div>
  )
}

const niceMax = (max) => {
  if (max <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(max)))
  const n = max / mag
  return mag * (n > 5 ? 10 : n > 2 ? 5 : n > 1 ? 2 : 1)
}

// ── installs over time, stacked by whatever is being grouped on ─────────────
export function TimeChart({ rows, dimKey, measureKey, grain }) {
  const [ref, W] = useWidth()
  const [tip, setTip] = useState(null)
  const H = 190, PL = 48, PR = 8, PT = 12, PB = 26

  const periods = [...new Set(rows.map((r) => periodOf(r.start_date, grain)).filter(Boolean))].sort()
  const ser = seriesOf(rows, dimKey, measureKey)
  const meas = MEASURES[measureKey]

  if (!periods.length) {
    return <div ref={ref} style={empty}>Nothing in this selection carries a start date, so there is no timeline to draw.</div>
  }
  if (!W) return <div ref={ref} style={{ height: H }} />

  const cell = new Map()
  ser.forEach((s) => {
    const byP = new Map()
    periods.forEach((p) => byP.set(p, meas.of(s.rows.filter((r) => periodOf(r.start_date, grain) === p))))
    cell.set(s.key, byP)
  })
  const totals = periods.map((p) => ser.reduce((a, s) => a + cell.get(s.key).get(p), 0))
  const top = niceMax(Math.max(...totals, 1))
  const iw = W - PL - PR, ih = H - PT - PB
  const slot = iw / periods.length
  const bw = Math.max(4, Math.min(36, slot - 5))
  const x = (i) => PL + (i + 0.5) * slot - bw / 2
  const y = (v) => PT + ih - (v / top) * ih
  // Label density follows the measured width, not the period count — at 390px
  // every third month is all that fits, and labels that collide are worse than
  // labels that are missing.
  const fits = Math.max(2, Math.floor(iw / 44))
  const step = Math.max(1, Math.ceil(periods.length / fits))

  const show = (e, title, lines) => setTip({ x: e.clientX, y: e.clientY, title, lines })

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={W} height={H} role="img" aria-label={`${meas.label} by ${grain}`} onMouseLeave={() => setTip(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PL} x2={W - PR} y1={y(top * f)} y2={y(top * f)} stroke="var(--viz-grid)" strokeWidth="1" />
            <text x={PL - 7} y={y(top * f) + 3.5} textAnchor="end" fontSize="9.5" fontFamily={MONO} fill="var(--text-muted, #6b6d82)">{meas.fmt(top * f)}</text>
          </g>
        ))}
        {periods.map((p, i) => {
          let acc = 0
          return (
            <g key={p}>
              {ser.map((s) => {
                const v = cell.get(s.key).get(p)
                if (!v) return null
                const yTop = y(acc + v)
                const h = Math.max(1, (v / top) * ih - 2)   // 2px of surface between stacked segments
                const isTop = acc + v >= totals[i] - 0.001
                acc += v
                return (
                  <rect key={s.key} x={x(i)} y={yTop} width={bw} height={h} rx={isTop ? 3 : 0} fill={s.color}
                    onMouseMove={(e) => show(e, periodLabel(p, grain), [[s.key, meas.fmt(v)], ['All', meas.fmt(totals[i])]])} />
                )
              })}
              {(i % step === 0 || (i === periods.length - 1 && i % step >= step / 2)) && (
                <text x={x(i) + bw / 2} y={H - 9} textAnchor="middle" fontSize="9.5" fontFamily={MONO} fill="var(--text-muted, #6b6d82)">{periodLabel(p, grain)}</text>
              )}
            </g>
          )
        })}
      </svg>
      <Legend series={ser} />
      <Tip tip={tip} />
    </div>
  )
}

export function Legend({ series }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 5 }}>
      {series.map((s) => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-dim, #9394a8)' }}>
          <i style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />{s.key}
        </span>
      ))}
    </div>
  )
}

// ── what one connection costs, per group ────────────────────────────────────
// One row per group, one dot per distinct price, sized by how many records sit
// on it. A group where every record agrees is a single green dot; a group where
// they do not is a line with blue dots strung along it, and the disagreement is
// the first thing you see rather than something you work out.
export function SpreadChart({ rows, dimKey }) {
  const [ref, W] = useWidth()
  const [tip, setTip] = useState(null)
  const dim = DIMS[dimKey]

  const g = new Map()
  for (const r of rows) {
    const v = monthlyOf(r)
    if (!v) continue
    const k = dim.of(r)
    if (!g.has(k)) g.set(k, [])
    g.get(k).push(r)
  }
  const groups = [...g.entries()].map(([k, rs]) => {
    const a = rs.map(monthlyOf).sort((x1, y1) => x1 - y1)
    return { k, rs, lo: a[0], hi: a[a.length - 1] }
  }).sort((a, b) => b.rs.length - a.rs.length).slice(0, 9)

  if (!groups.length) return <div ref={ref} style={empty}>No record in this selection carries both an amount and a cycle, so none of them can be reduced to a monthly cost.</div>
  if (!W) return <div ref={ref} style={{ height: 120 }} />

  const LW = Math.min(146, Math.max(70, W * 0.3))
  const PR = Math.min(104, Math.max(58, W * 0.24))
  const max = Math.max(...groups.map((x) => x.hi)) * 1.06 || 1
  const rowH = 26, H = groups.length * rowH + 16
  const sx = (v) => LW + (v / max) * (W - LW - PR)
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg width={W} height={H} role="img" aria-label={`Monthly cost spread by ${dim.label}`} onMouseLeave={() => setTip(null)}>
        {groups.map((grp, i) => {
          const cy = i * rowH + 14
          const same = grp.lo === grp.hi
          const counts = new Map()
          grp.rs.forEach((r) => { const v = Math.round(monthlyOf(r)); counts.set(v, (counts.get(v) || 0) + 1) })
          return (
            <g key={grp.k}>
              <text x="0" y={cy + 3.5} fontSize="10.5" fill="var(--text-dim, #9394a8)">{clip(grp.k, Math.floor(LW / 6))}</text>
              <line x1={sx(grp.lo)} x2={sx(grp.hi)} y1={cy} y2={cy} stroke="var(--bg-input, #252731)" strokeWidth="7" strokeLinecap="round" />
              {[...counts.entries()].map(([v, n]) => (
                <circle key={v} cx={sx(v)} cy={cy} r={Math.min(7, 3.2 + Math.log2(n) * 1.2)}
                  fill={same ? 'var(--viz-2)' : 'var(--viz-1)'} stroke="var(--bg-panel, #1e2028)" strokeWidth="2"
                  onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: grp.k, lines: [[`${money(v)} a month`, `${n} record${n > 1 ? 's' : ''}`]] })} />
              ))}
              <text x={W - 2} y={cy + 3.5} textAnchor="end" fontSize="10" fontFamily={MONO}
                fill={same ? 'var(--text-muted, #6b6d82)' : 'var(--accent, #c8963e)'}>
                {same ? money(grp.lo) : `${money(grp.lo)}–${money(grp.hi)}`}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--viz-2)' }} />one price</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--viz-1)' }} />several prices in the group</span>
        <span>dot size = records on that price</span>
      </div>
      <Tip tip={tip} />
    </div>
  )
}

const empty = { padding: '26px 14px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.6 }
