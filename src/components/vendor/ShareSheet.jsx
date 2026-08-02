import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { copyToClipboard } from '../../utils/vendorHub'

// Bottom-sheet share dialog: shows a QR + copyable URL. Used for the public
// onboarding link and the public attendance (punch) link.
export default function ShareSheet({ title, subtitle, url, onClose }) {
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
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, margin: '0 auto', background: 'var(--bg-panel, #1e2028)', borderRadius: '14px 14px 0 0', padding: '8px 20px 32px', animation: 'slideUp 0.22s ease-out' }}>
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 16px' }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', textAlign: 'center', marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', textAlign: 'center', marginBottom: 18, fontFamily: 'var(--font-mono, monospace)' }}>{subtitle}</div>}

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          {qr ? (
            <img src={qr} alt="QR code" width={220} height={220} style={{ borderRadius: 10, background: '#fff', padding: 8 }} />
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
