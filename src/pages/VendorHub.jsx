import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { TabBar } from '../components/ui'
import { onboardUrl, copyToClipboard } from '../utils/vendorHub'
import OnboardingTab from './vendors/OnboardingTab'

// Tab registry — new tabs slot in here with their own component; the shell does
// not need to change. Only Onboarding is implemented in this branch.
const TABS = [
  { key: 'onboarding', label: 'Onboarding', Comp: OnboardingTab },
  { key: 'attendance', label: 'Attendance', Comp: null },
  { key: 'payroll',    label: 'Payroll',    Comp: null },
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

// ── share onboarding link modal (copy + QR) ─────────────────────────────────
function ShareModal({ onClose }) {
  const url = onboardUrl()
  const [qr, setQr] = useState('')
  const [qrErr, setQrErr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#16171f', light: '#ffffff' } })
      .then(d => { if (alive) setQr(d) })
      .catch(e => { if (alive) setQrErr(e.message || 'Could not generate QR code') })
    return () => { alive = false }
  }, [url])

  async function copy() {
    const ok = await copyToClipboard(url)
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000) }
    else setQrErr('Copy failed — select and copy the link manually.')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'var(--bg-panel, #1e2028)', borderRadius: '14px 14px 0 0', padding: '8px 20px 32px', animation: 'slideUp 0.22s ease-out' }}>
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 16px' }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', textAlign: 'center', marginBottom: 4 }}>Share onboarding link</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'center', marginBottom: 18, fontFamily: 'var(--font-mono, monospace)' }}>Point a candidate’s phone at this to open the form at site.</div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          {qr ? (
            <img src={qr} alt="Onboarding form QR code" width={220} height={220} style={{ borderRadius: 10, background: '#fff', padding: 8 }} />
          ) : qrErr ? (
            <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 16, border: '1px solid rgba(224,92,106,0.4)', borderRadius: 10, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)' }}>⚠ {qrErr}</div>
          ) : (
            <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>generating…</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
          <button type="button" onClick={copy} style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: copied ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)', background: 'none', border: `1px solid ${copied ? 'var(--green, #3dba7a)' : 'var(--border, #2e3040)'}`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{copied ? 'copied ✓' : 'copy'}</button>
        </div>

        <button type="button" onClick={onClose} style={{ width: '100%', padding: '12px', background: 'transparent', color: 'var(--text-muted, #6b6d82)', border: '1px solid var(--border-dash, #3a3d52)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-mono, monospace)' }}>close</button>
      </div>
    </div>
  )
}

export default function VendorHub() {
  const navigate = useNavigate()
  const [tab, setTab] = useState(0)
  const [sharing, setSharing] = useState(false)

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
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>VENDOR MANAGEMENT</div>
        </div>
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

      {sharing && <ShareModal onClose={() => setSharing(false)} />}
    </div>
  )
}
