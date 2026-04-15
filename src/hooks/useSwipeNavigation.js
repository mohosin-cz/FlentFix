import { useEffect, useRef } from 'react'

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight, enabled = true }) {
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const touchStartTime = useRef(null)

  useEffect(() => {
    if (!enabled) return

    const SWIPE_THRESHOLD = 60      // min px horizontal
    const VERTICAL_LIMIT  = 80      // max px vertical (prevents scroll conflict)
    const TIME_LIMIT      = 400     // max ms for swipe

    const handleTouchStart = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      touchStartX.current    = e.touches[0].clientX
      touchStartY.current    = e.touches[0].clientY
      touchStartTime.current = Date.now()
    }

    const handleTouchEnd = (e) => {
      if (touchStartX.current === null) return

      const deltaX  = e.changedTouches[0].clientX - touchStartX.current
      const deltaY  = e.changedTouches[0].clientY - touchStartY.current
      const elapsed = Date.now() - touchStartTime.current

      touchStartX.current    = null
      touchStartY.current    = null
      touchStartTime.current = null

      if (elapsed > TIME_LIMIT)             return
      if (Math.abs(deltaY) > VERTICAL_LIMIT) return
      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return

      if (deltaX < 0 && onSwipeLeft)  onSwipeLeft()
      if (deltaX > 0 && onSwipeRight) onSwipeRight()
    }

    // Trackpad / mouse pointer support
    let pointerStartX    = null
    let pointerStartY    = null
    let pointerStartTime = null
    let isPointerDown    = false

    const handlePointerDown = (e) => {
      if (e.pointerType !== 'mouse') return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      pointerStartX    = e.clientX
      pointerStartY    = e.clientY
      pointerStartTime = Date.now()
      isPointerDown    = true
    }

    const handlePointerUp = (e) => {
      if (!isPointerDown || e.pointerType !== 'mouse') return
      isPointerDown = false

      const deltaX  = e.clientX - pointerStartX
      const deltaY  = e.clientY - pointerStartY
      const elapsed = Date.now() - pointerStartTime

      pointerStartX = null
      pointerStartY = null

      if (elapsed > TIME_LIMIT)             return
      if (Math.abs(deltaY) > VERTICAL_LIMIT) return
      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return

      if (deltaX < 0 && onSwipeLeft)  onSwipeLeft()
      if (deltaX > 0 && onSwipeRight) onSwipeRight()
    }

    document.addEventListener('touchstart',  handleTouchStart,  { passive: true })
    document.addEventListener('touchend',    handleTouchEnd,    { passive: true })
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('pointerup',   handlePointerUp)

    return () => {
      document.removeEventListener('touchstart',  handleTouchStart)
      document.removeEventListener('touchend',    handleTouchEnd)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointerup',   handlePointerUp)
    }
  }, [onSwipeLeft, onSwipeRight, enabled])
}
