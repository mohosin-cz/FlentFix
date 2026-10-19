// Compare — like against like.
//
// Three questions that only make sense side by side: how do the providers
// differ (in money AND in how trustworthy their records are), what do we pay
// for one plan across the book, and what does a property cost us. All of it
// groups on the NORMALISED plan; on the raw text the same plan looks like four
// tidy plans with no variance at all, which is exactly the wrong answer.
import { useMemo, useState } from 'react'
import { typeLabel, typeColor } from '../../utils/propertyUtils'
import { monthlyOf, annualOf, money, moneyShort, canonPlan, VIZ, coverageOf } from '../../utils/utilitiesModel'
import UtilityIcon from '../UtilityIcon'
import { Card, Seg, Bar, Swatch, Pill, Empty } from './ui'
import { table, th, td, scrollX, hint } from './uiStyles'

const MONO = 'var(--font-mono, monospace)'
const TABS = [
  { k: 'bench', label: 'Provider by provider' },
  { k: 'bands', label: 'Price for the same plan' },
  { k: 'props', label: 'Cost per property' },
]

const swatch = (i) => (i < VIZ.length ? VIZ[i] : 'var(--text-muted, #6b6d82)')
const pctColor = (v) => (v > 0.8 ? 'var(--green, #6f9a7e)' : v > 0.4 ? 'var(--text-dim, #9394a8)' : 'var(--red, #b0645b)')

