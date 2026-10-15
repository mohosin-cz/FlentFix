// Preview harness for the payment sheet. Not part of the app — it exists so
// the itemiser can be typed into, resized and looked at in both themes without
// a login. Saving hits Supabase and will fail here; everything up to the save
// button is the real component.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import PaymentSheet from '../components/property/PaymentSheet'
import { lineAmount, itemsTotal, splitOf, itemSummary, inr, fmtQty } from '../utils/payments'

const PAYEES = [
  { id: 'p1', name: 'Sri Balaji Hardware', trade: 'Civil / masonry' },
  { id: 'p2', name: 'Kumar Electricals', trade: 'Electrician' },
  { id: 'p3', name: 'Ravi Carpentry Works', trade: 'Carpenter' },
  { id: 'p4', name: 'Chennai Tiles & Sanitary', trade: 'Plumber' },
]

// An itemised payment, as it comes back out of the table — so "edit" can be
// checked for the thing that matters: that the lines are still there.
const EXISTING = {
  id: 'pay-1', pid: '228', kind: 'Both', trade: 'Plumber',
  description: 'Bathroom fit-out — second floor',
  amount: 18600, material_cost: 14600, labour_cost: 4000,
  payee_id: 'p4', payee_name: 'Chennai Tiles & Sanitary',
  paid_on: '2026-10-02', method: 'UPI', reference: 'INV-4471', note: null,
  property_payment_bills: [],
  property_payment_items: [
    { id: 'i1', position: 0, description: 'Wall tiles 600×600', quantity: 48, unit: 'box', unit_rate: 240, amount: 11520, kind: 'Material' },
    { id: 'i2', position: 1, description: 'CP fittings set', quantity: 2, unit: 'set', unit_rate: 1540, amount: 3080, kind: 'Material' },
    { id: 'i3', position: 2, description: 'Plumber, two days', quantity: 2, unit: 'day', unit_rate: 2000, amount: 4000, kind: 'Labour' },
  ],
}

// The card markup from PropertyPayments, kept in step so the list side of the
// change can be eyeballed next to the form that produces it.
function Card({ row }) {
  const MONO = 'var(--font-mono, monospace)'
  const items = (row.property_payment_items || []).slice().sort((a, b) => a.position - b.position)
  const sum = items.reduce((n, it) => n + Number(it.amount || 0), 0)
  const drift = Math.round((Number(row.amount || 0) - sum) * 100) / 100
  const chip = itemSummary(items)
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 11, padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>{row.description}</span>
        <span style={{ fontSize: 15, fontWeight: 700, fontFamily: MONO }}>{inr(row.amount)}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(200,150,62,0.35)', background: 'rgba(200,150,62,0.08)', borderRadius: 6, padding: '2px 7px', fontFamily: MONO }}>{row.trade}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px', fontFamily: MONO }}>{row.kind}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{row.payee_name}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: MONO }}>2 Oct</span>
        {chip && <span style={{ fontSize: 10.5, color: 'var(--text-dim)', fontFamily: MONO, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px' }}>{chip}</span>}
      </div>
      {items.length > 1 && (
        <div style={{ marginTop: 9, borderTop: '1px solid var(--border)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {items.map(it => (
            <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 11.5 }}>
              <span style={{ flex: 1, minWidth: 0, color: 'var(--text-dim)' }}>
                {it.description}
                {it.kind && <span style={{ color: 'var(--text-muted)', fontFamily: MONO }}> · {it.kind === 'Material' ? 'mat' : 'lab'}</span>}
              </span>
              <span style={{ color: 'var(--text-muted)', fontFamily: MONO, flexShrink: 0 }}>
                {fmtQty(it.quantity)}{it.unit ? ` ${it.unit}` : ''} × {inr(it.unit_rate)}
              </span>
              <span style={{ fontFamily: MONO, flexShrink: 0 }}>{inr(it.amount)}</span>
            </div>
          ))}
          {Math.abs(drift) >= 0.5 && (
            <div style={{ fontSize: 10.5, color: 'var(--accent)', fontFamily: MONO, marginTop: 2 }}>
              lines come to {inr(sum)} · {inr(Math.abs(drift))} {drift < 0 ? 'less' : 'more'} was charged
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function App() {
  const [sheet, setSheet] = useState(null)
  const btn = { padding: '8px 13px', fontSize: 12.5, cursor: 'pointer' }
  const sp = splitOf(EXISTING)
  const discounted = { ...EXISTING, amount: 18000 }
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <span className="pulse-title" style={{ fontSize: 15 }}>payments · sheet</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>preview harness · saving is not wired up</span>
        <span style={{ flex: 1 }} />
        <button className="tct tct-raised" style={btn} onClick={() => setSheet({})}>new payment</button>
        <button className="tct tct-raised" style={btn} onClick={() => setSheet({ editing: EXISTING })}>edit an itemised one</button>
        {['dark', 'light'].map(t => (
          <button key={t} className="tct tct-raised" style={btn} onClick={() => { document.documentElement.dataset.theme = t }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: '18px 20px 60px', maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', lineHeight: 1.7 }}>
          lines total {inr(itemsTotal(EXISTING.property_payment_items.map(i => ({ ...i, quantity: String(i.quantity), unit_rate: String(i.unit_rate) }))))} ·
          first line {inr(lineAmount({ quantity: '48', unit_rate: '240' }))} ·
          split {inr(sp.material)} material / {inr(sp.labour)} labour / {inr(sp.unsplit)} unsplit
        </div>
        <Card row={EXISTING} />
        <Card row={discounted} />
        <Card row={{ ...EXISTING, description: 'Door handles', amount: 5400, kind: 'Material', trade: 'Carpenter',
          property_payment_items: [{ id: 's1', position: 0, description: 'Door handles', quantity: 12, unit: 'pcs', unit_rate: 450, amount: 5400, kind: null }] }} />
        <Card row={{ ...EXISTING, description: 'Site cleaning', amount: 2000, kind: 'Labour', trade: 'Cleaner', property_payment_items: [] }} />
      </div>

      {sheet && (
        <PaymentSheet pid="228" payees={PAYEES} editing={sheet.editing}
          recentTrades={['Plumber', 'Electrician', 'Carpenter']}
          onClose={() => setSheet(null)}
          onSaved={() => console.log('[preview] saved')}
          onPayeeCreated={(p) => console.log('[preview] payee', p)} />
      )}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
