import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Touch swipe-to-navigate for mobile.
 * Desktop trackpad back/forward is handled natively by the browser — no wheel listener needed.
 *
 * Touch: edge-zone only (starts within edgeZone px of screen edge)
 *   swipe right → back, swipe left → forward
 */
export function useSwipeNav({ minDist = 72, edgeZone = 28 } = {}) {
  const navigate = useNavigate()

  useEffect(() => {
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
      if (!eligible) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) < minDist || Math.abs(dx) < Math.abs(dy) * 1.5) return
      dx > 0 ? navigate(-1) : navigate(1)
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [navigate, minDist, edgeZone])
}