export default function UtilitiesCompare({ rows, properties, narrow, onDrill }) {
  const [tab, setTab] = useState('bench')

  const bench = useMemo(() => {
    const g = new Map()
    rows.forEach((r) => {
      const k = r.provider || '— not recorded'
      if (!g.has(k)) g.set(k, [])
      g.get(k).push(r)
    })
    return [...g.entries()].map(([provider, rs]) => {
      const withCost = rs.filter(monthlyOf)
      return {
        provider, n: rs.length, props: new Set(rs.map((r) => r.pid)).size,
        monthly: rs.reduce((a, r) => a + monthlyOf(r), 0),
        annual: rs.reduce((a, r) => a + annualOf(r), 0),
        per: withCost.length ? withCost.reduce((a, r) => a + monthlyOf(r), 0) / withCost.length : 0,
        plan: rs.filter((r) => r.plan_type).length / rs.length,
        account: rs.filter((r) => r.account_number).length / rs.length,
        invoice: rs.filter((r) => r.invoice_link).length / rs.length,
      }
    }).sort((a, b) => b.annual - a.annual)
  }, [rows])

  const bands = useMemo(() => {
    const g = new Map()
    rows.forEach((r) => {
      if (!r.plan_type || !r.billing_cycle || !(Number(r.billing_amount) > 0)) return
      const k = `${r.provider || '—'}|${canonPlan(r.plan_type)}|${r.billing_cycle}`
      if (!g.has(k)) g.set(k, [])
      g.get(k).push(r)
    })
    return [...g.entries()].map(([k, rs]) => {
      const a = rs.map((r) => Number(r.billing_amount)).sort((x, y) => x - y)
      const [provider, plan, cycle] = k.split('|')
      return { k, provider, plan, cycle, rs, lo: a[0], hi: a[a.length - 1], n: rs.length, spread: a[a.length - 1] - a[0] }
    }).sort((a, b) => (b.spread ? 1 : 0) - (a.spread ? 1 : 0) || b.n - a.n)
  }, [rows])

  const props = useMemo(() => coverageOf(rows, properties)
    .map((p) => ({ ...p, rows: rows.filter((r) => String(r.pid) === p.pid) }))
    .map((p) => ({ ...p, monthly: p.rows.reduce((a, r) => a + monthlyOf(r), 0), annual: p.rows.reduce((a, r) => a + annualOf(r), 0) }))
    .filter((p) => p.rows.length)
    .sort((a, b) => b.annual - a.annual), [rows, properties])

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
      <Seg value={tab} onChange={setTab} options={TABS} />
      <span style={hint}>{rows.length} records in scope</span>
    </div>
  )

  if (!rows.length) return <>{head}<Card><Empty title="Nothing in scope">Clear a filter to compare anything.</Empty></Card></>

  if (tab === 'bench') {
    const maxA = Math.max(...bench.map((x) => x.annual), 1)
    return (
      <>{head}
        <Card bodyPad={0}>
          <div style={scrollX}>
            <table style={table}>
              <thead><tr>
                <th style={th}>Provider</th>
                <th style={{ ...th, textAlign: 'right' }}>Records</th>
                <th style={{ ...th, textAlign: 'right' }}>Props</th>
                <th style={{ ...th, textAlign: 'right' }}>Avg / connection / mo</th>
                <th style={{ ...th, textAlign: 'right' }}>Annualised</th>
                {!narrow && <th style={{ ...th, width: '18%' }} aria-label="share" />}
                <th style={{ ...th, textAlign: 'right' }}>Plan recorded</th>
                <th style={{ ...th, textAlign: 'right' }}>Account no.</th>
                <th style={{ ...th, textAlign: 'right' }}>Invoice on file</th>
              </tr></thead>
              <tbody>
                {bench.map((x, i) => (
                  <tr key={x.provider}>
                    <td style={td}>
                      <Swatch color={swatch(i)} style={{ marginRight: 7, verticalAlign: -1 }} />
                      <button onClick={() => onDrill('provider', x.provider)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit',
                        color: 'var(--text, #e8e8f0)', borderBottom: '1px dotted var(--border-dash, #3a3d52)', cursor: 'pointer' }}>{x.provider}</button>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{x.n}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{x.props}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{x.per ? money(x.per) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontWeight: 700 }}>{moneyShort(x.annual)}</td>
                    {!narrow && <td style={td}><Bar pct={(x.annual / maxA) * 100} color={swatch(i)} /></td>}
                    {[x.plan, x.account, x.invoice].map((v, j) => (
                      <td key={j} style={{ ...td, textAlign: 'right', fontFamily: MONO, color: pctColor(v) }}>{Math.round(v * 100)}%</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div style={{ ...hint, marginTop: 8, lineHeight: 1.6 }}>
          The last three columns are not about money — they are how trustworthy that provider&rsquo;s records are.
          A provider whose invoices are mostly missing is a provider you cannot audit.
        </div>
      </>
    )
  }

  if (tab === 'bands') {
    const max = Math.max(...bands.map((x) => x.hi), 1)
    return (
      <>{head}
        <Card bodyPad={0}>
          <div style={scrollX}>
            <table style={table}>
              <thead><tr>
                <th style={th}>Provider · plan · cycle</th>
                <th style={{ ...th, textAlign: 'right' }}>Records</th>
                {!narrow && <th style={{ ...th, width: '34%' }}>Price on the records</th>}
                <th style={{ ...th, textAlign: 'right' }}>Low</th>
                <th style={{ ...th, textAlign: 'right' }}>High</th>
                <th style={{ ...th, textAlign: 'right' }}>Spread</th>
              </tr></thead>
              <tbody>
                {bands.map((x) => {
                  const prices = [...new Set(x.rs.map((r) => Number(r.billing_amount)))]
                  return (
                    <tr key={x.k}>
                      <td style={td}>
                        <b>{x.provider}</b> · {x.plan} <span style={hint}>· {String(x.cycle).toLowerCase()}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{x.n}</td>
                      {!narrow && (
                        <td style={td}>
                          <div style={{ position: 'relative', height: 16 }}>
                            <div style={{ position: 'absolute', left: `${(x.lo / max) * 100}%`, right: `${100 - (x.hi / max) * 100}%`, top: '50%',
                              transform: 'translateY(-50%)', height: 7, borderRadius: 4, background: 'var(--bg-input, #252731)', minWidth: 7 }} />
                            {prices.map((v) => (
                              <span key={v} title={`${money(v)} · ${x.rs.filter((r) => Number(r.billing_amount) === v).length} records`}
                                style={{ position: 'absolute', left: `${(v / max) * 100}%`, top: '50%', transform: 'translate(-50%, -50%)',
                                  width: 10, height: 10, borderRadius: '50%', background: x.spread ? 'var(--viz-1)' : 'var(--viz-2)',
                                  boxShadow: '0 0 0 2px var(--bg-panel, #1e2028)' }} />
                            ))}
                          </div>
                        </td>
                      )}
                      <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{money(x.lo)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{money(x.hi)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontWeight: x.spread ? 700 : 400,
                        color: x.spread ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)' }}>{x.spread ? money(x.spread) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <div style={{ ...hint, marginTop: 8, lineHeight: 1.6 }}>
          Grouped on the <b>normalised</b> plan, so every spelling of one plan lands in one row. Grouped on the raw text they would look like
          several tidy plans with no variance at all.
        </div>
      </>
    )
  }

  const maxA = Math.max(...props.map((x) => x.annual), 1)
  return (
    <>{head}
      <Card bodyPad={0}>
        <div style={{ ...scrollX, maxHeight: 'min(70vh, 720px)', overflowY: 'auto' }}>
          <table style={table}>
            <thead><tr>
              <th style={th}>Property</th>
              <th style={{ ...th, textAlign: 'right' }}>Records</th>
              <th style={th}>Has</th>
              <th style={{ ...th, textAlign: 'right' }}>Per month</th>
              <th style={{ ...th, textAlign: 'right' }}>Per year</th>
              {!narrow && <th style={{ ...th, width: '16%' }} aria-label="share" />}
            </tr></thead>
            <tbody>
              {props.map((p) => (
                <tr key={p.pid} onClick={() => onDrill('pid', `PID ${p.pid}`)} style={{ cursor: 'pointer' }}>
                  <td style={td}>
                    <b style={{ fontFamily: MONO, color: 'var(--accent, #c8963e)' }}>{p.pid}</b>
                    {p.name && <span style={{ color: 'var(--text-dim, #9394a8)' }}> · {p.name}</span>}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{p.rows.length}</td>
                  <td style={td}>
                    {[...new Set(p.rows.map((r) => r.utility_type))].map((t) => {
                      const sample = p.rows.find((r) => r.utility_type === t)
                      return <Pill key={t} style={{ marginRight: 4 }}><i style={{ display: 'inline-flex', color: typeColor(sample) }}><UtilityIcon type={t} size={11} /></i>{typeLabel(sample)}</Pill>
                    })}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{money(p.monthly)}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontWeight: 700 }}>{money(p.annual)}</td>
                  {!narrow && <td style={td}><Bar pct={(p.annual / maxA) * 100} color="var(--viz-1)" /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
