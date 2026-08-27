import { useState, useEffect, useCallback } from 'react'
import { typeForPath } from '../../utils/assetFiles'

// Look at a stored document without downloading it.
//
// Objects in vendor-docs were written without a content type, so they come
// back as application/octet-stream — which no browser will render inline, so
// following the link just saves the file. Rather than only fixing it for
// uploads from here on and leaving every existing document unviewable, this
// fetches the bytes and rebuilds the blob with the type the extension implies.
// The viewer then renders from an object URL it controls, so what the server
// claims the file is stops mattering.
//
// Download stays available — it is just no longer the only thing on offer.

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
        // Trust the extension over the server: these objects are all stored as
        // octet-stream, so the response type tells us nothing useful.
        const type = typeForPath(name || url) || raw.type || 'application/octet-stream'
        objectUrl = URL.createObjectURL(raw.type === type ? raw : new Blob([raw], { type }))
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
        {state.err && <div style={{ fontSize: 13, color: '#e8697a', fontFamily: MONO, textAlign: 'center', lineHeight: 1.6 }}>⚠ {state.err}</div>}
        {state.href && (isPdf
          ? <iframe title="Document" src={state.href} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: '#fff' }} />
          : <img src={state.href} alt={name || ''} onClick={() => setZoom(z => !z)}
              style={{ maxWidth: zoom ? 'none' : '100%', maxHeight: zoom ? 'none' : '100%', width: zoom ? 'auto' : undefined,
                objectFit: 'contain', borderRadius: 8, cursor: zoom ? 'zoom-out' : 'zoom-in', display: 'block' }} />)}
      </div>

      {state.href && !isPdf && (
        <div style={{ flexShrink: 0, textAlign: 'center', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: MONO }}>
          Tap the image to {zoom ? 'fit' : 'zoom'}
        </div>
      )}
    </div>
  )
}
