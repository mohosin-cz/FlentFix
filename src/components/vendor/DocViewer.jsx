import { useState, useEffect, useCallback } from 'react'
import { typeForPath } from '../../utils/assetFiles'

// Look at a stored document without downloading it.
//
// A PDF attachment previously had no way to open it at all — the signed URL
// was only fetched for images — so reading a bill meant saving it first.
// Everything renders here instead, from an object URL this owns.
//
// It also has to cope with files that lie. An iPhone HEIC lands in the bucket
// named .jpg (the compressor cannot decode HEIC, so it stores the original,
// and the old extension fallback called anything not-PNG-not-WebP a JPEG).
// So the served content type wins over the extension, and the bytes are test-
// decoded before rendering: Chrome cannot display HEIC at all, and a blank
// frame with no explanation is the worst of the available outcomes.
//
// Save stays available throughout — it is just no longer the only thing on
// offer, and it is the only thing left when the browser genuinely cannot
// render the format.

const MONO = 'var(--font-mono, monospace)'

export default function DocViewer({ url, name, onClose }) {
  const [state, setState] = useState({ loading: true, href: null, type: '', err: '' })
  const [zoom, setZoom] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let alive = true
    let objectUrl = null
    ;(async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Could not load it (${res.status})`)
        const raw = await res.blob()
        // The server's type wins when it says something specific — a file
        // stored as .jpg may actually be HEIC, and believing the extension
        // there produces a blank frame with no explanation. The extension is
        // the fallback, for objects written with no type at all.
        const served = raw.type && raw.type !== 'application/octet-stream' ? raw.type : ''
        const type = served || typeForPath(name || url) || 'application/octet-stream'
        objectUrl = URL.createObjectURL(raw.type === type ? raw : new Blob([raw], { type }))

        // Chrome cannot decode HEIC, so an <img> would just render nothing.
        // Say so instead of showing an empty box.
        if (type.startsWith('image/')) {
          try { (await createImageBitmap(raw)).close?.() } catch {
            if (alive) setState({
              loading: false, href: objectUrl, type, undecodable: true,
              err: `This is a ${(type.split('/')[1] || 'unsupported').toUpperCase()} image, which this browser can't display. Save it to view it.`,
            })
            return
          }
        }
        if (alive) setState({ loading: false, href: objectUrl, type, err: '' })
      } catch (e) {
        if (alive) setState({ loading: false, href: null, type: '', err: e.message || 'Could not load it' })
      }
    })()
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url, name])

  const save = useCallback(() => {
    if (!state.href) return
    const a = document.createElement('a')
    a.href = state.href
    a.download = (name || 'document').split('/').pop()
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }, [state.href, name])

  const isPdf = state.type === 'application/pdf'

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(8,9,13,0.92)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(name || '').split('/').pop() || 'Document'}
        </div>
        <button type="button" onClick={save} disabled={!state.href}
          style={{ minHeight: 40, padding: '0 13px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontFamily: MONO, cursor: 'pointer' }}>⤓ Save</button>
        <button type="button" onClick={onClose} aria-label="Close"
          style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 15, cursor: 'pointer' }}>✕</button>
      </div>

      <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
        style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px 16px', overflow: 'auto' }}>
        {state.loading && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: MONO }}>Loading…</div>}
        {state.err && <div style={{ maxWidth: 340, fontSize: 13, color: state.undecodable ? 'rgba(255,255,255,0.75)' : '#e8697a', fontFamily: MONO, textAlign: 'center', lineHeight: 1.65 }}>⚠ {state.err}</div>}
        {state.href && !state.undecodable && (isPdf
          ? <iframe title="Document" src={state.href} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: '#fff' }} />
          : <img src={state.href} alt={name || ''} onClick={() => setZoom(z => !z)}
              style={{ maxWidth: zoom ? 'none' : '100%', maxHeight: zoom ? 'none' : '100%', width: zoom ? 'auto' : undefined,
                objectFit: 'contain', borderRadius: 8, cursor: zoom ? 'zoom-out' : 'zoom-in', display: 'block' }} />)}
      </div>

      {state.href && !isPdf && !state.undecodable && (
        <div style={{ flexShrink: 0, textAlign: 'center', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: MONO }}>
          Tap the image to {zoom ? 'fit' : 'zoom'}
        </div>
      )}
    </div>
  )
}
