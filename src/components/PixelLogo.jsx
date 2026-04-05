// ─── FlentFix Pixel Wordmark ──────────────────────────────────────────────────
// Block-tile style, mixed case: F-l-e-n-t-F-i-x
// Each lit pixel is a 2×2 sub-tile quad with highlight/shadow shading.

const C  = 10    // cell size px
const G  = 1     // gap between cells
const S  = C + G // step = 11px
const LG = 7     // extra gap between letters

// ─── Tile shading ─────────────────────────────────────────────────────────────
const TL = '#e8b864'   // top-left  — highlight
const TM = '#cc9a3c'   // mid
const TD = '#a07020'   // bottom-right — shadow

const SUB = Math.floor((C - 3) / 2)  // sub-tile size = 3
const IG  = C - 2 - 2 * SUB          // inner gap

function Block({ x, y }) {
  const x1 = x + 1, x2 = x + 1 + SUB + IG
  const y1 = y + 1, y2 = y + 1 + SUB + IG
  return (
    <>
      <rect x={x1} y={y1} width={SUB} height={SUB} fill={TL} rx={0.5} />
      <rect x={x2} y={y1} width={SUB} height={SUB} fill={TM} rx={0.5} />
      <rect x={x1} y={y2} width={SUB} height={SUB} fill={TM} rx={0.5} />
      <rect x={x2} y={y2} width={SUB} height={SUB} fill={TD} rx={0.5} />
    </>
  )
}

// ─── Mixed-case 5×7 pixel font ───────────────────────────────────────────────
// Uppercase: F (×2)
// Lowercase: l e n t i x
const GLYPHS = {
  // ── Uppercase ──
  F: [
    [1,1,1,1,1],
    [1,0,0,0,0],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
  ],
  // ── Lowercase ──
  l: [
    [0,1,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,1,1,1,0],
  ],
  e: [
    [0,0,0,0,0],
    [0,0,0,0,0],
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,1,1,1,1],
    [1,0,0,0,0],
    [0,1,1,1,1],
  ],
  n: [
    [0,0,0,0,0],
    [0,0,0,0,0],
    [1,0,1,1,0],
    [1,1,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
  ],
  t: [
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,1,1,1,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,1],
    [0,0,0,1,0],
  ],
  i: [
    [0,0,1,0,0],
    [0,0,0,0,0],
    [0,1,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,0,1,0,0],
    [0,1,1,1,0],
  ],
  x: [
    [0,0,0,0,0],
    [0,0,0,0,0],
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,1,0,1,0],
    [1,0,0,0,1],
  ],
}

// ─── "FlentFix" word sequence ─────────────────────────────────────────────────
const WORD = ['F','l','e','n','t','F','i','x']

function charWidth(g) { return 5 * S - G }

// Compute total viewBox width
const charWidths = WORD.map(c => charWidth(GLYPHS[c]))
const TW = charWidths.reduce((a, b) => a + b, 0) + (WORD.length - 1) * LG
const CH = 7 * S - G
const PX = 8
const PY = 8
const VW = TW + PX * 2
const VH = CH + PY * 2

// ─── Full wordmark ────────────────────────────────────────────────────────────
export default function PixelLogo({ width = VW, height = VH, bg = '#16171f', rounded = 6, style, className }) {
  const blocks = []
  let ox = PX

  WORD.forEach((char, ci) => {
    const glyph = GLYPHS[char]
    glyph.forEach((row, ri) =>
      row.forEach((on, col) => {
        if (!on) return
        blocks.push(<Block key={`${ci}-${ri}-${col}`} x={ox + col * S} y={PY + ri * S} />)
      })
    )
    ox += charWidth(glyph) + LG
  })

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', ...style }}
      className={className}
    >
      {bg && <rect width={VW} height={VH} fill={bg} rx={rounded} />}
      {blocks}
    </svg>
  )
}

// ─── "F" mark only ────────────────────────────────────────────────────────────
export function PixelMark({ size = 32, bg = '#16171f', style, className }) {
  const glyph = GLYPHS.F
  const pw = 4, ph = 4
  const mw = 5 * S - G + pw * 2
  const mh = 7 * S - G + ph * 2
  return (
    <svg
      viewBox={`0 0 ${mw} ${mh}`}
      width={size}
      height={Math.round(size * mh / mw)}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', ...style }}
      className={className}
    >
      {bg && <rect width={mw} height={mh} fill={bg} rx={4} />}
      {glyph.flatMap((row, ri) =>
        row.map((on, col) =>
          on ? <Block key={`${ri}-${col}`} x={pw + col * S} y={ph + ri * S} /> : null
        )
      )}
    </svg>
  )
}
