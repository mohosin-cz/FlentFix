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
const DOT = 10

// warp knobs — the design lives here
const BOW = 0.52      // how far rows spread apart at the centre
const LIFT = 0.40     // how much the whole band arcs upward
const GROW = 0.16     // dot swell where the glass is thickest
const SQUEEZE = 0.00  // edge column compression; 0 keeps letters exactly spaced

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

// The warped mark is ~3.07:1, where the flat one was ~5:1. `height` stays an
// accepted prop, but it has no default: passing width alone lets the viewBox
// set the height, so the curve can never be squashed back into the old box.
const PulseLogo = ({ width = 110, height }) => {
  const totalW = GRID.vbW + 74      // room for the ECG tick
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
          rx={(d.size * 0.18).toFixed(2)}
          fill={d.on ? AMBER : DIM}
          opacity={d.on ? 1 : 0.55}
        />
      ))}
      {/* The display curves; the signal doesn't. */}
      <path
        d={`M${(GRID.vbW + 14).toFixed(0)} ${(GRID.vbH / 2).toFixed(0)} h13 l6 -17 l6 31 l6 -14 h14`}
        fill="none"
        stroke={AMBER}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function PixelLogo({ width = 110, height }) {
  return <PulseLogo width={width} height={height} />
}
