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

/* Milled into the header panel: the bar is the page background recessed into
   --bg-panel, items are plateaus cut from it. Palette is the app's own
   tokens — gold accent, --border hairlines — so it reads as part of Pulse. */
const CSS = `
.pnav {
  flex-wrap: wrap;
  gap: 0;
  align-items: center;
  margin-left: 24px;
  background: var(--bg, #16171f);
  border: 1px solid var(--border, #2e3040);
  border-radius: 10px;
  padding: 5px;
  box-shadow: inset 0 1px 0 rgba(0,0,0,.5),
              inset 0 -1px 0 rgba(255,255,255,.03);
}
.pnav-item {
  font: 500 12.5px/1 'Space Grotesk', 'Poppins', sans-serif;
  letter-spacing: .03em;
  /* light-on-dark renders heavy without this — 600 read as muddy at 12px */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: var(--text-dim, #9394a8);
  padding: 10px 14px;
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
  top: 28%;
  height: 44%;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--border, #2e3040), transparent);
}
.pnav-item:last-child::after { display: none; }
/* hover lifts the plateau out of the block */
.pnav-item:hover {
  color: var(--text, #e8e8f0);
  background: var(--bg-panel, #1e2028);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 2px 4px rgba(0,0,0,.45);
}
/* the press cuts a recess into the block */
.pnav-item:active {
  transform: translateY(1px);
  background: #121319;
  box-shadow: inset 0 3px 6px rgba(0,0,0,.75), inset 0 -1px 0 rgba(255,255,255,.04);
}
/* active route stays recessed with a lit gold floor */
.pnav-item[aria-current="page"] {
  font-weight: 600;
  color: var(--accent, #c8963e);
  background: var(--bg-input, #252731);
  box-shadow: inset 0 2px 5px rgba(0,0,0,.65), inset 0 -2px 0 var(--accent, #c8963e);
}
.pnav-item:focus-visible {
  outline: 2px solid var(--accent, #c8963e);
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
