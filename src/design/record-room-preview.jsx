// Preview harness for the utilities record room. Not part of the app — it
// exists so the four views and the record sheet can be looked at, clicked and
// resized without a login, which is the step most easily skipped.
//
// The fixture is shaped from the live table: 318 rows over 162 PIDs, the real
// provider/plan/cycle/amount combinations (including the four spellings of
// ACT's 200-mesh plan and the ₹7,073 / ₹7,257 disagreement), the real month
// histogram of start dates, and the real rates of missing invoice links,
// plans and account numbers.
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import UtilitiesExplore from '../components/utilities/UtilitiesExplore'
import UtilitiesRecords from '../components/utilities/UtilitiesRecords'
import UtilitiesQuality from '../components/utilities/UtilitiesQuality'
import UtilitiesCompare from '../components/utilities/UtilitiesCompare'
import UtilityRecordSheet from '../components/utilities/UtilityRecordSheet'
import { DIMS, buildChecks } from '../utils/utilitiesModel'
import { LIVE_STATUSES } from '../utils/propertyUtils'

let seed = 20260415
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = (a) => a[Math.floor(rnd() * a.length)]
const chance = (p) => rnd() < p

const SPECS = [
  ['water_purifier', 'DrinkPrime', [null], 'Yearly', [5088], 107, 0, 0.28],
  ['wifi', 'ACT', ['200 Mbps mesh', '200 mbps mesh', '200 Mbps Mesh', '200mbps'], 'Half-yearly', [7073, 7073, 7073, 7257], 78, 0.8, 0.95],
  ['wifi', 'ACT', ['300 mbps'], 'Monthly', [1769], 59, 0.51, 1],
  ['wifi', 'ACT', ['400 mbps'], 'Half-yearly', [8850, 8850, 9350], 8, 0.13, 1],
  ['wifi', 'Airtel', ['100 mbps', '100 Mbps'], 'Bi-monthly', [1500, 1500, 1500, 2500], 9, 0, 1],
  ['water_purifier', 'AquaGuard-LL', [null], null, [0], 7, 0, 0],
  ['water_purifier', 'DrinkPrime', [null, '250L/M'], 'Monthly', [885], 6, 0, 0.6],
  ['wifi', 'Airtel', ['100 mbps', '100mbps', '100 mbps + mesh'], 'Quarterly', [2828, 2828, 3828], 6, 0.4, 1],
  ['water_purifier', 'DrinkPrime', ['Unlimited', '250L/M'], 'Yearly', [6289, 5088], 5, 0, 0.3],
  ['wifi', 'Tata Play Fiber', ['100 mbps'], 'Yearly', [9912], 3, 1, 1],
  ['wifi', 'ACT', [null], 'Monthly', [1769, 2875], 4, 0, 0.7],
  ['wifi', 'JioFiber', ['150 mbps'], 'Quarterly', [2497], 3, 0.6, 1],
  ['other', 'BESCOM', ['Common area meter'], 'Monthly', [1240, 980, 1610], 3, 0, 0.6],
  ['other', 'BWSSB', ['Water connection'], 'Monthly', [820, 640], 2, 0, 0.5],
  ['other', 'Piped gas', ['Domestic PNG'], 'Bi-monthly', [1150], 2, 0, 1],
  ['wifi', 'Hathway', ['100 mbps'], 'Half-yearly', [5400], 1, 0, 1],
]
const MONTHS = { '2024-10': 1, '2025-03': 9, '2025-04': 11, '2025-05': 10, '2025-06': 3, '2025-07': 10, '2025-09': 4, '2025-10': 11, '2025-11': 10, '2025-12': 16, '2026-01': 22, '2026-02': 19, '2026-03': 18, '2026-04': 30, '2026-05': 39, '2026-06': 48, '2026-07': 37, '2026-08': 4, '2026-09': 5 }
const MONTH_POOL = Object.entries(MONTHS).flatMap(([m, n]) => Array(n).fill(m))
const N1 = ['Sai', 'Sri', 'Lakshmi', 'Nakshatra', 'Gokul', 'Amrutha', 'Vaishnavi', 'Divya', 'Shanthi', 'Royal', 'Green', 'Sunrise', 'Pavithra', 'Harmony', 'Lotus']
const N2 = ['Residency', 'Nivas', 'Enclave', 'Comforts', 'Nest', 'Heights', 'Apartments', 'Villa', 'Mansion', 'Court']
const LOC = ['Koramangala', 'HSR Layout', 'Bellandur', 'Marathahalli', 'Whitefield', 'Indiranagar', 'BTM Layout', 'Sarjapur Road', 'Hebbal', 'Hoodi']

