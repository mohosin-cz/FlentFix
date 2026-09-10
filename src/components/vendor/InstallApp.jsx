import { useState } from 'react'
import { useInstallApp } from '../../hooks/useInstallApp'

// The portal offered as an app, in the portal's own language.
//
// Two placements, because the two audiences are different: a banner a vendor
// meets once (dismissible, and gone for good once installed or waved off), and
// a permanent row in Profile so somebody who dismissed it — or changed phones —
// can still find it. Neither ever appears inside an installed app.

const MONO = 'var(--font-mono, monospace)'

// Android and desktop Chrome install in one tap. iOS has no programmatic
// install, so there the honest thing is to show where the button lives.
function steps(os) {
  if (os === 'ios') {
    return {
      title: 'Add Flent to your home screen',
      note: 'In Safari on your iPhone.',
      list: [
        'Tap the Share button at the bottom of Safari — the square with an arrow coming out of it.',
        'Scroll down the list and tap “Add to Home Screen”.',
        'Tap “Add”. Flent then opens like any other app.',
      ],
    }
  }
  if (os === 'android') {
    return {
      title: 'Add Flent to your home screen',
      note: 'If the install button did not appear.',
      list: [
        'Tap the ⋮ menu at the top right of Chrome.',
        'Tap “Install app”, or “Add to Home screen”.',
        'Confirm, and Flent appears with your other apps.',
      ],
    }
  }
  return {
    title: 'Install Flent',
    note: 'On a computer.',
    list: [
      'Look for the install icon at the right-hand end of the address bar.',
      'Click it, then click “Install”.',
      'Flent then opens in its own window.',
    ],
  }
}

function HowSheet({ os, onClose }) {
  const s = steps(os)
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 10050, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, margin: '0 auto', background: 'var(--bg-panel, #1e2028)', borderRadius: '14px 14px 0 0', padding: '8px 20px max(28px, env(safe-area-inset-bottom))', animation: 'slideUp 0.22s ease-out' }}>
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 16px' }} />
        <div style={{ fontSize: 15, fontWeight: 700, textAlign: 'center' }}>{s.title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', textAlign: 'center', marginTop: 4, fontFamily: MONO }}>{s.note}</div>
        <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, margin: '18px 0 20px', padding: 0 }}>
          {s.list.map((t, i) => (
            <li key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 21, height: 21, borderRadius: '50%', background: 'rgba(200,150,62,0.14)', border: '1px solid rgba(200,150,62,0.34)', color: 'var(--accent, #c8963e)', fontSize: 11, fontWeight: 700, fontFamily: MONO, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-dim, #9394a8)' }}>{t}</span>
            </li>
          ))}
        </ol>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.6, textAlign: 'center', marginBottom: 16 }}>
          You sign in once inside the app, then it stays signed in.
        </div>
        <button type="button" onClick={onClose}
          style={{ width: '100%', minHeight: 46, borderRadius: 10, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Got it
        </button>
      </div>
    </div>
  )
}

// The offer. Sits in the flow of the screen rather than over it — the punch
// button is pinned to the bottom of the portal and nothing here may cover it.
export function InstallBanner() {
  const { os, canPrompt, install, dismiss, dismissed, offerable } = useInstallApp()
  const [how, setHow] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!offerable || dismissed) return null

  async function onInstall() {
    setBusy(true)
    const outcome = await install()
    setBusy(false)
    // Chrome can decline to show its own dialog — an older version, or a
    // prompt already spent. Falling back to the steps beats a dead button.
    if (outcome === 'unavailable') setHow(true)
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 12 }}>
        <img src="/icon-192.png" alt="" width={38} height={38}
          style={{ borderRadius: 9, flexShrink: 0, border: '1px solid var(--border, #2e3040)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Keep Flent on your phone</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.45, marginTop: 2 }}>
            One tap to check in — no browser, no typing the address.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={canPrompt ? onInstall : () => setHow(true)} disabled={busy}
            style={{ minHeight: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--accent, #c8963e)', color: '#16171f', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
            {busy ? '…' : canPrompt ? 'Install' : 'How'}
          </button>
          <button type="button" onClick={dismiss} aria-label="Not now"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11, cursor: 'pointer', fontFamily: MONO, padding: 0 }}>
            Not now
          </button>
        </div>
      </div>
      {how && <HowSheet os={os} onClose={() => setHow(false)} />}
    </>
  )
}

// The permanent home for it, in Profile — including for somebody who already
// installed it, because "you have this" is a useful answer too.
export function InstallRow() {
  const { os, installed, canPrompt, install } = useInstallApp()
  const [how, setHow] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onInstall() {
    setBusy(true)
    const outcome = await install()
    setBusy(false)
    if (outcome === 'unavailable') setHow(true)
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>Flent on your home screen</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2, fontFamily: MONO }}>
            {installed ? 'Installed — you are using the app' : 'Open the portal like an app'}
          </div>
        </div>
        {installed
          ? <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: MONO, flexShrink: 0 }}>✓ Installed</span>
          : <button type="button" onClick={canPrompt ? onInstall : () => setHow(true)} disabled={busy}
              style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
              {busy ? '…' : canPrompt ? 'Install' : 'How'}
            </button>}
      </div>
      {how && <HowSheet os={os} onClose={() => setHow(false)} />}
    </>
  )
}
