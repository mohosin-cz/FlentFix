import { useEffect, useRef, useCallback } from 'react'

export function useSwipeNavigation({ onNext, onPrev, enabled = true }) {
  const state = useRef({
    startX: null, startY: null, startTime: null, tracking: false
  })

  const handleNext = useCallback(() => { if (onNext) onNext() }, [onNext])
  const handlePrev = useCallback(() => { if (onPrev) onPrev() }, [onPrev])

  useEffect(() => {
    if (!enabled) return

    const MIN_X    = 50   // minimum horizontal distance px
    const MAX_Y    = 100  // maximum vertical distance px
    const MAX_TIME = 500  // maximum duration ms

    const isInputTarget = (el) =>
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el?.tagName)

    // ── TOUCH (mobile) ──────────────────────────────────────────────────────
    const onTouchStart = (e) => {
      if (isInputTarget(e.target)) return
      const t = e.touches[0]
      state.current = { startX: t.clientX, startY: t.clientY, startTime: Date.now(), tracking: true }
    }

    const onTouchEnd = (e) => {
      const s = state.current
      if (!s.tracking) return
      state.current.tracking = false

      const t  = e.changedTouches[0]
      const dx = t.clientX - s.startX
      const dy = t.clientY - s.startY
      const dt = Date.now() - s.startTime

      if (dt > MAX_TIME) return
      if (Math.abs(dy) > MAX_Y) return
      if (Math.abs(dx) < MIN_X) return

      if (dx < 0) handleNext()
      else        handlePrev()
    }

    const onTouchCancel = () => { state.current.tracking = false }

    // ── TRACKPAD (Mac two-finger swipe) ─────────────────────────────────────
    // Wheel fires many events per gesture — cooldown ensures we navigate once.
    let wheelLocked = false

    const onWheel = (e) => {
      if (wheelLocked) return
      if (Math.abs(e.deltaX) < 30) return
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) return
      if (isInputTarget(e.target)) return

      e.preventDefault()
      wheelLocked = true
      setTimeout(() => { wheelLocked = false }, 800)

      if (e.deltaX > 0) handleNext()
      else              handlePrev()
    }

    document.addEventListener('touchstart',  onTouchStart,  { passive: true  })
    document.addEventListener('touchend',    onTouchEnd,    { passive: true  })
    document.addEventListener('touchcancel', onTouchCancel, { passive: true  })
    document.addEventListener('wheel',       onWheel,       { passive: false })

    return () => {
      document.removeEventListener('touchstart',  onTouchStart)
      document.removeEventListener('touchend',    onTouchEnd)
      document.removeEventListener('touchcancel', onTouchCancel)
      document.removeEventListener('wheel',       onWheel)
    }
  }, [enabled, handleNext, handlePrev])
}
