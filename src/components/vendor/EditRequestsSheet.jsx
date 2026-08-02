import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const FIELD_LABELS = {
  phone: 'Phone', alt_phone: 'Alt phone', address_line: 'Address', city: 'City', pincode: 'Pincode',
  bank_account_name: 'Account name', bank_account_no: 'Account no.', bank_ifsc: 'IFSC', upi_id: 'UPI ID',
  pan_number: 'PAN', dl_number: 'Licence no.', dl_expiry: 'Licence expiry',
}
const mono = 'var(--font-mono, monospace)'
const mask = (v) => (v ? '•••• ' + String(v).slice(-4) : '—')
const fmtWhen = (t) => { try { return new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return '' } }

const SELECT = 'id,status,reason,requested_at,expires_at,proposed,vendor:vendors(full_name,vendor_code,phone,alt_phone,address_line,city,pincode,bank_account_name,bank_account_no,bank_ifsc,upi_id,pan_number,dl_number,dl_expiry)'

// Staff panel: grant a 1-hour edit window (requested), then review + apply the
// actual proposed values (submitted). Vendor edits never go live without this.
export default function EditRequestsSheet({ onClose, onChange }) {
  const [rows, setRows] = useState(null)
  const [busyId, setBusyId] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('vendor_edit_requests').select(SELECT)
      .in('status', ['requested', 'submitted']).order('requested_at', { ascending: true })
    if (error) { setErr(error.message); return }
    setRows(data || [])
    if (onChange) onChange((data || []).length)
  }, [onChange])
  useEffect(() => { load() }, [load])

  async function act(id, fn, params) {
    setBusyId(id); setErr('')
    const { error } = await supabase.rpc(fn, params)
    setBusyId('')
    if (error) { setErr(error.message); return }
    load()
  }
  const grant = (id) => act(id, 'vendor_grant_edit', { p_request_id: id })
  const apply = (id) => act(id, 'vendor_apply_edit', { p_request_id: id })
  const deny = (id) => { if (window.confirm('Decline this request?')) act(id, 'vendor_deny_edit', { p_request_id: id, p_note: null }) }

  const btn = (bg) => ({ flex: 1, padding: '9px 10px', fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: 'pointer', fontFamily: mono, border: 'none', background: bg, color: '#fff' })
  const denyBtn = { padding: '9px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: mono, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--red, #e05c6a)' }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,9,13,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', overflowY: 'auto', padding: '20px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', background: 'var(--bg, #16171f)', border: '1px solid var(--border, #2e3040)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: mono }}>Profile edit requests</div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}>✕</button>
        </div>
        {err && <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: mono }}>⚠ {err}</div>}

        {rows === null ? <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: mono }}>Loading…</div>
          : rows.length === 0 ? <div style={{ padding: '32px 16px', textAlign: 'center' }}><div style={{ fontSize: 26, marginBottom: 8 }}>✓</div><div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No pending requests</div><div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>Vendors’ edit requests will appear here.</div></div>
          : rows.map(r => {
            const v = r.vendor || {}
            const proposed = r.proposed || {}
            const keys = Object.keys(proposed)
            return (
              <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '13px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{v.full_name || '—'}</span>
                  {v.vendor_code && <span style={{ fontSize: 11, color: 'var(--green, #3dba7a)', fontFamily: mono }}>{v.vendor_code}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: r.status === 'submitted' ? '#5b8def' : 'var(--accent, #c8963e)', border: `1px solid ${r.status === 'submitted' ? '#5b8def' : 'var(--accent, #c8963e)'}`, borderRadius: 8, padding: '2px 7px', fontFamily: mono }}>{r.status === 'submitted' ? 'changes in' : 'wants access'}</span>
                </div>

                {r.status === 'requested' ? <>
                  {r.reason && <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>“{r.reason}”</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: mono }}>Requested {fmtWhen(r.requested_at)}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" disabled={busyId === r.id} onClick={() => grant(r.id)} style={btn('var(--green, #3dba7a)')}>{busyId === r.id ? '…' : 'Grant 1-hour access'}</button>
                    <button type="button" disabled={busyId === r.id} onClick={() => deny(r.id)} style={denyBtn}>Decline</button>
                  </div>
                </> : <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
                    {keys.length === 0 ? <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: mono }}>No changes.</span>
                      : keys.map(k => {
                        const oldV = k === 'bank_account_no' ? mask(v[k]) : (v[k] || '—')
                        const newV = (proposed[k] === '' || proposed[k] == null) ? '(cleared)' : proposed[k]
                        return (
                          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 12, fontFamily: mono, alignItems: 'baseline' }}>
                            <span style={{ color: 'var(--text-muted, #6b6d82)', minWidth: 96, flexShrink: 0 }}>{FIELD_LABELS[k] || k}</span>
                            <span style={{ color: 'var(--text-muted, #6b6d82)', textDecoration: 'line-through', wordBreak: 'break-word' }}>{oldV}</span>
                            <span style={{ color: 'var(--text-muted, #6b6d82)' }}>→</span>
                            <span style={{ color: 'var(--green, #3dba7a)', fontWeight: 700, flex: 1, wordBreak: 'break-word' }}>{newV}</span>
                          </div>
                        )
                      })}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" disabled={busyId === r.id} onClick={() => apply(r.id)} style={btn('var(--accent, #c8963e)')}>{busyId === r.id ? '…' : 'Apply changes'}</button>
                    <button type="button" disabled={busyId === r.id} onClick={() => deny(r.id)} style={denyBtn}>Decline</button>
                  </div>
                </>}
              </div>
            )
          })}
      </div>
    </div>
  )
}
