// Preview harness for UtilitiesTrends. Not part of the app — it exists so the
// chart can be looked at without a login, which is the last step of the
// dataviz procedure and the one most easily skipped.
import { createRoot } from 'react-dom/client'
import UtilitiesTrends from '../components/UtilitiesTrends'

// Shaped from the real estate: 318 rows / 162 PIDs, wifi+water only, the real
// cycle mix (Yearly 134, Half-yearly 91, Monthly 72…) and the real quarterly
// deployment curve (1, 9, 23, 14, 30, 53, 115, 46).
const QUARTERS = [['2024-10',1],['2025-01',9],['2025-04',23],['2025-07',14],
                  ['2025-10',30],['2026-01',53],['2026-04',115],['2026-07',46]]
const PROVIDERS = { wifi: ['ACT','Airtel','Tata Play Fiber','Jio'], water_purifier: ['DrinkPrime','AquaGuard-LL','Livpure'] }
const PLANS = { wifi: ['200 Mbps mesh','300 Mbps','100 Mbps'], water_purifier: ['500L/M','250L/M','Unlimited'] }
const pick = (a, i) => a[i % a.length]
let id = 0, pid = 0
const rows = []
for (const [start, n] of QUARTERS) {
  const [y, m] = start.split('-').map(Number)
  for (let i = 0; i < n; i++) {
    const wifi = i % 2 === 0
    const type = wifi ? 'wifi' : 'water_purifier'
    const cycle = wifi ? (i % 3 === 0 ? 'Monthly' : 'Half-yearly') : 'Yearly'
    const amount = wifi ? (cycle === 'Monthly' ? 1769 : 7073) : 5088
    rows.push({
      id: 'r' + (++id), pid: String(100 + (pid++ % 162)), status: 'active',
      utility_type: type, start_date: `${y}-${String(m + (i % 3)).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      billing_amount: amount, billing_cycle: cycle,
      provider: pick(PROVIDERS[type], i), plan_type: pick(PLANS[type], i),
    })
  }
}

function App() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
        <span className="pulse-title" style={{ fontSize: 16 }}>utilities · trends</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>preview harness · sample data</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {['dark', 'light'].map(t => (
            <button key={t} className="tct tct-raised" style={{ padding: '7px 12px', fontSize: 12, cursor: 'pointer' }}
              onClick={() => { document.documentElement.dataset.theme = t }}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ padding: '18px 24px 60px', maxWidth: 1180, margin: '0 auto' }}>
        <UtilitiesTrends rows={rows} onOpenPid={(p) => console.log('open', p)} />
      </div>
    </div>
  )
}
document.documentElement.dataset.theme = 'dark'
createRoot(document.getElementById('root')).render(<App />)
