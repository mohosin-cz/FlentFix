import { useNavigate } from 'react-router-dom'

const SOPS = [
  {
    id: 'setup',
    title: 'Property Setup SOP',
    subtitle: 'Full operating manual for every Flent setup day',
    status: 'Active',
    version: 'v2.0 · March 2026',
    route: '/sops/setup',
  },
]

export default function SOPs() {
  const navigate = useNavigate()

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button onClick={() => navigate('/')} style={s.back}>← back</button>
        <div style={s.eyebrow}>// sops</div>
        <h1 style={s.title}>Find SOPs</h1>
      </div>

      {/* SOP list */}
      <div style={s.list}>
        {SOPS.map(sop => (
          <button
            key={sop.id}
            onClick={() => navigate(sop.route)}
            style={s.card}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent, #c8963e)'
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent, #c8963e), 0 8px 24px rgba(200,150,62,0.10)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-dash, #3a3d52)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={s.cardIcon}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="2" width="12" height="17" rx="2" stroke="var(--accent, #c8963e)" strokeWidth="1.5"/>
                <path d="M6 7h6M6 10h6M6 13h4" stroke="var(--accent, #c8963e)" strokeWidth="1.4" strokeLinecap="round"/>
                <circle cx="17" cy="17" r="3.5" fill="var(--bg-panel, #1e2028)" stroke="var(--accent, #c8963e)" strokeWidth="1.2"/>
                <path d="M15.5 17h3M17 15.5v3" stroke="var(--accent, #c8963e)" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={s.cardBody}>
              <div style={s.cardTitle}>{sop.title}</div>
              <div style={s.cardSubtitle}>{sop.subtitle}</div>
              <div style={s.cardMeta}>
                <span style={s.statusBadge}>{sop.status}</span>
                <span style={s.version}>{sop.version}</span>
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, color: 'var(--accent, #c8963e)' }}>
              <path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: '100dvh',
    background: 'var(--bg, #16171f)',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    color: 'var(--text, #e8e8f0)',
  },
  header: {
    padding: '20px 20px 16px',
    paddingTop: 'calc(env(safe-area-inset-top) + 20px)',
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
  },
  back: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 12,
    display: 'block',
  },
  eyebrow: {
    fontSize: 10,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--text, #e8e8f0)',
    letterSpacing: '-0.3px',
    margin: 0,
  },
  list: {
    padding: '20px',
    maxWidth: 640,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  card: {
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
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: { flex: 1 },
  cardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text, #e8e8f0)',
    letterSpacing: '-0.2px',
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 12,
    color: 'var(--text-muted, #6b6d82)',
    marginBottom: 8,
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: '#38a169',
    background: 'rgba(56,161,105,0.12)',
    border: '1px solid rgba(56,161,105,0.25)',
    borderRadius: 4,
    padding: '2px 7px',
    fontFamily: 'var(--font-mono, monospace)',
  },
  version: {
    fontSize: 10,
    color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
}
