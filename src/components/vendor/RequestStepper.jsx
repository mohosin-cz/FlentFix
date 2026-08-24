import { STAGES, stageIndex, STAGE_LABEL } from '../../utils/assetRequest'

// Where a request has got to.
//
// Was five separate bars with a gap between each and five cramped labels
// underneath — which reads as a broken progress bar rather than a journey,
// and once everything was gold it no longer said where you actually were.
//
// Now one continuous track with a node per stage: filled behind you, hollow
// ahead, and the stage you are on ringed and named in full underneath. One
// label instead of five is legible at phone width and answers the only
// question being asked — where is my thing.

const MONO = 'var(--font-mono, monospace)'
const ACCENT = 'var(--accent, #c8963e)'
const TRACK = 'var(--border, #2e3040)'

export default function RequestStepper({ status, compact = false }) {
  if (status === 'denied') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 9, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)' }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--red, #e05c6a)', color: '#fff', fontSize: 11, fontWeight: 700 }}>✕</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Not approved</span>
      </div>
    )
  }

  const at = stageIndex(status)
  const done = status === 'logged'
  const dot = compact ? 9 : 11
  const pct = STAGES.length > 1 ? (at / (STAGES.length - 1)) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 9 }}>
      <div style={{ position: 'relative', height: dot, display: 'flex', alignItems: 'center' }}>
        {/* the track, and how far along it we are */}
        <div style={{ position: 'absolute', left: dot / 2, right: dot / 2, height: 2, background: TRACK, borderRadius: 1 }} />
        <div style={{ position: 'absolute', left: dot / 2, width: `calc((100% - ${dot}px) * ${pct / 100})`, height: 2, background: ACCENT, borderRadius: 1, transition: 'width .35s cubic-bezier(.2,.8,.2,1)' }} />

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          {STAGES.map((s, i) => {
            const passed = i < at
            const current = i === at
            return (
              <span key={s.key} title={s.label}
                style={{
                  width: dot, height: dot, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
                  background: passed || current ? ACCENT : 'var(--bg, #16171f)',
                  border: `2px solid ${passed || current ? ACCENT : TRACK}`,
                  boxShadow: current && !done ? `0 0 0 4px rgba(200,150,62,0.18)` : 'none',
                  transition: 'background .25s, border-color .25s, box-shadow .25s',
                }} />
            )
          })}
        </div>
      </div>

      {!compact && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: done ? 'var(--green, #3dba7a)' : ACCENT, fontFamily: MONO }}>
            {STAGE_LABEL[status] || status}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            step {at + 1} of {STAGES.length}
          </span>
        </div>
      )}
    </div>
  )
}
