// The outbox: writes that must land even when the connection does not.
//
// Scope is the two capture flows — ending an inspection (with its photos and
// videos) and a vendor closing work-order items — and nothing else. Each is
// one op in IndexedDB; this module replays them oldest-first whenever there is
// a reason to think the network is back, and tells the UI honestly what it is
// doing. A conflict is never resolved here: it is parked with both versions
// and waits for a person.
//
// No React, no router, no auth in this file. It runs in the staff app and in
// the vendor portal document alike, and the only things it imports from the
// app are the Supabase client and two utilities the live save paths already
// use, so a replay runs the same statements a direct save does.

import { supabase } from '../lib/supabase'
import { uploadMedia } from '../utils/mediaUtils'
import { advanceStage } from '../utils/propertyJourney'
import {
  STATUS, KIND, OFFLINE_MEDIA_PREFIX, isOfflineMediaRef, offlineMediaKey, uuid,
  putOp, getOp, deleteOp, listOps, updateOp,
  putPendingMedia, getPendingMedia, deletePendingMedia, listPendingMedia,
  getMeta, setMeta,
} from './db'

export { STATUS, KIND, isOfflineMediaRef, uuid }

// Server errors get this many goes before the op is parked as 'failed'. A
// network error never counts — the op simply waits for signal.
const MAX_SERVER_ATTEMPTS = 3
const INTERVAL_MS = 45_000
const PENDING_MEDIA_TTL_MS = 7 * 24 * 60 * 60 * 1000

// ── what counts as "the network", not "the server" ──────────────────────────
//
// navigator.onLine is a hint: it is true on a phone with one bar that cannot
// complete a request, and false in some webviews that are perfectly connected.
// The real signal is how the request died. fetch() rejects with a TypeError
// whose message is browser-specific ("Failed to fetch" in Chrome, "Load
// failed" in Safari, "NetworkError when attempting to fetch resource." in
// Firefox); supabase-js wraps that into { message } objects rather than
// throwing. Everything below is matched on the message, deliberately not on
// `instanceof TypeError` — a bug in our own code is also a TypeError, and
// classing it as "offline" would replay it forever.
const NET_RE = /failed to fetch|load failed|networkerror|network request failed|network error|fetch failed|internet connection|err_internet_disconnected|err_network|err_connection|err_name_not_resolved|timed out|timeout|aborted|abort/i

export function isNetworkError(err) {
  if (!err) return false
  const name = String(err.name || '')
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'AuthRetryableFetchError') return true
  const status = err.status ?? err.statusCode
  if (status === 0 || status === 502 || status === 503 || status === 504) return true
  const msg = String(err.message || err.details || err)
  return NET_RE.test(msg)
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

// The signed-in email without a network round trip. supabase.auth.getUser()
// calls the server and comes back empty offline; the session in storage knows
// who this is just as well.
export async function currentUserEmail() {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.user?.email ?? null
  } catch { return null }
}

// ── subscribers ──────────────────────────────────────────────────────────────

const subs = new Set()
const eventSubs = new Set()
let snapshot = {
  ops: [],            // without blobs
  online: !isOffline(),
  processing: false,
  current: 0,         // 1-based index of the op being replayed
  total: 0,
  flash: null,        // { id, text, tone } for a transient toast
  lastSyncAt: null,
  ready: false,
}

function publicOp(op) {
  // Blobs stay in IndexedDB; the UI only needs to know they exist.
  const { files, ...rest } = op
  return { ...rest, fileCount: files?.length || 0, bytes: (files || []).reduce((s, f) => s + (f.blob?.size || 0), 0) }
}

function emit(patch) {
  snapshot = { ...snapshot, ...patch }
  for (const fn of subs) { try { fn(snapshot) } catch (e) { console.error('[outbox] subscriber', e) } }
  scheduleInterval()
}

function emitEvent(ev) {
  for (const fn of eventSubs) { try { fn(ev) } catch (e) { console.error('[outbox] event subscriber', e) } }
}

export function getSnapshot() { return snapshot }

export function subscribe(fn) {
  subs.add(fn)
  fn(snapshot)
  if (!snapshot.ready) refresh()
  return () => subs.delete(fn)
}

// Completion events, for a page that has optimistic state to reconcile:
// { type: 'synced' | 'conflict' | 'failed' | 'discarded' | 'queued', op }
export function onEvent(fn) {
  eventSubs.add(fn)
  return () => eventSubs.delete(fn)
}

