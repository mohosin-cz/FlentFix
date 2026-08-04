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

const CSS = `
.pnav {
  flex-wrap: wrap;
  gap: 0;
  align-items: center;
  margin-left: 28px;
  background: #14161B;
  border-radius: 12px;
  padding: 16px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05),
              inset 0 -2px 6px rgba(0,0,0,.6);
}
.pnav-item {
  font: 600 12.5px/1 'Space Grotesk', sans-serif;
  letter-spacing: .06em;
  color: #A8B0BE;
  padding: 13px 18px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  position: relative;
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color .16s, background .16s, box-shadow .12s, transform .1s;
}
/* hairline score between items — one light source, 180deg */
.pnav-item::after {
  content: "";
  position: absolute;
  right: 0;
  top: 26%;
  height: 48%;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,.09), transparent);
}
.pnav-item:last-child::after { display: none; }
.pnav-item:hover {
  color: #F0F4FA;
  background: rgba(29,33,40,.58);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.09), 0 2px 5px rgba(0,0,0,.45);
}
/* the press cuts a recess into the block */
.pnav-item:active {
  transform: translateY(1px);
  background: #101318;
  box-shadow: inset 0 3px 7px rgba(0,0,0,.8), inset 0 -1px 0 rgba(255,255,255,.05);
}
/* active route stays recessed with a lit floor */
.pnav-item[aria-current="page"] {
  color: #F0F4FA;
  background: #1B2028;
  box-shadow: inset 0 2px 6px rgba(0,0,0,.75), inset 0 -2px 0 #5FD3A6;
}
.pnav-item:focus-visible {
  outline: 2px solid #5FD3A6;
  outline-offset: -3px;
}
@media (prefers-reduced-motion: reduce) {
  .pnav-item { transition: color .16s, background .16s; }
  .pnav-item:active { transform: none; }
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
      <nav className="dash-nav pnav" aria-label="Primary" style={{ display: 'none' }}>
        {NAV_ITEMS.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className="pnav-item"
            aria-current={current === item.path ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
