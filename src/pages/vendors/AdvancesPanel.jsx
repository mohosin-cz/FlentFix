import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { initials, avatarColor } from '../../utils/vendorHub'

// Advances: money paid to a vendor ahead of payday.
//
// Recorded the day it's paid, with a schedule for getting it back. The ledger
// does the remembering — when a payroll month is made (or already exists as a
// draft) each vendor's line already carries the month's deduction, labelled.
// Lowering a deduction during review moves the rest to the next month; it is
// never silently dropped. See vendor_advances.sql.

const F = "var(--font-nav, 'Urbanist', 'Poppins', sans-serif)"
const MONO = 'var(--font-mono, monospace)'
const C = { text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)', border: 'var(--border, #2e3040)', panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', accent: 'var(--accent, #c8963e)' }
const M = { red: '#b0645b', redSoft: 'rgba(176,100,91,0.16)', amber: '#a8895a', amberSoft: 'rgba(168,137,90,0.16)', green: '#6f9a7e', greenSoft: 'rgba(111,154,126,0.16)' }

const inr = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const monthName = (d, long) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined })
const dayName = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const firstOf = (iso) => `${iso.slice(0, 7)}-01`
const addMonths = (iso, k) => { const d = new Date(`${iso.slice(0, 7)}-01T12:00:00`); d.setMonth(d.getMonth() + k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const METHOD = { upi: 'UPI', bank: 'Bank transfer', cash: 'Cash', other: 'Other' }
const STATE = {
  recovered: { label: 'taken back', ink: M.green, soft: M.greenSoft },
  draft:     { label: 'in the draft', ink: M.amber, soft: M.amberSoft },
  upcoming:  { label: 'upcoming', ink: C.dim, soft: C.input },
  missed:    { label: 'missed — no line that month', ink: M.red, soft: M.redSoft },
}

function Btn({ children, onClick, tone, disabled, small, title }) {
  const t = tone === 'primary' ? { b: C.accent, bg: C.accent, c: '#16171f' }
    : tone === 'soft' ? { b: 'rgba(200,150,62,0.45)', bg: 'rgba(200,150,62,0.12)', c: C.accent }
    : tone === 'no' ? { b: `${M.red}88`, bg: M.redSoft, c: M.red }
    : { b: C.border, bg: C.input, c: C.dim }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ minHeight: small ? 30 : 38, padding: small ? '0 10px' : '0 14px', borderRadius: 8, border: `1px solid ${t.b}`, background: t.bg, color: t.c, fontWeight: 600, fontSize: small ? 12 : 13, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: F, whiteSpace: 'nowrap' }}>
      {children}
    </button>
  )
}
function Warn({ tone = 'amber', children }) {
  const ink = tone === 'red' ? M.red : tone === 'green' ? M.green : M.amber
  const soft = tone === 'red' ? M.redSoft : tone === 'green' ? M.greenSoft : M.amberSoft
  return <div style={{ borderLeft: `3px solid ${ink}`, background: soft, borderRadius: '0 8px 8px 0', padding: '8px 11px', fontSize: 12.5, lineHeight: 1.5, color: C.text }}>{children}</div>
}
const field = { width: '100%', boxSizing: 'border-box', minHeight: 40, padding: '0 11px', fontSize: 14, color: C.text, background: C.input, border: `1px solid ${C.border}`, borderRadius: 9, outline: 'none', fontFamily: F }
const lab = { display: 'block', fontSize: 12, color: C.muted, marginBottom: 5 }

