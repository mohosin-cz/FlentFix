import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, anonSupabase } from '../lib/supabase'
import { compressForUpload, newSubmissionId } from '../utils/vendorOnboard'
import { fieldsFor } from '../utils/designerBrief'

// The designer's brief, filled standing in the property.
//
// Public page: the token in the URL is the only credential, same as the vendor
// work order. Nothing here shows a cost, a vendor, or anything about the
// landlord — the link gets forwarded.
//
// It is built for a phone in a half-empty flat: one area open at a time,
// everything optional, and it saves as she types. A designer who loses twenty
// minutes of typing to a dropped signal does not fill the form again.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'
const inp = {
  width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: 16,
  color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)',
  border: '1px solid var(--border, #2e3040)', borderRadius: 9, outline: 'none',
  fontFamily: 'inherit', resize: 'vertical',
}
const lbl = { fontSize: 11.5, color: 'var(--text-dim, #9394a8)', lineHeight: 1.4 }

function Centered({ title, body }) {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
        {body && <div style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', marginTop: 8, lineHeight: 1.6 }}>{body}</div>}
      </div>
    </div>
  )
}

// A stepper rather than a number field: she is holding the phone in one hand.
function Counter({ value, onChange, disabled }) {
  const n = Number(value || 0)
  const btn = (on) => ({
    width: 44, height: 44, flexShrink: 0, borderRadius: 9, cursor: disabled ? 'default' : 'pointer',
    border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)',
    color: on ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', fontSize: 19,
    fontFamily: MONO, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button type="button" disabled={disabled || n <= 0} onClick={() => onChange(Math.max(0, n - 1))} style={btn(n > 0)} aria-label="one fewer">−</button>
      <span style={{ minWidth: 40, textAlign: 'center', fontSize: 19, fontWeight: 700, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: n ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)' }}>{n}</span>
      <button type="button" disabled={disabled} onClick={() => onChange(n + 1)} style={btn(true)} aria-label="one more">+</button>
    </div>
  )
}

export default function DesignerBrief() {
  const { token } = useParams()
  const [state, setState] = useState('loading')   // loading | ok | invalid
  const [brief, setBrief] = useState(null)
  const [answers, setAnswers] = useState({})
  const [who, setWho] = useState({ name: '', phone: '' })
  const [open, setOpen] = useState(null)
  const [saveState, setSaveState] = useState('')  // '' | saving | saved | error
  const [busyPhoto, setBusyPhoto] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const pendingArea = useRef(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.rpc('designer_brief_fetch', { p_token: token })
      if (!alive) return
      if (error || !data) { setState('invalid'); return }
      setBrief(data)
      setAnswers(data.answers || {})
      setWho({ name: data.designer_name || '', phone: data.designer_phone || '' })
      setState('ok')
    })()
    return () => { alive = false }
  }, [token])

  const submitted = brief?.status === 'submitted'
  const areas = useMemo(() => (brief?.areas || []), [brief])

  // Saves on a delay after she stops typing. Losing a paragraph to a dropped
  // signal is how a form stops getting filled in.
  const timer = useRef(null)
  const queueSave = useCallback((nextAnswers, nextWho) => {
    if (submitted) return
    clearTimeout(timer.current)
    setSaveState('saving')
    timer.current = setTimeout(async () => {
      const { error } = await supabase.rpc('designer_brief_save', {
        p_token: token, p_answers: nextAnswers,
        p_name: nextWho?.name || null, p_phone: nextWho?.phone || null,
      })
      setSaveState(error ? 'error' : 'saved')
    }, 900)
  }, [token, submitted])

  useEffect(() => () => clearTimeout(timer.current), [])

  function setField(area, key, value) {
    setAnswers(prev => {
      const next = { ...prev, [area]: { ...(prev[area] || {}), [key]: value } }
      queueSave(next, who)
      return next
    })
  }

  async function onPhoto(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    const area = pendingArea.current
    if (!file || !area) return
    setBusyPhoto(area); setErr('')
    try {
      const { file: img, ext } = await compressForUpload(file)
      // inspection-media already accepts uploads and reads from everyone, so a
      // designer's photo needs no new bucket and no new storage policy — which
      // on this project cannot be created from the SQL editor anyway.
      const path = `designer/${brief.pid}/${newSubmissionId()}.${ext}`
      const { error: upErr } = await anonSupabase.storage.from('inspection-media')
        .upload(path, img, { contentType: img.type || 'image/jpeg' })
      if (upErr) throw upErr
      setAnswers(prev => {
        const cur = prev[area] || {}
        const next = { ...prev, [area]: { ...cur, photos: [...(cur.photos || []), path] } }
        queueSave(next, who)
        return next
      })
    } catch (e2) {
      setErr(e2.message || 'Could not add that photo')
    }
    setBusyPhoto('')
  }

  function removePhoto(area, path) {
    setAnswers(prev => {
      const cur = prev[area] || {}
      const next = { ...prev, [area]: { ...cur, photos: (cur.photos || []).filter(p => p !== path) } }
      queueSave(next, who)
      return next
    })
  }

  async function submit() {
    setSubmitting(true); setErr('')
    clearTimeout(timer.current)
    const { error: sErr } = await supabase.rpc('designer_brief_save', {
      p_token: token, p_answers: answers, p_name: who.name || null, p_phone: who.phone || null,
    })
    if (sErr) { setErr(sErr.message); setSubmitting(false); return }
    const { error } = await supabase.rpc('designer_brief_submit', { p_token: token })
    setSubmitting(false)
    if (error) { setErr(error.message); return }
    setBrief(b => ({ ...b, status: 'submitted' }))
    setOpen(null)
  }

  const filled = (area) => {
    const a = answers[area] || {}
    return Object.entries(a).some(([k, v]) =>
      k === 'photos' ? (v || []).length > 0 : (typeof v === 'number' ? v > 0 : String(v || '').trim() !== ''))
  }
  const filledCount = areas.filter(filled).length
  const publicUrl = (p) => { try { return supabase.storage.from('inspection-media').getPublicUrl(p).data.publicUrl } catch { return null } }

  if (state === 'loading') return <Centered title="Opening the form…" />
  if (state === 'invalid') return <Centered title="This link is not valid" body="Ask the Flent team to send you a fresh one." />

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS, display: 'flex', flexDirection: 'column' }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />

      <header style={{ background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', paddingTop: 'env(safe-area-inset-top)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '13px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Design brief</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
              PID {brief.pid}{brief.layout ? ` · ${brief.layout}` : ''}
            </span>
            <span style={{ marginInlineStart: 'auto', fontSize: 11, fontFamily: MONO, color: saveState === 'error' ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)' }}>
              {submitted ? 'submitted' : saveState === 'saving' ? 'saving…' : saveState === 'saved' ? 'saved' : saveState === 'error' ? "couldn't save" : ''}
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-input, #252731)', overflow: 'hidden', marginTop: 10 }}>
            <div style={{ height: '100%', width: `${areas.length ? (filledCount / areas.length) * 100 : 0}%`, background: 'var(--green, #3dba7a)', transition: 'width .2s' }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 6 }}>
            {filledCount} of {areas.length} areas · everything is optional
          </div>
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 620, margin: '0 auto', padding: '14px 16px calc(100px + env(safe-area-inset-bottom))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {submitted && (
          <div style={{ padding: '13px 15px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.35)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green, #3dba7a)' }}>Sent to Flent — thank you</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)', marginTop: 5, lineHeight: 1.55 }}>
              Nothing else to do. If something changes, ask the team for a fresh form rather than editing this one.
            </div>
          </div>
        )}

        {!submitted && (
          <div style={{ display: 'flex', gap: 9 }}>
            <input style={inp} placeholder="Your name" value={who.name}
              onChange={e => { const w = { ...who, name: e.target.value }; setWho(w); queueSave(answers, w) }} />
            <input style={inp} placeholder="Phone" inputMode="tel" value={who.phone}
              onChange={e => { const w = { ...who, phone: e.target.value }; setWho(w); queueSave(answers, w) }} />
          </div>
        )}

        {err && (
          <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontSize: 12.5, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>⚠ {err}</div>
        )}

        {areas.map(area => {
          const isOpen = open === area
          const fields = fieldsFor(area)
          const a = answers[area] || {}
          const done = filled(area)
          return (
            <section key={area} style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${isOpen ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, borderRadius: 13, overflow: 'hidden' }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : area)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '14px 15px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: done ? 'var(--green, #3dba7a)' : 'var(--border-dash, #3a3d52)' }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600 }}>{area}</span>
                {(a.photos || []).length > 0 && (
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{a.photos.length} photo{a.photos.length === 1 ? '' : 's'}</span>
                )}
                <span style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)' }}>{isOpen ? '−' : '+'}</span>
              </button>

              {isOpen && (
                <div style={{ padding: '2px 15px 15px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {fields.map(f => (
                    <div key={f.k} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <span style={lbl}>{f.label}</span>
                      {f.kind === 'count'
                        ? <Counter value={a[f.k]} disabled={submitted} onChange={v => setField(area, f.k, v)} />
                        : <textarea rows={2} style={inp} placeholder={f.ph} readOnly={submitted}
                            value={a[f.k] || ''} onChange={e => setField(area, f.k, e.target.value)} />}
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(a.photos || []).map(p => (
                      <div key={p} style={{ position: 'relative' }}>
                        <img src={publicUrl(p)} alt="" style={{ width: 74, height: 74, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--border, #2e3040)', display: 'block' }} />
                        {!submitted && (
                          <button type="button" onClick={() => removePhoto(area, p)} aria-label="Remove photo"
                            style={{ position: 'absolute', top: -7, right: -7, width: 24, height: 24, borderRadius: 12, border: '1px solid var(--border, #2e3040)', background: 'var(--bg, #16171f)', color: 'var(--red, #e05c6a)', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                        )}
                      </div>
                    ))}
                    {!submitted && (
                      <button type="button" disabled={busyPhoto === area}
                        onClick={() => { pendingArea.current = area; fileRef.current && fileRef.current.click() }}
                        style={{ width: 74, height: 74, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 9, border: '1px dashed var(--border-dash, #3a3d52)', background: 'transparent', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: MONO, fontSize: 10, WebkitTapHighlightColor: 'transparent' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 8.6A1.6 1.6 0 0 1 5.6 7h2.1l1-1.6A1 1 0 0 1 9.6 5h4.8a1 1 0 0 1 .85.4L16.3 7h2.1A1.6 1.6 0 0 1 20 8.6v7.8a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 16.4V8.6Z" />
                          <circle cx="12" cy="12.3" r="3.5" />
                        </svg>
                        {busyPhoto === area ? '…' : 'photo'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </main>

      {!submitted && (
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg-panel, #1e2028)', borderTop: '1px solid var(--border, #2e3040)', padding: '11px 16px calc(11px + env(safe-area-inset-bottom))' }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            <button type="button" onClick={submit} disabled={submitting}
              style={{ width: '100%', minHeight: 52, borderRadius: 11, border: 'none', background: 'var(--accent, #c8963e)', color: '#16171f', fontSize: 15.5, fontWeight: 700, letterSpacing: '0.03em', cursor: submitting ? 'wait' : 'pointer', fontFamily: MONO, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
              {submitting ? 'Sending…' : 'Send to Flent'}
            </button>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textAlign: 'center', marginTop: 7 }}>
              Saves as you go — you can close this and come back.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
