import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import HomeMark from '../components/HomeMark'
import { uploadMedia } from '../utils/mediaUtils'
import { slotText, timeText, VERDICT, readAsk, TRADES, FACTS, freshDetail, scoreRating, scoreTone, stageFields, copyText } from '../utils/explore'

// The exploratory visit log — on the phone, on site, step by step.
//
// Built around two things: how a property is walked (answer what supply asked,
// then the condition trade by trade, then the site checks people forget), and
// Stage's own visit form (outcome · follow-up · visit notes · non-retain items
// · internal observations), so what's logged here drops straight into Stage,
// field by field. A T5 ask sends them to a Pulse inspection instead.
//
// Every change saves as a draft — on this phone at once, in Pulse a moment
// later — so a dropped signal loses nothing.

const MONO = 'var(--font-mono, monospace)'
const F = "var(--font-nav, 'Urbanist', 'Poppins', sans-serif)"
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)', line: 'var(--border-dash, #3a3d52)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)', accent: 'var(--accent, #c8963e)',
}
const TONE = {
  green: ['#6f9a7e', 'rgba(111,154,126,0.16)'], amber: ['#a8895a', 'rgba(168,137,90,0.16)'], red: ['#b0645b', 'rgba(176,100,91,0.16)'],
  grey: ['var(--text-dim, #9394a8)', 'var(--bg-input, #252731)'], brick: ['#b0645b', 'rgba(176,100,91,0.10)'], gold: ['#c8963e', 'rgba(200,150,62,0.12)'],
}
const STEPS = ['Asked', 'Trades', 'Site', 'Items', 'Notes', 'Outcome']
const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 8 }
const sheet = { background: C.input, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, display: 'grid', gap: 8 }
const k = { fontSize: 12, color: C.muted }
const field = { width: '100%', boxSizing: 'border-box', minHeight: 42, padding: '0 11px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.bg, color: C.text, fontSize: 14, outline: 'none', fontFamily: F }
const area = { ...field, minHeight: 64, padding: '9px 11px', resize: 'vertical', lineHeight: 1.5 }
const pill = (on, tone = 'gold') => ({ minHeight: 38, padding: '0 12px', borderRadius: 999, border: `1px solid ${on ? TONE[tone][0] : C.line}`, background: on ? TONE[tone][1] : C.bg, color: on ? TONE[tone][0] : C.dim, fontWeight: on ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: F })
const btn = (kind) => ({ minHeight: 44, padding: '0 16px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: F, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  border: `1px solid ${kind === 'primary' ? C.accent : kind === 'soft' ? 'rgba(200,150,62,0.45)' : C.border}`,
  background: kind === 'primary' ? C.accent : kind === 'soft' ? 'rgba(200,150,62,0.12)' : C.input,
  color: kind === 'primary' ? '#16171f' : kind === 'soft' ? C.accent : C.dim })
const PROBLEM = new Set(['some', 'severe', 'no', 'clean', 'damaged', 'possible', 'tanker'])

function mergeDetail(fresh, saved) {
  if (!saved) return fresh
  const by = (xs) => Object.fromEntries((xs || []).map(x => [x.key, x]))
  const st = by(saved.trades)
  return { ...fresh, ...saved, trades: fresh.trades.map(t => (st[t.key] ? { ...t, ...st[t.key] } : t)), asks: saved.asks?.length ? saved.asks : fresh.asks }
}

// What gets written to the row: the structured answers, plus the older
// columns filled from them so every screen that reads those keeps working.
function payload(log, request) {
  const d = log.detail
  const fields = stageFields(request, { ...log }, null)
  return {
    verdict: log.verdict, visited_at: log.visited_at, detail: d,
    checks: d.trades.filter(t => t.score != null || t.note || (t.photos || []).length)
      .map(t => ({ key: t.key, label: t.label, score: t.score, rating: scoreRating(t.score), note: t.note, photos: t.photos })),
    retain: d.non_retain.filter(x => x.name).map(x => ({ item: x.name, keep: false, note: x.where || '', photo: x.photo || null })),
    notes: fields?.notes || null,
    summary: [d.trades.filter(t => t.score != null && t.score <= 4).map(t => `${t.label.toLowerCase()} ${t.score}/10`).join(', '), d.follow_up?.needed ? 'follow-up needed' : ''].filter(Boolean).join(' · '),
  }
}

export default function VisitLog() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [rec, setRec] = useState(null)
  const [error, setError] = useState('')
  const [log, setLog] = useState(null)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState('')
  const [submitted, setSubmitted] = useState(null)
  const [uploading, setUploading] = useState(null)
  const lsKey = `pulse.visitlog2.${id}`
  const timer = useRef(null)
  const top = useRef(null)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('exploratory_record', { p_id: id })
    if (e || !data) { setError(e?.message || 'No such exploratory request.'); return }
    setRec(data)
    // Logged already and not in Stage yet: open on the field-by-field copy,
    // which is the step that's left.
    const sent = (data.logs || []).find(l => l.submitted_at)
    if (!data.my_draft && sent && !sent.in_stage_at && sent.detail) {
      let hasLocal = false
      try { hasLocal = !!localStorage.getItem(lsKey) } catch { /* private window */ }
      if (!hasLocal) setSubmitted({ ...sent, author: sent.author })
    }
    let local = null
    try { local = JSON.parse(localStorage.getItem(lsKey) || 'null') } catch { /* private window */ }
    const server = data.my_draft
    const fresh = freshDetail(data.request)
    const pick = server?.detail && (!local || new Date(server.updated_at) >= new Date(local._at || 0)) ? server : local
    setLog({ verdict: pick?.verdict || null, visited_at: pick?.visited_at || new Date().toISOString(), detail: mergeDetail(fresh, pick?.detail) })
  }, [id, lsKey])
  useEffect(() => { load() }, [load])

  const save = useCallback((next) => {
    try { localStorage.setItem(lsKey, JSON.stringify({ ...next, _at: new Date().toISOString() })) } catch { /* private window */ }
    clearTimeout(timer.current)
    setSaving('saving…')
    timer.current = setTimeout(async () => {
      const { error: e } = await supabase.rpc('exploratory_log_save', { p_id: id, p_log: payload(next, rec?.request), p_submit: false })
      setSaving(e ? 'saved on this phone — will sync when online' : '✓ saved')
    }, 900)
  }, [id, lsKey, rec])

  const setD = (fn) => setLog(l => { const next = { ...l, detail: fn(l.detail) }; save(next); return next })
  const setTop = (patch) => setLog(l => { const next = { ...l, ...patch }; save(next); return next })
  const go = (n) => { setStep(Math.max(0, Math.min(STEPS.length - 1, n))); top.current?.scrollTo?.({ top: 0 }); window.scrollTo({ top: 0 }) }

  async function photo(file, path) {
    if (!file) return null
    setUploading(path)
    try { return await uploadMedia(supabase, file, `explore/${id}/${path}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`) }
    catch (e) { setError(`Photo didn’t upload — ${e.message}`); return null }
    finally { setUploading(null) }
  }

  async function submit() {
    clearTimeout(timer.current)
    setSaving('sending…'); setError('')
    const { error: e } = await supabase.rpc('exploratory_log_save', { p_id: id, p_log: payload(log, rec.request), p_submit: true })
    if (e) { setSaving(''); setError(e.message); return }
    try { localStorage.removeItem(lsKey) } catch { /* private window */ }
    setSubmitted({ ...log, author: rec.me })
    setSaving('')
    window.scrollTo({ top: 0 })
  }

  if (error && !rec) return <Frame><div style={{ ...card, color: TONE.red[0], fontSize: 13 }}>{error}</div></Frame>
  if (!rec || !log) return <Frame><div style={{ height: 120, borderRadius: 12, background: C.border, opacity: 0.35 }} /></Frame>
  const r = rec.request
  const d = log.detail
  const ask = readAsk(r.notes)
  const sub = `${r.property_name}${r.configuration ? ` · ${r.configuration}` : ''}`

  if (submitted) return <IntoStage r={r} log={submitted} onBack={() => navigate(`/explore/${id}`)} onFresh={() => setSubmitted(null)} />

  // ── steps ──────────────────────────────────────────────────────────────
  const asked = (
    <>
      <div style={{ borderLeft: `3px solid ${TONE.brick[0]}`, background: TONE.brick[1], borderRadius: '0 10px 10px 0', padding: '9px 12px', display: 'grid', gap: 4 }}>
        <span style={{ ...k, color: TONE.brick[0] }}>Supply asked — answer each</span>
        <span style={{ fontSize: 12.5, color: C.dim }}>{slotText(r.visit_date, r.visit_time)}{r.visit_time_end ? `–${timeText(r.visit_time_end)}` : ''}{r.owner_name ? ` · landlord ${r.owner_name}` : ''}</span>
        <span style={{ display: 'flex', gap: 10 }}>
          {r.owner_phone && <a href={`tel:${r.owner_phone}`} style={{ fontSize: 12.5, color: C.accent }}>Call</a>}
          {r.maps_link && <a href={r.maps_link} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: C.accent }}>Map</a>}
        </span>
      </div>
      {ask.t5 && (
        <div style={{ ...card, borderColor: 'rgba(200,150,62,0.45)', background: TONE.gold[1] }}>
          <b style={{ fontSize: 14 }}>This needs a T5 inspection</b>
          <span style={{ fontSize: 13, color: C.dim, lineHeight: 1.5 }}>Supply asked for a T5-level check. Do it as a Pulse inspection — the full room-by-room checklist — and it’s linked to this visit. Then come back here to finish the log.</span>
          <button type="button" style={btn('primary')} onClick={() => { setD(x => ({ ...x, t5_opened_at: x.t5_opened_at || new Date().toISOString() })); navigate(`/inspections/new?explore=${id}`) }}>
            {d.t5_opened_at ? 'Open the T5 inspection again' : 'Start the T5 inspection'}
          </button>
          {d.t5_opened_at && <span style={{ fontSize: 12, color: TONE.green[0] }}>✓ Started {new Date(d.t5_opened_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>}
        </div>
      )}
      {d.asks.map((a, i) => (
        <div key={i} style={sheet}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <button type="button" aria-pressed={a.done} aria-label="Done" onClick={() => setD(x => ({ ...x, asks: x.asks.map((y, j) => (j === i ? { ...y, done: !y.done } : y)) }))}
              style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: `1.5px solid ${a.done ? TONE.green[0] : C.line}`, background: a.done ? TONE.green[1] : 'transparent', color: TONE.green[0], cursor: 'pointer', fontSize: 13 }}>{a.done ? '✓' : ''}</button>
            <b style={{ fontSize: 13.5, lineHeight: 1.45 }}>{a.text}</b>
          </div>
          <textarea value={a.answer} onChange={e => setD(x => ({ ...x, asks: x.asks.map((y, j) => (j === i ? { ...y, answer: e.target.value, done: y.done || !!e.target.value.trim() } : y)) }))}
            placeholder="What you found — measurements, condition, what’s needed" rows={2} style={area} />
          <Photos list={a.photos} busy={uploading === `ask${i}`} onAdd={async (f) => { const u = await photo(f, `ask${i}`); if (u) setD(x => ({ ...x, asks: x.asks.map((y, j) => (j === i ? { ...y, photos: [...(y.photos || []), u] } : y)) })) }} />
        </div>
      ))}
      <AddLine placeholder="Something else they asked for" onAdd={(t) => setD(x => ({ ...x, asks: [...x.asks, { text: t, answer: '', photos: [], done: false }] }))} />
      {!d.asks.length && !ask.t5 && <span style={{ fontSize: 12.5, color: C.muted }}>Supply didn’t note anything specific — go straight to the trades.</span>}
    </>
  )

  const trades = (
    <>
      <span style={{ fontSize: 12.5, color: C.dim }}>Score each trade out of 10 for the whole property. 7+ is fine, 4–6 needs work, 3 or below is poor. Add a note and photos for anything under 7.</span>
      {d.trades.map((t, i) => {
        const hint = TRADES.find(x => x[0] === t.key)?.[2]
        const tone = scoreTone(t.score)
        return (
          <div key={t.key} style={sheet}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontSize: 14 }}>{t.label}</b>
              <span style={{ fontSize: 11.5, color: C.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</span>
              <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: TONE[tone][0] }}>{t.score != null ? `${t.score}/10` : '—'}</span>
            </div>
            <div role="group" aria-label={`${t.label} score`} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
              {Array.from({ length: 10 }, (_, n) => n + 1).map(n => {
                const on = t.score === n, nt = TONE[scoreTone(n)]
                return <button key={n} type="button" aria-pressed={on} onClick={() => setD(x => ({ ...x, trades: x.trades.map((y, j) => (j === i ? { ...y, score: y.score === n ? null : n } : y)) }))}
                  style={{ minHeight: 38, padding: 0, borderRadius: 7, border: `1px solid ${on ? nt[0] : C.line}`, background: on ? nt[1] : C.bg, color: on ? nt[0] : C.dim, fontFamily: MONO, fontSize: 13, fontWeight: on ? 700 : 500, cursor: 'pointer' }}>{n}</button>
              })}
            </div>
            {(t.score != null && t.score < 7) || t.note || (t.photos || []).length ? (
              <>
                <input value={t.note} onChange={e => setD(x => ({ ...x, trades: x.trades.map((y, j) => (j === i ? { ...y, note: e.target.value } : y)) }))} placeholder={`What’s wrong with the ${t.label.toLowerCase()}?`} style={field} />
                <Photos list={t.photos} busy={uploading === t.key} onAdd={async (f) => { const u = await photo(f, t.key); if (u) setD(x => ({ ...x, trades: x.trades.map((y, j) => (j === i ? { ...y, photos: [...(y.photos || []), u] } : y)) })) }} />
              </>
            ) : null}
          </div>
        )
      })}
    </>
  )

  const site = (
    <>
      <span style={{ fontSize: 12.5, color: C.dim }}>The things that are always asked later. One tap each.</span>
      {FACTS.map(([key, label, opts, notable]) => {
        const cur = d.facts?.[key] || {}
        return (
          <div key={key} style={sheet}>
            <b style={{ fontSize: 13.5 }}>{label}</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {opts.map(([v, l]) => {
                const on = cur.v === v
                return <button key={v} type="button" aria-pressed={on} onClick={() => setD(x => ({ ...x, facts: { ...x.facts, [key]: { ...cur, v: on ? null : v } } }))}
                  style={pill(on, PROBLEM.has(v) ? (v === 'severe' || v === 'damaged' ? 'red' : 'amber') : 'green')}>{l}</button>
              })}
            </div>
            {notable && cur.v && PROBLEM.has(cur.v) && (
              <input value={cur.note || ''} onChange={e => setD(x => ({ ...x, facts: { ...x.facts, [key]: { ...cur, note: e.target.value } } }))} placeholder="Where / how bad?" style={field} />
            )}
          </div>
        )
      })}
      <div style={sheet}>
        <b style={{ fontSize: 13.5 }}>Other issues</b>
        <textarea value={d.facts?.other || ''} onChange={e => setD(x => ({ ...x, facts: { ...x.facts, other: e.target.value } }))} rows={3} placeholder="Anything else — gas line, society rules, pests, neighbours’ work…" style={area} />
      </div>
    </>
  )

  const items = (
    <>
      <div style={card}>
        <span style={k}>Not to retain — Stage’s “non-retain items”</span>
        {d.non_retain.map((x, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {x.photo ? <a href={x.photo} target="_blank" rel="noreferrer"><img src={x.photo} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: `1px solid ${C.line}` }} /></a>
              : <PhotoButton small busy={uploading === `nr${i}`} onAdd={async (f) => { const u = await photo(f, `nr${i}`); if (u) setD(y => ({ ...y, non_retain: y.non_retain.map((z, j) => (j === i ? { ...z, photo: u } : z)) })) }} />}
            <input value={x.name} onChange={e => setD(y => ({ ...y, non_retain: y.non_retain.map((z, j) => (j === i ? { ...z, name: e.target.value } : z)) }))} placeholder="Item (e.g. washing machine)" style={{ ...field, flex: '2 1 140px' }} />
            <input value={x.where || ''} onChange={e => setD(y => ({ ...y, non_retain: y.non_retain.map((z, j) => (j === i ? { ...z, where: e.target.value } : z)) }))} placeholder="Where" style={{ ...field, flex: '1 1 80px' }} />
            <button type="button" aria-label="Remove" onClick={() => setD(y => ({ ...y, non_retain: y.non_retain.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, padding: 6 }}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setD(y => ({ ...y, non_retain: [...y.non_retain, { name: '', where: '', photo: null }] }))} style={btn('soft')}>+ Add an item</button>
        <span style={{ fontSize: 12, color: C.muted }}>Everything else is assumed to stay.</span>
      </div>
    </>
  )

  const notes = (
    <>
      {[['pros', 'Pros', 'green'], ['cons', 'Cons', 'red'], ['actions', 'Action items', 'amber']].map(([key, label, tone]) => (
        <div key={key} style={card}>
          <span style={{ ...k, color: TONE[tone][0] }}>{label}</span>
          {(d[key] || []).map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={x} onChange={e => setD(y => ({ ...y, [key]: y[key].map((z, j) => (j === i ? e.target.value : z)) }))} style={field} />
              <button type="button" aria-label="Remove" onClick={() => setD(y => ({ ...y, [key]: y[key].filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, padding: 6 }}>✕</button>
            </div>
          ))}
          <AddLine placeholder={key === 'pros' ? 'e.g. good light in every room' : key === 'cons' ? 'e.g. transformer right outside the utility' : 'e.g. strip the wallpaper in BR1'} onAdd={(t) => setD(y => ({ ...y, [key]: [...(y[key] || []), t] }))} />
        </div>
      ))}
      <div style={card}>
        <span style={k}>Internal — for the team, not shared with the landlord</span>
        <textarea value={d.internal} onChange={e => setD(y => ({ ...y, internal: e.target.value }))} rows={3} placeholder="How the landlord came across, what they’ll negotiate on…" style={area} />
      </div>
    </>
  )

  const scored = d.trades.filter(t => t.score != null).length
  const asksLeft = d.asks.filter(a => !a.done && !a.answer.trim()).length
  const outcome = (
    <>
      <div style={card}>
        <span style={k}>Your call — Stage’s visit outcome</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[['go', 'green'], ['no_go', 'red'], ['unsure', 'amber']].map(([v, tone]) => {
            const on = log.verdict === v
            return <button key={v} type="button" aria-pressed={on} onClick={() => setTop({ verdict: on ? null : v })}
              style={{ minHeight: 52, borderRadius: 10, border: `1px solid ${on ? TONE[tone][0] : C.line}`, background: on ? TONE[tone][1] : C.bg, color: on ? TONE[tone][0] : C.dim, fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: F }}>{VERDICT[v][0]}</button>
          })}
        </div>
        <span style={{ fontSize: 12, color: C.muted }}>Supply decides in Stage — this is your recommendation.</span>
      </div>
      <div style={card}>
        <span style={k}>Follow-up needed?</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[[false, 'No', 'green'], [true, 'Yes', 'amber']].map(([v, l, tone]) => (
            <button key={l} type="button" aria-pressed={d.follow_up?.needed === v} onClick={() => setD(y => ({ ...y, follow_up: { ...y.follow_up, needed: y.follow_up?.needed === v ? null : v } }))} style={{ ...pill(d.follow_up?.needed === v, tone), flex: 1, borderRadius: 10 }}>{l}</button>
          ))}
        </div>
        {d.follow_up?.needed && <input value={d.follow_up.what || ''} onChange={e => setD(y => ({ ...y, follow_up: { ...y.follow_up, what: e.target.value } }))} placeholder="What, and who should go?" style={field} />}
      </div>
      <div style={card}>
        <span style={k}>Before you send</span>
        <Check ok={asksLeft === 0} text={d.asks.length ? (asksLeft ? `${asksLeft} of supply’s asks not answered` : 'Supply’s asks answered') : 'No specific asks from supply'} onFix={asksLeft ? () => go(0) : null} />
        {ask.t5 && <Check ok={!!d.t5_opened_at} text={d.t5_opened_at ? 'T5 inspection started in Pulse' : 'T5 inspection not started'} onFix={!d.t5_opened_at ? () => go(0) : null} />}
        <Check ok={scored === d.trades.length} text={`${scored} of ${d.trades.length} trades scored`} onFix={scored < d.trades.length ? () => go(1) : null} />
        <Check ok={Object.keys(d.facts || {}).filter(x => x !== 'other' && d.facts[x]?.v).length >= 4} text={`${Object.keys(d.facts || {}).filter(x => x !== 'other' && d.facts[x]?.v).length} site checks answered`} onFix={() => go(2)} soft />
      </div>
      {error && <div role="alert" style={{ fontSize: 13, color: TONE.red[0] }}>{error}</div>}
    </>
  )

  const body = [asked, trades, site, items, notes, outcome][step]
  return (
    <Frame sub={sub} saving={saving} scrollRef={top}
      bar={
        <div style={{ display: 'flex', gap: 4, padding: '8px 12px', background: C.panel, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
          {STEPS.map((s, i) => (
            <button key={s} type="button" onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}
              style={{ flex: 1, minWidth: 50, background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', fontFamily: F, fontSize: 11.5, color: i === step ? C.accent : C.muted, fontWeight: i === step ? 700 : 500 }}>
              <span style={{ display: 'block', height: 3, borderRadius: 2, marginBottom: 5, background: i < step ? TONE.green[0] : i === step ? C.accent : C.line }} />
              {s}
            </button>
          ))}
        </div>
      }
      foot={
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 640, margin: '0 auto', width: '100%' }}>
          <button type="button" onClick={() => go(step - 1)} disabled={step === 0} style={{ ...btn(), minWidth: 48, opacity: step === 0 ? 0.4 : 1 }} aria-label="Back">‹</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: C.muted }}>{step + 1} of {STEPS.length} · {STEPS[step]}</span>
          {step < STEPS.length - 1
            ? <button type="button" onClick={() => go(step + 1)} style={btn('primary')}>Next ›</button>
            : <button type="button" onClick={submit} disabled={!log.verdict} style={{ ...btn('primary'), opacity: log.verdict ? 1 : 0.5 }}>{log.verdict ? 'Send ›' : 'Pick the outcome'}</button>}
        </div>
      }>
      {body}
    </Frame>
  )
}

