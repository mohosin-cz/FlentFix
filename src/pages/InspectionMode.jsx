import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { NavBar } from '../components/ui'
import QuickNotes from '../components/QuickNotes'
import { supabase } from '../lib/supabase'

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
        <circle cx="24" cy="16" r="5" stroke="#FF385C" strokeWidth="2"/>
        <path d="M24 8v2M24 30v2M16 16h-2M34 16h2M18.3 10.3l1.4 1.4M29.3 21.3l1.4 1.4M18.3 21.7l1.4-1.4M29.3 10.7l1.4-1.4" stroke="#FF385C" strokeWidth="2" strokeLinecap="round"/>
        <path d="M10 36V26l14-9 14 9v10" stroke="#FF385C" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M6 36h36" stroke="#FF385C" strokeWidth="2" strokeLinecap="round"/>
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
        <rect x="8" y="16" width="32" height="26" rx="3" stroke="#9394a8" strokeWidth="2"/>
        <path d="M4 18L24 4l20 14" stroke="#9394a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="19" y="30" width="10" height="12" rx="1" stroke="#9394a8" strokeWidth="1.8"/>
        <circle cx="27" cy="36" r="1" fill="#9394a8"/>
        <rect x="10" y="22" width="8" height="7" rx="1" stroke="#9394a8" strokeWidth="1.6"/>
        <path d="M14 22v7M10 25.5h8" stroke="#9394a8" strokeWidth="1.2"/>
        <rect x="30" y="22" width="8" height="7" rx="1" stroke="#9394a8" strokeWidth="1.6"/>
        <path d="M34 22v7M30 25.5h8" stroke="#9394a8" strokeWidth="1.2"/>
      </svg>
    ),
    areas: ['Living Room', 'Kitchen', 'Bedrooms', 'Bathrooms'],
  },
  {
    value: 'appliances',
    label: 'Appliances',
    desc: 'All home appliances & equipment',
    route: '/inspections/appliances',
    color: '#7c9ef8',
    bg: 'rgba(96,165,250,0.04)',
    border: 'rgba(96,165,250,0.2)',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="8" width="18" height="10" rx="2" stroke="#7c9ef8" strokeWidth="1.8"/>
        <path d="M8 13h10M8 15.5h6" stroke="#7c9ef8" strokeWidth="1.3" strokeLinecap="round"/>
        <rect x="26" y="6" width="16" height="26" rx="2" stroke="#7c9ef8" strokeWidth="1.8"/>
        <path d="M26 17h16" stroke="#7c9ef8" strokeWidth="1.3"/>
        <path d="M30 12v3M30 22v5" stroke="#7c9ef8" strokeWidth="1.3" strokeLinecap="round"/>
        <rect x="4" y="26" width="18" height="16" rx="2" stroke="#7c9ef8" strokeWidth="1.8"/>
        <circle cx="13" cy="34" r="5" stroke="#7c9ef8" strokeWidth="1.5"/>
        <circle cx="13" cy="34" r="2" stroke="#7c9ef8" strokeWidth="1.2"/>
        <path d="M38 36v4M38 40h4" stroke="#7c9ef8" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    areas: ['AC · Fridge', 'Geyser · Washer', 'Chimney · Hob', 'TV · Inverter'],
  },
]

