import { useNavigate, useLocation } from 'react-router-dom'

const HIDE_ROUTES = [
  '/inspections/outdoor',
  '/inspections/indoor',
  '/inspections/appliances',
  '/inspections/appliance-report',
  '/inspections/mode',
  '/inspections/new',
]

const NAV_ITEMS = [
  {
    label: 'Home',
    path: '/',
    exact: true,
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M2 9l8-7 8 7v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9z" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinejoin="round"/>
        <path d="M7 19v-7h6v7" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: 'Inspect',
    path: '/inspections',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth={active ? 2 : 1.6}/>
        <path d="M13.5 13.5l3.5 3.5" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Properties',
    path: '/properties',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="7" width="16" height="11" rx="1.5" stroke="currentColor" strokeWidth={active ? 2 : 1.6}/>
        <path d="M1 8l9-6 9 6" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="7" y="13" width="6" height="5" rx="1" stroke="currentColor" strokeWidth={active ? 1.8 : 1.4}/>
      </svg>
    ),
  },
  {
    label: 'Inventory',
    path: '/inventory',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="3" width="16" height="14" rx="1.5" stroke="currentColor" strokeWidth={active ? 2 : 1.6}/>
        <path d="M2 7h16" stroke="currentColor" strokeWidth={active ? 2 : 1.6}/>
        <path d="M6 11h8M6 14h5" stroke="currentColor" strokeWidth={active ? 1.8 : 1.4} strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'SOPs',
    path: '/sops',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="4" y="2" width="12" height="16" rx="1.5" stroke="currentColor" strokeWidth={active ? 2 : 1.6}/>
        <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth={active ? 1.8 : 1.4} strokeLinecap="round"/>
      </svg>
    ),
  },
]

export default function FloatingNav() {
  const navigate  = useNavigate()
  const location  = useLocation()

  if (HIDE_ROUTES.some(r => location.pathname.startsWith(r))) return null

  function isActive(item) {
    if (item.exact) return location.pathname === item.path
    return location.pathname.startsWith(item.path)
  }

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 60,
      background: 'var(--bg-panel, #1e2028)',
      borderTop: '1px solid var(--border, #2e3040)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 1000,
      // desktop: hidden
      visibility: 'visible',
    }} className="floating-nav">
      {NAV_ITEMS.map(item => {
        const active = isActive(item)
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '6px 10px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: active ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
              fontFamily: 'var(--font-sans, Poppins, sans-serif)',
              fontSize: 10, letterSpacing: '0.04em', fontWeight: active ? 600 : 400,
              minWidth: 48,
              WebkitTapHighlightColor: 'transparent',
              transition: 'color 0.15s',
            }}
          >
            {item.icon(active)}
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
