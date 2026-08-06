import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { belongsInEstimate } from '../../utils/generateEstimate'

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

// Inspection trades are free text; work orders use a fixed vocabulary. Anything
// not in this map — including the 'misc' value and NULL, which together account
// for the majority of untriaged rows — canonicalises to MISC rather than being
// dropped. A vendor arriving with an incomplete list is the failure to avoid.
const TRADE_MAP = {
  woodwork: 'Carpenter',
  carpentry: 'Carpenter',
  plumbing: 'Plumber',
  electrical: 'Electrician',
  cleaning: 'Cleaner',
  painting: 'Painter',
}
const MISC = 'Misc'
const canonTrade = (raw) => TRADE_MAP[(raw || '').trim().toLowerCase()] || MISC
const tradeLabel = (t) => (t === MISC ? 'Misc / untriaged' : t)
// display order: known trades first, misc last so it reads as the leftovers pile
const TRADE_ORDER = ['Carpenter', 'Electrician', 'Plumber', 'Painter', 'Cleaner', MISC]

const STATUS_TONE = {
  draft: { label: 'Draft', color: 'var(--text-muted, #6b6d82)' },
  assigned: { label: 'Assigned', color: 'var(--accent, #c8963e)' },
  in_progress: { label: 'In progress', color: '#6b8de6' },
  vendor_completed: { label: 'Vendor done', color: '#4dd9c0' },
  verified: { label: 'Verified', color: 'var(--green, #3dba7a)' },
}
const isClosed = (it) => it.status !== 'pending' && it.status !== 'disputed'

const fmtStamp = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null)

// ── presentational pieces, hoisted ───────────────────────────────────────────
function ErrStrip({ children, onRetry }) {
  return (
    <div style={{ padding: '11px 13px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontFamily: MONO }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--red, #e05c6a)' }}>⚠ {children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ marginTop: 8, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: MONO }}>Retry</button>
      )}
    </div>
  )
}

function StatusChip({ status }) {
  const s = STATUS_TONE[status] || STATUS_TONE.draft
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: s.color, border: `1px solid ${s.color}`, borderRadius: 10, padding: '2px 8px', fontFamily: MONO, whiteSpace: 'nowrap', flexShrink: 0 }}>{s.label}</span>
  )
}

