// The properties a vendor was logged at in a month, as chips.
//
// Attendance stamps a PID on every punch, so by the time invoices are raised
// the app already knows where each vendor worked and for how long. This shows
// that beside the split being set — and lets one be added with a tap, which is
// the quick fix for a month that was nearly right.
//
// Lives in its own file because both the invoice stage and the card flow show
// it, and importing it from either would make the two import each other.

const MONO = 'var(--font-mono, monospace)'
const lbl = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: MONO }

export default function LoggedPids({ logged, propName, onPick, note }) {
  if (!logged || !logged.length) {
    return <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>No attendance logged this month — set the PIDs by hand.</div>
  }
  const days = logged.reduce((s, e) => s + e.days, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ ...lbl, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span>Logged at · {logged.length} propert{logged.length === 1 ? 'y' : 'ies'} · {days} day{days === 1 ? '' : 's'}</span>
        {note && <span style={{ color: 'var(--text-dim, #9394a8)', textTransform: 'none', letterSpacing: 0 }}>{note}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {logged.map(e => {
          const name = propName?.[e.pid]
          return (
            <button key={e.pid} type="button" onClick={onPick ? () => onPick(e) : undefined}
              title={`${name || 'Unknown property'} · ${e.days} day${e.days === 1 ? '' : 's'}${onPick ? ' — tap to add as a line' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 999, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 11, cursor: onPick ? 'pointer' : 'default', maxWidth: 220 }}>
              <span style={{ fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{e.pid}</span>
              {name && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>}
              <span style={{ color: 'var(--accent, #c8963e)' }}>{e.days}d</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
