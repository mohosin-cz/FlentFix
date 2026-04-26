import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
const PulseLogo = () => (
  <svg width="140" height="28" viewBox="0 0 300 68" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', maxWidth: '100%' }}>
    <style>{`.d1{fill:#c8963e}.d0{fill:#c8963e;opacity:.12}`}</style>
    {[[1,1,1,0],[1,0,0,1],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,0,0,0]].map((r,ri)=>r.map((on,ci)=><rect key={`p${ri}${ci}`} className={on?'d1':'d0'} x={ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`u${ri}${ci}`} className={on?'d1':'d0'} x={52+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`l${ri}${ci}`} className={on?'d1':'d0'} x={100+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,1],[0,0,0,1],[0,0,0,1],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`s${ri}${ci}`} className={on?'d1':'d0'} x={148+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    {[[1,1,1,1],[1,0,0,0],[1,1,1,0],[1,0,0,0],[1,0,0,0],[1,1,1,1]].map((r,ri)=>r.map((on,ci)=><rect key={`e${ri}${ci}`} className={on?'d1':'d0'} x={196+ci*11} y={ri*11} width="8" height="8" rx="1.5"/>))}
    <line x1="248" y1="33" x2="258" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.4"/>
    <polyline points="258,33 264,12 268,54 274,20 278,33" fill="none" stroke="#c8963e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <line x1="278" y1="33" x2="296" y2="33" stroke="#c8963e" strokeWidth="1.5" opacity="0.4"/>
    <circle cx="296" cy="33" r="2.5" fill="#c8963e"/>
  </svg>
)

function getGreeting() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 21) return 'Good evening'
  if (hour >= 21 && hour < 24) return 'Burning the midnight oil,'
  return 'Up before the sun,'
}
function initials(name = '') {
  return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'FL'
}

// ─── Profile dropdown ──────────────────────────────────────────────────────────
function ProfileDropdown({ name, email, onLogout }) {
  const [open, setOpen]           = useState(false)
  const [subView, setSubView]     = useState(null) // null | 'profile'
  const ref                       = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setSubView(null)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function close() { setOpen(false); setSubView(null) }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Avatar button */}
      <button
        onClick={() => { setOpen(p => !p); setSubView(null) }}
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
        }}
      >
        {initials(name)}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          minWidth: 192,
          background: 'var(--bg-panel, #1e2028)',
          border: '1px solid var(--border, #2e3040)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.32)',
          overflow: 'hidden',
          zIndex: 200,
          animation: 'fadeIn 0.15s ease',
        }}>
          {subView === null ? (
            /* ── Main menu ── */
            <>
              <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{email}</div>
              </div>
              <DropItem icon="👤" label="Profile" onClick={() => setSubView('profile')} />
              <DropItem icon="⎋" label="Log Out" onClick={onLogout} danger />
            </>
          ) : (
            /* ── Profile sub-view ── */
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                <button
                  onClick={() => setSubView(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center' }}
                >
                  ←
                </button>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>profile</span>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: 'var(--accent, #c8963e)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 700, color: '#fff',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}>
                    {initials(name)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 3 }}>name</div>
                  <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'capitalize' }}>{name || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 3 }}>email</div>
                  <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>{email || '—'}</div>
                </div>
              </div>
              <div style={{ padding: '0 10px 10px' }}>
                <button
                  onClick={onLogout}
                  style={{
                    width: '100%', padding: '9px 14px', borderRadius: 6,
                    border: '1px solid rgba(224,92,106,0.3)',
                    background: 'rgba(224,92,106,0.08)',
                    fontSize: 12, fontWeight: 600, color: 'var(--red, #e05c6a)',
                    cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
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
        fontFamily: 'var(--font-mono, monospace)',
        textAlign: 'left', transition: 'background 0.12s, color 0.12s',
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  )
}

