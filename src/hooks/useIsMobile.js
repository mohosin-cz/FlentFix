import { useState, useEffect } from 'react'

export function useIsMobile(bp = 640) {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth <= bp)
  useEffect(() => {
    const on = () => setM(window.innerWidth <= bp)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [bp])
  return m
}
