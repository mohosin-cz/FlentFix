import { useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { fieldsFor, isAnswered, areaIsFilled } from '../../utils/designerBrief'

// What she was asked, and what she said back.
//
// Every question is printed, including the ones she left blank. That is the
// point of the screen: a brief is mostly blank by design, and the difference
// between "no shelves in this room" and "nobody asked about shelves" is the
// difference between a scope you can trust and one you cannot. A view that
// showed only the filled fields would hide exactly the thing you came to check.
//
// Areas she never touched are collapsed to a single line rather than dropped,
// so eleven empty rooms do not bury the three she filled — but you can still
// see that they were offered to her.

const MONO = 'var(--font-mono, monospace)'

const mediaUrl = (p) => {
  try { return supabase.storage.from('inspection-media').getPublicUrl(p).data.publicUrl } catch { return null }
}

function Answer({ field, value }) {
  const answered = isAnswered(value)
  return (
    <div style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border, #2e3040)', alignItems: 'baseline' }}>
      <span style={{ flex: '1 1 46%', minWidth: 0, fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.45 }}>
        {field.label}
      </span>
      <span style={{
        flex: '1 1 54%', minWidth: 0, fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
        color: answered ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)',
        fontFamily: field.kind === 'count' ? MONO : 'inherit',
        fontWeight: field.kind === 'count' && answered ? 700 : 400,
      }}>
        {answered ? String(value) : <span style={{ opacity: 0.55 }}>— left blank</span>}
      </span>
    </div>
  )
}

function AreaBlock({ area, answers }) {
  const a = answers[area] || {}
  const fields = fieldsFor(area)
  const photos = a.photos || []
  const filled = areaIsFilled(answers, area)
  const [open, setOpen] = useState(filled)   // blank areas start shut, filled ones open

  const answeredCount = fields.filter(f => isAnswered(a[f.k])).length

  return (
    <div style={{ border: '1px solid var(--border, #2e3040)', borderRadius: 11, overflow: 'hidden', background: 'var(--bg-panel, #1e2028)' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '11px 13px', background: filled ? 'var(--bg-input, #252731)' : 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: filled ? 'var(--green, #3dba7a)' : 'var(--border-dash, #3a3d52)' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: filled ? 700 : 400, color: filled ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {area}
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, flexShrink: 0 }}>
          {filled ? `${answeredCount}/${fields.length}${photos.length ? ` · ${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''}` : 'blank'}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', flexShrink: 0 }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 13px 12px' }}>
          {fields.map(f => <Answer key={f.k} field={f} value={a[f.k]} />)}
          <div style={{ borderTop: '1px solid var(--border, #2e3040)', paddingTop: 9, marginTop: 2 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', marginBottom: photos.length ? 7 : 0 }}>
              Photos {photos.length === 0 && <span style={{ opacity: 0.55 }}>— none</span>}
            </div>
            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {photos.map(p => (
                  <a key={p} href={mediaUrl(p)} target="_blank" rel="noreferrer" style={{ lineHeight: 0 }} title={p}>
                    <img src={mediaUrl(p)} alt="" loading="lazy"
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border, #2e3040)' }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BriefTranscript({ brief }) {
  const areas = useMemo(() => brief?.areas || [], [brief])
  const answers = useMemo(() => brief?.answers || {}, [brief])
  const [onlyFilled, setOnlyFilled] = useState(false)

  const filledAreas = useMemo(() => areas.filter(a => areaIsFilled(answers, a)), [areas, answers])
  const shown = onlyFilled ? filledAreas : areas

  if (!areas.length) {
    return (
      <div style={{ padding: '28px 18px', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 11, textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.7 }}>
        This brief has no areas on it — it was raised before the inspection listed its rooms.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
          {filledAreas.length} of {areas.length} areas answered
        </span>
        {filledAreas.length < areas.length && (
          <button type="button" onClick={() => setOnlyFilled(v => !v)}
            style={{ marginInlineStart: 'auto', minHeight: 32, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: onlyFilled ? 'rgba(200,150,62,0.1)' : 'transparent', color: onlyFilled ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
            {onlyFilled ? 'Showing answered only' : 'Hide the blank areas'}
          </button>
        )}
      </div>
      {shown.map(area => <AreaBlock key={area} area={area} answers={answers} />)}
    </div>
  )
}