function readDraftProgress(pid) {
  try {
    // Outdoor
    const oDraft = JSON.parse(localStorage.getItem(`flentfix_outdoor_draft_${pid}`) || 'null')
    let oDone = 0, oTotal = 0
    if (oDraft?.data) {
      Object.values(oDraft.data).forEach(sec => {
        Object.values(sec).forEach(card => {
          oTotal++
          if (card.health !== null || card.notAvailable) oDone++
        })
      })
      Object.values(oDraft.customItems || {}).forEach(items => {
        if (Array.isArray(items)) items.forEach(card => {
          oTotal++
          if (card.health !== null || card.notAvailable) oDone++
        })
      })
    }

    // Indoor
    const iDraft = JSON.parse(localStorage.getItem(`flentfix_indoor_draft_${pid}`) || 'null')
    let iDone = 0, iTotal = 0
    if (iDraft?.data) {
      Object.entries(iDraft.data).forEach(([key, val]) => {
        if (key === 'basics') {
          Object.values(val || {}).forEach(item => {
            iTotal++
            if (item?.enabled) iDone++
          })
        } else {
          Object.values(val || {}).forEach(section => {
            if (section && typeof section === 'object') {
              Object.values(section).forEach(card => {
                if (card && ('notAvailable' in card || 'selectedIssues' in card || 'health' in card)) {
                  iTotal++
                  if (card.notAvailable || (card.selectedIssues?.length > 0) || card.health !== null || card.acProvision === 'not_present') iDone++
                }
              })
            }
          })
        }
      })
      // custom items
      Object.values(iDraft.customItems || {}).forEach(items => {
        if (Array.isArray(items)) items.forEach(card => {
          iTotal++
          if (card.health !== null) iDone++
        })
      })
    }

    // Appliances
    const aDraft = JSON.parse(localStorage.getItem(`flentfix_appliances_draft_${pid}`) || 'null')
    let aDone = 0, aTotal = 0
    if (aDraft?.data) {
      Object.values(aDraft.data).forEach(d => {
        aTotal++
        if (d?.health !== null || d?.notPresent) aDone++
      })
    }
    ;(aDraft?.customAppliances || []).forEach(d => {
      aTotal++
      if (d?.health !== null || d?.notPresent) aDone++
    })

    return {
      outdoor:    { done: oDone, total: oTotal, started: !!oDraft },
      indoor:     { done: iDone, total: iTotal, started: !!iDraft },
      appliances: { done: aDone, total: aTotal, started: !!aDraft },
    }
  } catch {
    return {
      outdoor:    { done: 0, total: 0, started: false },
      indoor:     { done: 0, total: 0, started: false },
      appliances: { done: 0, total: 0, started: false },
    }
  }
}

function ProgressBadge({ done, total, started }) {
  if (!started) return (
    <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 3, padding: '2px 7px' }}>
      not started
    </span>
  )
  if (total === 0) return (
    <span style={{ fontSize: 10, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 3, padding: '2px 7px' }}>
      in progress
    </span>
  )
  const allDone = done >= total
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)',
      background: allDone ? 'rgba(61,186,122,0.1)' : 'rgba(200,150,62,0.08)',
      border: `1px solid ${allDone ? 'rgba(61,186,122,0.3)' : 'rgba(200,150,62,0.25)'}`,
      color: allDone ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)',
      borderRadius: 3, padding: '2px 7px',
    }}>
      {done}/{total} done
    </span>
  )
}

