import { useState } from 'react'
import { STATUS } from './outbox'

// Both versions, side by side on a wide screen and stacked on a phone, and
// nothing happens until a person presses one of two buttons. Failed ops are
// listed under the conflicts with their server reason, so "1 failed" is never
// a dead end.

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'

const KIND_LABEL = {
  inspection_save: 'Inspection',
  wo_close_item: 'Mark done',
  wo_reopen_item: 'Undo done',
  wo_submit: 'Submit for verification',
}

const STATUS_WORD = {
  pending: 'open',
  disputed: 'sent back by Flent',
  vendor_closed: 'marked done',
  verified: 'verified by Flent',
  vendor_completed: 'submitted',
  in_progress: 'in progress',
  missing: 'no longer on the work order',
}

const fmt = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 12.5, lineHeight: 1.5 }}>
      <span style={{ color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, minWidth: 86, flexShrink: 0 }}>{k}</span>
      <span style={{ color: 'var(--text, #e8e8f0)', wordBreak: 'break-word' }}>{v ?? '—'}</span>
    </div>
  )
}

function Version({ title, tone, children }) {
  const c = tone === 'mine' ? '200,150,62' : '107,141,230'
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '12px 13px', borderRadius: 10, border: `1px solid rgba(${c},0.38)`, background: `rgba(${c},0.08)`, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', fontFamily: MONO, color: tone === 'mine' ? 'var(--accent, #c8963e)' : '#8fa9ee', marginBottom: 3 }}>{title}</div>
      {children}
    </div>
  )
}

function ConflictBody({ op }) {
  const c = op.conflict || {}
  const s = c.server || {}
  const l = c.local || {}
  const isWo = op.kind !== 'inspection_save'
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <Version title="On the server now" tone="theirs">
        {isWo ? (<>
          <Row k="status" v={STATUS_WORD[s.status] || s.status} />
          {s.dispute_reason && <Row k="reason" v={s.dispute_reason} />}
          {s.vendor_note && <Row k="note" v={s.vendor_note} />}
          {s.openItems != null && <Row k="still open" v={`${s.openItems}${s.openList?.length ? ' — ' + s.openList.join('; ') : ''}`} />}
          <Row k="checked" v={fmt(s.fetched_at)} />
        </>) : (<>
          <Row k="inspected" v={s.inspection_date} />
          <Row k="saved" v={fmt(s.created_at)} />
          <Row k="status" v={s.status} />
          {s.scope && <Row k="scope" v={s.scope} />}
          <Row k="items" v={s.itemCount} />
        </>)}
      </Version>
      <Version title="On this phone" tone="mine">
        {isWo ? (<>
          <Row k="status" v={STATUS_WORD[l.status] || l.status} />
          {l.note && <Row k="note" v={l.note} />}
          <Row k="done at" v={fmt(l.at)} />
        </>) : (<>
          <Row k="inspected" v={l.inspection_date} />
          <Row k="captured" v={fmt(l.captured_at)} />
          <Row k="status" v={l.status} />
          {l.scope && <Row k="scope" v={l.scope} />}
          <Row k="items" v={l.itemCount} />
          <Row k="photos" v={l.mediaCount} />
        </>)}
      </Version>
    </div>
  )
}

function opTitle(op) {
  const base = KIND_LABEL[op.kind] || op.kind
  if (op.kind === 'inspection_save') return `${base} · ${op.payload?.pid || ''}`
  const d = op.conflict?.item?.description
  return d ? `${base} · ${d}` : base
}

const btn = (variant) => ({
  flex: 1, minHeight: 46, padding: '0 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, fontFamily: SANS, cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  border: variant === 'mine' ? '1px solid var(--accent, #c8963e)' : variant === 'danger' ? '1px solid rgba(224,92,106,0.5)' : '1px solid var(--border, #2e3040)',
  background: variant === 'mine' ? 'rgba(200,150,62,0.16)' : variant === 'danger' ? 'rgba(224,92,106,0.10)' : 'var(--bg-input, #252731)',
  color: variant === 'mine' ? 'var(--accent, #c8963e)' : variant === 'danger' ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)',
})

