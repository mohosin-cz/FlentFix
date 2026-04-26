import { useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { icon: '⌂', label: 'Home',       path: '/' },
  { icon: '◎', label: 'Inspect',    path: '/inspections/new' },
  { icon: '▤', label: 'Properties', path: '/properties' },
  { icon: '⬡', label: 'Inventory',  path: '/inventory' },
  { icon: '☰', label: 'More',       path: '/sops' },
]

const HIDE_ON = [
  '/inspections/outdoor',
  '/inspections/indoor',
  '/inspections/appliances',
  '/inspections/mode',
  '/inspections/new',
  '/inspections/rooms',
  '/login',
  '/signup',
]

export default function FloatingNav() {
  const location = useLocation()
  const navigate = useNavigate()

  if (HIDE_ON.some(r => location.pathname.startsWith(r))) return null

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <>
      {/* Spacer pushes content above the fixed nav on mobile */}
      <div style={{ height: '100px', display: 'block' }} className="mobile-nav-spacer" />

      <style>{`
        @media (min-width: 641px) {
          .flentfix-floating-nav { display: none !important; }
          .mobile-nav-spacer { display: none !important; }
        }
      `}</style>
      <div
        className="flentfix-floating-nav"
        style={{
          position: 'fixed',
          bottom: 'calc(20px + env(safe-area-inset-bottom))',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '10px 16px',
          background: 'rgba(20, 21, 28, 0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '100px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset',
          zIndex: 9999,
          userSelect: 'none',
        }}
      >
        {NAV_ITEMS.map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              padding: '6px 14px',
              background: isActive(item.path) ? 'rgba(200, 150, 62, 0.2)' : 'transparent',
              border: 'none',
              borderRadius: '80px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              minWidth: '44px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: '16px',
              lineHeight: 1,
              color: isActive(item.path) ? '#c8963e' : 'rgba(255,255,255,0.5)',
              fontFamily: 'system-ui',
            }}>
              {item.icon}
            </span>
            <span style={{
              fontSize: '9px',
              letterSpacing: '0.04em',
              color: isActive(item.path) ? '#c8963e' : 'rgba(255,255,255,0.35)',
              fontFamily: 'var(--font-sans)',
              fontWeight: isActive(item.path) ? 600 : 400,
            }}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
