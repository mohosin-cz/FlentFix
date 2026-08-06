// ─── Pulse dot-matrix logo, cylindrically warped ─────────────────────────────
// Rows bow and dots swell toward the centre; column spacing is untouched, which
// is what keeps the wordmark legible. Geometry is computed rather than filtered:
// SVG filters render inconsistently across browsers and break in favicons.
const FONT = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
}
const WORD = 'PULSE'
const ROWS = 7
const GAP = 1
const COLS = WORD.length * 5 + (WORD.length - 1) * GAP   // 29
const CELL = 14
const DOT = 11.5      // of a 14 cell — fat enough that strokes read as continuous at 110px

// warp knobs — the design lives here
const BOW = 0.12      // how far rows spread apart at the centre
const LIFT = 0.34     // how much the whole band arcs upward
const GROW = 0.12     // dot swell where the glass is thickest
const SQUEEZE = 0.00  // edge column compression; 0 keeps letters exactly spaced

// BOW is the constant to be careful with. It scales row SPACING, so a large
// value stretches the middle letters taller than the outer ones and the
// wordmark reads as sagging rather than curving. LIFT carries the curve — it
// translates whole columns along an arc and leaves letterforms alone. When the
// curve needs to be stronger, raise LIFT, not BOW.

const RADIUS = 0.28   // dot corner rounding; square reads blocky, circular reads soft
const FIELD = 0.13    // unlit dot opacity — a panel you can sense, not a grid you read

const AMBER = '#E0A93F'
const DIM = '#3A3324'

function buildCells() {
  const lit = new Set()
  let x = 0
  for (const ch of WORD) {
    const g = FONT[ch]
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < 5; c++)
        if (g[r][c] === '1') lit.add(`${x + c},${r}`)
    x += 5 + GAP
  }

  const w = COLS * CELL
  const h = ROWS * CELL
  const cx = w / 2
  const cy = h / 2
  const cells = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const px = (c + 0.5) * CELL - cx
      const py = (r + 0.5) * CELL - cy
      const u = px / (w / 2)
      const fall = Math.max(0, 1 - u * u)          // 1 at centre, 0 at the ends

      const X = cx + px * (1 - SQUEEZE * u * u)
      const Y = cy + py * (1 + BOW * fall) - LIFT * (h / 2) * fall
      const size = Math.max(DOT * (1 + GROW * fall), DOT * 0.4)

      cells.push({ X, Y, size, on: lit.has(`${c},${r}`) })
      minX = Math.min(minX, X - size / 2); maxX = Math.max(maxX, X + size / 2)
      minY = Math.min(minY, Y - size / 2); maxY = Math.max(maxY, Y + size / 2)
    }
  }

  const pad = 10
  return {
    cells,
    ox: pad - minX,
    oy: pad - minY,
    vbW: maxX - minX + pad * 2,
    vbH: maxY - minY + pad * 2,
  }
}

const GRID = buildCells()   // computed once at module load, not per render

const TICK_GAP = 56         // room for the ECG tick
const TICK_SCALE = 0.85     // sized against the mark, not the old 300-wide box

// The warped mark is ~3:1, where the flat one was ~5:1. `height` stays an
// accepted prop, but it has no default: passing width alone lets the viewBox
// set the height, so the curve can never be squashed back into the old box.
const PulseLogo = ({ width = 110, height }) => {
  const totalW = GRID.vbW + TICK_GAP
  const tx = GRID.vbW + 16
  const ty = GRID.vbH / 2
  const s = TICK_SCALE
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${totalW.toFixed(0)} ${GRID.vbH.toFixed(0)}`}
      role="img"
      aria-label="Pulse"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <title>Pulse</title>
      {GRID.cells.map((d, i) => (
        <rect
          key={i}
          x={(d.X + GRID.ox - d.size / 2).toFixed(2)}
          y={(d.Y + GRID.oy - d.size / 2).toFixed(2)}
          width={d.size.toFixed(2)}
          height={d.size.toFixed(2)}
          rx={(d.size * RADIUS).toFixed(2)}
          fill={d.on ? AMBER : DIM}
          opacity={d.on ? 1 : FIELD}
        />
      ))}
      {/* The display curves; the signal doesn't. */}
      <path
        d={`M${tx.toFixed(0)} ${ty.toFixed(0)} h${(13 * s).toFixed(1)} l${(6 * s).toFixed(1)} ${(-17 * s).toFixed(1)} l${(6 * s).toFixed(1)} ${(31 * s).toFixed(1)} l${(6 * s).toFixed(1)} ${(-14 * s).toFixed(1)} h${(14 * s).toFixed(1)}`}
        fill="none"
        stroke={AMBER}
        strokeWidth={(3.2 * s).toFixed(2)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function PixelLogo({ width = 110, height }) {
  return <PulseLogo width={width} height={height} />
}