const TILES = [
  {
    id: 'inspection', label: 'New Inspection', desc: 'Start a property inspection',
    route: '/inspections/new',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="2" width="11" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M7 8h5M7 11h5M7 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="19" cy="19" r="4" fill="var(--accent, #c8963e)"/>
        <path d="M17.5 19h3M19 17.5v3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'properties', label: 'Properties', desc: 'Browse and manage units',
    route: '/properties',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 21V11l9-7 9 7v10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <rect x="9" y="15" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M12 15v6" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    id: 'rate', label: 'Explore Inventory', desc: 'View pricing and rates',
    route: '/inventory',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="5" width="20" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M12 9v6M9.5 10.5c0-1 1.1-1.5 2.5-1.5s2.5.5 2.5 1.5-1.1 1.5-2.5 1.5-2.5.5-2.5 1.5 1.1 1.5 2.5 1.5 2.5-.5 2.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'workorder', label: 'Work Order', desc: 'Raise a maintenance job',
    route: '/work-order',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M15 5a4 4 0 0 1-6 6L5 15a2.5 2.5 0 0 0 4 3l4-4a4 4 0 0 1 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="7" cy="17" r="1.2" fill="currentColor"/>
        <path d="M14 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'sops', label: 'Find SOPs', desc: 'Standard operating procedures',
    route: '/sops',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="2" width="13" height="18" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M8 7h6M8 10.5h6M8 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="18" cy="18" r="4" fill="var(--accent, #c8963e)"/>
        <path d="M16 18h4M18 16v4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const email = session?.user?.email ?? ''
  const name  = session?.user?.user_metadata?.full_name ?? email.split('@')[0].replace(/[._]/g, ' ')
  const date  = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <header style={s.header}>
        <div style={s.headerBrand}>
          <PulseLogo />
        </div>
        <div style={s.headerRight}>
          <ProfileDropdown name={name} email={email} onLogout={logout} />
        </div>
      </header>

      {/* ── Hero / Greeting ── */}
      <div style={s.hero}>
        <div style={s.heroInner}>
          <p style={s.heroDate}># {date}</p>
          <div style={s.heroPrompt}>
            <span style={s.heroChevron}>&gt;</span>
            <h1 style={s.heroTitle}>{getGreeting()}&nbsp;<span style={s.heroName}>{name}</span></h1>
          </div>
          <p style={s.heroSub}>what would you like to do today?</p>
        </div>
        {/* decorative grid lines */}
        <div style={s.heroGrid} aria-hidden="true" />
      </div>

      {/* ── Stats strip ── */}
      <div style={s.statsStrip}>
        {[{ n: '—', label: 'inspections' }, { n: '—', label: 'properties' }, { n: '—', label: 'open orders' }].map((stat, i) => (
          <div key={stat.label} style={{ ...s.statItem, borderRight: i < 2 ? '1px solid var(--border, #2e3040)' : 'none' }}>
            <div style={s.statNum}>{stat.n}</div>
            <div style={s.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tiles ── */}
      <main style={s.main}>
        <p style={s.sectionEyebrow}>Quick Actions</p>
        <div style={s.tileGrid}>
          {TILES.map((tile, idx) => (
            <button
              key={tile.id}
              className={`animate-fadeUp stagger-${idx + 1}`}
              onClick={() => navigate(tile.route)}
              style={{ ...s.tile, ...(idx === TILES.length - 1 && TILES.length % 2 !== 0 ? s.tileFullWidth : {}) }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--accent, #c8963e)'
                e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent, #c8963e), 0 8px 24px rgba(200,150,62,0.12)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border-dash, #3a3d52)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={s.tileIcon}>{tile.icon}</div>
              <div style={s.tileBody}>
                <div style={s.tileLabel}>{tile.label}</div>
                <div style={s.tileDesc}>{tile.desc}</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
                <path d="M5 2.5l4.5 4.5L5 11.5" stroke="var(--text, #e8e8f0)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          ))}
        </div>
      </main>

      {/* ── Flentfit footer ── */}
      <footer style={s.footer}>
        <div style={s.footerInner}>
          <p style={s.footerLabel}>HOW FLENTFIT WORKS</p>
          <p style={s.footerDesc}>
            Flentfit is Flent's property health scoring engine — it analyses every inspection item and generates a condition score for each trade and an overall property health score.
          </p>
          <button onClick={() => navigate('/flentfit')} style={s.footerLink}>
            Learn how Flentfit scores properties →
          </button>
        </div>
      </footer>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100svh',
    background: 'var(--bg, #16171f)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    color: 'var(--text, #e8e8f0)',
  },

  /* header */
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
  },
  headerBrand: { display: 'flex', alignItems: 'center', gap: 10 },
  logoMark: {
    width: 30, height: 30,
    background: 'var(--accent, #c8963e)',
    borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 800, color: '#fff',
    fontFamily: 'var(--font-mono, monospace)',
  },
  brandName: {
    fontSize: 16, fontWeight: 700,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '-0.3px',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },

  /* hero */
  hero: {
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    padding: '28px 20px 32px',
    position: 'relative',
    overflow: 'hidden',
  },
  heroInner: { position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto' },
  heroDate: {
    margin: '0 0 10px',
    fontSize: 11,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  heroPrompt: { display: 'flex', alignItems: 'baseline', gap: 10 },
  heroChevron: {
    fontSize: 22, fontWeight: 700,
    color: 'var(--accent, #c8963e)',
    fontFamily: 'var(--font-mono, monospace)',
    flexShrink: 0,
  },
  heroTitle: {
    margin: 0,
    fontSize: 24, fontWeight: 700,
    color: 'var(--text, #e8e8f0)',
    letterSpacing: '-0.5px',
    lineHeight: 1.2,
    fontFamily: 'var(--font-mono, monospace)',
  },
  heroName: { color: 'var(--accent, #c8963e)', textTransform: 'capitalize' },
  heroSub: {
    margin: '8px 0 0',
    fontSize: 13,
    color: 'var(--text-muted, #6b6d82)',
  },
  heroGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(var(--border, #2e3040) 1px, transparent 1px), linear-gradient(90deg, var(--border, #2e3040) 1px, transparent 1px)',
    backgroundSize: '32px 32px',
    opacity: 0.3,
    pointerEvents: 'none',
  },

  /* stats strip */
  statsStrip: {
    display: 'flex',
    borderBottom: '1px solid var(--border, #2e3040)',
    background: 'var(--bg-panel, #1e2028)',
  },
  statItem: {
    flex: 1, padding: '12px 0', textAlign: 'center',
  },
  statNum: {
    fontSize: 18, fontWeight: 700,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  statLabel: {
    fontSize: 10, color: 'var(--text-muted, #6b6d82)',
    marginTop: 2,
    fontFamily: 'var(--font-mono, monospace)',
    textTransform: 'lowercase',
  },

  /* tiles */
  main: {
    padding: '24px 20px 48px',
    maxWidth: 600,
    width: '100%',
    margin: '0 auto',
  },
  sectionEyebrow: {
    margin: '0 0 14px',
    fontSize: 11,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
  tileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 8,
  },
  tileFullWidth: {
    gridColumn: '1 / -1',
  },
  tile: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '18px 20px',
    background: 'var(--bg-panel, #1e2028)',
    border: '1px dashed var(--border-dash, #3a3d52)',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--text, #e8e8f0)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    WebkitTapHighlightColor: 'transparent',
    width: '100%',
    fontFamily: 'inherit',
  },
  tileIcon: {
    width: 44, height: 44,
    borderRadius: 8,
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--text-dim, #9394a8)',
  },
  tileBody: { flex: 1 },
  tileLabel: {
    fontSize: 14, fontWeight: 600,
    color: 'var(--text, #e8e8f0)',
    letterSpacing: '-0.2px',
  },
  tileDesc: {
    fontSize: 12,
    color: 'var(--text-muted, #6b6d82)',
    marginTop: 2,
  },

  /* flentfit footer */
  footer: {
    background: 'var(--bg, #16171f)',
    marginTop: 'auto',
  },
  footerInner: {
    padding: '24px 20px',
    maxWidth: 600,
    width: '100%',
    margin: '0 auto',
  },
  footerLabel: {
    fontSize: 9,
    fontWeight: 600,
    color: 'var(--accent, #c8963e)',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '0.14em',
    marginBottom: 8,
  },
  footerDesc: {
    fontSize: 11,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    lineHeight: 1.6,
    marginBottom: 10,
  },
  footerLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 11,
    color: 'var(--accent, #c8963e)',
    fontFamily: 'var(--font-mono, monospace)',
    cursor: 'pointer',
  },
}
