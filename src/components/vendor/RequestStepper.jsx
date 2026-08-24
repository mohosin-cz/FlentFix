import { STAGES, stageIndex, STAGE_LABEL } from '../../utils/assetRequest'

// Where a request has got to, as a body of liquid filling a pill.
//
// A dot-and-track stepper answered the question but said nothing about a
// request being *in motion* — it looked identical whether something was
// moving through the pipeline or had been stuck for a fortnight. Liquid does:
// it drifts, its surface undulates, bubbles rise. A glance says this is live.
//
// It has to be a progress indicator first, so the stage boundaries stay as
// notches on the pill and the current stage is named underneath. The animation
// is decoration on top of a readable bar, not instead of one — under
// prefers-reduced-motion it settles into exactly that bar.
//
// Keyframes live in index.css so five of these on a page do not inject five
// style tags.

const MONO = 'var(--font-mono, monospace)'
const ACCENT = 'var(--accent, #c8963e)'

// The liquid's leading edge. A data-URI so it costs no request, and a mask
// rather than an image so the fill colour shows through it.
const WAVE = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="60" viewBox="0 0 14 60">' +
  '<path d="M0,0 C10,10 10,20 0,30 C10,40 10,50 0,60 L14,60 L14,0 Z" fill="#000"/></svg>'
)

export default function RequestStepper({ status, compact = false }) {
  if (status === 'denied') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 999, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)' }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--red, #e05c6a)', color: '#fff', fontSize: 11, fontWeight: 700 }}>✕</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Not approved</span>
      </div>
    )
  }

  const at = stageIndex(status)
  const done = status === 'logged'
  const h = compact ? 22 : 30
  // Never a sliver: at the first stage there is still a visible body of
  // liquid, or a new request looks like nothing has happened at all.
  const pct = Math.max(9, (at / (STAGES.length - 1)) * 100)
  const hue = done ? 'var(--green, #3dba7a)' : ACCENT
  const tint = done ? '#3dba7a' : '#c8963e'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 9, width: '100%', maxWidth: compact ? 680 : 'none' }}>
      <div style={{
        position: 'relative', height: h, borderRadius: 999, overflow: 'hidden',
        background: 'var(--bg, #16171f)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,.55), inset 0 0 0 1px var(--border, #2e3040)',
      }}>
        {/* the liquid */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, transition: 'width .9s cubic-bezier(.25,.9,.25,1)' }}>
          {/* Body: lighter at the surface, deeper below, so it reads as a
              volume of something rather than a flat bar. */}
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(180deg, ${tint}f2 0%, ${tint} 42%, ${tint}cc 100%)`,
            boxShadow: `0 0 16px ${tint}44, inset 0 1px 0 rgba(255,255,255,.28)`,
          }} />
          {/* Texture: a drift across the surface. Barely there on purpose —
              at any real contrast this stops being liquid and becomes a
              barber's pole. */}
          <div className="lq-fill" style={{
            position: 'absolute', inset: 0, opacity: 0.5,
            background: 'repeating-linear-gradient(112deg, rgba(255,255,255,.10) 0 6px, rgba(255,255,255,0) 6px 28px)',
          }} />

          {/* surface — the undulating leading edge */}
          <div className="lq-wave" style={{
            position: 'absolute', top: 0, right: -2, width: 18, height: '170%',
            background: tint,
            WebkitMaskImage: `url("data:image/svg+xml,${WAVE}")`,
            maskImage: `url("data:image/svg+xml,${WAVE}")`,
            WebkitMaskSize: '100% 33.33%', maskSize: '100% 33.33%',
            WebkitMaskRepeat: 'repeat-y', maskRepeat: 'repeat-y',
          }} />

          {/* a highlight travelling through it */}
          <div className="lq-sheen" style={{
            position: 'absolute', top: 0, bottom: 0, width: '24%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent)',
          }} />

          {/* bubbles, offset so they never rise in step */}
          {[{ l: '18%', d: '0s', s: 4 }, { l: '46%', d: '1.3s', s: 3 }, { l: '73%', d: '2.5s', s: 5 }].map(b => (
            <span key={b.l} className="lq-bubble" style={{
              position: 'absolute', bottom: 1, left: b.l, width: b.s, height: b.s,
              borderRadius: '50%', background: 'rgba(255,255,255,.7)', animationDelay: b.d,
            }} />
          ))}
        </div>

        {/* stage boundaries, so this stays a progress bar and not only a mood */}
        {STAGES.slice(1, -1).map((s, i) => {
          const left = ((i + 1) / (STAGES.length - 1)) * 100
          return (
            <span key={s.key} title={s.label} style={{
              position: 'absolute', left: `${left}%`, top: '28%', bottom: '28%', width: 1,
              background: left <= pct ? 'rgba(0,0,0,.30)' : 'var(--border, #2e3040)',
            }} />
          )
        })}
      </div>

      {!compact && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: hue, fontFamily: MONO }}>
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
