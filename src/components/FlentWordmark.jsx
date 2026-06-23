// variant: 'dark' (black wordmark, for light backgrounds) | 'light' (white wordmark, for dark backgrounds)
export default function FlentWordmark({ height = 28, variant = 'dark', style }) {
  return (
    <img
      src={variant === 'light' ? '/flent-logo-light.png' : '/flent-logo-dark.png'}
      alt="flent"
      height={height}
      style={{ display: 'block', width: 'auto', ...style }}
    />
  )
}
