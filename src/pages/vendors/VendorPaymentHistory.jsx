import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../utils/vendorHub'

// What this vendor has actually been paid, month by month.
//
// Rows come from vendor_payouts joined to the payroll period they belong to,
// so a month that is still a draft is labelled as such rather than being
// presented as money that has gone out.

const MONO = 'var(--font-mono, monospace)'
const money = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')

function monthLabel(m) {
  if (!m) return '—'
  const d = new Date(m)
  return isNaN(d) ? String(m) : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function Line({ label, value, strong, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, fontFamily: MONO, fontSize: 11.5 }}>
      <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{label}</span>
      <span style={{ color: color || (strong ? 'var(--text, #e8e8f0)' : 'var(--text-dim, #9394a8)'), fontWeight: strong ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

export default function VendorPaymentHistory({ vendorId }) {
  const [state, setState] = useState({ key: null, rows: [], err: '' })
  const [open, setOpen] = useState(null)
  const loading = state.key !== vendorId

  useEffect(() => {
    let cancelled = false
    supabase
      .from('vendor_payouts')
      .select('*, period:vendor_payroll_periods(period_month, status, locked_at)')
      .eq('vendor_id', vendorId)
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled) return
        const rows = (data || []).sort((a, b) =>
          String(b.period?.period_month || '').localeCompare(String(a.period?.period_month || '')))
        setState({ key: vendorId, rows, err: error ? error.message : '' })
      })
    return () => { cancelled = true }
  }, [vendorId])

  const rows = loading ? [] : state.rows
  const paid = rows.filter(r => r.period?.status === 'final' || r.period?.locked_at)
  const totalPaid = paid.reduce((s, r) => s + Number(r.total_payout || 0), 0)

  if (loading) return <div style={{ padding: '14px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>

  if (state.err) return (
    <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>⚠ Could not load payments</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, marginTop: 3, wordBreak: 'break-word' }}>{state.err}</div>
    </div>
  )

  if (rows.length === 0) return (
    <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
      No payouts yet.<br />They will appear here once a payroll month includes this vendor.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Paid to date</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3, fontFamily: MONO, color: 'var(--accent, #c8963e)', fontVariantNumeric: 'tabular-nums' }}>{money(totalPaid)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>{paid.length} finalised month{paid.length === 1 ? '' : 's'}</div>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Months on payroll</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3, fontFamily: MONO, color: 'var(--text, #e8e8f0)', fontVariantNumeric: 'tabular-nums' }}>{rows.length}</div>
          {rows.length > paid.length && (
            <div style={{ fontSize: 10, color: 'var(--accent, #c8963e)', fontFamily: MONO, marginTop: 1 }}>{rows.length - paid.length} still draft</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map(r => {
          const isOpen = open === r.id
          const isDraft = !(r.period?.status === 'final' || r.period?.locked_at)
          return (
            <div key={r.id} style={{ borderTop: '1px solid var(--border, #2e3040)' }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : r.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 2px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 44 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: MONO, minWidth: 110 }}>{monthLabel(r.period?.period_month)}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                  {r.days_worked != null ? `${r.days_worked}d` : '—'}{r.ot_days ? ` · ${r.ot_days} OT` : ''}
                </span>
                {isDraft && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>draft</span>}
                <span style={{ fontSize: 12.5, fontWeight: 700, color: isDraft ? 'var(--text-dim, #9394a8)' : 'var(--accent, #c8963e)', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{money(r.total_payout)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
              </button>

              {isOpen && (
                <div style={{ padding: '2px 2px 12px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Line label="Fixed pay" value={money(r.fixed_pay)} />
                  {Number(r.allowance) > 0 && <Line label="Allowance" value={money(r.allowance)} />}
                  {Number(r.ot_amount) > 0 && <Line label={`Overtime${r.ot_days ? ` · ${r.ot_days}d` : ''}`} value={money(r.ot_amount)} />}
                  {Number(r.advance_given) > 0 && <Line label="Advance given" value={money(r.advance_given)} color="var(--accent, #c8963e)" />}
                  {Number(r.advance_recovered) > 0 && <Line label="Advance recovered" value={'− ' + money(r.advance_recovered)} color="var(--red, #e05c6a)" />}
                  <Line label="Total payout" value={money(r.total_payout)} strong />
                  {r.utr && <Line label="UTR" value={r.utr} />}
                  {r.period?.locked_at && <Line label="Finalised" value={fmtDate(r.period.locked_at)} />}
                  {r.comments && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5, marginTop: 2 }}>{r.comments}</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
