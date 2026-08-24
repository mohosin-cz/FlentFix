import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fmtDate, initials, avatarColor } from '../../utils/vendorHub'
import { STAGE_LABEL, nextStage } from '../../utils/assetRequest'
import RequestStepper from '../../components/vendor/RequestStepper'

// Staff end of the request pipeline: approve or deny, then walk an approved
// request along until it is in the vendor's hands. The vendor logs the item
// itself once it is deployed, which is why there is no "logged" button here —
// that stage is theirs to reach.

const MONO = 'var(--font-mono, monospace)'

export default function AssetRequestsPanel({ vendors, onChanged }) {
  const { session } = useAuth()
  const actor = session?.user?.email || 'staff'
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [denying, setDenying] = useState(null)
  const [reason, setReason] = useState('')
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('vendor_asset_requests')
      .select('*').order('created_at', { ascending: false }).limit(500)
    setErr(error ? error.message : '')
    setRows(error ? [] : (data || []))
  }, [])

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  const vendorOf = id => vendors.find(v => v.id === id)

  async function patch(r, fields, label) {
    setBusy(r.id); setErr('')
    const { error } = await supabase.from('vendor_asset_requests').update(fields).eq('id', r.id)
    setBusy('')
    if (error) { setErr(error.message); return }
    setDenying(null); setReason('')
    load(); onChanged && onChanged()
    return label
  }

  const approve = r => patch(r, { status: 'pending_order', decided_by: actor, decided_at: new Date().toISOString(), deny_reason: null })
  const deny    = r => patch(r, { status: 'denied', decided_by: actor, decided_at: new Date().toISOString(), deny_reason: reason.trim() || null })
  const advance = r => {
    const nxt = nextStage(r.status)
    if (!nxt) return
    const stamp = { received: 'received_at', deployed: 'deployed_at' }[nxt.key]
    return patch(r, { status: nxt.key, ...(stamp ? { [stamp]: new Date().toISOString() } : {}) })
  }

  const all = rows || []
  const live = all.filter(r => !['logged', 'denied'].includes(r.status))
  const done = all.filter(r => ['logged', 'denied'].includes(r.status))
  const shown = showDone ? done : live

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Requests from vendors</span>
        <button type="button" className={`tct tct-raised${!showDone ? ' is-on' : ''}`} onClick={() => setShowDone(false)}
          style={{ height: 32, padding: '0 11px', fontSize: 12, cursor: 'pointer' }}>Open · {live.length}</button>
        <button type="button" className={`tct tct-raised${showDone ? ' is-on' : ''}`} onClick={() => setShowDone(true)}
          style={{ height: 32, padding: '0 11px', fontSize: 12, cursor: 'pointer' }}>Closed · {done.length}</button>
      </div>

      {err && (
        <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontFamily: MONO }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)' }}>⚠ Could not load requests</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', marginTop: 3, wordBreak: 'break-word' }}>{err}</div>
          {/relation|does not exist|schema cache/i.test(err) && (
            <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 5 }}>Run supabase/migrations/vendor_asset_requests.sql.</div>
          )}
        </div>
      )}

      {rows == null ? (
        <div style={{ padding: '18px 0', fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ padding: '22px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 10, lineHeight: 1.6 }}>
          {showDone ? 'Nothing closed yet.' : 'No open requests. Share the request link with vendors and they will appear here.'}
        </div>
      ) : shown.map(r => {
        const v = vendorOf(r.vendor_id)
        const nxt = nextStage(r.status)
        return (
          <div key={r.id} style={{ padding: '12px 13px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 11, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {v && (
                <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: MONO, background: avatarColor(v.full_name) + '22', color: avatarColor(v.full_name) }}>{initials(v.full_name)}</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>
                  {r.item_name}{r.quantity > 1 ? ` ×${r.quantity}` : ''}
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}> · {r.category}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v ? v.full_name : r.requested_email} · asked {fmtDate(r.created_at)}
                </div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, fontFamily: MONO, flexShrink: 0, color: r.status === 'denied' ? 'var(--red, #e05c6a)' : r.status === 'logged' ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)' }}>
                {r.status === 'denied' ? 'Denied' : STAGE_LABEL[r.status]}
              </span>
            </div>

            {r.reason && <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>“{r.reason}”</div>}

            {r.status !== 'denied' && <RequestStepper status={r.status} compact />}

            {denying === r.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why not? (optional, the vendor sees this)"
                  style={{ minHeight: 40, padding: '9px 11px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text, #e8e8f0)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => { setDenying(null); setReason('') }} className="tct tct-raised"
                    style={{ minHeight: 40, padding: '0 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="button" onClick={() => deny(r)} disabled={busy === r.id}
                    style={{ minWidth: 124, minHeight: 40, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--red, #e05c6a)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>Confirm deny</button>
                </div>
              </div>
            ) : r.status === 'requested' ? (
              // A card action is sized to its word, not to the card. flex:1
              // stretched Approve to 1551px on a desktop, which read as a
              // banner rather than a button.
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setDenying(r.id)} disabled={busy === r.id}
                  className="tct tct-raised"
                  style={{ minHeight: 40, padding: '0 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--red, #e05c6a)' }}>Deny</button>
                <button type="button" onClick={() => approve(r)} disabled={busy === r.id}
                  style={{ minWidth: 124, minHeight: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 13, fontWeight: 700, cursor: busy === r.id ? 'wait' : 'pointer', fontFamily: MONO, boxShadow: '0 2px 8px rgba(0,0,0,0.32)' }}>
                  {busy === r.id ? '…' : 'Approve'}
                </button>
              </div>
            ) : nxt ? (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => advance(r)} disabled={busy === r.id} className="tct tct-raised"
                  style={{ minHeight: 40, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {busy === r.id ? '…' : `Mark ${nxt.short.toLowerCase()} →`}
                </button>
              </div>
            ) : r.status === 'deployed' ? (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 }}>
                Waiting on {v ? v.full_name.split(' ')[0] : 'the vendor'} to log the item&rsquo;s details.
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
