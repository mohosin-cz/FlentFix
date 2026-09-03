import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// The designer's scope, next to the work orders it feeds.
//
// Her brief sits open on the left of the decision and the lines on the right,
// because ticking a line is a judgement about what she wrote — doing it from
// memory, on another screen, is how the wrong things get sent to a vendor.
//
// Nothing here reaches a vendor until it is ticked. Untied lines are proposals;
// the tick is the review, and it lives where staff are already looking.

const MONO = 'var(--font-mono, monospace)'

const hhmm = (m) => {
  const n = Math.max(0, Math.round(Number(m) || 0))
  if (!n) return '—'
  if (n < 60) return `${n}m`
  const h = Math.floor(n / 60), r = n % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

const mediaUrl = (p) => {
  try { return supabase.storage.from('inspection-media').getPublicUrl(p).data.publicUrl } catch { return null }
}

// How sure it was. Shown because a low-confidence proposal is not a worse
// proposal, it is one to read her quote for before ticking.
const CONF = {
  high:   { label: 'stated',   color: 'var(--green, #3dba7a)' },
  medium: { label: 'read',     color: 'var(--accent, #c8963e)' },
  low:    { label: 'inferred', color: 'var(--text-muted, #6b6d82)' },
}

const inp = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 14,
  color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)',
  border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit',
}