export default function ConflictSheet({ open, onClose, conflicts = [], failed = [], queued = [], onResolve, onRetry, onDiscard, onSyncNow, online }) {
  const [busy, setBusy] = useState(null)
  if (!open) return null

  const act = async (id, fn) => {
    setBusy(id)
    try { await fn() } finally { setBusy(null) }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Outbox"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(8,9,13,0.66)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 680, maxHeight: '88dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: 'var(--bg-panel, #1e2028)', color: 'var(--text, #e8e8f0)', borderRadius: '14px 14px 0 0', border: '1px solid var(--border, #2e3040)', borderBottom: 'none', padding: '8px 16px calc(18px + env(safe-area-inset-bottom))', fontFamily: SANS }}>
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '8px auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Outbox</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} · {failed.length} failed · {queued.length} queued
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ marginLeft: 'auto', width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-dim, #9394a8)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        {conflicts.length === 0 && failed.length === 0 && queued.length === 0 && (
          <div style={{ padding: '26px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted, #6b6d82)' }}>Nothing waiting. Everything on this phone is on the server.</div>
        )}

        {conflicts.map(op => (
          <section key={op.id} style={{ marginBottom: 16, padding: 13, borderRadius: 12, border: '1px solid rgba(224,92,106,0.42)', background: 'rgba(224,92,106,0.05)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', fontFamily: MONO, color: 'var(--red, #e05c6a)' }}>Conflict</div>
            <div style={{ fontSize: 14.5, fontWeight: 600, margin: '4px 0 10px', lineHeight: 1.4 }}>{opTitle(op)}</div>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>
              {op.kind === 'inspection_save'
                ? 'A newer inspection for this property reached the server after this one was captured. Keeping yours adds it as another inspection; it does not replace theirs.'
                : 'This changed on the server after you tapped. Keeping yours asks the server to apply your change anyway; it may still refuse.'}
            </p>
            <ConflictBody op={op} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy === op.id} style={btn('mine')} onClick={() => act(op.id, () => onResolve(op.id, 'mine'))}>Keep mine (replay)</button>
              <button type="button" disabled={busy === op.id} style={btn('plain')} onClick={() => act(op.id, () => onResolve(op.id, 'theirs'))}>Keep theirs (discard mine)</button>
            </div>
          </section>
        ))}

        {failed.map(op => (
          <section key={op.id} style={{ marginBottom: 12, padding: 13, borderRadius: 12, border: '1px solid rgba(224,92,106,0.32)', background: 'var(--bg-input, #252731)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', fontFamily: MONO, color: 'var(--red, #e05c6a)' }}>Failed · {op.attempts} attempt{op.attempts === 1 ? '' : 's'}</div>
            <div style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 6px' }}>{opTitle(op)}</div>
            <div style={{ fontSize: 12, fontFamily: MONO, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5, wordBreak: 'break-word' }}>{op.lastError || 'The server refused this.'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 4 }}>captured {fmt(op.createdAt)}{op.fileCount ? ` · ${op.fileCount} file${op.fileCount === 1 ? '' : 's'}` : ''}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" disabled={busy === op.id} style={btn('mine')} onClick={() => act(op.id, () => onRetry(op.id))}>Retry</button>
              <button type="button" disabled={busy === op.id} style={btn('danger')} onClick={() => act(op.id, () => onDiscard(op.id))}>Discard</button>
            </div>
          </section>
        ))}

        {queued.length > 0 && (
          <section style={{ marginTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', marginBottom: 6 }}>Waiting to sync</div>
            {queued.map(op => (
              <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border, #2e3040)', fontSize: 12.5 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opTitle(op)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, flexShrink: 0 }}>
                  {op.status === STATUS.SYNCING ? 'syncing…' : fmt(op.createdAt)}{op.fileCount ? ` · ${op.fileCount} file${op.fileCount === 1 ? '' : 's'}` : ''}
                </span>
              </div>
            ))}
            <button type="button" disabled={!online} style={{ ...btn('plain'), width: '100%', marginTop: 10, opacity: online ? 1 : 0.6 }} onClick={onSyncNow}>
              {online ? 'Sync now' : 'Offline — will sync when back online'}
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
