import { useNavigate } from 'react-router-dom'

const TILES = [
  {
    label: 'Register Inventory',
    desc: 'Log new purchases with invoice and line items',
    route: '/inventory/register',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="4" y="6" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M10 12h12M10 16h8M10 20h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="24" cy="24" r="6" fill="var(--accent, #c8963e)"/>
        <path d="M24 21v6M21 24h6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    accent: 'var(--accent, #c8963e)',
    bg: 'rgba(200,150,62,0.06)',
    border: 'rgba(200,150,62,0.22)',
  },
  {
    label: 'Public Rate Card',
    desc: 'View and edit client-facing pricing by trade',
    route: '/inventory/public-rc',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="4" y="4" width="24" height="24" rx="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M9 10h14M9 15h14M9 20h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    accent: '#3dba7a',
    bg: 'rgba(61,186,122,0.06)',
    border: 'rgba(61,186,122,0.22)',
  },
  {
    label: 'Internal Rate Card',
    desc: 'Auto-updated from inventory registry with FXIN codes',
    route: '/inventory/internal-rc',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="4" y="4" width="24" height="24" rx="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M11 11h10M11 16h7M11 21h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="24" cy="24" r="5" fill="var(--bg-panel, #1e2028)" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M22 24l1.5 1.5L26 22" stroke="var(--accent, #c8963e)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    accent: '#9b8af4',
    bg: 'rgba(155,138,244,0.06)',
    border: 'rgba(155,138,244,0.22)',
  },
  {
    label: 'Purchase History',
    desc: 'Browse past purchases with invoice links and item breakdown',
    route: '/inventory/history',
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M16 9v7l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    accent: '#5ba8e5',
    bg: 'rgba(91,168,229,0.06)',
    border: 'rgba(91,168,229,0.22)',
  },
]

export default function ExploreInventory() {
  const navigate = useNavigate()

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Explore Inventory</span>
          <span style={s.headerSub}>manage · track · price</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      <main style={s.main}>
        <p style={s.eyebrow}>// select_module</p>
        <h2 style={s.heading}>What would you like to do?</h2>

        <div style={s.grid}>
          {TILES.map(tile => (
            <button
              key={tile.route}
              style={{ ...s.tile, background: tile.bg, border: `1px solid ${tile.border}` }}
              onClick={() => navigate(tile.route)}
              onMouseEnter={e => { e.currentTarget.style.borderColor = tile.accent; e.currentTarget.style.boxShadow = `0 0 0 1px ${tile.accent}` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = tile.border; e.currentTarget.style.boxShadow = 'none' }}
            >
              <div style={{ color: tile.accent, marginBottom: 12 }}>{tile.icon}</div>
              <div style={{ ...s.tileLabel, color: tile.accent }}>{tile.label}</div>
              <div style={s.tileDesc}>{tile.desc}</div>
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ ...s.arrow, background: tile.accent }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3.5 2.5l5 3.5-5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  main: { flex: 1, padding: '28px 20px 48px', maxWidth: 600, width: '100%', margin: '0 auto' },
  eyebrow: { fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', margin: '0 0 4px' },
  heading: { fontSize: 22, fontWeight: 700, color: 'var(--text, #e8e8f0)', letterSpacing: '-0.5px', margin: '0 0 24px', lineHeight: 1.3 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 },
  tile: { display: 'flex', flexDirection: 'column', padding: '20px 18px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, box-shadow 0.15s', WebkitTapHighlightColor: 'transparent', minHeight: 160 },
  tileLabel: { fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', marginBottom: 6 },
  tileDesc: { fontSize: 11, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, flex: 1 },
  arrow: { width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' },
}
