// Explore — group the book by any dimension, measure it any way, drill into
// anything. The answer to "what do we actually have" is never one number, so
// this is a pivot rather than a dashboard: the group-by and the measure are
// both the user's choice, and every label is a filter.
import { useMemo, useState } from 'react'
import { DIMS, MEASURES, seriesOf, monthlyOf, annualOf, moneyShort, completeness, CORE_FIELDS } from '../../utils/utilitiesModel'
import { TimeChart, SpreadChart } from './UtilCharts'
import { Card, Select, Seg, Bar, Swatch, Drill, Empty } from './ui'
import { table, th, td, scrollX, lbl, hint, MONO } from './uiStyles'

const dimOptions = (withNone) => (withNone ? [{ k: 'none', label: '— nothing —' }] : [])
  .concat(Object.entries(DIMS).map(([k, d]) => ({ k, label: d.label })))
const measOptions = Object.entries(MEASURES).map(([k, m]) => ({ k, label: m.label }))

function Kpi({ k, v, s }) {
  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: '11px 13px', minWidth: 0 }}>
      <div style={lbl}>{k}</div>
      <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 5, fontFamily: MONO, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', marginTop: 2 }}>{s}</div>
    </div>
  )
}

export default function UtilitiesExplore({ rows, allRows, propertyCount, narrow, onDrill, onDrill2 }) {
  const [group, setGroup] = useState('provider')
  const [group2, setGroup2] = useState('none')
  const [measure, setMeasure] = useState('monthly')
  const [grain, setGrain] = useState('month')
  const [open, setOpen] = useState({})

  const ser = useMemo(() => seriesOf(rows, group, measure, 12), [rows, group, measure])
  const meas = MEASURES[measure]
  const total = meas.of(rows) || 1
  const maxV = Math.max(...ser.map((s) => s.val), 1)
  const complete = rows.filter((r) => completeness(r) === CORE_FIELDS.length).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Kpi k="Records" v={rows.length.toLocaleString('en-IN')} s={rows.length === allRows.length ? 'the whole book' : `of ${allRows.length} · filtered`} />
        <Kpi k="Properties" v={new Set(rows.map((r) => r.pid)).size} s={`of ${propertyCount} on the books`} />
        <Kpi k="Monthly run-rate" v={moneyShort(rows.reduce((a, r) => a + monthlyOf(r), 0))} s="every bill reduced to a month" />
        <Kpi k="Annualised" v={moneyShort(rows.reduce((a, r) => a + annualOf(r), 0))} s="what a full year costs" />
        <Kpi k="Fully recorded" v={rows.length ? Math.round((complete / rows.length) * 100) + '%' : '—'} s={`${complete} of ${rows.length} have all ${CORE_FIELDS.length} fields`} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={lbl}>Group by</span>
        <Select value={group} onChange={(v) => { setGroup(v); setOpen({}) }} options={dimOptions(false)} />
        <span style={lbl}>then</span>
        <Select value={group2} onChange={setGroup2} options={dimOptions(true)} />
        <span style={{ ...lbl, marginLeft: narrow ? 0 : 6 }}>Measured by</span>
        <Select value={measure} onChange={setMeasure} options={measOptions} />
        {!narrow && <><span style={{ flex: 1 }} /><span style={hint}>Click any name to filter everything by it.</span></>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        <Card
          title={`${DIMS[group].label} — by ${meas.label.toLowerCase()}`}
          right={<span style={hint}>{ser.length} group{ser.length === 1 ? '' : 's'} · {meas.fmt(total)} {meas.unit}</span>}
          bodyPad={0}
        >
          <div style={scrollX}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 1 }} aria-label="expand" />
                  <th style={th}>{DIMS[group].label}</th>
                  {!narrow && <th style={{ ...th, width: '32%' }} aria-label="share" />}
                  <th style={{ ...th, textAlign: 'right' }}>{meas.label}</th>
                  <th style={{ ...th, textAlign: 'right' }}>Share</th>
                  {!narrow && <th style={{ ...th, textAlign: 'right' }}>Records</th>}
                  {!narrow && <th style={{ ...th, textAlign: 'right' }}>Props</th>}
                </tr>
              </thead>
              <tbody>
                {ser.length === 0 && (
                  <tr><td colSpan={7} style={{ ...td, borderBottom: 'none' }}><Empty title="Nothing matches">Loosen a filter above.</Empty></td></tr>
                )}
                {ser.map((s) => {
                  const expanded = !!open[s.key]
                  const sub = group2 !== 'none' && expanded ? seriesOf(s.rows, group2, measure, 8) : []
                  const subMax = Math.max(...sub.map((x) => x.val), 1)
                  return [
                    <tr key={s.key} onClick={() => group2 !== 'none' && setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}
                      style={{ cursor: group2 !== 'none' ? 'pointer' : 'default' }}>
                      <td style={{ ...td, color: 'var(--text-muted, #6b6d82)', paddingRight: 0 }}>{group2 !== 'none' ? (expanded ? '▾' : '▸') : ''}</td>
                      <td style={td}>
                        <Swatch color={s.color} style={{ marginRight: 7, verticalAlign: -1 }} />
                        <Drill onClick={(e) => { e.stopPropagation(); onDrill(group, s.key) }}>{s.key}</Drill>
                      </td>
                      {!narrow && <td style={td}><Bar pct={(s.val / maxV) * 100} color={s.color} /></td>}
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontFamily: MONO }}>{meas.fmt(s.val)}</td>
                      <td style={{ ...td, textAlign: 'right', color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{((s.val / total) * 100).toFixed(1)}%</td>
                      {!narrow && <td style={{ ...td, textAlign: 'right', color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{s.rows.length}</td>}
                      {!narrow && <td style={{ ...td, textAlign: 'right', color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{new Set(s.rows.map((r) => r.pid)).size}</td>}
                    </tr>,
                    ...sub.map((x) => (
                      <tr key={s.key + '|' + x.key} style={{ background: 'var(--bg-sunken, #14151c)' }}>
                        <td style={td} />
                        <td style={{ ...td, paddingLeft: 22, color: 'var(--text-dim, #9394a8)' }}>
                          <Drill onClick={() => onDrill2(group, s.key, group2, x.key)}>{x.key}</Drill>
                        </td>
                        {!narrow && <td style={td}><Bar pct={(x.val / subMax) * 100} color={s.color} height={7} /></td>}
                        <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{meas.fmt(x.val)}</td>
                        <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{((x.val / (s.val || 1)) * 100).toFixed(0)}%</td>
                        {!narrow && <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{x.rows.length}</td>}
                        {!narrow && <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{new Set(x.rows.map((r) => r.pid)).size}</td>}
                      </tr>
                    )),
                  ]
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <Card title="When these were installed"
            right={<Seg value={grain} onChange={setGrain} options={[{ k: 'month', label: 'Month' }, { k: 'quarter', label: 'Quarter' }, { k: 'year', label: 'Year' }]} />}>
            <TimeChart rows={rows} dimKey={group} measureKey={measure} grain={grain} />
          </Card>
          <Card title="What one connection costs a month" right={<span style={hint}>by {DIMS[group].label.toLowerCase()}</span>}>
            <SpreadChart rows={rows} dimKey={group} />
          </Card>
        </div>
      </div>
    </div>
  )
}
