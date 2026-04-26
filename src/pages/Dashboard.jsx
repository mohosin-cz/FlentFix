import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// ─── Pulse dot-matrix logo ─────────────────────────────────────────────────────
const PulseLogo = () => (
  <svg width="140" height="28" viewBox="0 0 300 68" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', maxWidth: '100%' }}>
    <style>{`.do{fill:#16171f;stroke:#c8963e;stroke-width:1.2}.dd{fill:none;stroke:#c8963e;stroke-width:0.5;opacity:0.15}`}</style>
    {[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,0,0,0]].map((r,ri)=>r.map((on,ci)=><rect key={`p${ri}${ci}`} className={on?'do':'dd'} x={ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`u${ri}${ci}`} className={on?'do':'dd'} x={52+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`l${ri}${ci}`} className={on?'do':'dd'} x={100+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`s${ri}${ci}`} className={on?'do':'dd'} x={148+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`e${ri}${ci}`} className={on?'do':'dd'} x={196+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    <line x1="248" y1="33" x2="258" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.4"/>
    <polyline points="258,33 264,12 268,54 274,20 278,33" fill="none" stroke="#c8963e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="278" y1="33" x2="296" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.4"/>
    <circle cx="296" cy="33" r="2.5" fill="#c8963e"/>
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

function getNextAction(pid, inspMap) {
  return inspMap[pid] ? 'Create Estimate' : 'Start Inspection'
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

  const [properties,  setProperties]  = useState([])
  const [inspMap,     setInspMap]     = useState({})  // pid → latest inspection
  const [stats,       setStats]       = useState({ inspMonth: '—', activeProps: '—', invValue: '—' })
  const [activity,    setActivity]    = useState([])
  const [loading,     setLoading]     = useState(true)

  const isActive = path => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [propsRes, inspRes] = await Promise.all([
          supabase.from('properties').select('pid,name,type,address,created_at').order('created_at', { ascending: false }),
          supabase.from('inspections').select('pid,house_type,inspection_date,status,created_at').order('created_at', { ascending: false }),
        ])

        const props = propsRes.data || []
        const insp  = inspRes.data  || []

        // Build latest-inspection-per-pid map
        const map = {}
        insp.forEach(i => { if (!map[i.pid]) map[i.pid] = i })
        setProperties(props)
        setInspMap(map)

        // Stats
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
        const inspThisMonth = insp.filter(i => i.created_at >= monthStart).length

        const invRes = await supabase.from('inventory_registry').select('total_amount')
        const invTotal = (invRes.data || []).reduce((s, r) => s + (r.total_amount || 0), 0)

        setStats({
          inspMonth:   inspThisMonth,
          activeProps: props.length,
          invValue:    invTotal ? `₹${invTotal.toLocaleString('en-IN')}` : '₹0',
        })

        // Activity feed
        const [purchRes, recentPropsRes] = await Promise.all([
          supabase.from('inventory_registry').select('trade,total_amount,vendor_name,created_at').order('created_at', { ascending: false }).limit(5),
          supabase.from('properties').select('pid,created_at,type').order('created_at', { ascending: false }).limit(3),
        ])

        const feed = [
          ...insp.slice(0, 5).map(i => ({
            title: `Inspection saved · ${i.pid}`,
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
            title: `Property created · ${p.pid}`,
            desc:  titleCase(p.type || ''),
            date:  p.created_at,
            link:  `/properties/${p.pid}`,
            type:  'property',
          })),
        ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8)

        setActivity(feed)
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const STATS = [
    { n: stats.inspMonth,   label: 'Inspections this month' },
    { n: stats.activeProps, label: 'Active properties' },
    { n: 0,                 label: 'Open work orders' },
    { n: stats.invValue,    label: 'Inventory value' },
  ]

  return (
    <div style={s.page}>
      <style>{`
        @media (min-width: 641px) {
          .dash-nav       { display: flex !important; }
          .dash-grid      { display: grid !important; grid-template-columns: 2fr 1fr; gap: 24px; align-items: start; }
          .mob-stats      { display: none  !important; }
          .desk-stats     { display: block !important; }
          .dash-quick     { display: block !important; }
        }
        @media (max-width: 640px) {
          .dash-nav       { display: none  !important; }
          .mob-stats      { display: grid  !important; }
          .desk-stats     { display: none  !important; }
          .dash-quick     { display: none  !important; }
        }
        .prop-card:hover { border-color: var(--accent, #c8963e) !important; }
        .feed-item:hover { background: var(--bg-input, #252731) !important; }
        .nav-btn:hover   { color: var(--accent, #c8963e) !important; background: rgba(200,150,62,0.06) !important; }
        .qa-btn:hover    { border-color: var(--accent, #c8963e) !important; color: var(--accent, #c8963e) !important; }
      `}</style>

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <PulseLogo />
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

        {/* Greeting */}
        <p style={s.greeting}>
          {getGreeting()},{' '}
          <span style={{ color: 'var(--accent, #c8963e)', textTransform: 'capitalize' }}>
            {name.split(' ')[0]}
          </span>
        </p>

        {/* Mobile stats 2×2 (hidden on desktop) */}
        <div className="mob-stats" style={{ display: 'none', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          {STATS.map(stat => (
            <div key={stat.label} style={{ padding: '12px 14px', background: 'var(--bg-panel, #1e2028)' }}>
              <div style={s.statNum}>{String(stat.n ?? '—')}</div>
              <div style={s.statLabel}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Main grid — 2-col on desktop, stacked on mobile */}
        <div className="dash-grid" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* LEFT — Active Properties */}
          <section style={s.panel}>
            <div style={s.panelHead}>
              <span style={s.panelTitle}>active_properties</span>
              <button style={s.btnAccent} onClick={() => navigate('/inspections/new')}>+ New Inspection →</button>
            </div>

            {loading ? (
              <div style={s.empty}>loading…</div>
            ) : properties.length === 0 ? (
              <div style={s.empty}>No properties yet — start an inspection to add one.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {properties.map(prop => {
                  const li = inspMap[prop.pid]
                  return (
                    <div
                      key={prop.pid}
                      className="prop-card"
                      onClick={() => navigate(`/properties/${prop.pid}`)}
                      style={s.propCard}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={s.propPid}>{prop.pid}</span>
                      </div>
                      <div style={s.propMeta}>
                        {titleCase(prop.type || '')}
                        {li?.house_type ? ` · ${titleCase(li.house_type)}` : ''}
                      </div>
                      {li && (
                        <div style={s.propDate}>
                          Last inspection: {fmt(li.inspection_date || li.created_at)}
                        </div>
                      )}
                      <div style={s.propNext}>
                        ↳ Next: {getNextAction(prop.pid, inspMap)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* RIGHT column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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

          </div>
        </div>
      </main>
    </div>
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
    padding: '20px 20px 80px',
    maxWidth: 1200,
    width: '100%',
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
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
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
