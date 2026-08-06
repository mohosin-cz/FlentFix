import { useState } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'

// Where a property is in its journey. The accent marks exactly one thing —
// where you are now. Everything already done reads as quiet grey, because a
// finished stage is context, not news; lighting the whole completed track in
// gold made the strip shout louder than the page it sits above.

const MONO = 'var(--font-mono, monospace)'

const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null)

// No label under the node. Ten stage names cannot sit side by side in a 600px
// column at any size a person would read — they collided. The header names
// where you are, the hint below names what is next, and hovering a dot names
// that one. The rail itself only has to answer "how far along".
function Node({ state, onClick, title }) {
  const done = state === 'done'
  const current = state === 'current'
  const size = current ? 11 : 8
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={title}
      aria-current={current ? 'step' : undefined}
      title={title}
      style={{
        width: 20, height: 20, padding: 0, borderRadius: '50%', border: 'none', background: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{
        width: size, height: size, borderRadius: '50%', display: 'block',
        background: done ? 'var(--text-dim, #9394a8)' : current ? 'var(--accent, #c8963e)' : 'transparent',
        border: done || current ? 'none' : '1px solid var(--border-dash, #3a3d52)',
        boxShadow: current ? '0 0 0 4px rgba(200,150,62,0.16)' : 'none',
        transition: 'background .2s, box-shadow .2s',
      }} />
    </button>
  )
}

export default function StageRail({ stages, currentKey, journey = [], isRejected, onAdvance, actions = [] }) {
  const phone = useIsMobile(720)
  const [pending, setPending] = useState(null)   // a stage awaiting confirmation

  const currentIndex = stages.findIndex(s => s.key === currentKey)
  const current = stages[currentIndex]
  const entry = journey.find(j => j.stage === current?.key)
  const pendingIndex = pending ? stages.findIndex(s => s.key === pending) : -1
  const skips = pendingIndex - currentIndex - 1

  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
      <div style={{ maxWidth: 600, width: '100%', margin: '0 auto', padding: phone ? '13px 20px 15px' : '15px 20px 17px', boxSizing: 'border-box' }}>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: phone ? 14 : 16 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            Stage {currentIndex + 1} of {stages.length}
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>
            {current?.label || '—'}
          </span>
          {entry && (
            <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
              since {fmtDay(entry.changed_at)}{entry.changed_by ? ` · ${entry.changed_by.split('@')[0]}` : ''}
            </span>
          )}
        </div>

        {/* The rail. Connectors carry the progress, so there is no separate
            filled bar to keep in sync with the nodes. */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {stages.map((stage, i) => {
            const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'future'
            const isNext = i > currentIndex
            return (
              <div key={stage.key} style={{ display: 'flex', alignItems: 'center', flex: i === stages.length - 1 ? '0 0 auto' : 1, minWidth: 0 }}>
                <Node
                  state={state}
                  title={state === 'current' ? `Current stage: ${stage.label}` : isNext ? `Move to ${stage.label}` : stage.label}
                  onClick={isNext && !isRejected ? () => setPending(stage.key) : undefined}
                />
                {i < stages.length - 1 && (
                  <span style={{
                    flex: 1, height: 2, borderRadius: 1, minWidth: 6,
                    background: i < currentIndex ? 'var(--text-dim, #9394a8)' : 'var(--border, #2e3040)',
                    transition: 'background .3s',
                  }} />
                )}
              </div>
            )
          })}
        </div>

        {/* One step of forward guidance — the only thing the dots cannot say. */}
        <div style={{ display: 'flex', gap: 10, marginTop: 9, fontSize: 10.5, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)' }}>
          <span>{stages[0]?.label}</span>
          <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
            {currentIndex < stages.length - 1
              ? <>next · <span style={{ color: 'var(--text-dim, #9394a8)' }}>{stages[currentIndex + 1]?.label}</span></>
              : 'journey complete'}
          </span>
        </div>

        {/* Advancing a property is a real state change, and a stray click on a
            node used to make it silently. It asks first, and says how far it
            is jumping. */}
        {pending && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9 }}>
            <span style={{ flex: 1, minWidth: 180, fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, lineHeight: 1.5 }}>
              Move to <span style={{ color: 'var(--text, #e8e8f0)', fontWeight: 700 }}>{stages[pendingIndex]?.label}</span>?
              {skips > 0 && <span style={{ color: 'var(--accent, #c8963e)' }}> Skips {skips} stage{skips === 1 ? '' : 's'}.</span>}
            </span>
            <button type="button" onClick={() => { onAdvance(pending); setPending(null) }}
              style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--accent, #c8963e)', background: 'rgba(200,150,62,0.12)', color: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>
              Move
            </button>
            <button type="button" onClick={() => setPending(null)}
              style={{ minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>
              Cancel
            </button>
          </div>
        )}

        {isRejected && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'rgba(224,92,106,0.09)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 9 }}>
            <span style={{ flex: 1, minWidth: 160, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Estimate rejected</span>
            <button type="button" onClick={() => onAdvance('estimate_created')}
              style={{ minHeight: 36, padding: '0 13px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>
              Re-create estimate
            </button>
          </div>
        )}

        {!pending && !isRejected && actions.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {actions.map(a => (
              <button key={a.label} type="button" onClick={a.action}
                style={{
                  minHeight: 38, padding: '0 14px', borderRadius: 8, fontSize: 12.5, cursor: 'pointer', fontFamily: MONO,
                  fontWeight: a.primary ? 700 : 500,
                  border: `1px solid ${a.tone || 'var(--border, #2e3040)'}`,
                  background: a.primary ? `${a.tone ? 'rgba(61,186,122,0.12)' : 'rgba(200,150,62,0.12)'}` : 'var(--bg-input, #252731)',
                  color: a.tone || 'var(--text-dim, #9394a8)',
                }}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
