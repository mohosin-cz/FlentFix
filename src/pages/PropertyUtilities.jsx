import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import LogoSpinner from '../components/LogoSpinner'
import {
  ADD_TYPES, TYPE_MAP, BILLING_CYCLES, STATUSES, STATUS_MAP,
  fmtDate, typeLabel, typeIcon, typeColor, dueInfo,
} from '../utils/propertyUtils'

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'
const todayISO = () => new Date().toISOString().slice(0, 10)
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')

// ── small primitives ─────────────────────────────────────────────────────────
function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t) }, [onClose])
  return <div style={{ position: 'fixed', bottom: 84, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '11px 18px', fontSize: 13, color: 'var(--text, #e8e8f0)', fontFamily: SANS, zIndex: 300, whiteSpace: 'nowrap', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>{msg}</div>
}

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)
const CheckIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

function CopyBtn({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false)
  useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1400); return () => clearTimeout(t) }, [done])
  async function copy() {
    try { await navigator.clipboard.writeText(String(value)) } catch { return }
    setDone(true)
  }
  return (
    <button onClick={copy} title={label} aria-label={label} style={{ flexShrink: 0, alignSelf: 'center', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: done ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)', cursor: 'pointer' }}>
      {done ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

const inputStyle = { background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, padding: '11px 13px', fontSize: 15, color: 'var(--text, #e8e8f0)', fontFamily: SANS, outline: 'none', width: '100%', boxSizing: 'border-box' }
const labelStyle = { fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 6, display: 'block' }
function Labeled({ label, children, span }) {
  return <div style={{ gridColumn: span ? '1 / -1' : 'auto' }}><label style={labelStyle}>{label}</label>{children}</div>
}
function Sheet({ title, subtitle, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(8,9,13,0.6)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg-panel, #1e2028)', borderTop: '1px solid var(--border, #2e3040)', borderRadius: '18px 18px 0 0', padding: '18px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border, #2e3040)', margin: '-4px auto 2px', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3 }}>{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}

// ── add / edit ───────────────────────────────────────────────────────────────
const BLANK = { utility_type: 'wifi', custom_type: '', provider: '', plan_type: '', account_number: '', ssid: '', password: '', start_date: '', billing_amount: '', billing_cycle: 'Monthly', status: 'active', notes: '' }

// a saved record carries nulls for empty text columns — coerce them back to ''
// so the inputs stay controlled and .trim() on save can't throw
const toForm = (record) => {
  const f = { ...BLANK, ...(record || {}) }
  for (const k of Object.keys(BLANK)) if (typeof BLANK[k] === 'string' && f[k] == null) f[k] = ''
  return { ...f, billing_amount: record?.billing_amount ?? '', start_date: record?.start_date || '' }
}

function UtilityForm({ record, pid, userEmail, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(record))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const isEdit = !!record?.id
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // show the current type even if it's a legacy one no longer offered (e.g. gas)
  const picker = record && !ADD_TYPES.some(t => t.key === record.utility_type) && TYPE_MAP[record.utility_type]
    ? [TYPE_MAP[record.utility_type], ...ADD_TYPES] : ADD_TYPES

  async function handleSave() {
    if (saving) return
    if (form.utility_type === 'other' && !form.custom_type.trim()) { setError('Give this utility a name.'); return }
    setSaving(true); setError(null)
    const payload = {
      pid, utility_type: form.utility_type,
      custom_type: form.utility_type === 'other' ? form.custom_type.trim() : null,
      provider: form.provider.trim() || null, plan_type: form.plan_type.trim() || null,
      account_number: form.account_number.trim() || null, start_date: form.start_date || null,
      ssid: form.ssid.trim() || null, password: form.password.trim() || null,
      billing_amount: form.billing_amount === '' ? null : Number(form.billing_amount),
      billing_cycle: form.billing_cycle || null, status: form.status,
      notes: form.notes.trim() || null, updated_at: new Date().toISOString(),
    }
    let err
    if (isEdit) ({ error: err } = await supabase.from('property_utilities').update(payload).eq('id', record.id))
    else { payload.created_by = userEmail || null; ({ error: err } = await supabase.from('property_utilities').insert(payload)) }
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(isEdit ? 'Utility updated' : 'Utility added')
  }

  return (
    <Sheet title={isEdit ? 'Edit utility' : 'Add utility'} onClose={onClose}>
      <div>
        <label style={labelStyle}>Type</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {picker.map(t => {
            const on = form.utility_type === t.key
            return (
              <button key={t.key} onClick={() => set('utility_type', t.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, fontSize: 13, cursor: 'pointer', fontFamily: SANS, background: on ? `${t.color}1e` : 'var(--bg-input, #252731)', border: `1px solid ${on ? t.color : 'var(--border, #2e3040)'}`, color: on ? t.color : 'var(--text-dim, #9394a8)', fontWeight: on ? 600 : 400 }}>
                <span>{t.icon}</span>{t.label}
              </button>
            )
          })}
        </div>
      </div>

      {form.utility_type === 'other' && (
        <Labeled label="Utility name"><input style={inputStyle} value={form.custom_type} onChange={e => set('custom_type', e.target.value)} placeholder="e.g. Newspaper, Milk delivery" autoFocus /></Labeled>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Labeled label="Provider"><input style={inputStyle} value={form.provider} onChange={e => set('provider', e.target.value)} placeholder="ACT, DrinkPrime…" /></Labeled>
        <Labeled label="Plan"><input style={inputStyle} value={form.plan_type} onChange={e => set('plan_type', e.target.value)} placeholder="150 Mbps / rental…" /></Labeled>
        <Labeled label="Account / consumer no."><input style={inputStyle} value={form.account_number} onChange={e => set('account_number', e.target.value)} placeholder="Account number" /></Labeled>
        {form.utility_type === 'wifi' && <Labeled label="Network (SSID)"><input style={inputStyle} value={form.ssid} onChange={e => set('ssid', e.target.value)} placeholder="Flent_304" /></Labeled>}
        <Labeled label="Password" span={form.utility_type !== 'wifi'}><input style={inputStyle} value={form.password} onChange={e => set('password', e.target.value)} placeholder="WiFi / portal password" /></Labeled>
        <Labeled label="Installation / start date"><input style={inputStyle} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></Labeled>
        <Labeled label="Amount (₹)"><input style={inputStyle} type="number" inputMode="decimal" value={form.billing_amount} onChange={e => set('billing_amount', e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Billing cycle"><select style={inputStyle} value={form.billing_cycle} onChange={e => set('billing_cycle', e.target.value)}>{BILLING_CYCLES.map(c => <option key={c} value={c}>{c}</option>)}</select></Labeled>
        <Labeled label="Status"><select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>{STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}</select></Labeled>
        <Labeled label="Notes" span><textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything worth remembering…" /></Labeled>
      </div>

      {error && <div style={{ fontSize: 12, color: '#f87171', fontFamily: MONO, padding: '9px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
        <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '12px 0', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 9, fontSize: 14, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontFamily: SANS }}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '12px 0', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, color: '#1a1206', cursor: 'pointer', fontFamily: SANS, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add utility'}</button>
      </div>
    </Sheet>
  )
}

// ── log a recharge (+ history) ────────────────────────────────────────────────
function RechargeSheet({ utility, userEmail, onClose, onSaved }) {
  const [history, setHistory] = useState(null)
  const [date, setDate] = useState(todayISO)
  const [amount, setAmount] = useState(utility.billing_amount ?? '')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('property_utility_recharges').select('*').eq('utility_id', utility.id).order('recharged_on', { ascending: false })
    setHistory(data || [])
  }, [utility.id])
  useEffect(() => { load() }, [load])

  async function save() {
    if (saving || !date) return
    setSaving(true); setError(null)
    const { error: rErr } = await supabase.from('property_utility_recharges').insert({ utility_id: utility.id, recharged_on: date, amount: amount === '' ? null : Number(amount), note: note.trim() || null, created_by: userEmail || null })
    if (rErr) { setError(rErr.message); setSaving(false); return }
    const latest = (!utility.last_recharged_on || date > utility.last_recharged_on) ? date : utility.last_recharged_on
    await supabase.from('property_utilities').update({ last_recharged_on: latest, updated_at: new Date().toISOString() }).eq('id', utility.id)
    onSaved('Recharge logged')
  }

  return (
    <Sheet title="Log a recharge" subtitle={`${typeLabel(utility)}${utility.provider ? ' · ' + utility.provider : ''}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Labeled label="Recharged on"><input style={inputStyle} type="date" max={todayISO()} value={date} onChange={e => setDate(e.target.value)} /></Labeled>
        <Labeled label="Amount (₹)"><input style={inputStyle} type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" /></Labeled>
        <Labeled label="Note" span><input style={inputStyle} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional — reference, next-due tweak…" /></Labeled>
      </div>
      {error && <div style={{ fontSize: 12, color: '#f87171', fontFamily: MONO, padding: '9px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 8 }}>{error}</div>}
      <button onClick={save} disabled={saving} style={{ padding: '12px 0', background: 'var(--green, #3dba7a)', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, color: '#062012', cursor: 'pointer', fontFamily: SANS, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : '✓ Log recharge'}</button>

      <div>
        <label style={labelStyle}>History</label>
        {history === null ? <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, padding: '4px 0' }}>Loading…</div>
          : history.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, padding: '4px 0' }}>No recharges logged yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border, #2e3040)' }}>
              {history.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-input, #252731)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: MONO }}>{fmtDate(h.recharged_on)}</span>
                  {h.amount != null && <span style={{ fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>{money(h.amount)}</span>}
                  {h.note && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: SANS, marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.note}</span>}
                </div>
              ))}
            </div>}
      </div>
    </Sheet>
  )
}

// ── delete confirm ───────────────────────────────────────────────────────────
function ConfirmDelete({ label, onCancel, onConfirm, busy }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(8,9,13,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{ width: '100%', maxWidth: 360, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>Delete {label}?</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.6, fontFamily: SANS }}>This removes the record and its recharge log permanently.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={busy} style={{ flex: 1, padding: '11px 0', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 9, fontSize: 14, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontFamily: SANS }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: '11px 0', background: busy ? 'var(--bg-input, #252731)' : '#ef4444', border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: SANS }}>{busy ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  )
}

// ── utility card ─────────────────────────────────────────────────────────────
const iconBtn = { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontSize: 13 }

function UtilityCard({ u, onRecharge, onEdit, onDelete }) {
  const st = STATUS_MAP[u.status] || STATUS_MAP.active
  const color = typeColor(u)
  const di = dueInfo(u)
  // account / network / password travel together — one copy button hands over all three
  const creds = [
    u.account_number && { k: 'Account', v: u.account_number },
    u.ssid && { k: 'Network', v: u.ssid },
    (u.password || u.wifi_password) && { k: 'Password', v: u.password || u.wifi_password },
  ].filter(Boolean)
  const credText = creds.map(c => `${c.k}: ${c.v}`).join('\n')
  const details = [
    u.billing_amount != null && { k: 'Amount', v: `${money(u.billing_amount)}${u.billing_cycle ? ' · ' + u.billing_cycle : ''}` },
    { k: 'Installed', v: u.start_date ? fmtDate(u.start_date) : '—' },
    u.last_recharged_on && { k: 'Last recharged', v: fmtDate(u.last_recharged_on) },
  ].filter(Boolean)

  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, background: `${color}22`, border: `1px solid ${color}44` }}>{typeIcon(u)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15.5, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>{typeLabel(u)}</span>
            {u.status !== 'active' && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px', borderRadius: 4, fontFamily: MONO, color: st.color, border: `1px solid ${st.color}`, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{st.label}</span>}
          </div>
          {(u.provider || u.plan_type) && <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[u.provider, u.plan_type].filter(Boolean).join(' · ')}</div>}
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button onClick={() => onEdit(u)} title="Edit" style={iconBtn}>✎</button>
          <button onClick={() => onDelete(u)} title="Delete" style={{ ...iconBtn, color: '#f87171' }}>🗑</button>
        </div>
      </div>

      {di && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', borderRadius: 10, background: di.tone === 'ok' ? 'var(--bg-input, #252731)' : `${di.color}18`, border: `1px solid ${di.tone === 'ok' ? 'var(--border, #2e3040)' : di.color + '55'}` }}>
          <span style={{ fontSize: 15 }}>{di.tone === 'due' ? '🔔' : '🗓'}</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: di.color, fontFamily: SANS }}>{di.label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{fmtDate(di.date)}</span>
        </div>
      )}

      {creds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, padding: '11px 12px', borderRadius: 10, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {creds.map(c => (
              <div key={c.k} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, minWidth: 68, flexShrink: 0 }}>{c.k}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text, #e8e8f0)', fontFamily: MONO, wordBreak: 'break-word' }}>{c.v}</span>
              </div>
            ))}
          </div>
          <CopyBtn value={credText} label={`Copy ${creds.map(c => c.k.toLowerCase()).join(', ')}`} />
        </div>
      )}

      {details.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {details.map(d => (
            <div key={d.k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, minWidth: 92, flexShrink: 0 }}>{d.k}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text, #e8e8f0)', fontFamily: MONO, wordBreak: 'break-word' }}>{d.v}</span>
            </div>
          ))}
        </div>
      )}
      {u.notes && <div style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: SANS }}>{u.notes}</div>}

      <button onClick={() => onRecharge(u)} style={{ padding: '10px 0', background: 'rgba(61,186,122,0.1)', border: '1px solid rgba(61,186,122,0.35)', borderRadius: 9, fontSize: 13, fontWeight: 700, color: 'var(--green, #3dba7a)', cursor: 'pointer', fontFamily: SANS }}>↻ Log recharge</button>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function PropertyUtilities() {
  const navigate = useNavigate()
  const { pid } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [utilities, setUtilities] = useState([])
  const [userEmail, setUserEmail] = useState(null)
  const [toast, setToast] = useState('')

  const [formRecord, setFormRecord] = useState(undefined) // undefined closed, null new, obj edit
  const [rechargeTarget, setRechargeTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    setError(null)
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email || null))
    const { data: utils, error: uErr } = await supabase
      .from('property_utilities').select('*').eq('pid', pid).order('created_at', { ascending: true })
    if (uErr) { setError(uErr.message); setLoading(false); return }
    setUtilities(utils || [])
    setLoading(false)
  }, [pid])

  const { pullDistance, isRefreshing } = usePullToRefresh(fetchData)
  useEffect(() => { fetchData() }, [fetchData])

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    const { error: err } = await supabase.from('property_utilities').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (err) { setToast('Delete failed: ' + err.message); return }
    setUtilities(prev => prev.filter(u => u.id !== deleteTarget.id))
    setDeleteTarget(null); setToast('Utility deleted')
  }

  // soonest recharge first; scheduleless last
  const sorted = [...utilities].sort((a, b) => {
    const ad = dueInfo(a), bd = dueInfo(b)
    return (ad ? ad.days : Infinity) - (bd ? bd.days : Infinity)
  })

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={st.page}>
        <header style={st.header}>
          <button style={st.backBtn} onClick={() => navigate(`/properties/${pid}`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>Utilities &amp; Access</span>
          <div style={{ width: 36 }} />
        </header>

        <main style={st.main}>
          {/* highlighted PID */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 10, background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.4)' }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--accent, #c8963e)', fontFamily: MONO }}>PID</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text, #e8e8f0)', fontFamily: MONO, letterSpacing: '0.02em' }}>{pid}</span>
            </div>
          </div>

          {loading ? <LogoSpinner /> : error ? (
            <div style={{ padding: 16, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, fontSize: 13, color: '#f87171', fontFamily: MONO }}>Couldn’t load: {error}</div>
          ) : (
            <>
              {/* Utilities */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Utilities &amp; recharges</span>
                <button onClick={() => setFormRecord(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#1a1206', cursor: 'pointer', fontFamily: SANS }}>+ Add</button>
              </div>

              {sorted.length === 0 ? (
                <div style={{ padding: '34px 18px', border: '1px dashed rgba(200,150,62,0.25)', borderRadius: 12, fontSize: 13, color: 'var(--text-muted, #6b6d82)', fontFamily: SANS, textAlign: 'center', lineHeight: 1.7 }}>
                  No utilities yet.<br />Add WiFi, water purifier or another service — the next recharge is tracked for you.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {sorted.map(u => <UtilityCard key={u.id} u={u} onRecharge={setRechargeTarget} onEdit={setFormRecord} onDelete={setDeleteTarget} />)}
                </div>
              )}
            </>
          )}
        </main>

        {formRecord !== undefined && <UtilityForm record={formRecord} pid={pid} userEmail={userEmail} onClose={() => setFormRecord(undefined)} onSaved={(msg) => { setFormRecord(undefined); setToast(msg); fetchData() }} />}
        {rechargeTarget && <RechargeSheet utility={rechargeTarget} userEmail={userEmail} onClose={() => setRechargeTarget(null)} onSaved={(msg) => { setRechargeTarget(null); setToast(msg); fetchData() }} />}
        {deleteTarget && <ConfirmDelete label={typeLabel(deleteTarget)} busy={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />}
        {toast && <Toast msg={toast} onClose={() => setToast('')} />}
      </div>
    </>
  )
}

const st = {
  page: { minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: 'var(--text, #e8e8f0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  main: { flex: 1, padding: '24px 20px 48px', maxWidth: 600, width: '100%', margin: '0 auto' },
}
