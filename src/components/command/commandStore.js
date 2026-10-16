import { useSyncExternalStore } from 'react'

// The palette's open/closed state, as a module-level store. No context: the
// trigger in a header, the ⌘K listener and a chord all need to open the same
// surface, and none of them share an ancestor worth threading a provider
// through. Anything can call openCommand(); exactly one CommandSurface
// renders it.
//
//   openCommand({ pid, intent, query })
//     pid     · the property the actions should default to (the surface also
//               reads it off the URL, so most callers pass nothing)
//     intent  · 'estimate' | 'payment' | 'work_orders' | 'utilities' — a
//               chord that needs a property but had none; picking a property
//               completes it instead of opening the property page
//     query   · initial text

const EMPTY = Object.freeze({ open: false, pid: null, intent: null, query: '', openedAt: 0 })

let state = EMPTY
const subs = new Set()

function set(next) {
  state = Object.freeze({ ...state, ...next })
  subs.forEach(fn => { try { fn(state) } catch { /* a dead subscriber must not break the rest */ } })
}

export function getState() { return state }

export function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

export function openCommand(opts = {}) {
  set({
    open: true,
    pid: opts.pid ?? null,
    intent: opts.intent ?? null,
    query: typeof opts.query === 'string' ? opts.query : '',
    openedAt: Date.now(),
  })
}

export function closeCommand() {
  if (!state.open) return
  set({ open: false, intent: null })
}

export function toggleCommand(opts) {
  if (state.open) closeCommand(); else openCommand(opts)
}

// React binding. Tear-free with React 18's useSyncExternalStore; the snapshot
// is the frozen state object so referential equality is enough.
export function useCommandState() {
  return useSyncExternalStore(subscribe, getState, getState)
}