// ── record ─────────────────────────────────────────────────────────────────
function RecordSheet({ periods, onClose, onSaved }) {
  const [vendors, setVendors] = useState([])
  const [vid, setVid] = useState('')
  const [amount, setAmount] = useState('')
  const [givenOn, setGivenOn] = useState(todayIST())
  const [method, setMethod] = useState('upi')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState(null)
  const [months, setMonths] = useState(1)
  const [salary, setSalary] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('vendors').select('id,full_name,trade,monthly_rate').eq('status', 'approved').is('exited_at', null).order('full_name')
      .then(({ data }) => setVendors(data || []))
  }, [])
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  // salary to judge the deduction against: the rate, else their last payroll line
  useEffect(() => {
    if (!vid) return undefined
    let alive = true
    const v = vendors.find(x => x.id === vid)
    supabase.from('vendor_payouts').select('fixed_pay, created_at').eq('vendor_id', vid).order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (alive) setSalary(Number(v?.monthly_rate || data?.[0]?.fixed_pay || 0) || null) })
    return () => { alive = false }
  }, [vid, vendors])

  const final = useMemo(() => new Set((periods || []).filter(p => p.status !== 'draft').map(p => firstOf(String(p.period_month)))), [periods])
  // months it can be taken back from: the month it was paid, onwards, skipping finals
  const options = useMemo(() => {
    const out = []
    let m = firstOf(givenOn || todayIST())
    for (let k = 0; out.length < 6 && k < 18; k++, m = addMonths(m, 1)) if (!final.has(m)) out.push(m)
    return out
  }, [givenOn, final])
  const fromMonth = from && options.includes(from) ? from : options[0]
  const amt = Number(amount) || 0
  const per = months > 0 ? Math.floor(amt / months) : 0
  const schedule = Array.from({ length: months }, (_, k) => [addMonths(fromMonth || todayIST(), k), k === months - 1 ? amt - per * (months - 1) : per])
  const firstCut = schedule[0]?.[1] || 0

  async function save() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('vendor_advance_record', {
      p_vendor: vid, p_amount: amt, p_given_on: givenOn, p_method: method,
      p_reference: reference.trim() || null, p_reason: reason.trim() || null,
      p_recover_from: fromMonth, p_months: months,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    const v = vendors.find(x => x.id === vid)
    onSaved(`Recorded — ${inr(firstCut)} comes off ${v ? v.full_name.split(' ')[0] + '’s ' : ''}${monthName(fromMonth, true)} pay`)
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(8,9,13,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div role="dialog" aria-label="Record an advance" style={{ width: '100%', maxWidth: 540, maxHeight: '92svh', overflowY: 'auto', background: C.panel, border: `1px solid ${C.border}`, borderRadius: '16px 16px 0 0', paddingBottom: 'env(safe-area-inset-bottom)', fontFamily: F, color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.panel, zIndex: 1 }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Record an advance</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.dim, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div><label style={lab}>Vendor</label>
            <select value={vid} onChange={e => setVid(e.target.value)} style={field}>
              <option value="">Pick a vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.full_name} · {v.trade}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div><label style={lab}>Amount (₹)</label><input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="6000" style={{ ...field, fontFamily: MONO }} /></div>
            <div><label style={lab}>Paid on</label><input type="date" value={givenOn} max={todayIST()} onChange={e => setGivenOn(e.target.value)} style={field} /></div>
          </div>
          <div><label style={lab}>How it was paid</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(METHOD).map(([k, l]) => <Btn key={k} small tone={method === k ? 'soft' : undefined} onClick={() => setMethod(k)}>{l}</Btn>)}
            </div>
          </div>
          {method !== 'cash' && <div><label style={lab}>Reference (UTR / transaction id)</label><input value={reference} onChange={e => setReference(e.target.value)} placeholder="optional" style={{ ...field, fontFamily: MONO }} /></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div><label style={lab}>Take it back from</label>
              <select value={fromMonth || ''} onChange={e => setFrom(e.target.value)} style={field}>
                {options.map(m => <option key={m} value={m}>{monthName(m, true)} payroll</option>)}
              </select>
            </div>
            <div><label style={lab}>Spread over</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 6].map(n => <Btn key={n} small tone={months === n ? 'soft' : undefined} onClick={() => setMonths(n)}>{n === 1 ? 'One month' : `${n}`}</Btn>)}
              </div>
            </div>
          </div>
          {amt > 0 && (
            <Warn tone="green">
              {schedule.map(([m, v], i) => <span key={m}>{i ? ' · ' : ''}<b>{monthName(m)}</b> {inr(v)}</span>)}
              {months > 1 && <span style={{ color: C.dim }}> — {months} months</span>}
            </Warn>
          )}
          {amt > 0 && salary && (
            firstCut > salary / 2
              ? <Warn tone="red">That’s more than half of a {inr(salary)} month. After the deduction they’d take home about <b>{inr(salary - firstCut)}</b> in {monthName(fromMonth, true)}. Spreading it helps.</Warn>
              : <Warn>On a {inr(salary)} salary they’d take home about <b>{inr(salary - firstCut)}</b> in {monthName(fromMonth, true)}, before overtime and leave.</Warn>
          )}
          <div><label style={lab}>Why (optional)</label><input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. family wedding" style={field} /></div>
          {err && <Warn tone="red">{err}</Warn>}
          <Btn tone="primary" onClick={save} disabled={busy || !vid || !(amt > 0) || !givenOn || !fromMonth}>{busy ? 'Recording…' : 'Record advance'}</Btn>
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>The deduction is put on their payroll line automatically when the month is made — or straight away if that month is already a draft.</div>
        </div>
      </div>
    </div>
  )
}

