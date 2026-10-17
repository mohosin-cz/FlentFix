import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useNotepadContext } from './NotepadContext'
import { useDictation, appendDictated, hasSpeech } from './useDictation'
import { noteTitle, scopeLabel, notePlain, noteHtml, notesPlain, notesHtml, copyRich } from './notesFormat'

// The pen, on every signed-in page.
//
// Tap it to open, hold it to dictate, drag it out of the way — it stays where
// it was left as you move around Pulse. Notes are the person's own (user_notes,
// RLS: only you), each General or against a PID; on a property or inspection
// the PID's shared team note (quick_notes — what inspections always used) sits
// alongside them. Opening drops the pad in; closing lets it fall into the pen.

const F = "var(--font-nav, 'Urbanist', 'Poppins', sans-serif)"
const MONO = 'var(--font-mono, monospace)'
const C = { text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)', border: 'var(--border, #2e3040)', panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', accent: 'var(--accent, #c8963e)', red: '#b0645b' }
const Z = 1250
const PEN = 50
const LONG_PRESS_MS = 400

// Pages other people open from a link, or documents meant for printing.
const HIDDEN = [/^\/db\//, /^\/vi\//, /^\/login/, /^\/signup/, /^\/reset-password/, /^\/estimate\//, /^\/e\//, /^\/appliance-report\//, /^\/invoice\//,
  /^\/tax-invoice\//, /^\/rate-card/, /^\/inventory\/public-rc/, /^\/onboard/, /^\/asset-request/, /^\/attend/, /^\/wo\//]

const PLACES = [[/^\/$/, 'Home'], [/^\/calendar/, 'Calendar'], [/^\/vendors/, 'Vendor management'], [/^\/utilities/, 'Utilities'],
  [/^\/explore\//, 'Explore'], [/^\/properties\/payments/, 'Payments'], [/^\/properties/, 'Properties'], [/^\/inspections/, 'Inspection'],
  [/^\/inventory/, 'Inventory'], [/^\/sops/, 'SOPs'], [/^\/alerts/, 'Alerts'], [/^\/digest/, 'Digest'], [/^\/work-order/, 'Work order']]
const placeOf = (path) => (PLACES.find(([re]) => re.test(path)) || [null, 'Pulse'])[1]

const routePid = (path) => {
  const m = path.match(/^\/properties\/([^/]+)/)
  return m && !['archive', 'bin', 'payments'].includes(m[1]) ? decodeURIComponent(m[1]) : null
}

const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } },
}
const newDraftId = () => `draft-${Math.random().toString(36).slice(2, 10)}`
const ago = (ts) => {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// The pad is paper: a matte warm white in every theme, so a note reads like a
// note and not like another panel of the app. Set as variables on the pad
// itself, so everything inside it (which reads var(--text) etc.) follows.
const PAPER = {
  '--bg-panel': '#f3f1ec', '--bg-input': '#e8e5de', '--bg': '#ebe8e1', '--border': 'rgba(35,33,28,0.12)',
  '--text': '#23211c', '--text-dim': '#57534a', '--text-muted': '#8a857a', '--accent': '#946400',
  colorScheme: 'light',
}

const CSS = `
@keyframes np-drop { 0% { opacity: 0; transform: translateY(-70px) scale(.96) } 55% { opacity: 1; transform: translateY(8px) scale(1) } 75% { transform: translateY(-3px) } 100% { transform: translateY(0) } }
@keyframes np-fall { 0% { opacity: 1; transform: translateY(0) rotate(0) } 100% { opacity: 0; transform: translateY(90px) rotate(2deg) scale(.92) } }
@keyframes np-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .5 } }
.np-in { animation: np-drop 520ms cubic-bezier(.22,1.2,.36,1) both }
.np-out { animation: np-fall 320ms cubic-bezier(.55,0,1,.45) both }
@media (prefers-reduced-motion: reduce) { .np-in, .np-out { animation: none } }
.np-ib:hover { background: var(--bg-input, #252731) !important; color: var(--text, #e8e8f0) !important }
.np-item:hover { background: rgba(35,33,28,0.04) }
`

export default function Notepad() {
  const { session } = useAuth() || {}
  const { pathname } = useLocation()
  if (!session || HIDDEN.some(re => re.test(pathname))) return null
  return <Pad userId={session.user.id} email={session.user.email} pathname={pathname} />
}

function Pad({ userId, email, pathname }) {
  const { pagePid: ctxPid } = useNotepadContext()
  const herePid = routePid(pathname) || ctxPid || null
  const cacheKey = `pulse_notes_${userId}`

  const [notes, setNotes] = useState(() => ls.get(cacheKey, []))
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState('in')            // 'in' while dropping in, 'out' while falling, '' at rest
  const [view, setView] = useState('edit')
  const [target, setTarget] = useState(null)          // { kind: 'mine', id } | { kind: 'team', pid }
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [pos, setPos] = useState(() => ls.get('pulse_notepad_pos', null))
  const [names, setNames] = useState({})
  const [team, setTeam] = useState(null)              // { pid, body, updated_at }
  const [picking, setPicking] = useState(false)
  const [pickQ, setPickQ] = useState('')
  const [pickHits, setPickHits] = useState([])
  const [toast, setToast] = useState(null)            // { msg, undo }
  const [saveState, setSaveState] = useState('saved')
  const [confirmDel, setConfirmDel] = useState(false)
  const [author, setAuthor] = useState(() => (email || '').split('@')[0])
  const [vw, setVw] = useState(() => window.innerWidth)

  const notesRef = useRef(notes)
  const teamRef = useRef(team)
  const targetRef = useRef(target)
  const timers = useRef({})
  const inserting = useRef(new Set())
  const taRef = useRef(null)
  const panelRef = useRef(null)
  const drag = useRef({ active: false, moved: false })
  const pressTimer = useRef(null)
  const wasLong = useRef(false)

  useEffect(() => { notesRef.current = notes; ls.set(cacheKey, notes.filter(n => !String(n.id).startsWith('draft-') || n.body || n.title)) }, [notes, cacheKey])
  useEffect(() => { teamRef.current = team }, [team])
  useEffect(() => { targetRef.current = target }, [target])
  useEffect(() => { const r = () => setVw(window.innerWidth); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [])

  // ── load ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('user_notes').select('*').is('deleted_at', null).order('updated_at', { ascending: false }).limit(500)
    if (error) { console.warn('[notepad] notes unavailable:', error.message); return }
    // keep unsaved drafts that the server doesn't know yet
    setNotes(prev => [...prev.filter(n => String(n.id).startsWith('draft-') && (n.body || n.title)), ...(data || [])])
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setAuthor(data.full_name.split(' ')[0]) })
  }, [userId])

  // names for the PIDs in play
  const pidsInPlay = useMemo(() => [...new Set([herePid, ...notes.map(n => n.pid)].filter(Boolean))].sort(), [notes, herePid])
  useEffect(() => {
    const missing = pidsInPlay.filter(p => !(p in names))
    if (!missing.length) return
    supabase.from('properties').select('pid,name').in('pid', missing).then(({ data }) => {
      setNames(m => { const n = { ...m }; for (const p of missing) n[p] = ''; for (const r of data || []) n[r.pid] = (r.name || '').trim(); return n })
    })
  }, [pidsInPlay, names])

  // the PID's shared team note — the inspection notepad
  useEffect(() => {
    if (!herePid) return undefined
    let alive = true
    const local = (() => { try { return localStorage.getItem(`flent_quick_notes_${herePid}`) || '' } catch { return '' } })()
    supabase.from('quick_notes').select('note,updated_at').eq('pid', herePid).maybeSingle().then(({ data }) => {
      if (!alive) return
      setTeam({ pid: herePid, body: data?.note ?? local, updated_at: data?.updated_at || null })
    })
    return () => { alive = false }
  }, [herePid])

  // ── save ────────────────────────────────────────────────────────────────
  const persistRef = useRef(null)
  const persist = useCallback(async (id) => {
    const n = notesRef.current.find(x => x.id === id)
    if (!n) return
    const row = { pid: n.pid || null, title: n.title || '', body: n.body || '', pinned: !!n.pinned }
    if (String(id).startsWith('draft-')) {
      if (!row.title.trim() && !row.body.trim()) return
      if (inserting.current.has(id)) return
      inserting.current.add(id)
      setSaveState('saving')
      const { data, error } = await supabase.from('user_notes').insert({ ...row, context: n.context || {} }).select().single()
      inserting.current.delete(id)
      if (error) { setSaveState('error'); return }
      const latest = notesRef.current.find(x => x.id === id) || n
      setNotes(ns => ns.map(x => (x.id === id ? { ...data, title: latest.title, body: latest.body, pid: latest.pid, pinned: latest.pinned } : x)))
      if (targetRef.current?.id === id) setTarget({ kind: 'mine', id: data.id })
      // anything typed while the insert was in flight goes up next
      if (latest.body !== row.body || latest.title !== row.title || latest.pid !== row.pid || !!latest.pinned !== row.pinned) {
        clearTimeout(timers.current[data.id]); timers.current[data.id] = setTimeout(() => persistRef.current?.(data.id), 300)
      }
      setSaveState('saved')
      return
    }
    setSaveState('saving')
    const { error } = await supabase.from('user_notes').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id)
    setSaveState(error ? 'error' : 'saved')
  }, [])

  useEffect(() => { persistRef.current = persist }, [persist])

  const schedule = useCallback((id, ms = 700) => {
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => persist(id), ms)
  }, [persist])

  const patch = useCallback((id, p) => {
    setNotes(ns => ns.map(n => (n.id === id ? { ...n, ...p, updated_at: new Date().toISOString() } : n)))
    setSaveState('saving')
    schedule(id)
  }, [schedule])

  const teamTimer = useRef(null)
  const patchTeam = useCallback((body) => {
    const pid = teamRef.current?.pid
    if (!pid) return
    setTeam(t => ({ ...t, body, updated_at: new Date().toISOString() }))
    try { localStorage.setItem(`flent_quick_notes_${pid}`, body) } catch { /* noop */ }
    setSaveState('saving')
    clearTimeout(teamTimer.current)
    teamTimer.current = setTimeout(() => {
      supabase.from('quick_notes').upsert({ pid, note: body, updated_at: new Date().toISOString() }, { onConflict: 'pid' })
        .then(({ error }) => setSaveState(error ? 'error' : 'saved'))
    }, 700)
  }, [])

  // flush anything pending when the tab goes away
  useEffect(() => {
    const flush = () => { for (const [id, t] of Object.entries(timers.current)) { clearTimeout(t); persist(id) } }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [persist])

  // ── what's open ─────────────────────────────────────────────────────────
  const cur = target?.kind === 'mine' ? notes.find(n => n.id === target.id) || null : null
  const editingTeam = target?.kind === 'team' && team && team.pid === target.pid
  const body = editingTeam ? team.body : cur?.body || ''
  const setBody = (v) => { if (editingTeam) patchTeam(v); else if (cur) patch(cur.id, { body: v }) }

  const newNote = useCallback((pid) => {
    const id = newDraftId()
    const note = { id, pid: pid || null, title: '', body: '', pinned: false, context: { path: pathname, label: herePid ? `PID ${herePid}` : placeOf(pathname) }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    setNotes(ns => [note, ...ns])
    setTarget({ kind: 'mine', id }); setView('edit'); setConfirmDel(false); setPicking(false)
    setTimeout(() => taRef.current?.focus(), 60)
  }, [pathname, herePid])

  const openPad = useCallback((opts = {}) => {
    setPhase('in'); setOpen(true); setConfirmDel(false)
    if (opts.view === 'list') { setView('list'); setFilter('all'); return }
    const t = targetRef.current
    const tNote = t?.kind === 'mine' ? notesRef.current.find(n => n.id === t.id) : null
    if (herePid && !(tNote && tNote.pid === herePid) && !(t?.kind === 'team' && t.pid === herePid)) { setView('list'); setFilter(herePid); return }
    if (tNote || (t?.kind === 'team' && t.pid === herePid)) { setView('edit'); return }
    const latest = notesRef.current.find(n => !n.pid)
    if (latest) { setTarget({ kind: 'mine', id: latest.id }); setView('edit'); return }
    if (notesRef.current.length) { setView('list'); setFilter('all'); return }
    newNote(null)
  }, [herePid, newNote])

  const closePad = useCallback(() => {
    setPhase('out'); setPicking(false)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setTimeout(() => { setOpen(false); setPhase('in') }, reduce ? 0 : 300)
  }, [])

  // keyboard: Alt/Option + N toggles, Esc closes
  useEffect(() => {
    const k = (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') { e.preventDefault(); if (open) closePad(); else openPad() }
      else if (e.key === 'Escape' && open) closePad()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, openPad, closePad])

  // the avatar menu's "My notes"
  useEffect(() => {
    const h = (e) => openPad({ view: e.detail?.view || 'list' })
    window.addEventListener('pulse:notepad', h)
    return () => window.removeEventListener('pulse:notepad', h)
  }, [openPad])

  // the drop-in animation runs once, then the pad is at rest
  useEffect(() => { if (open && phase === 'in') { const t = setTimeout(() => setPhase(''), 560); return () => clearTimeout(t) } return undefined }, [open, phase])
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 2400); return () => clearTimeout(t) }, [toast])

  // ── dictation ───────────────────────────────────────────────────────────
  const bodyRef = useRef(body)
  useEffect(() => { bodyRef.current = body }, [body])
  const setBodyRef = useRef(null)
  useEffect(() => { setBodyRef.current = setBody })
  const onFinal = useCallback((chunk) => { setBodyRef.current?.(appendDictated(bodyRef.current, chunk)) }, [])
  const { listening, interim, noSpeech, start: startDict, stop: stopDict, btnRef, ring1Ref, ring2Ref } = useDictation(onFinal)

  // ── editing helpers ─────────────────────────────────────────────────────
  function lineAt(value, at) { const s = value.lastIndexOf('\n', at - 1) + 1; let e = value.indexOf('\n', at); if (e < 0) e = value.length; return [s, e] }
  function toggleMark(mark) {
    const ta = taRef.current; if (!ta) return
    const { selectionStart: at, value } = ta
    const [s, e] = lineAt(value, at)
    const line = value.slice(s, e)
    const has = line.match(/^(\s*)([•☐☑])\s?/)
    let next, delta
    if (has && (has[2] === mark || (mark === '☐' && has[2] === '☑'))) { next = line.slice(has[0].length); delta = -has[0].length }
    else if (has) { next = mark + ' ' + line.slice(has[0].length); delta = 2 - has[0].length }
    else { next = mark + ' ' + line; delta = 2 }
    setBody(value.slice(0, s) + next + value.slice(e))
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = Math.max(s, at + delta) }, 0)
  }
  function tickLine() {
    const ta = taRef.current; if (!ta) return
    const { selectionStart: at, value } = ta
    const [s, e] = lineAt(value, at)
    const line = value.slice(s, e)
    if (/^\s*☐/.test(line)) setBody(value.slice(0, s) + line.replace('☐', '☑') + value.slice(e))
    else if (/^\s*☑/.test(line)) setBody(value.slice(0, s) + line.replace('☑', '☐') + value.slice(e))
    else { toggleMark('☐'); return }
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = at }, 0)
  }
  function onKeyDown(e) {
    if (e.key !== 'Enter') return
    const ta = e.currentTarget
    const { selectionStart: at, selectionEnd, value } = ta
    const s = value.lastIndexOf('\n', at - 1) + 1
    const line = value.slice(s, at)
    const m = line.match(/^(\s*)([•☐☑-])\s/)
    if (!m) return
    e.preventDefault()
    if (line.trim() === m[0].trim()) {           // empty item: end the list
      setBody(value.slice(0, s) + value.slice(selectionEnd))
      setTimeout(() => { ta.selectionStart = ta.selectionEnd = s }, 0)
      return
    }
    const mark = m[2] === '☑' ? '☐' : m[2]
    const ins = `\n${m[1]}${mark} `
    setBody(value.slice(0, at) + ins + value.slice(selectionEnd))
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = at + ins.length }, 0)
  }

  async function copyOne() {
    const n = editingTeam
      ? { title: `${scopeLabel(team.pid, names)} — team note`, body: team.body, pid: team.pid, updated_at: team.updated_at }
      : cur
    if (!n || !(n.body || '').trim()) { setToast({ msg: 'Nothing to copy yet' }); return }
    const ok = await copyRich(noteHtml(n, { author, names }), notePlain(n, { author, names }))
    setToast({ msg: ok ? 'Copied — paste into Slack, Docs or WhatsApp' : 'Couldn’t reach the clipboard' })
  }
  async function copyMany(list) {
    if (!list.length) return
    const ok = await copyRich(notesHtml(list, { author, names }), notesPlain(list, { author, names }))
    setToast({ msg: ok ? `Copied ${list.length} note${list.length === 1 ? '' : 's'}` : 'Couldn’t reach the clipboard' })
  }
  async function del() {
    if (!cur) return
    const gone = cur
    setConfirmDel(false)
    setNotes(ns => ns.filter(n => n.id !== gone.id))
    setTarget(null); setView('list')
    if (!String(gone.id).startsWith('draft-')) {
      clearTimeout(timers.current[gone.id])
      await supabase.from('user_notes').update({ deleted_at: new Date().toISOString() }).eq('id', gone.id)
    }
    setToast({ msg: 'Note deleted', undo: async () => {
      setNotes(ns => [gone, ...ns])
      if (!String(gone.id).startsWith('draft-')) await supabase.from('user_notes').update({ deleted_at: null }).eq('id', gone.id)
      setTarget({ kind: 'mine', id: gone.id }); setView('edit')
    } })
  }

  // PID search for "Another PID…"
  useEffect(() => {
    if (!picking) return undefined
    const t = setTimeout(async () => {
      const s = pickQ.trim()
      let qy = supabase.from('properties').select('pid,name').order('pid', { ascending: false }).limit(8)
      if (s) qy = qy.or(`pid.ilike.%${s.replace(/[%,()]/g, '')}%,name.ilike.%${s.replace(/[%,()]/g, '')}%`)
      const { data } = await qy
      setPickHits(data || [])
    }, 200)
    return () => clearTimeout(t)
  }, [picking, pickQ])

  // ── the pen ─────────────────────────────────────────────────────────────
  const phone = vw < 560
  const herePidNotes = herePid ? notes.filter(n => n.pid === herePid).length + (team?.pid === herePid && team.body.trim() ? 1 : 0) : 0
  const penStyle = pos ? { left: Math.min(pos.x, vw - PEN), top: Math.min(pos.y, window.innerHeight - PEN) } : { right: 20, bottom: 'calc(88px + env(safe-area-inset-bottom))' }

  function panelStyle() {
    if (phone) return { left: 8, right: 8, bottom: 'calc(150px + env(safe-area-inset-bottom))', maxHeight: 'calc(100svh - 230px)' }
    const W = 380, H = 540, gap = 12
    if (!pos) return { right: 20, bottom: 'calc(150px + env(safe-area-inset-bottom))', width: W, maxHeight: 'min(560px, calc(100vh - 190px))' }
    const left = Math.max(8, Math.min(vw - W - 8, pos.x + PEN / 2 - W / 2))
    const above = pos.y > H * 0.6
    return above
      ? { left, bottom: window.innerHeight - pos.y + gap, width: W, maxHeight: Math.min(H, pos.y - gap - 8) }
      : { left, top: pos.y + PEN + gap, width: W, maxHeight: Math.min(H, window.innerHeight - pos.y - PEN - gap - 8) }
  }

  const pen = (
    <button ref={btnRef} type="button" data-notepad-pen aria-label={open ? 'Close notepad' : 'Open notepad'}
      title="Tap to open · hold to dictate · drag to move · Alt+N"
      onPointerDown={e => {
        const r = e.currentTarget.getBoundingClientRect()
        drag.current = { active: true, moved: false, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top }
        e.currentTarget.setPointerCapture(e.pointerId)
        wasLong.current = false
        pressTimer.current = setTimeout(() => {
          if (!drag.current.moved && hasSpeech) { wasLong.current = true; if (!open) openPad(); startDict() }
        }, LONG_PRESS_MS)
      }}
      onPointerMove={e => {
        if (!drag.current.active) return
        if (!drag.current.moved && Math.hypot(e.clientX - drag.current.sx, e.clientY - drag.current.sy) > 6) { drag.current.moved = true; clearTimeout(pressTimer.current) }
        if (drag.current.moved) setPos({ x: Math.max(4, Math.min(window.innerWidth - PEN - 4, e.clientX - drag.current.ox)), y: Math.max(4, Math.min(window.innerHeight - PEN - 4, e.clientY - drag.current.oy)) })
      }}
      onPointerUp={() => {
        drag.current.active = false
        clearTimeout(pressTimer.current)
        if (drag.current.moved) { setPos(p => { ls.set('pulse_notepad_pos', p); return p }); return }
        if (wasLong.current) { stopDict(); return }
        if (open) closePad(); else openPad()
      }}
      onPointerCancel={() => { drag.current.active = false; clearTimeout(pressTimer.current) }}
      style={{ position: 'fixed', ...penStyle, zIndex: Z, width: PEN, height: PEN, borderRadius: '50%', padding: 0,
        background: listening ? C.red : open ? C.accent : C.panel,
        border: `2px solid ${listening ? C.red : open ? C.accent : C.border}`,
        boxShadow: open ? '0 4px 20px rgba(200,150,62,0.35)' : '0 4px 16px rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none',
        WebkitTapHighlightColor: 'transparent', transition: 'background .2s, border-color .2s' }}>
      {listening && <>
        <span ref={ring1Ref} style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `2px solid ${C.red}`, opacity: 0, pointerEvents: 'none' }} />
        <span ref={ring2Ref} style={{ position: 'absolute', inset: -3, borderRadius: '50%', border: `1.5px solid ${C.red}`, opacity: 0, pointerEvents: 'none' }} />
      </>}
      {listening
        ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: '#fff', animation: 'np-pulse 1s ease-in-out infinite' }}><rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: open ? '#16171f' : C.dim }}><path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {herePidNotes > 0 && !open && (
        <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: C.accent, color: '#16171f', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: `2px solid ${C.bg}`, fontFamily: F }}>{herePidNotes}</span>
      )}
    </button>
  )

  // ── list ────────────────────────────────────────────────────────────────
  const shown = notes
    .filter(n => (filter === 'all' || (filter === 'general' ? !n.pid : n.pid === filter)))
    .filter(n => !q || `${n.title} ${n.body} ${n.pid || ''} ${names[n.pid] || ''}`.toLowerCase().includes(q.toLowerCase()))
    .filter(n => !String(n.id).startsWith('draft-') || n.body || n.title)
    .sort((a, b) => (b.pinned - a.pinned) || String(b.updated_at).localeCompare(String(a.updated_at)))
  const showTeam = team && team.pid && (filter === team.pid || (filter === 'all' && herePid === team.pid)) && (!q || team.body.toLowerCase().includes(q.toLowerCase()))
  const chips = [['all', 'All'], ['general', 'General'], ...pidsInPlay.map(p => [p, `PID ${p}`])]

  const listView = (
    <>
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px 6px' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your notes" aria-label="Search notes"
          style={{ flex: 1, minWidth: 0, minHeight: 36, borderRadius: 9, border: `1px solid ${C.border}`, background: C.input, padding: '0 10px', color: C.text, outline: 'none', fontFamily: F, fontSize: 13 }} />
        <Tb onClick={() => newNote(filter === 'all' ? herePid : filter === 'general' ? null : filter)} accent>+ New</Tb>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '2px 12px 8px' }}>
        {chips.map(([k, l]) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{l}</Chip>)}
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 120 }}>
        {showTeam && <>
          <Sec>Team note · shared on PID {team.pid}</Sec>
          <button type="button" className="np-item" onClick={() => { setTarget({ kind: 'team', pid: team.pid }); setView('edit') }} style={itemStyle}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>PID {team.pid} team note</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 2 }}>everyone on the PID sees it · {team.body.trim() ? `${team.body.split('\n').filter(l => l.trim()).length} lines` : 'empty'}{team.updated_at ? ` · ${ago(team.updated_at)}` : ''}</span>
            </span>
          </button>
        </>}
        {shown.length > 0 && <Sec>{filter === 'all' ? 'Your notes' : filter === 'general' ? 'General' : `Your notes on PID ${filter}${names[filter] ? ` · ${names[filter]}` : ''}`}</Sec>}
        {shown.map(n => (
          <button key={n.id} type="button" className="np-item" onClick={() => { setTarget({ kind: 'mine', id: n.id }); setView('edit'); setConfirmDel(false) }} style={itemStyle}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{noteTitle(n)}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 2 }}>
                <span style={{ color: n.pid ? C.accent : C.dim }}>{n.pid ? `PID ${n.pid}` : 'General'}</span> · {ago(n.updated_at)} · {(n.body || '').split('\n').filter(l => l.trim()).length} lines
              </span>
            </span>
            {n.pinned && <span style={{ color: C.accent, fontSize: 12 }} aria-label="Pinned">★</span>}
          </button>
        ))}
        {!shown.length && !showTeam && (
          <div style={{ padding: '18px 14px', fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            {q ? 'Nothing matches.' : filter === 'all' ? 'No notes yet. Tap “+ New”, or hold the pen to dictate.' : `No notes ${filter === 'general' ? 'in General' : `on PID ${filter}`} yet.`}
          </div>
        )}
      </div>
      <Foot left="Saved to your profile — only you see these" right={shown.length > 1 ? <button type="button" onClick={() => copyMany(shown)} style={linkBtn}>⧉ Copy all {shown.length}</button> : `${notes.length} note${notes.length === 1 ? '' : 's'}`} />
    </>
  )

  // ── editor ──────────────────────────────────────────────────────────────
  const scopePid = cur?.pid || null
  const editView = (editingTeam || cur) ? (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '7px 12px', borderBottom: `1px solid ${C.border}` }}>
        <Tb onClick={() => { setView('list'); setFilter(editingTeam ? team.pid : (scopePid || 'all')); setPicking(false) }} title="All notes">☰ All</Tb>
        <Tb onClick={() => toggleMark('•')} title="Bullet">•</Tb>
        <Tb onClick={tickLine} title="Checkbox — tap again to tick">☐</Tb>
        {hasSpeech && <Tb onClick={() => (listening ? stopDict() : startDict())} title={listening ? 'Stop dictating' : 'Dictate'} danger={listening}>{listening ? '■ stop' : '🎙'}</Tb>}
        {cur && <Tb onClick={() => patch(cur.id, { pinned: !cur.pinned })} title={cur.pinned ? 'Unpin' : 'Pin to the top'} accent={cur.pinned}>★</Tb>}
        <span style={{ flex: 1 }} />
        <Tb onClick={copyOne} accent title="Copy, formatted">⧉ Copy</Tb>
      </div>
      {cur && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '9px 14px 0' }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>Note for</span>
          <Chip on={!scopePid} onClick={() => patch(cur.id, { pid: null })}>General</Chip>
          {herePid && <Chip on={scopePid === herePid} onClick={() => patch(cur.id, { pid: herePid })}>PID {herePid}</Chip>}
          {scopePid && scopePid !== herePid && <Chip on>PID {scopePid}</Chip>}
          <Chip onClick={() => { setPicking(p => !p); setPickQ('') }}>{picking ? 'Cancel' : scopePid && scopePid !== herePid ? 'Change…' : 'Another PID…'}</Chip>
        </div>
      )}
      {cur && picking && (
        <div style={{ margin: '8px 14px 0', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <input autoFocus value={pickQ} onChange={e => setPickQ(e.target.value)} placeholder="PID or property name"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 36, border: 'none', borderBottom: `1px solid ${C.border}`, background: C.input, padding: '0 10px', color: C.text, outline: 'none', fontFamily: F, fontSize: 13 }} />
          <div style={{ maxHeight: 170, overflowY: 'auto' }}>
            {pickHits.map(h => (
              <button key={h.pid} type="button" className="np-item" onClick={() => { patch(cur.id, { pid: h.pid }); setNames(m => ({ ...m, [h.pid]: (h.name || '').trim() })); setPicking(false) }}
                style={{ ...itemStyle, padding: '8px 10px', borderTop: 'none' }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: C.accent, width: 64, flexShrink: 0 }}>PID {h.pid}</span>
                <span style={{ fontSize: 12.5, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name || '—'}</span>
              </button>
            ))}
            {!pickHits.length && <div style={{ padding: 10, fontSize: 12.5, color: C.muted }}>No match.</div>}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '7px 14px 0', fontSize: 11.5, color: C.muted }}>
        {editingTeam
          ? <><Pill>Team note · shared with everyone on PID {team.pid}</Pill>{team.updated_at && <Pill>edited {ago(team.updated_at)}</Pill>}</>
          : <>{cur.context?.label && <Pill>started on {cur.context.label}</Pill>}<Pill>{ago(cur.created_at || cur.updated_at)}</Pill>{scopePid && names[scopePid] && <Pill>{names[scopePid]}</Pill>}</>}
      </div>
      {cur && (
        <input value={cur.title || ''} onChange={e => patch(cur.id, { title: e.target.value })} placeholder="Title (optional)" aria-label="Title"
          style={{ border: 'none', background: 'none', outline: 'none', padding: '8px 14px 0', fontSize: 16, fontWeight: 600, color: C.text, fontFamily: F, width: '100%', boxSizing: 'border-box' }} />
      )}
      {interim && <div style={{ padding: '6px 14px', fontSize: 12.5, color: C.muted, fontStyle: 'italic', fontFamily: MONO }}>{interim}…</div>}
      {noSpeech && !interim && <div style={{ padding: '6px 14px', fontSize: 11.5, color: C.muted }}>No speech heard — speak near the mic.</div>}
      <textarea ref={taRef} value={body} onChange={e => setBody(e.target.value)} onKeyDown={onKeyDown}
        placeholder={'Write here — or hold the pen to dictate.\n\n• starts a bullet, ☐ a checkbox; Enter carries it on.'}
        style={{ flex: 1, minHeight: phone ? 180 : 220, padding: '8px 14px 12px', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontSize: 13.5, lineHeight: 1.7, color: C.text, fontFamily: MONO, caretColor: C.accent }} />
      {confirmDel ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 14px', borderTop: `1px solid ${C.border}`, fontSize: 12.5 }}>
          <span style={{ flex: 1, color: C.dim }}>Delete this note?</span>
          <Tb onClick={() => setConfirmDel(false)}>Keep</Tb><Tb danger onClick={del}>Delete</Tb>
        </div>
      ) : (
        <Foot left={saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Couldn’t save — kept on this device' : editingTeam ? '✓ Saved to the PID' : '✓ Saved to your profile'}
          right={<span style={{ display: 'flex', gap: 12 }}>
            {cur && <button type="button" onClick={() => setConfirmDel(true)} style={linkBtn}>Delete</button>}
            <button type="button" onClick={() => newNote(editingTeam ? team.pid : herePid)} style={{ ...linkBtn, color: C.accent }}>+ New note</button>
          </span>} />
      )}
    </>
  ) : listView

  return (
    <>
      <style>{CSS}</style>
      {pen}
      {open && (
        <div ref={panelRef} role="dialog" aria-label="Notepad" className={phase === 'in' ? 'np-in' : phase === 'out' ? 'np-out' : ''}
          style={{ ...PAPER, position: 'fixed', ...panelStyle(), zIndex: Z, display: 'flex', flexDirection: 'column', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.18)', overflow: 'hidden', fontFamily: F, color: C.text, transformOrigin: 'bottom right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 10px 10px 14px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{view === 'list' || !(editingTeam || cur) ? 'My notes' : editingTeam ? 'Team note' : 'Note'}</span>
            {herePid && <span style={{ fontSize: 12, color: C.muted }}>· on PID {herePid}{names[herePid] ? ` · ${names[herePid]}` : ''}</span>}
            {listening && <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>● live</span>}
            <span style={{ flex: 1 }} />
            <button type="button" className="np-ib" onClick={closePad} aria-label="Close notepad" title="Close (Esc)"
              style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', color: C.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          {view === 'list' ? listView : editView}
        </div>
      )}
      {toast && (
        <div role="status" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(24px + env(safe-area-inset-bottom))', zIndex: Z + 1, display: 'flex', gap: 12, alignItems: 'center', background: C.text, color: C.bg, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: F, maxWidth: 'calc(100vw - 32px)' }}>
          {toast.msg}
          {toast.undo && <button type="button" onClick={() => { const u = toast.undo; setToast(null); u() }} style={{ background: 'none', border: 'none', color: C.accent, fontWeight: 700, cursor: 'pointer', fontFamily: F, fontSize: 13 }}>Undo</button>}
        </div>
      )}
    </>
  )
}

