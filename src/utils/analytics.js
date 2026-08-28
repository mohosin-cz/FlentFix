// Formatting, palette and export helpers shared by the analytics pages. Kept
// out of the component file so fast refresh keeps working there.

export const SANS = 'var(--font-sans, Poppins, sans-serif)'
export const MONO = 'var(--font-mono, monospace)'

export const money = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
export const compact = (n) => {
  const v = Math.abs(Number(n || 0))
  if (v >= 1e7) return '₹' + (n / 1e7).toFixed(2) + 'Cr'
  if (v >= 1e5) return '₹' + (n / 1e5).toFixed(2) + 'L'
  if (v >= 1e3) return '₹' + Math.round(n / 1e3) + 'k'
  return '₹' + Math.round(n)
}
export const mLabel = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
export const mShort = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'short' })

// Percentage change between two periods — null when there is no base to compare
// against, so a caller can tell "no previous month" from "no change".
export const pctChange = (a, b) => (!b ? null : ((a - b) / b) * 100)
// Share of a whole, as a whole number.
export const share = (n, d) => (d ? Math.round((n / d) * 100) : 0)

// Categorical slots 1–3 of the reference palette, dark steps. Validated against
// this app's panel surface (#1e2028): all-pairs CVD ΔE 9.4, normal-vision 26.5,
// contrast ≥ 3:1 (dataviz validate_palette.js, dark mode).
export const S1 = '#3987e5'
export const S2 = '#d95926'
export const S3 = '#199e70'
// Not a categorical hue. Anything unknown or unrecorded is drawn in muted ink so
// it reads as an absence rather than as a fourth category.
export const NEUTRAL = 'var(--text-muted, #6b6d82)'
export const GRID = 'var(--border, #2e3040)'
export const SURFACE = 'var(--bg-panel, #1e2028)'


// Comma-safe CSV, downloaded client-side. Payment data carries vendor names and
// amounts, so it never leaves the browser.
export function downloadCsv(filename, cols, rows) {
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [cols.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const el = document.createElement('a')
  el.href = url; el.download = filename
  document.body.appendChild(el); el.click(); document.body.removeChild(el); URL.revokeObjectURL(url)
}
