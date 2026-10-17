import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import HomeMark from '../components/HomeMark'
import { uploadMedia } from '../utils/mediaUtils'
import { first, slotText, VERDICT, CAPEX_BANDS, checklistFor, readAsk, stageCopy, copyText } from '../utils/explore'

// The exploratory visit log — on the phone, on site, in about five minutes.
//
// It opens with what supply asked for, and puts those checks first. Every
// change is saved as a draft (on the server, and on this phone in case the
// signal drops); Submit sends it to the admin. Then it becomes the block to
// paste into Stage — Pulse ticks "in Stage" by itself when the sync sees it.

const MONO = 'var(--font-mono, monospace)'
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)',
  accent: 'var(--accent, #c8963e)', green: 'var(--green, #3dba7a)', red: 'var(--red, #e05c6a)', pink: '#e07ba8',
}
const SOFT = { red: 'rgba(224,92,106,0.12)', amber: 'rgba(200,150,62,0.12)', green: 'rgba(61,186,122,0.12)', pink: 'rgba(224,123,168,0.13)' }
const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'grid', gap: 8 }
const label = { fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }
const big = (on, col, soft) => ({ minHeight: 48, borderRadius: 10, border: `1px solid ${on ? col : C.border}`, background: on ? soft : C.input, color: on ? col : C.dim, fontWeight: 700, fontSize: 15, cursor: 'pointer' })
const RATE = [['ok', 'OK', C.green, SOFT.green], ['fix', 'Fix', C.accent, SOFT.amber], ['poor', 'Poor', C.red, SOFT.red]]

