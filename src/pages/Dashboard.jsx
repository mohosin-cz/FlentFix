import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import LogoSpinner from '../components/LogoSpinner'

// ─── Pulse dot-matrix logo ─────────────────────────────────────────────────────
const PulseLogo = () => (
  <svg width="140" height="28" viewBox="0 0 300 68" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', maxWidth: '100%' }}>
    <style>{`.do{fill:#16171f;stroke:#c8963e;stroke-width:1.2}.dd{fill:none;stroke:#c8963e;stroke-width:0.5;opacity:0.15}@keyframes ecg-fade{0%{stroke-dashoffset:100}100%{stroke-dashoffset:-100}}.ecg-line{stroke-dasharray:100;stroke-dashoffset:100;animation:ecg-fade 4s linear infinite}@keyframes ecg-dot{0%{opacity:0;transform:translateX(-20px)}50%{opacity:1}100%{opacity:0;transform:translateX(20px)}}.ecg-dot{animation:ecg-dot 4s linear infinite}`}</style>
    {[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,0,0,0]].map((r,ri)=>r.map((on,ci)=><rect key={`p${ri}${ci}`} className={on?'do':'dd'} x={ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`u${ri}${ci}`} className={on?'do':'dd'} x={52+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`l${ri}${ci}`} className={on?'do':'dd'} x={100+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`s${ri}${ci}`} className={on?'do':'dd'} x={148+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`e${ri}${ci}`} className={on?'do':'dd'} x={196+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    <line x1="248" y1="33" x2="262" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.3"/>
    <polyline className="ecg-line" points="262,33 268,12 272,54 278,20 284,33" fill="none" stroke="#c8963e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="284" y1="33" x2="300" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.3"/>
    <circle className="ecg-dot" cx="284" cy="33" r="2.5" fill="#c8963e"/>
  </svg>
)

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 21) return 'Good evening'
  return 'Burning the midnight oil,'
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'FL'
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function titleCase(str = '') {
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Draft progress from localStorage ─────────────────────────────────────────
function readDraftProgress(pid) {
  try {
    const oDraft = JSON.parse(localStorage.getItem(`flentfix_outdoor_draft_${pid}`) || 'null')
    let oDone = 0, oTotal = 0
    if (oDraft?.data) {
      Object.values(oDraft.data).forEach(sec => {
        Object.values(sec).forEach(card => {
          oTotal++
          if (card.health !== null || card.notAvailable) oDone++
        })
      })
      Object.values(oDraft.customItems || {}).forEach(items => {
        if (Array.isArray(items)) items.forEach(card => {
          oTotal++
          if (card.health !== null || card.notAvailable) oDone++
        })
      })
    }

    const iDraft = JSON.parse(localStorage.getItem(`flentfix_indoor_draft_${pid}`) || 'null')
    let iDone = 0, iTotal = 0
    if (iDraft?.data) {
      Object.entries(iDraft.data).forEach(([key, val]) => {
        if (key === 'basics') {
          Object.entries(val || {}).forEach(([bKey, item]) => {
            if (bKey === 'applianceFeasibility') {
              Object.values(item || {}).forEach(f => { iTotal++; if (f?.status) iDone++ })
              return
            }
            if (bKey === 'wasteScrapping') {
              iTotal++; if (item?.required !== null && item?.required !== undefined) iDone++
              return
            }
            iTotal++
            if (item?.enabled !== null && item?.enabled !== undefined) iDone++
          })
        } else {
          Object.values(val || {}).forEach(section => {
            if (section && typeof section === 'object') {
              Object.values(section).forEach(card => {
                if (card && ('notAvailable' in card || 'selectedIssues' in card || 'health' in card)) {
                  iTotal++
                  if (card.notAvailable || (card.selectedIssues?.length > 0) || card.health !== null || card.acProvision === 'not_present') iDone++
                }
              })
            }
          })
        }
      })
      Object.values(iDraft.customItems || {}).forEach(items => {
        if (Array.isArray(items)) items.forEach(card => {
          iTotal++
          if (card.health !== null) iDone++
        })
      })
    }

    const aDraft = JSON.parse(localStorage.getItem(`flentfix_appliances_draft_${pid}`) || 'null')
    let aDone = 0, aTotal = 0
    if (aDraft?.data) {
      Object.values(aDraft.data).forEach(d => {
        aTotal++
        if (d?.health !== null || d?.notPresent) aDone++
      })
    }
    ;(aDraft?.customAppliances || []).forEach(d => {
      aTotal++
      if (d?.health !== null || d?.notPresent) aDone++
    })

    return {
      outdoor:    { done: oDone, total: oTotal, started: !!oDraft },
      indoor:     { done: iDone, total: iTotal, started: !!iDraft },
      appliances: { done: aDone, total: aTotal, started: !!aDraft },
    }
  } catch {
    return {
      outdoor:    { done: 0, total: 0, started: false },
      indoor:     { done: 0, total: 0, started: false },
      appliances: { done: 0, total: 0, started: false },
    }
  }
}

// ─── Profile dropdown ──────────────────────────────────────────────────────────
function ProfileDropdown({ name, email, onLogout }) {
  const [open, setOpen] = useState(false)
  const [sub,  setSub]  = useState(null)
  const ref             = useRef(null)

  useEffect(() => {
    function outside(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSub(null) } }
    if (open) document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(p => !p); setSub(null) }}
        style={{
          width: 34, height: 34, borderRadius: '50%',
          background: open ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
          border: `2px solid ${open ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          color: open ? '#fff' : 'var(--text-dim, #9394a8)',
          fontFamily: 'var(--font-mono, monospace)',
          cursor: 'pointer',
          transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          flexShrink: 0,
        }}
      >{initials(name)}</button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          minWidth: 192,
          background: 'var(--bg-panel, #1e2028)',
          border: '1px solid var(--border, #2e3040)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
          overflow: 'hidden', zIndex: 200, animation: 'fadeIn 0.15s ease',
        }}>
          {sub === null ? (
            <>
              <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)' }}>{name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{email}</div>
              </div>
              <DropItem icon="👤" label="Profile" onClick={() => setSub('profile')} />
              <DropItem icon="⎋"  label="Log Out" onClick={onLogout} danger />
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                <button onClick={() => setSub(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>←</button>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)' }}>profile</span>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent, #c8963e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono, monospace)' }}>{initials(name)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 3 }}>name</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'capitalize' }}>{name || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 3 }}>email</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>{email || '—'}</div>
                </div>
              </div>
              <div style={{ padding: '0 10px 10px' }}>
                <button onClick={onLogout} style={{ width: '100%', padding: '9px 14px', borderRadius: 6, border: '1px solid rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.08)', fontSize: 12, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                  ⎋ log out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DropItem({ icon, label, onClick, danger }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '11px 16px', border: 'none',
        background: hover ? (danger ? 'rgba(224,92,106,0.08)' : 'rgba(200,150,62,0.08)') : 'transparent',
        color: danger ? 'var(--red, #e05c6a)' : hover ? 'var(--accent, #c8963e)' : 'var(--text, #e8e8f0)',
        fontSize: 13, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'var(--font-mono, monospace)', textAlign: 'left',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>{label}
    </button>
  )
}

// ─── Shared error strip ────────────────────────────────────────────────────────
function ErrorStrip({ msg, onRetry }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.07)', gap: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>Couldn't load your queue — {msg}</span>
      <button
        onClick={onRetry}
        style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(224,92,106,0.4)', background: 'transparent', color: 'var(--red, #e05c6a)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}
      >Retry</button>
    </div>
  )
}

// ─── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const email = session?.user?.email ?? ''
  const name  = session?.user?.user_metadata?.full_name ?? email.split('@')[0].replace(/[._]/g, ' ')

  const [props,           setProps]           = useState([])
  const [latestInspByPid, setLatestInspByPid] = useState({})
  const [latestEstByPid,  setLatestEstByPid]  = useState({})
  const [disputesByEstId, setDisputesByEstId] = useState({})
  const [draftMap,        setDraftMap]        = useState({})
  const [loading,         setLoading]         = useState(true)
  const [loadError,       setLoadError]       = useState(null)
  const [activeChip,      setActiveChip]      = useState(null)
  const [showTest,        setShowTest]        = useState(false)

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  // ─── 4-query batch ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [propsRes, inspsRes, estsRes, dispsRes] = await Promise.all([
        supabase.from('properties')
          .select('pid,name,type,address,created_at')
          .order('created_at', { ascending: false }),
        supabase.from('inspections')
          .select('pid,house_type,inspection_date,created_at')
          .order('created_at', { ascending: false }),
        supabase.from('estimates')
          .select('id,pid,sent_at,created_at')
          .order('created_at', { ascending: false }),
        supabase.from('estimate_disputes')
          .select('estimate_id,author_type,created_at')
          .order('created_at', { ascending: false }),
      ])

      const firstErr = propsRes.error || inspsRes.error || estsRes.error || dispsRes.error
      if (firstErr) {
        console.error('Dashboard load error:', firstErr)
        setLoadError(firstErr.message || 'Query failed')
        return
      }

      const properties  = propsRes.data  || []
      const inspections = inspsRes.data  || []
      const estimates   = estsRes.data   || []
      const disputes    = dispsRes.data  || []

      const inspByPid = {}
      inspections.forEach(i => { if (!inspByPid[i.pid]) inspByPid[i.pid] = i })

      const estByPid = {}
      estimates.forEach(e => { if (!estByPid[e.pid]) estByPid[e.pid] = e })

      const dispByEst = {}
      disputes.forEach(d => {
        if (!dispByEst[d.estimate_id]) dispByEst[d.estimate_id] = []
        dispByEst[d.estimate_id].push(d)
      })

      setProps(properties)
      setLatestInspByPid(inspByPid)
      setLatestEstByPid(estByPid)
      setDisputesByEstId(dispByEst)

      const dm = {}
      properties.forEach(p => { dm[p.pid] = readDraftProgress(p.pid) })
      setDraftMap(dm)
    } catch (err) {
      console.error('Dashboard load error:', err)
      setLoadError(err.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }, [])

  const { pullDistance, isRefreshing } = usePullToRefresh(load)
  useEffect(() => { load() }, [load])

  // ─── Derive work queue (shared by both layouts) ─────────────────────────────
  const fullQueue = useMemo(() => {
    const filtered = props.filter(p => showTest || !/^test/i.test(String(p.pid)))

    return filtered.map(p => {
      const est          = latestEstByPid[p.pid]
      const draft        = draftMap[p.pid] || {}
      const draftDone    = (draft.outdoor?.done || 0) + (draft.indoor?.done || 0) + (draft.appliances?.done || 0)
      const draftTotal   = (draft.outdoor?.total || 0) + (draft.indoor?.total || 0) + (draft.appliances?.total || 0)
      const draftStarted = draft.outdoor?.started || draft.indoor?.started || draft.appliances?.started
      const inspInProgress = !!(draftStarted && draftTotal > 0 && draftDone < draftTotal)

      const disputes   = est ? (disputesByEstId[est.id] || []) : []
      const latestDisp = disputes.length > 0
        ? [...disputes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
        : null
      const openQuery = !!(est?.sent_at && latestDisp?.author_type === 'landlord')

      const landlordMsgs     = disputes.filter(d => d.author_type === 'landlord')
      const landlordMsgCount = landlordMsgs.length
      const oldestLandlordTs = openQuery && landlordMsgs.length > 0
        ? Math.min(...landlordMsgs.map(d => new Date(d.created_at).getTime()))
        : Infinity

      let sortPri, sortTs
      if (openQuery)                { sortPri = 0; sortTs = oldestLandlordTs }
      else if (est && !est.sent_at) { sortPri = 1; sortTs = new Date(est.created_at).getTime() }
      else if (inspInProgress)      { sortPri = 2; sortTs = new Date(p.created_at).getTime() }
      else                          { sortPri = 3; sortTs = new Date(est?.created_at || p.created_at).getTime() }

      let actionLabel, actionPath, actionState
      if (inspInProgress) {
        actionLabel = `Continue (${draftDone}/${draftTotal})`
        actionPath  = '/inspections/mode'
        actionState = { pid: p.pid }
      } else if (!est) {
        actionLabel = 'Create Estimate'
        actionPath  = `/properties/${p.pid}/estimates`
      } else if (!est.sent_at) {
        actionLabel = 'Review & send'
        actionPath  = `/properties/${p.pid}/estimates`
      } else if (openQuery) {
        actionLabel = `Reply to ${landlordMsgCount} quer${landlordMsgCount !== 1 ? 'ies' : 'y'}`
        actionPath  = `/properties/${p.pid}/estimates`
      } else {
        actionLabel = 'View estimate'
        actionPath  = `/properties/${p.pid}/estimates`
      }

      const latestInsp   = latestInspByPid[p.pid]
      const houseType    = titleCase(latestInsp?.house_type || p.type || '')
      const lastActivity = latestInsp?.inspection_date || latestInsp?.created_at || est?.created_at || p.created_at

      return { ...p, houseType, lastActivity, est, inspInProgress, draftDone, draftTotal, openQuery, landlordMsgCount, sortPri, sortTs, actionLabel, actionPath, actionState }
    }).sort((a, b) => {
      if (a.sortPri !== b.sortPri) return a.sortPri - b.sortPri
      if (a.sortPri === 0) return a.sortTs - b.sortTs
      return b.sortTs - a.sortTs
    })
  }, [props, latestInspByPid, latestEstByPid, disputesByEstId, draftMap, showTest])

  const visibleQueue = useMemo(() => {
    if (!activeChip) return fullQueue
    if (activeChip === 'inprogress') return fullQueue.filter(p => p.inspInProgress)
    if (activeChip === 'tosend')     return fullQueue.filter(p => p.est && !p.est.sent_at)
    if (activeChip === 'queries')    return fullQueue.filter(p => p.openQuery)
    return fullQueue
  }, [fullQueue, activeChip])

  const inProgressCount = useMemo(() => fullQueue.filter(p => p.inspInProgress).length,        [fullQueue])
  const toSendCount     = useMemo(() => fullQueue.filter(p => p.est && !p.est.sent_at).length, [fullQueue])
  const queriesCount    = useMemo(() => fullQueue.filter(p => p.openQuery).length,              [fullQueue])

  // Mobile triage chips
  const mobileChips = [
    { key: 'inprogress', label: `${inProgressCount} in progress`, count: inProgressCount },
    { key: 'tosend',     label: `${toSendCount} to send`,         count: toSendCount     },
    { key: 'queries',    label: `${queriesCount} queries`,         count: queriesCount    },
  ].filter(c => c.count > 0)

  // Desktop stat tiles — 4 items, tappable, act as filter radio
  const desktopStats = [
    { chipKey: 'inprogress', n: loading ? '—' : inProgressCount, label: 'Inspections in progress', isQuery: false },
    { chipKey: 'tosend',     n: loading ? '—' : toSendCount,     label: 'Estimates to send',        isQuery: false },
    { chipKey: 'queries',    n: loading ? '—' : queriesCount,    label: 'Queries awaiting reply',   isQuery: true  },
    { chipKey: null,         n: loading ? '—' : fullQueue.length, label: 'Active properties',        isQuery: false },
  ]

  function doNavigate(p) {
    if (p.actionState) navigate(p.actionPath, { state: p.actionState })
    else navigate(p.actionPath)
  }

  const emptyMsg = activeChip
    ? 'No properties match this filter.'
    : 'No properties yet — start an inspection to add one.'

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={s.page}>
        <style>{`
          /* layout breakpoint */
          .dash-mobile  { display: flex !important; flex-direction: column; }
          .dash-desktop { display: none  !important; }
          @media (min-width: 768px) {
            .dash-mobile  { display: none  !important; }
            .dash-desktop { display: block !important; }
          }
          /* stat grid: 2×2 at 768-1099px, 1×4 at ≥1100px */
          .desk-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          @media (min-width: 1100px) {
            .desk-stats-grid { grid-template-columns: repeat(4, 1fr) !important; }
          }
          /* hover states */
          .prop-card:hover { border-color: var(--accent, #c8963e) !important; }
          .stat-tile       { transition: background 0.14s; }
          .chip-btn        { transition: background 0.15s, color 0.15s; }
          .q-card:active   { border-color: rgba(200,150,62,0.5) !important; }
        `}</style>

        {/* ── Shared header ── */}
        <header style={s.header}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          >
            <PulseLogo />
          </button>
          <ProfileDropdown name={name} email={email} onLogout={logout} />
        </header>

        {/* ══════════ MOBILE (<768px) ══════════════════════════════════════════ */}
        <main className="dash-mobile" style={s.mobileBody}>

          {mobileChips.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {mobileChips.map(c => (
                <button
                  key={c.key}
                  className="chip-btn"
                  onClick={() => setActiveChip(a => a === c.key ? null : c.key)}
                  style={{
                    padding: '5px 12px', borderRadius: 20,
                    border: '1px solid rgba(200,150,62,0.45)',
                    background: activeChip === c.key ? 'var(--accent, #c8963e)' : 'transparent',
                    color: activeChip === c.key ? '#16171f' : 'var(--accent, #c8963e)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >{c.label}</button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={() => navigate('/properties')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
              {fullQueue.length} properties →
            </button>
            <button onClick={() => navigate('/inspections/new')} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(200,150,62,0.3)', background: 'transparent', color: 'var(--accent, #c8963e)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
              + New Inspection
            </button>
          </div>

          {loading ? <LogoSpinner />
            : loadError ? <ErrorStrip msg={loadError} onRetry={load} />
            : visibleQueue.length === 0 ? <div style={s.empty}>{emptyMsg}</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {visibleQueue.map(p => (
                  <div key={p.pid} className="q-card" onClick={() => doNavigate(p)} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                    background: 'var(--bg-panel, #1e2028)',
                    border: '1px solid var(--border, #2e3040)',
                    borderRadius: 8, cursor: 'pointer',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 14, fontWeight: 700, color: 'var(--accent, #c8963e)', flexShrink: 0, minWidth: 36 }}>{p.pid}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.houseType || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 1 }}>{fmt(p.lastActivity)}</div>
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: p.openQuery ? 700 : 600, flexShrink: 0,
                      color: p.openQuery ? 'var(--accent, #c8963e)' : p.actionLabel === 'View estimate' ? 'var(--text-muted, #6b6d82)' : 'var(--text, #e8e8f0)',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}>{p.actionLabel} →</span>
                  </div>
                ))}
              </div>
            )
          }

          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <button onClick={() => setShowTest(t => !t)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', padding: '4px 8px', opacity: 0.6 }}>
              {showTest ? 'Hide test properties' : 'Show test properties'}
            </button>
          </div>
        </main>

        {/* ══════════ DESKTOP (≥768px) ═════════════════════════════════════════ */}
        <div className="dash-desktop">
          <main style={s.desktopBody}>

            {/* Greeting */}
            <p style={s.greeting}>
              {getGreeting()}{' '}
              <span style={{ color: 'var(--accent, #c8963e)', textTransform: 'capitalize' }}>
                {name.split(' ')[0]}
              </span>
            </p>

            {/* ── Stat tiles: 2×2 on narrow desktop, 1×4 on wide ── */}
            <div style={{ marginBottom: 20 }}>
              <div
                className="desk-stats-grid"
                style={{
                  display: 'grid',
                  gap: 1,
                  background: 'var(--border, #2e3040)',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                {desktopStats.map(stat => {
                  const isActive = activeChip === stat.chipKey
                  // query tile: amber number whenever count > 0 (subtle accent)
                  const numColor = isActive
                    ? 'var(--accent, #c8963e)'
                    : stat.isQuery && queriesCount > 0
                      ? 'rgba(200,150,62,0.85)'
                      : 'var(--text, #e8e8f0)'
                  return (
                    <div
                      key={stat.label}
                      className="stat-tile"
                      onClick={() => setActiveChip(a => a === stat.chipKey ? null : stat.chipKey)}
                      style={{
                        padding: '14px 16px',
                        background: isActive ? 'rgba(200,150,62,0.08)' : 'var(--bg-panel, #1e2028)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ ...s.statNum, fontSize: 22, color: numColor }}>{stat.n}</div>
                      <div style={{ ...s.statLabel, marginTop: 4 }}>{stat.label}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Active properties panel ── */}
            <div style={s.panel}>
              <div style={s.panelHead}>
                <span style={s.panelTitle}>active_properties</span>
                <button style={s.btnAccent} onClick={() => navigate('/inspections/new')}>+ New Inspection →</button>
              </div>

              {loading ? <LogoSpinner />
                : loadError ? <ErrorStrip msg={loadError} onRetry={load} />
                : visibleQueue.length === 0 ? <div style={s.empty}>{emptyMsg}</div>
                : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {visibleQueue.map(p => (
                        <div
                          key={p.pid}
                          className="prop-card"
                          onClick={() => doNavigate(p)}
                          style={s.propCard}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={s.propPid}>PID {p.pid}</span>
                          </div>
                          <div style={s.propMeta}>{p.houseType || '—'}</div>
                          {p.lastActivity && (
                            <div style={s.propDate}>Last inspection: {fmt(p.lastActivity)}</div>
                          )}
                          <div style={s.propNext}>↳ Next: {p.actionLabel}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border, #2e3040)', textAlign: 'center' }}>
                      <button onClick={() => setShowTest(t => !t)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', padding: '4px 8px', opacity: 0.6 }}>
                        {showTest ? 'Hide test properties' : 'Show test properties'}
                      </button>
                    </div>
                  </>
                )
              }
            </div>

          </main>
        </div>

      </div>
    </>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: '100svh',
    background: 'var(--bg, #16171f)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    color: 'var(--text, #e8e8f0)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    paddingTop: 'calc(env(safe-area-inset-top) + 0px)',
    minHeight: 56,
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    gap: 12,
  },
  mobileBody: {
    flex: 1,
    padding: '16px 16px 80px',
    width: '100%',
    boxSizing: 'border-box',
    flexDirection: 'column',
  },
  desktopBody: {
    flex: 1,
    padding: '16px 24px 80px',
    width: '100%',
    maxWidth: 960,
    margin: '0 auto',
    boxSizing: 'border-box',
  },
  greeting: {
    margin: '0 0 16px',
    fontSize: 12,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  panel: {
    background: 'var(--bg-panel, #1e2028)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 10,
    padding: 16,
  },
  panelHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  btnAccent: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--accent, #c8963e)',
    background: 'rgba(200,150,62,0.08)',
    border: '1px solid rgba(200,150,62,0.25)',
    borderRadius: 6,
    padding: '5px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono, monospace)',
  },
  statNum: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
    lineHeight: 1,
  },
  statLabel: {
    fontSize: 10,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    marginTop: 2,
  },
  // Original property card anatomy — exact values from pre-queue commit
  propCard: {
    padding: '12px 14px',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  propPid: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--accent, #c8963e)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  propMeta: {
    fontSize: 12,
    color: 'var(--text-dim, #9394a8)',
    marginBottom: 3,
  },
  propDate: {
    fontSize: 11,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  propNext: {
    fontSize: 11,
    color: 'var(--accent, #c8963e)',
    fontFamily: 'var(--font-mono, monospace)',
    marginTop: 4,
  },
  empty: {
    fontSize: 12,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    padding: '8px 0',
  },
}
