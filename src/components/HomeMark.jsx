import { useNavigate } from 'react-router-dom'

// The page's way home: the pulse wordmark, in the nav's own type. Pages that
// carry their own bar (no main nav) put this where a back button used to be;
// going back is the browser's job — trackpad swipe, or the back key.
export default function HomeMark({ style }) {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/')} aria-label="Pulse — go to Home" title="Home"
      style={{ background: 'none', border: 'none', padding: '6px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0, color: 'var(--text, #e8e8f0)', ...style }}>
      <span className="pulse-title" style={{ fontSize: 17, lineHeight: 1 }}>pulse</span>
    </button>
  )
}
