import { useState } from 'react'
import { useOutbox } from './useOutbox'
import ConflictSheet from './ConflictSheet'

// A compact, honest indicator. Hidden when there is nothing to say; otherwise
// one line, bottom-right, above whatever bar the page already has. Only takes
// a z-index above the FloatingNav while it is visible.
//
// `bottom` lets the host push it above its own fixed bar (the vendor page's
// submit bar, the portal's tab bar). Default clears the staff app's
// FloatingNav (56px) and the inspection pages' sticky footer.

const MONO = 'var(--font-mono, monospace)'

export default function OutboxBadge({ bottom = 'calc(86px + env(safe-area-inset-bottom))', right = 14 }) {
  const ob = useOutbox()
  const [open, setOpen] = useState(false)

  const nConflict = ob.conflicts.length
  const nFailed = ob.failed.length
  const nQueued = ob.depth

  let text = null, tone = 'amber', action = null
  if (nConflict > 0) {
    text = `${nConflict} conflict${nConflict === 1 ? '' : 's'} · tap to resolve`; tone = 'red'; action = () => setOpen(true)
  } else if (nFailed > 0) {
    text = `${nFailed} failed · tap to retry`; tone = 'red'; action = () => setOpen(true)
  } else if (ob.processing && ob.total > 0) {
    text = `Syncing ${ob.current} of ${ob.total}…`; tone = 'amber'; action = () => setOpen(true)
  } else if (!ob.online) {
    text = nQueued > 0 ? `Offline · ${nQueued} queued` : 'Offline'; tone = 'amber'; action = () => setOpen(true)
  } else if (nQueued > 0) {
    text = `${nQueued} queued · tap to sync`; tone = 'amber'; action = () => { ob.syncNow(); setOpen(true) }
  }

  const flash = ob.flash
  if (!text && !flash && !open) return null

  const colors = tone === 'red'
    ? { fg: 'var(--red, #e05c6a)', bg: 'rgba(224,92,106,0.14)', bd: 'rgba(224,92,106,0.55)' }
    : { fg: 'var(--accent, #c8963e)', bg: 'rgba(200,150,62,0.14)', bd: 'rgba(200,150,62,0.55)' }

  return (
    <>
      <div style={{ position: 'fixed', right, bottom, zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'none', maxWidth: 'calc(100vw - 28px)' }}>
        {flash && (
          <div role="status" style={{
            pointerEvents: 'auto', padding: '10px 13px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.45, fontFamily: MONO,
            background: 'var(--bg-panel, #1e2028)', color: flash.tone === 'red' ? 'var(--red, #e05c6a)' : 'var(--text, #e8e8f0)',
            border: `1px solid ${flash.tone === 'red' ? 'rgba(224,92,106,0.55)' : 'var(--border, #2e3040)'}`,
            boxShadow: '0 6px 22px rgba(0,0,0,0.38)', maxWidth: 340,
          }}>
            {flash.text}
          </div>
        )}
        {text && (
          <button type="button" onClick={action} aria-live="polite"
            style={{
              pointerEvents: 'auto', minHeight: 44, padding: '0 14px', borderRadius: 22, display: 'flex', alignItems: 'center', gap: 8,
              background: colors.bg, color: colors.fg, border: `1px solid ${colors.bd}`, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
              fontSize: 12.5, fontWeight: 700, fontFamily: MONO, cursor: 'pointer', boxShadow: '0 6px 22px rgba(0,0,0,0.35)',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation', whiteSpace: 'nowrap',
            }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: colors.fg, flexShrink: 0,
              animation: ob.processing ? 'pulse-outbox-blink 1s ease-in-out infinite' : 'none' }} />
            {text}
          </button>
        )}
      </div>
      <style>{'@keyframes pulse-outbox-blink{0%,100%{opacity:1}50%{opacity:.25}}'}</style>
      <ConflictSheet
        open={open}
        onClose={() => setOpen(false)}
        conflicts={ob.conflicts}
        failed={ob.failed}
        queued={ob.queued}
        online={ob.online}
        onResolve={ob.resolveConflict}
        onRetry={ob.retry}
        onDiscard={ob.discard}
        onSyncNow={ob.syncNow}
      />
    </>
  )
}