// Her answers, as she wrote them. Empty fields are dropped: a brief is mostly
// blank by design and printing eleven empty rooms buries the three she filled.
function BriefAnswers({ brief }) {
  const [open, setOpen] = useState(false)
  const filled = useMemo(() => {
    const out = []
    for (const area of brief.areas || []) {
      const a = (brief.answers || {})[area] || {}
      const bits = Object.entries(a).filter(([k, v]) =>
        k !== 'photos' && (typeof v === 'number' ? v > 0 : String(v || '').trim() !== ''))
      const photos = a.photos || []
      if (bits.length || photos.length) out.push({ area, bits, photos })
    }
    return out
  }, [brief])

  const url = mediaUrl
  const LABEL = {
    furniture: 'Furniture', light_points: 'Light points', switch_points: 'Switch points',
    wall_items: 'Wall fixed', complications: 'Complicated', windows: 'Windows',
    ceiling: 'Ceiling / partitions', painting: 'Painting',
  }

  return (
    <div style={{ background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 11 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '11px 13px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
          What the designer wrote
          <span style={{ color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginInlineStart: 8, fontSize: 11 }}>
            {filled.length} area{filled.length === 1 ? '' : 's'}
            {brief.designer_name ? ` · ${brief.designer_name}` : ''}
          </span>
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)' }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 13px 13px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filled.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>She left it blank.</span>}
          {filled.map(({ area, bits, photos }) => (
            <div key={area} style={{ borderTop: '1px solid var(--border, #2e3040)', paddingTop: 9 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{area}</div>
              {bits.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 8, marginTop: 5, fontSize: 12.5, lineHeight: 1.5 }}>
                  <span style={{ minWidth: 104, flexShrink: 0, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, fontSize: 11 }}>{LABEL[k] || k}</span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text, #e8e8f0)', wordBreak: 'break-word' }}>{String(v)}</span>
                </div>
              ))}
              {photos.length > 0 && (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
                  {photos.map(p => (
                    <a key={p} href={url(p)} target="_blank" rel="noreferrer" style={{ lineHeight: 0 }}>
                      <img src={url(p)} alt="" style={{ width: 62, height: 62, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border, #2e3040)' }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DesignScopeSection({ pid, showBrief = true }) {
  const [brief, setBrief] = useState(null)
  const [tasks, setTasks] = useState([])
  const [lines, setLines] = useState([])
  const [reloadKey, setReloadKey] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [adding, setAdding] = useState(null)   // { task_id, area, quantity, note }
  const [proposals, setProposals] = useState(null)  // null = never read; [] = read, nothing found
  const [reading, setReading] = useState(false)

  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [bRes, tRes, lRes] = await Promise.all([
        supabase.from('designer_brief').select('*').eq('pid', pid).order('created_at', { ascending: false }).limit(1),
        supabase.from('task_catalogue').select('*').eq('active', true).order('trade').order('category').order('name'),
        supabase.from('work_order_items')
          .select('*, work_order:work_orders!inner(id,pid,trade,status,vendor_name)')
          .eq('source', 'designer').eq('work_order.pid', pid),
      ])
      if (!alive) return
      setBrief((bRes.data || [])[0] || null)
      setTasks(tRes.data || [])
      setLines(lRes.data || [])
      setErr(bRes.error?.message || tRes.error?.message || lRes.error?.message || '')
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [pid, reloadKey])

  // Trade first, then category — the two groupings a plan is read by. Trade
  // because that is who turns up; category because that is what they carry.
  const grouped = useMemo(() => {
    const byTrade = new Map()
    for (const l of lines) {
      const trade = l.work_order?.trade || '—'
      const g = byTrade.get(trade) || { trade, cats: new Map(), minutes: 0, on: 0 }
      const cat = l.category || 'Other'
      const c = g.cats.get(cat) || []
      c.push(l); g.cats.set(cat, c)
      if (l.included) { g.minutes += Number(l.minutes || 0); g.on++ }
      byTrade.set(trade, g)
    }
    return [...byTrade.values()].sort((a, b) => a.trade.localeCompare(b.trade))
  }, [lines])

  const totalOn = grouped.reduce((s, g) => s + g.minutes, 0)

  async function toggle(line) {
    setBusy(line.id); setErr('')
    const { error } = await supabase.rpc('design_scope_set_included', { p_item_id: line.id, p_included: !line.included })
    setBusy('')
    if (error) { setErr(error.message); return }
    setLines(ls => ls.map(l => (l.id === line.id ? { ...l, included: !l.included } : l)))
  }

  // One trade at a time. Not a single "send everything" — the whole point of
  // the ticks is that somebody chose — but not forty clicks either when the
  // carpentry is all in and the painting is all out.
  async function setTrade(group, on) {
    const targets = [...group.cats.values()].flat().filter(l => !!l.included !== on)
    if (!targets.length) return
    setBusy(`t:${group.trade}`); setErr('')
    const results = await Promise.all(targets.map(l =>
      supabase.rpc('design_scope_set_included', { p_item_id: l.id, p_included: on })))
    setBusy('')
    const failed = results.filter(r => r.error)
    // Some may have gone through. Update from what actually succeeded rather
    // than assuming all-or-nothing, so the screen matches the database.
    const okIds = new Set(targets.filter((_, i) => !results[i].error).map(l => l.id))
    setLines(ls => ls.map(l => (okIds.has(l.id) ? { ...l, included: on } : l)))
    if (failed.length) setErr(`${failed.length} of ${targets.length} didn’t change — ${failed[0].error.message}`)
  }

  async function remove(line) {
    setBusy(line.id); setErr('')
    const { error } = await supabase.rpc('design_scope_remove', { p_item_id: line.id })
    setBusy('')
    if (error) { setErr(error.message); return }
    setLines(ls => ls.filter(l => l.id !== line.id))
  }

  // Read her brief and propose the lines. Nothing is written by this — what
  // comes back sits below until somebody accepts it, one line at a time.
  async function readBrief() {
    if (!brief) return
    setReading(true); setErr(''); setProposals(null)
    const { data, error } = await supabase.functions.invoke('design-scope-extract', {
      body: { brief_id: brief.id },
    })
    setReading(false)
    // Two failure shapes: the call itself failed, or it returned ok:false with
    // something worth reading. Both end up in the same strip.
    if (error) { setErr(error.message || 'Could not read the brief.'); return }
    if (!data?.ok) { setErr(data?.error || 'Could not read the brief.'); return }
    setProposals(data.proposals || [])
  }

  // Accept one. Her words ride along as the note, so the vendor's line says
  // "Wall shelf — three floating shelves over the desk" and not just the task.
  async function accept(p, i) {
    setBusy(`p${i}`); setErr('')
    const { error } = await supabase.rpc('design_scope_add', {
      p_pid: pid, p_task_id: p.catalogue_id,
      p_area: p.area || 'Whole property',
      p_quantity: Number(p.quantity) || 1,
      p_note: p.label || null,
      p_brief_id: brief?.id || null,
    })
    setBusy('')
    if (error) { setErr(error.message); return }
    setProposals(ps => (ps || []).filter((_, n) => n !== i))
    reload()
  }

  async function add() {
    if (!adding?.task_id) { setErr('Pick a task.'); return }
    setBusy('add'); setErr('')
    const { error } = await supabase.rpc('design_scope_add', {
      p_pid: pid, p_task_id: adding.task_id,
      p_area: adding.area || 'Whole property',
      p_quantity: Number(adding.quantity) || 1,
      p_note: adding.note || null,
      p_brief_id: brief?.id || null,
    })
    setBusy('')
    if (error) { setErr(error.message); return }
    setAdding(null); reload()
  }

  if (!loaded) return null
  // Nothing to say until a designer has been asked. The tile on the property
  // page is where a brief gets raised; this section is for reading one.
  if (!brief && lines.length === 0) return null

  const areas = brief?.areas || []
  const task = tasks.find(t => t.id === adding?.task_id)

  return (
    <section style={{ marginTop: 14, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Design scope</span>
        {brief && (
          <span style={{ fontSize: 11, color: brief.status === 'submitted' ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)', fontFamily: MONO }}>
            brief {brief.status}
          </span>
        )}
        <span style={{ marginInlineStart: 'auto', fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
          {lines.filter(l => l.included).length} of {lines.length} in · {hhmm(totalOn)}
        </span>
      </div>

      {showBrief && brief && <BriefAnswers brief={brief} />}

      {err && (
        <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word' }}>⚠ {err}</div>
      )}

      {grouped.map(g => (
        <div key={g.trade} style={{ border: '1px solid var(--border, #2e3040)', borderRadius: 11, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', background: 'var(--bg-input, #252731)' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{g.trade}</span>
            <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
              {g.on} in · {hhmm(g.minutes)}
            </span>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              {[['All in', true], ['None', false]].map(([label, on]) => (
                <button key={label} type="button" onClick={() => setTrade(g, on)} disabled={busy === `t:${g.trade}`}
                  title={`${on ? 'Include' : 'Exclude'} every ${g.trade} line`}
                  style={{ minHeight: 26, padding: '0 9px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'transparent', color: 'var(--text-dim, #9394a8)', fontSize: 10.5, cursor: 'pointer', fontFamily: MONO }}>
                  {busy === `t:${g.trade}` ? '…' : label}
                </button>
              ))}
            </div>
          </div>
          {[...g.cats.entries()].map(([cat, items]) => (
            <div key={cat}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, padding: '9px 12px 3px' }}>{cat}</div>
              {items.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid var(--border, #2e3040)' }}>
                  <input type="checkbox" checked={!!l.included} disabled={busy === l.id} onChange={() => toggle(l)}
                    aria-label={`Include ${l.description}`}
                    style={{ width: 18, height: 18, flexShrink: 0, accentColor: 'var(--green, #3dba7a)', cursor: 'pointer' }} />
                  <div style={{ flex: 1, minWidth: 0, opacity: l.included ? 1 : 0.55 }}>
                    <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{l.description}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
                      {l.area} · {Number(l.quantity)} × · {String(l.requirement_type || '').replace('_', ' ')}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: MONO, flexShrink: 0, color: l.included ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)' }}>{hhmm(l.minutes)}</span>
                  <button type="button" onClick={() => remove(l)} disabled={busy === l.id} aria-label="Remove line"
                    style={{ background: 'none', border: 'none', color: 'var(--red, #e05c6a)', cursor: 'pointer', fontSize: 13, padding: '4px 2px', flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {proposals && (
        <div style={{ border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 11, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', background: 'var(--bg-input, #252731)' }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>Read from her brief</span>
            <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
              {proposals.length} proposed
            </span>
            <button type="button" onClick={() => setProposals(null)} aria-label="Dismiss all proposals"
              style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 13, padding: '2px 0' }}>✕</button>
          </div>

          {proposals.length === 0 && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
              Nothing to propose from what she wrote.
            </div>
          )}

          {proposals.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--border, #2e3040)' }}>
              {p.source_photo && (
                <a href={mediaUrl(p.source_photo)} target="_blank" rel="noreferrer" style={{ lineHeight: 0, flexShrink: 0 }}>
                  <img src={mediaUrl(p.source_photo)} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--border, #2e3040)' }} />
                </a>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{p.label}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
                  {p.area} · {p.quantity} × {p.unit || 'each'}
                  {p.catalogue_id
                    ? <> · {p.task_name} · {p.trade}</>
                    : <span style={{ color: 'var(--accent, #c8963e)' }}> · not in the catalogue</span>}
                  {' · '}
                  <span style={{ color: (CONF[p.confidence] || CONF.low).color }}>{(CONF[p.confidence] || CONF.low).label}</span>
                </div>
                {p.source_quote && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', marginTop: 4, lineHeight: 1.5, borderInlineStart: '2px solid var(--border, #2e3040)', paddingInlineStart: 8, wordBreak: 'break-word' }}>
                    “{p.source_quote}”
                  </div>
                )}
                {/* No duration on an unmatched line, because nothing has set one.
                    Typing it into the catalogue is the step, and it is a step on
                    purpose — a made-up number would get rostered against. */}
                {!p.catalogue_id && (
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 4, lineHeight: 1.5 }}>
                    Add it in /admin/tasks with a duration, then read the brief again.
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {p.catalogue_id && (
                  <button type="button" onClick={() => accept(p, i)} disabled={busy === `p${i}`}
                    style={{ minHeight: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--green, #3dba7a)', color: '#16171f', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>
                    {busy === `p${i}` ? '…' : 'Add'}
                  </button>
                )}
                <button type="button" onClick={() => setProposals(ps => ps.filter((_, n) => n !== i))} aria-label="Discard this proposal"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 13, padding: '4px 2px' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ border: '1px solid var(--accent, #c8963e)', borderRadius: 11, padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <select style={{ ...inp, cursor: 'pointer' }} value={adding.task_id || ''}
            onChange={e => setAdding(a => ({ ...a, task_id: e.target.value }))}>
            <option value="">Pick a task…</option>
            {tasks.map(t => <option key={t.id} value={t.id}>{t.name} · {t.trade} · {t.minutes}m per {t.unit}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 9 }}>
            <select style={{ ...inp, cursor: 'pointer', flex: 1 }} value={adding.area || ''}
              onChange={e => setAdding(a => ({ ...a, area: e.target.value }))}>
              <option value="">Which area…</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <input style={{ ...inp, width: 92, flexShrink: 0 }} inputMode="decimal" placeholder="Qty"
              value={adding.quantity ?? ''} onChange={e => setAdding(a => ({ ...a, quantity: e.target.value.replace(/[^0-9.]/g, '') }))} />
          </div>
          <input style={inp} placeholder="Note for the vendor (optional)" value={adding.note || ''}
            onChange={e => setAdding(a => ({ ...a, note: e.target.value }))} />
          {task && (
            <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
              {task.trade} · {task.category} · {hhmm(task.minutes * (Number(adding.quantity) || 1))} for {Number(adding.quantity) || 1} {task.unit}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setAdding(null); setErr('') }}
              style={{ minHeight: 40, padding: '0 14px', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'transparent', color: 'var(--text-dim, #9394a8)', fontSize: 13, cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
            <button type="button" onClick={add} disabled={busy === 'add'}
              style={{ minHeight: 40, padding: '0 18px', borderRadius: 9, border: 'none', background: 'var(--accent, #c8963e)', color: '#16171f', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>
              {busy === 'add' ? 'Adding…' : 'Add line'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setAdding({ quantity: 1 })}
            style={{ minHeight: 40, padding: '0 15px', borderRadius: 9, border: '1px solid var(--border-dash, #3a3d52)', background: 'transparent', color: 'var(--text, #e8e8f0)', fontSize: 13, cursor: 'pointer', fontFamily: MONO }}>
            + Add from the catalogue
          </button>
          {brief && (
            <button type="button" onClick={readBrief} disabled={reading}
              style={{ minHeight: 40, padding: '0 15px', borderRadius: 9, border: '1px solid var(--border-dash, #3a3d52)', background: 'transparent', color: reading ? 'var(--text-muted, #6b6d82)' : 'var(--text, #e8e8f0)', fontSize: 13, cursor: reading ? 'default' : 'pointer', fontFamily: MONO }}>
              {reading ? 'Reading her brief…' : 'Read her brief'}
            </button>
          )}
        </div>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.55 }}>
        Ticked lines go to the vendor with the rest of their work order. Unticked ones stay here.
        Adding a task for a trade with no work order on this property raises one, unassigned.
        “Read her brief” proposes lines from her words and photos — it never sets a duration and never adds anything by itself.
      </div>
    </section>
  )
}