let flashTimer = null
export function flash(text, tone = 'amber', ms = 4500) {
  clearTimeout(flashTimer)
  emit({ flash: { id: uuid(), text, tone } })
  flashTimer = setTimeout(() => emit({ flash: null }), ms)
}

async function refresh() {
  try {
    const [ops, lastSyncAt] = await Promise.all([listOps(), getMeta('lastSyncAt')])
    emit({ ops: ops.map(publicOp), lastSyncAt: lastSyncAt ?? null, ready: true })
  } catch (e) {
    console.error('[outbox] refresh', e)
    emit({ ready: true })
  }
}

// ── enqueue ──────────────────────────────────────────────────────────────────

export async function enqueue({ kind, payload, files = [] }) {
  const op = {
    id: uuid(),
    kind,
    payload,
    files,
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    status: STATUS.QUEUED,
    conflict: null,
  }
  await putOp(op)
  await refresh()
  emitEvent({ type: 'queued', op: publicOp(op) })
  return op.id
}

export async function retry(id) {
  await updateOp(id, { status: STATUS.QUEUED, attempts: 0, lastError: null, conflict: null })
  await refresh()
  return syncNow()
}

export async function retryAllFailed() {
  const ops = await listOps()
  for (const op of ops) {
    if (op.status === STATUS.FAILED) await updateOp(op.id, { status: STATUS.QUEUED, attempts: 0, lastError: null })
  }
  await refresh()
  return syncNow()
}

export async function discard(id) {
  const op = await getOp(id)
  await deleteOp(id)
  await refresh()
  if (op) emitEvent({ type: 'discarded', op: publicOp(op) })
}

// 'mine' replays the op with the conflict check bypassed; the server may still
// refuse it (a verified item cannot be closed) and that lands as 'failed' with
// the server's reason. 'theirs' throws the local version away.
export async function resolveConflict(id, choice) {
  if (choice === 'theirs') return discard(id)
  await updateOp(id, op => ({ ...op, status: STATUS.QUEUED, attempts: 0, lastError: null, conflict: null, payload: { ...op.payload, force: true } }))
  await refresh()
  return syncNow()
}

// ── media taken while offline ────────────────────────────────────────────────
//
// The capture pages upload a photo the moment it is taken and keep only the
// public URL in the draft. Offline, the file is parked in IndexedDB instead
// and the draft gets a sentinel URL that passes the pages' `startsWith('http')`
// filters untouched; when the inspection is saved or queued the file travels
// with the op and is uploaded, under the same base name, on replay.

function extFor(file) {
  const sub = (file?.type || '').split('/')[1]?.split(';')[0]?.toLowerCase()
  const map = { quicktime: 'mov', 'x-matroska': 'mkv', '3gpp': '3gp', jpeg: 'jpg', 'svg+xml': 'svg' }
  if (sub && /^[a-z0-9+-]{1,12}$/.test(sub)) return map[sub] || sub.replace(/[^a-z0-9]/g, '')
  const i = (file?.name || '').lastIndexOf('.')
  if (i > 0) return file.name.slice(i + 1).toLowerCase()
  return (file?.type || '').startsWith('video/') ? 'mp4' : 'jpg'
}

export async function stashMedia(file, baseName, pid = null) {
  const key = uuid()
  await putPendingMedia({ key, blob: file, name: file.name || `${key}.${extFor(file)}`, type: file.type || '', size: file.size, baseName, pid, createdAt: Date.now() })
  return `${OFFLINE_MEDIA_PREFIX}${key}.${extFor(file)}`
}

// Upload now if we can; park it if we cannot. Returns a URL either way (a
// public one or a sentinel), or null when the user cancelled a large upload.
export async function uploadMediaOrStash(client, file, baseName, pid = null) {
  if (isOffline()) {
    const ref = await stashMedia(file, baseName, pid)
    flash('No signal · photo kept on this phone, uploads with the inspection')
    return ref
  }
  try {
    return await uploadMedia(client, file, baseName)
  } catch (err) {
    if (!isNetworkError(err)) throw err
    const ref = await stashMedia(file, baseName, pid)
    flash('No signal · photo kept on this phone, uploads with the inspection')
    return ref
  }
}