const PROPS = Array.from({ length: 162 }, (_, i) => ({
  pid: String(101 + i + (i > 80 ? 14 : 0)), name: `${pick(N1)} ${pick(N2)}`, address: pick(LOC), deleted_at: null,
}))
const quota = PROPS.map((_, i) => (i < 17 ? 1 : i < 152 ? 2 : i < 161 ? 3 : 4))
const cap = Object.fromEntries(PROPS.map((p, i) => [p.pid, quota[i]]))
const pids = PROPS.map((p) => p.pid)

const pool = []
for (const [t, provider, plans, cycle, amts, n, inv, acc] of SPECS) {
  for (let i = 0; i < n; i++) {
    pool.push({ t, provider, plan: plans[i % plans.length], cycle, amount: amts[i % amts.length], hasInv: chance(inv), hasAcc: chance(acc) })
  }
}
const taken = {}, assign = new Array(pool.length)
const order = pool.map((_, i) => i)
for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[order[i], order[j]] = [order[j], order[i]] }
for (const i of order) {
  const r = pool[i], key = r.t + '|' + r.provider
  let clean = null, any = null
  for (let k = 0; k < 220 && !clean; k++) {
    const pid = pids[Math.floor(rnd() * pids.length)]
    if (cap[pid] <= 0) continue
    if (any === null) any = pid
    if (!taken[pid] || !taken[pid].has(key)) clean = pid
  }
  const pid = clean || any || pids.find((x) => cap[x] > 0)
  cap[pid]--; (taken[pid] = taken[pid] || new Set()).add(key)
  assign[i] = pid
}

const pmap = Object.fromEntries(PROPS.map((p) => [p.pid, p]))
let uid = 0
const ROWS = pool.map((r, i) => {
  const pid = assign[i]
  const start = `${pick(MONTH_POOL)}-${String(1 + Math.floor(rnd() * 27)).padStart(2, '0')}`
  return {
    id: 'u' + (++uid), pid, utility_type: r.t, custom_type: null, provider: r.provider,
    plan_type: r.plan, account_number: r.hasAcc ? String(Math.floor(rnd() * 9e9 + 1e9)) : null,
    start_date: start, billing_amount: r.amount || null, billing_cycle: r.cycle,
    status: 'active', notes: chance(0.05) ? 'Router sits in the lobby cupboard.' : null,
    created_by: 'utility@flent.in', created_at: start, updated_at: chance(0.3) ? '2026-06-01' : start,
    added_cost: chance(0.21) ? pick([500, 1000, 1500]) : 0, period_label: null,
    ssid: r.t === 'wifi' && chance(0.72) ? `Flent_${pid}` : null,
    wifi_password: r.t === 'wifi' && chance(0.66) ? 'flent@1234' : null,
    password: r.t === 'wifi' && chance(0.68) ? 'acct@1234' : null,
    lockbox_code: chance(0.58) ? '4417' : null,
    invoice_link: r.hasInv ? `https://drive.flent.in/inv/${pid}-${uid}.pdf` : null,
    payment_mode: chance(0.11) ? pick(['Postpaid', 'Kotak-5655']) : null,
    duration_raw: null, source: chance(0.98) ? 'utility_log_import' : null, last_recharged_on: null,
    prop: pmap[pid] || null, due: null, bucket: 'none',
  }
})
// the 15 superseded predecessors, and the 11 rows nobody ever gave a status
let chained = 0
for (const r of [...ROWS]) {
  if (chained >= 15 || r.utility_type !== 'wifi' || !chance(0.14)) continue
  const oldPlan = pick(['100 mbps', '150 mbps', '200 mbps'])
  ROWS.push({ ...r, id: 'u' + (++uid), plan_type: oldPlan, status: 'superseded',
    provider: chance(0.4) ? pick(['Airtel', 'Hathway']) : r.provider,
    billing_amount: Math.round((r.billing_amount || 2000) * 0.72 / 10) * 10,
    start_date: `2025-0${1 + Math.floor(rnd() * 8)}-14`, invoice_link: null, notes: 'Replaced — see the live record.' })
  chained++
}
for (let i = 0; i < 11; i++) ROWS[Math.floor(rnd() * ROWS.length)].status = 'unknown'

