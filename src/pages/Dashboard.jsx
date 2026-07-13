import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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

// ─── Truth-table next action ───────────────────────────────────────────────────
function computeNextAction(pid, { latestEstByPid, disputesByEstId, draftMap }) {
  const est          = latestEstByPid[pid]
  const draft        = draftMap[pid] || {}
  const draftDone    = (draft.outdoor?.done || 0) + (draft.indoor?.done || 0) + (draft.appliances?.done || 0)
  const draftTotal   = (draft.outdoor?.total || 0) + (draft.indoor?.total || 0) + (draft.appliances?.total || 0)
  const draftStarted = draft.outdoor?.started || draft.indoor?.started || draft.appliances?.started
  const inspInProgress = !!(draftStarted && draftTotal > 0 && draftDone < draftTotal)

  const disputes   = est ? (disputesByEstId[est.id] || []) : []
  const latestDisp = disputes.length > 0
    ? [...disputes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    : null
  const openQuery        = !!(est?.sent_at && latestDisp?.author_type === 'landlord')
  const landlordMsgCount = disputes.filter(d => d.author_type === 'landlord').length

  if (inspInProgress)
    return { label: `Continue (${draftDone}/${draftTotal})`, path: '/inspections/mode',          navState: { pid }, openQuery: false, landlordMsgCount: 0 }
  if (!est)
    return { label: 'Create Estimate',  path: `/properties/${pid}/estimates`, navState: null, openQuery: false, landlordMsgCount: 0 }
  if (!est.sent_at)
    return { label: 'Review & send',    path: `/properties/${pid}/estimates`, navState: null, openQuery: false, landlordMsgCount: 0 }
  if (openQuery)
    return { label: `Reply to ${landlordMsgCount} quer${landlordMsgCount !== 1 ? 'ies' : 'y'}`, path: `/properties/${pid}/estimates`, navState: { tab: 'queries' }, openQuery: true, landlordMsgCount }
  return   { label: 'View estimate',    path: `/properties/${pid}/estimates`, navState: null, openQuery: false, landlordMsgCount: 0 }
}

// ─── Profile dropdown ──────────────────────────────────────────────────────────
function ProfileDropdown({ name, email, onLogout }) {
  const [open, setOpen]       = useState(false)
  const [sub,  setSub]        = useState(null)
  const ref                   = useRef(null)

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
              <DropItem icon="👤" label="Profile"  onClick={() => setSub('profile')} />
              <DropItem icon="⎋"  label="Log Out"  onClick={onLogout} danger />
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

// ─── Nav & quick-action config ─────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Inspect',    path: '/inspections/new' },
  { label: 'Properties', path: '/properties' },
  { label: 'Inventory',  path: '/inventory' },
  { label: 'Rate Card',  path: '/inventory/public-rc' },
  { label: 'SOPs',       path: '/sops' },
]

const QUICK_ACTIONS = [
  { icon: '+', label: 'New Inspection', path: '/inspections/new' },
  { icon: '↗', label: 'Log Usage',      path: '/inventory/usage' },
  { icon: '₹', label: 'Rate Card',      path: '/inventory/public-rc' },
  { icon: '⚙', label: 'SOPs',           path: '/sops' },
]

const FEED_COLORS = { inspection: '#c8963e', purchase: '#3dba7a', property: '#6b8de6' }

// ─── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session } = useAuth()

  const email = session?.user?.email ?? ''
  const name  = session?.user?.user_metadata?.full_name ?? email.split('@')[0].replace(/[._]/g, ' ')

  const [properties,      setProperties]      = useState([])
  const [inspMap,         setInspMap]         = useState({})
  const [latestEstByPid,  setLatestEstByPid]  = useState({})
  const [disputesByEstId, setDisputesByEstId] = useState({})
  const [draftMap,        setDraftMap]        = useState({})
  const [stats,           setStats]           = useState({ inspMonth: '—', activeProps: '—', invValue: '—' })
  const [activity,        setActivity]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [loadError,       setLoadError]       = useState(null)
  const [showTest,        setShowTest]        = useState(false)

  const isActive = path => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // Batch 1: core data (4 queries in parallel — no FK embed)
      const [propsRes, inspRes, estsRes, dispsRes] = await Promise.all([
        supabase.from('properties').select('pid,name,type,address,created_at').order('created_at', { ascending: false }),
        supabase.from('inspections').select('pid,house_type,inspection_date,status,created_at').order('created_at', { ascending: false }),
        supabase.from('estimates').select('id,pid,sent_at,created_at').order('created_at', { ascending: false }),
        supabase.from('estimate_disputes').select('estimate_id,author_type,created_at').order('created_at', { ascending: false }),
      ])

      const firstErr = propsRes.error || inspRes.error || estsRes.error || dispsRes.error
      if (firstErr) {
        console.error('Dashboard load error:', firstErr)
        setLoadError(firstErr.message || 'Query failed')
        return
      }

      const props = propsRes.data || []
      const insp  = inspRes.data  || []
      const ests  = estsRes.data  || []
      const disps = dispsRes.data || []

      // Client-side joins (pid is loose text, no FK)
      const iMap = {}
      insp.forEach(i => { if (!iMap[i.pid]) iMap[i.pid] = i })

      const estByPid = {}
      ests.forEach(e => { if (!estByPid[e.pid]) estByPid[e.pid] = e })

      const dispByEst = {}
      disps.forEach(d => {
        if (!dispByEst[d.estimate_id]) dispByEst[d.estimate_id] = []
        dispByEst[d.estimate_id].push(d)
      })

      setProperties(props)
      setInspMap(iMap)
      setLatestEstByPid(estByPid)
      setDisputesByEstId(dispByEst)

      // Read localStorage drafts synchronously
      const dm = {}
      props.forEach(p => { dm[p.pid] = readDraftProgress(p.pid) })
      setDraftMap(dm)

      // Stats: inventory value (sequential — small table)
      const monthStart    = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const inspThisMonth = insp.filter(i => i.created_at >= monthStart).length
      const invRes        = await supabase.from('inventory_registry').select('total_amount')
      const invTotal      = (invRes.data || []).reduce((s, r) => s + (r.total_amount || 0), 0)

      setStats({
        inspMonth:   inspThisMonth,
        activeProps: props.length,
        invValue:    invTotal ? `₹${invTotal.toLocaleString('en-IN')}` : '₹0',
      })

      // Activity feed (parallel)
      const [purchRes, recentPropsRes] = await Promise.all([
        supabase.from('inventory_registry').select('trade,total_amount,vendor_name,created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('properties').select('pid,created_at,type').order('created_at', { ascending: false }).limit(3),
      ])

      const feed = [
        ...insp.slice(0, 5).map(i => ({
          title: `Inspection saved · PID ${i.pid}`,
          desc:  titleCase(i.house_type || ''),
          date:  i.created_at,
          link:  `/properties/${i.pid}`,
          type:  'inspection',
        })),
        ...(purchRes.data || []).map(p => ({
          title: `Purchase logged · ${p.trade}`,
          desc:  `${p.vendor_name || ''} · ₹${(p.total_amount || 0).toLocaleString('en-IN')}`,
          date:  p.created_at,
          link:  '/inventory/history',
          type:  'purchase',
        })),
        ...(recentPropsRes.data || []).map(p => ({
          title: `Property created · PID ${p.pid}`,
          desc:  titleCase(p.type || ''),
          date:  p.created_at,
          link:  `/properties/${p.pid}`,
          type:  'property',
        })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8)

      setActivity(feed)
    } catch (err) {
      console.error('Dashboard load error:', err)
      setLoadError(err.message || 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }, [])

  const { pullDistance, isRefreshing } = usePullToRefresh(load)

  useEffect(() => { load() }, [load])

  // Original stat tiles (inventory value preserved)
  const STATS = [
    { n: stats.inspMonth,   label: 'Inspections this month' },
    { n: stats.activeProps, label: 'Active properties' },
    { n: 0,                 label: 'Open work orders' },
    { n: stats.invValue,    label: 'Inventory value' },
  ]

  // TEST-* filter — applied in render
  const visibleProperties = properties.filter(p => showTest || !/^test/i.test(String(p.pid)))

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={s.page}>
      <style>{`
        @media (min-width: 641px) {
          .dash-nav       { display: flex !important; }
          .dash-grid      { display: grid !important; grid-template-columns: 1fr 380px; gap: 20px; align-items: start; width: 100%; box-sizing: border-box; }
          .mob-stats      { display: none  !important; }
          .desk-stats     { display: block !important; }
          .dash-quick     { display: block !important; }
          .dash-right-col { position: sticky; top: 76px; align-self: start; max-height: calc(100vh - 96px); overflow-y: auto; }
          .dash-greeting  { grid-column: 1 / -1; }
        }
        @media (max-width: 640px) {
          .dash-nav       { display: none  !important; }
          .mob-stats      { display: grid  !important; }
          .desk-stats     { display: none  !important; }
          .dash-quick     { display: none  !important; }
          .dash-grid      { gap: 12px !important; padding: 12px 16px 80px !important; }
        }
        .prop-card:hover { border-color: var(--accent, #c8963e) !important; }
        .feed-item:hover { background: var(--bg-input, #252731) !important; }
        .nav-btn:hover   { color: var(--accent, #c8963e) !important; background: rgba(200,150,62,0.06) !important; }
        .qa-btn:hover    { border-color: var(--accent, #c8963e) !important; color: var(--accent, #c8963e) !important; }
      `}</style>

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
            <PulseLogo />
          </button>
          <nav className="dash-nav" style={{ display: 'none', alignItems: 'center', gap: 2, marginLeft: 28 }}>
            {NAV_ITEMS.map(item => (
              <button
                key={item.path}
                className="nav-btn"
                onClick={() => navigate(item.path)}
                style={{
                  padding: '6px 14px', fontSize: 12,
                  letterSpacing: '0.06em',
                  color:      isActive(item.path) ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
                  background: isActive(item.path) ? 'rgba(200,150,62,0.08)' : 'transparent',
                  borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font-mono, monospace)',
                  textTransform: 'uppercase', border: 'none',
                  transition: 'color 0.15s, background 0.15s',
                }}
              >{item.label}</button>
            ))}
          </nav>
        </div>
        <ProfileDropdown name={name} email={email} onLogout={logout} />
      </header>

      {/* ── Body ── */}
      <main style={s.body}>

        <div className="dash-grid" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Greeting */}
          <p className="dash-greeting" style={s.greeting}>
            {getGreeting()}{' '}
            <span style={{ color: 'var(--accent, #c8963e)', textTransform: 'capitalize' }}>
              {name.split(' ')[0]}
            </span>
          </p>

          {/* Mobile stats 2×2 */}
          <div className="mob-stats" style={{ display: 'none', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden', gridColumn: '1 / -1' }}>
            {STATS.map(stat => (
              <div key={stat.label} style={{ padding: 16, background: 'var(--bg-panel, #1e2028)' }}>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{String(stat.n ?? '—')}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 4 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* LEFT — Active Properties */}
          <section style={s.panel}>
            <div style={s.panelHead}>
              <span style={s.panelTitle}>active_properties</span>
              <button style={s.btnAccent} onClick={() => navigate('/inspections/new')}>+ New Inspection →</button>
            </div>

            {loading ? (
              <LogoSpinner />
            ) : loadError ? (
              /* Honest error strip — never cosplays as empty state */
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(224,92,106,0.3)', background: 'rgba(224,92,106,0.07)', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>Couldn't load your queue — {loadError}</span>
                <button onClick={load} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(224,92,106,0.4)', background: 'transparent', color: 'var(--red, #e05c6a)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>Retry</button>
              </div>
            ) : properties.length === 0 ? (
              <div style={s.empty}>No properties yet — start an inspection to add one.</div>
            ) : (
              <>
                {/* All-filtered-as-test edge case */}
                {visibleProperties.length === 0 && (
                  <div style={s.empty}>All properties are test PIDs — hidden by default.</div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {visibleProperties.map(prop => {
                    const li     = inspMap[prop.pid]
                    const action = computeNextAction(prop.pid, { latestEstByPid, disputesByEstId, draftMap })
                    return (
                      <div
                        key={prop.pid}
                        className="prop-card"
                        onClick={() => action.navState ? navigate(action.path, { state: action.navState }) : navigate(action.path)}
                        style={s.propCard}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={s.propPid}>PID {prop.pid}</span>
                          {/* Amber query badge — surfaces open landlord threads without redesigning stat grid */}
                          {action.openQuery && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 4, padding: '2px 6px' }}>
                              {action.landlordMsgCount} quer{action.landlordMsgCount !== 1 ? 'ies' : 'y'}
                            </span>
                          )}
                        </div>
                        <div style={s.propMeta}>
                          {(() => {
                            const typeLabel   = titleCase(prop.type || li?.house_type || '')
                            const layoutLabel = li?.config?.layout || prop.config?.layout || ''
                            return typeLabel + (layoutLabel ? ` · ${layoutLabel}` : '')
                          })()}
                        </div>
                        {li && (
                          <div style={s.propDate}>
                            Last inspection: {fmt(li.inspection_date || li.created_at)}
                          </div>
                        )}
                        <div style={s.propNext}>↳ Next: {action.label}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Show/hide test properties — always rendered when there are any properties */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border, #2e3040)', textAlign: 'center' }}>
                  <button
                    onClick={() => setShowTest(t => !t)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', padding: '4px 8px', opacity: 0.6 }}
                  >
                    {showTest ? 'Hide test properties' : 'Show test properties'}
                  </button>
                </div>

                {/* Fewer-than-3 hint */}
                {visibleProperties.length < 3 && (
                  <div style={{ border: '1px dashed rgba(200,150,62,0.2)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Add more properties</span>
                    <button
                      onClick={() => navigate('/inspections/new')}
                      style={{ color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}
                    >+ New</button>
                  </div>
                )}

                {/* Property journey pipeline */}
                <div style={{ marginTop: 16, padding: '12px 0 4px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Property Journey</div>
                  <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 0, paddingBottom: 4, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {[
                      { stage: 'T-5', label: 'INSPECTION',  color: '#c8963e' },
                      { stage: 'T-4', label: 'ESTIMATE',    color: '#6b8de6' },
                      { stage: 'T-3', label: 'WORK ORDER',  color: '#9b6de6' },
                      { stage: 'T-2', label: 'IN PROGRESS', color: '#e6923e' },
                      { stage: 'T-1', label: 'SNAGGING',    color: '#e6d83e' },
                      { stage: 'T',   label: 'READY',       color: '#3dba7a' },
                    ].map((step, idx, arr) => {
                      const activePid = visibleProperties[0]?.pid
                      const isAct     = idx === 0
                      return (
                        <div key={step.stage} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: '50%',
                              background: isAct ? step.color : 'transparent',
                              border: `2px solid ${isAct ? step.color : 'var(--border-dash, #3a3d52)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 8, fontWeight: 700, color: isAct ? '#16171f' : 'var(--text-muted, #6b6d82)',
                              fontFamily: 'var(--font-mono, monospace)',
                            }}>{step.stage}</div>
                            <div style={{ fontSize: 8, color: isAct ? step.color : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap', letterSpacing: '0.06em' }}>{step.label}</div>
                            {isAct && activePid && (
                              <div style={{ fontSize: 8, color: step.color, fontFamily: 'var(--font-mono, monospace)', opacity: 0.8 }}>{activePid}</div>
                            )}
                          </div>
                          {idx < arr.length - 1 && (
                            <div style={{ width: 24, height: 1, background: 'var(--border-dash, #3a3d52)', margin: '0 2px', marginBottom: 24, flexShrink: 0 }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </section>

          {/* RIGHT column */}
          <div className="dash-right-col" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Snapshot stats — desktop only */}
            <section className="desk-stats" style={{ display: 'none' }}>
              <div style={s.panel}>
                <div style={s.panelHead}>
                  <span style={s.panelTitle}>snapshot</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden' }}>
                  {STATS.map(stat => (
                    <div key={stat.label} style={{ padding: '14px 16px', background: 'var(--bg-panel, #1e2028)' }}>
                      <div style={{ ...s.statNum, fontSize: 20 }}>{String(stat.n ?? '—')}</div>
                      <div style={{ ...s.statLabel, marginTop: 4 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Quick Actions — desktop only */}
            <section className="dash-quick" style={{ display: 'none' }}>
              <div style={s.panel}>
                <div style={s.panelHead}>
                  <span style={s.panelTitle}>quick_actions</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {QUICK_ACTIONS.map(a => (
                    <button key={a.path} className="qa-btn" onClick={() => navigate(a.path)} style={s.qaBtn}>
                      <span style={{ color: 'var(--accent, #c8963e)', fontWeight: 700, fontSize: 14 }}>{a.icon}</span>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Activity feed */}
            <section style={s.panel}>
              <div style={s.panelHead}>
                <span style={s.panelTitle}>activity_feed</span>
              </div>
              {activity.length === 0 ? (
                <div style={s.empty}>No recent activity.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {activity.map((ev, i) => (
                    <div
                      key={i}
                      className="feed-item"
                      onClick={() => navigate(ev.link)}
                      style={s.feedItem}
                    >
                      <span style={{ fontSize: 7, color: FEED_COLORS[ev.type] || '#c8963e', marginTop: 5, flexShrink: 0 }}>●</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.feedTitle}>{ev.title}</div>
                        <div style={s.feedSub}>{ev.desc} · {fmt(ev.date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        </div>
      </main>
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
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  body: {
    flex: 1,
    padding: '16px 24px 80px',
    width: '100%',
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
  },
  statLabel: {
    fontSize: 10,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    marginTop: 2,
  },
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
  feedItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '9px 6px',
    cursor: 'pointer',
    borderRadius: 6,
    borderBottom: '1px solid var(--border, #2e3040)',
    transition: 'background 0.12s',
  },
  feedTitle: {
    fontSize: 12,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
    fontWeight: 500,
  },
  feedSub: {
    fontSize: 10,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    marginTop: 2,
  },
  qaBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 8,
    cursor: 'pointer',
    color: 'var(--text, #e8e8f0)',
    fontSize: 12,
    fontFamily: 'var(--font-mono, monospace)',
    textAlign: 'left',
    transition: 'border-color 0.15s, color 0.15s',
  },
}
