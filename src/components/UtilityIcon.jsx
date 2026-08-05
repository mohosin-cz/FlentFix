// Line icons for the utility types, replacing the emoji that used to stand in
// for them. Stroked with currentColor so the call site sets the colour, and
// they render identically on every platform — which emoji do not.

const PATHS = {
  wifi: (
    <>
      <path d="M2.5 8.5a13 13 0 0 1 17 0" />
      <path d="M5.5 12a8.5 8.5 0 0 1 11 0" />
      <path d="M8.5 15.5a4 4 0 0 1 5 0" />
      <circle cx="11" cy="19" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  water_purifier: (
    <>
      <path d="M11 2.5c3.6 4.2 5.6 7.2 5.6 9.7a5.6 5.6 0 1 1-11.2 0c0-2.5 2-5.5 5.6-9.7Z" />
      <path d="M8.6 12.8a2.6 2.6 0 0 0 2.4 3.2" />
    </>
  ),
  other: (
    <>
      <path d="M6.5 3.5v5M14.5 3.5v5" />
      <path d="M3.8 8.5h14.4v2.2a7.2 7.2 0 0 1-14.4 0V8.5Z" />
      <path d="M11 17.9v3.1" />
    </>
  ),
}

export default function UtilityIcon({ type, size = 18, style }) {
  const d = PATHS[type] || PATHS.other
  return (
    <svg
      width={size} height={size} viewBox="0 0 22 22" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }} aria-hidden="true"
    >
      {d}
    </svg>
  )
}