const itemStyle = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--border, #2e3040)', color: 'var(--text, #e8e8f0)', cursor: 'pointer', fontFamily: F }
const linkBtn = { background: 'none', border: 'none', padding: 0, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontSize: 12, fontFamily: F }

function Tb({ children, onClick, title, accent, danger }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title}
      style={{ height: 30, padding: '0 10px', borderRadius: 7, fontSize: 12.5, fontFamily: F, cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${danger ? 'rgba(176,100,91,0.55)' : accent ? 'rgba(200,150,62,0.45)' : 'var(--border, #2e3040)'}`,
        background: danger ? 'rgba(176,100,91,0.16)' : accent ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)',
        color: danger ? '#b0645b' : accent ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontWeight: accent || danger ? 600 : 500 }}>
      {children}
    </button>
  )
}
function Chip({ children, on, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={!!on}
      style={{ height: 28, padding: '0 10px', borderRadius: 999, fontSize: 12, fontFamily: F, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
        border: `1px solid ${on ? 'rgba(200,150,62,0.45)' : 'var(--border, #2e3040)'}`, background: on ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)',
        color: on ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontWeight: on ? 600 : 500 }}>
      {children}
    </button>
  )
}
function Pill({ children }) { return <span style={{ background: 'var(--bg-input, #252731)', borderRadius: 6, padding: '2px 7px' }}>{children}</span> }
function Sec({ children }) { return <div style={{ padding: '8px 14px 4px', fontSize: 11.5, color: 'var(--text-muted, #6b6d82)' }}>{children}</div> }
function Foot({ left, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: '1px solid var(--border, #2e3040)', fontSize: 11.5, color: 'var(--text-muted, #6b6d82)' }}>
      <span>{left}</span><span>{right}</span>
    </div>
  )
}
