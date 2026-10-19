// Data quality — what the book does not say, and what it says twice.
//
// Gaps and contradictions are listed separately because they are different
// problems. A gap is a blank you can fill. A contradiction is two records that
// cannot both be right, and it carries its evidence inline: the spellings, the
// amounts, the properties holding two live records. The point is that the
// evidence is on screen, not that a number is.
import { useMemo, useState } from 'react'
import { typeLabel, typeColor } from '../../utils/propertyUtils'
import { money, coverageOf } from '../../utils/utilitiesModel'
import UtilityIcon from '../UtilityIcon'
import { Card, Pill, Meter, Empty } from './ui'
import { table, th, td, scrollX, lbl, hint, MONO, SANS } from './uiStyles'

export default function UtilitiesQuality({ checks, rows, properties, narrow, onOpen, onSendToRecords }) {
  const [sel, setSel] = useState(checks[0]?.id)
  const check = checks.find((c) => c.id === sel) || checks[0]
  const coverage = useMemo(() => coverageOf(rows, properties), [rows, properties])
  const noWifi = coverage.filter((p) => !p.wifi)
  const noWater = coverage.filter((p) => !p.water)
  const bare = coverage.filter((p) => !p.rows.length)

  if (!checks.length) {
    return <Card><Empty title="Nothing to flag">Every record carries all seven fields and nothing contradicts anything else. That has never happened before — check the filters.</Empty></Card>
  }

  const list = (fam) => checks.filter((c) => c.fam === fam).map((c) => (
    <button key={c.id} onClick={() => setSel(c.id)} aria-pressed={c.id === sel}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
        border: 'none', cursor: 'pointer', fontSize: 12.5, fontFamily: SANS,
        background: c.id === sel ? 'var(--bg-input, #252731)' : 'transparent',
        boxShadow: c.id === sel ? 'inset 0 0 0 1px var(--border, #2e3040)' : 'none',
        color: c.id === sel ? 'var(--text, #e8e8f0)' : 'var(--text-dim, #9394a8)', fontWeight: c.id === sel ? 700 : 400 }}>
      <span style={{ width: 12, flexShrink: 0, color: c.sev === 'bad' ? 'var(--red, #b0645b)' : 'var(--accent, #c8963e)' }}>{c.sev === 'bad' ? '◆' : '◇'}</span>
      <span style={{ minWidth: 0 }}>{c.label}</span>
      <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10.5, color: c.sev === 'bad' ? 'var(--red, #b0645b)' : 'var(--text-muted, #6b6d82)' }}>{c.rows.length}</span>
    </button>
  ))

  const sample = check.rows.slice(0, 60)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 252px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
      <Card title="What to look at" bodyPad={7}>
        <div style={{ ...lbl, padding: '4px 9px 6px' }}>Contradictions — these cannot all be true</div>
        {list('con')}
        <div style={{ ...lbl, padding: '12px 9px 6px' }}>Gaps — these were never filled in</div>
        {list('gap')}
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <Card
          title={check.label}
          right={<>
            <Pill tone={check.sev === 'bad' ? 'bad' : 'warn'}>{check.rows.length} records</Pill>
            <button onClick={() => onSendToRecords(check)} style={{ height: 28, padding: '0 11px', borderRadius: 8, background: 'var(--bg-input, #252731)',
              border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', fontSize: 12, fontFamily: SANS, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Open in Records →
            </button>
          </>}
          bodyPad={0}
        >
          <p style={{ margin: 0, padding: '12px 14px', borderBottom: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', fontSize: 12.5, lineHeight: 1.6, maxWidth: '74ch' }}>
            {check.why}
          </p>

          {check.id === 'c-spell' && check.ev && (
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border, #2e3040)' }}>
              {check.ev.map((e) => (
                <div key={e.head} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5, color: 'var(--text, #e8e8f0)' }}>{e.head}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {e.parts.map(([p, n]) => (
                      <Pill key={p}><b style={{ fontFamily: MONO }}>{p}</b><i style={{ color: 'var(--text-muted, #6b6d82)', fontStyle: 'normal' }}>×{n}</i></Pill>
                    ))}
                  </div>
                </div>
              ))}
              <div style={hint}>Spelled the same way, these become one plan — and only then does “are we all paying the same?” have an answer.</div>
            </div>
          )}

          {check.id === 'c-price' && check.ev && (
            <div style={{ ...scrollX, borderBottom: '1px solid var(--border, #2e3040)' }}>
              <table style={table}>
                <thead><tr>
                  <th style={th}>Provider · plan · cycle</th>
                  <th style={th}>Amounts on the records</th>
                  <th style={{ ...th, textAlign: 'right' }}>Spread</th>
                  <th style={{ ...th, textAlign: 'right' }}>Records</th>
                </tr></thead>
                <tbody>
                  {check.ev.map((e) => (
                    <tr key={e.head}>
                      <td style={td}>{e.head}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {e.parts.map(([a, n]) => (
                            <Pill key={a}><b style={{ fontFamily: MONO }}>{a}</b><i style={{ color: 'var(--text-muted, #6b6d82)', fontStyle: 'normal' }}>×{n}</i></Pill>
                          ))}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: MONO, fontWeight: 700, color: 'var(--accent, #c8963e)' }}>{money(e.spread)}</td>
                      <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{e.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ ...scrollX, maxHeight: 360, overflowY: 'auto' }}>
            <table style={table}>
              <thead><tr>
                <th style={th}>Property</th>
                <th style={th}>Type</th>
                {!narrow && <th style={th}>Provider</th>}
                {!narrow && <th style={th}>Plan</th>}
                <th style={{ ...th, textAlign: 'right' }}>Bill</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Complete</th>
              </tr></thead>
              <tbody>
                {sample.map((r) => (
                  <tr key={r.id} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
                    <td style={td}>
                      <b style={{ fontFamily: MONO, color: 'var(--accent, #c8963e)' }}>{r.pid}</b>
                      {r.prop?.name ? <span style={{ color: 'var(--text-dim, #9394a8)' }}> · {r.prop.name}</span> : <span style={{ color: 'var(--red, #b0645b)' }}> · no property</span>}
                    </td>
                    <td style={td}><Pill><i style={{ display: 'inline-flex', color: typeColor(r) }}><UtilityIcon type={r.utility_type} size={11} /></i>{typeLabel(r)}</Pill></td>
                    {!narrow && <td style={td}>{r.provider || '—'}</td>}
                    {!narrow && <td style={td}>{r.plan_type || <i style={{ color: 'var(--red, #b0645b)' }}>not recorded</i>}</td>}
                    <td style={{ ...td, textAlign: 'right', fontFamily: MONO }}>{Number(r.billing_amount) > 0 ? money(r.billing_amount) : '—'}</td>
                    <td style={td}><Pill tone={r.status === 'active' ? 'ok' : r.status === 'unknown' ? 'warn' : undefined}>{r.status}</Pill></td>
                    <td style={{ ...td, textAlign: 'right' }}><Meter row={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {check.rows.length > sample.length && (
              <div style={{ ...hint, padding: '9px 12px' }}>Showing {sample.length} of {check.rows.length}. The rest are in Records, filtered.</div>
            )}
          </div>
        </Card>

        <Card title="Coverage — what a property has, and has not" right={<span style={hint}>{properties.length} properties</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[['No WiFi record', noWifi], ['No water purifier', noWater], ['No utility at all', bare]].map(([label, arr]) => (
              <div key={label} style={{ background: 'var(--bg-input, #252731)', borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
                <div style={lbl}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, fontFamily: MONO, color: 'var(--text, #e8e8f0)' }}>{arr.length}</div>
                <div style={{ ...hint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {arr.length ? arr.slice(0, 7).map((p) => p.pid).join(' ') + (arr.length > 7 ? ' …' : '') : 'none'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
