// Records — the book itself. Every column the table holds, sortable, with a
// completeness meter per row so a thin record is visible before you open it.
import { useMemo, useState } from 'react'
import { typeLabel, typeColor, fmtDate, CYCLE_MONTHS } from '../../utils/propertyUtils'
import { monthlyOf, annualOf, money, completeness, canonPlan } from '../../utils/utilitiesModel'
import UtilityIcon from '../UtilityIcon'
import { Card, Pill, Meter, Empty } from './ui'
import { table, th, td, scrollX, hint, MONO, SANS } from './uiStyles'

const missing = (text = '—') => <i style={{ color: 'var(--red, #b0645b)', fontStyle: 'italic' }}>{text}</i>
const dim = (v) => <span style={{ color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{v}</span>

const COLUMNS = {
  pid: {
    label: 'Property', sort: (r) => Number(r.pid),
    cell: (r) => (
      <div style={{ minWidth: 148 }}>
        <b style={{ fontFamily: MONO, color: 'var(--accent, #c8963e)' }}>{r.pid}</b>
        {r.prop?.name ? <span style={{ color: 'var(--text-dim, #9394a8)' }}> · {r.prop.name}</span> : <span style={{ color: 'var(--red, #b0645b)' }}> · no property record</span>}
      </div>
    ),
  },
  type: { label: 'Type', sort: (r) => typeLabel(r), cell: (r) => <Pill><i style={{ display: 'inline-flex', color: typeColor(r) }}><UtilityIcon type={r.utility_type} size={11} /></i>{typeLabel(r)}</Pill> },
  provider: { label: 'Provider', sort: (r) => r.provider || '', cell: (r) => r.provider || missing('not recorded') },
  plan: { label: 'Plan', sort: (r) => r.plan_type || '', cell: (r) => r.plan_type || missing('not recorded') },
  planCanon: { label: 'Plan · normalised', sort: (r) => canonPlan(r.plan_type) || '', cell: (r) => dim(canonPlan(r.plan_type) || '—') },
  cycle: { label: 'Cycle', sort: (r) => CYCLE_MONTHS[r.billing_cycle] || 99, cell: (r) => r.billing_cycle || missing() },
  amount: { label: 'Bill', right: true, sort: (r) => Number(r.billing_amount || 0), cell: (r) => (Number(r.billing_amount) > 0 ? <span style={{ fontFamily: MONO }}>{money(r.billing_amount)}</span> : missing()) },
  monthly: { label: 'Per month', right: true, sort: monthlyOf, cell: (r) => (monthlyOf(r) ? <span style={{ fontFamily: MONO }}>{money(monthlyOf(r))}</span> : dim('—')) },
  annual: { label: 'Per year', right: true, sort: annualOf, cell: (r) => (annualOf(r) ? <span style={{ fontFamily: MONO }}>{money(annualOf(r))}</span> : dim('—')) },
  addedCost: { label: 'One-off', right: true, sort: (r) => Number(r.added_cost || 0), cell: (r) => (Number(r.added_cost) ? <span style={{ fontFamily: MONO }}>{money(r.added_cost)}</span> : dim('—')) },
  start: { label: 'Started', sort: (r) => r.start_date || '', cell: (r) => (r.start_date ? dim(fmtDate(r.start_date)) : missing()) },
  account: { label: 'Account', sort: (r) => r.account_number || '', cell: (r) => (r.account_number ? dim(r.account_number) : missing()) },
  invoice: { label: 'Invoice', sort: (r) => (r.invoice_link ? 1 : 0), cell: (r) => (r.invoice_link ? <Pill tone="ok">on file</Pill> : <Pill tone="warn">none</Pill>) },
  payMode: { label: 'Payment mode', sort: (r) => r.payment_mode || '', cell: (r) => r.payment_mode || dim('—') },
  source: { label: 'Source', sort: (r) => r.source || '', cell: (r) => dim(r.source || '—') },
  ssid: { label: 'SSID', sort: (r) => r.ssid || '', cell: (r) => (r.ssid ? dim(r.ssid) : dim('—')) },
  updated: { label: 'Updated', sort: (r) => r.updated_at || '', cell: (r) => dim(fmtDate(r.updated_at)) },
  status: {
    label: 'Status', sort: (r) => r.status || '',
    cell: (r) => <Pill tone={r.status === 'active' ? 'ok' : r.status === 'unknown' ? 'warn' : r.status === 'cancelled' ? 'bad' : undefined}>{r.status || 'unknown'}</Pill>,
  },
  complete: { label: 'Complete', right: true, sort: completeness, cell: (r) => <Meter row={r} /> },
}
const DEFAULT_COLS = ['pid', 'type', 'provider', 'plan', 'cycle', 'amount', 'monthly', 'start', 'status', 'complete']
const PHONE_COLS = ['pid', 'type', 'provider', 'amount', 'complete']

export default function UtilitiesRecords({ rows, scopeNote, narrow, phone, onOpen, onExport }) {
  const [sort, setSort] = useState({ col: 'pid', dir: 1 })
  const [cols, setCols] = useState(phone ? PHONE_COLS : DEFAULT_COLS)
  const [picker, setPicker] = useState(false)

  const sorted = useMemo(() => {
    const f = COLUMNS[sort.col]?.sort
    if (!f) return rows
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b)
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir
    })
  }, [rows, sort])

  const toggleCol = (k) => setCols((c) => (c.includes(k) ? c.filter((x) => x !== k) : Object.keys(COLUMNS).filter((x) => c.includes(x) || x === k)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text, #e8e8f0)' }}>
          {rows.length.toLocaleString('en-IN')} record{rows.length === 1 ? '' : 's'}
        </h2>
        <span style={hint}>{scopeNote}</span>
        <span style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPicker((p) => !p)} style={btn}>Columns</button>
          {picker && (
            <div style={{ position: 'absolute', right: 0, top: 34, zIndex: 30, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)',
              borderRadius: 10, boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,.5))', padding: 5, maxHeight: 300, overflowY: 'auto' }}>
              {Object.entries(COLUMNS).map(([k, c]) => (
                <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 9px', fontSize: 12, whiteSpace: 'nowrap', cursor: 'pointer', color: 'var(--text, #e8e8f0)' }}>
                  <input type="checkbox" checked={cols.includes(k)} onChange={() => toggleCol(k)} />{c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => onExport(sorted)} style={btn}>Export CSV</button>
      </div>

      <Card bodyPad={0}>
        <div style={{ ...scrollX, maxHeight: 'min(70vh, 720px)', overflowY: 'auto' }}>
          <table style={table}>
            <thead>
              <tr>
                {cols.map((k) => (
                  <th key={k} style={{ ...th, textAlign: COLUMNS[k].right ? 'right' : 'left', cursor: 'pointer' }}
                    onClick={() => setSort((s) => ({ col: k, dir: s.col === k ? -s.dir : 1 }))}>
                    {COLUMNS[k].label}{sort.col === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={cols.length} style={{ ...td, borderBottom: 'none' }}>
                  <Empty title="No record matches">Clear a filter, or search for a PID, provider, plan or account number.</Empty>
                </td></tr>
              ) : sorted.map((r) => (
                <tr key={r.id} onClick={() => onOpen(r)} style={{ cursor: 'pointer' }}>
                  {cols.map((k) => (
                    <td key={k} style={{ ...td, textAlign: COLUMNS[k].right ? 'right' : 'left' }}>{COLUMNS[k].cell(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {narrow && <div style={hint}>Scroll the table sideways for the rest of the columns, or tap a row to read the record whole.</div>}
    </div>
  )
}

const btn = {
  height: 30, padding: '0 11px', borderRadius: 8, background: 'var(--bg-input, #252731)',
  border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)',
  fontSize: 12, fontFamily: SANS, cursor: 'pointer', whiteSpace: 'nowrap',
}
