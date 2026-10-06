import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NavBar, StepBar, Field, Input, CardToggle, PillGroup, StickyFooter, BtnPrimary } from '../components/ui'
import { pidStatus, pidStatusMessage, purgeBinnedPid } from '../utils/pidStatus'

const INSPECTION_TYPES = [
  { value: 'exploratory', label: 'Exploratory',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#717171" strokeWidth="1.8"/><path d="M20 20l-3-3" stroke="#717171" strokeWidth="2" strokeLinecap="round"/></svg> },
  { value: 't5', label: 'T-5',
    icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" stroke="#717171" strokeWidth="1.8"/><path d="M9 12h6M9 16h4" stroke="#717171" strokeWidth="1.6" strokeLinecap="round"/></svg> },
]

const PROPERTY_TYPES = [
  { value: 'apartment', label: 'Apartment',
    icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3" y="6" width="22" height="18" rx="2" stroke="#717171" strokeWidth="1.6"/><path d="M3 12h22" stroke="#717171" strokeWidth="1.4"/><rect x="8" y="16" width="4" height="5" rx="0.8" fill="#DDDDDD"/><rect x="16" y="16" width="4" height="5" rx="0.8" fill="#DDDDDD"/><path d="M14 3v3" stroke="#717171" strokeWidth="1.6" strokeLinecap="round"/></svg> },
  { value: 'independent_home', label: 'Independent Home',
    icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M3 24V12L14 3l11 9v12" stroke="#717171" strokeWidth="1.6" strokeLinejoin="round"/><rect x="10" y="16" width="8" height="8" rx="1" fill="#DDDDDD"/><path d="M14 16v8" stroke="#717171" strokeWidth="1.4"/></svg> },
  { value: 'enterprise', label: 'Enterprise',
    icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="2" y="4" width="10" height="20" rx="1.5" stroke="#717171" strokeWidth="1.6"/><rect x="16" y="10" width="10" height="14" rx="1.5" stroke="#717171" strokeWidth="1.6"/><path d="M5 10h4M5 15h4M5 20h4M19 16h4M19 20h4" stroke="#DDDDDD" strokeWidth="1.4" strokeLinecap="round"/></svg> },
]

const LAYOUTS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK']

function roomsForLayout(layout) {
  const n = parseInt(layout)
  const beds  = Array.from({ length: n }, (_, i) => n > 1 ? `Bedroom ${i + 1}` : 'Bedroom')
  const baths = Array.from({ length: Math.max(1, n - 1) }, (_, i) => n > 2 ? `Bathroom ${i + 1}` : 'Bathroom')
  return ['Living Room', 'Kitchen', ...beds, ...baths]
}

export default function NewInspection() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const step     = parseInt(searchParams.get('step') || '1')
  const goToStep = (n) => setSearchParams({ step: n })
  const [pid,            setPid]            = useState('')
  const [inspectionType, setInspectionType] = useState('')
  const [propertyType,   setPropertyType]   = useState('')
  const [layout,         setLayout]         = useState('')
  const [errors,         setErrors]         = useState({})
  // What is holding the PID, when something is. Kept apart from `errors`
  // because a PID in the bin is not a mistake to correct — it is a decision to
  // make, and the screen has to offer both halves of it.
  const [held,           setHeld]           = useState(null)
  const [checking,       setChecking]       = useState(false)
  const [purging,        setPurging]        = useState(false)

  const rooms = layout ? roomsForLayout(layout) : []

  function validate() {
    const e = {}
    if (!pid.trim())     e.pid            = 'Property ID is required'
    if (!inspectionType) e.inspectionType = 'Please select an inspection type'
    if (!propertyType)   e.propertyType   = 'Please select a property type'
    if (!layout)         e.layout         = 'Please select a layout'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // Erase the binned property so this PID starts clean. Same three deletes the
  // bin's own "delete permanently" performs, and asked for in those words.
  async function purgeHeld() {
    if (!held || held.state !== 'binned') return
    const n = held.inspections?.length
    if (!window.confirm(
      `Permanently delete the binned property ${held.pid}${n ? ` and its ${n} inspection${n === 1 ? '' : 's'}` : ''}, ` +
      `so this PID starts fresh?\n\nThis cannot be undone. To keep the old record instead, continue without deleting — ` +
      `it comes back out of the bin as you inspect.`)) return
    setPurging(true)
    const { error } = await purgeBinnedPid(held.pid)
    setPurging(false)
    if (error) { setErrors(p => ({ ...p, pid: error })); return }
    setHeld(null)
  }

  async function handleContinue() {
    if (!validate()) return
    const trimmed = pid.trim()

    setChecking(true)
    const st = await pidStatus(trimmed)
    setChecking(false)

    // A PID sitting in the bin is free to use again — that is what deleting it
    // was for. It is said out loud first, because continuing takes that
    // property back out of the bin rather than starting an empty one.
    if (st.state === 'binned') {
      if (!held) { setHeld(st); return }
    } else if (st.state !== 'free') {
      setHeld(st)
      setErrors(p => ({ ...p, pid: pidStatusMessage(st) }))
      return
    } else {
      setHeld(null)
    }

    const state = { pid: trimmed, inspectionType, propertyType, layout, rooms }
    navigate('/inspections/mode', { state })
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <NavBar title="new_inspection" subtitle="basic details" onBack={() => navigate(-1)} />

      {/* Progress */}
      <div style={{ height: 2, background: 'var(--border, #2e3040)' }}>
        <div style={{ height: '100%', background: 'var(--accent, #c8963e)', width: '25%', transition: 'width 0.3s' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 28 }} className="animate-fadeUp">

          {/* PID */}
          <Field label="Property ID (PID)" error={errors.pid} hint="Unique identifier for this property">
            <Input
              value={pid}
              onChange={v => { setPid(v); setErrors(p => ({ ...p, pid: '' })); setHeld(null) }}
              placeholder="e.g. FLT-2024-001"
              error={errors.pid}
            />
            {/* A PID in the bin is the one held state with a way forward from
                here: reuse that record, or erase it and start clean. */}
            {held?.state === 'binned' && (
              <div style={{ marginTop: 10, padding: '11px 13px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <span style={{ fontSize: 12, color: 'var(--accent, #c8963e)', lineHeight: 1.55, fontFamily: 'var(--font-mono, monospace)' }}>
                  {pidStatusMessage(held)} Continuing brings it back out of the bin and inspects that same property.
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={purgeHeld} disabled={purging}
                    style={{ padding: '7px 11px', background: 'var(--bg-input, #252731)', border: '1px solid #f87171', borderRadius: 7, fontSize: 11.5, color: '#f87171', cursor: purging ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                    {purging ? 'Deleting…' : 'Delete the old one for good first'}
                  </button>
                  {held.inBin && <a href="/properties/bin" style={{ padding: '7px 11px', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 7, fontSize: 11.5, color: 'var(--text-dim, #9394a8)', textDecoration: 'none', fontFamily: 'var(--font-mono, monospace)' }}>Open the bin</a>}
                </div>
              </div>
            )}
          </Field>

          {/* Inspection Type */}
          <Field label="Inspection Type" error={errors.inspectionType}>
            <CardToggle
              options={INSPECTION_TYPES}
              value={inspectionType}
              onChange={v => { setInspectionType(v); setErrors(p => ({ ...p, inspectionType: '' })) }}
            />
          </Field>

          {/* Property Type */}
          <Field label="Property Type" error={errors.propertyType}>
            <CardToggle
              options={PROPERTY_TYPES}
              value={propertyType}
              onChange={v => { setPropertyType(v); setLayout(''); setErrors(p => ({ ...p, propertyType: '' })) }}
            />
          </Field>

          {/* Layout */}
          <Field label="Layout" error={errors.layout} hint="Select the number of bedrooms">
            <PillGroup
              options={LAYOUTS}
              value={layout}
              onChange={v => { setLayout(v); setErrors(p => ({ ...p, layout: '' })) }}
            />
          </Field>

          {/* Room preview */}
          {rooms.length > 0 && (
            <div style={{ border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 8, padding: '16px 18px', background: 'var(--bg-panel, #1e2028)' }} className="animate-scaleIn">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>areas to inspect</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{rooms.length} rooms</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {rooms.map(r => (
                  <span key={r} style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 3, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{r}</span>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      <StickyFooter left={
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>step 1 of 4</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>basic details</div>
        </div>
      }>
        <BtnPrimary onClick={handleContinue} disabled={checking || purging}>
          {checking ? 'Checking PID…' : held?.state === 'binned' ? 'Continue with it →' : 'Continue →'}
        </BtnPrimary>
      </StickyFooter>
    </div>
  )
}
