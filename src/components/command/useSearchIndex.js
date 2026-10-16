import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'

// The palette's index.
//
// Two tiers. The local tier is the user's working set — every live property
// (with its journey stage) and every active vendor — held in memory and
// mirrored to localStorage, so the palette filters at keystroke speed with no
// network. The long tail (work orders, estimates, invoices, archived vendors,
// anything the cache missed) comes from command_search() and only when the
// local tier came up short.
//
// Freshness: 10 minutes. A stale cache is still served instantly and then
// refreshed behind the input, so the first keystroke never waits.

const LS_KEY = 'pulse.cmd.index.v1'
const TTL_MS = 10 * 60 * 1000
const REMOTE_MIN_CHARS = 2
const REMOTE_WHEN_LOCAL_BELOW = 5
const REMOTE_DEBOUNCE_MS = 150

// ─── cache ───────────────────────────────────────────────────────────────────

let mem = { at: 0, properties: [], vendors: [], loaded: false, error: null }
let inflight = null
const listeners = new Set()

function emit() { listeners.forEach(fn => { try { fn(mem) } catch { /* ignore */ } }) }

function readLS() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (!v || !Array.isArray(v.properties) || !Array.isArray(v.vendors) || typeof v.at !== 'number') return null
    return v
  } catch { return null }
}

function writeLS(v) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ at: v.at, properties: v.properties, vendors: v.vendors })) } catch { /* private window, quota */ }
}

// Only the fields the palette renders. Keeps localStorage small and makes the
// row shape explicit for anyone reading the component.
function slimProperty(r) {
  return {
    pid: r.pid, name: r.property_name || '', stage_code: r.stage_code || null, stage_label: r.stage_label || '',
    age_days: r.age_days ?? null, since: r.since || null, urgency: r.urgency || null,
    blocked_on: r.blocked_on || null, next_action_label: r.next_action_label || '', next_action_route: r.next_action_route || '',
  }
}
function slimVendor(v) {
  return { id: v.id, full_name: v.full_name || '', trade: v.trade || '', status: v.status || '', vendor_code: v.vendor_code || '' }
}

async function fetchIndex() {
  const [p, v] = await Promise.all([
    supabase.rpc('property_journey_state', { p_scope: 'all' }),
    // rejected / withdrawn / archived are not a working set; exited vendors
    // stay (payroll history is still asked about). The long tail finds all.
    supabase.from('vendors').select('id, full_name, trade, status, vendor_code')
      .not('status', 'in', '(rejected,withdrawn,archived)')
      .order('full_name'),
  ])
  const error = p.error || v.error
  if (error) throw new Error(error.message)
  return {
    at: Date.now(),
    properties: (p.data || []).map(slimProperty),
    vendors: (v.data || []).map(slimVendor),
  }
}

/** Ensure the index is loaded; refresh in the background when stale. Safe to call often. */
export function ensureIndex({ force = false } = {}) {
  if (!mem.loaded) {
    const ls = readLS()
    if (ls) { mem = { ...mem, ...ls, loaded: true }; emit() }
  }
  const fresh = mem.loaded && Date.now() - mem.at < TTL_MS
  if (fresh && !force) return Promise.resolve(mem)
  if (inflight) return inflight
  inflight = fetchIndex()
    .then(next => { mem = { ...next, loaded: true, error: null }; writeLS(mem); emit(); return mem })
    .catch(err => { mem = { ...mem, error: err.message || String(err) }; emit(); return mem })
    .finally(() => { inflight = null })
  return inflight
}

export function getIndex() { return mem }

// ─── matcher ─────────────────────────────────────────────────────────────────
//
// Case-insensitive, no library. Whole-query exact › prefix › word-start ›
// contains › subsequence, with a PID exact match above everything. A query
// with spaces is also tried token-by-token against the joined fields, so
// "rose qc" finds Rose Villa in QC pending.

function norm(s) { return String(s ?? '').toLowerCase().trim() }

function isBoundary(t, i) { return i === 0 || !/[a-z0-9]/.test(t[i - 1]) }

/** Score one query string against one text. 0 = no match. Higher is better. */
export function fuzzyScore(q, text) {
  if (!q) return 1
  const t = norm(text)
  if (!t) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 80 - Math.min(10, (t.length - q.length) * 0.1)
  const idx = t.indexOf(q)
  if (idx >= 0) return (isBoundary(t, idx) ? 65 : 45) - Math.min(10, idx * 0.2)
  // subsequence: every query char in order; reward boundary hits and runs
  let ti = 0, score = 0, prev = -2
  for (let i = 0; i < q.length; i++) {
    const c = q[i]
    if (c === ' ') continue
    ti = t.indexOf(c, ti)
    if (ti < 0) return 0
    score += isBoundary(t, ti) ? 3 : (ti === prev + 1 ? 2 : 1)
    prev = ti
    ti++
  }
  const maxPossible = q.replace(/ /g, '').length * 3
  // 10..35: a subsequence hit never outranks a contains hit
  return 10 + 25 * (score / maxPossible) - Math.min(8, (t.length - q.length) * 0.05)
}

