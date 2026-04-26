// ─── Pulse Wordmark ────────────────────────────────────────────────────────────
// Terminal-style amber text wordmark. Replaces the old FlentFix pixel-art logo.

export default function PixelLogo({ width = 160, height = 38, bg = '#16171f', rounded = 6, style, className }) {
  const fontSize = Math.round(height * 0.68)
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      className={className}
    >
      {bg && <rect width={width} height={height} rx={rounded} fill={bg} />}
      {/* "pulse" in monospace amber with a blinking cursor */}
      <text
        x={width / 2}
        y={height / 2 + fontSize * 0.36}
        textAnchor="middle"
        fontFamily="'JetBrains Mono', 'Courier New', monospace"
        fontWeight="700"
        fontSize={fontSize}
        letterSpacing="0.04em"
        fill="#c8963e"
      >
        pulse
      </text>
      {/* cursor blink rect — positioned right of the text */}
      <rect
        x={width / 2 + (fontSize * 2.62)}
        y={height / 2 - fontSize * 0.55}
        width={Math.max(2, Math.round(fontSize * 0.12))}
        height={fontSize * 0.9}
        rx={1}
        fill="#c8963e"
        opacity="0.75"
      />
    </svg>
  )
}
