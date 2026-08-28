import { useRef, useEffect, useCallback } from 'react'

const MONO = 'var(--font-mono, monospace)'

// ── signature pad ────────────────────────────────────────────────────────────
// Backed at device pixel ratio so a signature drawn on a phone isn't a blurry
// enlargement of a 300px bitmap. Pointer events cover mouse, pen and touch in
// one path, and touch-action:none stops the page scrolling under the finger
// that is trying to sign.
const PAD_H = 160

export default function SignaturePad({ onChange, disabled }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const last = useRef(null)

  // Keep the drawing surface the same size as the box it is displayed in.
  //
  // Sizing once at mount is not enough: the card narrows when the keyboard
  // opens, on rotation, or simply because the page laid out after this ran.
  // When the backing store and the CSS box disagree, every stroke lands at the
  // wrong scale and offset — a signature drawn across the pad ends up squeezed
  // into a corner of the PNG that gets stored.
  //
  // The canvas is never given an inline width: CSS drives the display size and
  // this only ever matches the bitmap to it. Existing ink is copied across, so
  // a re-fit mid-signature does not wipe what has been drawn.
  const fit = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const cssW = c.clientWidth || 1
    const needW = Math.round(cssW * dpr)
    const needH = Math.round(PAD_H * dpr)
    if (c.width === needW && c.height === needH) return

    let carry = null
    if (dirty.current && c.width && c.height) {
      carry = document.createElement('canvas')
      carry.width = c.width; carry.height = c.height
      carry.getContext('2d').drawImage(c, 0, 0)
    }

    c.width = needW; c.height = needH
    const ctx = c.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1a1c23'
    if (carry) ctx.drawImage(carry, 0, 0, cssW, PAD_H)
  }, [])

  useEffect(() => {
    fit()
    const ro = new ResizeObserver(fit)
    if (canvasRef.current) ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [fit])

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const start = (e) => {
    if (disabled) return
    // Fit here as well as on resize. ResizeObserver is the right instrument
    // but it can be throttled or absent, and a pad whose bitmap does not match
    // its box records every stroke at the wrong scale. This is the moment it
    // has to be right, and by now the layout has certainly settled.
    fit()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drawing.current = true
    last.current = pos(e)
  }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!dirty.current) { dirty.current = true; onChange(true) }
  }
  const end = () => { drawing.current = false; last.current = null }

  function clear() {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    dirty.current = false
    onChange(false)
  }

  // Exposed via the DOM node so the parent can pull the PNG without a ref API.
  useEffect(() => {
    const c = canvasRef.current
    if (c) c._readSignature = () => (dirty.current ? c.toDataURL('image/png') : null)
  })

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <div style={{ position: 'relative', background: '#fff', border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>
        <canvas ref={canvasRef}
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} onPointerCancel={end}
          style={{ display: 'block', width: '100%', maxWidth: '100%', height: PAD_H, touchAction: 'none', cursor: disabled ? 'not-allowed' : 'crosshair' }} />
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 20, height: 1, background: '#d1d5db', pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Sign with your finger</span>
        <button type="button" onClick={clear} disabled={disabled}
          style={{ marginInlineStart: 'auto', background: 'none', border: 'none', color: 'var(--text-dim, #9394a8)', fontSize: 12.5, fontFamily: MONO, cursor: 'pointer', padding: '0 8px', marginInlineEnd: -8, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Clear</button>
      </div>
    </div>
  )
}