// For thumbnails: an object URL for a parked file. Caller revokes it.
export async function resolveOfflineMediaUrl(ref) {
  const key = offlineMediaKey(ref)
  if (!key) return null
  try {
    const row = await getPendingMedia(key)
    if (row?.blob) return URL.createObjectURL(row.blob)
    // Already moved into an op? Look there.
    for (const op of await listOps()) {
      const f = (op.files || []).find(x => x.key === key)
      if (f?.blob) return URL.createObjectURL(f.blob)
    }
  } catch { /* fall through */ }
  return null
}

function asFile(f) {
  if (typeof File !== 'undefined' && f.blob instanceof File) return f.blob
  return new File([f.blob], f.name || 'media', { type: f.type || f.blob?.type || '' })
}

// ── inspection save ──────────────────────────────────────────────────────────
//
// payload = {
//   inspectionId, pid,
//   inspection:     { id, pid, house_type, inspection_date, status, config, owner_email },
//   lineItems:      [{ id, inspection_id, ...sanitised columns }],
//   media:          [{ id, lineItemId, url, type, is_proof_video }]   // url may be a sentinel
//   propertyUpsert: { pid, name, type, address, landlord, deleted_at } | null,
//   clearBin:       boolean,
//   quickNote:      string | null,
//   stage:          'inspection_done' | null,
//   userEmail:      string | null,
//   clearDrafts:    [localStorage keys],
// }
// Statements run in the order the pages ran them: inspection → line items →
// media uploads + line_item_media → property upsert → bin delete → quick note
// → advanceStage. Every row carries a client id and is written with
// ON CONFLICT DO NOTHING, so a replay of a half-finished attempt adds nothing
// twice. (advanceStage is the one exception: it appends a journey row, so a
// replay that died after it can log the stage twice. Harmless, and noted.)

function mediaKindFromUrl(url, fallbackType) {
  if (fallbackType === 'video' || fallbackType === 'image') return fallbackType
  return /\.(mp4|mov|webm|m4v|3gp|3gpp|mkv|avi)(\?|$)/i.test(url) ? 'video' : 'image'
}

async function performInspectionSave(op) {
  const p = op.payload
  const client = supabase

  // Has this already landed? (An earlier attempt may have died after the
  // inserts and before the tail.)
  const { data: existing, error: exErr } = await client
    .from('inspections').select('id, inspection_line_items(count)').eq('id', p.inspectionId).maybeSingle()
  if (exErr) throw exErr
  const existingCount = existing?.inspection_line_items?.[0]?.count ?? 0
  const alreadyInserted = !!existing && (existingCount > 0 || p.lineItems.length === 0)

  if (!existing && !p.force) {
    const conflict = await inspectionConflict(p, op)
    if (conflict) return { conflict }
  }

  if (!alreadyInserted) {
    const { error: insErr } = await client
      .from('inspections').upsert(p.inspection, { onConflict: 'id', ignoreDuplicates: true })
    if (insErr) throw insErr

    if (p.lineItems.length) {
      const { error: liErr } = await client
        .from('inspection_line_items').upsert(p.lineItems, { onConflict: 'id', ignoreDuplicates: true })
      if (liErr) throw new Error('Line item insert failed: ' + liErr.message)
    }
  }

  // Media: anything parked offline is uploaded now under the base name it was
  // given when it was taken, so a re-upload overwrites rather than duplicates.
  //
  // One bad file must not hold the whole inspection hostage: a photo the phone
  // stored as zero bytes (iOS Safari does this to IndexedDB blobs now and then)
  // makes storage answer "No content provided" on every retry, and the save
  // never finishes — none of the other photos get linked (PID 265, Oct 2026).
  // An empty or unreadable file is skipped and named; a dropped connection
  // still stops the save so it retries.
  const mediaRows = []
  const skipped = []
  for (const m of p.media || []) {
    let url = m.url
    let type = m.type
    if (isOfflineMediaRef(url)) {
      const key = offlineMediaKey(url)
      const f = (op.files || []).find(x => x.key === key)
      if (!f?.blob) { console.warn('[outbox] media blob missing, skipping', key); skipped.push(f?.name || key); continue }
      if (!f.blob.size) { console.warn('[outbox] media blob is empty, skipping', key); skipped.push(f.name || key); continue }
      const mime = f.type || f.blob.type || ''
      if (mime) type = mime.startsWith('video/') ? 'video' : 'image'
      try {
        url = await uploadMedia(client, asFile(f), f.baseName || `${p.pid}/${key}`)
      } catch (err) {
        if (isNetworkError(err)) throw err
        console.warn('[outbox] media upload refused, skipping', key, err?.message)
        skipped.push(f.name || key)
        continue
      }
      if (!url) continue   // user declined a very large video
    }
    if (typeof url !== 'string' || !url.startsWith('http')) continue
    const row = { id: m.id, line_item_id: m.lineItemId, url, type: mediaKindFromUrl(url, type) }
    if (m.is_proof_video != null) row.is_proof_video = !!m.is_proof_video
    mediaRows.push(row)
  }
  if (mediaRows.length) {
    const { error: mErr } = await client.from('line_item_media').upsert(mediaRows, { onConflict: 'id', ignoreDuplicates: true })
    if (mErr) throw mErr
  }

  if (p.propertyUpsert) {
    const { error } = await client.from('properties').upsert(p.propertyUpsert, { onConflict: 'pid' })
    if (error) throw error
  }
  if (p.clearBin) {
    const { error } = await client.from('properties_bin').delete().eq('pid', p.pid)
    if (error) throw error
  }
  if (p.quickNote && p.quickNote.trim()) {
    const { error } = await client.from('quick_notes').upsert({ pid: p.pid, note: p.quickNote, updated_at: new Date().toISOString() }, { onConflict: 'pid' })
    // As before: a note that fails to sync must not lose the inspection behind it.
    if (error) console.error('quick_notes sync failed:', error.message)
  }
  if (p.stage) await advanceStage(client, p.pid, p.stage, p.userEmail)

  if (skipped.length) {
    flash(`PID ${p.pid} synced · ${skipped.length} photo${skipped.length === 1 ? '' : 's'} couldn’t be read on this phone and ${skipped.length === 1 ? 'was' : 'were'} skipped — add ${skipped.length === 1 ? 'it' : 'them'} again on the estimate`, 'amber', 9000)
  }
  return { ok: true, skipped }
}

