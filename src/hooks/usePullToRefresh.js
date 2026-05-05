import { useEffect, useRef, useState } from 'react'

export const usePullToRefresh = (onRefresh) => {
  const [isPulling, setIsPulling]       = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startY       = useRef(0)
  const isPullingRef = useRef(false)
  const pullDistRef  = useRef(0)
  const THRESHOLD    = 70

  useEffect(() => {
    if (window.innerWidth > 640) return

    const onTouchStart = (e) => {
      if (window.scrollY > 10) return
      startY.current = e.touches[0].clientY
      isPullingRef.current = true
      setIsPulling(true)
    }

    const onTouchMove = (e) => {
      if (!isPullingRef.current) return
      const distance = e.touches[0].clientY - startY.current
      if (distance > 0) {
        e.preventDefault()
        const d = Math.min(distance * 0.5, 100)
        pullDistRef.current = d
        setPullDistance(d)
      }
    }

    const onTouchEnd = async () => {
      if (pullDistRef.current >= THRESHOLD) {
        setIsRefreshing(true)
        try {
          await onRefresh()
        } finally {
          setIsRefreshing(false)
        }
      }
      isPullingRef.current = false
      pullDistRef.current  = 0
      setIsPulling(false)
      setPullDistance(0)
    }

    document.addEventListener('touchstart', onTouchStart, { passive: false })
    document.addEventListener('touchmove',  onTouchMove,  { passive: false })
    document.addEventListener('touchend',   onTouchEnd)

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove',  onTouchMove)
      document.removeEventListener('touchend',   onTouchEnd)
    }
  }, [onRefresh])

  return { isPulling, pullDistance, isRefreshing }
}
