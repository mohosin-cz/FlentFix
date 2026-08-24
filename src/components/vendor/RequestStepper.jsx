import { STAGES, stageIndex, STAGE_LABEL } from '../../utils/assetRequest'

// Where a request has got to — and, just as importantly, how long it has been
// sitting there.
//
// This replaced a liquid fill, which was the wrong instrument twice over.
// Liquid is a continuous quantity and this is five discrete stages: "80% full"
// means nothing when you are either at Deployed or you are not. And it
// animated everywhere at once, including across stages that finished a
// fortnight ago, so the motion carried no information.
//
// Three rules here instead:
//
//   1. Discrete stages get discrete segments. The structure is the message.
//   2. Motion means "this is where it is now". Exactly one segment moves —
//      the current one — so movement on the page is always meaningful.
//   3. Completed stages recede. They are history; the live edge is the news.
//
// And it surfaces dwell, because "Approved — pending order" reads the same
// whether that happened an hour ago or three weeks ago, and the difference is
// the entire point of watching a procurement queue. Past a threshold the
// current segment turns amber on its own: a stall becomes visible without
// anyone having to go looking for it.

const MONO = 'var(--font-mono, monospace)'
const STALL_DAYS = 4

// When the request entered the stage it is in now.
function enteredAt(row) {
  if (!row) return null
  switch (row.status) {
    case 'requested':     return row.created_at
    case 'pending_order': return row.decided_at || row.created_at
    case 'received':      return row.received_at || row.decided_at
    case 'deployed':      return row.deployed_at || row.received_at
    case 'logged':        return row.logged_at || row.deployed_at
    default:              return row.created_at
  }
}

function dwell(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return { text: mins < 1 ? 'just now' : `${mins}m here`, days: 0 }
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return { text: `${hrs}h here`, days: 0 }
  const days = Math.floor(hrs / 24)
  return { text: `${days} day${days === 1 ? '' : 's'} here`, days }
}

export default function RequestStepper({ status, row, compact = false }) {
  if (status === 'denied') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(224,92,106,0.16)', color: 'var(--red, #e05c6a)', fontSize: 10, fontWeight: 700 }}>✕</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Not approved</span>
      </div>
    )
  }

  const at = stageIndex(status)
  const done = status === 'logged'
  const d = dwell(enteredAt(row))
  const stalled = !done && d && d.days >= STALL_DAYS

  const live = stalled ? 'var(--accent, #c8963e)' : done ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)'
  const past = done ? 'rgba(61,186,122,0.42)' : 'rgba(200,150,62,0.38)'
  const h = compact ? 5 : 6

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8, width: '100%' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {STAGES.map((s, i) => {
          const isPast = i < at
          const isNow = i === at
          return (
            <div key={s.key} title={s.label} style={{ flex: 1, minWidth: 0, height: h, borderRadius: 999, position: 'relative', overflow: 'hidden', background: isPast ? past : isNow ? live : 'var(--border, #2e3040)' }}>
              {/* the only thing on the page that moves, and it marks the one
                  stage the request is actually sitting in */}
              {isNow && !done && (
                <span className="stg-live" style={{
                  position: 'absolute', top: 0, bottom: 0, width: '45%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)',
                }} />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: compact ? 11.5 : 12.5, fontWeight: 700, color: done ? 'var(--green, #3dba7a)' : live, fontFamily: MONO }}>
          {STAGE_LABEL[status] || status}
        </span>
        {d && (
          <span style={{ fontSize: 10.5, fontFamily: MONO, color: stalled ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)' }}>
            {stalled ? `⏳ ${d.text}` : d.text}
          </span>
        )}
        <span style={{ marginInlineStart: 'auto', fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
          {at + 1}/{STAGES.length}
        </span>
      </div>
    </div>
  )
}