// A newer inspection for this PID than the one we are holding means someone
// else finished one while this phone was dark. Both are summarised; a person
// picks. Inspections this outbox itself wrote carry config.captured_at, so
// an earlier queued save for the same PID replayed a moment ago is compared on
// when it was captured, not on when it reached the server.
async function inspectionConflict(p, op) {
  const since = new Date(op.createdAt).toISOString()
  const { data, error } = await supabase
    .from('inspections')
    .select('id, inspection_date, created_at, status, config, inspection_line_items(count)')
    .eq('pid', p.pid).gt('created_at', since)
    .order('created_at', { ascending: false }).limit(5)
  if (error) throw error
  const newer = (data || []).find(r => {
    const captured = r.config?.captured_at ? Date.parse(r.config.captured_at) : Date.parse(r.created_at)
    return captured > op.createdAt
  })
  if (!newer) return null
  return {
    kind: KIND.INSPECTION_SAVE,
    server: {
      id: newer.id,
      inspection_date: newer.inspection_date,
      created_at: newer.created_at,
      status: newer.status,
      itemCount: newer.inspection_line_items?.[0]?.count ?? 0,
      scope: newer.config?.scope || (newer.status === 'completed' ? 'full' : null),
    },
    local: {
      inspection_date: p.inspection.inspection_date,
      captured_at: new Date(op.createdAt).toISOString(),
      status: p.inspection.status,
      itemCount: p.lineItems.length,
      mediaCount: (p.media || []).length,
      scope: p.inspection.config?.scope || (p.inspection.status === 'completed' ? 'full' : null),
    },
  }
}

function clearDrafts(keys) {
  for (const k of keys || []) { try { localStorage.removeItem(k) } catch { /* ignore */ } }
}

