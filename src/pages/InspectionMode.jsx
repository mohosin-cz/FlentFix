import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { NavBar, StickyFooter } from '../components/ui'
import QuickNotes from '../components/QuickNotes'

const MODES = [
  {
    value: 'outdoor',
    label: 'Outdoor',
    desc: 'Utility systems, electrical panels, security & perimeter',
    route: '/inspections/outdoor',
    color: 'var(--accent, #c8963e)',
    bg: 'rgba(200,150,62,0.06)',
    border: 'rgba(200,150,62,0.25)',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="23" stroke="#FF385C" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.3"/>
        {/* sun */}
        <circle cx="24" cy="16" r="5" stroke="#FF385C" strokeWidth="2"/>
        <path d="M24 8v2M24 30v2M16 16h-2M34 16h2M18.3 10.3l1.4 1.4M29.3 21.3l1.4 1.4M18.3 21.7l1.4-1.4M29.3 10.7l1.4-1.4" stroke="#FF385C" strokeWidth="2" strokeLinecap="round"/>
        {/* house outline */}
        <path d="M10 36V26l14-9 14 9v10" stroke="#FF385C" strokeWidth="2" strokeLinejoin="round"/>
        {/* ground */}
        <path d="M6 36h36" stroke="#FF385C" strokeWidth="2" strokeLinecap="round"/>
        {/* tree */}
        <path d="M38 36v-5M35 31h6M36 28h4" stroke="#FF385C" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    areas: ['Water Systems', 'Sump & Tanks', 'Electrical DB', 'Security / CCTV'],
  },
  {
    value: 'indoor',
    label: 'Indoor',
    desc: 'Living spaces, kitchen, bedrooms, bathrooms & utilities',
    route: '/inspections/indoor',
    color: 'var(--text-dim, #9394a8)',
    bg: 'var(--bg-input, #252731)',
    border: 'var(--border, #2e3040)',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="8" y="16" width="32" height="26" rx="3" stroke="#222" strokeWidth="2"/>
        {/* roof */}
        <path d="M4 18L24 4l20 14" stroke="#222" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {/* door */}
        <rect x="19" y="30" width="10" height="12" rx="1" stroke="#222" strokeWidth="1.8"/>
        <circle cx="27" cy="36" r="1" fill="#222"/>
        {/* window left */}
        <rect x="10" y="22" width="8" height="7" rx="1" stroke="#222" strokeWidth="1.6"/>
        <path d="M14 22v7M10 25.5h8" stroke="#222" strokeWidth="1.2"/>
        {/* window right */}
        <rect x="30" y="22" width="8" height="7" rx="1" stroke="#222" strokeWidth="1.6"/>
        <path d="M34 22v7M30 25.5h8" stroke="#222" strokeWidth="1.2"/>
      </svg>
    ),
    areas: ['Living Room', 'Kitchen', 'Bedrooms', 'Bathrooms'],
  },
]

export default function InspectionMode() {
  const navigate  = useNavigate()
  const { state } = useLocation()

  useEffect(() => {
    if (!state?.pid) navigate('/inspections/new', { replace: true })
  }, [])

  if (!state?.pid) return null

  function choose(mode) {
    navigate(mode.route, { state })
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <NavBar title="choose_mode" subtitle={`${state.pid} · ${state.layout}`} onBack={() => navigate(-1)} />

      {/* Progress */}
      <div style={{ height: 2, background: 'var(--border, #2e3040)' }}>
        <div style={{ height: '100%', background: 'var(--accent, #c8963e)', width: '50%', transition: 'width 0.3s' }} />
      </div>

      <div style={{ flex: 1, padding: '28px 20px 48px', maxWidth: 560, width: '100%', margin: '0 auto' }}>

        {/* heading */}
        <div style={{ marginBottom: 28 }} className="animate-fadeUp">
          <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>// select inspection scope</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text, #e8e8f0)', letterSpacing: '-0.5px', margin: '0 0 6px', lineHeight: 1.3 }}>
            Where would you like to start?
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', margin: 0 }}>
            You can complete both sections — choose which one to begin with.
          </p>
        </div>

        {/* mode cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MODES.map((mode, i) => (
            <button
              key={mode.value}
              className={`animate-fadeUp stagger-${i + 1}`}
              onClick={() => choose(mode)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 0,
                background: mode.bg,
                border: `1px dashed ${mode.border}`,
                borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                overflow: 'hidden',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                WebkitTapHighlightColor: 'transparent',
                color: 'var(--text, #e8e8f0)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent, #c8963e)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent, #c8963e)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = mode.border; e.currentTarget.style.boxShadow = 'none' }}
            >
              {/* icon area */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 24px 16px', lineHeight: 0, opacity: 0.8 }}>
                {mode.icon}
              </div>

              {/* text area */}
              <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: mode.color, fontFamily: 'var(--font-mono, monospace)' }}>{mode.label}</span>
                    <div style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: 'var(--accent, #c8963e)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3.5 2.5l5 3.5-5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, margin: 0 }}>{mode.desc}</p>
                </div>

                {/* area tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {mode.areas.map(a => (
                    <span key={a} style={{
                      fontSize: 10, fontWeight: 600, padding: '3px 8px',
                      background: 'var(--bg-input, #252731)',
                      border: '1px solid var(--border, #2e3040)',
                      color: 'var(--text-dim, #9394a8)',
                      borderRadius: 3,
                      fontFamily: 'var(--font-mono, monospace)',
                    }}>{a}</span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* tip */}
        <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1, color: 'var(--text-muted, #6b6d82)' }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 6v3.5M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, margin: 0, fontFamily: 'var(--font-mono, monospace)' }}>
            Both Outdoor and Indoor sections are required to complete the inspection. You can switch between them at any point.
          </p>
        </div>
      </div>
      <QuickNotes pid={state.pid} />
    </div>
  )
}
