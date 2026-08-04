import { Link, useLocation } from 'react-router-dom'

// Header nav for Home. Desktop only — the `.dash-nav` media rules in Dashboard
// govern display; on phones FloatingNav carries these routes instead.
const NAV_ITEMS = [
  { label: 'Inspect',           path: '/inspections/new' },
  { label: 'Properties',        path: '/properties' },
  { label: 'Utilities',         path: '/utilities' },
  { label: 'Inventory',         path: '/inventory' },
  { label: 'Rate card',         path: '/inventory/public-rc' },
  { label: 'SOPs',              path: '/sops' },
  { label: 'Vendor management', path: '/vendors' },
]

/* Depth, type and the gold active floor all come from .tct in theme.css — this
   only adds the header row's own layout. No container by design: a bordered bar
   read as an object pasted onto the header, so the items sit directly on
   --bg-panel like the logo and avatar do. */
const CSS = `
.pnav {
  flex-wrap: wrap;
  gap: 0;
  align-items: center;
  margin-left: 20px;
}
.pnav-item {
  font-size: 12.5px;
  line-height: 1;
  padding: 12px 18px;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
`

// Longest prefix wins, so /inventory/public-rc marks "Rate card" and not
// "Inventory" — aria-current must land on exactly one item.
function activePath(pathname) {
  return NAV_ITEMS
    .map(i => i.path)
    .filter(p => pathname === p || pathname.startsWith(p + '/'))
    .sort((a, b) => b.length - a.length)[0] || null
}

export default function DashNav() {
  const { pathname } = useLocation()
  const current = activePath(pathname)

  return (
    <>
      <style>{CSS}</style>
      <nav className="dash-nav pnav tct-scored" aria-label="Primary" style={{ display: 'none' }}>
        {NAV_ITEMS.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className="tct tct-bare pnav-item"
            aria-current={current === item.path ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
