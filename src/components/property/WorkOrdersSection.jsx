import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
// Only untouched or sent-back items move between vendors. Handing a finished
// item to someone else would credit them with work they did not do.
const isMovable = (it) => it.status === 'pending' || it.status === 'disputed'

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

function ItemRow({ item, actionable, reversible, busy, err, onVerify, onDispute, onReverse, crew, onMove, selectable, selected, onToggle }) {
  const [disputing, setDisputing] = useState(false)
  const awaiting = item.status === 'vendor_closed'
  const movable = isMovable(item)
  const tone = item.status === 'verified' ? 'var(--green, #3dba7a)'
    : item.status === 'disputed' ? 'var(--red, #e05c6a)'
    : awaiting ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border, #2e3040)', background: selected ? 'rgba(200,150,62,0.06)' : 'none' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {selectable && (
          <input type="checkbox" checked={!!selected} onChange={onToggle} disabled={!movable}
            aria-label={`Select ${item.description}`}
            title={movable ? 'Select to move to another vendor' : 'Already closed — can’t be moved'}
            style={{ width: 16, height: 16, marginTop: 3, flexShrink: 0, accentColor: 'var(--accent, #c8963e)', cursor: movable ? 'pointer' : 'not-allowed' }} />
        )}
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
          {crew?.length > 1 && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <select value={item._woId} disabled={!movable || busy}
                onChange={e => onMove(e.target.value)}
                title={movable ? 'Move this item to another vendor' : 'The vendor has already closed this item — it can’t be moved'}
                style={{ padding: '4px 8px', fontSize: 11, borderRadius: 13, fontFamily: MONO, outline: 'none',
                  color: movable ? 'var(--text-dim, #9394a8)' : 'var(--text-muted, #6b6d82)',
                  background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
                  cursor: movable && !busy ? 'pointer' : 'not-allowed', maxWidth: '100%' }}>
                {crew.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
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
        <div style={{ display: 'flex', gap: 8, paddingLeft: selectable ? 120 : 94 }}>
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

      {/* The toast's Undo only lives for a few seconds. Reversing a verify or a
          dispute has to stay reachable after it is gone, or a mis-tap noticed
          five minutes later has no way back. Deliberately not gated on the card
          being unlocked: "I verified the whole thing by mistake" is precisely
          when a fully-verified order needs a way out. */}
      {reversible && (item.status === 'verified' || item.status === 'disputed') && (
        <div style={{ display: 'flex', gap: 8, paddingLeft: selectable ? 120 : 94 }}>
          <button type="button" disabled={busy} onClick={onReverse}
            style={{ minHeight: 34, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
            {busy ? '…' : item.status === 'verified' ? 'Un-verify' : 'Cancel send-back'}
          </button>
        </div>
      )}

      {disputing && (
        <div style={{ paddingLeft: selectable ? 120 : 94 }}>
          <DisputeBox busy={busy} onCancel={() => setDisputing(false)}
            onSubmit={(reason) => onDispute(reason, () => setDisputing(false))} />
        </div>
      )}
    </div>
  )
}

function VendorPicker({ vendors, trade, value, onChange, disabled, placeholder = 'Assign a vendor…', taken }) {
  // Rank by matching trade, never filter it out — a carpenter occasionally takes
  // a misc job. The one thing that IS removed is someone already holding another
  // slot on this trade: two slots for one person splits their own work in half
  // and hands them two links for the same job.
  const ranked = useMemo(() => {
    const t = (trade || '').toLowerCase()
    const busy = new Set(taken || [])
    return vendors.filter(v => !busy.has(v.id)).sort((a, b) => {
      const am = (a.trade || '').toLowerCase() === t ? 0 : 1
      const bm = (b.trade || '').toLowerCase() === t ? 0 : 1
      return am - bm || (a.full_name || '').localeCompare(b.full_name || '')
    })
  }, [vendors, trade, taken])

  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{ width: '100%', padding: '9px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <option value="">{placeholder}</option>
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
  item_moved_in: 'Item moved in', item_moved_out: 'Item moved out',
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
              {a._vendor && <span style={{ color: 'var(--accent, #c8963e)' }}>{a._vendor} · </span>}
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

// One vendor's slice of a trade: their items, their link, their dates, their
// verification. A trade with two carpenters renders two of these.
function CrewRow({ wo, vendors, sole, busy, err, copied, taken, onAssign, onDates, onCopy, onVerifyAll, onRemove }) {
  const [swapTo, setSwapTo] = useState(null)
  const awaitingVerify = wo.items.filter(i => i.status === 'vendor_closed').length
  const closed = wo.items.filter(isClosed).length
  const locked = wo.status === 'verified'
  // Past draft with a vendor on it means the link has been handed out.
  const live = wo.status !== 'draft' && !!wo.vendor_id
  const canRemove = !sole && wo.items.every(i => i.status === 'pending')
  const swapName = swapTo ? (vendors.find(v => v.id === swapTo)?.full_name || null) : null

  const pick = (vid) => {
    if (live && vid !== (wo.vendor_id || '')) { setSwapTo(vid); return }
    onAssign(vid, false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: sole ? 0 : 11,
      background: sole ? 'none' : 'var(--bg-input, #252731)', borderRadius: sole ? 0 : 10,
      border: sole ? 'none' : '1px solid var(--border, #2e3040)' }}>

      {!sole && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: wo.vendor_name ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)' }}>
            {wo.vendor_name || 'No vendor yet'}
          </span>
          <StatusChip status={wo.status} />
          <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            {wo.items.length} item{wo.items.length === 1 ? '' : 's'}{wo.items.length ? ` · ${closed} closed` : ''}
          </span>
          {canRemove && (
            <button type="button" onClick={onRemove} disabled={busy}
              style={{ marginLeft: 'auto', padding: '4px 9px', borderRadius: 6, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 10.5, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
              Remove
            </button>
          )}
        </div>
      )}

      {err && <ErrStrip>{err}</ErrStrip>}

      {swapTo !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 11, background: 'rgba(224,92,106,0.07)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 9 }}>
          <div style={{ fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, lineHeight: 1.6 }}>
            {swapName ? `Replace ${wo.vendor_name} with ${swapName}?` : `Take ${wo.vendor_name} off this work order?`}
            {' '}Their link stops working the moment you confirm.
            {closed > 0 && ` The ${closed} item${closed === 1 ? '' : 's'} they already closed stay closed and stay on this work order.`}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy} onClick={() => { onAssign(swapTo, true); setSwapTo(null) }}
              style={{ minHeight: 40, padding: '0 15px', borderRadius: 8, border: 'none', background: 'var(--red, #e05c6a)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
              {busy ? 'Replacing…' : swapName ? 'Replace vendor' : 'Remove vendor'}
            </button>
            <button type="button" onClick={() => setSwapTo(null)}
              style={{ minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12.5, cursor: 'pointer', fontFamily: MONO }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div>
          <label style={fieldLabel} htmlFor={`wo-vendor-${wo.id}`}>Vendor</label>
          <div id={`wo-vendor-${wo.id}`}>
            <VendorPicker vendors={vendors} trade={wo.trade} taken={taken}
              value={swapTo !== null ? swapTo : wo.vendor_id}
              onChange={pick} disabled={busy || locked} />
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
        {wo.items.length === 0 ? (
          <span style={{ fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>
            Tick items below and move them here before sending the link
          </span>
        ) : (
          <button type="button" onClick={onCopy}
            style={{ padding: '8px 13px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: copied ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO }}>
            {copied ? '✓ Link copied' : 'Copy link'}
          </button>
        )}
        {sole && wo.vendor_name && (
          <span style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{wo.vendor_name}</span>
        )}
        {(wo.scheduled_start || wo.scheduled_end) && (
          <span style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            {[fmtDate(wo.scheduled_start), fmtDate(wo.scheduled_end)].filter(Boolean).join(' → ')}
          </span>
        )}
      </div>

      {awaitingVerify > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.32)', borderRadius: 9 }}>
          <span style={{ flex: 1, minWidth: 140, fontSize: 12, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
            {awaitingVerify} item{awaitingVerify === 1 ? '' : 's'} waiting on you to verify
            {!sole && wo.vendor_name ? ` from ${wo.vendor_name}` : ''}
          </span>
          <button type="button" onClick={onVerifyAll} disabled={busy}
            style={{ minHeight: 40, padding: '0 15px', borderRadius: 8, border: 'none', background: 'var(--green, #3dba7a)', color: '#062012', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
            {busy ? 'Verifying…' : `Verify all ${awaitingVerify}`}
          </button>
        </div>
      )}

      {locked && (
        <div style={{ padding: '10px 12px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: MONO, lineHeight: 1.5 }}>
          Verified{wo.verified_by ? ` by ${wo.verified_by}` : ''} — closed on both sides.
        </div>
      )}
    </div>
  )
}

const ITEM_FILTERS = [
  { key: 'verify', label: 'To verify', match: (i) => i.status === 'vendor_closed' },
  { key: 'open', label: 'Still open', match: (i) => i.status === 'pending' || i.status === 'disputed' },
  { key: 'done', label: 'Verified', match: (i) => i.status === 'verified' },
]

function TradeCard({ group, wos, vendors, busyId, errs, onCreate, onAddVendor, onAssign, onDates, onCopy, copiedId,
  activity, itemBusyId, itemErr, onVerify, onDispute, onReverse, onVerifyAll, onRemoveCrew, onMoveItem, onMoveMany,
  onRefresh, refreshing }) {
  const awaitingVerify = wos.reduce((n, w) => n + w.items.filter(i => i.status === 'vendor_closed').length, 0)
  const isQueue = wos.some(w => w.status === 'vendor_completed') || awaitingVerify > 0
  const locked = wos.length > 0 && wos.every(w => w.status === 'verified')
  const [open, setOpen] = useState(isQueue)
  const [filter, setFilter] = useState(isQueue ? 'verify' : 'all')
  const [sel, setSel] = useState(() => new Set())
  const [moveTo, setMoveTo] = useState('')

  // The union of every vendor's slice, in inspection order, each row tagged with
  // the work order it currently sits on so it can be moved.
  const items = wos.length
    ? wos.flatMap(w => w.items.map(i => ({ ...i, _woId: w.id })))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    : group.items
  const closed = wos.reduce((n, w) => n + w.items.filter(isClosed).length, 0)
  const total = wos.reduce((n, w) => n + w.items.length, 0)
  // Two unnamed slots would both read "Unassigned" and you couldn't tell which
  // one an item was going to.
  const crew = wos.map((w, i) => ({ id: w.id, label: w.vendor_name || `Vendor ${i + 1} · unassigned` }))
  const splitting = wos.length > 1 && !locked

  const counts = useMemo(() => {
    const c = {}
    for (const f of ITEM_FILTERS) c[f.key] = items.filter(f.match).length
    return c
  }, [items])
  const shown = filter === 'all' ? items : items.filter(ITEM_FILTERS.find(f => f.key === filter)?.match || (() => true))
  const selectable = splitting && shown.some(isMovable)
  const selectedHere = shown.filter(i => sel.has(i.id))

  const mergedActivity = useMemo(() => {
    const rows = wos.flatMap(w => (activity[w.id] || []).map(a => ({ ...a, _vendor: wos.length > 1 ? w.vendor_name : null })))
    return rows.sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
  }, [wos, activity])

  const toggle = (id) => setSel(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const selectAllShown = () => setSel(new Set(shown.filter(isMovable).map(i => i.id)))

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
          {(wos.length ? total : group.items.length)} item{(wos.length ? total : group.items.length) === 1 ? '' : 's'}
        </span>
        {wos.length === 1 && <StatusChip status={wos[0].status} />}
        {wos.length > 1 && (
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--accent, #c8963e)', border: '1px solid var(--accent, #c8963e)', borderRadius: 10, padding: '2px 8px', fontFamily: MONO, whiteSpace: 'nowrap' }}>
            {wos.length} vendors
          </span>
        )}
        {wos.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
            {closed} of {total} closed
          </span>
        )}
        {/* Live updates cover the normal case; this is for when you want to be
            certain right now — before ringing the vendor, say. */}
        <button type="button" onClick={onRefresh} disabled={refreshing} aria-label={`Refresh ${tradeLabel(group.trade)}`}
          title="Check for vendor updates"
          style={{ marginLeft: wos.length > 0 ? 0 : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', cursor: refreshing ? 'wait' : 'pointer', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transformOrigin: 'center', animation: refreshing ? 'wo-spin 0.8s linear infinite' : 'none' }}>
            <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>

      {errs[group.trade] && <ErrStrip>{errs[group.trade]}</ErrStrip>}

      {wos.length === 0 ? (
        // Picking the vendor IS the action. Creating an empty work order first
        // was a step that produced nothing anyone could see.
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.55 }}>
            Assign a vendor and Pulse builds the work order and their private link.
          </span>
          <div style={{ maxWidth: 340 }}>
            <VendorPicker vendors={vendors} trade={group.trade} value=""
              disabled={busyId === group.trade}
              placeholder={busyId === group.trade ? 'Creating…' : `Assign a vendor to these ${group.items.length} items…`}
              onChange={(vid) => vid && onCreate(vid)} />
          </div>
          <button type="button" onClick={() => onCreate(null)} disabled={busyId === group.trade}
            style={{ alignSelf: 'flex-start', padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11, cursor: busyId === group.trade ? 'wait' : 'pointer', fontFamily: MONO, textDecoration: 'underline' }}>
            or prepare it without a vendor for now
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: wos.length > 1 ? 9 : 11 }}>
          {wos.map(w => (
            <CrewRow key={w.id} wo={w} vendors={vendors} sole={wos.length === 1}
              busy={busyId === w.id} err={errs[w.id]} copied={copiedId === w.id}
              taken={wos.filter(o => o.id !== w.id && o.vendor_id).map(o => o.vendor_id)}
              onAssign={(vid, rotate) => onAssign(w, vid, rotate)}
              onDates={(patch) => onDates(w, patch)}
              onCopy={() => onCopy(w)}
              onVerifyAll={() => onVerifyAll(w)}
              onRemove={() => onRemoveCrew(w)} />
          ))}
        </div>
      )}

      {wos.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          {!locked && (
            <button type="button" onClick={onAddVendor} disabled={busyId === group.trade}
              title="Split this trade across a second vendor"
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px dashed var(--border-dash, #3a3d52)', background: 'none', color: 'var(--accent, #c8963e)', fontSize: 11.5, fontWeight: 600, cursor: busyId === group.trade ? 'wait' : 'pointer', fontFamily: MONO }}>
              {busyId === group.trade ? 'Adding…' : '+ Add another vendor'}
            </button>
          )}
          <button type="button" onClick={() => setOpen(o => !o)}
            style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
            {open ? 'Hide items' : `Show ${items.length} items`}
          </button>
        </div>
      )}

      {wos.length === 0 && group.items.length > 0 && (
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ alignSelf: 'flex-start', padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
          {open ? 'Hide items' : `Show ${group.items.length} items`}
        </button>
      )}

      {open && wos.length > 0 && items.length > 5 && (
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
          <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'}
            className={`tct tct-bare${filter === 'all' ? ' is-on' : ''}`}
            style={{ padding: '6px 11px', fontSize: 11.5, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
            All {items.length}
          </button>
          {ITEM_FILTERS.filter(f => counts[f.key] > 0).map(f => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={`tct tct-bare${filter === f.key ? ' is-on' : ''}`}
              style={{ padding: '6px 11px', fontSize: 11.5, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {f.label} {counts[f.key]}
            </button>
          ))}
        </div>
      )}

      {open && selectable && (
        // Splitting 32 items one dropdown at a time is not a workflow. Tick and
        // move in bulk; the bar sticks so it stays reachable on a long list.
        <div style={{ position: 'sticky', bottom: 8, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          padding: '9px 11px', borderRadius: 9, background: 'var(--bg-input, #252731)', border: `1px solid ${selectedHere.length ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}` }}>
          {selectedHere.length === 0 ? (
            <>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Tick items to move them between vendors</span>
              <button type="button" onClick={selectAllShown}
                style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-dim, #9394a8)', fontSize: 11, cursor: 'pointer', fontFamily: MONO }}>
                Select all {shown.filter(isMovable).length}
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{selectedHere.length} selected</span>
              <select value={moveTo} onChange={e => setMoveTo(e.target.value)}
                aria-label="Move selected items to"
                style={{ padding: '6px 9px', fontSize: 12, color: 'var(--text, #e8e8f0)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                <option value="">Move to…</option>
                {crew.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <button type="button" disabled={!moveTo}
                onClick={() => { onMoveMany(selectedHere, moveTo); setSel(new Set()); setMoveTo('') }}
                style={{ padding: '7px 13px', borderRadius: 7, border: 'none', fontSize: 12, fontWeight: 700, fontFamily: MONO,
                  background: moveTo ? 'var(--accent, #c8963e)' : 'var(--bg-panel, #1e2028)',
                  color: moveTo ? '#1a1408' : 'var(--text-muted, #6b6d82)',
                  cursor: moveTo ? 'pointer' : 'not-allowed' }}>
                Move
              </button>
              <button type="button" onClick={() => setSel(new Set())}
                style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11, cursor: 'pointer', fontFamily: MONO }}>
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {open && (
        <div>
          {shown.map(it => (
            <ItemRow
              key={it.id}
              item={it}
              actionable={wos.length > 0 && !locked}
              reversible={wos.length > 0}
              busy={itemBusyId === it.id}
              err={itemErr?.[it.id]}
              crew={crew}
              selectable={selectable}
              selected={sel.has(it.id)}
              onToggle={() => toggle(it.id)}
              onMove={(toWoId) => onMoveItem(it, toWoId)}
              onVerify={() => onVerify(it)}
              onDispute={(reason, done) => onDispute(it, reason, done)}
              onReverse={() => onReverse(it)}
            />
          ))}
          {shown.length === 0 && (
            <div style={{ padding: '18px 0', fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, borderTop: '1px solid var(--border, #2e3040)' }}>
              Nothing in this state.
            </div>
          )}
        </div>
      )}

      {wos.length > 0 && <Timeline rows={mergedActivity} />}
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
  const [busyId, setBusyId] = useState('')       // a trade key (create) or a work order id
  const [rowErr, setRowErr] = useState({})
  const [copiedId, setCopiedId] = useState(null)
  const [activityRows, setActivityRows] = useState([])
  const [itemBusyId, setItemBusyId] = useState(null)
  const [itemErr, setItemErr] = useState({})
  const [toast, setToast] = useState(null)         // { text, undo?, tone? }
  // Cards are ordered "waiting on you first" when the page arrives, then held
  // still. Re-sorting live would yank a card out from under you the moment you
  // verified its last item.
  const cardOrderRef = useRef(null)
  const [refreshing, setRefreshing] = useState(false)
  const [live, setLive] = useState(false)
  // Our own writes come back over realtime too. Ignoring them for a moment
  // stops a just-patched card from being re-fetched out from under itself.
  const muteUntilRef = useRef(0)
  const orderIdsRef = useRef(new Set())

  // A refresh after an action must not unmount the list. Flipping `loading`
  // collapses the page to a one-line placeholder, the browser clamps the scroll
  // to the top, and you lose your place in a long trade card. Only the first
  // read of a property shows the spinner.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) { setLoading(true); cardOrderRef.current = null }
    setError('')
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
      setActivityRows(acts || [])
      setLoaded(true)
    } catch (e) {
      setError(e.message || String(e))
      // A failed background refresh shows the error but keeps the data that is
      // already on screen — only a failed first read has nothing to show.
      if (!silent) setLoaded(false)
    }
    setLoading(false)
  }, [pid])

  useEffect(() => { load() }, [load])

  useEffect(() => { orderIdsRef.current = new Set(orders.map(w => w.id)) }, [orders])

  // When a vendor marks something done on their phone, it should appear here
  // without anyone reloading. Realtime honours RLS, so this is staff-only —
  // anon has no table access and receives nothing.
  useEffect(() => {
    let timer = null
    const bump = () => {
      if (Date.now() < muteUntilRef.current) return
      clearTimeout(timer)
      timer = setTimeout(() => load({ silent: true }), 700)
    }
    const channel = supabase
      .channel(`work-orders-${pid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `pid=eq.${pid}` }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_items' }, (payload) => {
        // work_order_items carries no pid, so scope it here rather than pulling
        // the whole property back on every other property's activity.
        const id = payload.new?.work_order_id || payload.old?.work_order_id
        if (id && !orderIdsRef.current.has(id)) return
        bump()
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))
    return () => { clearTimeout(timer); supabase.removeChannel(channel) }
  }, [pid, load])

  const manualRefresh = useCallback(async () => {
    setRefreshing(true)
    await load({ silent: true })
    setRefreshing(false)
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 7000 : toast.undo ? 9000 : 2400)
    return () => clearTimeout(t)
  }, [toast])

  // Item actions patch state in place instead of refetching — a refetch is what
  // made the page feel like it reloaded on every click. Only the activity log
  // needs to come back from the server, and it sits at the bottom of the card.
  const refreshActivity = useCallback(async () => {
    const { data } = await supabase.from('work_order_activity').select('*')
      .order('changed_at', { ascending: false }).limit(200)
    if (data) setActivityRows(data)
  }, [])

  const patchOrder = (woId, patch) =>
    setOrders(prev => prev.map(w => (w.id === woId ? { ...w, ...patch } : w)))

  const patchItems = (ids, patch) => {
    const set = new Set(ids)
    setOrders(prev => prev.map(w => ({
      ...w,
      items: w.items.map(i => (set.has(i.id) ? { ...i, ...patch } : i)),
    })))
  }

  const activity = useMemo(() => groupActivity(activityRows, orders), [activityRows, orders])

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

  // Filtering the source can empty a trade that already has work orders. They
  // still exist and still hold their snapshots, so keep a card for the trade
  // rather than letting it disappear with the group.
  const groupsWithOrders = useMemo(() => {
    const seen = new Set(groups.map(g => g.trade))
    const extra = [...new Set(orders
      .filter(w => w.inspection_id === inspectionId && !seen.has(w.trade))
      .map(w => w.trade))].map(trade => ({ trade, items: [] }))
    return [...groups, ...extra].sort(
      (a, b) => TRADE_ORDER.indexOf(a.trade) - TRADE_ORDER.indexOf(b.trade))
  }, [groups, orders, inspectionId])

  // A trade can be split across several vendors — one work order each, oldest
  // first so the crew list stays in the order you built it.
  const ordersByTrade = useMemo(() => {
    const m = {}
    for (const w of orders) {
      if (w.inspection_id !== inspectionId) continue
      ;(m[w.trade] = m[w.trade] || []).push(w)
    }
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    }
    return m
  }, [orders, inspectionId])

  // Orders from an earlier inspection are still real; say so rather than
  // dropping them on the floor.
  const strandedOrders = useMemo(
    () => orders.filter(w => w.inspection_id !== inspectionId),
    [orders, inspectionId],
  )

  // Priority order is decided once per property load and then frozen. Sorting
  // on every change would reshuffle the cards under the cursor as soon as you
  // verified something — the same jump the in-place updates exist to prevent.
  const displayGroups = useMemo(() => {
    if (!loaded) return groupsWithOrders
    if (!cardOrderRef.current) {
      const waiting = (g) => (ordersByTrade[g.trade] || [])
        .some(w => w.items.some(i => i.status === 'vendor_closed')) ? 0 : 1
      cardOrderRef.current = [...groupsWithOrders]
        .sort((a, b) => waiting(a) - waiting(b)).map(g => g.trade)
    }
    const rank = (t) => {
      const i = cardOrderRef.current.indexOf(t)
      return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    return [...groupsWithOrders].sort((a, b) => rank(a.trade) - rank(b.trade))
  }, [groupsWithOrders, ordersByTrade, loaded])

  const setErrFor = (key, msg) => setRowErr(p => ({ ...p, [key]: msg }))
  // Silence the realtime echo of our own write; we have already applied it.
  const mute = () => { muteUntilRef.current = Date.now() + 2000 }

  // A vendor's link is the only credential on the public page, so replacing the
  // vendor has to invalidate it. Same shape as the column default: 32 hex.
  const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  async function createOrder(group, vendorId) {
    setBusyId(group.trade); setErrFor(group.trade, '')
    try {
      const v = vendors.find(x => x.id === vendorId) || null
      const { data: wo, error: e1 } = await supabase
        .from('work_orders')
        .insert({
          pid, inspection_id: inspectionId, trade: group.trade,
          vendor_id: v?.id || null, vendor_name: v?.full_name || null,
          status: v ? 'assigned' : 'draft',
          issued_at: v ? new Date().toISOString() : null,
          issued_by: v ? userEmail : null,
        })
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
      await load({ silent: true })
      setToast({ text: v ? `${tradeLabel(group.trade)} assigned to ${v.full_name}` : `${tradeLabel(group.trade)} work order created` })
    } catch (e) {
      setErrFor(group.trade, e.message || String(e))
    }
    setBusyId('')
  }

  // A second vendor on the same trade: an empty work order with its own token
  // and dates, which you then move items into.
  async function addVendor(group) {
    setBusyId(group.trade); setErrFor(group.trade, '')
    try {
      const { data: wo, error: e } = await supabase.from('work_orders')
        .insert({ pid, inspection_id: inspectionId, trade: group.trade }).select().single()
      if (e) throw e
      await load({ silent: true })
      setToast({
        text: 'Second vendor added — tick items and move them across',
        undo: async () => {
          const { error: uErr } = await supabase.from('work_orders').delete().eq('id', wo.id)
          if (uErr) throw new Error(uErr.message)
          await load({ silent: true })
        },
      })
    } catch (e) {
      setErrFor(group.trade, e.message || String(e))
    }
    setBusyId('')
  }

  async function assignVendor(wo, vendorId, rotate) {
    setBusyId(wo.id); setErrFor(wo.id, '')
    mute()
    const before = { vendor_id: wo.vendor_id, vendor_name: wo.vendor_name, token: wo.token, status: wo.status, issued_at: wo.issued_at, issued_by: wo.issued_by }
    try {
      const v = vendors.find(x => x.id === vendorId) || null
      const patch = {
        vendor_id: v ? v.id : null,
        vendor_name: v ? v.full_name : null,
        updated_at: new Date().toISOString(),
      }
      // Swapping someone off a work order they already hold a link to: the old
      // URL has to die with them, or they keep marking items done on a job that
      // is no longer theirs.
      if (rotate) patch.token = newToken()
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
      patchOrder(wo.id, patch)
      refreshActivity()
      setToast({
        text: rotate
          ? (v ? `${v.full_name} assigned — the old link no longer works` : 'Vendor removed — their link no longer works')
          : (v ? `${v.full_name} assigned` : 'Vendor cleared'),
        // Undo restores the old token too, so the link that was just killed
        // comes back rather than the vendor being stranded.
        undo: async () => {
          const { error: uErr } = await supabase.from('work_orders').update(before).eq('id', wo.id)
          if (uErr) throw new Error(uErr.message)
          patchOrder(wo.id, before)
          refreshActivity()
        },
      })
    } catch (e) {
      setErrFor(wo.id, e.message || String(e))
    }
    setBusyId('')
  }

  async function moveItems(items, toWoId) {
    const movable = items.filter(isMovable)
    if (!toWoId || !movable.length) return
    const from = movable.map(i => ({ id: i.id, woId: i._woId }))
    const ids = movable.map(i => i.id)
    setItemBusyId(ids.length === 1 ? ids[0] : null)
    const { error: e } = await supabase.from('work_order_items')
      .update({ work_order_id: toWoId }).in('id', ids).in('status', ['pending', 'disputed'])
    setItemBusyId(null)
    // A bulk move has no single row to report into, and the row it came from may
    // now be filtered out of view — say it where it can actually be read.
    if (e) { setToast({ text: `Couldn’t move: ${e.message}`, tone: 'error' }); return }
    await load({ silent: true })
    const to = orders.find(w => w.id === toWoId)
    setToast({
      text: `${ids.length} item${ids.length === 1 ? '' : 's'} moved to ${to?.vendor_name || 'the other vendor'}`,
      undo: async () => {
        // Each item goes back to the order it actually came from, not to one
        // shared origin — a bulk move can pull from several vendors at once.
        const byOrigin = from.reduce((m, f) => { ;(m[f.woId] = m[f.woId] || []).push(f.id); return m }, {})
        for (const [woId, grp] of Object.entries(byOrigin)) {
          const { error: uErr } = await supabase.from('work_order_items')
            .update({ work_order_id: woId }).in('id', grp)
          if (uErr) throw new Error(uErr.message)
        }
        await load({ silent: true })
      },
    })
  }

  // Dissolving a crew slot hands its items back to the trade's first vendor.
  // Only offered while every item is still untouched, so nothing anyone
  // actually did gets erased.
  async function removeCrew(wo) {
    const siblings = (ordersByTrade[wo.trade] || []).filter(w => w.id !== wo.id)
    if (!siblings.length) return
    setBusyId(wo.id); setErrFor(wo.id, '')
    try {
      if (wo.items.length) {
        const { error: mErr } = await supabase.from('work_order_items')
          .update({ work_order_id: siblings[0].id }).eq('work_order_id', wo.id)
        if (mErr) throw mErr
      }
      const { error: dErr } = await supabase.from('work_orders').delete().eq('id', wo.id)
      if (dErr) throw dErr
      await load({ silent: true })
      setToast({ text: wo.items.length ? `Items returned to ${siblings[0].vendor_name || 'the first vendor'}` : 'Vendor slot removed' })
    } catch (e) {
      setErrFor(wo.id, e.message || String(e))
    }
    setBusyId('')
  }

  async function setDates(wo, patch) {
    setErrFor(wo.id, '')
    const { error: e } = await supabase.from('work_orders')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', wo.id)
    if (e) { setErrFor(wo.id, e.message || String(e)); return }
    patchOrder(wo.id, patch)
  }

  async function verifyItem(item) {
    setItemBusyId(item.id); setItemErr(p => ({ ...p, [item.id]: '' }))
    mute()
    const { data, error: e } = await supabase.rpc('wo_verify_item', { p_item_id: item.id })
    setItemBusyId(null)
    if (e) { setItemErr(p => ({ ...p, [item.id]: e.message })); return }
    patchItems([item.id], { status: 'verified', verified_by: userEmail, dispute_reason: null })
    if (data?.remaining === 0) patchOrder(item._woId, { status: 'verified', verified_by: userEmail })
    refreshActivity()
    setToast({
      text: 'Item verified',
      undo: async () => {
        const { error: uErr } = await supabase.rpc('wo_unverify_items', { p_item_ids: [item.id] })
        if (uErr) throw new Error(uErr.message)
        patchItems([item.id], { status: 'vendor_closed', verified_by: null })
        patchOrder(item._woId, { status: 'vendor_completed', verified_by: null })
        refreshActivity()
      },
    })
  }

  async function disputeItem(item, reason, done) {
    setItemBusyId(item.id); setItemErr(p => ({ ...p, [item.id]: '' }))
    mute()
    const { error: e } = await supabase.rpc('wo_dispute_item', { p_item_id: item.id, p_reason: reason })
    setItemBusyId(null)
    if (e) { setItemErr(p => ({ ...p, [item.id]: e.message })); return }
    done && done()
    patchItems([item.id], { status: 'disputed', dispute_reason: reason, dispute_count: (item.dispute_count || 0) + 1, verified_by: null })
    patchOrder(item._woId, { status: 'in_progress', verified_by: null })
    refreshActivity()
    setToast({
      text: 'Sent back to the vendor',
      undo: async () => {
        const { error: uErr } = await supabase.rpc('wo_undispute_item', { p_item_id: item.id })
        if (uErr) throw new Error(uErr.message)
        patchItems([item.id], { status: 'vendor_closed', dispute_reason: null, dispute_count: item.dispute_count || 0 })
        await load({ silent: true })
      },
    })
  }

  // Reversing after the toast has gone. Same RPCs the toast's Undo uses.
  async function reverseItem(item) {
    setItemBusyId(item.id); setItemErr(p => ({ ...p, [item.id]: '' }))
    muteUntilRef.current = Date.now() + 2000
    const verified = item.status === 'verified'
    const { error: e } = verified
      ? await supabase.rpc('wo_unverify_items', { p_item_ids: [item.id] })
      : await supabase.rpc('wo_undispute_item', { p_item_id: item.id })
    setItemBusyId(null)
    if (e) { setToast({ text: e.message, tone: 'error' }); return }
    await load({ silent: true })
    setToast({ text: verified ? 'Back to waiting on you' : 'Send-back cancelled — item is closed again' })
  }

  async function verifyAll(wo) {
    setBusyId(wo.id); setErrFor(wo.id, '')
    mute()
    const ids = wo.items.filter(i => i.status === 'vendor_closed').map(i => i.id)
    const { data, error: e } = await supabase.rpc('wo_verify_all', { p_work_order_id: wo.id })
    setBusyId('')
    if (e) { setErrFor(wo.id, e.message); return }
    patchItems(ids, { status: 'verified', verified_by: userEmail, dispute_reason: null })
    if (data?.remaining === 0) patchOrder(wo.id, { status: 'verified', verified_by: userEmail })
    refreshActivity()
    setToast({
      text: `${ids.length} item${ids.length === 1 ? '' : 's'} verified${wo.vendor_name ? ` · ${wo.vendor_name}` : ''}`,
      undo: async () => {
        const { error: uErr } = await supabase.rpc('wo_unverify_items', { p_item_ids: ids })
        if (uErr) throw new Error(uErr.message)
        patchItems(ids, { status: 'vendor_closed', verified_by: null })
        patchOrder(wo.id, { status: 'vendor_completed', verified_by: null })
        refreshActivity()
      },
    })
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
      setToast({ text: wo.vendor_name ? `Link copied for ${wo.vendor_name}` : 'Link copied' })
    } catch (e) {
      setErrFor(wo.id, `Couldn’t copy the link: ${e.message || e}`)
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
        {loaded && (
          <span title={live ? 'Vendor updates appear here as they happen' : 'Not connected — use refresh on a card'}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: MONO, color: live ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
            {live ? 'LIVE' : 'OFFLINE'}
          </span>
        )}
      </div>
      <style>{'@keyframes wo-spin{to{transform:rotate(360deg)}}'}</style>

      {!loading && !error && strandedOrders.length > 0 && (
        <div style={{ padding: '10px 12px', background: 'rgba(200,150,62,0.09)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 9, fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.55 }}>
          {strandedOrders.length} work order{strandedOrders.length === 1 ? '' : 's'} on this property belong{strandedOrders.length === 1 ? 's' : ''} to an earlier inspection
          {' '}({[...new Set(strandedOrders.map(w => tradeLabel(w.trade)))].join(', ')}) and {strandedOrders.length === 1 ? 'is' : 'are'} not shown below.
        </div>
      )}

      {loading && <div style={{ padding: '20px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>}

      {!loading && error && <ErrStrip onRetry={() => load()}>Couldn’t load work orders: {error}</ErrStrip>}

      {!loading && !error && loaded && groupsWithOrders.length === 0 && (
        <div style={{ padding: '28px 18px', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 11, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No inspection items to schedule</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', marginTop: 4, fontFamily: MONO }}>
            Work orders are built from this property’s inspection.
          </div>
        </div>
      )}

      {!loading && loaded && displayGroups.map(g => (
        <TradeCard
          key={g.trade}
          group={g}
          wos={ordersByTrade[g.trade] || []}
          vendors={vendors}
          busyId={busyId}
          errs={rowErr}
          copiedId={copiedId}
          activity={activity}
          onCreate={(vendorId) => createOrder(g, vendorId)}
          onAddVendor={() => addVendor(g)}
          onAssign={assignVendor}
          onDates={setDates}
          onCopy={copyLink}
          onRemoveCrew={removeCrew}
          onMoveItem={(it, toWoId) => moveItems([it], toWoId)}
          onMoveMany={moveItems}
          itemBusyId={itemBusyId}
          itemErr={itemErr}
          onVerify={verifyItem}
          onDispute={disputeItem}
          onReverse={reverseItem}
          onVerifyAll={verifyAll}
          onRefresh={manualRefresh}
          refreshing={refreshing}
        />
      ))}

      {toast && (
        <div role="status" aria-live="polite"
          style={{ position: 'fixed', bottom: 84, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 'calc(100vw - 32px)',
            background: toast.tone === 'error' ? 'rgba(224,92,106,0.14)' : 'var(--bg-panel, #1e2028)',
            border: `1px solid ${toast.tone === 'error' ? 'var(--red, #e05c6a)' : 'var(--border, #2e3040)'}`,
            borderRadius: 10, padding: '10px 14px', fontSize: 12.5,
            color: toast.tone === 'error' ? 'var(--red, #e05c6a)' : 'var(--text, #e8e8f0)',
            fontFamily: SANS, zIndex: 300, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          <span style={{ minWidth: 0 }}>{toast.text}</span>
          {toast.undo && (
            <button type="button"
              onClick={async () => {
                const fn = toast.undo
                setToast({ text: 'Undoing…' })
                // An undo that fails must say so here — the row it came from is
                // often filtered out of view by then, so a row-level error would
                // never be seen.
                try { await fn() } catch (e) { setToast({ text: `Couldn’t undo: ${e.message || e}`, tone: 'error' }) }
              }}
              style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--accent, #c8963e)', background: 'rgba(200,150,62,0.12)', color: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>
              Undo
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function groupActivity(acts, wos) {
  const woIds = new Set((wos || []).map(w => w.id))
  const byWo = {}
  for (const a of acts || []) {
    if (!woIds.has(a.work_order_id)) continue
    ;(byWo[a.work_order_id] = byWo[a.work_order_id] || []).push(a)
  }
  return byWo
}
