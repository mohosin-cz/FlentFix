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
      <style>{`
        @media (min-width: 641px) {
          .pulse-bottom-nav { display: none !important; }
        }
        @media (max-width: 640px) {
          .pulse-bottom-nav-spacer { display: block; }
        }
      `}</style>

      {/* Spacer pushes page content above nav */}
      <div
        className="pulse-bottom-nav-spacer"
        style={{ height: '65px', display: 'none', flexShrink: 0 }}
      />

      {/* Fixed bottom bar */}
      <div
        className="pulse-bottom-nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(56px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'rgba(18, 19, 26, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 9999,
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
              flex: 1,
              height: '56px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              position: 'relative',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: '18px',
              lineHeight: 1,
              color: isActive(item.path) ? '#c8963e' : 'rgba(255,255,255,0.4)',
            }}>
              {item.icon}
            </span>
            <span style={{
              fontSize: '9px',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-sans)',
              color: isActive(item.path) ? '#c8963e' : 'rgba(255,255,255,0.3)',
              fontWeight: isActive(item.path) ? 600 : 400,
            }}>
              {item.label}
            </span>
            {isActive(item.path) && (
              <div style={{
                position: 'absolute',
                bottom: 'calc(4px + env(safe-area-inset-bottom))',
                width: '4px',
                height: '4px',
                borderRadius: '50%',
                background: '#c8963e',
              }} />
            )}
          </button>
        ))}
      </div>
    </>
  )
}
