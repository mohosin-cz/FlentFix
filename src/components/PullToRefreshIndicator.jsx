export const PullToRefreshIndicator = ({ pullDistance, isRefreshing, threshold = 70 }) => {
  if (pullDistance === 0 && !isRefreshing) return null
  const progress  = Math.min(pullDistance / threshold, 1)
  const triggered = progress >= 1 || isRefreshing

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      paddingTop: `${Math.max(8, pullDistance * 0.5)}px`,
      zIndex: 9998,
      pointerEvents: 'none',
      transition: isRefreshing ? 'none' : undefined,
    }}>
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: 'rgba(18,19,26,0.92)',
        border: `2px solid ${triggered ? '#c8963e' : 'rgba(200,150,62,0.4)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-color 0.2s',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}>
        {isRefreshing ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
            style={{ animation: 'ptr-spin 0.8s linear infinite' }}>
            <circle cx="9" cy="9" r="7" stroke="rgba(200,150,62,0.2)" strokeWidth="2"/>
            <path d="M9 2a7 7 0 0 1 7 7" stroke="#c8963e" strokeWidth="2" strokeLinecap="round"/>
            <style>{`@keyframes ptr-spin { to { transform: rotate(360deg) } }`}</style>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
            style={{ transform: `rotate(${progress * 180}deg)`, transition: 'transform 0.1s' }}>
            <path d="M7 2v10M3 8l4 4 4-4" stroke="#c8963e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </div>
  )
}
