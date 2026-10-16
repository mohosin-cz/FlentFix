import { useEffect, useState, useMemo, useRef } from 'react'
import { subscribe, getSnapshot, onEvent, syncNow, retry, retryAllFailed, discard, resolveConflict, STATUS } from './outbox'

// The outbox as React sees it. One subscription per mounted hook; the module
// keeps the truth, so two badges on one screen never disagree.
export function useOutbox() {
  const [snap, setSnap] = useState(getSnapshot)
  useEffect(() => subscribe(setSnap), [])

  const ops = snap.ops
  const queued = ops.filter(o => o.status === STATUS.QUEUED || o.status === STATUS.SYNCING)
  const failed = ops.filter(o => o.status === STATUS.FAILED)
  const conflicts = ops.filter(o => o.status === STATUS.CONFLICT)

  return {
    ops,
    queued,
    failed,
    conflicts,
    depth: queued.length,
    online: snap.online,
    processing: snap.processing,
    current: snap.current,
    total: snap.total,
    flash: snap.flash,
    lastSyncAt: snap.lastSyncAt,
    ready: snap.ready,
    syncNow,
    retry,
    retryAllFailed,
    discard,
    resolveConflict,
  }
}

// Completion events for a page holding optimistic state. The handler is
// re-read on every event, so the caller does not have to memoise it.
export function useOutboxEvents(handler) {
  const ref = useRef(handler)
  useEffect(() => { ref.current = handler })
  useEffect(() => onEvent(ev => ref.current?.(ev)), [])
}

// Convenience: the outbox ops for one work-order token, keyed by item id (plus
// the submit op, if any), so a card can show "will sync" without each card
// subscribing on its own.
export function useQueuedForToken(token) {
  const { ops } = useOutbox()
  return useMemo(() => {
    const byItem = {}
    let submit = null
    for (const op of ops) {
      if (op.payload?.token !== token) continue
      if (op.kind === 'wo_submit') { submit = op; continue }
      if (op.payload?.itemId) byItem[op.payload.itemId] = op
    }
    return { byItem, submit }
  }, [ops, token])
}
