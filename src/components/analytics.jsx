import { useState } from 'react'
import { SANS, MONO, GRID, SURFACE, S1, money, compact, share } from '../utils/analytics'

// The chart kit both analytics pages are built from. Extracted from the payroll
// page so payroll and property payments read as one system rather than two
// dashboards that happen to live in the same app.

export function Card({ title, sub, children, right }) {
  return (
    <section style={{ background: SURFACE, border: `1px solid ${GRID}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>{title}</h2>
        {sub && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{sub}</span>}
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
      {children}
    </section>
  )
}

// `delta` is a change in cost: up is red, down is green. `deltaGood` flips that
// for the measures where more is better.
export function Stat({ label, value, delta, tone, sub, deltaGood }) {
  const d = delta == null ? null : Math.round(delta)
  const up = d > 0
  const good = deltaGood ? up : !up
  return (
    <div style={{ minWidth: 0, background: SURFACE, border: `1px solid ${GRID}`, borderRadius: 12, padding: '13px 15px' }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: tone || 'var(--text, #e8e8f0)', fontFamily: MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{label}</div>
      {d != null && (
        <div style={{ fontSize: 10.5, fontFamily: MONO, marginTop: 5, color: d === 0 ? 'var(--text-muted, #6b6d82)' : good ? 'var(--green, #3dba7a)' : 'var(--red, #e05c6a)' }}>
          {d === 0 ? 'flat' : `${up ? '▲' : '▼'} ${Math.abs(d)}%`} <span style={{ color: 'var(--text-muted, #6b6d82)' }}>vs prev</span>
        </div>
      )}
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 5 }}>{sub}</div>}
    </div>
  )
}

export function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {items.map(i => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: i.color, flexShrink: 0 }} />{i.label}
        </span>
      ))}
    </div>
  )
}

// ── column chart ─────────────────────────────────────────────────────────────
// One or more stacked series. Bars capped at 24px with a 4px rounded cap and a
// 2px surface gap between segments; gridlines hairline and recessive. Pass
// `minBar` and the plot scrolls sideways instead of squeezing bars to hairlines
// on a phone — the y axis stays put so the scale is always readable.
export function Columns({ rows, series, height = 170, fmt = compact, labelLast = true, minBar = 0 }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...rows.map(r => series.reduce((a, s) => a + (r[s.key] || 0), 0)))
  const ticks = [0, max / 2, max]
  const stacked = series.length > 1
  const contentMin = minBar ? rows.length * minBar : 0

  return (
    <div>
      <div style={{ display: 'flex', gap: 10 }}>
        {/* y axis — outside the scroller, so it never scrolls away */}
        <div style={{ width: 44, flexShrink: 0, height, position: 'relative' }}>
          {ticks.map((t, i) => (
            <span key={i} style={{ position: 'absolute', right: 0, bottom: `${(t / max) * 100}%`, transform: 'translateY(50%)', fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, whiteSpace: 'nowrap' }}>{fmt(t)}</span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowX: contentMin ? 'auto' : 'visible', overflowY: 'hidden' }}>
          <div style={{ minWidth: contentMin || undefined }}>
            <div style={{ position: 'relative', height }}>
              {ticks.map((t, i) => (
                <div key={i} style={{ position: 'absolute', left: 0, right: 0, bottom: `${(t / max) * 100}%`, height: 1, background: GRID, opacity: i === 0 ? 1 : 0.55 }} />
              ))}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                {rows.map((r, i) => {
                  const total = series.reduce((a, s) => a + (r[s.key] || 0), 0)
                  const isLast = i === rows.length - 1
                  return (
                    <div key={r.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                      onClick={() => setHover(h => (h === i ? null : i))}
                      style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', cursor: 'default' }}>
                      {labelLast && isLast && total > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: MONO, marginBottom: 4, whiteSpace: 'nowrap' }}>{fmt(total)}</span>
                      )}
                      <div style={{ width: '100%', maxWidth: 24, height: `${(total / max) * 100}%`, display: 'flex', flexDirection: 'column-reverse', gap: stacked ? 2 : 0, opacity: hover == null || hover === i ? 1 : 0.45, transition: 'opacity .12s' }}>
                        {series.map((s, si) => {
                          const v = r[s.key] || 0
                          if (!v) return null
                          const topMost = series.slice(si + 1).every(x => !(r[x.key] || 0))
                          return <div key={s.key} title={`${s.label}: ${money(v)}`}
                            style={{ height: `${(v / total) * 100}%`, background: s.color, borderRadius: topMost ? '4px 4px 0 0' : 0, minHeight: 2 }} />
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* x axis — inside the scroller so labels stay under their bars */}
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              {rows.map(r => (
                <span key={r.label} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, whiteSpace: 'nowrap', overflow: 'hidden' }}>{r.axis || r.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      {hover != null && rows[hover] && (
        <div style={{ marginTop: 10, padding: '9px 11px', background: 'var(--bg-input, #252731)', border: `1px solid ${GRID}`, borderRadius: 9, fontSize: 11.5, fontFamily: MONO, color: 'var(--text-dim, #9394a8)', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ color: 'var(--text, #e8e8f0)', fontWeight: 700 }}>{rows[hover].label}</span>
          {series.map(s => (rows[hover][s.key] ? <span key={s.key}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: s.color, marginRight: 5 }} />{s.label} {money(rows[hover][s.key])}</span> : null))}
          {rows[hover].note && <span>{rows[hover].note}</span>}
        </div>
      )}
    </div>
  )
}

// ── horizontal bars, one series ──────────────────────────────────────────────
export function HBars({ rows, fmt = money, color = S1, onPick }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map(r => {
        const body = (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11.5, fontFamily: MONO }}>
              <span style={{ color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              {r.sub && <span style={{ color: 'var(--text-muted, #6b6d82)', flexShrink: 0 }}>· {r.sub}</span>}
              <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--text, #e8e8f0)', flexShrink: 0 }}>{fmt(r.value)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-input, #252731)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color || color, borderRadius: 3 }} />
            </div>
          </>
        )
        return onPick ? (
          <button key={r.label} type="button" onClick={() => onPick(r)}
            style={{ display: 'flex', flexDirection: 'column', gap: 5, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', minWidth: 0 }}>
            {body}
          </button>
        ) : (
          <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>{body}</div>
        )
      })}
    </div>
  )
}

// ── one bar, split into shares ───────────────────────────────────────────────
// For a whole that adds to 100% — a two- or three-way split reads faster as one
// bar than as a pie, and keeps the numbers next to the colours.
export function SplitBar({ parts, height = 12 }) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 2, height, borderRadius: height / 2, overflow: 'hidden', background: 'var(--bg-input, #252731)' }}>
        {parts.map(p => (p.value > 0 ? (
          <div key={p.label} title={`${p.label}: ${money(p.value)}`}
            style={{ width: `${(p.value / (total || 1)) * 100}%`, background: p.color, minWidth: 3 }} />
        ) : null))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 16px' }}>
        {parts.map(p => (
          <span key={p.label} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, fontSize: 11.5, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: p.color, flexShrink: 0, alignSelf: 'center' }} />
            <span style={{ color: 'var(--text-dim, #9394a8)' }}>{p.label}</span>
            <span style={{ color: 'var(--text, #e8e8f0)', fontWeight: 700 }}>{money(p.value)}</span>
            <span>{share(p.value, total)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function Flag({ n, label, detail, tone = 'amber' }) {
  const c = tone === 'red' ? 'var(--red, #e05c6a)' : tone === 'green' ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)'
  return (
    <div style={{ display: 'flex', gap: 11, padding: '11px 12px', background: 'var(--bg-input, #252731)', border: `1px solid ${GRID}`, borderRadius: 10 }}>
      <span style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: MONO, minWidth: 30, flexShrink: 0 }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2, lineHeight: 1.5 }}>{detail}</div>
      </div>
    </div>
  )
}
