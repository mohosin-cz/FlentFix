import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { initials, avatarColor } from '../../utils/vendorHub'

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const monthLabel = (d) => d ? new Date(d).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : ''
const avatarUrl = (p) => { if (!p) return null; try { return supabase.storage.from('vendor-avatars').getPublicUrl(p).data.publicUrl } catch { return null } }
// Pro-rated on a 30-day month. per-day = salary/30; earned = per-day × days
// worked (blank ⇒ full 30); OT = per-day × OT days (1 OT day = 1 day's pay).
const perDayOf = (f) => Number(f.fixed_pay || 0) / 30
const daysWorkedOf = (f) => (f.days_worked === '' || f.days_worked == null) ? 30 : Number(f.days_worked)
const earnedOf = (f) => Math.round(perDayOf(f) * daysWorkedOf(f))
const otAmtOf = (f) => Math.round(perDayOf(f) * Number(f.ot_days || 0))
const totalOf = (f) => earnedOf(f) + Number(f.allowance || 0) + otAmtOf(f) - Number(f.advance_recovered || 0)

const CSV_COLS = ['beneficiary_name', 'team', 'cost_centre', 'fixed_pay', 'allowance', 'days_worked', 'ot_days', 'ot_amount', 'advance_given', 'advance_recovered', 'total_payout', 'upi_id', 'bank_account_name', 'bank_account_no', 'bank_ifsc', 'utr']
function downloadCsv(period, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [CSV_COLS.join(','), ...rows.map(r => CSV_COLS.map(c => esc(r[c])).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url; a.download = `payroll-${monthLabel(period.period_month).replace(/\s+/g, '-')}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
}
const actBtn = { padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)' }

function Ava({ name, path, size = 34 }) {
  const url = avatarUrl(path)
  return url
    ? <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border, #2e3040)' }} />
    : <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(name || '?') + '22', color: avatarColor(name || '?'), fontWeight: 700, fontSize: size * 0.38, fontFamily: 'var(--font-mono, monospace)', border: `1px solid ${avatarColor(name || '?')}55` }}>{initials(name || '?')}</span>
}
function Err({ children }) { return <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word' }}>⚠ {children}</div> }
const lbl = { fontSize: 10, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }
const inp = { width: '100%', padding: '9px 12px', fontSize: 16, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }
const primary = (busy) => ({ width: '100%', minHeight: 46, borderRadius: 8, border: 'none', background: busy ? 'var(--accent-dim, #8a6428)' : 'var(--accent, #c8963e)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' })

function Sheet({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, margin: '0 auto', background: 'var(--bg-panel, #1e2028)', borderRadius: '16px 16px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.22s ease-out' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 6px', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 18px 12px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{title}</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '14px 18px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </div>
    </div>
  )
}
function NumField({ label, value, onChange, prefix, readOnly }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
      <span style={lbl}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', ...inp, padding: 0, paddingLeft: 12, opacity: readOnly ? 0.6 : 1 }}>
        {prefix && <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{prefix}</span>}
        <input type="number" inputMode="decimal" value={value} disabled={readOnly} onChange={e => onChange && onChange(e.target.value)}
          style={{ flex: 1, minWidth: 0, padding: '9px 12px 9px 4px', border: 'none', background: 'none', color: 'var(--text, #e8e8f0)', fontSize: 16, outline: 'none', fontFamily: 'inherit' }} />
      </div>
    </label>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PayrollTab() {
  const [periods, setPeriods] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState(null)
  const [payouts, setPayouts] = useState(null)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [sheet, setSheet] = useState('')          // 'newperiod' | 'rates' | ''
  const [editP, setEditP] = useState(null)
  const [actErr, setActErr] = useState('')        // month action errors (finalize/delete)

  const loadPeriods = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.from('vendor_payroll_periods').select('*, payouts:vendor_payouts(total_payout)').order('period_month', { ascending: false })
    if (error) { setError(error.message); setPeriods(null) } else setPeriods(data)
    setLoading(false)
  }, [])
  useEffect(() => { loadPeriods() }, [loadPeriods])

  const openPeriod = useCallback(async (p) => {
    setPeriod(p); setPayouts(null); setRowsLoading(true); setActErr('')
    const { data } = await supabase.from('vendor_payouts').select('*, vendor:vendors(full_name,avatar_path)').eq('period_id', p.id).order('total_payout', { ascending: false, nullsFirst: false })
    setPayouts(data || []); setRowsLoading(false)
  }, [])

  // ── period detail ────────────────────────────────────────────────────────────
  if (period) {
    const total = (payouts || []).reduce((a, r) => a + Number(r.total_payout || 0), 0)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button type="button" onClick={() => { setPeriod(null); setPayouts(null); loadPeriods() }} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', padding: 0 }}>‹ All months</button>
        <div style={{ padding: '14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{monthLabel(period.period_month)}</div>
            <span style={{ fontSize: 10, fontWeight: 700, color: period.status === 'draft' ? 'var(--amber, #c8963e)' : 'var(--green, #3dba7a)', border: `1px solid ${period.status === 'draft' ? 'var(--amber, #c8963e)' : 'var(--green, #3dba7a)'}`, borderRadius: 10, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{period.status === 'locked' ? 'final' : period.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 12, fontFamily: 'var(--font-mono, monospace)' }}>
            <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent, #c8963e)' }}>{money(total)}</div><div style={lbl}>total payout</div></div>
            <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{(payouts || []).length}</div><div style={lbl}>vendors</div></div>
          </div>
          {period.status === 'draft'
            ? <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={() => downloadCsv(period, payouts || [])} style={actBtn}>⤓ CSV</button>
                <button type="button" onClick={async () => { setActErr(''); const { error: rErr } = await supabase.rpc('payroll_fill_month', { p_period_id: period.id }); if (rErr) { setActErr(rErr.message); return } openPeriod(period) }} style={actBtn}>↻ Regenerate</button>
                <button type="button" onClick={async () => { if (!window.confirm('Delete this draft month and its lines?')) return; await supabase.from('vendor_payouts').delete().eq('period_id', period.id); await supabase.from('vendor_payroll_periods').delete().eq('id', period.id); setPeriod(null); setPayouts(null); loadPeriods() }} style={{ ...actBtn, color: 'var(--red, #e05c6a)' }}>Delete</button>
                <button type="button" onClick={async () => { const at = new Date().toISOString(); const { error: mErr } = await supabase.from('vendor_payroll_periods').update({ status: 'locked', locked_at: at }).eq('id', period.id); if (mErr) { setActErr(mErr.message); return } setActErr(''); setPeriod({ ...period, status: 'locked', locked_at: at }) }} style={{ ...actBtn, marginLeft: 'auto', color: '#fff', background: 'var(--green, #3dba7a)', border: 'none', fontWeight: 700 }}>✓ Mark as final →</button>
              </div>
            : <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center', padding: '10px 12px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.30)', borderRadius: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>✓ Finalized{period.locked_at ? ` · ${new Date(period.locked_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}</span>
                <button type="button" onClick={async () => { setActErr(''); const { error: uErr } = await supabase.from('vendor_payroll_periods').update({ status: 'draft', locked_at: null }).eq('id', period.id); if (uErr) { setActErr(uErr.message); return } setPeriod({ ...period, status: 'draft', locked_at: null }) }} style={{ ...actBtn, fontSize: 11 }}>Reopen</button>
                <button type="button" onClick={() => downloadCsv(period, payouts || [])} style={{ ...actBtn, marginLeft: 'auto', color: '#fff', background: 'var(--accent, #c8963e)', border: 'none', fontWeight: 700 }}>⤓ Download CSV</button>
              </div>}
          {actErr && <div style={{ marginTop: 10 }}><Err>{actErr}</Err></div>}
        </div>
        {rowsLoading ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>
          : (payouts || []).map(r => {
            const name = (r.vendor && r.vendor.full_name) || r.beneficiary_name || '—'
            return (
              <button key={r.id} type="button" onClick={() => setEditP(r)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer' }}>
                <Ava name={name} path={r.vendor && r.vendor.avatar_path} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 3 }}>{r.team || r.cost_centre || ''}{Number(r.ot_amount) > 0 ? ` · OT ${money(r.ot_amount)}` : ''}{Number(r.advance_recovered) > 0 ? ` · adv ${money(r.advance_recovered)}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{money(r.total_payout)}</div>
                  {r.utr && <div style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>{r.utr}</div>}
                </div>
              </button>
            )
          })}
        {editP && <PayoutEditSheet row={editP} onClose={() => setEditP(null)} onSaved={() => { setEditP(null); openPeriod(period) }} />}
      </div>
    )
  }

  // ── months list ──────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setSheet('newperiod')} style={{ flex: 1, padding: '10px', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ New month</button>
        <button type="button" onClick={() => setSheet('rates')} style={{ padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Rates</button>
      </div>
      {error && <Err>{error}</Err>}
      {loading && !error && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>}
      {!loading && !error && periods && (periods.length === 0
        ? <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No payroll months yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>Set rates, then create a month.</div>
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {periods.map(p => {
              const total = (p.payouts || []).reduce((a, r) => a + Number(r.total_payout || 0), 0)
              return (
                <button key={p.id} type="button" onClick={() => openPeriod(p)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{monthLabel(p.period_month)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 3 }}>{(p.payouts || []).length} vendors · {money(total)}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: p.status === 'draft' ? 'var(--amber, #c8963e)' : 'var(--green, #3dba7a)', border: `1px solid ${p.status === 'draft' ? 'var(--amber, #c8963e)' : 'var(--green, #3dba7a)'}`, borderRadius: 10, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{p.status === 'locked' ? 'final' : p.status}</span>
                </button>
              )
            })}
          </div>)}
      {sheet === 'newperiod' && <NewPeriodSheet onClose={() => setSheet('')} onCreated={(p) => { setSheet(''); openPeriod(p) }} />}
      {sheet === 'rates' && <RatesSheet onClose={() => setSheet('')} />}
    </div>
  )
}

// ── new month (generate from rates) ──────────────────────────────────────────
function NewPeriodSheet({ onClose, onCreated }) {
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function create() {
    setErr(''); setBusy(true)
    const [y, m] = month.split('-').map(Number)
    const days = new Date(y, m, 0).getDate()
    const { data: per, error } = await supabase.from('vendor_payroll_periods').insert({ period_month: `${month}-01`, days_in_month: days, status: 'draft' }).select().single()
    if (error) { setErr(error.message); setBusy(false); return }
    const { error: fErr } = await supabase.rpc('payroll_fill_month', { p_period_id: per.id })
    setBusy(false)
    if (fErr) { setErr(fErr.message); return }
    onCreated(per)
  }
  return (
    <Sheet title="New payroll month" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>Creates a draft month, auto-filled per approved vendor: their latest salary carried forward, days worked + overtime from attendance, team, and bank/UPI details. Review, tweak, then mark it paid.</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={lbl}>Month</span><input type="month" value={month} onChange={e => setMonth(e.target.value)} style={inp} /></label>
      {err && <Err>{err}</Err>}
      <button type="button" onClick={create} disabled={busy} style={primary(busy)}>{busy ? 'Creating…' : 'Create month'}</button>
    </Sheet>
  )
}

// ── rates per trade (drives generated fixed pay) ─────────────────────────────
function RatesSheet({ onClose }) {
  const [rates, setRates] = useState({})
  const [trades, setTrades] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    (async () => {
      const [rRes, vRes] = await Promise.all([
        supabase.from('payroll_trade_rate').select('*'),
        supabase.from('vendors').select('trade').eq('status', 'approved'),
      ])
      const m = {}; for (const r of rRes.data || []) m[r.trade] = r.monthly_rate; setRates(m)
      const set = new Set()
      for (const v of vRes.data || []) if (v.trade) set.add(v.trade)
      for (const r of rRes.data || []) if (r.trade) set.add(r.trade)
      setTrades([...set].sort())
    })()
  }, [])
  async function save() {
    setBusy(true); setErr(''); setSaved(false)
    const rows = trades.map(t => ({ trade: t, monthly_rate: Number(rates[t] || 0) }))
    const { error } = await supabase.from('payroll_trade_rate').upsert(rows)
    if (error) setErr(error.message); else setSaved(true)
    setBusy(false)
  }
  return (
    <Sheet title="Monthly rate per trade" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>Used as the fixed pay when you generate a new month. Per-vendor overrides live on the vendor.</div>
      {trades.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No approved vendors yet.</div>}
      {trades.map(t => <NumField key={t} label={t} prefix="₹" value={rates[t] ?? ''} onChange={v => setRates(p => ({ ...p, [t]: v }))} />)}
      {err && <Err>{err}</Err>}
      {saved && <div style={{ fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>✓ Saved.</div>}
      <button type="button" onClick={save} disabled={busy} style={primary(busy)}>{busy ? 'Saving…' : 'Save'}</button>
    </Sheet>
  )
}

// ── edit one payout ───────────────────────────────────────────────────────────
function PayoutEditSheet({ row, onClose, onSaved }) {
  const [f, setF] = useState({ fixed_pay: row.fixed_pay || 0, allowance: row.allowance || 0, days_worked: row.days_worked ?? 30, ot_days: row.ot_days || 0, advance_given: row.advance_given || 0, advance_recovered: row.advance_recovered || 0, utr: row.utr || '', comments: row.comments || '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  const perDay = Math.round(perDayOf(f)), dw = daysWorkedOf(f), earned = earnedOf(f), otAmt = otAmtOf(f), total = totalOf(f)
  const name = (row.vendor && row.vendor.full_name) || row.beneficiary_name || 'Payout'
  async function save() {
    setBusy(true); setErr('')
    const patch = {
      fixed_pay: Number(f.fixed_pay || 0), allowance: Number(f.allowance || 0),
      days_worked: f.days_worked === '' ? null : Number(f.days_worked),
      ot_days: Number(f.ot_days || 0), ot_amount: otAmt,
      advance_given: Number(f.advance_given || 0), advance_recovered: Number(f.advance_recovered || 0),
      total_payout: total, utr: f.utr.trim() || null, comments: f.comments.trim() || null,
    }
    const { error } = await supabase.from('vendor_payouts').update(patch).eq('id', row.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }
  const brkRow = { display: 'flex', justifyContent: 'space-between' }
  return (
    <Sheet title={name} onClose={onClose}>
      {(row.team || row.cost_centre) && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{[row.team, row.cost_centre].filter(Boolean).join(' · ')}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <NumField label="Monthly salary" prefix="₹" value={f.fixed_pay} onChange={set('fixed_pay')} />
        <NumField label="Days worked / 30" value={f.days_worked} onChange={set('days_worked')} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <NumField label="OT days" value={f.ot_days} onChange={set('ot_days')} />
        <NumField label="Allowance" prefix="₹" value={f.allowance} onChange={set('allowance')} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <NumField label="Advance given" prefix="₹" value={f.advance_given} onChange={set('advance_given')} />
        <NumField label="Advance recovered" prefix="₹" value={f.advance_recovered} onChange={set('advance_recovered')} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '11px 14px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>
        <div style={brkRow}><span>Per day (÷30)</span><span>{money(perDay)}</span></div>
        <div style={brkRow}><span>Earned · {dw} {dw === 1 ? 'day' : 'days'}</span><span style={{ color: 'var(--text, #e8e8f0)' }}>{money(earned)}</span></div>
        <div style={brkRow}><span>Overtime · {Number(f.ot_days || 0)} × 1 day</span><span style={{ color: 'var(--text, #e8e8f0)' }}>{money(otAmt)}</span></div>
        {Number(f.allowance) > 0 && <div style={brkRow}><span>Allowance</span><span style={{ color: 'var(--text, #e8e8f0)' }}>{money(Number(f.allowance))}</span></div>}
        {Number(f.advance_recovered) > 0 && <div style={brkRow}><span>Advance recovered</span><span style={{ color: 'var(--red, #e05c6a)' }}>− {money(Number(f.advance_recovered))}</span></div>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 10 }}>
        <span style={{ ...lbl, fontSize: 11 }}>Total payout</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{money(total)}</span>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={lbl}>UTR / payment ref</span><input value={f.utr} onChange={e => set('utr')(e.target.value)} style={inp} placeholder="bank reference" /></label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><span style={lbl}>Comments</span><input value={f.comments} onChange={e => set('comments')(e.target.value)} style={inp} /></label>
      {err && <Err>{err}</Err>}
      <button type="button" onClick={save} disabled={busy} style={primary(busy)}>{busy ? 'Saving…' : 'Save'}</button>
    </Sheet>
  )
}
