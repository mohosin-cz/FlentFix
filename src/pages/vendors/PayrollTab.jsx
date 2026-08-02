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
          : <ReviewTable key={period.id} period={period} rows={payouts || []} onReload={() => openPeriod(period)} />}
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

// ── editable review table for one month ──────────────────────────────────────
const num = (v) => String(v).replace(/[^\d.]/g, '')

function ReviewTable({ period, rows: initialRows, onReload }) {
  const locked = period.status !== 'draft'
  const [rows, setRows] = useState(() => (initialRows || []).map(r => ({ ...r, days_worked: r.days_worked ?? 30 })))
  const [dirty, setDirty] = useState(() => new Set())
  const [delIds, setDelIds] = useState(() => [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const upd = (id, patch) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
    if (!String(id).startsWith('new-')) setDirty(d => { const n = new Set(d); n.add(id); return n })
  }
  const removeRow = (id) => {
    setRows(rs => rs.filter(r => r.id !== id))
    if (!String(id).startsWith('new-')) setDelIds(d => [...d, id])
  }
  const totalRow = (r) => locked ? Number(r.total_payout || 0) : totalOf(r)
  const grand = rows.reduce((a, r) => a + totalRow(r), 0)
  const hasChanges = dirty.size > 0 || delIds.length > 0 || rows.some(r => String(r.id).startsWith('new-'))

  async function saveAll() {
    setBusy(true); setErr('')
    try {
      for (const id of delIds) { const { error } = await supabase.from('vendor_payouts').delete().eq('id', id); if (error) throw error }
      for (const r of rows) {
        const patch = {
          beneficiary_name: (r.beneficiary_name || '').trim() || null, team: r.team || null,
          upi_id: r.upi_id || null, bank_account_name: r.bank_account_name || null,
          bank_account_no: r.bank_account_no || null, bank_ifsc: r.bank_ifsc || null,
          fixed_pay: Number(r.fixed_pay || 0), allowance: Number(r.allowance || 0),
          days_worked: (r.days_worked === '' || r.days_worked == null) ? null : Number(r.days_worked),
          ot_days: Number(r.ot_days || 0), ot_amount: otAmtOf(r),
          advance_recovered: Number(r.advance_recovered || 0), total_payout: totalOf(r),
        }
        if (String(r.id).startsWith('new-')) {
          const { error } = await supabase.from('vendor_payouts').insert({ period_id: period.id, vendor_id: r.vendor_id || null, ...patch }); if (error) throw error
        } else if (dirty.has(r.id)) {
          const { error } = await supabase.from('vendor_payouts').update(patch).eq('id', r.id); if (error) throw error
        }
      }
      onReload()
    } catch (e) { setErr(e.message || String(e)); setBusy(false) }
  }

  const th = { fontSize: 9, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono, monospace)', textAlign: 'right', padding: '10px 8px', whiteSpace: 'nowrap' }
  const thL = { ...th, textAlign: 'left' }
  const td = { borderBottom: '1px solid var(--border, #2e3040)', padding: 0 }
  const cellIn = (w, left) => ({ width: w, minWidth: w, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, padding: '9px 8px', textAlign: left ? 'left' : 'right' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!locked && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setAddOpen(true)} style={actBtn}>+ Add person</button>
        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{rows.length} vendors · edit any cell inline</span>
        {hasChanges && <button type="button" onClick={saveAll} disabled={busy} style={{ ...actBtn, marginLeft: 'auto', color: '#fff', background: 'var(--accent, #c8963e)', border: 'none', fontWeight: 700 }}>{busy ? 'Saving…' : '✓ Save changes'}</button>}
      </div>}
      {err && <Err>{err}</Err>}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border, #2e3040)', borderRadius: 12, background: 'var(--bg-panel, #1e2028)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
          <thead><tr>
            <th style={thL}>Beneficiary</th><th style={th}>Salary</th><th style={th}>Days/30</th><th style={th}>OT&nbsp;d</th><th style={th}>Allow.</th><th style={th}>Adv&nbsp;rec.</th><th style={th}>Total</th><th style={thL}>Bank A/C</th><th style={thL}>IFSC</th><th style={thL}>UPI</th>{!locked && <th style={th}></th>}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td style={td}><input value={r.beneficiary_name || ''} readOnly={locked} onChange={e => upd(r.id, { beneficiary_name: e.target.value })} placeholder="Name" style={cellIn(160, true)} /></td>
                <td style={td}><input value={r.fixed_pay ?? ''} readOnly={locked} inputMode="decimal" onChange={e => upd(r.id, { fixed_pay: num(e.target.value) })} style={cellIn(92)} /></td>
                <td style={td}><input value={r.days_worked ?? ''} readOnly={locked} inputMode="decimal" onChange={e => upd(r.id, { days_worked: num(e.target.value) })} style={cellIn(58)} /></td>
                <td style={td}><input value={r.ot_days ?? ''} readOnly={locked} inputMode="decimal" onChange={e => upd(r.id, { ot_days: num(e.target.value) })} style={cellIn(52)} /></td>
                <td style={td}><input value={r.allowance ?? ''} readOnly={locked} inputMode="decimal" onChange={e => upd(r.id, { allowance: num(e.target.value) })} style={cellIn(80)} /></td>
                <td style={td}><input value={r.advance_recovered ?? ''} readOnly={locked} inputMode="decimal" onChange={e => upd(r.id, { advance_recovered: num(e.target.value) })} style={cellIn(80)} /></td>
                <td style={{ ...td, textAlign: 'right', padding: '9px 8px', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 700, color: 'var(--accent, #c8963e)', whiteSpace: 'nowrap' }}>{money(totalRow(r))}</td>
                <td style={td}><input value={r.bank_account_no || ''} readOnly={locked} onChange={e => upd(r.id, { bank_account_no: e.target.value })} placeholder="—" style={cellIn(140, true)} /></td>
                <td style={td}><input value={r.bank_ifsc || ''} readOnly={locked} onChange={e => upd(r.id, { bank_ifsc: e.target.value })} placeholder="—" style={cellIn(110, true)} /></td>
                <td style={td}><input value={r.upi_id || ''} readOnly={locked} onChange={e => upd(r.id, { upi_id: e.target.value })} placeholder="—" style={cellIn(130, true)} /></td>
                {!locked && <td style={td}><button type="button" title="Remove" onClick={() => removeRow(r.id)} style={{ background: 'none', border: 'none', color: 'var(--red, #e05c6a)', cursor: 'pointer', fontSize: 14, padding: '6px 10px' }}>✕</button></td>}
              </tr>
            ))}
          </tbody>
          <tfoot><tr>
            <td style={{ padding: '11px 8px', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Grand total</td>
            <td colSpan={5}></td>
            <td style={{ padding: '11px 8px', textAlign: 'right', fontFamily: 'var(--font-mono, monospace)', fontSize: 15, fontWeight: 700, color: 'var(--accent, #c8963e)', whiteSpace: 'nowrap' }}>{money(grand)}</td>
            <td colSpan={locked ? 3 : 4}></td>
          </tr></tfoot>
        </table>
      </div>
      {locked
        ? <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Finalized — reopen the month above to edit.</div>
        : <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.5 }}>Pro-rated: earned = salary ÷ 30 × days · OT = salary ÷ 30 × OT days. Edit any cell, add/remove people, then Save changes.</div>}
      {addOpen && <AddPersonSheet existingVendorIds={new Set(rows.map(r => r.vendor_id).filter(Boolean))} onAdd={(newRows) => setRows(rs => [...rs, ...newRows])} onClose={() => setAddOpen(false)} />}
    </div>
  )
}