// ── after sending: Stage's form, field by field ───────────────────────────
function IntoStage({ r, log, onBack, onFresh }) {
  const f = stageFields(r, log, log.author) || {}
  const [copied, setCopied] = useState({})
  const copy = async (key, text) => { if (await copyText(text)) setCopied(c => ({ ...c, [key]: true })) }
  const rows = [['outcome', 'Visit outcome', f.outcome], ['follow_up', 'Follow-up required', f.follow_up], ['notes', 'Visit notes', f.notes], ['non_retain', 'Non-retain items', f.non_retain], ['internal', 'Internal observations', f.internal]].filter(x => x[2])
  return (
    <Frame title="Into Stage" sub={r.property_name}>
      <div style={{ ...card, borderColor: 'rgba(111,154,126,0.5)', background: TONE.green[1] }}>
        <b style={{ color: TONE.green[0] }}>✓ Logged — the admin can see it.</b>
        <span style={{ fontSize: 13, color: C.dim, lineHeight: 1.5 }}>Now fill the visit form in Stage. Each box below is one field there, in the same order. Pulse ticks this off by itself once the sync sees the visit in Stage.</span>
      </div>
      {rows.map(([key, label, text]) => (
        <div key={key} style={sheet}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={k}>{label}</span>
            <button type="button" onClick={() => copy(key, text)} style={{ ...btn(copied[key] ? undefined : 'soft'), minHeight: 32, padding: '0 12px', fontSize: 12.5, marginLeft: 'auto', color: copied[key] ? TONE.green[0] : undefined }}>{copied[key] ? '✓ Copied' : 'Copy'}</button>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: MONO, fontSize: 12, lineHeight: 1.55, color: C.text, maxHeight: key === 'notes' ? 260 : undefined, overflow: 'auto' }}>{text}</pre>
          {key === 'non_retain' && (f.non_retain_photos || []).length > 0 && (
            <span style={{ fontSize: 12, color: C.muted }}>Photos to attach in Stage: {f.non_retain_photos.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" style={{ color: C.accent, marginLeft: 6 }}>photo {i + 1}</a>)}</span>
          )}
        </div>
      ))}
      <button type="button" style={btn()} onClick={onBack}>Back to the visit</button>
      {onFresh && <button type="button" onClick={onFresh} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12.5, cursor: 'pointer', fontFamily: F }}>Visited again? Start a new log</button>}
    </Frame>
  )
}