// ── one advance ────────────────────────────────────────────────────────────
function AdvanceCard({ a, onChanged, onToast }) {
  const [busy, setBusy] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [why, setWhy] = useState('')
  const [err, setErr] = useState('')
  const c = avatarColor(a.name || '?')
  const pct = a.amount ? Math.min(100, (Number(a.recovered) / Number(a.amount)) * 100) : 0
  const done = !a.cancelled && Number(a.outstanding) <= 0

  async function move(month) {
    setBusy(month); setErr('')
    const { error } = await supabase.rpc('vendor_advance_move', { p_advance: a.id, p_month: month })
    setBusy('')
    if (error) { setErr(error.message); return }
    onToast(`${monthName(month, true)}’s share moved to the next open month`); onChanged()
  }
  async function cancel() {
    setBusy('cancel'); setErr('')
    const { error } = await supabase.rpc('vendor_advance_cancel', { p_advance: a.id, p_reason: why.trim() || null })
    setBusy('')
    if (error) { setErr(error.message); return }
    onToast('Advance cancelled — removed from payroll'); onChanged()
  }

  return (
    <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8, opacity: a.cancelled ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: c + '22', color: c, border: `1px solid ${c}55` }}>{initials(a.name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
            Paid {dayName(a.given_on)} · {METHOD[a.method] || a.method}{a.reference ? ` · ${a.reference}` : ''}{a.reason ? ` · “${a.reason}”` : ''}{a.created_by ? ` · by ${a.created_by}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {a.cancelled ? <div style={{ fontSize: 12.5, color: C.muted }}>cancelled</div>
            : done ? <div style={{ fontSize: 12.5, color: M.green }}>✓ settled</div>
            : <div style={{ fontSize: 14 }}>{inr(a.outstanding)} <span style={{ fontSize: 11.5, color: C.muted, fontFamily: F }}>left</span></div>}
          <div style={{ fontSize: 11.5, color: C.muted }}>of {inr(a.amount)}</div>
        </div>
      </div>
      {!a.cancelled && <div style={{ height: 5, borderRadius: 3, background: C.input, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: M.green }} /></div>}
      {!a.cancelled && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {(a.schedule || []).map(s => {
            const st = STATE[s.state] || STATE.upcoming
            const canMove = s.state !== 'recovered'
            return (
              <span key={s.month} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 4px 4px 9px', fontSize: 12, background: C.bg }}>
                {monthName(s.month)} <b style={{ fontFamily: MONO, fontWeight: 500 }}>{inr(s.amount)}</b>
                <span style={{ fontSize: 11, fontWeight: 600, color: st.ink, background: st.soft, borderRadius: 6, padding: '1px 7px' }}>{st.label}</span>
                {canMove && <button type="button" onClick={() => move(s.month)} disabled={!!busy} title="Move this month’s share to the next open month"
                  style={{ border: 'none', background: 'none', color: C.dim, cursor: 'pointer', fontSize: 12, padding: '2px 6px', fontFamily: F }}>{busy === s.month ? '…' : 'later →'}</button>}
              </span>
            )
          })}
          <span style={{ flex: 1 }} />
          {!done && !cancelling && Number(a.recovered) === 0 && <Btn small onClick={() => setCancelling(true)}>Cancel</Btn>}
        </div>
      )}
      {a.cancelled && a.cancel_reason && <div style={{ fontSize: 12, color: C.muted }}>Cancelled: {a.cancel_reason}</div>}
      {cancelling && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: 10, borderRadius: 10, border: `1px solid ${M.red}55`, background: C.bg }}>
          <input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why? (e.g. recorded twice)" style={{ ...field, flex: '1 1 180px', minHeight: 34, fontSize: 13 }} />
          <Btn small tone="no" onClick={cancel} disabled={!!busy}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel advance'}</Btn>
          <Btn small onClick={() => setCancelling(false)}>Keep</Btn>
        </div>
      )}
      {err && <Warn tone="red">{err}</Warn>}
    </div>
  )
}

// ── the panel ──────────────────────────────────────────────────────────────
export default function AdvancesPanel({ periods, onChanged }) {
  const [ledger, setLedger] = useState(null)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const [show, setShow] = useState('open')
  const [q, setQ] = useState('')
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('vendor_advance_ledger')
    if (e) { setError(e.message); return }
    setError(''); setLedger(data)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t) }, [toast])
  const changed = () => { load(); onChanged?.() }

  if (error) {
    return <Warn tone="red">Advances couldn’t load: {error}{/does not exist/.test(error) ? ' — the vendor_advances migration needs to be applied.' : ''}</Warn>
  }
  if (!ledger) return null

  const all = ledger.advances || []
  const open = all.filter(a => !a.cancelled && Number(a.outstanding) > 0)
  const list = (show === 'open' ? open : all).filter(a => !q || `${a.name} ${a.reason || ''} ${a.reference || ''}`.toLowerCase().includes(q.toLowerCase()))
  const thisMonth = monthName(ledger.month, true).split(' ')[0]

  return (
    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, fontFamily: F, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
        <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>Advances</h2>
        <span style={{ fontSize: 12, color: C.muted }}>paid ahead of payday, and when it comes back</span>
        <span style={{ marginLeft: 'auto' }}><Btn tone="soft" onClick={() => setRecording(true)}>+ Record advance</Btn></span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: '12px 14px' }}>
        {[['Outstanding', inr(ledger.outstanding), `${open.length} advance${open.length === 1 ? '' : 's'} open`],
          [`Comes off ${thisMonth}`, inr(ledger.due_this_month), ledger.due_vendors ? `${ledger.due_vendors} vendor${ledger.due_vendors === 1 ? '' : 's'}` : 'nothing due'],
          [`Paid out in ${thisMonth}`, inr(ledger.paid_this_month), 'advances given this month']].map(([k, v, h]) => (
          <div key={k} style={{ background: C.bg, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, color: C.muted }}>{k}</div>
            <div style={{ fontSize: 21, fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{v}</div>
            <div style={{ fontSize: 12, color: C.dim }}>{h}</div>
          </div>
        ))}
      </div>
      {ledger.missed > 0 && <div style={{ padding: '0 14px 10px' }}><Warn tone="red">{ledger.missed} month{ledger.missed === 1 ? '' : 's'} went final without the vendor on payroll, so nothing was taken back. Use “later →” to move it on.</Warn></div>}

      {all.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '0 14px 10px' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search vendor or reason" aria-label="Search advances" style={{ ...field, flex: '1 1 200px', maxWidth: 320, minHeight: 36, fontSize: 13 }} />
          <Btn small tone={show === 'open' ? 'soft' : undefined} onClick={() => setShow('open')}>Open · {open.length}</Btn>
          <Btn small tone={show === 'all' ? 'soft' : undefined} onClick={() => setShow('all')}>All · {all.length}</Btn>
        </div>
      )}

      {all.length === 0
        ? <div style={{ padding: '6px 14px 16px', fontSize: 13, color: C.muted, lineHeight: 1.55 }}>No advances on record. When you pay someone ahead of payday, record it here — the deduction will be waiting on their line when the month is made.</div>
        : list.length === 0
          ? <div style={{ padding: '6px 14px 16px', fontSize: 13, color: C.muted }}>{q ? 'Nothing matches.' : 'Nothing outstanding — every advance is settled.'}</div>
          : list.map(a => <AdvanceCard key={a.id} a={a} onChanged={changed} onToast={setToast} />)}

      {recording && <RecordSheet periods={periods} onClose={() => setRecording(false)} onSaved={(m) => { setRecording(false); setToast(m); changed() }} />}
      {toast && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 1400, background: C.text, color: C.bg, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: F, maxWidth: 'calc(100vw - 32px)' }}>{toast}</div>}
    </section>
  )
}
