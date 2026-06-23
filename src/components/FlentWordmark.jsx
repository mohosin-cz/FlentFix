// variant: 'dark' (black on light bg) | 'light' (white on dark bg)
export default function FlentWordmark({ height = 28, variant = 'dark', style }) {
  return (
    <img
      src="/flent-logo-dark.jpg"
      alt="flent"
      height={height}
      style={{
        display: 'block',
        width: 'auto',
        filter: variant === 'light' ? 'brightness(0) invert(1)' : 'none',
        ...style,
      }}
    />
  )
}
