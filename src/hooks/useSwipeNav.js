import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Swipe-to-navigate
 *
 * Mobile (touch):
 *   Edge-zone only (starts within edgeZone px of screen edge).
 *   Swipe right → back, swipe left → forward.
 *
 * Desktop (trackpad):
 *   Looks for a single wheel event with high deltaX (deliberate swipe).
 *   Ignores mouse wheels (deltaMode !== 0) and momentum/inertia events (small deltaX).
 *   Skips elements that are themselves horizontally scrollable.
 */

// Walk up the DOM to check if el or any ancestor can scroll horizontally
function isHScrollable(el) {
  while (el && el !== document.documentElement) {
    const ox = getComputedStyle(el).overflowX
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 4) return true
    el = el.parentElement
  }
  return false
}

export function useSwipeNav({
  minTouchDist   = 72,   // minimum px for touch swipe
  edgeZone       = 28,   // touch must start within this many px of screen edge
  wheelMinDeltaX = 40,   // single trackpad event must exceed this to count
  wheelRatio     = 2.5,  // deltaX must be this many times greater than deltaY
  cooldownMs     = 800,  // ignore further gestures for this long after navigating
} = {}) {
  const navigate = useNavigate()

  useEffect(() => {
    let cooldown = false

    // ── Touch (mobile) ──────────────────────────────────────────────────────
    let startX = 0
    let startY = 0
    let eligible = false

    function onTouchStart(e) {
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      eligible = startX <= edgeZone || startX >= window.innerWidth - edgeZone
    }

    function onTouchEnd(e) {
      if (!eligible || cooldown) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) < minTouchDist || Math.abs(dx) < Math.abs(dy) * 1.5) return
      cooldown = true
      setTimeout(() => { cooldown = false }, cooldownMs)
      dx > 0 ? navigate(-1) : navigate(1)
    }

    // ── Trackpad wheel (desktop) ─────────────────────────────────────────────
    function onWheel(e) {
      if (cooldown) return
      // deltaMode 0 = pixels (trackpad). Ignore line/page scroll (physical mouse wheel)
      if (e.deltaMode !== 0) return
      // Must be strongly horizontal — filter diagonal or vertical scrolls
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * wheelRatio) return
      // Single event must show decisive swipe velocity
      if (Math.abs(e.deltaX) < wheelMinDeltaX) return
      // Skip if the target element can scroll horizontally itself
      if (isHScrollable(e.target)) return

      cooldown = true
      setTimeout(() => { cooldown = false }, cooldownMs)
      // deltaX > 0 = fingers moved left  → forward
      // deltaX < 0 = fingers moved right → back
      e.deltaX > 0 ? navigate(1) : navigate(-1)
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend',   onTouchEnd,   { passive: true })
    window.addEventListener('wheel',        onWheel,      { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend',   onTouchEnd)
      window.removeEventListener('wheel',        onWheel)
    }
  }, [navigate, minTouchDist, edgeZone, wheelMinDeltaX, wheelRatio, cooldownMs])
}
