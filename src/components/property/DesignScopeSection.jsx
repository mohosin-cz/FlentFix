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

  const url = (p) => { try { return supabase.storage.from('inspection-media').getPublicUrl(p).data.publicUrl } catch { return null } }
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

export default function DesignScopeSection({ pid }) {
  const [brief, setBrief] = useState(null)
  const [tasks, setTasks] = useState([])
  const [lines, setLines] = useState([])
  const [reloadKey, setReloadKey] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [adding, setAdding] = useState(null)   // { task_id, area, quantity, note }

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

  async function remove(line) {
    setBusy(line.id); setErr('')
    const { error } = await supabase.rpc('design_scope_remove', { p_item_id: line.id })
    setBusy('')
    if (error) { setErr(error.message); return }
    setLines(ls => ls.filter(l => l.id !== line.id))
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

      {brief && <BriefAnswers brief={brief} />}

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
        <button type="button" onClick={() => setAdding({ quantity: 1 })}
          style={{ alignSelf: 'flex-start', minHeight: 40, padding: '0 15px', borderRadius: 9, border: '1px solid var(--border-dash, #3a3d52)', background: 'transparent', color: 'var(--text, #e8e8f0)', fontSize: 13, cursor: 'pointer', fontFamily: MONO }}>
          + Add from the catalogue
        </button>
      )}

      <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.55 }}>
        Ticked lines go to the vendor with the rest of their work order. Unticked ones stay here.
        Adding a task for a trade with no work order on this property raises one, unassigned.
      </div>
    </section>
  )
}
