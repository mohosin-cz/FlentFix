import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import { advanceStage, STAGES, MAIN_SEQUENCE } from '../utils/propertyJourney'
import { logActivity } from '../utils/activityUtils'
import LogoSpinner from '../components/LogoSpinner'

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function titleCase(str) {
  return (str || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function SectionLabel({ children }) {
  return (
    <p style={{ margin: '0 0 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {children}
    </p>
  )
}

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t) }, [])
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)',
      borderRadius: 8, padding: '10px 18px', fontSize: 13, color: 'var(--text-dim, #9394a8)',
      fontFamily: 'var(--font-mono, monospace)', zIndex: 300, whiteSpace: 'nowrap',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      {msg}
    </div>
  )
}

const TILES = [
  {
    key: 'estimate',
    title: 'Estimates',
    sub: 'Control center',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: 'var(--green, #3dba7a)',
    bg: 'rgba(61,186,122,0.08)',
    border: 'rgba(61,186,122,0.25)',
  },
  {
    key: 'appliance',
    title: 'Appliance Report',
    sub: 'All appliances',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="3" width="9" height="6" rx="1" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="13" y="3" width="9" height="13" rx="1" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="2" y="13" width="9" height="8" rx="1" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="6.5" cy="17" r="2" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
    color: '#7c9ef8',
    bg: 'rgba(124,158,248,0.08)',
    border: 'rgba(124,158,248,0.25)',
  },
  {
    key: 'workorder',
    title: 'Work Order',
    sub: 'Coming soon',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a1 1 0 0 0-1.4-1.4l-2.3 2.3-.9-.9a1 1 0 0 0-1.4 0z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M4 12h10M4 8h6M4 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: 'var(--text-muted, #6b6d82)',
    bg: 'var(--bg-input, #252731)',
    border: 'var(--border, #2e3040)',
    disabled: true,
  },
  {
    key: 'invoice',
    title: 'Landlord Invoice',
    sub: 'Generate invoice',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M8 17h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
  },
  {
    key: 'raw',
    title: 'Raw Inspection Data',
    sub: 'All line items',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 6h16M4 10h16M4 14h10M4 18h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    color: 'var(--accent, #c8963e)',
    bg: 'rgba(200,150,62,0.08)',
    border: 'rgba(200,150,62,0.25)',
  },
  {
    key: 'flentfit',
    title: 'FlentFit Report',
    sub: 'Coming soon',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
    color: 'var(--text-muted, #6b6d82)',
    bg: 'var(--bg-input, #252731)',
    border: 'var(--border, #2e3040)',
    disabled: true,
  },
]