function ItemRow({ item, actionable, busy, err, onVerify, onDispute }) {
  const [disputing, setDisputing] = useState(false)
  const awaiting = item.status === 'vendor_closed'
  const tone = item.status === 'verified' ? 'var(--green, #3dba7a)'
    : item.status === 'disputed' ? 'var(--red, #e05c6a)'
    : awaiting ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, minWidth: 84, flexShrink: 0, paddingTop: 2 }}>{item.area || '—'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text, #e8e8f0)', lineHeight: 1.45, wordBreak: 'break-word' }}>{item.description}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {item.fix_type && <span>{item.fix_type}</span>}
            {item.material && <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{item.material}</span>}
            {item.quantity != null && <span>×{item.quantity}</span>}
          </div>
          {item.vendor_note && (
            <div style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, marginTop: 4 }}>Vendor: {item.vendor_note}</div>
          )}
          {item.status === 'disputed' && item.dispute_reason && (
            <div style={{ fontSize: 11, color: 'var(--red, #e05c6a)', fontFamily: MONO, marginTop: 4, lineHeight: 1.5 }}>Sent back: {item.dispute_reason}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
          {/* A second dispute on the same item says something about the vendor,
              not just the task — so it is called out, not buried. */}
          {item.dispute_count > 1 && (
            <span title={`Disputed ${item.dispute_count} times`}
              style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--red, #e05c6a)', border: '1px solid var(--red, #e05c6a)', borderRadius: 9, padding: '1px 7px', fontFamily: MONO, whiteSpace: 'nowrap' }}>
              ×{item.dispute_count} disputed
            </span>
          )}
          <span style={{ fontSize: 9.5, fontFamily: MONO, color: tone, whiteSpace: 'nowrap' }}>
            {item.status === 'vendor_closed' ? 'to verify' : item.status}
          </span>
        </div>
      </div>

      {err && <ErrStrip>{err}</ErrStrip>}

      {actionable && awaiting && !disputing && (
        <div style={{ display: 'flex', gap: 8, paddingLeft: 94 }}>
          <button type="button" disabled={busy} onClick={onVerify}
            style={{ minHeight: 38, padding: '0 15px', borderRadius: 8, border: '1px solid var(--green, #3dba7a)', background: 'rgba(61,186,122,0.12)', color: 'var(--green, #3dba7a)', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
            {busy ? '…' : 'Verify'}
          </button>
          <button type="button" disabled={busy} onClick={() => setDisputing(true)}
            style={{ minHeight: 38, padding: '0 15px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--red, #e05c6a)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: MONO }}>
            Dispute
          </button>
        </div>
      )}

      {disputing && (
        <div style={{ paddingLeft: 94 }}>
          <DisputeBox busy={busy} onCancel={() => setDisputing(false)}
            onSubmit={(reason) => onDispute(reason, () => setDisputing(false))} />
        </div>
      )}
    </div>
  )
}

function VendorPicker({ vendors, trade, value, onChange, disabled }) {
  // Rank by matching trade, never filter — a carpenter occasionally takes a misc job.
  const ranked = useMemo(() => {
    const t = (trade || '').toLowerCase()
    return [...vendors].sort((a, b) => {
      const am = (a.trade || '').toLowerCase() === t ? 0 : 1
      const bm = (b.trade || '').toLowerCase() === t ? 0 : 1
      return am - bm || (a.full_name || '').localeCompare(b.full_name || '')
    })
  }, [vendors, trade])

  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{ width: '100%', padding: '9px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit' }}>
      <option value="">Assign a vendor…</option>
      {ranked.map(v => (
        <option key={v.id} value={v.id}>
          {v.full_name}{v.trade ? ` · ${v.trade}` : ''}{(v.trade || '').toLowerCase() === (trade || '').toLowerCase() ? ' ✓' : ''}
        </option>
      ))}
    </select>
  )
}

const fieldLabel = { fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }
const dateInput = { width: '100%', padding: '8px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }


// Common reasons first so a dispute is one tap, but the text is what gets
// stored — a reason is mandatory, so there is no silent rejection.
const DISPUTE_REASONS = [
  'Not actually done',
  'Done but not to standard',
  'Wrong material used',
  'Incomplete — part of the item remains',
  'Cannot confirm from site',
]

function DisputeBox({ onCancel, onSubmit, busy }) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const bad = touched && !reason.trim()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 11, background: 'rgba(224,92,106,0.07)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 9 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Why is this being sent back?</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {DISPUTE_REASONS.map(r => (
          <button key={r} type="button" onClick={() => { setReason(r); setTouched(true) }}
            style={{ padding: '6px 10px', borderRadius: 14, fontSize: 11.5, cursor: 'pointer', fontFamily: MONO,
              border: `1px solid ${reason === r ? 'var(--red, #e05c6a)' : 'var(--border, #2e3040)'}`,
              background: reason === r ? 'rgba(224,92,106,0.14)' : 'var(--bg-input, #252731)',
              color: reason === r ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)' }}>{r}</button>
        ))}
      </div>
      <textarea value={reason} onChange={e => { setReason(e.target.value); setTouched(true) }} rows={2}
        placeholder="Or write the reason — the vendor sees this"
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px', fontSize: 14, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', borderRadius: 8, outline: 'none', fontFamily: 'inherit', resize: 'vertical',
          border: `1px solid ${bad ? 'var(--red, #e05c6a)' : 'var(--border, #2e3040)'}` }} />
      {bad && <span style={{ fontSize: 11, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>A dispute needs a reason.</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={busy || !reason.trim()} onClick={() => onSubmit(reason.trim())}
          style={{ flex: 1, minHeight: 42, borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, fontFamily: MONO,
            background: reason.trim() ? 'var(--red, #e05c6a)' : 'var(--bg-input, #252731)',
            color: reason.trim() ? '#fff' : 'var(--text-muted, #6b6d82)',
            cursor: busy ? 'wait' : reason.trim() ? 'pointer' : 'not-allowed' }}>
          {busy ? 'Sending…' : 'Send back to vendor'}
        </button>
        <button type="button" onClick={onCancel}
          style={{ minHeight: 42, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
      </div>
    </div>
  )
}

const EVENT_LABEL = {
  created: 'Work order created', issued: 'Issued to vendor', assigned_vendor: 'Vendor assigned',
  started: 'Vendor started', reopened: 'Sent back to vendor', submitted: 'Vendor submitted for verification',
  verified: 'Work order verified', item_closed: 'Vendor marked an item done',
  item_verified: 'Item verified', item_disputed: 'Item sent back', item_reopened: 'Item reopened',
}

function Timeline({ rows }) {
  const [open, setOpen] = useState(false)
  if (!rows?.length) return null
  const shown = open ? rows : rows.slice(0, 4)
  return (
    <div style={{ borderTop: '1px solid var(--border, #2e3040)', paddingTop: 10 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginBottom: 8 }}>ACTIVITY</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {shown.map(a => (
          <div key={a.id} style={{ display: 'flex', gap: 9, fontSize: 11.5, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5 }}>
            <span style={{ flexShrink: 0, color: 'var(--text-dim, #9394a8)' }}>{fmtStamp(a.changed_at)}</span>
            <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
              <span style={{ color: 'var(--text, #e8e8f0)' }}>{EVENT_LABEL[a.event] || a.event}</span>
              {a.detail ? ` · ${a.detail}` : ''}
              {a.actor ? ` · ${a.actor}` : ''}
            </span>
          </div>
        ))}
      </div>
      {rows.length > 4 && (
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ marginTop: 8, padding: 0, background: 'none', border: 'none', color: 'var(--accent, #c8963e)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
          {open ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}

function TradeCard({ group, wo, vendors, busy, err, onCreate, onAssign, onDates, onCopy, copied,
  activity, itemBusyId, itemErr, onVerify, onDispute, onVerifyAll }) {
  const awaitingVerify = wo ? wo.items.filter(i => i.status === 'vendor_closed').length : 0
  const isQueue = wo?.status === 'vendor_completed' || awaitingVerify > 0
  const locked = wo?.status === 'verified'
  const [open, setOpen] = useState(isQueue)
  const items = wo ? wo.items : group.items
  const closed = wo ? wo.items.filter(isClosed).length : 0

  return (
    <div style={{
      background: 'var(--bg-panel, #1e2028)', borderRadius: 12, padding: 14,
      display: 'flex', flexDirection: 'column', gap: 11,
      border: `1px solid ${isQueue ? 'var(--accent, #c8963e)' : locked ? 'rgba(61,186,122,0.35)' : 'var(--border, #2e3040)'}`,
      boxShadow: isQueue ? '0 0 0 1px rgba(200,150,62,0.25)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: group.trade === MISC ? 'var(--accent, #c8963e)' : 'var(--text, #e8e8f0)' }}>
          {tradeLabel(group.trade)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
          {group.items.length} item{group.items.length === 1 ? '' : 's'}
        </span>
        {wo && <StatusChip status={wo.status} />}
        {wo && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
            {closed} of {wo.items.length} closed
          </span>
        )}
      </div>

      {err && <ErrStrip>{err}</ErrStrip>}

      {wo && awaitingVerify > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.32)', borderRadius: 9 }}>
          <span style={{ flex: 1, minWidth: 140, fontSize: 12, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
            {awaitingVerify} item{awaitingVerify === 1 ? '' : 's'} waiting on you to verify
          </span>
          <button type="button" onClick={onVerifyAll} disabled={busy}
            style={{ minHeight: 40, padding: '0 15px', borderRadius: 8, border: 'none', background: 'var(--green, #3dba7a)', color: '#062012', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
            {busy ? 'Verifying…' : `Verify all ${awaitingVerify}`}
          </button>
        </div>
      )}

      {locked && (
        <div style={{ padding: '10px 12px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: MONO, lineHeight: 1.5 }}>
          Verified{wo.verified_by ? ` by ${wo.verified_by}` : ''} — this work order is closed on both sides.
        </div>
      )}

      {!wo ? (
        <button type="button" onClick={onCreate} disabled={busy}
          style={{ alignSelf: 'flex-start', padding: '9px 15px', borderRadius: 8, border: '1px solid var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', color: 'var(--accent, #c8963e)', fontSize: 12.5, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
          {busy ? 'Creating…' : 'Create work order'}
        </button>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div>
              <label style={fieldLabel} htmlFor={`wo-vendor-${wo.id}`}>Vendor</label>
              <div id={`wo-vendor-${wo.id}`}>
                <VendorPicker vendors={vendors} trade={wo.trade} value={wo.vendor_id} onChange={onAssign} disabled={busy || locked} />
              </div>
            </div>
            <div>
              <label style={fieldLabel} htmlFor={`wo-start-${wo.id}`}>Start</label>
              <input id={`wo-start-${wo.id}`} type="date" value={wo.scheduled_start || ''}
                onChange={e => onDates({ scheduled_start: e.target.value || null })} disabled={busy || locked} style={dateInput} />
            </div>
            <div>
              <label style={fieldLabel} htmlFor={`wo-end-${wo.id}`}>End</label>
              <input id={`wo-end-${wo.id}`} type="date" value={wo.scheduled_end || ''}
                onChange={e => onDates({ scheduled_end: e.target.value || null })} disabled={busy || locked} style={dateInput} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <button type="button" onClick={onCopy}
              style={{ padding: '8px 13px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: copied ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO }}>
              {copied ? '✓ Link copied' : 'Copy link'}
            </button>
            {wo.vendor_name && (
              <span style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{wo.vendor_name}</span>
            )}
            {(wo.scheduled_start || wo.scheduled_end) && (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                {[fmtDate(wo.scheduled_start), fmtDate(wo.scheduled_end)].filter(Boolean).join(' → ')}
              </span>
            )}
            <button type="button" onClick={() => setOpen(o => !o)}
              style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
              {open ? 'Hide items' : `Show ${items.length} items`}
            </button>
          </div>
        </>
      )}

      {!wo && group.items.length > 0 && (
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ alignSelf: 'flex-start', padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
          {open ? 'Hide items' : `Show ${group.items.length} items`}
        </button>
      )}

      {open && (
        <div>
          {items.map(it => (
            <ItemRow
              key={it.id}
              item={it}
              actionable={!!wo && !locked}
              busy={itemBusyId === it.id}
              err={itemErr?.[it.id]}
              onVerify={() => onVerify(it)}
              onDispute={(reason, done) => onDispute(it, reason, done)}
            />
          ))}
        </div>
      )}

      {wo && <Timeline rows={activity} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function WorkOrdersSection({ pid, heading = 'Work orders' }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)      // a successful read happened
  const [lineItems, setLineItems] = useState([])
  const [observations, setObservations] = useState(0)
  const [inspectionId, setInspectionId] = useState(null)
  const [orders, setOrders] = useState([])
  const [vendors, setVendors] = useState([])
  const [userEmail, setUserEmail] = useState(null)
  const [busyTrade, setBusyTrade] = useState('')
  const [rowErr, setRowErr] = useState({})
  const [copiedId, setCopiedId] = useState(null)
  const [activity, setActivity] = useState({})
  const [itemBusyId, setItemBusyId] = useState(null)
  const [itemErr, setItemErr] = useState({})
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || null)

      // No FK between properties and inspections — fetch separately and join here.
      const { data: insps, error: iErr } = await supabase
        .from('inspections').select('id, created_at').eq('pid', pid).order('created_at', { ascending: false })
      if (iErr) throw iErr

      // One query for every inspection's items, grouped here, rather than a
      // probe per inspection in series.
      let active = null, rows = []
      const inspIds = (insps || []).map(i => i.id)
      if (inspIds.length) {
        const { data: allRows, error: liErr } = await supabase
          .from('inspection_line_items')
          .select('id, inspection_id, area, item_name, trade, issue_description, action, material_description, qty, material_cost, labour_cost, excluded_from_estimate')
          .in('inspection_id', inspIds)
        if (liErr) throw liErr
        const byInspection = new Map()
        for (const r of allRows || []) {
          if (!byInspection.has(r.inspection_id)) byInspection.set(r.inspection_id, [])
          byInspection.get(r.inspection_id).push(r)
        }
        // insps is newest-first, so the first with any items is the active one
        for (const insp of insps) {
          const got = byInspection.get(insp.id)
          if (got?.length) { active = insp; rows = got; break }
        }
      }
      setInspectionId(active?.id || null)

      let media = []
      if (rows.length) {
        const { data: m, error: mErr } = await supabase
          .from('line_item_media').select('line_item_id, url, type, is_proof_video')
          .in('line_item_id', rows.map(r => r.id))
        if (mErr) throw mErr
        media = m || []
      }
      const firstPhoto = {}
      for (const m of media) {
        if (m.is_proof_video || m.type === 'video') continue
        if (!firstPhoto[m.line_item_id]) firstPhoto[m.line_item_id] = m.url
      }
      // Scope to what the estimate treats as work. An inspection records
      // "Functional" and "Not available" as findings; sending those to a vendor
      // buries the real jobs among them. Same rule as the estimate so the two
      // never disagree — and it knows "Not available" WITH a cost is an install.
      const withPhoto = rows.map(r => ({ ...r, _photo: firstPhoto[r.id] || null }))
      setLineItems(withPhoto.filter(belongsInEstimate))
      setObservations(withPhoto.length - withPhoto.filter(belongsInEstimate).length)

      const [{ data: wos, error: wErr }, { data: vends, error: vErr }, { data: acts, error: aErr }] = await Promise.all([
        supabase.from('work_orders').select('*, work_order_items(id, area, description, fix_type, material, quantity, status, sort_order, dispute_count, dispute_reason, vendor_note, verified_at, verified_by)')
          .eq('pid', pid).order('created_at', { ascending: true }),
        supabase.from('vendors').select('id, full_name, trade, vendor_code').eq('status', 'approved').order('full_name'),
        supabase.from('work_order_activity').select('*').order('changed_at', { ascending: false }).limit(200),
      ])
      if (wErr) throw wErr
      if (vErr) throw vErr
      if (aErr) throw aErr

      setOrders((wos || []).map(w => ({
        ...w,
        items: [...(w.work_order_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      })))
      setVendors(vends || [])
      const woIds = new Set((wos || []).map(w => w.id))
      const byWo = {}
      for (const a of acts || []) {
        if (!woIds.has(a.work_order_id)) continue
        ;(byWo[a.work_order_id] = byWo[a.work_order_id] || []).push(a)
      }
      setActivity(byWo)
      setLoaded(true)
    } catch (e) {
      setError(e.message || String(e))
      setLoaded(false)
    }
    setLoading(false)
  }, [pid])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const groups = useMemo(() => {
    const map = new Map()
    for (const r of lineItems) {
      const t = canonTrade(r.trade)
      if (!map.has(t)) map.set(t, [])
      map.get(t).push(r)
    }
    return TRADE_ORDER
      .filter(t => map.has(t))
      .map(t => ({
        trade: t,
        items: map.get(t).map((r, i) => ({
          id: r.id,
          area: r.area,
          description: (r.issue_description || '').trim() || (r.item_name || '').trim() || 'Untitled item',
          fix_type: r.action,
          material: r.material_description,
          quantity: r.qty,
          photo_path: r._photo,
          sort_order: i,
        })),
      }))
  }, [lineItems])

  // Uniqueness is (pid, trade, inspection_id), so a property with two
  // inspections can hold two work orders for the same trade. Keying on trade
  // alone let one hide the other — invisible in the UI but still tripping the
  // index, so creating produced a constraint error about an unseeable row.
  // Filtering the source can empty a trade that already has a work order. The
  // order still exists and still holds its snapshot, so keep a card for it
  // rather than letting it disappear with the group.
  const groupsWithOrders = useMemo(() => {
    const seen = new Set(groups.map(g => g.trade))
    const extra = orders
      .filter(w => w.inspection_id === inspectionId && !seen.has(w.trade))
      .map(w => ({ trade: w.trade, items: [] }))
    return [...groups, ...extra].sort(
      (a, b) => TRADE_ORDER.indexOf(a.trade) - TRADE_ORDER.indexOf(b.trade))
  }, [groups, orders, inspectionId])

  const orderByTrade = useMemo(() => {
    const m = {}
    for (const w of orders) {
      if (w.inspection_id !== inspectionId) continue
      const cur = m[w.trade]
      if (!cur || new Date(w.created_at) > new Date(cur.created_at)) m[w.trade] = w
    }
    return m
  }, [orders, inspectionId])

  // Orders from an earlier inspection are still real and still occupy the
  // index; say so rather than dropping them on the floor.
  const strandedOrders = useMemo(
    () => orders.filter(w => w.inspection_id !== inspectionId),
    [orders, inspectionId],
  )

  const setErrFor = (trade, msg) => setRowErr(p => ({ ...p, [trade]: msg }))

  async function createOrder(group) {
    setBusyTrade(group.trade); setErrFor(group.trade, '')
    try {
      const { data: wo, error: e1 } = await supabase
        .from('work_orders')
        .insert({ pid, inspection_id: inspectionId, trade: group.trade })
        .select()
        .single()
      if (e1) throw e1

      // Snapshot, never read through: an inspection edited later must not change
      // a work order already in a vendor's hands. No cost field is ever copied.
      const payload = group.items.map(it => ({
        work_order_id: wo.id,
        inspection_line_item_id: it.id,
        area: it.area,
        description: it.description,
        fix_type: it.fix_type,
        material: it.material,
        quantity: it.quantity,
        photo_path: it.photo_path,
        sort_order: it.sort_order,
      }))
      if (payload.length) {
        const { error: e2 } = await supabase.from('work_order_items').insert(payload)
        if (e2) {
          // don't leave a headless work order behind
          await supabase.from('work_orders').delete().eq('id', wo.id)
          throw e2
        }
      }
      await load()
      setToast(`${tradeLabel(group.trade)} work order created`)
    } catch (e) {
      setErrFor(group.trade, e.message || String(e))
    }
    setBusyTrade('')
  }

  async function assignVendor(wo, vendorId) {
    setBusyTrade(wo.trade); setErrFor(wo.trade, '')
    try {
      const v = vendors.find(x => x.id === vendorId) || null
      const patch = {
        vendor_id: v ? v.id : null,
        vendor_name: v ? v.full_name : null,
        updated_at: new Date().toISOString(),
      }
      if (v && wo.status === 'draft') {
        patch.status = 'assigned'
        patch.issued_at = new Date().toISOString()
        patch.issued_by = userEmail
      } else if (!v && wo.status === 'assigned') {
        // Taking the vendor off has to undo the issue too, or the card keeps
        // reading ASSIGNED with nobody on it. Only from 'assigned' — once the
        // vendor has started, un-picking them is not a state we can rewind.
        patch.status = 'draft'
        patch.issued_at = null
        patch.issued_by = null
      }
      const { error: e } = await supabase.from('work_orders').update(patch).eq('id', wo.id)
      if (e) throw e
      await load()
    } catch (e) {
      setErrFor(wo.trade, e.message || String(e))
    }
    setBusyTrade('')
  }

  async function setDates(wo, patch) {
    setErrFor(wo.trade, '')
    try {
      const { error: e } = await supabase.from('work_orders')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', wo.id)
      if (e) throw e
      setOrders(prev => prev.map(w => (w.id === wo.id ? { ...w, ...patch } : w)))
    } catch (e) {
      setErrFor(wo.trade, e.message || String(e))
    }
  }

  async function verifyItem(wo, item) {
    setItemBusyId(item.id); setItemErr(p => ({ ...p, [item.id]: '' }))
    const { error: e } = await supabase.rpc('wo_verify_item', { p_item_id: item.id })
    setItemBusyId(null)
    if (e) { setItemErr(p => ({ ...p, [item.id]: e.message })); return }
    await load()
  }

  async function disputeItem(wo, item, reason, done) {
    setItemBusyId(item.id); setItemErr(p => ({ ...p, [item.id]: '' }))
    const { error: e } = await supabase.rpc('wo_dispute_item', { p_item_id: item.id, p_reason: reason })
    setItemBusyId(null)
    if (e) { setItemErr(p => ({ ...p, [item.id]: e.message })); return }
    done && done()
    await load()
  }

  async function verifyAll(wo) {
    setBusyTrade(wo.trade); setErrFor(wo.trade, '')
    const { error: e } = await supabase.rpc('wo_verify_all', { p_work_order_id: wo.id })
    setBusyTrade('')
    if (e) { setErrFor(wo.trade, e.message); return }
    await load()
    setToast(`${tradeLabel(wo.trade)} verified`)
  }

  async function copyLink(wo) {
    // Exactly this, no query string — it gets pasted into WhatsApp.
    const url = `${window.location.origin}/wo/${wo.token}`
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url; ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta); ta.focus(); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta)
      }
      setCopiedId(wo.id); setTimeout(() => setCopiedId(null), 1600)
      setToast('Link copied')
    } catch (e) {
      setErrFor(wo.trade, `Couldn’t copy the link: ${e.message || e}`)
    }
  }

  return (
    <section style={{ marginTop: heading ? 20 : 8, display: 'flex', flexDirection: 'column', gap: 11, fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {heading && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, letterSpacing: '0.09em', textTransform: 'uppercase' }}>{heading}</span>}
        {loaded && groupsWithOrders.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            {groupsWithOrders.length} trade{groupsWithOrders.length === 1 ? '' : 's'} · {lineItems.length} items
            {observations > 0 ? ` · ${observations} observation${observations === 1 ? '' : 's'} not sent` : ''}
          </span>
        )}
      </div>

      {!loading && !error && strandedOrders.length > 0 && (
        <div style={{ padding: '10px 12px', background: 'rgba(200,150,62,0.09)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 9, fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.55 }}>
          {strandedOrders.length} work order{strandedOrders.length === 1 ? '' : 's'} on this property belong{strandedOrders.length === 1 ? 's' : ''} to an earlier inspection
          {' '}({[...new Set(strandedOrders.map(w => tradeLabel(w.trade)))].join(', ')}) and {strandedOrders.length === 1 ? 'is' : 'are'} not shown below.
        </div>
      )}

      {loading && <div style={{ padding: '20px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>}

      {!loading && error && <ErrStrip onRetry={load}>Couldn’t load work orders: {error}</ErrStrip>}

      {!loading && !error && loaded && groupsWithOrders.length === 0 && (
        <div style={{ padding: '28px 18px', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 11, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No inspection items to schedule</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', marginTop: 4, fontFamily: MONO }}>
            Work orders are built from this property’s inspection.
          </div>
        </div>
      )}

      {!loading && !error && [...groupsWithOrders].sort((a, b) => {
        const q = (g) => (orderByTrade[g.trade]?.items || []).some(i => i.status === 'vendor_closed') ? 0 : 1
        return q(a) - q(b)
      }).map(g => (
        <TradeCard
          key={g.trade}
          group={g}
          wo={orderByTrade[g.trade] || null}
          vendors={vendors}
          busy={busyTrade === g.trade}
          err={rowErr[g.trade]}
          copied={copiedId === orderByTrade[g.trade]?.id}
          onCreate={() => createOrder(g)}
          onAssign={(vid) => assignVendor(orderByTrade[g.trade], vid)}
          onDates={(patch) => setDates(orderByTrade[g.trade], patch)}
          onCopy={() => copyLink(orderByTrade[g.trade])}
          activity={activity[orderByTrade[g.trade]?.id] || []}
          itemBusyId={itemBusyId}
          itemErr={itemErr}
          onVerify={(it) => verifyItem(orderByTrade[g.trade], it)}
          onDispute={(it, reason, done) => disputeItem(orderByTrade[g.trade], it, reason, done)}
          onVerifyAll={() => verifyAll(orderByTrade[g.trade])}
        />
      ))}

      {toast && (
        <div style={{ position: 'fixed', bottom: 84, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, color: 'var(--text, #e8e8f0)', fontFamily: SANS, zIndex: 300, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>{toast}</div>
      )}
    </section>
  )
}