function App() {
  const [tab, setTab] = useState('explore')
  const [filters, setFilters] = useState([])
  const [pinned, setPinned] = useState(null)
  const [incRetired, setIncRetired] = useState(false)
  const [openRow, setOpenRow] = useState(null)
  const [narrow, setNarrow] = useState(false)

  const inScope = useMemo(() => (incRetired ? ROWS : ROWS.filter((r) => LIVE_STATUSES.has(r.status))), [incRetired])
  const scoped = useMemo(() => {
    let out = inScope
    if (pinned) { const ids = new Set(pinned.rows.map((r) => r.id)); out = out.filter((r) => ids.has(r.id)) }
    for (const f of filters) out = out.filter((r) => DIMS[f.dim].of(r) === f.val)
    return out
  }, [inScope, filters, pinned])
  const checks = useMemo(() => buildChecks(inScope), [inScope])
  const addFilter = (dim, val) => setFilters((f) => (f.some((x) => x.dim === dim && x.val === val) ? f : [...f, { dim, val }]))

  const btn = { padding: '7px 12px', fontSize: 12, cursor: 'pointer' }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span className="pulse-title" style={{ fontSize: 15 }}>utilities · record room</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>preview harness · fixture shaped from the live table</span>
        <span style={{ flex: 1 }} />
        {['explore', 'records', 'quality', 'compare'].map((t) => (
          <button key={t} className={`tct tct-bare${tab === t ? ' is-on' : ''}`} style={btn} onClick={() => setTab(t)}>{t}</button>
        ))}
        <button className="tct tct-raised" style={btn} onClick={() => setIncRetired((v) => !v)}>retired: {incRetired ? 'in' : 'out'}</button>
        <button className="tct tct-raised" style={btn} onClick={() => setNarrow((v) => !v)}>{narrow ? 'wide' : 'narrow'}</button>
        {['dark', 'light'].map((t) => (
          <button key={t} className="tct tct-raised" style={btn} onClick={() => { document.documentElement.dataset.theme = t }}>{t}</button>
        ))}
      </div>
      <div style={{ padding: '16px 20px 60px', maxWidth: narrow ? 420 : 1520, margin: '0 auto' }}>
        {filters.length > 0 && (
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-dim)' }}>
            {filters.map((f) => `${DIMS[f.dim].label}: ${f.val}`).join(' · ')}
            {' '}<button onClick={() => { setFilters([]); setPinned(null) }} style={{ ...btn, background: 'none', border: 'none', color: 'var(--accent)', textDecoration: 'underline' }}>clear</button>
          </div>
        )}
        {tab === 'explore' && <UtilitiesExplore rows={scoped} allRows={inScope} propertyCount={PROPS.length} narrow={narrow} onDrill={addFilter} onDrill2={(a, b, c, d) => { addFilter(a, b); addFilter(c, d) }} />}
        {tab === 'records' && <UtilitiesRecords rows={scoped} narrow={narrow} phone={narrow} scopeNote={pinned ? pinned.label : 'the whole book'} onOpen={setOpenRow} onExport={(s) => console.log('export', s.length)} />}
        {tab === 'quality' && <UtilitiesQuality checks={checks} rows={inScope} properties={PROPS} narrow={narrow} onOpen={setOpenRow} onSendToRecords={(c) => { setPinned({ label: c.label, rows: c.rows }); setTab('records') }} />}
        {tab === 'compare' && <UtilitiesCompare rows={scoped} properties={PROPS} narrow={narrow} onDrill={addFilter} />}
      </div>
      {openRow && <UtilityRecordSheet key={openRow.id} row={openRow} allRows={ROWS} phone={narrow} onClose={() => setOpenRow(null)} onOpen={setOpenRow} onGoToProperty={(p) => console.log('open pid', p)} />}
    </div>
  )
}
console.log(`[preview] ${ROWS.length} rows · ${PROPS.length} properties`)
buildChecks(ROWS.filter((r) => LIVE_STATUSES.has(r.status))).forEach((c) => console.log(`  ${c.fam === 'con' ? '✖' : '·'} ${c.label}: ${c.rows.length}`))
createRoot(document.getElementById('root')).render(<App />)
