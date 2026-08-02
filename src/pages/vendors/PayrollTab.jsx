import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtDate, initials, avatarColor } from '../../utils/vendorHub'

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
const avatarUrl = (p) => { if (!p) return null; try { return supabase.storage.from('vendor-avatars').getPublicUrl(p).data.publicUrl } catch { return null } }

function Ava({ v, size = 34 }) {
  const name = (v && v.full_name) || '?'
  const url = v && avatarUrl(v.avatar_path)
  return url
    ? <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border, #2e3040)' }} />
    : <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(name) + '22', color: avatarColor(name), fontWeight: 700, fontSize: size * 0.38, fontFamily: 'var(--font-mono, monospace)', border: `1px solid ${avatarColor(name)}55` }}>{initials(name)}</span>
}

function Err({ children }) {
  return <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word' }}>⚠ {children}</div>
}
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
const lbl = { fontSize: 10, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }
const inp = { width: '100%', padding: '9px 12px', fontSize: 16, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }
const primary = (busy) => ({ width: '100%', minHeight: 46, borderRadius: 8, border: 'none', background: busy ? 'var(--accent-dim, #8a6428)' : 'var(--accent, #c8963e)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' })

function NumField({ label, value, onChange, prefix }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={lbl}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, ...inp, padding: 0, paddingLeft: 12 }}>
        {prefix && <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{prefix}</span>}
        <input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, padding: '9px 12px 9px 4px', border: 'none', background: 'none', color: 'var(--text, #e8e8f0)', fontSize: 16, outline: 'none', fontFamily: 'inherit' }} />
      </div>
    </label>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function PayrollTab() {
  const [runs, setRuns] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [run, setRun] = useState(null)          // opened run
  const [items, setItems] = useState(null)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [sheet, setSheet] = useState('')        // 'settings' | 'newrun' | 'advances' | ''
  const [editItem, setEditItem] = useState(null)

  const loadRuns = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.from('payroll_run').select('*, items:payroll_item(net, payment_status)').order('period_start', { ascending: false })
    if (error) { setError(error.message); setRuns(null) } else setRuns(data)
    setLoading(false)
  }, [])
  useEffect(() => { loadRuns() }, [loadRuns])

  const openRun = useCallback(async (r) => {
    setRun(r); setItems(null); setItemsLoading(true)
    const { data } = await supabase.from('payroll_item').select('*, vendor:vendors(full_name,trade,vendor_code,avatar_path)').eq('run_id', r.id).order('net', { ascending: false })
    setItems(data || []); setItemsLoading(false)
  }, [])

  // ── run detail view ─────────────────────────────────────────────────────────
  if (run) {
    const totalNet = (items || []).reduce((a, i) => a + Number(i.net || 0), 0)
    const paidCount = (items || []).filter(i => i.payment_status === 'paid').length
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button type="button" onClick={() => { setRun(null); setItems(null); loadRuns() }} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', padding: 0 }}>‹ All runs</button>
        <div style={{ padding: '14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{run.label || `${fmtDate(run.period_start)} – ${fmtDate(run.period_end)}`}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>{fmtDate(run.period_start)} – {fmtDate(run.period_end)}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: run.status === 'finalized' ? 'var(--green, #3dba7a)' : 'var(--amber, #c8963e)', border: `1px solid ${run.status === 'finalized' ? 'var(--green, #3dba7a)' : 'var(--amber, #c8963e)'}`, borderRadius: 10, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{run.status}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontFamily: 'var(--font-mono, monospace)' }}>
            <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent, #c8963e)' }}>{money(totalNet)}</div><div style={lbl}>total net</div></div>
            <div><div style={{ fontSize: 18, fontWeight: 700 }}>{(items || []).length}</div><div style={lbl}>vendors</div></div>
            <div><div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green, #3dba7a)' }}>{paidCount}</div><div style={lbl}>paid</div></div>
          </div>
          {run.status === 'draft' && (
            <button type="button" onClick={async () => { await supabase.rpc('payroll_finalize', { p_run_id: run.id }); setRun({ ...run, status: 'finalized' }) }} style={{ ...primary(false), marginTop: 12 }}>Finalize run</button>
          )}
          {run.status === 'draft' && (
            <button type="button" onClick={async () => { if (!window.confirm('Delete this draft run and all its lines?')) return; await supabase.from('payroll_run').delete().eq('id', run.id); setRun(null); setItems(null); loadRuns() }} style={{ marginTop: 8, width: '100%', padding: '8px', background: 'none', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, color: 'var(--red, #e05c6a)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Delete run</button>
          )}
        </div>

        {itemsLoading ? <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>
          : (items || []).map(it => (
            <button key={it.id} type="button" onClick={() => setEditItem(it)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer' }}>
              <Ava v={it.vendor} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.vendor ? it.vendor.full_name : '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 3 }}>{it.present_days}d present · OT {Number(it.ot_hours)}h{Number(it.advance_recovered) > 0 ? ` · adv ${money(it.advance_recovered)}` : ''}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{money(it.net)}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: it.payment_status === 'paid' ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>{it.payment_status}</div>
              </div>
            </button>
          ))}

        {editItem && <ItemEditSheet item={editItem} readOnly={run.status === 'finalized'} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); openRun(run) }} />}
      </div>
    )
  }

  // ── runs list view ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setSheet('newrun')} style={{ flex: 1, padding: '10px', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ New run</button>
        <button type="button" onClick={() => setSheet('advances')} style={{ padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Advances</button>
        <button type="button" onClick={() => setSheet('settings')} style={{ padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Rates</button>
      </div>

      {error && <Err>{error}</Err>}
      {loading && !error && <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>}

      {!loading && !error && runs && (runs.length === 0
        ? <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No pay runs yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>Set your rates, then create a monthly run.</div>
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {runs.map(r => {
              const net = (r.items || []).reduce((a, i) => a + Number(i.net || 0), 0)
              return (
                <button key={r.id} type="button" onClick={() => openRun(r)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{r.label || `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}`}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 3 }}>{(r.items || []).length} vendors · {money(net)}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: r.status === 'finalized' ? 'var(--green, #3dba7a)' : 'var(--amber, #c8963e)', border: `1px solid ${r.status === 'finalized' ? 'var(--green, #3dba7a)' : 'var(--amber, #c8963e)'}`, borderRadius: 10, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{r.status}</span>
                </button>
              )
            })}
          </div>)}

      {sheet === 'newrun' && <NewRunSheet onClose={() => setSheet('')} onCreated={(id) => { setSheet(''); loadRuns().then(() => {}); supabase.from('payroll_run').select('*').eq('id', id).single().then(({ data }) => data && openRun(data)) }} />}
      {sheet === 'settings' && <SettingsSheet onClose={() => setSheet('')} />}
      {sheet === 'advances' && <AdvancesSheet onClose={() => setSheet('')} />}
    </div>
  )
}

// ── new run ───────────────────────────────────────────────────────────────────
function NewRunSheet({ onClose, onCreated }) {
  const now = new Date()
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function create() {
    setErr(''); setBusy(true)
    const [y, m] = month.split('-').map(Number)
    const start = `${month}-01`
    const end = new Date(y, m, 0)
    const endStr = `${y}-${String(m).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
    const label = new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    const { data, error } = await supabase.rpc('payroll_generate', { p_start: start, p_end: endStr, p_label: label })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onCreated(data)
  }
  return (
    <Sheet title="New pay run" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>Pick a month. Each approved vendor gets a draft line computed from their rate and attendance — you review and finalize.</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={lbl}>Month</span>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={inp} />
      </label>
      {err && <Err>{err}</Err>}
      <button type="button" onClick={create} disabled={busy} style={primary(busy)}>{busy ? 'Generating…' : 'Generate run'}</button>
    </Sheet>
  )
}

// ── settings + trade rates ────────────────────────────────────────────────────
function SettingsSheet({ onClose }) {
  const [s, setS] = useState(null)
  const [rates, setRates] = useState({})
  const [trades, setTrades] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    (async () => {
      const [sRes, rRes, vRes] = await Promise.all([
        supabase.from('payroll_settings').select('*').eq('id', 1).single(),
        supabase.from('payroll_trade_rate').select('*'),
        supabase.from('vendors').select('trade').eq('status', 'approved'),
      ])
      setS(sRes.data || {})
      const m = {}; for (const r of rRes.data || []) m[r.trade] = r.monthly_rate; setRates(m)
      const set = new Set()
      for (const v of vRes.data || []) if (v.trade) set.add(v.trade)   // trades that actually exist
      for (const r of rRes.data || []) if (r.trade) set.add(r.trade)   // + any already-rated trade
      setTrades([...set].sort())
    })()
  }, [])
  async function save() {
    setBusy(true); setErr(''); setSaved(false)
    const { error } = await supabase.from('payroll_settings').update({
      ot_multiplier: Number(s.ot_multiplier), standard_days: Number(s.standard_days), hours_per_day: Number(s.hours_per_day),
      pf_percent: Number(s.pf_percent), esi_percent: Number(s.esi_percent), tds_percent: Number(s.tds_percent),
    }).eq('id', 1)
    if (!error) {
      const rows = trades.map(t => ({ trade: t, monthly_rate: Number(rates[t] || 0) }))
      const { error: rErr } = await supabase.from('payroll_trade_rate').upsert(rows)
      if (rErr) setErr(rErr.message); else setSaved(true)
    } else setErr(error.message)
    setBusy(false)
  }
  if (!s) return <Sheet title="Rates & settings" onClose={onClose}><div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>Loading…</div></Sheet>
  const set = (k) => (v) => setS(p => ({ ...p, [k]: v }))
  return (
    <Sheet title="Rates & settings" onClose={onClose}>
      <span style={lbl}>Monthly rate per trade</span>
      {trades.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No approved vendors yet.</div>}
      {trades.map(t => (
        <NumField key={t} label={t} prefix="₹" value={rates[t] ?? ''} onChange={v => setRates(p => ({ ...p, [t]: v }))} />
      ))}
      <div style={{ height: 1, background: 'var(--border, #2e3040)', margin: '4px 0' }} />
      <span style={lbl}>Rules</span>
      <NumField label="Overtime multiplier (×)" value={s.ot_multiplier} onChange={set('ot_multiplier')} />
      <NumField label="Standard days / month" value={s.standard_days} onChange={set('standard_days')} />
      <NumField label="Hours per day" value={s.hours_per_day} onChange={set('hours_per_day')} />
      <NumField label="PF %" value={s.pf_percent} onChange={set('pf_percent')} />
      <NumField label="ESI %" value={s.esi_percent} onChange={set('esi_percent')} />
      <NumField label="TDS %" value={s.tds_percent} onChange={set('tds_percent')} />
      {err && <Err>{err}</Err>}
      {saved && <div style={{ fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>✓ Saved. Applies to the next run you generate.</div>}
      <button type="button" onClick={save} disabled={busy} style={primary(busy)}>{busy ? 'Saving…' : 'Save'}</button>
    </Sheet>
  )
}

// ── advances ──────────────────────────────────────────────────────────────────
function AdvancesSheet({ onClose }) {
  const [list, setList] = useState(null)
  const [vendors, setVendors] = useState([])
  const [vid, setVid] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    const [aRes, vRes] = await Promise.all([
      supabase.from('payroll_advance').select('*, vendor:vendors(full_name)').is('run_id', null).order('given_at', { ascending: false }),
      supabase.from('vendors').select('id,full_name,vendor_code').eq('status', 'approved').order('full_name'),
    ])
    setList(aRes.data || []); setVendors(vRes.data || [])
  }, [])
  useEffect(() => { load() }, [load])
  async function add() {
    setErr('')
    if (!vid || !(Number(amount) > 0)) { setErr('Pick a vendor and an amount.'); return }
    setBusy(true)
    const { error } = await supabase.from('payroll_advance').insert({ vendor_id: vid, amount: Number(amount), note: note.trim() || null })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setAmount(''); setNote(''); setVid(''); load()
  }
  return (
    <Sheet title="Outstanding advances" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>Advances are recovered automatically from the vendor's next pay run.</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={lbl}>Vendor</span>
        <select value={vid} onChange={e => setVid(e.target.value)} style={inp}>
          <option value="">Select…</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.full_name}{v.vendor_code ? ` (${v.vendor_code})` : ''}</option>)}
        </select>
      </label>
      <NumField label="Amount" prefix="₹" value={amount} onChange={setAmount} />
      <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={lbl}>Note (optional)</span>
        <input value={note} onChange={e => setNote(e.target.value)} style={inp} placeholder="e.g. festival advance" />
      </label>
      {err && <Err>{err}</Err>}
      <button type="button" onClick={add} disabled={busy} style={primary(busy)}>{busy ? 'Adding…' : 'Add advance'}</button>
      <div style={{ height: 1, background: 'var(--border, #2e3040)', margin: '4px 0' }} />
      {list == null ? <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>Loading…</div>
        : list.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No outstanding advances.</div>
          : list.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)' }}>{a.vendor ? a.vendor.full_name : '—'}</div><div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDate(a.given_at)}{a.note ? ` · ${a.note}` : ''}</div></div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{money(a.amount)}</span>
            </div>
          ))}
    </Sheet>
  )
}

// ── edit one payroll item ─────────────────────────────────────────────────────
function Row({ label, children }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--border, #2e3040)', fontFamily: 'var(--font-mono, monospace)' }}><span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>{label}</span><span style={{ fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{children}</span></div>
}
function ItemEditSheet({ item, readOnly, onClose, onSaved }) {
  const [f, setF] = useState({ absence_deduction: item.absence_deduction, ot_amount: item.ot_amount, bonus: item.bonus, deduction: item.deduction, pf: item.pf, esi: item.esi, tds: item.tds, payment_status: item.payment_status, payment_method: item.payment_method || '', payment_ref: item.payment_ref || '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const net = Number(item.monthly_rate) - Number(f.absence_deduction || 0) + Number(f.ot_amount || 0) + Number(f.bonus || 0) - Number(f.deduction || 0) - Number(item.advance_recovered || 0) - Number(f.pf || 0) - Number(f.esi || 0) - Number(f.tds || 0)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    setBusy(true); setErr('')
    const patch = { absence_deduction: Number(f.absence_deduction || 0), ot_amount: Number(f.ot_amount || 0), bonus: Number(f.bonus || 0), deduction: Number(f.deduction || 0), pf: Number(f.pf || 0), esi: Number(f.esi || 0), tds: Number(f.tds || 0), payment_status: f.payment_status, payment_method: f.payment_method || null, payment_ref: f.payment_ref || null, paid_at: f.payment_status === 'paid' ? (item.paid_at || new Date().toISOString()) : null }
    const { error } = await supabase.from('payroll_item').update(patch).eq('id', item.id)
    setBusy(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }
  return (
    <Sheet title={item.vendor ? item.vendor.full_name : 'Payslip'} onClose={onClose}>
      <div style={{ background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '4px 14px 10px' }}>
        <Row label="Monthly rate">{money(item.monthly_rate)}</Row>
        <Row label="Present days">{item.present_days} / {item.standard_days}</Row>
        <Row label="Overtime">{Number(item.ot_hours)}h</Row>
        <Row label="Advance recovered">{money(item.advance_recovered)}</Row>
      </div>
      {readOnly
        ? <>
            <Row label="Absence deduction">{money(f.absence_deduction)}</Row>
            <Row label="Overtime pay">{money(f.ot_amount)}</Row>
            <Row label="Bonus">{money(f.bonus)}</Row>
            <Row label="Other deduction">{money(f.deduction)}</Row>
            <Row label="PF / ESI / TDS">{money(f.pf)} / {money(f.esi)} / {money(f.tds)}</Row>
          </>
        : <>
            <NumField label="Absence deduction" prefix="₹" value={f.absence_deduction} onChange={set('absence_deduction')} />
            <NumField label="Overtime pay" prefix="₹" value={f.ot_amount} onChange={set('ot_amount')} />
            <NumField label="Bonus" prefix="₹" value={f.bonus} onChange={set('bonus')} />
            <NumField label="Other deduction" prefix="₹" value={f.deduction} onChange={set('deduction')} />
            <div style={{ display: 'flex', gap: 8 }}>
              <NumField label="PF" prefix="₹" value={f.pf} onChange={set('pf')} />
              <NumField label="ESI" prefix="₹" value={f.esi} onChange={set('esi')} />
              <NumField label="TDS" prefix="₹" value={f.tds} onChange={set('tds')} />
            </div>
          </>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 10 }}>
        <span style={{ ...lbl, fontSize: 11 }}>Net payable</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{money(net)}</span>
      </div>

      <span style={lbl}>Payment</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {['pending', 'paid'].map(st => (
          <button key={st} type="button" disabled={readOnly} onClick={() => set('payment_status')(st)} style={{ flex: 1, padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: readOnly ? 'default' : 'pointer', fontFamily: 'var(--font-mono, monospace)', border: `1px solid ${f.payment_status === st ? (st === 'paid' ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)') : 'var(--border, #2e3040)'}`, background: f.payment_status === st ? (st === 'paid' ? 'rgba(61,186,122,0.12)' : 'rgba(200,150,62,0.12)') : 'var(--bg-input, #252731)', color: f.payment_status === st ? (st === 'paid' ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)') : 'var(--text-muted, #6b6d82)' }}>{st}</button>
        ))}
      </div>
      {f.payment_status === 'paid' && !readOnly && (
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}><span style={lbl}>Method</span><input value={f.payment_method} onChange={e => set('payment_method')(e.target.value)} style={inp} placeholder="bank / upi" /></label>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}><span style={lbl}>Reference</span><input value={f.payment_ref} onChange={e => set('payment_ref')(e.target.value)} style={inp} placeholder="txn id" /></label>
        </div>
      )}
      {err && <Err>{err}</Err>}
      {!readOnly && <button type="button" onClick={save} disabled={busy} style={primary(busy)}>{busy ? 'Saving…' : 'Save'}</button>}
    </Sheet>
  )
}