function ChangePidModal({ pid, userEmail, onClose, onSuccess }) {
  const [screen, setScreen]           = useState('setup')
  const [newPid, setNewPid]           = useState('')
  const [pidInUse, setPidInUse]       = useState(false)
  const [checking, setChecking]       = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState(null)
  const timerRef = useRef(null)

  function onNewPidChange(val) {
    setNewPid(val)
    setPidInUse(false)
    const v = val.trim()
    if (!v || v === pid) { setChecking(false); return }
    setChecking(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const { data } = await supabase.from('properties').select('pid').eq('pid', v).maybeSingle()
      setPidInUse(!!data)
      setChecking(false)
    }, 400)
  }

  const cleanNew = newPid.trim()
  const sameAsCurrent = cleanNew === pid
  const canContinue = cleanNew && !sameAsCurrent && !pidInUse && !checking

  async function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const { data: estimates } = await supabase.from('estimates').select('id').eq('pid', pid)
      const { data: result, error: rpcErr } = await supabase.rpc('rename_pid', { old_pid: pid, new_pid: cleanNew })
      if (rpcErr) { setError(rpcErr.message); setSubmitting(false); return }
      if (estimates?.length) {
        await Promise.all(estimates.map(est =>
          logActivity(supabase, est.id, { action: 'pid_change', old_value: pid, new_value: cleanNew, changed_by: userEmail })
        ))
      }
      let summary
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        const parts = Object.entries(result).filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`)
        summary = parts.length ? `Renamed: ${parts.join(' · ')}` : `${pid} → ${cleanNew}`
      } else {
        summary = `${pid} → ${cleanNew}`
      }
      onSuccess(cleanNew, summary)
    } catch (e) {
      setError(e.message)
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: 500, background: 'var(--bg-panel, #1e2028)', borderTop: '1px solid var(--border, #2e3040)', borderRadius: '16px 16px 0 0', padding: '24px 24px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border, #2e3040)', margin: '-8px auto 8px' }} />

        {screen === 'setup' ? (
          <>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)', marginBottom: 6 }}>Change PID for {pid}?</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.7 }}>
                PID links this property's inspections, estimates, notes and history. Changing it renames the property everywhere, immediately. Landlord links keep working.{' '}
                <strong style={{ color: 'var(--text-dim, #9394a8)' }}>This cannot be undone from the app.</strong>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>New PID</label>
              <input
                type="text"
                value={newPid}
                onChange={e => onNewPidChange(e.target.value)}
                placeholder={pid}
                autoFocus
                style={{ background: 'var(--bg-input, #252731)', border: `1px solid ${pidInUse ? '#f87171' : 'var(--border, #2e3040)'}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                onFocus={e => { e.target.style.borderColor = pidInUse ? '#f87171' : 'var(--accent, #c8963e)' }}
                onBlur={e  => { e.target.style.borderColor = pidInUse ? '#f87171' : 'var(--border, #2e3040)' }}
              />
              {checking && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Checking…</span>}
              {!checking && pidInUse && <span style={{ fontSize: 11, color: '#f87171', fontFamily: 'var(--font-mono, monospace)' }}>PID already in use</span>}
              {!checking && !pidInUse && sameAsCurrent && cleanNew && <span style={{ fontSize: 11, color: '#f87171', fontFamily: 'var(--font-mono, monospace)' }}>Same as current PID</span>}
            </div>

            {error && <div style={{ fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono, monospace)', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '11px 0', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={() => { setError(null); setScreen('confirm') }}
                disabled={!canContinue}
                style={{ flex: 2, padding: '11px 0', background: canContinue ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: canContinue ? '#000' : 'var(--text-muted, #6b6d82)', cursor: canContinue ? 'pointer' : 'default' }}
              >
                Continue →
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)', marginBottom: 6 }}>Confirm rename</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.7 }}>
                Type <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent, #c8963e)', fontWeight: 600 }}>{cleanNew}</span> to confirm this change.
              </div>
            </div>

            <input
              type="text"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder={cleanNew}
              autoFocus
              style={{ background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
              onFocus={e => { e.target.style.borderColor = 'var(--accent, #c8963e)' }}
              onBlur={e  => { e.target.style.borderColor = 'var(--border, #2e3040)' }}
            />

            {error && <div style={{ fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono, monospace)', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => { setConfirmInput(''); setScreen('setup') }}
                disabled={submitting}
                style={{ flex: 1, padding: '11px 0', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim, #9394a8)', cursor: submitting ? 'default' : 'pointer' }}
              >
                ← Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirmInput !== cleanNew || submitting}
                style={{ flex: 2, padding: '11px 0', background: confirmInput === cleanNew && !submitting ? '#ef4444' : 'var(--bg-input, #252731)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: confirmInput === cleanNew && !submitting ? '#fff' : 'var(--text-muted, #6b6d82)', cursor: confirmInput === cleanNew && !submitting ? 'pointer' : 'default' }}
              >
                {submitting ? 'Renaming…' : 'Change PID'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function PropertyDetail() {
  const navigate = useNavigate()
  const { pid }  = useParams()
  const [inspections, setInspections] = useState([])
  const [loading, setLoading]         = useState(true)
  const [toast, setToast]             = useState('')
  const [stats, setStats]             = useState({ totalItems: 0, issues: 0, totalCost: 0 })
  const [showAllInspections, setShowAllInspections] = useState(false)
  const [quickNote, setQuickNote]     = useState(null)
  const [currentStage, setCurrentStage] = useState('T-5')
  const [journey, setJourney]           = useState([])
  const [userEmail, setUserEmail]       = useState(null)
  const [menuOpen, setMenuOpen]         = useState(false)
  const [pidModal, setPidModal]         = useState(false)
  const [feasibility, setFeasibility]   = useState([])
  const menuRef = useRef(null)

  const fetchData = useCallback(async () => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email || null))

    // Fetch inspections, stage, journey, and notes in parallel
    const [{ data: inspData }, { data: propData }, { data: journeyData }] = await Promise.all([
      supabase.from('inspections').select('*').eq('pid', pid).order('created_at', { ascending: false }),
      supabase.from('properties').select('stage').eq('pid', pid).maybeSingle(),
      supabase.from('property_journey').select('*').eq('pid', pid).order('changed_at', { ascending: true }),
    ])

    setInspections(inspData || [])
    setLoading(false)
    setJourney(journeyData || [])

    // Bug 2 fix: fall back to latest journey stage if properties.stage is null
    const latestJourneyStage = journeyData?.length ? journeyData[journeyData.length - 1]?.stage : null
    setCurrentStage(propData?.stage || latestJourneyStage || 'T-5')

    supabase.from('quick_notes').select('note, updated_at, created_by').eq('pid', pid).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('quick_notes fetch error:', error)
        setQuickNote(data || null)
      })

    if (!inspData?.length) return

    try {
      // Find the inspection that actually has line items (limit=1 avoids 503-prone HEAD queries)
      let activeInspection = null
      for (const insp of inspData) {
        const { data: probe } = await supabase
          .from('inspection_line_items')
          .select('id')
          .eq('inspection_id', insp.id)
          .limit(1)
        if (probe?.length > 0) { activeInspection = insp; break }
      }
      if (!activeInspection) activeInspection = inspData[0]

      // Fetch line items and feasibility rows in parallel
      const [{ data: lineItems }, { data: feasRows }] = await Promise.all([
        supabase.from('inspection_line_items')
          .select('id, inspection_id, material_cost, labour_cost, issue_description')
          .eq('inspection_id', activeInspection.id),
        supabase.from('inspection_line_items')
          .select('item_name, issue_description')
          .eq('inspection_id', activeInspection.id)
          .like('item_name', 'Feasibility: %'),
      ])

      const totalCost = (lineItems || []).reduce((s, r) => s + (parseFloat(r.material_cost) || 0) + (parseFloat(r.labour_cost) || 0), 0)
      const issues = (lineItems || []).filter(r => {
        const d = (r.issue_description || '').toLowerCase()
        return !d.includes('functional') && !d.includes('no issues') && !d.includes('no issue')
      }).length
      setStats({ totalCost, issues, totalItems: (lineItems || []).length })
      setFeasibility(feasRows || [])
    } catch (e) {
      console.error('[PropertyDetail] stats fetch degraded:', e.message)
    }
  }, [pid])

  const { pullDistance, isRefreshing } = usePullToRefresh(fetchData)

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!menuOpen) return
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const latest    = inspections[0]
  const houseType = latest?.house_type || ''
  const address   = latest?.config?.address || ''
  const latestId  = latest?.id

  async function handleManualAdvance(stageName) {
    await advanceStage(supabase, pid, stageName, userEmail)
    supabase.from('properties').select('stage').eq('pid', pid).maybeSingle()
      .then(({ data }) => setCurrentStage(data?.stage || stageName))
    supabase.from('property_journey').select('*').eq('pid', pid).order('changed_at', { ascending: true })
      .then(({ data }) => setJourney(data || []))
  }

  async function handleTile(key) {
    if (key === 'estimate') {
      navigate(`/properties/${pid}/estimates`)
    } else if (key === 'appliance') {
      navigate('/inspections/appliance-report', { state: { inspectionId: latestId, pid } })
    } else if (key === 'invoice') {
      if (!latestId) { setToast('No inspection found for this property.'); return }
      navigate(`/invoice/${latestId}`)
    } else if (key === 'raw') {
      navigate(`/properties/${pid}/raw`)
    } else {
      setToast('Coming soon')
    }
  }

  const isRejected   = currentStage === 'estimate_rejected'
  const currentIndex = MAIN_SEQUENCE.findIndex(s => s.key === currentStage)
  const journeyEntry = journey.find(j => j.stage === MAIN_SEQUENCE[currentIndex]?.key)
  const isMobile     = typeof window !== 'undefined' && window.innerWidth <= 640

  function getStageActions() {
    switch (currentStage) {
      case 'estimate_shared':
        return [
          { label: '✓ Mark Approved', action: () => handleManualAdvance('estimate_approved'), color: '#4dd9c0', primary: true },
          { label: '✗ Mark Rejected', action: () => handleManualAdvance('estimate_rejected'), color: '#f87171' },
        ]
      case 'estimate_approved':
        return [{ label: '🔧 Plan Utility Work', action: () => handleManualAdvance('utility_planned'), color: 'var(--accent, #c8963e)' }]
      case 'utility_planned':
        return [{ label: '📅 Confirm Setup Date', action: () => handleManualAdvance('setup_date'), color: 'var(--accent, #c8963e)' }]
      case 'setup_date':
        return [{ label: '⚡ Mark T-Day', action: () => handleManualAdvance('tday'), color: 'var(--accent, #c8963e)' }]
      case 'tday':
        return [{ label: '🤝 Mark Handover Done', action: () => handleManualAdvance('handover'), color: 'var(--accent, #c8963e)' }]
      default: return []
    }
  }

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={s.page}>

      {/* Header */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/properties')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>PID {pid}</span>
          <span style={s.headerSub}>
            {houseType ? titleCase(houseType) : '—'}
            {latest ? ` · ${fmtDate(latest.inspection_date)}` : ''}
          </span>
        </div>
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(p => !p)}
            aria-label="More options"
            style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: menuOpen ? 'var(--bg-input, #252731)' : 'none', border: `1px solid ${menuOpen ? 'var(--border, #2e3040)' : 'transparent'}`, borderRadius: 8, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 18, letterSpacing: '0.05em' }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', top: 42, right: 0, minWidth: 160, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, zIndex: 20, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
              <button
                onClick={() => { setMenuOpen(false); setPidModal(true) }}
                style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-input, #252731)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                Change PID…
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Pipeline tracker ── */}
      {!loading && (isMobile ? (

        /* MOBILE: current-stage hero card */
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, #2e3040)', background: 'linear-gradient(180deg, #14161d 0%, #1a1c24 100%)' }}>

          {/* Hero card */}
          <div style={{ background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.2)', borderRadius: 12, padding: 16, marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 6 }}>
              STAGE {currentIndex + 1} OF {MAIN_SEQUENCE.length}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#c8963e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {MAIN_SEQUENCE[currentIndex]?.icon}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#c8963e' }}>
                  {MAIN_SEQUENCE[currentIndex]?.label}
                </div>
                {journeyEntry && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>
                    {new Date(journeyEntry.changed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {journeyEntry.changed_by ? ` · ${journeyEntry.changed_by.split('@')[0]}` : ''}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: 'var(--border, #2e3040)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 2, background: '#c8963e', width: `${((currentIndex + 1) / MAIN_SEQUENCE.length) * 100}%`, transition: 'width 0.4s ease' }} />
          </div>

          {/* Stage dots */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 12 }}>
            {MAIN_SEQUENCE.map((s, i) => (
              <div key={s.key} style={{ width: i === currentIndex ? 20 : 6, height: 6, borderRadius: 3, background: i <= currentIndex ? '#c8963e' : 'var(--border, #2e3040)', transition: 'all 0.3s ease', opacity: i > currentIndex ? 0.3 : 1 }} />
            ))}
          </div>

          {/* Prev / Next labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 12 }}>
            {currentIndex > 0 ? <span>← {MAIN_SEQUENCE[currentIndex - 1]?.label}</span> : <span />}
            {currentIndex < MAIN_SEQUENCE.length - 1 ? <span style={{ color: 'var(--border, #2e3040)' }}>{MAIN_SEQUENCE[currentIndex + 1]?.label} →</span> : <span />}
          </div>

          {/* Action buttons */}
          {getStageActions().length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {getStageActions().map(action => (
                <button key={action.label} onClick={action.action} style={{ width: '100%', padding: 12, background: action.primary ? action.color : 'none', border: `1px solid ${action.color}`, borderRadius: 8, color: action.primary ? '#000' : action.color, fontSize: 13, fontWeight: action.primary ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {isRejected && (
            <div style={{ marginTop: 10, padding: '5px 12px', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)', borderRadius: 6, fontSize: 11, color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              ✗ Estimate Rejected
              <button onClick={() => handleManualAdvance('estimate_created')} style={{ fontSize: 10, color: 'var(--accent, #c8963e)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Re-create estimate
              </button>
            </div>
          )}
        </div>

      ) : (

        /* DESKTOP: liquid-bar pipeline */
        <div style={{ background: 'linear-gradient(180deg, #14161d 0%, #1a1c24 100%)', borderBottom: '1px solid var(--border, #2e3040)', padding: '20px 24px 14px', overflowX: 'auto' }}>
          <div style={{ minWidth: 560, position: 'relative', paddingBottom: 32 }}>

            {/* Track shell */}
            <div style={{ position: 'absolute', top: 12, left: 14, right: 14, height: 8, borderRadius: 4, background: '#1c1e28', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${currentIndex <= 0 ? 0 : (currentIndex / (MAIN_SEQUENCE.length - 1)) * 100}%`, borderRadius: 4, background: 'linear-gradient(90deg, #7a4e18 0%, #c8963e 55%, #f0b860 100%)', boxShadow: '0 0 12px rgba(200,150,62,0.55), 0 0 4px rgba(200,150,62,0.9)', transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)', borderRadius: '4px 4px 0 0' }} />
                <div style={{ position: 'absolute', top: -4, bottom: -4, right: -6, width: 14, background: 'radial-gradient(ellipse at center, rgba(250,185,80,0.9) 0%, transparent 75%)' }} />
              </div>
            </div>

            {/* Stage nodes */}
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
              {MAIN_SEQUENCE.map((stage, i) => {
                const isDone    = i < currentIndex
                const isCurrent = i === currentIndex
                const isFuture  = i > currentIndex
                const isBlocked = isRejected && stage.key === 'estimate_approved'
                const entry     = journey.find(j => j.stage === stage.key)
                return (
                  <div key={stage.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div
                      onClick={() => isFuture && !isRejected && handleManualAdvance(stage.key)}
                      title={entry ? `${new Date(entry.changed_at).toLocaleDateString('en-IN')} · ${entry.changed_by}` : stage.label}
                      style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: isFuture && !isRejected ? 'pointer' : 'default', transition: 'all 0.25s', background: isBlocked ? '#1a1214' : isDone ? 'linear-gradient(135deg, #b07828, #e8a848)' : isCurrent ? '#1e2028' : '#1a1c24', border: isBlocked ? '2px solid #3a1a1a' : isDone ? '2px solid #c8963e' : isCurrent ? '2px solid var(--accent, #c8963e)' : '1.5px dashed #2c2e3a', boxShadow: isCurrent ? '0 0 0 4px rgba(200,150,62,0.18), 0 0 16px rgba(200,150,62,0.35)' : isDone ? '0 0 8px rgba(200,150,62,0.3)' : 'none', color: isBlocked ? '#3a2020' : isDone ? '#fff' : isCurrent ? 'var(--accent, #c8963e)' : '#383a48' }}
                    >
                      {isDone ? '✓' : stage.icon}
                    </div>
                    <div style={{ fontSize: 8, whiteSpace: 'nowrap', textAlign: 'center', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em', fontWeight: isCurrent ? 700 : 400, color: isBlocked ? '#3a2020' : isCurrent ? 'var(--accent, #c8963e)' : isDone ? '#7a7c92' : '#343646' }}>
                      {stage.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Summary line */}
          {MAIN_SEQUENCE[currentIndex] && (
            <div style={{ fontSize: 10, color: '#484a60', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.05em', marginTop: 2 }}>
              step {currentIndex + 1} of {MAIN_SEQUENCE.length} &middot; <span style={{ color: 'var(--accent, #c8963e)' }}>{MAIN_SEQUENCE[currentIndex].label}</span>
              {journeyEntry && ` · since ${new Date(journeyEntry.changed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
            </div>
          )}

          {isRejected && (
            <div style={{ marginTop: 8, padding: '5px 12px', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)', borderRadius: 6, fontSize: 11, color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              ✗ Estimate Rejected
              <button onClick={() => handleManualAdvance('estimate_created')} style={{ fontSize: 10, color: 'var(--accent, #c8963e)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                Re-create estimate
              </button>
            </div>
          )}
        </div>

      ))}

      <main style={s.main}>
        {loading ? (
          <LogoSpinner />
        ) : (
          <>
            {/* Summary stats — always render */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'Line Items', value: stats.totalItems },
                { label: 'Issues', value: stats.issues, color: stats.issues > 0 ? 'var(--red, #e05c6a)' : undefined },
                { label: 'Est. Cost', value: `₹${(stats.totalCost || 0).toLocaleString('en-IN')}`, color: stats.totalCost > 0 ? 'var(--accent, #c8963e)' : undefined },
              ].map(stat => (
                <div key={stat.label} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: stat.color || 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{stat.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Appliance feasibility compact card */}
            {feasibility.length > 0 && (() => {
              const FEAS_SHORT = { 'Washing Machine': 'WM', 'Refrigerator': 'Fridge', 'Air Conditioner': 'AC', 'Geyser': 'Geyser', 'Dryer': 'Dryer' }
              const feasIcon  = d => d === 'feasible' ? '✓' : d === 'not_feasible' ? '✗' : d === 'na' ? '—' : '?'
              const feasColor = d => d === 'feasible' ? '#4dd9c0' : d === 'not_feasible' ? '#f87171' : '#6b6d82'
              const singletons  = feasibility.filter(f => !f.item_name.includes('Exhaust Fan ·'))
              const exhaustRows = feasibility.filter(f => f.item_name.includes('Exhaust Fan ·'))
              function exhaustShort(name) {
                const loc = name.replace('Exhaust Fan · ', '')
                const m = loc.match(/Bedroom (\d+) Bathroom/)
                if (m) return `B${m[1]}`
                if (loc === 'Common Bathroom') return 'Common'
                return loc
              }
              return (
                <div style={{ marginBottom: 20, padding: '10px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 7, letterSpacing: '0.08em' }}>APPLIANCES</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {singletons.map(f => {
                      const name = f.item_name.replace('Feasibility: ', '')
                      const short = FEAS_SHORT[name] || name
                      const icon  = feasIcon(f.issue_description)
                      const color = feasColor(f.issue_description)
                      return (
                        <span key={name} style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color }}>
                          {short} <span style={{ fontWeight: 700 }}>{icon}</span>
                        </span>
                      )
                    })}
                    {exhaustRows.length > 0 && (
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-muted, #6b6d82)' }}>
                        Exhaust:{' '}
                        {exhaustRows.map((f, i) => {
                          const name = f.item_name.replace('Feasibility: ', '')
                          const short = exhaustShort(name)
                          const icon  = feasIcon(f.issue_description)
                          const color = feasColor(f.issue_description)
                          return (
                            <span key={name} style={{ color }}>
                              {i > 0 && <span style={{ color: 'var(--text-muted, #6b6d82)' }}> · </span>}
                              {short} <span style={{ fontWeight: 700 }}>{icon}</span>
                            </span>
                          )
                        })}
                      </span>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Action tiles — 2x3 grid */}
            <SectionLabel>Actions</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {TILES.map(tile => (
                <button
                  key={tile.key}
                  onClick={() => handleTile(tile.key)}
                  disabled={tile.disabled}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 12,
                    padding: '16px',
                    background: tile.bg,
                    border: `1px solid ${tile.border}`,
                    borderRadius: 10,
                    cursor: tile.disabled ? 'default' : 'pointer',
                    textAlign: 'left',
                    opacity: tile.disabled ? 0.6 : 1,
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    WebkitTapHighlightColor: 'transparent',
                    color: 'var(--text, #e8e8f0)',
                    minHeight: 100,
                  }}
                  onMouseEnter={e => { if (!tile.disabled) { e.currentTarget.style.borderColor = tile.color; e.currentTarget.style.boxShadow = `0 0 0 1px ${tile.color}` } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = tile.border; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{ color: tile.color, lineHeight: 0, opacity: 0.85 }}>{tile.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tile.color, fontFamily: 'var(--font-mono, monospace)', marginBottom: 3 }}>{tile.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{tile.sub}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Stage action buttons — desktop only (mobile shows in pipeline card) */}
            {!isMobile && getStageActions().length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                {getStageActions().map(action => (
                  <button key={action.label} onClick={action.action} style={{ padding: '8px 16px', background: action.primary ? action.color : 'none', border: `1px solid ${action.color}`, borderRadius: 6, color: action.primary ? '#000' : action.color, fontSize: 12, fontWeight: action.primary ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Quick Note */}
            <div style={{ margin: '16px 0' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', marginBottom: 8 }}>
                Notes
              </div>
              {quickNote?.note ? (
                <div style={{ padding: 16, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderLeft: '3px solid var(--accent, #c8963e)', borderRadius: 10 }}>
                  <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {quickNote.note}
                  </div>
                  {quickNote.updated_at && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 8 }}>
                      {new Date(quickNote.updated_at).toLocaleDateString('en-IN')}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '12px 16px', border: '1px dashed rgba(200,150,62,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
                  No notes yet — add one during inspection using the ✏ button
                </div>
              )}
            </div>

            {/* Setup log */}
            {journey.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', marginBottom: 10 }}>Setup Log</div>
                <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden' }}>
                  {[...journey].reverse().map(entry => {
                    const stageLabel = STAGES.find(s => s.key === entry.stage)?.label || entry.stage
                    const isApproved = entry.stage === 'estimate_approved'
                    const isReject   = entry.stage === 'estimate_rejected'
                    return (
                      <div key={entry.id} style={{ display: 'flex', gap: 12, padding: '8px 14px', borderBottom: '1px solid var(--border, #2e3040)', fontSize: 12, alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, minWidth: 72, flexShrink: 0 }}>
                          {new Date(entry.changed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        <span style={{ color: isReject ? '#f87171' : isApproved ? '#4dd9c0' : 'var(--text, #e8e8f0)', flex: 1 }}>
                          {stageLabel}
                        </span>
                        <span style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 11 }}>
                          {entry.changed_by?.split('@')[0] || 'system'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Inspection History — production has one record per inspection date per PID; multiple records here are test data for PID 123 */}
            {inspections.length > 0 && (() => {
              const visible = showAllInspections ? inspections : inspections.slice(0, 1)
              return (
                <>
                  <div style={{ marginTop: 28 }}><SectionLabel>Inspection History</SectionLabel></div>
                  <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden' }}>
                    {visible.map((ins, i) => (
                      <div key={ins.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: i < visible.length - 1 ? '1px solid var(--border, #2e3040)' : 'none' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDate(ins.inspection_date)}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            {ins.house_type && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{ins.house_type}</span>}
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                              fontFamily: 'var(--font-mono, monospace)',
                              background: ins.status === 'completed' ? 'rgba(61,186,122,0.1)' : ins.status === 'estimate_generated' ? 'rgba(61,186,122,0.1)' : 'var(--bg-input, #252731)',
                              border: `1px solid ${ins.status === 'completed' || ins.status === 'estimate_generated' ? 'rgba(61,186,122,0.3)' : 'var(--border, #2e3040)'}`,
                              color: ins.status === 'completed' || ins.status === 'estimate_generated' ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)',
                            }}>
                              {ins.status || 'draft'}
                            </span>
                          </div>
                        </div>
                        {ins.status === 'estimate_generated' && (
                          <button
                            onClick={() => navigate(`/estimate/${ins.id}`)}
                            style={{ fontSize: 11, fontWeight: 600, color: 'var(--green, #3dba7a)', background: 'rgba(61,186,122,0.08)', border: '1px solid rgba(61,186,122,0.25)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}
                          >
                            view estimate →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {inspections.length > 1 && (
                    <button
                      onClick={() => setShowAllInspections(v => !v)}
                      style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}
                    >
                      {showAllInspections ? 'Show less ↑' : `View all ${inspections.length} inspections for this PID →`}
                    </button>
                  )}
                </>
              )
            })()}
          </>
        )}
      </main>

      {pidModal && (
        <ChangePidModal
          pid={pid}
          userEmail={userEmail}
          onClose={() => setPidModal(false)}
          onSuccess={(newPid, summary) => {
            setPidModal(false)
            setToast(summary)
            navigate(`/properties/${newPid}`)
          }}
        />
      )}

      {toast && <Toast msg={toast} onClose={() => setToast('')} />}

    </div>
    </>
  )
}

const s = {
  page: {
    minHeight: '100svh',
    background: 'var(--bg, #16171f)',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-sans, Poppins, sans-serif)',
    color: 'var(--text, #e8e8f0)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 56,
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    position: 'sticky', top: 0, zIndex: 10,
  },
  backBtn: {
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 8,
    color: 'var(--text-dim, #9394a8)', cursor: 'pointer',
  },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  heroStrip: {
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    padding: '24px 20px 28px',
    position: 'relative', overflow: 'hidden',
  },
  heroInner: { position: 'relative', zIndex: 1 },
  heroPid: {
    fontSize: 34, fontWeight: 800,
    color: 'var(--text, #e8e8f0)',
    fontFamily: 'var(--font-mono, monospace)',
    letterSpacing: '-1px', lineHeight: 1.1,
    marginBottom: 10,
  },
  heroMeta: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  heroBadge: {
    fontSize: 10, fontWeight: 600,
    padding: '3px 8px', borderRadius: 3,
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    color: 'var(--text-dim, #9394a8)',
    textTransform: 'capitalize',
    fontFamily: 'var(--font-mono, monospace)',
  },
  heroAddress: { fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  heroStats: { display: 'flex', alignItems: 'center', gap: 8 },
  heroStat: { fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  heroStatNum: { color: 'var(--accent, #c8963e)', fontWeight: 700 },
  heroGrid: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(var(--border, #2e3040) 1px, transparent 1px), linear-gradient(90deg, var(--border, #2e3040) 1px, transparent 1px)',
    backgroundSize: '28px 28px',
    opacity: 0.25,
    pointerEvents: 'none',
  },
  main: { flex: 1, padding: '24px 20px 48px', maxWidth: 600, width: '100%', margin: '0 auto' },
  empty: {
    textAlign: 'center', padding: '40px 0',
    fontSize: 12, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
}
