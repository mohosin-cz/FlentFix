import { useState, useRef, useEffect, useCallback } from 'react'

// A real camera, not a file picker.
//
// <input capture> is a request, not a guarantee: Android Chrome honours it
// only when it feels like it, and on plenty of handsets — and inside an
// installed PWA — it quietly falls back to the document picker, which is why
// "take photo" was opening the gallery. getUserMedia has no such ambiguity:
// it either gives you a live stream or it throws. Onboard.jsx already reached
// the same conclusion for the vendor selfie ("No file input, ever").
//
// Inspections shoot several photos per item, so this stays open and
// accumulates until you're done.
//
// If the camera genuinely cannot start — no permission, no device, or an
// insecure origin, since getUserMedia needs https or localhost — it says so
// in plain words and offers the file picker rather than leaving you stuck.

const JPEG_QUALITY = 0.92

export default function LiveCameraSheet({ open, onClose, onDone, onFallback, title = 'Take photo' }) {
  const videoRef  = useRef(null)
  const streamRef = useRef(null)
  const [facing, setFacing]     = useState('environment')
  const [ready, setReady]       = useState(false)
  const [error, setError]       = useState('')
  const [shots, setShots]       = useState([])   // { blob, url }
  const [flash, setFlash]       = useState(false)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setReady(false)
  }, [])

  const start = useCallback(async (mode) => {
    setError('')
    if (!window.isSecureContext) {
      setError('The camera needs a secure connection. Open Pulse over https (or on localhost) and try again.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not provide camera access.')
      return
    }
    try {
      // exact:'environment' fails outright on devices with one camera, so ask
      // for a preference and let the browser pick if it cannot match.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setReady(true)
    } catch (err) {
      const n = err?.name
      if (n === 'NotAllowedError' || n === 'SecurityError') {
        setError('Camera permission is blocked. Tap the lock or ⓘ icon next to the web address → Permissions → Camera → Allow, then reopen this.')
      } else if (n === 'NotFoundError' || n === 'DevicesNotFoundError' || n === 'OverconstrainedError') {
        setError('No usable camera was found on this device.')
      } else if (n === 'NotReadableError') {
        setError('The camera is already in use by another app. Close it and try again.')
      } else {
        setError('Could not start the camera: ' + (err?.message || n || 'unknown error'))
      }
    }
  }, [])

  // Started off a timeout rather than inline: the sheet gets to paint its
  // "Starting camera…" state first, and the permission prompt no longer fires
  // during the commit that opened it.
  useEffect(() => {
    if (!open) return undefined
    const t = setTimeout(() => start(facing), 0)
    return () => { clearTimeout(t); stop() }
  }, [open, facing, start, stop])

  // Revoke preview URLs on unmount only. Depending on `shots` here would run
  // the cleanup on every capture and revoke the thumbnails still on screen —
  // the second photo would blank the first.
  const shotsRef = useRef(shots)
  useEffect(() => { shotsRef.current = shots }, [shots])
  useEffect(() => () => { shotsRef.current.forEach(s => URL.revokeObjectURL(s.url)) }, [])

  function capture() {
    const v = videoRef.current
    if (!v || !v.videoWidth) { setError('Camera is still warming up — try again in a second.'); return }
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    // The front camera previews mirrored; un-mirror so the file matches what
    // the inspector actually saw rather than a flipped copy.
    if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (!blob) { setError('Could not capture the photo — please retry.'); return }
      setShots(prev => [...prev, { blob, url: URL.createObjectURL(blob) }])
      setFlash(true); setTimeout(() => setFlash(false), 140)
    }, 'image/jpeg', JPEG_QUALITY)
  }

  function drop(i) {
    setShots(prev => {
      URL.revokeObjectURL(prev[i].url)
      return prev.filter((_, n) => n !== i)
    })
  }

  function done() {
    const stamp = Date.now()
    const files = shots.map((s, i) =>
      new File([s.blob], `photo_${stamp}_${i + 1}.jpg`, { type: 'image/jpeg' }))
    stop()
    setShots([])
    onDone(files)
  }

  function cancel() { stop(); shots.forEach(s => URL.revokeObjectURL(s.url)); setShots([]); onClose() }

  if (!open) return null

  return (
    <div style={S.wrap} role="dialog" aria-modal="true" aria-label={title}>
      <div style={S.bar}>
        <button onClick={cancel} style={S.barBtn} aria-label="Cancel">✕</button>
        <span style={S.barTitle}>{title}{shots.length > 0 ? ` · ${shots.length}` : ''}</span>
        <button onClick={() => setFacing(f => (f === 'environment' ? 'user' : 'environment'))}
          style={S.barBtn} aria-label="Switch camera" disabled={!ready}>⟳</button>
      </div>

      <div style={S.stage}>
        <video ref={videoRef} playsInline muted autoPlay
          style={{ ...S.video, transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
        {flash && <div style={S.flash} />}
        {!ready && !error && <div style={S.hint}>Starting camera…</div>}
        {error && (
          <div style={S.err}>
            <div style={S.errText}>{error}</div>
            <div style={S.errActions}>
              <button style={S.errBtn} onClick={() => start(facing)}>Try again</button>
              {onFallback && (
                <button style={S.errBtn} onClick={() => { stop(); onFallback() }}>Choose a file instead</button>
              )}
            </div>
          </div>
        )}
      </div>

      {shots.length > 0 && (
        <div style={S.strip}>
          {shots.map((s, i) => (
            <div key={s.url} style={S.thumbWrap}>
              <img src={s.url} alt={`Shot ${i + 1}`} style={S.thumb} />
              <button onClick={() => drop(i)} style={S.thumbX} aria-label={`Remove shot ${i + 1}`}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={S.controls}>
        <button onClick={cancel} style={S.textBtn}>Cancel</button>
        <button onClick={capture} disabled={!ready} style={{ ...S.shutter, opacity: ready ? 1 : 0.4 }} aria-label="Capture photo">
          <span style={S.shutterInner} />
        </button>
        <button onClick={done} disabled={shots.length === 0}
          style={{ ...S.textBtn, color: shots.length ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontWeight: 700 }}>
          {shots.length ? `Use ${shots.length}` : 'Use'}
        </button>
      </div>
    </div>
  )
}

const MONO = 'var(--font-mono, monospace)'
const S = {
  wrap: {
    position: 'fixed', inset: 0, zIndex: 4000, background: '#000',
    display: 'flex', flexDirection: 'column',
    paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
  },
  bar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', flexShrink: 0,
  },
  barBtn: {
    width: 44, height: 44, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.10)',
    color: '#fff', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  barTitle: { color: '#fff', fontSize: 12.5, fontFamily: MONO, letterSpacing: '0.04em' },
  stage: { flex: 1, position: 'relative', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  video: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  flash: { position: 'absolute', inset: 0, background: '#fff', opacity: 0.75, pointerEvents: 'none' },
  hint: { position: 'absolute', color: 'rgba(255,255,255,0.65)', fontSize: 12.5, fontFamily: MONO },
  err: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16, padding: '24px 26px', textAlign: 'center',
    background: 'rgba(0,0,0,0.75)',
  },
  errText: { color: '#e8697a', fontSize: 13, lineHeight: 1.65, fontFamily: MONO, maxWidth: 420 },
  errActions: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  errBtn: {
    minHeight: 44, padding: '0 16px', borderRadius: 9,
    background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.22)',
    color: '#fff', fontSize: 12.5, fontFamily: MONO, cursor: 'pointer',
  },
  strip: { display: 'flex', gap: 8, padding: '10px 12px', overflowX: 'auto', flexShrink: 0 },
  thumbWrap: { position: 'relative', flexShrink: 0 },
  thumb: { width: 58, height: 58, objectFit: 'cover', borderRadius: 8, display: 'block', border: '1px solid rgba(255,255,255,0.25)' },
  thumbX: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%',
    background: '#e05c6a', border: '2px solid #000', color: '#fff', fontSize: 12, lineHeight: 1,
    cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  controls: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 22px 22px', flexShrink: 0,
  },
  textBtn: {
    background: 'none', border: 'none', color: '#fff', fontSize: 13.5, fontFamily: MONO,
    cursor: 'pointer', minHeight: 44, minWidth: 76, textAlign: 'center',
  },
  shutter: {
    width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.16)',
    border: '3px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 0, flexShrink: 0,
  },
  shutterInner: { width: 56, height: 56, borderRadius: '50%', background: '#fff', display: 'block' },
}
