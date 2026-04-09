import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { StickyFooter, BtnPrimary } from '../components/ui'
import QuickNotes from '../components/QuickNotes'

const CONDITIONS = ['Good', 'Fair', 'Poor']

const CONDITION_STYLE = {
  Good: { bg: 'rgba(61,186,122,0.1)',  color: '#3dba7a', activeBg: '#3dba7a', activeColor: '#fff' },
  Fair: { bg: 'rgba(200,150,62,0.1)', color: '#c8963e', activeBg: '#c8963e', activeColor: '#fff' },
  Poor: { bg: 'rgba(224,92,106,0.1)', color: '#e05c6a', activeBg: '#e05c6a', activeColor: '#fff' },
}

function emptyRoom(name) {
  return { name, condition: '', notes: '' }
}

export default function InspectionRooms() {
  const navigate = useNavigate()
  const { state } = useLocation()

  // Redirect back if navigated directly without state
  if (!state?.rooms) {
    navigate('/inspections/new', { replace: true })
    return null
  }

  const { pid, inspectionType, propertyType, layout, rooms: roomNames } = state

  const [step,  setStep]  = useState(0)
  const [rooms, setRooms] = useState(roomNames.map(emptyRoom))

  const current   = rooms[step]
  const total     = rooms.length
  const progress  = ((step + 1) / total) * 100
  const isLast    = step === total - 1
  const canProceed = current.condition !== ''

  function updateCurrent(field, value) {
    setRooms(prev => prev.map((r, i) => i === step ? { ...r, [field]: value } : r))
  }

  function handleNext() {
    if (!canProceed) return
    if (isLast) {
      navigate('/inspections/summary', {
        state: { pid, inspectionType, propertyType, layout, rooms },
      })
    } else {
      setStep(s => s + 1)
    }
  }

  function handleBack() {
    if (step === 0) {
      navigate('/inspections/new', {
        state: { pid, inspectionType, propertyType, layout },
      })
    } else {
      setStep(s => s - 1)
    }
  }

  return (
    <div style={s.page}>

      {/* header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={handleBack}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>{current.name}</span>
          <span style={s.headerSub}>Room {step + 1} of {total}</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      {/* progress bar */}
      <div style={s.progressTrack}>
        <div style={{ ...s.progressFill, width: `${progress}%` }} />
      </div>

      {/* room stepper dots */}
      <div style={s.dots}>
        {rooms.map((r, i) => (
          <div
            key={i}
            style={{
              ...s.dot,
              ...(i === step ? s.dotActive : {}),
              ...(r.condition ? s.dotDone : {}),
            }}
          />
        ))}
      </div>

      <main style={s.main}>

        {/* room name card */}
        <div style={s.roomCard}>
          <div style={s.roomIcon}>{roomIcon(current.name)}</div>
          <div>
            <h2 style={s.roomName}>{current.name}</h2>
            <p style={s.roomMeta}>{layout} · {pid}</p>
          </div>
        </div>

        {/* condition */}
        <section style={s.section}>
          <label style={s.label}>Condition</label>
          <div style={s.conditionRow}>
            {CONDITIONS.map(c => {
              const active = current.condition === c
              const cs = CONDITION_STYLE[c]
              return (
                <button
                  key={c}
                  style={{
                    ...s.conditionBtn,
                    background: active ? cs.activeBg : cs.bg,
                    color:      active ? cs.activeColor : cs.color,
                    borderColor: active ? cs.activeBg : 'transparent',
                    fontWeight:  active ? 700 : 500,
                    transform:   active ? 'scale(1.04)' : 'scale(1)',
                  }}
                  onClick={() => updateCurrent('condition', c)}
                >
                  {conditionIcon(c)}
                  {c}
                </button>
              )
            })}
          </div>
        </section>

        {/* notes */}
        <section style={s.section}>
          <label style={s.label}>Notes <span style={s.optional}>(optional)</span></label>
          <textarea
            style={s.textarea}
            rows={4}
            placeholder={`Any observations about the ${current.name.toLowerCase()}…`}
            value={current.notes}
            onChange={e => updateCurrent('notes', e.target.value)}
          />
        </section>

      </main>

      <StickyFooter left={
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{current.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>room {step + 1} of {total}</div>
        </div>
      }>
        <BtnPrimary onClick={handleNext} disabled={!canProceed}>
          {isLast ? 'Review →' : 'Next →'}
        </BtnPrimary>
      </StickyFooter>
      <QuickNotes pid={pid} />
    </div>
  )
}

function roomIcon(name) {
  const n = name.toLowerCase()
  if (n.includes('living')) return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="2" y="10" width="24" height="14" rx="3" stroke="#6B7280" strokeWidth="1.8"/>
      <path d="M2 17h24M8 10V8a2 2 0 0 1 4 0v2M16 10V8a2 2 0 0 1 4 0v2" stroke="#6B7280" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
  if (n.includes('kitchen')) return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="3" y="4" width="22" height="20" rx="2.5" stroke="#6B7280" strokeWidth="1.8"/>
      <circle cx="10" cy="11" r="2.5" stroke="#6B7280" strokeWidth="1.6"/>
      <circle cx="18" cy="11" r="2.5" stroke="#6B7280" strokeWidth="1.6"/>
      <path d="M6 18h16" stroke="#6B7280" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
  if (n.includes('bath')) return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M4 14h20v4a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-4Z" stroke="#6B7280" strokeWidth="1.8"/>
      <path d="M8 14V7a2 2 0 0 1 4 0" stroke="#6B7280" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
  // bedroom
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="3" y="12" width="22" height="12" rx="2" stroke="#6B7280" strokeWidth="1.8"/>
      <path d="M3 18h22M8 12V9a5 5 0 0 1 12 0v3" stroke="#6B7280" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

function conditionIcon(c) {
  if (c === 'Good') return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  if (c === 'Fair') return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M4 8h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
}

const s = {
  page: {
    minHeight: '100svh',
    background: 'var(--bg, #16171f)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    color: 'var(--text, #e8e8f0)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: 56,
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  backBtn: {
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer',
  },
  headerCenter: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
  },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub:   { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },

  progressTrack: {
    height: 2,
    background: 'var(--border, #2e3040)',
    width: '100%',
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent, #c8963e)',
    transition: 'width 0.3s ease',
  },

  dots: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '14px 20px 0',
  },
  dot: {
    width: 5, height: 5,
    borderRadius: '50%',
    background: 'var(--border-dash, #3a3d52)',
    transition: 'all 0.2s',
  },
  dotActive: { width: 16, borderRadius: 2, background: 'var(--accent, #c8963e)' },
  dotDone:   { background: 'var(--green, #3dba7a)' },

  main: {
    flex: 1,
    padding: '20px 20px 48px',
    maxWidth: 560, width: '100%', margin: '0 auto',
    display: 'flex', flexDirection: 'column', gap: 20,
    animation: 'fadeIn 0.25s ease',
  },

  roomCard: {
    display: 'flex', alignItems: 'center', gap: 16,
    background: 'var(--bg-panel, #1e2028)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 10,
    padding: '18px',
  },
  roomIcon: {
    width: 48, height: 48, borderRadius: 8,
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  roomName: { margin: '0 0 3px', fontSize: 16, fontWeight: 700, color: 'var(--text, #e8e8f0)', letterSpacing: '-0.2px', fontFamily: 'var(--font-mono, monospace)' },
  roomMeta: { margin: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },

  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' },
  optional: { fontWeight: 400, color: 'var(--text-muted, #6b6d82)', textTransform: 'none' },

  conditionRow: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 },
  conditionBtn: {
    fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontSize: 12, padding: '10px 8px',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 6, cursor: 'pointer',
    transition: 'all 0.15s',
    background: 'var(--bg-input, #252731)',
    color: 'var(--text-dim, #9394a8)',
  },

  textarea: {
    fontFamily: 'inherit', fontSize: 13,
    padding: '11px 14px',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 6,
    background: 'var(--bg-input, #252731)',
    color: 'var(--text, #e8e8f0)',
    resize: 'vertical',
    outline: 'none', width: '100%',
    lineHeight: 1.6,
  },

  nextBtn: {
    fontFamily: 'var(--font-mono, monospace)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    fontSize: 13, fontWeight: 600, padding: '11px 20px',
    background: 'var(--accent, #c8963e)', color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer',
    transition: 'background 0.15s', letterSpacing: '0.02em',
  },
}
