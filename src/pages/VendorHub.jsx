import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TabBar } from '../components/ui'
import { supabase } from '../lib/supabase'
import { onboardUrl } from '../utils/vendorHub'
import ShareSheet from '../components/vendor/ShareSheet'
import EditRequestsSheet from '../components/vendor/EditRequestsSheet'
import OnboardingTab from './vendors/OnboardingTab'
import AttendanceTab from './vendors/AttendanceTab'
import PayrollTab from './vendors/PayrollTab'

// Tab registry — new tabs slot in here with their own component; the shell does
// not need to change.
const TABS = [
  { key: 'onboarding', label: 'Onroll vendors', Comp: OnboardingTab },
  { key: 'attendance', label: 'Attendance', Comp: AttendanceTab },
  { key: 'payroll',    label: 'Payroll',    Comp: PayrollTab },
  { key: 'exit',       label: 'Exit',       Comp: null },
]

// ── clearly-a-placeholder (not a broken empty state) ────────────────────────
function ComingSoon({ label }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12, marginTop: 8 }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>🛠️</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{label} — coming soon</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 6, lineHeight: 1.5, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
        This part of the vendor hub isn’t built yet. It will arrive as a tab here, right alongside Onboarding.
      </div>
    </div>
  )
}

export default function VendorHub() {
  const navigate = useNavigate()
  const [tab, setTab] = useState(0)
  const [sharing, setSharing] = useState(false)
  const [showReq, setShowReq] = useState(false)
  const [reqCount, setReqCount] = useState(0)

  useEffect(() => {
    supabase.from('vendor_edit_requests').select('id', { count: 'exact', head: true })
      .in('status', ['requested', 'submitted']).then(({ count }) => setReqCount(count || 0))
  }, [])

  const ActiveComp = TABS[tab].Comp

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      {/* header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56,
        paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)',
        borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <button onClick={() => navigate('/')} style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pulse-title" style={{ fontSize: 15.5 }}>Vendor Management</div>
        </div>
        <button onClick={() => setShowReq(true)} title="Profile edit requests" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '8px 11px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
          <span style={{ fontSize: 14 }}>🔔</span>
          <span>Requests</span>
          {reqCount > 0 && <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, background: 'var(--red, #e05c6a)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono, monospace)' }}>{reqCount}</span>}
        </button>
        <button onClick={() => setSharing(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '8px 12px', background: 'rgba(200,150,62,0.10)', border: '1px solid var(--accent, #c8963e)', borderRadius: 8, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M11 5.5a2 2 0 10-1.9-2.6L6.3 4.6a2 2 0 100 2.8l2.8 1.7a2 2 0 10.6-1L7 6.4a2 2 0 000-.8l2.8-1.7A2 2 0 0011 5.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
          <span>Share link</span>
        </button>
      </header>

      <div style={{ position: 'sticky', top: 'calc(env(safe-area-inset-top) + 56px)', zIndex: 90 }}>
        <TabBar tabs={TABS.map(t => t.label)} active={tab} onChange={setTab} />
      </div>

      <div style={{ flex: 1, padding: '16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        {ActiveComp ? <ActiveComp /> : <ComingSoon label={TABS[tab].label} />}
      </div>

      {sharing && <ShareSheet title="Share onboarding link" subtitle="Point a candidate’s phone at this to open the form at site." url={onboardUrl()} onClose={() => setSharing(false)} />}
      {showReq && <EditRequestsSheet onClose={() => setShowReq(false)} onChange={setReqCount} />}
    </div>
  )
}