/**
 * Score a row given its searchable fields in priority order. Returns 0 for no
 * match. `pid` (if given) short-circuits to the top on an exact match.
 */
export function scoreFields(q, fields, { pid } = {}) {
  const nq = norm(q)
  if (!nq) return 1
  if (pid != null && norm(pid) === nq) return 1000
  let best = 0
  for (let i = 0; i < fields.length; i++) {
    const s = fuzzyScore(nq, fields[i])
    if (s > 0) {
      // the first field is the primary name; later fields count a little less
      const weighted = s - i * 2
      if (weighted > best) best = weighted
    }
  }
  if (best > 0) return best
  // multi-token: every token must hit the joined haystack
  if (nq.includes(' ')) {
    const hay = fields.map(norm).join(' ')
    const toks = nq.split(/\s+/).filter(Boolean)
    let sum = 0
    for (const tok of toks) {
      const s = fuzzyScore(tok, hay)
      if (s <= 0) return 0
      sum += s
    }
    return (sum / toks.length) * 0.9
  }
  return 0
}

function topN(rows, score, n) {
  const out = []
  for (const r of rows) {
    const s = score(r)
    if (s > 0) out.push({ s, r })
  }
  out.sort((a, b) => b.s - a.s)
  return out.slice(0, n).map(x => x.r)
}

export function filterProperties(q, properties, n = 8) {
  return topN(properties, r => scoreFields(q, [r.pid, r.name, r.stage_label], { pid: r.pid }), n)
}

export function filterVendors(q, vendors, n = 6) {
  return topN(vendors, v => scoreFields(q, [v.full_name, v.vendor_code, v.trade]), n)
}

// ─── hook ────────────────────────────────────────────────────────────────────

function useIndexSnapshot(enabled) {
  const [snap, setSnap] = useState(mem)
  useEffect(() => {
    if (!enabled) return
    listeners.add(setSnap)
    setSnap(mem)
    ensureIndex()
    return () => listeners.delete(setSnap)
  }, [enabled])
  return snap
}

/**
 * useSearchIndex(query, { enabled })
 *   properties · local property hits (≤ 8), instant
 *   vendors    · local vendor hits (≤ 6), instant
 *   remote     · command_search rows not already covered locally, by kind
 *   searching  · a long-tail request is in flight
 *   searched   · a long-tail request has completed for THIS query
 *   indexReady · the local tier has loaded at least once
 *   indexError · the local tier's last load failed (cache may still be served)
 *   remoteError· the last long-tail call failed (e.g. migration not applied)
 */
export function useSearchIndex(query, { enabled = true } = {}) {
  const snap = useIndexSnapshot(enabled)
  const q = norm(query)

  const properties = useMemo(() => q ? filterProperties(q, snap.properties) : [], [q, snap.properties])
  const vendors = useMemo(() => q ? filterVendors(q, snap.vendors) : [], [q, snap.vendors])
  const localCount = properties.length + vendors.length

  const [remote, setRemote] = useState({ q: '', rows: [], searching: false, error: null })
  const seq = useRef(0)

  const wantRemote = enabled && q.length >= REMOTE_MIN_CHARS && localCount < REMOTE_WHEN_LOCAL_BELOW
  useEffect(() => {
    if (!wantRemote) { seq.current++; setRemote(r => r.searching ? { ...r, searching: false } : r); return }
    const my = ++seq.current
    setRemote(r => ({ ...r, searching: true }))
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('command_search', { p_q: q, p_limit: 20 })
      if (my !== seq.current) return // a newer keystroke owns the result slot
      setRemote({ q, rows: error ? [] : (data || []), searching: false, error: error ? error.message : null })
    }, REMOTE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [q, wantRemote])

  // Merge: drop anything the local tier already shows, de-dup by kind+id.
  const merged = useMemo(() => {
    if (!wantRemote || remote.q !== q) return { property: [], vendor: [], work_order: [], estimate: [], invoice: [] }
    const seen = new Set()
    for (const p of properties) seen.add('property:' + p.pid)
    for (const v of vendors) seen.add('vendor:' + v.id)
    const out = { property: [], vendor: [], work_order: [], estimate: [], invoice: [] }
    for (const r of remote.rows) {
      const key = r.kind + ':' + r.id
      if (seen.has(key)) continue
      seen.add(key)
      if (out[r.kind]) out[r.kind].push(r)
    }
    return out
  }, [wantRemote, remote, q, properties, vendors])

  return {
    properties, vendors, remote: merged,
    searching: wantRemote && remote.searching,
    searched: wantRemote && !remote.searching && remote.q === q,
    indexReady: snap.loaded, indexError: snap.error, remoteError: wantRemote && remote.q === q ? remote.error : null,
    allProperties: snap.properties,
  }
}
