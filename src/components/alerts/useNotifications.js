import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// The inbox, for one signed-in person.
//
//   list         undismissed notifications, newest first (null until read once)
//   unreadCount  the badge number, polled every 60s while the tab is visible
//   markRead     optimistic; the server is the truth and a failure reloads
//   dismiss      optimistic removal; a dismissed event never comes back
//   reload       full refresh
//
// On mount it calls journey_alerts_sweep() first — the clock-driven events
// (silent landlord, vendor due tomorrow, T-Day tomorrow) only exist once
// something asks for them. It is idempotent and ~35 ms, so the bell is the
// scheduler until pg_cron takes over. A realtime subscription on the person's
// own rows makes trigger-written events land without waiting for the poll;
// the poll stays as the safety net when the socket is not there.

const POLL_MS = 60_000

export function useNotifications({ enabled = true, pollMs = POLL_MS } = {}) {
  const { session } = useAuth()
  const email = (session?.user?.email ?? '').toLowerCase()
  const active = enabled && !!email

  const [state, setState] = useState({ loading: active, error: null, list: null, unreadCount: 0 })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const loadCount = useCallback(async () => {
    const { data, error } = await supabase.rpc('notifications_unread_count')
    if (error || !alive.current) return
    setState(s => ({ ...s, unreadCount: data ?? 0 }))
  }, [])

  const reload = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const [list, count] = await Promise.all([
      supabase.rpc('notifications_list', { p_limit: 100 }),
      supabase.rpc('notifications_unread_count'),
    ])
    if (!alive.current) return
    if (list.error) { setState(s => ({ ...s, loading: false, error: list.error.message })); return }
    const rows = list.data || []
    setState({
      loading: false, error: null, list: rows,
      unreadCount: count.error ? rows.filter(n => !n.read_at).length : (count.data ?? 0),
    })
  }, [])

  // mount: sweep, then read. A failed sweep is not worth blocking the inbox.
  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      await supabase.rpc('journey_alerts_sweep')
      if (!cancelled) reload()
    })()
    return () => { cancelled = true }
  }, [active, reload])

  // poll the badge while the tab is visible; catch up the moment it becomes visible
  useEffect(() => {
    if (!active) return
    const tick = () => { if (document.visibilityState === 'visible') loadCount() }
    const id = setInterval(tick, pollMs)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [active, pollMs, loadCount])

  // realtime on my own rows (RLS-filtered server side; the filter is a courtesy)
  useEffect(() => {
    if (!active) return
    let channel
    try {
      channel = supabase
        .channel(`notifications:${email}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_email=eq.${email}` }, () => reload())
        .subscribe()
    } catch { /* no realtime here; the poll covers it */ }
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [active, email, reload])

  const markRead = useCallback(async (ids) => {
    const set = new Set(ids || [])
    if (set.size === 0) return
    const now = new Date().toISOString()
    let delta = 0
    setState(s => {
      const list = (s.list || []).map(n => {
        if (set.has(n.id) && !n.read_at) { delta += 1; return { ...n, read_at: now } }
        return n
      })
      return { ...s, list, unreadCount: Math.max(0, s.unreadCount - delta) }
    })
    const { error } = await supabase.rpc('notifications_mark_read', { p_ids: [...set] })
    if (error) reload()
  }, [reload])

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setState(s => ({ ...s, list: (s.list || []).map(n => n.read_at ? n : { ...n, read_at: now }), unreadCount: 0 }))
    const { error } = await supabase.rpc('notifications_mark_read', { p_ids: null })
    if (error) reload()
  }, [reload])

  const dismiss = useCallback(async (ids) => {
    const set = new Set(ids || [])
    if (set.size === 0) return
    let unreadGone = 0
    setState(s => {
      const list = (s.list || []).filter(n => {
        if (!set.has(n.id)) return true
        if (!n.read_at) unreadGone += 1
        return false
      })
      return { ...s, list, unreadCount: Math.max(0, s.unreadCount - unreadGone) }
    })
    const { error } = await supabase.rpc('notifications_dismiss', { p_ids: [...set] })
    if (error) reload()
  }, [reload])

  return { ...state, email, reload, markRead, markAllRead, dismiss }
}

// Group a flat list by property, newest property first, items newest first.
// Rows with no pid (there are none today, but the column is nullable) land in
// a final "General" group rather than vanishing.
export function groupByProperty(list) {
  const groups = new Map()
  for (const n of list || []) {
    const key = n.pid || '—'
    if (!groups.has(key)) groups.set(key, { pid: n.pid, name: n.property_name, items: [], latest: n.created_at })
    const g = groups.get(key)
    g.items.push(n)
    if (n.created_at > g.latest) g.latest = n.created_at
  }
  return [...groups.values()]
    .map(g => ({ ...g, items: g.items.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), unread: g.items.filter(n => !n.read_at).length }))
    .sort((a, b) => (a.pid == null) - (b.pid == null) || (a.latest < b.latest ? 1 : -1))
}

// "just now" · "4m" · "3h" · "yesterday" · "5d" · "12 Sep"
export function relTime(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  const d = Math.floor(s / 86400)
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d}d`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
