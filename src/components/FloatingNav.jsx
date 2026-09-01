import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { icon: '⌂', label: 'Home',       path: '/' },
  { icon: '◎', label: 'Inspect',    path: '/inspections/new' },
  { icon: '▤', label: 'Properties', path: '/properties' },
  { icon: '⬡', label: 'Inventory',  path: '/inventory' },
]

// Reachable on phones only through the More sheet — the Home header nav that
// carries these is desktop-only.
const MORE_ITEMS = [
  { icon: '⚙', label: 'SOPs',              path: '/sops' },
  { icon: '⚡', label: 'Utilities',         path: '/utilities' },
  { icon: '₹', label: 'Rate card',         path: '/inventory/public-rc' },
  { icon: '⌂', label: 'Vendor management', path: '/vendors' },
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
  '/estimate/',
  '/appliance-report/',
  '/invoice/',
  '/tax-invoice/',
  '/e/',
  // Vendor-facing pages. Nobody reading these is staff: they arrive on a
  // tokenised link or a portal password, and the app nav offers them Home,
  // Inspect and Properties — five doors they cannot open, sitting on top of
  // the submit bar they came for. /attend only escaped it by covering the nav
  // with a fixed full-screen shell.
  '/wo/',
  '/db/',
  '/vi/',
  '/attend',
  '/onboard',
  '/rate-card',
  '/inventory/public-rc',
]

const HIDE_ON_SUFFIX = ['/estimates']

export default function FloatingNav() {
  const location = useLocation()
  const navigate = useNavigate()
  // the sheet is open only for the route it was opened on, so any navigation
  // (including back/forward) closes it without an effect syncing state
  const [openedAt, setOpenedAt] = useState(null)
  const moreOpen = openedAt === location.pathname
  const setMoreOpen = open => setOpenedAt(open ? location.pathname : null)

  useEffect(() => {
    if (!moreOpen) return
    const onKey = e => { if (e.key === 'Escape') setOpenedAt(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  if (HIDE_ON.some(r => location.pathname.startsWith(r))) return null
  if (HIDE_ON_SUFFIX.some(r => location.pathname.endsWith(r))) return null

  const matches = (path) => path === '/'
    ? location.pathname === '/'
    : location.pathname === path || location.pathname.startsWith(path + '/')

  const moreActive = MORE_ITEMS.some(i => matches(i.path))
  // a More route never also lights its parent tab (/inventory/public-rc)
  const isActive = (path) => !moreActive && matches(path)

  return (
    <>
      <style>{`
        @media (min-width: 641px) {
          .pulse-bottom-nav { display: none !important; }
        }
        @media (max-width: 640px) {
          .pulse-bottom-nav-spacer { display: block; }
        }
        @media print {
          .pulse-bottom-nav { display: none !important; }
          .pulse-bottom-nav-spacer { display: none !important; }
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

        <button
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          aria-label="More sections"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '3px', flex: 1, height: '56px', background: 'none', border: 'none',
            cursor: 'pointer', padding: 0, position: 'relative', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1, color: moreActive || moreOpen ? '#c8963e' : 'rgba(255,255,255,0.4)' }}>☰</span>
          <span style={{
            fontSize: '9px', letterSpacing: '0.04em', fontFamily: 'var(--font-sans)',
            color: moreActive || moreOpen ? '#c8963e' : 'rgba(255,255,255,0.3)',
            fontWeight: moreActive || moreOpen ? 600 : 400,
          }}>More</span>
          {moreActive && (
            <div style={{
              position: 'absolute', bottom: 'calc(4px + env(safe-area-inset-bottom))',
              width: '4px', height: '4px', borderRadius: '50%', background: '#c8963e',
            }} />
          )}
        </button>
      </div>

      {moreOpen && (
        <>
          <div
            className="pulse-bottom-nav"
            onClick={() => setMoreOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(8,9,13,0.6)', zIndex: 9998 }}
          />
          <nav
            className="pulse-bottom-nav"
            aria-label="More sections"
            style={{
              position: 'fixed',
              bottom: 'calc(56px + env(safe-area-inset-bottom))',
              left: 0, right: 0, zIndex: 9999,
              background: 'rgba(18, 19, 26, 0.98)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              padding: '6px 0',
            }}
          >
            {MORE_ITEMS.map(item => {
              const on = matches(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={on ? 'page' : undefined}
                  onClick={() => setMoreOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 22px', textDecoration: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    color: on ? '#c8963e' : 'rgba(255,255,255,0.72)',
                    fontFamily: 'var(--font-sans)', fontSize: 14,
                    fontWeight: on ? 600 : 400,
                  }}
                >
                  <span style={{ fontSize: 17, lineHeight: 1, width: 20, textAlign: 'center' }}>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </>
      )}
    </>
  )
}