// Try the real save; if the network is the problem, queue the whole thing
// (blobs included) and resolve 'queued'. Anything else throws to the page.
export async function saveInspectionOrQueue(payload) {
  const inspection = { ...payload.inspection, config: { ...(payload.inspection.config || {}), captured_at: new Date().toISOString() } }
  const full = { ...payload, inspection }

  // Pull the files this save refers to out of pending_media.
  const keys = [...new Set((full.media || []).map(m => offlineMediaKey(m.url)).filter(Boolean))]
  const files = []
  for (const key of keys) {
    const row = await getPendingMedia(key).catch(() => null)
    if (row) files.push({ key, blob: row.blob, name: row.name, type: row.type, baseName: row.baseName })
  }

  const op = { id: uuid(), kind: KIND.INSPECTION_SAVE, payload: full, files, createdAt: Date.now(), attempts: 0, status: STATUS.QUEUED }

  const queue = async () => {
    await putOp(op)
    await deletePendingMedia(keys)
    clearDrafts(full.clearDrafts)
    await refresh()
    emitEvent({ type: 'queued', op: publicOp(op) })
    flash('Saved offline · will sync when you’re back online')
    return 'queued'
  }

  if (isOffline()) return queue()
  try {
    const res = await performInspectionSave(op)
    if (res?.conflict) {
      // Online, but someone finished a newer inspection for this PID while
      // this one was being written. Park it with both versions.
      op.status = STATUS.CONFLICT; op.conflict = res.conflict
      await putOp(op)
      await deletePendingMedia(keys)
      clearDrafts(full.clearDrafts)
      await refresh()
      emitEvent({ type: 'conflict', op: publicOp(op) })
      flash('Newer inspection found for this PID · tap the outbox to resolve', 'red', 7000)
      return 'conflict'
    }
    await deletePendingMedia(keys)
    clearDrafts(full.clearDrafts)
    return 'saved'
  } catch (err) {
    if (isNetworkError(err)) return queue()
    throw err
  }
}

// ── work order ops ───────────────────────────────────────────────────────────
//
// payload = { token, itemId?, note?, expected: { status }, local: { status, note, at } }
// Replay reads the current server state first (wo_fetch, read-only) and only
// calls the mutating RPC when the item is still as the vendor last saw it.

async function performWorkOrderOp(op) {
  const p = op.payload
  const { data: wo, error: fErr } = await supabase.rpc('wo_fetch', { p_token: p.token })
  if (fErr) throw fErr
  if (!wo) throw new Error('Work order not found')

  const at = new Date().toISOString()

  if (op.kind === KIND.WO_SUBMIT) {
    if (wo.status === 'vendor_completed' || wo.status === 'verified') return { ok: true, already: true }
    const open = (wo.items || []).filter(i => i.status === 'pending' || i.status === 'disputed')
    if (open.length && !p.force) {
      return { conflict: { kind: op.kind, server: { status: wo.status, openItems: open.length, openList: open.slice(0, 5).map(i => i.description), fetched_at: at }, local: p.local } }
    }
    const { error } = await supabase.rpc('wo_submit', { p_token: p.token })
    if (error) throw error
    return { ok: true }
  }

  const item = (wo.items || []).find(i => i.id === p.itemId)
  if (!item) {
    if (!p.force) return { conflict: { kind: op.kind, server: { status: 'missing', note: 'This item is no longer on the work order', fetched_at: at }, local: p.local } }
    throw new Error('Item is no longer on this work order')
  }

  const serverStatus = item.status
  if (serverStatus === p.local?.status) return { ok: true, already: true }
  if (!p.force && serverStatus !== p.expected?.status) {
    return {
      conflict: {
        kind: op.kind,
        server: { status: serverStatus, dispute_reason: item.dispute_reason || null, vendor_note: item.vendor_note || null, fetched_at: at },
        local: p.local,
        item: { description: item.description, area: item.area },
      },
    }
  }

  if (op.kind === KIND.WO_CLOSE_ITEM) {
    const { error } = await supabase.rpc('wo_close_item', { p_token: p.token, p_item_id: p.itemId, p_note: p.note ?? null })
    if (error) throw error
    return { ok: true }
  }
  if (op.kind === KIND.WO_REOPEN_ITEM) {
    const { error } = await supabase.rpc('wo_reopen_item', { p_token: p.token, p_item_id: p.itemId })
    if (error) throw error
    return { ok: true }
  }
  throw new Error('Unknown op kind ' + op.kind)
}

// Called by the vendor page. Tries the RPC; on a network failure the op is
// queued and the page keeps its optimistic state. Returns
//   { data }          the RPC result (fresh work order)
//   { queued: opId }  parked for later
//   { error }         a real server refusal — the page reverts, as before
export async function workOrderOpOrQueue(kind, payload) {
  const enqueueIt = async () => ({ queued: await enqueue({ kind, payload }) })
  if (isOffline()) return enqueueIt()
  const args = { p_token: payload.token }
  if (kind !== KIND.WO_SUBMIT) args.p_item_id = payload.itemId
  if (kind === KIND.WO_CLOSE_ITEM) args.p_note = payload.note ?? null
  // One bar of signal is a request that hangs, not one that fails. Give it 20s
  // and then treat it as offline — the tap is queued, not lost or left spinning.
  let q = supabase.rpc(kind, args)
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') q = q.abortSignal(AbortSignal.timeout(20_000))
  const { data, error } = await q
  if (!error) return { data }
  if (isNetworkError(error)) return enqueueIt()
  return { error }
}

