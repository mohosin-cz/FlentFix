import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Swipe-to-navigate: right-edge swipe → back, left-edge swipe → forward.
 * Only fires when the touch starts within `edgeZone` px of the screen edge,
 * so it won't interfere with any in-page horizontal scrolling.
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

      // Must travel far enough and be more horizontal than vertical
      if (Math.abs(dx) < minDist || Math.abs(dx) < Math.abs(dy) * 1.5) return

      if (dx > 0) {
        navigate(-1) // swipe right → back
      } else {
        navigate(1)  // swipe left  → forward
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [navigate, minDist, edgeZone])
}
