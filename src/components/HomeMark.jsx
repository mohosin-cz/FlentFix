import { useNavigate } from 'react-router-dom'

// The page's way home, as a breadcrumb: a quiet "pulse" (tap → Home), a light
// slash, then the page's own name beside it. Used on pages that carry their
// own bar instead of the main nav; going back is the browser's job — trackpad
// swipe, or the back key. `bare` drops the slash (bars with a centred title).
export default function HomeMark({ style, bare = false }) {
  const navigate = useNavigate()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, ...style }}>
      <button type="button" onClick={() => navigate('/')} aria-label="Pulse — go to Home" title="Home"
        style={{ background: 'none', border: 'none', padding: '6px 2px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted, #6b6d82)' }}>
        <span className="pulse-title" style={{ fontSize: 15, lineHeight: 1, color: 'inherit' }}>pulse</span>
      </button>
      {!bare && <span aria-hidden="true" style={{ color: 'var(--border-dash, #3a3d52)', fontSize: 18, fontWeight: 300, lineHeight: 1 }}>/</span>}
    </span>
  )
}