// ── the loop ─────────────────────────────────────────────────────────────────

const PERFORM = {
  [KIND.INSPECTION_SAVE]: performInspectionSave,
  [KIND.WO_CLOSE_ITEM]: performWorkOrderOp,
  [KIND.WO_REOPEN_ITEM]: performWorkOrderOp,
  [KIND.WO_SUBMIT]: performWorkOrderOp,
}

let running = false
let wantsAnother = false

async function runQueue() {
  const ops = (await listOps()).filter(o => o.status === STATUS.QUEUED || o.status === STATUS.SYNCING)
  if (!ops.length) { emit({ processing: false, current: 0, total: 0 }); return }
  emit({ processing: true, total: ops.length, current: 0 })

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    emit({ current: i + 1 })
    await updateOp(op.id, { status: STATUS.SYNCING })
    let result
    try {
      result = await PERFORM[op.kind](op)
    } catch (err) {
      const msg = err?.message || String(err)
      if (isNetworkError(err)) {
        // Still dark. Put it back and stop — the ones behind it will not fare
        // better, and FIFO order is part of the contract.
        await updateOp(op.id, { status: STATUS.QUEUED, lastError: msg })
        await refresh()
        emit({ processing: false, current: 0, total: 0, online: false })
        return
      }
      const attempts = (op.attempts || 0) + 1
      const failed = attempts >= MAX_SERVER_ATTEMPTS
      await updateOp(op.id, { status: failed ? STATUS.FAILED : STATUS.QUEUED, attempts, lastError: msg })
      await refresh()
      if (failed) emitEvent({ type: 'failed', op: publicOp({ ...op, lastError: msg }) })
      continue
    }

    if (result?.conflict) {
      const next = await updateOp(op.id, { status: STATUS.CONFLICT, conflict: result.conflict })
      await refresh()
      emitEvent({ type: 'conflict', op: publicOp(next) })
      continue
    }

    await deleteOp(op.id)
    await setMeta('lastSyncAt', Date.now())
    await refresh()
    emitEvent({ type: 'synced', op: publicOp(op), already: !!result?.already })
  }
  emit({ processing: false, current: 0, total: 0, online: true })
}

export async function processOutbox() {
  if (running) { wantsAnother = true; return }
  running = true
  try {
    // Two documents share this origin (the staff app and the vendor portal);
    // the Web Locks API keeps two tabs from replaying the same op at once.
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      await navigator.locks.request('pulse-outbox', { ifAvailable: true }, async lock => {
        if (!lock) return
        await runQueue()
      })
    } else {
      await runQueue()
    }
    await sweepPendingMedia()
  } catch (e) {
    console.error('[outbox] process', e)
    emit({ processing: false, current: 0, total: 0 })
  } finally {
    running = false
    if (wantsAnother) { wantsAnother = false; processOutbox() }
  }
}

export function syncNow() { return processOutbox() }

// Photos parked while offline whose inspection was never ended. A week is
// generous; after that they are a quota problem, not a capture.
async function sweepPendingMedia() {
  try {
    const rows = await listPendingMedia()
    const old = rows.filter(r => Date.now() - (r.createdAt || 0) > PENDING_MEDIA_TTL_MS).map(r => r.key)
    if (old.length) await deletePendingMedia(old)
  } catch { /* ignore */ }
}

// ── triggers ─────────────────────────────────────────────────────────────────

let interval = null
function scheduleInterval() {
  const depth = snapshot.ops.filter(o => o.status === STATUS.QUEUED).length
  if (depth > 0 && !interval) {
    interval = setInterval(() => { if (!isOffline()) processOutbox() }, INTERVAL_MS)
  } else if (depth === 0 && interval) {
    clearInterval(interval); interval = null
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { emit({ online: true }); processOutbox() })
  window.addEventListener('offline', () => emit({ online: false }))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !isOffline()) processOutbox()
  })
  // First load: whatever was left from last time.
  setTimeout(() => { refresh().then(() => { if (!isOffline()) processOutbox() }) }, 1500)
}