// ── small pieces ───────────────────────────────────────────────────────────
function Check({ ok, text, onFix, soft }) {
  const t = ok ? TONE.green : soft ? TONE.grey : TONE.amber
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: t[1], color: t[0], fontSize: 12 }}>{ok ? '✓' : '·'}</span>
      <span style={{ flex: 1 }}>{text}</span>
      {!ok && onFix && <button type="button" onClick={onFix} style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontSize: 12.5, fontFamily: F }}>Go ›</button>}
    </div>
  )
}

function AddLine({ placeholder, onAdd }) {
  const [v, setV] = useState('')
  const add = () => { if (v.trim()) { onAdd(v.trim()); setV('') } }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} placeholder={placeholder} style={{ ...field, flex: 1 }} />
      <button type="button" onClick={add} disabled={!v.trim()} style={{ ...btn('soft'), opacity: v.trim() ? 1 : 0.5 }}>Add</button>
    </div>
  )
}

function PhotoButton({ busy, onAdd, small }) {
  return (
    <label style={{ width: small ? 44 : 54, height: small ? 44 : 54, borderRadius: 8, border: `1px dashed ${C.line}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontSize: busy ? 11 : 18, cursor: 'pointer', flexShrink: 0 }}>
      {busy ? '…' : '+'}
      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { onAdd(e.target.files?.[0]); e.target.value = '' }} />
    </label>
  )
}

function Photos({ list, busy, onAdd }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {(list || []).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.line}` }} /></a>)}
      <PhotoButton busy={busy} onAdd={onAdd} />
    </div>
  )
}

function Frame({ title = 'Visit log', sub, saving, bar, foot, children, scrollRef }) {
  return (
    <div ref={scrollRef} style={{ minHeight: '100svh', background: C.bg, color: C.text, fontFamily: F, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.panel, borderBottom: `1px solid ${C.border}` }}>
          <HomeMark />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{title}</div>
            {sub && <div style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
          </div>
          {saving && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.muted, whiteSpace: 'nowrap' }}>{saving}</span>}
        </header>
        {bar}
      </div>
      <main style={{ flex: 1, width: '100%', maxWidth: 640, margin: '0 auto', boxSizing: 'border-box', padding: `12px 14px ${foot ? 'calc(96px + env(safe-area-inset-bottom, 0px))' : '40px'}`, display: 'grid', gap: 10, alignContent: 'start' }}>{children}</main>
      {foot && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 6, padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))', background: C.panel, borderTop: `1px solid ${C.border}` }}>{foot}</div>
      )}
    </div>
  )
}
