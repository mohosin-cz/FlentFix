import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// The page's way home, as a breadcrumb: a quiet "pulse" (tap → Home), a light
// slash, then the page's own name beside it. Used on pages that carry their
// own bar instead of the main nav; going back is the browser's job — trackpad
// swipe, or the back key. `bare` drops the slash (bars with a centred title).
// A tap swells the wordmark — a heartbeat — then goes Home.
export const PULSE_POP_CSS = `
@keyframes pulse-pop { 0% { transform: scale(1) } 45% { transform: scale(1.35) } 100% { transform: scale(1) } }
.pulse-pop { animation: pulse-pop 320ms cubic-bezier(.3,1.6,.5,1); display: inline-block; transform-origin: center }
@media (prefers-reduced-motion: reduce) { .pulse-pop { animation: none } }`

export function usePulseHome() {
  const navigate = useNavigate()
  const [pop, setPop] = useState(0)
  const go = () => {
    setPop(n => n + 1)
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setTimeout(() => navigate('/'), reduce ? 0 : 200)
  }
  return { pop, go }
}

export default function HomeMark({ style, bare = false }) {
  const { pop, go } = usePulseHome()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, ...style }}>
      <style>{PULSE_POP_CSS}</style>
      <button type="button" onClick={go} aria-label="Pulse — go to Home" title="Home"
        style={{ background: 'none', border: 'none', padding: '6px 2px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted, #6b6d82)' }}>
        <span key={pop} className={`pulse-title${pop ? ' pulse-pop' : ''}`} style={{ fontSize: 15, lineHeight: 1, color: 'inherit' }}>pulse</span>
      </button>
      {!bare && <span aria-hidden="true" style={{ color: 'var(--border-dash, #3a3d52)', fontSize: 18, fontWeight: 300, lineHeight: 1 }}>/</span>}
    </span>
  )
}
