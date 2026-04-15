import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Swipe-to-navigate — two input sources:
 *
 * Touch (mobile):  edge-zone only (starts within 28px of screen edge)
 *                  swipe right → back, swipe left → forward
 *
 * Trackpad (desktop): wheel deltaX accumulation
 *                     skips elements that are themselves horizontally scrollable
 *                     swipe right (deltaX < 0) → back, swipe left (deltaX > 0) → forward
 */

function isHScrollable(el) {
  while (el && el !== document.documentElement) {
    const ox = getComputedStyle(el).overflowX
    if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth) return true
    el = el.parentElement
  }
  return false
}

export function useSwipeNav({ minDist = 72, edgeZone = 28, wheelThreshold = 160 } = {}) {
  const navigate = useNavigate()

  useEffect(() => {
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
      if (!eligible) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (Math.abs(dx) < minDist || Math.abs(dx) < Math.abs(dy) * 1.5) return
      dx > 0 ? navigate(-1) : navigate(1)
    }

    // ── Trackpad / wheel (desktop) ───────────────────────────────────────────
    let accX = 0
    let resetTimer = null
    let cooldown = false

    function onWheel(e) {
      // Ignore vertical-dominant scrolls
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return
      // Ignore if the target itself can scroll horizontally
      if (isHScrollable(e.target)) return
      if (cooldown) return

      accX += e.deltaX

      clearTimeout(resetTimer)
      resetTimer = setTimeout(() => { accX = 0 }, 300)

      if (Math.abs(accX) >= wheelThreshold) {
        const dir = accX
        accX = 0
        clearTimeout(resetTimer)
        cooldown = true
        setTimeout(() => { cooldown = false }, 900)
        // deltaX < 0 = fingers moved right = go back
        // deltaX > 0 = fingers moved left  = go forward
        dir < 0 ? navigate(-1) : navigate(1)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('wheel', onWheel)
      clearTimeout(resetTimer)
    }
  }, [navigate, minDist, edgeZone, wheelThreshold])
}
