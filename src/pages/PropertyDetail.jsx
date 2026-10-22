import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import { logActivity } from '../utils/activityUtils'
import { pidStatus, pidStatusMessage, purgeBinnedPid } from '../utils/pidStatus'
import { realName } from '../utils/propertyName'
import LogoSpinner from '../components/LogoSpinner'
import MoneyTrail from '../components/property/MoneyTrail'
import RecordStatus, { usePropertyJourneyRow } from '../components/property/RecordStatus'
import RecordTimeline from '../components/property/RecordTimeline'
import LandlordPanel from '../components/property/LandlordPanel'
import ExploratoryPanel from '../components/property/ExploratoryPanel'
import PausedBanner from '../components/property/PausedBanner'
import UtilityRequest from '../components/property/UtilityRequest'
import JourneyPhases from '../components/property/JourneyPhases'
import { useSetupPanel, SetupPanel, AttendanceHistory } from '../components/property/SetupDay'
import ShareSheet from '../components/vendor/ShareSheet'
import HomeMark from '../components/HomeMark'

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
    color: 'var(--green, #6f9a7e)',
    bg: 'rgba(111,154,126,0.08)',
    border: 'rgba(111,154,126,0.25)',
  },
  {
    key: 'utilities',
    title: 'Utilities & Access',
    sub: 'Recharges · lockbox',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M9 2v6M15 2v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M7 8h10v3a5 5 0 0 1-10 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M12 16v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.25)',
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
    title: 'Work Orders',
    sub: 'By trade · assign',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a1 1 0 0 0-1.4-1.4l-2.3 2.3-.9-.9a1 1 0 0 0-1.4 0z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M4 12h10M4 8h6M4 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: '#9b6de6',
    bg: 'rgba(155,109,230,0.08)',
    border: 'rgba(155,109,230,0.25)',
  },
  {
    key: 'design-brief',
    title: 'Design brief',
    sub: 'Her answers · scope',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M4 19.5V6a2 2 0 0 1 2-2h9l5 5v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M15 4v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M8 13h8M8 16.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    color: '#e6a1c8',
    bg: 'rgba(230,161,200,0.08)',
    border: 'rgba(230,161,200,0.25)',
  },
  {
    key: 'payments',
    title: 'Payments',
    sub: 'Spend log · analytics',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M6 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    color: 'var(--green, #6f9a7e)',
    bg: 'rgba(111,154,126,0.08)',
    border: 'rgba(111,154,126,0.25)',
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

// Who owns this property: on whose desk and Team load bar it sits. Admin only;
// property_set_owner() checks that again on the server.
const firstOf = (e) => { const x = (e || '').split('@')[0]; return x ? x[0].toUpperCase() + x.slice(1) : '' }
function ChangeOwnerModal({ pid, current, onClose, onSuccess }) {
  const [team, setTeam]     = useState([])
  const [pick, setPick]     = useState(current || '')
  const [other, setOther]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  useEffect(() => {
    supabase.rpc('team_members').then(({ data }) => setTeam((data || []).filter(t => (t.email || '').endsWith('@flent.in'))))
  }, [])
  const chosen = (pick === '__other' ? other : pick).trim().toLowerCase()
  const valid = chosen === '' || /^[a-z0-9._%+-]+@flent\.in$/.test(chosen)
  const changed = chosen !== (current || '')
  async function save() {
    if (!valid || !changed || saving) return
    setSaving(true); setError(null)
    const { error: e } = await supabase.rpc('property_set_owner', { p_pid: pid, p_email: chosen || null })
    setSaving(false)
    if (e) { setError(e.message); return }
    onSuccess(chosen)
  }
  const row = (key, label, sub) => (
    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: pick === key ? 'rgba(200,150,62,0.1)' : 'var(--bg-input, #252731)', border: `1px solid ${pick === key ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}` }}>
      <input type="radio" name="owner" checked={pick === key} onChange={() => setPick(key)} style={{ accentColor: '#c8963e' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13.5, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>{label}</span>
        {sub && <span style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)' }}>{sub}</span>}
      </span>
      {key === current && <span style={{ fontSize: 10.5, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>CURRENT</span>}
    </label>
  )
  const people = [...new Set([...(current ? [current] : []), ...team.map(t => t.email.toLowerCase())])]
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 500, maxHeight: '90svh', overflowY: 'auto', background: 'var(--bg-panel, #1e2028)', borderTop: '1px solid var(--border, #2e3040)', borderRadius: '16px 16px 0 0', padding: '24px 24px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border, #2e3040)', margin: '-8px auto 8px' }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)', marginBottom: 6 }}>Owner of {pid}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.6 }}>
            The owner has this property on their desk and their Team load bar. Currently {current ? <b style={{ color: 'var(--text-dim, #9394a8)' }}>{firstOf(current)}</b> : 'nobody'}.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {people.map(e => {
            const t = team.find(x => x.email.toLowerCase() === e)
            return row(e, firstOf(e), `${e}${t ? ` · ${t.properties} propert${t.properties === 1 ? 'y' : 'ies'}` : ''}`)
          })}
          {row('__other', 'Someone else', 'type a @flent.in address')}
          {pick === '__other' && (
            <input type="email" value={other} onChange={e => setOther(e.target.value)} placeholder="name@flent.in" autoFocus
              style={{ background: 'var(--bg-input, #252731)', border: `1px solid ${other && !valid ? '#f87171' : 'var(--border, #2e3040)'}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: 'var(--text, #e8e8f0)', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
          )}
          {current && row('', 'No owner', 'shows as Unowned on Team load')}
        </div>
        {error && <div style={{ fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono, monospace)', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 0', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={!valid || !changed || saving}
            style={{ flex: 2, padding: '11px 0', background: valid && changed ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: valid && changed ? '#000' : 'var(--text-muted, #6b6d82)', cursor: valid && changed ? 'pointer' : 'default' }}>
            {saving ? 'Saving…' : !changed ? 'Pick an owner' : chosen ? `Make ${firstOf(chosen)} the owner` : 'Remove owner'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangePidModal({ pid, userEmail, onClose, onSuccess }) {
  const [screen, setScreen]           = useState('setup')
  const [newPid, setNewPid]           = useState('')
  // What is holding the typed PID, not merely whether something is. A PID sat
  // in the bin used to read as "already in use" — true of the database, and
  // useless to someone looking at a list the property is no longer on.
  const [held, setHeld]               = useState(null)
  const [checking, setChecking]       = useState(false)
  const [reclaiming, setReclaiming]   = useState(false)
  const [confirmInput, setConfirmInput] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [error, setError]             = useState(null)
  const timerRef = useRef(null)

  function onNewPidChange(val) {
    setNewPid(val)
    setHeld(null)
    const v = val.trim()
    if (!v || v === pid) { setChecking(false); return }
    setChecking(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const st = await pidStatus(v)
      setHeld(st.state === 'free' ? null : st)
      setChecking(false)
    }, 400)
  }

  // Take a binned PID back. The old property is erased for good — the same
  // three deletes the bin's own "delete permanently" performs — so it is asked
  // for in those words rather than slipped in behind a rename.
  async function reclaim() {
    if (!held || held.state !== 'binned') return
    const insp = held.inspections?.length
    if (!window.confirm(
      `Permanently delete the binned property ${held.pid}${insp ? ` and its ${insp} inspection${insp === 1 ? '' : 's'}` : ''}, ` +
      `so this property can take the PID?\n\nThis cannot be undone. To keep that property instead, restore it from the bin.`)) return
    setReclaiming(true); setError(null)
    const { error: pErr } = await purgeBinnedPid(held.pid)
    setReclaiming(false)
    if (pErr) { setError(pErr); return }
    setHeld(null)
  }

  const cleanNew = newPid.trim()
  const sameAsCurrent = cleanNew === pid
  const pidInUse = !!held
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
              {!checking && held && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.28)', borderRadius: 8 }}>
                  <span style={{ fontSize: 11.5, color: '#f87171', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.55 }}>{pidStatusMessage(held)}</span>
                  {/* A binned PID is the one case with a way forward from here:
                      either keep that property, or give it up on purpose. */}
                  {held.state === 'binned' && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={reclaim} disabled={reclaiming}
                        style={{ padding: '7px 11px', background: 'var(--bg-input, #252731)', border: '1px solid #f87171', borderRadius: 7, fontSize: 11.5, color: '#f87171', cursor: reclaiming ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                        {reclaiming ? 'Deleting…' : 'Delete it for good & take the PID'}
                      </button>
                      {held.inBin && <a href="/properties/bin" style={{ padding: '7px 11px', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 7, fontSize: 11.5, color: 'var(--text-dim, #9394a8)', textDecoration: 'none', fontFamily: 'var(--font-mono, monospace)' }}>Open the bin</a>}
                    </div>
                  )}
                  {held.state === 'archived' && (
                    <a href="/properties/archive" style={{ alignSelf: 'flex-start', padding: '7px 11px', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 7, fontSize: 11.5, color: 'var(--text-dim, #9394a8)', textDecoration: 'none', fontFamily: 'var(--font-mono, monospace)' }}>Open the archive</a>
                  )}
                </div>
              )}
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
  // The estimate as the landlord sees it: the total that was sent, and how
  // much of it they've approved (each line × its quantity, priced lines only).
  const [est, setEst]                 = useState(null)
  useEffect(() => {
    if (!pid) return undefined
    let alive = true
    supabase.from('estimates')
      .select('id, status, total, sent_at, estimate_items(status, cost_type, material_cost, labour_cost, qty)')
      .eq('pid', pid).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => {
        if (!alive || !data) return
        const sent = data.find(e => e.status !== 'draft' || e.sent_at)
        const items = (sent?.estimate_items || []).filter(i => i.status !== 'removed')
        const approved = items.filter(i => i.status === 'approved' && i.cost_type !== 'nil' && i.cost_type !== 'no_cost')
          .reduce((t, i) => t + ((Number(i.material_cost) || 0) + (Number(i.labour_cost) || 0)) * (Number(i.qty) || 1), 0)
        setEst(sent ? { total: Number(sent.total) || 0, approved, all: items.length > 0 && items.every(i => i.status === 'approved' || i.status === 'excluded'), draft: false }
                    : data.length ? { draft: true, total: Number(data[0].total) || 0 } : null)
      })
    return () => { alive = false }
  }, [pid])
  const [showAllInspections, setShowAllInspections] = useState(false)
  const [quickNote, setQuickNote]     = useState(null)
  const [propName, setPropName]       = useState(null)
  const [currentStage, setCurrentStage] = useState('T-5')
  const engine = usePropertyJourneyRow(pid)
  const setupPanel = useSetupPanel(pid)
  const setupToday = setupPanel.data?.days_to_setup === 0
  const [journey, setJourney]           = useState([])
  const [userEmail, setUserEmail]       = useState(null)
  const [menuOpen, setMenuOpen]         = useState(false)
  const [pidModal, setPidModal]         = useState(false)
  const [ownerModal, setOwnerModal]     = useState(false)
  const [owner, setOwner]               = useState(null)
  const [isAdmin, setIsAdmin]           = useState(false)
  const [feasibility, setFeasibility]   = useState([])
  const [access, setAccess]             = useState(null)
  const [utilities, setUtilities]       = useState([])
  const menuRef = useRef(null)

  const fetchData = useCallback(async () => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserEmail(user?.email || null))
    supabase.rpc('pulse_is_admin').then(({ data }) => setIsAdmin(!!data))

    // Fetch inspections, stage, journey, and notes in parallel
    const [{ data: inspData }, { data: propData }, { data: journeyData }] = await Promise.all([
      supabase.from('inspections').select('*').eq('pid', pid).order('created_at', { ascending: false }),
      supabase.from('properties').select('stage, name, assigned_to, owner_email').eq('pid', pid).maybeSingle(),
      supabase.from('property_journey').select('*').eq('pid', pid).order('changed_at', { ascending: true }),
    ])

    setInspections(inspData || [])
    setLoading(false)
    setJourney(journeyData || [])
    setPropName(realName(propData ? { ...propData, pid } : null))
    setOwner(((propData?.assigned_to || '').trim() || propData?.owner_email || '').toLowerCase() || null)

    // Bug 2 fix: fall back to latest journey stage if properties.stage is null
    const latestJourneyStage = journeyData?.length ? journeyData[journeyData.length - 1]?.stage : null
    setCurrentStage(propData?.stage || latestJourneyStage || 'T-5')

    supabase.from('quick_notes').select('note, updated_at, created_by').eq('pid', pid).maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('quick_notes fetch error:', error)
        setQuickNote(data || null)
      })

    // Utilities & access summary — tolerate tables not existing yet (pre-migration)
    supabase.from('property_access').select('lockbox_code').eq('pid', pid).maybeSingle()
      .then(({ data }) => setAccess(data || null))
    supabase.from('property_utilities').select('id, status').eq('pid', pid)
      .then(({ data }) => setUtilities(data || []))

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

  async function handleTile(key) {
    if (key === 'estimate') {
      navigate(`/properties/${pid}/estimates`)
    } else if (key === 'utilities') {
      navigate(`/properties/${pid}/utilities`)
    } else if (key === 'appliance') {
      navigate('/inspections/appliance-report', { state: { inspectionId: latestId, pid } })
    } else if (key === 'invoice') {
      if (!latestId) { setToast('No inspection found for this property.'); return }
      navigate(`/invoice/${latestId}`)
    } else if (key === 'raw') {
      navigate(`/properties/${pid}/raw`)
    } else if (key === 'workorder') {
      navigate(`/properties/${pid}/work-orders`)
    } else if (key === 'payments') {
      navigate(`/properties/${pid}/payments`)
    } else if (key === 'design-brief') {
      // Opens the brief rather than the link. The link is one thing you do with
      // a brief; reading what she wrote and choosing what reaches a vendor are
      // the others, and they had nowhere to live.
      navigate(`/properties/${pid}/design-brief`)
    } else {
      setToast('Coming soon')
    }
  }

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={s.page}>


      {/* Record bar — back, which property, record menu */}
      <header style={s.header}>
        <HomeMark />
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>PID {pid}</span>
          {/* The name leads the second line, ahead of type and date: it is the
              thing that tells you which property this is. Truncated rather
              than wrapped — the header is one line tall on a phone. */}
          <span style={s.headerSub} title={propName || undefined}>
            {propName ? `${propName} · ` : ''}
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
              {isAdmin && (
                <button
                  onClick={() => { setMenuOpen(false); setOwnerModal(true) }}
                  style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', borderTop: '1px solid var(--border, #2e3040)', textAlign: 'left', fontSize: 13, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-input, #252731)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                >
                  {owner ? 'Change owner…' : 'Add owner…'}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{owner ? owner.split('@')[0] : 'nobody yet'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* ── Journey: six phases, where it is now, and the one next thing ── */}
      {!loading && <PausedBanner pid={pid} onResumed={() => { engine.reload(); setupPanel.reload() }} />}
      {!loading && <JourneyPhases pid={pid} row={engine.row} onChange={() => { engine.reload(); setupPanel.reload() }} />}


      <main style={s.main}>
        {loading ? (
          <LogoSpinner />
        ) : (
          <>
            {/* The record, CRM-style: where it stands on the left, everything that
                happened down the middle, the related objects and the way into
                each module on the right. Columns change count, never stretch. */}
            <style>{`
              .rec-grid { display: grid; gap: 20px; align-items: start; grid-template-columns: minmax(0, 1fr); grid-template-areas: "l" "r" "c"; }
              .rec-l { grid-area: l; } .rec-c { grid-area: c; } .rec-r { grid-area: r; }
              .rec-l, .rec-c, .rec-r { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
              @media (min-width: 900px)  { .rec-grid { grid-template-columns: minmax(0, 1fr) 400px; grid-template-areas: "l r" "c r"; } .rec-r { position: sticky; top: 72px; } }
              @media (min-width: 1280px) { .rec-grid { grid-template-columns: 330px minmax(0, 1fr) 420px; grid-template-areas: "l c r"; } .rec-l { position: sticky; top: 72px; } }
            `}</style>
            {setupToday && <div style={{ marginBottom: 20 }}><SetupPanel pid={pid} panel={setupPanel} /></div>}
            <div className="rec-grid">
              <div className="rec-l">
                <RecordStatus journey={engine} />
                <UtilityRequest pid={pid} onChange={() => { engine.reload(); setupPanel.reload() }} />
                <LandlordPanel pid={pid} />
                <ExploratoryPanel pid={pid} />
                {/* Summary stats — always render */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
                  {[
                    { label: 'Line Items', value: stats.totalItems },
                    { label: 'Issues', value: stats.issues, color: stats.issues > 0 ? 'var(--red, #b0645b)' : undefined },
                    // the estimate that went to the landlord, not a sum of inspection lines
                    { label: est && !est.draft ? 'Estimate sent' : 'Est. Cost', value: est && !est.draft ? `₹${est.total.toLocaleString('en-IN')}` : '—', color: est && !est.draft && est.total > 0 ? 'var(--accent, #c8963e)' : undefined },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: '12px 10px', textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: stat.color || 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{stat.value}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Appliance feasibility compact card */}
                {feasibility.length > 0 && (() => {
                  const SINGLETON_SHORT = { 'Washing Machine': 'WM', 'Refrigerator': 'Fridge', 'Dryer': 'Dryer', 'Air Conditioner': 'AC', 'Geyser': 'Geyser' }
                  const feasIcon  = d => d === 'feasible' ? '✓' : d === 'not_feasible' ? '✗' : d === 'na' ? '—' : '?'
                  const feasColor = d => d === 'feasible' ? '#4dd9c0' : d === 'not_feasible' ? '#f87171' : '#6b6d82'

                  function locShort(name, prefix) {
                    const loc = name.replace(prefix + ' · ', '')
                    if (loc === 'Common Bathroom') return 'Common'
                    if (loc === 'Living Room') return 'Living'
                    const bath = loc.match(/Bedroom (\d+) Bathroom/); if (bath) return `B${bath[1]}`
                    const br   = loc.match(/Bedroom (\d+)/);          if (br)   return `BR${br[1]}`
                    return loc
                  }

                  function GroupedRow({ prefix, label, rows }) {
                    if (!rows.length) return null
                    return (
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-dim, #9394a8)' }}>
                        {label}:{' '}
                        {rows.map((f, i) => {
                          const name = f.item_name.replace('Feasibility: ', '')
                          return (
                            <span key={name} style={{ color: feasColor(f.issue_description) }}>
                              {i > 0 && <span style={{ color: 'var(--text-muted, #6b6d82)' }}> · </span>}
                              {locShort(name, prefix)} <span style={{ fontWeight: 700 }}>{feasIcon(f.issue_description)}</span>
                            </span>
                          )
                        })}
                      </span>
                    )
                  }

                  const singletons  = feasibility.filter(f => !f.item_name.includes(' · '))
                  const exhaustRows = feasibility.filter(f => f.item_name.startsWith('Feasibility: Exhaust Fan · '))
                  const geyserRows  = feasibility.filter(f => f.item_name.startsWith('Feasibility: Geyser · '))
                  const acRows      = feasibility.filter(f => f.item_name.startsWith('Feasibility: Air Conditioner · '))

                  return (
                    <div style={{ marginBottom: 20, padding: '10px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 7, letterSpacing: '0.08em' }}>APPLIANCES</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {singletons.map(f => {
                          const name = f.item_name.replace('Feasibility: ', '')
                          return (
                            <span key={name} style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: feasColor(f.issue_description) }}>
                              {SINGLETON_SHORT[name] || name} <span style={{ fontWeight: 700 }}>{feasIcon(f.issue_description)}</span>
                            </span>
                          )
                        })}
                        <GroupedRow prefix="Exhaust Fan"     label="Exhaust" rows={exhaustRows} />
                        <GroupedRow prefix="Geyser"          label="Geyser"  rows={geyserRows}  />
                        <GroupedRow prefix="Air Conditioner" label="AC"      rows={acRows}      />
                      </div>
                    </div>
                  )
                })()}

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

              </div>

              <div className="rec-c">
                {!setupToday && <SetupPanel pid={pid} panel={setupPanel} />}
                <RecordTimeline pid={pid} />
              </div>

              <div className="rec-r">
                <div>
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
                            {tile.key === 'estimate' && est && !est.draft ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <span style={{ fontSize: 15, fontWeight: 700, color: est.approved > 0 ? 'var(--green, #6f9a7e)' : 'var(--text, #e8e8f0)', fontVariantNumeric: 'tabular-nums' }}>
                                  ₹{est.approved.toLocaleString('en-IN')} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted, #6b6d82)' }}>approved</span>
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{est.all ? '✓ all approved' : `of ₹${est.total.toLocaleString('en-IN')} sent`}</span>
                              </div>
                            ) : (
                              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{tile.key === 'estimate' && est?.draft ? 'Draft · not sent yet' : tile.sub}</div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Utilities & Access summary strip */}
                    {(access?.lockbox_code || utilities.length > 0) && (() => {
                      const activeCount = utilities.filter(u => u.status === 'active').length
                      return (
                        <button
                          onClick={() => navigate(`/properties/${pid}/utilities`)}
                          style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.22)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#a78bfa' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(167,139,250,0.22)' }}
                        >
                          {access?.lockbox_code && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono, monospace)' }}>
                              <span style={{ fontSize: 13 }}>🔒</span>
                              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text, #e8e8f0)' }}>{access.lockbox_code}</span>
                            </span>
                          )}
                          {access?.lockbox_code && utilities.length > 0 && (
                            <span style={{ width: 1, height: 18, background: 'rgba(167,139,250,0.25)' }} />
                          )}
                          {utilities.length > 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>
                              {utilities.length} {utilities.length === 1 ? 'utility' : 'utilities'}
                              {activeCount > 0 && <span style={{ color: 'var(--text-muted, #6b6d82)' }}> · {activeCount} active</span>}
                            </span>
                          )}
                          <span style={{ marginLeft: 'auto', fontSize: 13, color: '#a78bfa' }}>→</span>
                        </button>
                      )
                    })()}

                </div>
                <div style={{ marginTop: -28 }}><MoneyTrail pid={pid} /></div>
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
                                  background: ins.status === 'completed' ? 'rgba(111,154,126,0.1)' : ins.status === 'estimate_generated' ? 'rgba(111,154,126,0.1)' : 'var(--bg-input, #252731)',
                                  border: `1px solid ${ins.status === 'completed' || ins.status === 'estimate_generated' ? 'rgba(111,154,126,0.3)' : 'var(--border, #2e3040)'}`,
                                  color: ins.status === 'completed' || ins.status === 'estimate_generated' ? 'var(--green, #6f9a7e)' : 'var(--text-muted, #6b6d82)',
                                }}>
                                  {ins.status || 'draft'}
                                </span>
                              </div>
                            </div>
                            {ins.status === 'estimate_generated' && (
                              <button
                                onClick={() => navigate(`/estimate/${ins.id}`)}
                                style={{ fontSize: 11, fontWeight: 600, color: 'var(--green, #6f9a7e)', background: 'rgba(111,154,126,0.08)', border: '1px solid rgba(111,154,126,0.25)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}
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

                {/* who actually turned up — kept after setup day */}
                <AttendanceHistory panel={setupPanel} />

              </div>
            </div>
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

      {ownerModal && (
        <ChangeOwnerModal
          pid={pid}
          current={owner}
          onClose={() => setOwnerModal(false)}
          onSuccess={(email) => {
            setOwnerModal(false)
            setOwner(email || null)
            setToast(email ? `Owner is now ${firstOf(email)}` : 'Owner removed')
            engine.reload()
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
  // the record's own bar is the page header now (no main nav above it)
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 24px', paddingTop: 'env(safe-area-inset-top, 0px)', minHeight: 56, gap: 14,
    background: 'var(--bg-panel, #1e2028)',
    borderBottom: '1px solid var(--border, #2e3040)',
    position: 'sticky', top: 0, zIndex: 100,
  },
  backBtn: {
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-input, #252731)',
    border: '1px solid var(--border, #2e3040)',
    borderRadius: 8,
    color: 'var(--text-dim, #9394a8)', cursor: 'pointer',
  },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: {
    fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)',
    maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
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
  main: { flex: 1, padding: '20px 24px 48px', width: '100%', boxSizing: 'border-box' },
  empty: {
    textAlign: 'center', padding: '40px 0',
    fontSize: 12, color: 'var(--text-muted, #6b6d82)',
    fontFamily: 'var(--font-mono, monospace)',
  },
}