export default function VisitLog() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [rec, setRec] = useState(null)
  const [error, setError] = useState('')
  const [log, setLog] = useState(null)
  const [saving, setSaving] = useState('')
  const [submitted, setSubmitted] = useState(null)
  const [copied, setCopied] = useState(false)
  const [uploading, setUploading] = useState(null)
  const lsKey = `pulse.visitlog.${id}`
  const timer = useRef(null)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('exploratory_record', { p_id: id })
    if (e || !data) { setError(e?.message || 'No such exploratory request.'); return }
    setRec(data)
    // the draft: server's, else this phone's, else a fresh one shaped by supply's ask
    let local = null
    try { local = JSON.parse(localStorage.getItem(lsKey) || 'null') } catch { /* private window */ }
    const server = data.my_draft
    const fresh = { verdict: null, checks: checklistFor(data.request), capex_band: null, landlord_note: '', retain: [], notes: '', visited_at: new Date().toISOString() }
    const pick = server && (!local || new Date(server.updated_at) >= new Date(local._at || 0)) ? server : local
    setLog(pick ? { ...fresh, ...pick, checks: mergeChecks(fresh.checks, pick.checks) } : fresh)
  }, [id, lsKey])
  useEffect(() => { load() }, [load])

  // save as you go: this phone at once, the server a moment later
  const update = (patch) => setLog(l => {
    const next = { ...l, ...patch }
    try { localStorage.setItem(lsKey, JSON.stringify({ ...next, _at: new Date().toISOString() })) } catch { /* private window */ }
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSaving('saving…')
      const { error: e } = await supabase.rpc('exploratory_log_save', { p_id: id, p_log: next, p_submit: false })
      setSaving(e ? 'saved on this phone — will sync when online' : 'saved')
    }, 900)
    return next
  })
  const setCheck = (key, patch) => update({ checks: log.checks.map(c => c.key === key ? { ...c, ...patch } : c) })

  async function addPhoto(key, file) {
    if (!file) return
    setUploading(key)
    try {
      const url = await uploadMedia(supabase, file, `explore/${id}/${key}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
      if (url) setCheck(key, { photos: [...(log.checks.find(c => c.key === key)?.photos || []), url] })
    } catch (e) { setError(`Photo didn’t upload — ${e.message}`) }
    setUploading(null)
  }

  async function submit() {
    clearTimeout(timer.current)
    setSaving('sending…'); setError('')
    const { error: e } = await supabase.rpc('exploratory_log_save', { p_id: id, p_log: log, p_submit: true })
    if (e) { setSaving(''); setError(e.message); return }
    try { localStorage.removeItem(lsKey) } catch { /* private window */ }
    setSubmitted({ ...log, author: rec.me })
    setSaving('')
    window.scrollTo({ top: 0 })
  }

  if (error && !rec) return <Frame onBack={() => navigate(-1)}><div style={{ ...card, color: C.red, fontFamily: MONO, fontSize: 13 }}>{error}</div></Frame>
  if (!rec || !log) return <Frame onBack={() => navigate(-1)}><div style={{ height: 120, borderRadius: 12, background: C.border, opacity: 0.35 }} /></Frame>
  const r = rec.request
  const ask = readAsk(r.notes)

  // after submit: the block for Stage
  if (submitted) {
    const text = stageCopy(r, submitted, submitted.author)
    return (
      <Frame title="Into Stage" sub={r.property_name} onBack={() => navigate(`/explore/${id}`)}>
        <div style={{ ...card, borderColor: C.green, background: SOFT.green }}><b style={{ color: C.green }}>✓ Logged — the admin can see it.</b><span style={{ fontSize: 13, color: C.dim }}>Now paste it into the visit form in Stage. Pulse ticks it off by itself once the next sync sees it there.</span></div>
        <div style={card}>
          <span style={label}>copy for stage</span>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: MONO, fontSize: 12, lineHeight: 1.5, margin: 0, padding: 10, borderRadius: 10, border: `1px dashed ${C.border}`, background: C.input }}>{text}</pre>
          <button style={big(copied, C.green, SOFT.green)} onClick={async () => { if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 2500) } }}>{copied ? '✓ Copied' : 'Copy for Stage'}</button>
        </div>
        <button style={{ ...big(false), fontSize: 13 }} onClick={() => navigate(`/explore/${id}`)}>Back to the record</button>
      </Frame>
    )
  }

  return (
    <Frame title="Visit log" sub={`${r.property_name}${r.configuration ? ` · ${r.configuration}` : ''}`} saving={saving} onBack={() => navigate(`/explore/${id}`)}>
      {r.notes && <div style={{ borderLeft: `3px solid ${C.pink}`, background: SOFT.pink, padding: '9px 12px', borderRadius: '0 10px 10px 0', fontSize: 13.5 }}><span style={{ ...label, color: C.pink, display: 'block', marginBottom: 3 }}>supply asked</span>{r.notes}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: MONO, fontSize: 11.5, color: C.muted }}>
        <span>{slotText(r.visit_date, r.visit_time)}</span>{r.owner_name && <span>· landlord {r.owner_name}</span>}
        {r.owner_phone && <a href={`tel:${r.owner_phone}`} style={{ color: C.accent }}>Call</a>}{r.maps_link && <a href={r.maps_link} target="_blank" rel="noreferrer" style={{ color: C.accent }}>Map</a>}
      </div>

      <div style={card}>
        <span style={label}>verdict</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[['go', C.green, SOFT.green], ['no_go', C.red, SOFT.red], ['unsure', C.accent, SOFT.amber]].map(([k, col, soft]) => (
            <button key={k} type="button" aria-pressed={log.verdict === k} onClick={() => update({ verdict: k })} style={big(log.verdict === k, col, soft)}>{VERDICT[k][0]}</button>
          ))}
        </div>
      </div>

      <span style={label}>checks{ask.hygiene ? ' · hygiene first because supply asked for it' : ask.retain ? ' · furniture first because supply asked what to keep' : ''}</span>
      {log.checks.map(c => (
        <div key={c.key} style={{ ...card, gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{c.label}</span>
            {RATE.map(([k, l, col, soft]) => (
              <button key={k} type="button" aria-pressed={c.rating === k} onClick={() => setCheck(c.key, { rating: c.rating === k ? null : k })}
                style={{ minHeight: 38, minWidth: 50, padding: '0 9px', borderRadius: 8, border: `1px solid ${c.rating === k ? col : C.border}`, background: c.rating === k ? soft : C.input, color: c.rating === k ? col : C.dim, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          {(c.rating === 'fix' || c.rating === 'poor' || c.note || (c.photos || []).length > 0) && (
            <>
              <input value={c.note || ''} onChange={e => setCheck(c.key, { note: e.target.value })} placeholder="What did you see?"
                style={{ minHeight: 42, padding: '0 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontSize: 14 }} />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {(c.photos || []).map((u, i) => <img key={i} src={u} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />)}
                <label style={{ minHeight: 40, padding: '0 12px', borderRadius: 9, border: `1px dashed ${C.border}`, display: 'inline-flex', alignItems: 'center', fontFamily: MONO, fontSize: 12, color: C.accent, cursor: 'pointer' }}>
                  {uploading === c.key ? 'Uploading…' : '+ Photo'}
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => addPhoto(c.key, e.target.files?.[0])} />
                </label>
              </div>
            </>
          )}
        </div>
      ))}

      {(ask.retain || ask.furnishCost || (log.retain || []).length > 0) && (
        <div style={card}>
          <span style={label}>furniture — keep or replace</span>
          {(log.retain || []).map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={x.item} onChange={e => update({ retain: log.retain.map((y, j) => j === i ? { ...y, item: e.target.value } : y) })} placeholder="Item (e.g. dining table)"
                style={{ flex: 1, minWidth: 0, minHeight: 40, padding: '0 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontSize: 14 }} />
              {[[true, 'Keep', C.green, SOFT.green], [false, 'Replace', C.red, SOFT.red]].map(([k, l, col, soft]) => (
                <button key={l} type="button" aria-pressed={x.keep === k} onClick={() => update({ retain: log.retain.map((y, j) => j === i ? { ...y, keep: k } : y) })}
                  style={{ minHeight: 40, padding: '0 10px', borderRadius: 8, border: `1px solid ${x.keep === k ? col : C.border}`, background: x.keep === k ? soft : C.input, color: x.keep === k ? col : C.dim, fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>
          ))}
          <button type="button" onClick={() => update({ retain: [...(log.retain || []), { item: '', keep: true }] })} style={{ ...big(false), minHeight: 40, fontSize: 13, color: C.accent }}>+ Add an item</button>
        </div>
      )}

      <div style={card}>
        <span style={label}>rough capex{ask.furnishCost ? ' · supply wants the furnishing cost' : ''}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CAPEX_BANDS.map(b => (
            <button key={b} type="button" aria-pressed={log.capex_band === b} onClick={() => update({ capex_band: log.capex_band === b ? null : b })}
              style={{ minHeight: 40, padding: '0 12px', borderRadius: 20, border: `1px solid ${log.capex_band === b ? C.accent : C.border}`, background: log.capex_band === b ? SOFT.amber : C.input, color: log.capex_band === b ? C.accent : C.dim, fontFamily: MONO, fontSize: 12.5, fontWeight: log.capex_band === b ? 700 : 500, cursor: 'pointer' }}>{b}</button>
          ))}
        </div>
      </div>

      <div style={card}>
        <span style={label}>landlord</span>
        <textarea value={log.landlord_note || ''} onChange={e => update({ landlord_note: e.target.value })} placeholder="How flexible are they? Anything they’ll fix before handover?" rows={3}
          style={{ width: '100%', borderRadius: 10, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontSize: 14, padding: 10, resize: 'vertical', fontFamily: 'inherit' }} />
        <span style={label}>anything else</span>
        <textarea value={log.notes || ''} onChange={e => update({ notes: e.target.value })} rows={3}
          style={{ width: '100%', borderRadius: 10, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontSize: 14, padding: 10, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {error && <div role="alert" style={{ fontFamily: MONO, fontSize: 12.5, color: C.red }}>{error}</div>}
      <button type="button" onClick={submit} disabled={!log.verdict} style={{ ...big(!!log.verdict, C.accent, SOFT.amber), minHeight: 52, opacity: log.verdict ? 1 : 0.5 }}>
        {log.verdict ? 'Submit log' : 'Pick a verdict to submit'}
      </button>
      <div style={{ fontFamily: MONO, fontSize: 11, color: C.muted, textAlign: 'center' }}>Saved as you go — on this phone and in Pulse.</div>
    </Frame>
  )
}

function mergeChecks(fresh, saved) {
  if (!Array.isArray(saved) || !saved.length) return fresh
  const by = Object.fromEntries(saved.map(c => [c.key, c]))
  return fresh.map(c => by[c.key] ? { ...c, ...by[c.key] } : c)
}

function Frame({ title = 'Visit log', sub, saving, onBack, children }) {
  return (
    <div style={{ minHeight: '100svh', background: C.bg, color: C.text, fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>
      <header style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.panel, borderBottom: `1px solid ${C.border}` }}>
        <HomeMark />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{title}</div>
          {sub && <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
        </div>
        {saving && <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: C.muted }}>{saving}</span>}
      </header>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '12px 14px calc(110px + env(safe-area-inset-bottom, 0px))', display: 'grid', gap: 10 }}>{children}</main>
    </div>
  )
}
