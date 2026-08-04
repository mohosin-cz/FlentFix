import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import LogoSpinner from '../components/LogoSpinner'

import { UTILITY_TYPES, BILLING_CYCLES, STATUSES, STATUS_MAP, fmtDate, typeLabel, typeIcon, dueInfo } from '../utils/propertyUtils'

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)',
      borderRadius: 8, padding: '10px 18px', fontSize: 13, color: 'var(--text-dim, #9394a8)',
      fontFamily: 'var(--font-mono, monospace)', zIndex: 300, whiteSpace: 'nowrap',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>{msg}</div>
  )
}

function SectionLabel({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 12px' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {children}
      </p>
      {action}
    </div>
  )
}

// ── Shared input styles ──────────────────────────────────────────────────────
const inputStyle = {
  background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
  borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text, #e8e8f0)',
  fontFamily: 'var(--font-sans, Poppins, sans-serif)', outline: 'none', width: '100%', boxSizing: 'border-box',
}
const labelStyle = {
  fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block',
}
function Labeled({ label, children, span }) {
  return (
    <div style={{ gridColumn: span ? '1 / -1' : 'auto' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

// ── Add / edit bottom-sheet ──────────────────────────────────────────────────
const BLANK = {
  utility_type: 'wifi', custom_type: '', provider: '', plan_type: '',
  account_number: '', start_date: '', billing_amount: '', billing_cycle: 'Monthly',
  status: 'active', notes: '',
}

function UtilityForm({ record, pid, userEmail, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...BLANK,
    ...(record || {}),
    billing_amount: record?.billing_amount ?? '',
    start_date: record?.start_date || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const isEdit = !!record?.id
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (saving) return
    if (form.utility_type === 'other' && !form.custom_type.trim()) {
      setError('Give this utility a name.'); return
    }
    setSaving(true); setError(null)
    const payload = {
      pid,
      utility_type: form.utility_type,
      custom_type: form.utility_type === 'other' ? form.custom_type.trim() : null,
      provider: form.provider.trim() || null,
      plan_type: form.plan_type.trim() || null,
      account_number: form.account_number.trim() || null,
      start_date: form.start_date || null,
      billing_amount: form.billing_amount === '' ? null : Number(form.billing_amount),
      billing_cycle: form.billing_cycle || null,
      status: form.status,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }
    let err
    if (isEdit) {
      ({ error: err } = await supabase.from('property_utilities').update(payload).eq('id', record.id))
    } else {
      payload.created_by = userEmail || null
      ;({ error: err } = await supabase.from('property_utilities').insert(payload))
    }
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(isEdit ? 'Utility updated' : 'Utility added')
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: 'var(--bg-panel, #1e2028)', borderTop: '1px solid var(--border, #2e3040)', borderRadius: '16px 16px 0 0', padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border, #2e3040)', margin: '-4px auto 4px', flexShrink: 0 }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>
          {isEdit ? 'Edit utility' : 'Add utility'}
        </div>

        {/* Type picker */}
        <div>
          <label style={labelStyle}>Type</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {UTILITY_TYPES.map(t => {
              const on = form.utility_type === t.key
              return (
                <button key={t.key} onClick={() => set('utility_type', t.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans, Poppins, sans-serif)',
                    background: on ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)',
                    border: `1px solid ${on ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
                    color: on ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontWeight: on ? 600 : 400 }}>
                  <span>{t.icon}</span>{t.label}
                </button>
              )
            })}
          </div>
        </div>

        {form.utility_type === 'other' && (
          <Labeled label="Utility name">
            <input style={inputStyle} value={form.custom_type} onChange={e => set('custom_type', e.target.value)} placeholder="e.g. Newspaper, Milk delivery" autoFocus />
          </Labeled>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Labeled label="Provider">
            <input style={inputStyle} value={form.provider} onChange={e => set('provider', e.target.value)} placeholder="ACT, Kent…" />
          </Labeled>
          <Labeled label="Plan type">
            <input style={inputStyle} value={form.plan_type} onChange={e => set('plan_type', e.target.value)} placeholder="Rental / 100 Mbps…" />
          </Labeled>
          <Labeled label="Account / consumer no." span>
            <input style={inputStyle} value={form.account_number} onChange={e => set('account_number', e.target.value)} placeholder="Account number" />
          </Labeled>
          <Labeled label="Start date">
            <input style={inputStyle} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </Labeled>
          <Labeled label="Amount (₹)">
            <input style={inputStyle} type="number" inputMode="decimal" value={form.billing_amount} onChange={e => set('billing_amount', e.target.value)} placeholder="0" />
          </Labeled>
          <Labeled label="Billing cycle">
            <select style={inputStyle} value={form.billing_cycle} onChange={e => set('billing_cycle', e.target.value)}>
              {BILLING_CYCLES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Labeled>
          <Labeled label="Status">
            <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
            </select>
          </Labeled>
          <Labeled label="Notes" span>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything worth remembering…" />
          </Labeled>
        </div>

        {error && <div style={{ fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono, monospace)', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '11px 0', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim, #9394a8)', cursor: saving ? 'default' : 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '11px 0', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#000', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add utility'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirm ───────────────────────────────────────────────────────────
function ConfirmDelete({ label, onCancel, onConfirm, busy }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{ width: '100%', maxWidth: 360, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Delete {label}?</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.6 }}>This removes the record permanently. This cannot be undone.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} disabled={busy} style={{ flex: 1, padding: '10px 0', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim, #9394a8)', cursor: busy ? 'default' : 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ flex: 1, padding: '10px 0', background: busy ? 'var(--bg-input, #252731)' : '#ef4444', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Utility card ─────────────────────────────────────────────────────────────
function UtilityCard({ u, onEdit, onDelete }) {
  const st = STATUS_MAP[u.status] || STATUS_MAP.active
  const rows = [
    ['Provider', u.provider],
    ['Plan', u.plan_type],
    ['Account', u.account_number],
    ['Start', u.start_date ? fmtDate(u.start_date) : null],
    ['Billing', u.billing_amount != null ? `₹${Number(u.billing_amount).toLocaleString('en-IN')}${u.billing_cycle ? ' · ' + u.billing_cycle : ''}` : null],
  ].filter(([, v]) => v)

  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{typeIcon(u)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{typeLabel(u)}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 3, fontFamily: 'var(--font-mono, monospace)', color: st.color, border: `1px solid ${st.color}`, opacity: 0.9 }}>{st.label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => onEdit(u)} title="Edit" style={iconBtn}>✎</button>
          <button onClick={() => onDelete(u)} title="Delete" style={{ ...iconBtn, color: '#f87171' }}>🗑</button>
        </div>
      </div>

      {(() => {
        const di = dueInfo(u)
        if (!di) return null
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '9px 12px', borderRadius: 8, background: di.tone === 'ok' ? 'var(--bg-input, #252731)' : `${di.color}18`, border: `1px solid ${di.tone === 'ok' ? 'var(--border, #2e3040)' : di.color + '55'}` }}>
            <span style={{ fontSize: 14 }}>{di.tone === 'due' ? '🔔' : '🗓'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: di.color, fontFamily: 'var(--font-mono, monospace)' }}>{di.label}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDate(di.date)}</span>
          </div>
        )
      })()}

      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', marginTop: 12 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{k}</span>
              <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word' }}>{v}</span>
            </div>
          ))}
        </div>
      )}
      {u.notes && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border, #2e3040)', fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{u.notes}</div>
      )}
    </div>
  )
}
const iconBtn = {
  width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
  borderRadius: 6, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontSize: 13,
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PropertyUtilities() {
  const navigate = useNavigate()
  const { pid } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [utilities, setUtilities] = useState([])
  const [userEmail, setUserEmail] = useState(null)
  const [toast, setToast] = useState('')

  // access (lockbox)
  const [lockbox, setLockbox] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [accessDirty, setAccessDirty] = useState(false)
  const [savingAccess, setSavingAccess] = useState(false)

  // modals
  const [formRecord, setFormRecord] = useState(undefined) // undefined = closed, null = new, obj = edit
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    setError(null)
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email || null))
    const [{ data: utils, error: uErr }, { data: acc }] = await Promise.all([
      supabase.from('property_utilities').select('*').eq('pid', pid).order('created_at', { ascending: true }),
      supabase.from('property_access').select('lockbox_code, access_notes').eq('pid', pid).maybeSingle(),
    ])
    if (uErr) { setError(uErr.message); setLoading(false); return }
    setUtilities(utils || [])
    setLockbox(acc?.lockbox_code || '')
    setAccessNotes(acc?.access_notes || '')
    setAccessDirty(false)
    setLoading(false)
  }, [pid])

  const { pullDistance, isRefreshing } = usePullToRefresh(fetchData)
  useEffect(() => { fetchData() }, [fetchData])

  async function saveAccess() {
    if (savingAccess) return
    setSavingAccess(true)
    const { error: err } = await supabase.from('property_access').upsert({
      pid,
      lockbox_code: lockbox.trim() || null,
      access_notes: accessNotes.trim() || null,
      updated_by: userEmail || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pid' })
    setSavingAccess(false)
    if (err) { setToast('Save failed: ' + err.message); return }
    setAccessDirty(false)
    setToast('Access saved')
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    const { error: err } = await supabase.from('property_utilities').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (err) { setToast('Delete failed: ' + err.message); return }
    setUtilities(prev => prev.filter(u => u.id !== deleteTarget.id))
    setDeleteTarget(null)
    setToast('Utility deleted')
  }

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={s.page}>
        {/* Header */}
        <header style={s.header}>
          <button style={s.backBtn} onClick={() => navigate(`/properties/${pid}`)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={s.headerCenter}>
            <span style={s.headerTitle}>Utilities & Access</span>
            <span style={s.headerSub}>PID {pid}</span>
          </div>
          <div style={{ width: 36 }} />
        </header>

        <main style={s.main}>
          {loading ? (
            <LogoSpinner />
          ) : error ? (
            <div style={{ padding: '16px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: '#f87171', fontFamily: 'var(--font-mono, monospace)' }}>Couldn't load: {error}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.6 }}>
                If the tables don't exist yet, run <code>supabase/migrations/add_property_utilities.sql</code> in the Supabase SQL editor.
              </div>
              <button onClick={() => { setLoading(true); fetchData() }} style={{ alignSelf: 'flex-start', padding: '7px 14px', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 6, fontSize: 12, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}>Retry</button>
            </div>
          ) : (
            <>
              {/* ── Access / lockbox ── */}
              <SectionLabel>Access</SectionLabel>
              <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderLeft: '3px solid var(--accent, #c8963e)', borderRadius: 10, padding: 16, marginBottom: 28 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>🔒 Lockbox code</label>
                    <input
                      style={{ ...inputStyle, fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.15em', fontSize: 18, fontWeight: 700 }}
                      value={lockbox}
                      onChange={e => { setLockbox(e.target.value); setAccessDirty(true) }}
                      placeholder="––––"
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Access notes</label>
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
                      value={accessNotes}
                      onChange={e => { setAccessNotes(e.target.value); setAccessDirty(true) }}
                      placeholder="Gate code, key location, guard contact, parking…"
                    />
                  </div>
                </div>
                {accessDirty && (
                  <button onClick={saveAccess} disabled={savingAccess} style={{ marginTop: 14, width: '100%', padding: '10px 0', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#000', cursor: savingAccess ? 'default' : 'pointer', opacity: savingAccess ? 0.7 : 1 }}>
                    {savingAccess ? 'Saving…' : 'Save access'}
                  </button>
                )}
              </div>

              {/* ── Utilities ── */}
              <SectionLabel action={
                <button onClick={() => setFormRecord(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                  + Add
                </button>
              }>Subscriptions & Rentals</SectionLabel>

              {utilities.length === 0 ? (
                <div style={{ padding: '28px 16px', border: '1px dashed rgba(200,150,62,0.2)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textAlign: 'center', lineHeight: 1.7 }}>
                  No utilities logged yet.<br />Add WiFi, water purifier, gas, electricity and maintenance — the system tracks the next recharge for each.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {utilities.map(u => (
                    <UtilityCard key={u.id} u={u} onEdit={setFormRecord} onDelete={setDeleteTarget} />
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        {formRecord !== undefined && (
          <UtilityForm
            record={formRecord}
            pid={pid}
            userEmail={userEmail}
            onClose={() => setFormRecord(undefined)}
            onSaved={(msg) => { setFormRecord(undefined); setToast(msg); fetchData() }}
          />
        )}

        {deleteTarget && (
          <ConfirmDelete
            label={typeLabel(deleteTarget)}
            busy={deleting}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={confirmDelete}
          />
        )}

        {toast && <Toast msg={toast} onClose={() => setToast('')} />}
      </div>
    </>
  )
}

const s = {
  page: {
    minHeight: '100svh', background: 'var(--bg, #16171f)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10,
  },
  backBtn: {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
    borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer',
  },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  main: { flex: 1, padding: '24px 20px 48px', maxWidth: 600, width: '100%', margin: '0 auto' },
}