export default function InspectionMode() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const [showEndModal, setShowEndModal] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  useEffect(() => {
    if (!state?.pid) navigate('/inspections/new', { replace: true })
  }, [])

  if (!state?.pid) return null

  const progress = readDraftProgress(state.pid)

  function choose(mode) {
    navigate(mode.route, { state })
  }

  async function confirmEnd() {
    setIsEnding(true)
    try {
      const pid = state.pid
      const { data: existing } = await supabase
        .from('inspections')
        .select('id')
        .eq('pid', pid)
        .single()

      let inspectionId = existing?.id

      if (!inspectionId) {
        const { data: newInspection, error } = await supabase
          .from('inspections')
          .insert({
            pid,
            house_type: state.propertyType || state.inspectionType,
            inspection_date: new Date().toISOString().split('T')[0],
            status: 'completed',
            config: state,
          })
          .select()
          .single()
        if (error) throw error
        inspectionId = newInspection.id
      } else {
        await supabase
          .from('inspections')
          .update({ status: 'completed' })
          .eq('id', inspectionId)
      }

      // Read drafts (for future batch-save logic)
      // eslint-disable-next-line no-unused-vars
      const _outdoorDraft   = JSON.parse(localStorage.getItem(`flentfix_outdoor_draft_${pid}`)    || '{}')
      // eslint-disable-next-line no-unused-vars
      const _indoorDraft    = JSON.parse(localStorage.getItem(`flentfix_indoor_draft_${pid}`)     || '{}')
      // eslint-disable-next-line no-unused-vars
      const _appliancesDraft = JSON.parse(localStorage.getItem(`flentfix_appliances_draft_${pid}`) || '{}')

      await supabase
        .from('properties')
        .upsert(
          { pid, name: pid, type: state.propertyType || 'independent_home', address: '', landlord: '' },
          { onConflict: 'pid' }
        )

      setShowEndModal(false)
      navigate(`/properties/${pid}`)
    } catch (err) {
      console.error('End inspection error:', err)
      alert('Error saving inspection: ' + err.message)
    } finally {
      setIsEnding(false)
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <NavBar title="inspection_hub" subtitle={`${state.pid} · ${state.layout}`} onBack={() => navigate(-1)} />

      {/* Progress bar */}
      <div style={{ height: 2, background: 'var(--border, #2e3040)' }}>
        <div style={{ height: '100%', background: 'var(--accent, #c8963e)', width: '50%', transition: 'width 0.3s' }} />
      </div>

      <div style={{ flex: 1, padding: '28px 20px 100px', maxWidth: 560, width: '100%', margin: '0 auto' }}>

        {/* heading */}
        <div style={{ marginBottom: 28 }} className="animate-fadeUp">
          <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>// inspection_hub</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text, #e8e8f0)', letterSpacing: '-0.5px', margin: '0 0 6px', lineHeight: 1.3 }}>
            Inspection sections
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', margin: 0 }}>
            Switch freely between sections. End inspection when all sections are complete.
          </p>
        </div>

        {/* mode cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MODES.map((mode, i) => {
            const prog = progress[mode.value]
            return (
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 12px', lineHeight: 0, opacity: 0.85 }}>
                  {mode.icon}
                </div>

                {/* text area */}
                <div style={{ padding: '0 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: mode.color, fontFamily: 'var(--font-mono, monospace)' }}>{mode.label}</span>
                        <ProgressBadge {...prog} />
                      </div>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'var(--accent, #c8963e)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
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
            )
          })}
        </div>

        {/* tip */}
        <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1, color: 'var(--text-muted, #6b6d82)' }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 6v3.5M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, margin: 0, fontFamily: 'var(--font-mono, monospace)' }}>
            Complete each section and use "Create Estimate" within each section to save data. Then end the inspection.
          </p>
        </div>

        {/* End Inspection button */}
        <button
          onClick={() => setShowEndModal(true)}
          style={{
            marginTop: 24, width: '100%',
            padding: '14px 20px',
            background: 'rgba(200,150,62,0.1)',
            border: '1px solid rgba(200,150,62,0.4)',
            borderRadius: 10, cursor: 'pointer',
            fontSize: 14, fontWeight: 700,
            color: 'var(--accent, #c8963e)',
            fontFamily: 'var(--font-mono, monospace)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,150,62,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(200,150,62,0.1)' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 2l4 4-6 6H4v-4l6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          End Inspection
        </button>
      </div>

      <QuickNotes pid={state.pid} />

      {/* End Inspection confirmation modal */}
      {showEndModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
          onClick={() => setShowEndModal(false)}
        >
          <div
            style={{ width: '100%', maxWidth: 360, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, padding: '28px 24px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 2l9 18H2L11 2z" stroke="var(--accent, #c8963e)" strokeWidth="1.8" strokeLinejoin="round"/>
                <path d="M11 9v4M11 15.5v.5" stroke="var(--accent, #c8963e)" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 8, letterSpacing: '-0.3px' }}>
              End inspection?
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 24 }}>
              End inspection for <strong style={{ color: 'var(--text, #e8e8f0)' }}>{state.pid}</strong>? All captured data will be saved to the property record. Make sure you have created estimates from each section.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowEndModal(false)}
                style={{ flex: 1, padding: '11px 0', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmEnd}
                disabled={isEnding}
                style={{ flex: 1, padding: '11px 0', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: isEnding ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', opacity: isEnding ? 0.7 : 1 }}
              >
                {isEnding ? 'Saving…' : 'End Inspection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