const mkRowId = () => 'new-' + Date.now() + '-' + Math.round(Math.random() * 1e6)
const vendorToRow = (v) => ({ id: mkRowId(), vendor_id: v.id, beneficiary_name: v.full_name, team: v.pod, fixed_pay: Number(v.monthly_rate || 0), allowance: 0, days_worked: 30, ot_days: 0, ot_amount: 0, advance_recovered: 0, upi_id: v.upi_id, bank_account_name: v.bank_account_name, bank_account_no: v.bank_account_no, bank_ifsc: v.bank_ifsc })
const blankRow = () => ({ id: mkRowId(), vendor_id: null, beneficiary_name: '', team: '', fixed_pay: 0, allowance: 0, days_worked: 30, ot_days: 0, ot_amount: 0, advance_recovered: 0, upi_id: '', bank_account_name: '', bank_account_no: '', bank_ifsc: '' })

function AddPersonSheet({ existingVendorIds, onAdd, onClose }) {
  const [vendors, setVendors] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    supabase.from('vendors').select('id,full_name,pod,trade,monthly_rate,upi_id,bank_account_name,bank_account_no,bank_ifsc').eq('status', 'approved').order('full_name')
      .then(({ data }) => setVendors(data || []))
  }, [])
  const list = (vendors || []).filter(v => !existingVendorIds.has(v.id) && (v.full_name || '').toLowerCase().includes(q.toLowerCase()))
  return (
    <Sheet title="Add person" onClose={onClose}>
      <button type="button" onClick={() => { onAdd([blankRow()]); onClose() }} style={{ ...actBtn, width: '100%', padding: '10px' }}>+ Blank row (manual entry)</button>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search approved vendors" style={inp} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {vendors === null ? <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', padding: 8 }}>Loading…</div>
          : list.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', padding: 8 }}>No approved vendors left to add.</div>
          : list.map(v => (
            <button key={v.id} type="button" onClick={() => { onAdd([vendorToRow(v)]); onClose() }} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, cursor: 'pointer' }}>
              <Ava name={v.full_name} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{v.full_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{v.trade || v.pod || ''}{v.monthly_rate ? ` · ${money(v.monthly_rate)}` : ''}</div>
              </div>
            </button>
          ))}
      </div>
    </Sheet>
  )
}
