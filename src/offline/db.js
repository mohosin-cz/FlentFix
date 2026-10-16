// IndexedDB for the capture flows that have to survive a dead connection.
//
// Three stores:
//   outbox        — one row per queued write, FIFO by createdAt. Photos and
//                   videos ride along as Blobs in `files`; IndexedDB stores
//                   them natively, so a 30MB video is not base64 in a string.
//   pending_media — a photo taken while offline, before the inspection it
//                   belongs to has been ended. It is referenced from the draft
//                   (localStorage) by a sentinel URL, and moved into the outbox
//                   op's `files` when the inspection is saved or queued.
//   meta          — lastSyncAt and the like.
//
// No React, no router, no auth in here: the vendor portal (attend.html) and
// the staff app both open this database, and they share nothing else.

import { openDB } from 'idb'

const NAME = 'pulse-offline'
const VERSION = 1

export const STATUS = Object.freeze({
  QUEUED: 'queued',
  SYNCING: 'syncing',
  FAILED: 'failed',
  CONFLICT: 'conflict',
})

export const KIND = Object.freeze({
  INSPECTION_SAVE: 'inspection_save',
  WO_CLOSE_ITEM: 'wo_close_item',
  WO_REOPEN_ITEM: 'wo_reopen_item',
  WO_SUBMIT: 'wo_submit',
})

// A media reference the draft can hold in place of a public URL. It must pass
// the capture pages' existing `startsWith('http')` filter unchanged, and must
// end with the real extension so their `/\.(mp4|mov|webm)$/` video test and
// `url.includes('.mp4')` type test keep working. `.invalid` is reserved by
// RFC 2606 and never resolves, so nothing can accidentally fetch it.
export const OFFLINE_MEDIA_PREFIX = 'https://offline.media.invalid/'

export function isOfflineMediaRef(url) {
  return typeof url === 'string' && url.startsWith(OFFLINE_MEDIA_PREFIX)
}

export function offlineMediaKey(url) {
  if (!isOfflineMediaRef(url)) return null
  const rest = url.slice(OFFLINE_MEDIA_PREFIX.length)
  const dot = rest.lastIndexOf('.')
  return dot > 0 ? rest.slice(0, dot) : rest
}

export function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Safari < 15.4 and insecure contexts. Good enough for a client id.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

let dbPromise = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(NAME, VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('outbox')) {
          const s = db.createObjectStore('outbox', { keyPath: 'id' })
          s.createIndex('createdAt', 'createdAt')
          s.createIndex('status', 'status')
        }
        if (!db.objectStoreNames.contains('pending_media')) {
          const s = db.createObjectStore('pending_media', { keyPath: 'key' })
          s.createIndex('createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
      },
      blocked() { console.warn('[offline] IndexedDB upgrade blocked by another tab') },
      blocking() { /* a newer version wants in; we hold no long transactions */ },
    })
    dbPromise.catch(err => { console.error('[offline] IndexedDB unavailable:', err); dbPromise = null })
  }
  return dbPromise
}

// ── outbox ───────────────────────────────────────────────────────────────────

export async function putOp(op) {
  const db = await getDB()
  await db.put('outbox', op)
  return op
}

export async function getOp(id) {
  const db = await getDB()
  return db.get('outbox', id)
}

export async function deleteOp(id) {
  const db = await getDB()
  await db.delete('outbox', id)
}

// Oldest first. This is the replay order; it matters for a close followed by
// an undo on the same item.
export async function listOps() {
  const db = await getDB()
  return db.getAllFromIndex('outbox', 'createdAt')
}

export async function updateOp(id, patch) {
  const db = await getDB()
  const tx = db.transaction('outbox', 'readwrite')
  const cur = await tx.store.get(id)
  if (!cur) { await tx.done; return null }
  const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch }
  await tx.store.put(next)
  await tx.done
  return next
}

// ── pending media ────────────────────────────────────────────────────────────

export async function putPendingMedia(row) {
  const db = await getDB()
  await db.put('pending_media', row)
  return row
}

export async function getPendingMedia(key) {
  const db = await getDB()
  return db.get('pending_media', key)
}

export async function deletePendingMedia(keys) {
  if (!keys?.length) return
  const db = await getDB()
  const tx = db.transaction('pending_media', 'readwrite')
  await Promise.all(keys.map(k => tx.store.delete(k)))
  await tx.done
}

export async function listPendingMedia() {
  const db = await getDB()
  return db.getAllFromIndex('pending_media', 'createdAt')
}

// ── meta ─────────────────────────────────────────────────────────────────────

export async function getMeta(key) {
  const db = await getDB()
  return db.get('meta', key)
}

export async function setMeta(key, value) {
  const db = await getDB()
  await db.put('meta', value, key)
}
