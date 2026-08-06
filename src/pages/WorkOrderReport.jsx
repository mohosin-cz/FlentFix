import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Completion report for a whole property job: every trade, every vendor, what
// was planned versus what was actually used. Staff-only — the cost tables it
// reads have no anon grant, and this route sits behind ProtectedRoute.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const MISC = 'Misc'
const tradeLabel = (t) => (t === MISC ? 'Misc / untriaged' : t)
const isClosed = (it) => it.status !== 'pending' && it.status !== 'disputed'

const inr = (n) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n || 0))}`
const num = (v) => (v == null || v === '' ? null : Number(v))
// "₹19,500" typed into a number input silently clears it, so these are text
// inputs and the currency/commas are stripped here instead.
const cleanAmount = (s) => {
  const t = String(s ?? '').replace(/[^0-9.]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const daysBetween = (a, b) => {
  if (!a || !b) return null
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000))
}

function ErrStrip({ children, onRetry }) {
  return (
    <div style={{ padding: '11px 13px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontFamily: MONO }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--red, #e05c6a)' }}>⚠ {children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ marginTop: 8, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: MONO }}>Retry</button>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, tone }) {
  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 11, padding: '13px 14px', minWidth: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 700, marginTop: 5, color: tone || 'var(--text, #e8e8f0)', lineHeight: 1.15, wordBreak: 'break-word' }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

const STATUS_WORD = {
  verified: 'Verified', vendor_completed: 'Awaiting verification',
  in_progress: 'In progress', assigned: 'Assigned', draft: 'Not issued',
}
const statusWord = (s) => STATUS_WORD[s] || s
const ITEM_WORD = { verified: 'verified', vendor_closed: 'awaiting check', disputed: 'sent back', pending: 'open' }

// Slack caps a section at 3000 characters and a message at 50 blocks, so the
// long lists get split rather than silently truncated by Slack itself.
const chunkLines = (lines, max = 2800) => {
  const out = []
  let cur = ''
  for (const l of lines) {
    if (cur && cur.length + l.length + 1 > max) { out.push(cur); cur = l }
    else cur = cur ? `${cur}\n${l}` : l
  }
  if (cur) out.push(cur)
  return out
}
const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } })

const cell = { padding: '9px 10px', fontSize: 12, textAlign: 'left', verticalAlign: 'top' }
const head = { ...cell, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, whiteSpace: 'nowrap' }
const editInput = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px', fontSize: 12,
  color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)',
  border: '1px solid var(--border, #2e3040)', borderRadius: 6, outline: 'none', fontFamily: 'inherit',
}

// One editable line. Blank means "as planned" — we never copy the estimate into
// the actual, so an untouched report reads honestly as unmodified.
function ItemRow({ row, onSave, saving, err }) {
  // Seeded once. The table only mounts after the load has resolved, so the
  // saved values are already here — and once you are typing, the draft is the
  // truth: a background refresh must never overwrite the field under a cursor.
  const [draft, setDraft] = useState({
    actual_material: row.actual?.actual_material ?? '',
    material_cost: row.actual?.material_cost ?? '',
    labour_cost: row.actual?.labour_cost ?? '',
    note: row.actual?.note ?? '',
  })

  const commit = (patch) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    onSave({
      actual_material: next.actual_material.trim() || null,
      material_cost: cleanAmount(next.material_cost),
      labour_cost: cleanAmount(next.labour_cost),
      note: next.note.trim() || null,
    })
  }

  const changed = row.actualTotal !== row.plannedTotal
  const edited = changed || !!row.actual?.actual_material
  const [noteOpen, setNoteOpen] = useState(!!row.actual?.note)
  return (
    <>
      <tr style={{ borderTop: '1px solid var(--border, #2e3040)' }}>
        <td style={{ ...cell, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, fontSize: 10.5, whiteSpace: 'nowrap' }}>{row.area || '—'}</td>
        <td style={{ ...cell, minWidth: 150 }}>
          <div style={{ wordBreak: 'break-word' }}>{row.description}</div>
          {row.plannedMaterial && (
            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3, wordBreak: 'break-word' }}>
              planned: {row.plannedMaterial}
            </div>
          )}
          {err && <div style={{ fontSize: 10.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, marginTop: 4 }}>{err}</div>}
        </td>
        <td className="wo-edit" style={{ ...cell, minWidth: 140 }}>
          <input value={draft.actual_material} placeholder={row.plannedMaterial || 'same as planned'}
            onChange={e => setDraft(d => ({ ...d, actual_material: e.target.value }))}
            onBlur={e => commit({ actual_material: e.target.value })}
            aria-label={`Actual material for ${row.description}`} style={editInput} />
        </td>
        <td className="wo-edit" style={{ ...cell, width: 96 }}>
          <input value={draft.material_cost} placeholder={row.plannedMaterialCost != null ? String(row.plannedMaterialCost) : '0'}
            inputMode="decimal"
            onChange={e => setDraft(d => ({ ...d, material_cost: e.target.value }))}
            onBlur={e => commit({ material_cost: e.target.value })}
            aria-label={`Actual material cost for ${row.description}`} style={{ ...editInput, textAlign: 'right' }} />
        </td>
        <td className="wo-edit" style={{ ...cell, width: 96 }}>
          <input value={draft.labour_cost} placeholder={row.plannedLabourCost != null ? String(row.plannedLabourCost) : '0'}
            inputMode="decimal"
            onChange={e => setDraft(d => ({ ...d, labour_cost: e.target.value }))}
            onBlur={e => commit({ labour_cost: e.target.value })}
            aria-label={`Actual labour cost for ${row.description}`} style={{ ...editInput, textAlign: 'right' }} />
        </td>
        {/* Print-only mirrors of the three editable cells: an input's value does
            not render in a PDF, so the page would print blank boxes. */}
        <td className="wo-print-only" style={cell}>{row.actual?.actual_material || row.plannedMaterial || '—'}</td>
        <td className="wo-print-only" style={{ ...cell, textAlign: 'right' }}>{inr(row.actualMaterialCost)}</td>
        <td className="wo-print-only" style={{ ...cell, textAlign: 'right' }}>{inr(row.actualLabourCost)}</td>
        <td style={{ ...cell, textAlign: 'right', fontFamily: MONO, whiteSpace: 'nowrap' }}>
          <div>{inr(row.actualTotal)}</div>
          {changed && (
            <div style={{ fontSize: 10, color: row.actualTotal > row.plannedTotal ? 'var(--red, #e05c6a)' : 'var(--green, #3dba7a)' }}>
              {row.actualTotal > row.plannedTotal ? '+' : ''}{inr(row.actualTotal - row.plannedTotal)}
            </div>
          )}
          {saving && <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)' }}>saving…</div>}
        </td>
      </tr>
      {/* A note is worth prompting for exactly when something changed — but it
          stays reachable on every row, or the first note could never be added. */}
      {(noteOpen || draft.note) ? (
        <tr>
          <td />
          <td colSpan={7} style={{ ...cell, paddingTop: 0 }}>
            <input value={draft.note} placeholder="Note — what changed and why" autoFocus={noteOpen && !draft.note}
              onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
              onBlur={e => commit({ note: e.target.value })}
              aria-label={`Note for ${row.description}`}
              className="wo-edit" style={{ ...editInput, fontSize: 11.5 }} />
            <span className="wo-print-only" style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{row.actual?.note}</span>
          </td>
        </tr>
      ) : (
        <tr className="wo-noprint">
          <td />
          <td colSpan={7} style={{ ...cell, paddingTop: 0 }}>
            <button type="button" onClick={() => setNoteOpen(true)}
              style={{ padding: 0, background: 'none', border: 'none', fontSize: 10.5, fontFamily: MONO, cursor: 'pointer',
                color: edited ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)' }}>
              {edited ? '+ why did this change?' : '+ note'}
            </button>
          </td>
        </tr>
      )}
    </>
  )
}

export default function WorkOrderReport() {
  const navigate = useNavigate()
  const { pid } = useParams()
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState([])
  const [costs, setCosts] = useState({})       // inspection_line_item_id -> {material, labour, description}
  const [actuals, setActuals] = useState({})   // work_order_item_id -> row
  const [report, setReport] = useState(null)
  const [userEmail, setUserEmail] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [saveErr, setSaveErr] = useState({})
  const [summary, setSummary] = useState('')
  const [notice, setNotice] = useState(null)   // { text, tone }
  const [sending, setSending] = useState(false)
  const [showItems, setShowItems] = useState(true)
  const summaryDirty = useRef(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || null)

      const { data: wos, error: wErr } = await supabase
        .from('work_orders')
        .select('*, work_order_items(id, area, description, fix_type, material, quantity, status, sort_order, inspection_line_item_id, vendor_closed_at, verified_at, verified_by, dispute_count)')
        .eq('pid', pid).order('created_at', { ascending: true })
      if (wErr) throw wErr

      const list = (wos || []).map(w => ({
        ...w,
        items: [...(w.work_order_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      }))
      setOrders(list)

      const allItems = list.flatMap(w => w.items)
      const liIds = [...new Set(allItems.map(i => i.inspection_line_item_id).filter(Boolean))]
      if (liIds.length) {
        // total_cost is a GENERATED column — read the parts, never write it.
        const { data: li, error: lErr } = await supabase
          .from('inspection_line_items')
          .select('id, material_cost, labour_cost, material_description')
          .in('id', liIds)
        if (lErr) throw lErr
        const m = {}
        for (const r of li || []) m[r.id] = r
        setCosts(m)
      } else {
        setCosts({})
      }

      const itemIds = allItems.map(i => i.id)
      if (itemIds.length) {
        const { data: act, error: aErr } = await supabase
          .from('work_order_item_actuals').select('*').in('work_order_item_id', itemIds)
        if (aErr) throw aErr
        const m = {}
        for (const r of act || []) m[r.work_order_item_id] = r
        setActuals(m)
      } else {
        setActuals({})
      }

      const { data: rep, error: rErr } = await supabase
        .from('work_order_reports').select('*').eq('pid', pid).maybeSingle()
      if (rErr) throw rErr
      setReport(rep || null)
      if (!summaryDirty.current) setSummary(rep?.summary || '')

      setLoaded(true)
    } catch (e) {
      setError(e.message || String(e))
      if (!silent) setLoaded(false)
    }
    setLoading(false)
  }, [pid])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), notice.tone === 'error' ? 8000 : 3000)
    return () => clearTimeout(t)
  }, [notice])

  // Every row, with planned and actual resolved. Blank actuals fall back to the
  // estimate so the totals are always complete, but the stored row stays empty.
  const rows = useMemo(() => {
    const out = []
    for (const w of orders) {
      for (const it of w.items) {
        const li = costs[it.inspection_line_item_id] || {}
        const a = actuals[it.id] || null
        const plannedMaterialCost = Number(li.material_cost || 0)
        const plannedLabourCost = Number(li.labour_cost || 0)
        const actualMaterialCost = num(a?.material_cost) ?? plannedMaterialCost
        const actualLabourCost = num(a?.labour_cost) ?? plannedLabourCost
        out.push({
          id: it.id,
          wo: w,
          area: it.area,
          description: it.description,
          status: it.status,
          plannedMaterial: li.material_description || it.material || '',
          plannedMaterialCost, plannedLabourCost,
          plannedTotal: plannedMaterialCost + plannedLabourCost,
          actual: a,
          actualMaterialCost, actualLabourCost,
          actualTotal: actualMaterialCost + actualLabourCost,
        })
      }
    }
    return out
  }, [orders, costs, actuals])

  const byOrder = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      if (!m.has(r.wo.id)) m.set(r.wo.id, { wo: r.wo, rows: [] })
      m.get(r.wo.id).rows.push(r)
    }
    return [...m.values()]
  }, [rows])

  const totals = useMemo(() => {
    const planned = rows.reduce((n, r) => n + r.plannedTotal, 0)
    const actual = rows.reduce((n, r) => n + r.actualTotal, 0)
    const vendors = new Set(orders.map(o => o.vendor_name).filter(Boolean))
    const verified = rows.filter(r => r.status === 'verified').length
    const closed = rows.filter(r => isClosed({ status: r.status })).length
    const starts = orders.map(o => o.issued_at).filter(Boolean).map(d => new Date(d))
    const ends = orders.map(o => o.verified_at).filter(Boolean).map(d => new Date(d))
    const first = starts.length ? new Date(Math.min(...starts)) : null
    const allDone = orders.length > 0 && orders.every(o => o.status === 'verified')
    const last = allDone && ends.length ? new Date(Math.max(...ends)) : null
    return {
      planned, actual, variance: actual - planned,
      vendors: vendors.size, trades: new Set(orders.map(o => o.trade)).size,
      items: rows.length, verified, closed,
      first, last, allDone,
      days: daysBetween(first, last || new Date()),
      edited: rows.filter(r => r.actual && (r.actual.material_cost != null || r.actual.labour_cost != null || r.actual.actual_material)).length,
    }
  }, [rows, orders])

  // Where the money actually went: the split between materials and labour, the
  // share each trade took, what drove any variance, and the biggest single
  // lines. Zero-cost rows are counted too — a job where half the items carry no
  // price on file is a report you should not read as complete.
  const analysis = useMemo(() => {
    const sum = (f) => rows.reduce((n, r) => n + f(r), 0)
    const byTrade = byOrder.map(({ wo, rows: rr }) => ({
      key: wo.id,
      trade: wo.trade,
      vendor: wo.vendor_name,
      items: rr.length,
      planned: rr.reduce((n, r) => n + r.plannedTotal, 0),
      actual: rr.reduce((n, r) => n + r.actualTotal, 0),
      material: rr.reduce((n, r) => n + r.actualMaterialCost, 0),
      labour: rr.reduce((n, r) => n + r.actualLabourCost, 0),
    })).sort((a, b) => b.actual - a.actual)
    return {
      material: sum(r => r.actualMaterialCost),
      labour: sum(r => r.actualLabourCost),
      plannedMaterial: sum(r => r.plannedMaterialCost),
      plannedLabour: sum(r => r.plannedLabourCost),
      byTrade,
      top: [...rows].filter(r => r.actualTotal > 0).sort((a, b) => b.actualTotal - a.actualTotal).slice(0, 5),
      drivers: rows.filter(r => r.actualTotal !== r.plannedTotal)
        .sort((a, b) => Math.abs(b.actualTotal - b.plannedTotal) - Math.abs(a.actualTotal - a.plannedTotal)),
      zeroCost: rows.filter(r => r.actualTotal === 0).length,
      perItem: rows.length ? sum(r => r.actualTotal) / rows.length : 0,
    }
  }, [rows, byOrder])

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)

  async function saveActual(row, patch) {
    const empty = !patch.actual_material && patch.material_cost == null && patch.labour_cost == null && !patch.note
    setSavingId(row.id); setSaveErr(p => ({ ...p, [row.id]: '' }))
    let e = null
    if (empty && actuals[row.id]) {
      // cleared every field — drop the override rather than storing an empty row
      ;({ error: e } = await supabase.from('work_order_item_actuals').delete().eq('work_order_item_id', row.id))
      if (!e) setActuals(p => { const n = { ...p }; delete n[row.id]; return n })
    } else if (!empty) {
      const next = { work_order_item_id: row.id, ...patch, updated_by: userEmail, updated_at: new Date().toISOString() }
      ;({ error: e } = await supabase.from('work_order_item_actuals').upsert(next, { onConflict: 'work_order_item_id' }))
      if (!e) setActuals(p => ({ ...p, [row.id]: next }))
    }
    setSavingId(null)
    if (e) setSaveErr(p => ({ ...p, [row.id]: e.message }))
  }

  async function saveSummary(text) {
    const row = {
      pid,
      inspection_id: orders[0]?.inspection_id || null,
      summary: text.trim() || null,
    }
    const { data, error: e } = report
      ? await supabase.from('work_order_reports').update({ summary: row.summary }).eq('id', report.id).select().single()
      : await supabase.from('work_order_reports').insert(row).select().single()
    if (e) { setNotice({ text: `Couldn’t save the summary: ${e.message}`, tone: 'error' }); return }
    setReport(data); summaryDirty.current = false
  }

  // Rows where someone recorded something different from the estimate. These
  // are the whole reason the report is editable, so they get their own section
  // rather than being buried in the full list.
  const changedRows = useMemo(
    () => rows.filter(r => r.actualTotal !== r.plannedTotal || r.actual?.actual_material || r.actual?.note),
    [rows],
  )

  const pctVariance = totals.planned ? Math.round((totals.variance / totals.planned) * 100) : 0
  const varianceStr = `${totals.variance >= 0 ? '+' : ''}${inr(totals.variance)}${totals.planned ? ` (${totals.variance >= 0 ? '+' : ''}${pctVariance}%)` : ''}`

  // Plain text: the fallback Slack shows in notifications, and what Copy
  // summary puts on the clipboard. Same content as the blocks, no markup.
  const reportText = useMemo(() => {
    const L = []
    L.push(`PID ${pid} — Work order completion report`)
    L.push(totals.allDone ? 'Status: complete' : `Status: in progress — ${totals.items - totals.verified} of ${totals.items} items not yet verified`)
    L.push('')
    L.push(`Actual ${inr(totals.actual)} · Estimate ${inr(totals.planned)} · Variance ${varianceStr}`)
    L.push(`${totals.trades} trades · ${totals.vendors} vendors · ${totals.items} items · ${totals.verified} verified`)
    if (totals.first) L.push(`${totals.days} days — ${fmtDay(totals.first)} to ${totals.allDone ? fmtDay(totals.last) : 'ongoing'}`)
    L.push('')
    L.push('BY VENDOR')
    for (const { wo, rows: rr } of byOrder) {
      const planned = rr.reduce((n, r) => n + r.plannedTotal, 0)
      const actual = rr.reduce((n, r) => n + r.actualTotal, 0)
      const v = actual - planned
      const d = daysBetween(wo.issued_at, wo.verified_at || new Date())
      L.push(`  ${tradeLabel(wo.trade)} — ${wo.vendor_name || 'unassigned'}`)
      L.push(`    ${statusWord(wo.status)} · ${rr.length} items · ${rr.filter(r => r.status === 'verified').length} verified${wo.issued_at ? ` · ${d}d` : ''}`)
      L.push(`    ${inr(actual)}${v ? ` (est ${inr(planned)}, ${v > 0 ? '+' : ''}${inr(v)})` : ''}`)
    }
    if (changedRows.length) {
      L.push('')
      L.push('CHANGED FROM ESTIMATE')
      for (const r of changedRows) {
        L.push(`  ${r.area || '—'} · ${r.description}`)
        if (r.actual?.actual_material) L.push(`    used: ${r.actual.actual_material}${r.plannedMaterial ? ` (planned: ${r.plannedMaterial})` : ''}`)
        if (r.actualTotal !== r.plannedTotal) L.push(`    ${inr(r.plannedTotal)} → ${inr(r.actualTotal)} (${r.actualTotal > r.plannedTotal ? '+' : ''}${inr(r.actualTotal - r.plannedTotal)})`)
        if (r.actual?.note) L.push(`    note: ${r.actual.note}`)
      }
    }
    L.push('')
    L.push('ALL LINE ITEMS')
    for (const { wo, rows: rr } of byOrder) {
      L.push(`  ${tradeLabel(wo.trade)} — ${wo.vendor_name || 'unassigned'}`)
      for (const r of rr) {
        L.push(`    ${r.area || '—'} · ${r.description} · ${inr(r.actualTotal)} · ${ITEM_WORD[r.status] || r.status}`)
      }
    }
    L.push('')
    L.push('COST ANALYSIS')
    L.push(`  Materials ${inr(analysis.material)} (${pct(analysis.material, totals.actual)}%) · Labour ${inr(analysis.labour)} (${pct(analysis.labour, totals.actual)}%)`)
    L.push(`  Total ${inr(totals.actual)} · ${inr(analysis.perItem)} average per item`)
    L.push('')
    L.push('  Share by trade')
    for (const t of analysis.byTrade) {
      L.push(`    ${tradeLabel(t.trade)} — ${inr(t.actual)} (${pct(t.actual, totals.actual)}%) · materials ${inr(t.material)} · labour ${inr(t.labour)}`)
    }
    L.push('')
    L.push('  Estimate vs actual')
    L.push(`    Estimate ${inr(totals.planned)} (materials ${inr(analysis.plannedMaterial)}, labour ${inr(analysis.plannedLabour)})`)
    L.push(`    Actual   ${inr(totals.actual)} (materials ${inr(analysis.material)}, labour ${inr(analysis.labour)})`)
    L.push(`    Variance ${varianceStr}`)
    if (analysis.drivers.length) {
      L.push('    Driven by:')
      for (const r of analysis.drivers.slice(0, 8)) {
        const d = r.actualTotal - r.plannedTotal
        L.push(`      ${r.description} — ${inr(r.plannedTotal)} → ${inr(r.actualTotal)} (${d > 0 ? '+' : ''}${inr(d)})`)
      }
    } else {
      L.push('    No line was changed from its estimate.')
    }
    if (analysis.top.length) {
      L.push('')
      L.push('  Largest items')
      analysis.top.forEach((r, i) => L.push(`    ${i + 1}. ${r.area || '—'} · ${r.description} — ${inr(r.actualTotal)} (${pct(r.actualTotal, totals.actual)}%)`))
    }
    if (analysis.zeroCost) {
      L.push('')
      L.push(`  Note: ${analysis.zeroCost} of ${totals.items} items carry no cost on file, so the totals above understate the job.`)
    }
    if (summary.trim()) { L.push(''); L.push('SUMMARY'); L.push(`  ${summary.trim()}`) }
    return L.join('\n')
  }, [pid, totals, byOrder, changedRows, summary, varianceStr, analysis])

  // Block Kit: the same report, laid out so it is readable in the channel
  // rather than a wall of text.
  const slackBlocks = useMemo(() => {
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `PID ${pid} — Completion report`, emoji: false } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Actual*\n${inr(totals.actual)}` },
          { type: 'mrkdwn', text: `*Estimate*\n${inr(totals.planned)}` },
          { type: 'mrkdwn', text: `*Variance*\n${varianceStr}` },
          { type: 'mrkdwn', text: `*Time taken*\n${totals.first ? `${totals.days} days` : 'not issued'}` },
          { type: 'mrkdwn', text: `*Scope*\n${totals.trades} trades · ${totals.vendors} vendors · ${totals.items} items` },
          { type: 'mrkdwn', text: `*Status*\n${totals.allDone ? 'Complete' : `${totals.items - totals.verified} of ${totals.items} unverified`}` },
        ],
      },
      { type: 'divider' },
    ]

    const vendorLines = byOrder.map(({ wo, rows: rr }) => {
      const planned = rr.reduce((n, r) => n + r.plannedTotal, 0)
      const actual = rr.reduce((n, r) => n + r.actualTotal, 0)
      const v = actual - planned
      const d = daysBetween(wo.issued_at, wo.verified_at || new Date())
      return `*${tradeLabel(wo.trade)}* — ${wo.vendor_name || '_unassigned_'}\n`
        + `${statusWord(wo.status)} · ${rr.length} items · ${rr.filter(r => r.status === 'verified').length} verified`
        + `${wo.issued_at ? ` · ${d}d` : ''} · *${inr(actual)}*${v ? `  _(est ${inr(planned)}, ${v > 0 ? '+' : ''}${inr(v)})_` : ''}`
    })
    blocks.push(section(`*By vendor*\n\n${vendorLines.join('\n\n')}`))

    if (changedRows.length) {
      blocks.push({ type: 'divider' })
      const lines = changedRows.map(r => {
        const bits = [`*${r.area || '—'} · ${r.description}*`]
        if (r.actual?.actual_material) bits.push(`used: ${r.actual.actual_material}${r.plannedMaterial ? `  _(planned: ${r.plannedMaterial})_` : ''}`)
        if (r.actualTotal !== r.plannedTotal) bits.push(`${inr(r.plannedTotal)} → *${inr(r.actualTotal)}*  (${r.actualTotal > r.plannedTotal ? '+' : ''}${inr(r.actualTotal - r.plannedTotal)})`)
        if (r.actual?.note) bits.push(`_${r.actual.note}_`)
        return bits.join('\n')
      })
      for (const [i, text] of chunkLines(lines.map(l => `${l}\n`)).entries()) {
        blocks.push(section(i === 0 ? `*Changed from estimate* · ${changedRows.length}\n\n${text}` : text))
      }
    }

    blocks.push({ type: 'divider' })
    let itemBlocks = []
    for (const { wo, rows: rr } of byOrder) {
      const lines = rr.map(r => `• ${r.area || '—'} · ${r.description} — ${inr(r.actualTotal)} _(${ITEM_WORD[r.status] || r.status})_`)
      for (const [i, text] of chunkLines(lines).entries()) {
        itemBlocks.push(section(i === 0 ? `*${tradeLabel(wo.trade)} — ${wo.vendor_name || 'unassigned'}*\n${text}` : text))
      }
    }
    // 50 blocks is Slack's hard limit. If the job is big enough to blow it, say
    // what was left out and link to the page — never truncate silently. The
    // reserve covers the cost analysis and summary that still have to follow;
    // the item list is what gets trimmed, because it is the one part the linked
    // page shows in full.
    const RESERVE = 8 + (summary.trim() ? 2 : 0)
    const room = 50 - blocks.length - RESERVE
    let dropped = 0
    if (itemBlocks.length > room) {
      dropped = itemBlocks.length - room
      itemBlocks = itemBlocks.slice(0, room)
    }
    blocks.push(section(`*All line items* · ${totals.items}`))
    blocks.push(...itemBlocks)
    if (dropped) blocks.push(section(`_${dropped} more section${dropped === 1 ? '' : 's'} of items not shown — Slack caps a message at 50 blocks. Open the report for the full list._`))

    // Cost analysis closes the numbers, then the summary has the last word.
    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Cost analysis*' },
      fields: [
        { type: 'mrkdwn', text: `*Materials*\n${inr(analysis.material)} · ${pct(analysis.material, totals.actual)}%` },
        { type: 'mrkdwn', text: `*Labour*\n${inr(analysis.labour)} · ${pct(analysis.labour, totals.actual)}%` },
        { type: 'mrkdwn', text: `*Average per item*\n${inr(analysis.perItem)}` },
        { type: 'mrkdwn', text: `*Items priced*\n${totals.items - analysis.zeroCost} of ${totals.items}` },
      ],
    })
    blocks.push(section(
      `*Share by trade*\n${analysis.byTrade.map(t =>
        `${tradeLabel(t.trade)} — *${inr(t.actual)}* · ${pct(t.actual, totals.actual)}%  _(materials ${inr(t.material)}, labour ${inr(t.labour)})_`,
      ).join('\n')}`,
    ))
    const varianceLines = [
      `Estimate  ${inr(totals.planned)}  _(materials ${inr(analysis.plannedMaterial)}, labour ${inr(analysis.plannedLabour)})_`,
      `Actual  *${inr(totals.actual)}*  _(materials ${inr(analysis.material)}, labour ${inr(analysis.labour)})_`,
      `Variance  *${varianceStr}*`,
    ]
    if (analysis.drivers.length) {
      varianceLines.push('', '_Driven by:_')
      for (const r of analysis.drivers.slice(0, 8)) {
        const d = r.actualTotal - r.plannedTotal
        varianceLines.push(`• ${r.description} — ${inr(r.plannedTotal)} → ${inr(r.actualTotal)} (${d > 0 ? '+' : ''}${inr(d)})`)
      }
      if (analysis.drivers.length > 8) varianceLines.push(`_…and ${analysis.drivers.length - 8} more changed lines._`)
    } else {
      varianceLines.push('', '_No line was changed from its estimate._')
    }
    blocks.push(section(`*Estimate vs actual*\n${varianceLines.join('\n')}`))
    if (analysis.top.length) {
      blocks.push(section(
        `*Largest items*\n${analysis.top.map((r, i) =>
          `${i + 1}. ${r.area || '—'} · ${r.description} — *${inr(r.actualTotal)}* · ${pct(r.actualTotal, totals.actual)}%`,
        ).join('\n')}`,
      ))
    }
    if (analysis.zeroCost) {
      blocks.push(section(`_${analysis.zeroCost} of ${totals.items} items carry no cost on file, so the totals above understate the job._`))
    }

    if (summary.trim()) {
      blocks.push({ type: 'divider' })
      blocks.push(section(`*Summary*\n${summary.trim()}`))
    }
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `${window.location.origin}/properties/${encodeURIComponent(pid)}/work-orders/report` }],
    })
    return blocks
  }, [pid, totals, byOrder, changedRows, summary, varianceStr, analysis])

  async function copySummary() {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(reportText)
      else {
        const ta = document.createElement('textarea')
        ta.value = reportText; ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta); ta.focus(); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta)
      }
      setNotice({ text: 'Summary copied — paste into Slack' })
    } catch (e) {
      setNotice({ text: `Couldn’t copy: ${e.message || e}`, tone: 'error' })
    }
  }

  async function sendToSlack() {
    setSending(true)
    const { data, error: e } = await supabase.functions.invoke('wo-report-notify', {
      body: { pid, text: reportText, blocks: slackBlocks },
    })
    setSending(false)
    if (e || data?.error) {
      // Most likely cause by far is the webhook secret not being set yet, so say
      // that plainly instead of surfacing a bare 500.
      const msg = data?.error || e?.message || 'unknown error'
      setNotice({ text: `Slack: ${msg}`, tone: 'error' })
      return
    }
    setNotice({ text: 'Posted to Slack' })
    if (report) {
      const { data: up } = await supabase.from('work_order_reports')
        .update({ slack_sent_at: new Date().toISOString(), slack_sent_by: userEmail })
        .eq('id', report.id).select().single()
      if (up) setReport(up)
    }
  }

  const printCss = `
    .wo-print-only { display: none; }
    @media print {
      @page { margin: 12mm; }
      body { background: #fff !important; }
      .wo-noprint { display: none !important; }
      .wo-edit { display: none !important; }
      .wo-print-only { display: table-cell !important; }
      .wo-sheet { background: #fff !important; color: #111 !important; }
      .wo-sheet * { color: #111 !important; border-color: #ccc !important; background: transparent !important; box-shadow: none !important; }
      .wo-card { border: 1px solid #ccc !important; break-inside: avoid; }
      table { break-inside: auto; }
      tr { break-inside: avoid; break-after: auto; }
    }
  `

  return (
    <div className="wo-sheet" style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>
      <style>{printCss}</style>

      <header className="wo-noprint" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(`/properties/${pid}/work-orders`)} aria-label="Back to work orders"
          style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pulse-title" style={{ fontSize: 15.5 }}>Completion report</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>PID {pid}</div>
        </div>
      </header>

      <main style={{ width: '100%', maxWidth: 1000, margin: '0 auto', padding: '16px 16px 80px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading && <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>}
        {!loading && error && <ErrStrip onRetry={() => load()}>Couldn’t build the report: {error}</ErrStrip>}

        {!loading && loaded && orders.length === 0 && (
          <div style={{ padding: '40px 20px', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No work orders on this property yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 5, fontFamily: MONO }}>
              There is nothing to report on until work has been issued.
            </div>
          </div>
        )}

        {!loading && loaded && orders.length > 0 && (
          <>
            {/* Print header — the on-screen chrome is hidden in the PDF. */}
            <div className="wo-print-only" style={{ display: 'none' }}>
              <h1 style={{ fontSize: 20, margin: 0 }}>PID {pid} — Work order completion report</h1>
              <div style={{ fontSize: 11, fontFamily: MONO }}>Generated {fmtDay(new Date())}</div>
            </div>

            {!totals.allDone && (
              <div className="wo-noprint" style={{ padding: '10px 12px', background: 'rgba(200,150,62,0.09)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 9, fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.55 }}>
                This job isn’t finished — {totals.items - totals.verified} of {totals.items} items are still unverified. The figures below are live and will keep moving.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Kpi label="Actual cost" value={inr(totals.actual)}
                sub={`estimate ${inr(totals.planned)}`} />
              <Kpi label="Variance" value={`${totals.variance >= 0 ? '+' : ''}${inr(totals.variance)}`}
                tone={totals.variance > 0 ? 'var(--red, #e05c6a)' : totals.variance < 0 ? 'var(--green, #3dba7a)' : undefined}
                sub={totals.planned ? `${totals.variance >= 0 ? '+' : ''}${Math.round((totals.variance / totals.planned) * 100)}% vs estimate` : 'no estimate on file'} />
              <Kpi label="Time taken" value={totals.days != null ? `${totals.days}d` : '—'}
                sub={totals.first ? `${fmtDay(totals.first)} → ${totals.allDone ? fmtDay(totals.last) : 'ongoing'}` : 'not issued yet'} />
              <Kpi label="Vendors" value={totals.vendors} sub={`${totals.trades} trade${totals.trades === 1 ? '' : 's'}`} />
              <Kpi label="Items" value={totals.items} sub={`${totals.verified} verified · ${totals.edited} edited`} />
            </div>

            {/* Per vendor — the breakdown that answers "who did what, for how much". */}
            <div className="wo-card" style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px 0', fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>By vendor</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th style={head}>Trade</th><th style={head}>Vendor</th><th style={head}>Status</th>
                      <th style={head}>Items</th><th style={head}>Days</th>
                      <th style={{ ...head, textAlign: 'right' }}>Estimate</th>
                      <th style={{ ...head, textAlign: 'right' }}>Actual</th>
                      <th style={{ ...head, textAlign: 'right' }}>Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byOrder.map(({ wo, rows: rr }) => {
                      const planned = rr.reduce((n, r) => n + r.plannedTotal, 0)
                      const actual = rr.reduce((n, r) => n + r.actualTotal, 0)
                      const v = actual - planned
                      const d = daysBetween(wo.issued_at, wo.verified_at || new Date())
                      return (
                        <tr key={wo.id} style={{ borderTop: '1px solid var(--border, #2e3040)' }}>
                          <td style={cell}>{tradeLabel(wo.trade)}</td>
                          <td style={cell}>{wo.vendor_name || <span style={{ color: 'var(--text-muted, #6b6d82)' }}>unassigned</span>}</td>
                          <td style={{ ...cell, fontFamily: MONO, fontSize: 10.5, color: wo.status === 'verified' ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }}>{wo.status}</td>
                          <td style={{ ...cell, fontFamily: MONO }}>{rr.length}</td>
                          <td style={{ ...cell, fontFamily: MONO }}>{wo.issued_at ? `${d}d` : '—'}</td>
                          <td style={{ ...cell, textAlign: 'right', fontFamily: MONO }}>{inr(planned)}</td>
                          <td style={{ ...cell, textAlign: 'right', fontFamily: MONO, fontWeight: 700 }}>{inr(actual)}</td>
                          <td style={{ ...cell, textAlign: 'right', fontFamily: MONO, color: v > 0 ? 'var(--red, #e05c6a)' : v < 0 ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }}>
                            {v === 0 ? '—' : `${v > 0 ? '+' : ''}${inr(v)}`}
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '2px solid var(--border, #2e3040)' }}>
                      <td style={{ ...cell, fontWeight: 700 }} colSpan={5}>Total</td>
                      <td style={{ ...cell, textAlign: 'right', fontFamily: MONO }}>{inr(totals.planned)}</td>
                      <td style={{ ...cell, textAlign: 'right', fontFamily: MONO, fontWeight: 700 }}>{inr(totals.actual)}</td>
                      <td style={{ ...cell, textAlign: 'right', fontFamily: MONO, fontWeight: 700, color: totals.variance > 0 ? 'var(--red, #e05c6a)' : totals.variance < 0 ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }}>
                        {totals.variance === 0 ? '—' : `${totals.variance > 0 ? '+' : ''}${inr(totals.variance)}`}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Line by line, editable. This is where "we actually used a different
                part" gets recorded against the job. */}
            <div className="wo-card" style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px 0', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Line items</span>
                <span className="wo-noprint" style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                  leave a field blank to keep the estimate
                </span>
                <button type="button" className="wo-noprint" onClick={() => setShowItems(s => !s)}
                  style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
                  {showItems ? 'Hide' : `Show ${rows.length}`}
                </button>
              </div>
              {showItems && byOrder.map(({ wo, rows: rr }) => (
                <div key={wo.id} style={{ marginTop: 10 }}>
                  <div style={{ padding: '7px 14px', background: 'var(--bg-input, #252731)', fontSize: 11.5, fontFamily: MONO, color: 'var(--text-dim, #9394a8)' }}>
                    {tradeLabel(wo.trade)} · {wo.vendor_name || 'unassigned'}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                      <thead>
                        <tr>
                          <th style={head}>Area</th><th style={head}>Item</th>
                          <th style={head}>Material used</th>
                          <th style={{ ...head, textAlign: 'right' }}>Material ₹</th>
                          <th style={{ ...head, textAlign: 'right' }}>Labour ₹</th>
                          <th style={{ ...head, textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rr.map(r => (
                          <ItemRow key={r.id} row={r} saving={savingId === r.id} err={saveErr[r.id]}
                            onSave={(patch) => saveActual(r, patch)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {/* Cost analysis closes the numbers; the summary then has the last word. */}
            <div className="wo-card" style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Cost analysis</div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <Kpi label="Materials" value={inr(analysis.material)} sub={`${pct(analysis.material, totals.actual)}% of spend`} />
                <Kpi label="Labour" value={inr(analysis.labour)} sub={`${pct(analysis.labour, totals.actual)}% of spend`} />
                <Kpi label="Average per item" value={inr(analysis.perItem)} sub={`across ${totals.items} items`} />
                <Kpi label="Items priced" value={`${totals.items - analysis.zeroCost}/${totals.items}`}
                  tone={analysis.zeroCost ? 'var(--accent, #c8963e)' : undefined}
                  sub={analysis.zeroCost ? `${analysis.zeroCost} carry no cost` : 'all costed'} />
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th style={head}>Share by trade</th>
                      <th style={{ ...head, textAlign: 'right' }}>Materials</th>
                      <th style={{ ...head, textAlign: 'right' }}>Labour</th>
                      <th style={{ ...head, textAlign: 'right' }}>Total</th>
                      <th style={{ ...head, textAlign: 'right' }}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.byTrade.map(t => (
                      <tr key={t.key} style={{ borderTop: '1px solid var(--border, #2e3040)' }}>
                        <td style={cell}>{tradeLabel(t.trade)}{t.vendor ? <span style={{ color: 'var(--text-muted, #6b6d82)' }}> · {t.vendor}</span> : null}</td>
                        <td style={{ ...cell, textAlign: 'right', fontFamily: MONO }}>{inr(t.material)}</td>
                        <td style={{ ...cell, textAlign: 'right', fontFamily: MONO }}>{inr(t.labour)}</td>
                        <td style={{ ...cell, textAlign: 'right', fontFamily: MONO, fontWeight: 700 }}>{inr(t.actual)}</td>
                        <td style={{ ...cell, textAlign: 'right', fontFamily: MONO, color: 'var(--text-muted, #6b6d82)' }}>{pct(t.actual, totals.actual)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <div>
                  <div style={{ ...head, padding: '0 0 6px' }}>Estimate vs actual</div>
                  <div style={{ fontSize: 12, fontFamily: MONO, lineHeight: 1.9, color: 'var(--text-dim, #9394a8)' }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ flex: 1 }}>Estimate</span>
                      <span style={{ color: 'var(--text, #e8e8f0)', flexShrink: 0 }}>{inr(totals.planned)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ flex: 1 }}>Actual</span>
                      <span style={{ color: 'var(--text, #e8e8f0)', fontWeight: 700, flexShrink: 0 }}>{inr(totals.actual)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border, #2e3040)', marginTop: 4, paddingTop: 4 }}>
                      <span style={{ flex: 1 }}>Variance</span>
                      <span style={{ fontWeight: 700, flexShrink: 0, color: totals.variance > 0 ? 'var(--red, #e05c6a)' : totals.variance < 0 ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }}>{varianceStr}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', marginTop: 10, lineHeight: 1.7 }}>
                    {analysis.drivers.length ? (
                      <>
                        <div style={{ marginBottom: 3 }}>Driven by</div>
                        {analysis.drivers.slice(0, 8).map(r => {
                          const d = r.actualTotal - r.plannedTotal
                          return (
                            <div key={r.id} style={{ wordBreak: 'break-word' }}>
                              · {r.description} {inr(r.plannedTotal)} → {inr(r.actualTotal)}{' '}
                              <span style={{ color: d > 0 ? 'var(--red, #e05c6a)' : 'var(--green, #3dba7a)' }}>({d > 0 ? '+' : ''}{inr(d)})</span>
                            </div>
                          )
                        })}
                        {analysis.drivers.length > 8 && <div>…and {analysis.drivers.length - 8} more changed lines</div>}
                      </>
                    ) : 'No line was changed from its estimate.'}
                  </div>
                </div>

                <div>
                  <div style={{ ...head, padding: '0 0 6px' }}>Largest items</div>
                  {analysis.top.length ? (
                    <div style={{ fontSize: 11.5, fontFamily: MONO, color: 'var(--text-dim, #9394a8)', lineHeight: 1.9 }}>
                      {analysis.top.map((r, i) => (
                        <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                          <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{i + 1}. {r.description}</span>
                          <span style={{ color: 'var(--text, #e8e8f0)', flexShrink: 0 }}>{inr(r.actualTotal)} · {pct(r.actualTotal, totals.actual)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)' }}>Nothing on this job carries a cost yet.</div>
                  )}
                </div>
              </div>

              {analysis.zeroCost > 0 && (
                <div style={{ padding: '9px 11px', background: 'rgba(200,150,62,0.09)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 8, fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.55 }}>
                  {analysis.zeroCost} of {totals.items} items carry no cost on file, so these totals understate the job.
                </div>
              )}
            </div>

            <div className="wo-card" style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginBottom: 8 }}>Summary</div>
              <textarea value={summary} rows={3} className="wo-edit"
                onChange={e => { summaryDirty.current = true; setSummary(e.target.value) }}
                onBlur={e => saveSummary(e.target.value)}
                placeholder="Anything the numbers don’t say — delays, substitutions, disputes"
                aria-label="Report summary"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
              <div className="wo-print-only" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{summary || '—'}</div>
            </div>

            {notice && (
              <div className="wo-noprint" style={{ padding: '10px 12px', borderRadius: 9, fontSize: 12, fontFamily: MONO, lineHeight: 1.5,
                background: notice.tone === 'error' ? 'rgba(224,92,106,0.10)' : 'rgba(61,186,122,0.10)',
                border: `1px solid ${notice.tone === 'error' ? 'rgba(224,92,106,0.32)' : 'rgba(61,186,122,0.32)'}`,
                color: notice.tone === 'error' ? 'var(--red, #e05c6a)' : 'var(--green, #3dba7a)' }}>
                {notice.text}
              </div>
            )}

            <div className="wo-noprint" style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={() => window.print()}
                style={{ minHeight: 42, padding: '0 16px', borderRadius: 9, border: '1px solid var(--accent, #c8963e)', background: 'rgba(200,150,62,0.12)', color: 'var(--accent, #c8963e)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>
                Download PDF
              </button>
              <button type="button" onClick={sendToSlack} disabled={sending}
                style={{ minHeight: 42, padding: '0 16px', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12.5, fontWeight: 600, cursor: sending ? 'wait' : 'pointer', fontFamily: MONO }}>
                {sending ? 'Sending…' : 'Send to Slack'}
              </button>
              <button type="button" onClick={copySummary}
                style={{ minHeight: 42, padding: '0 16px', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12.5, cursor: 'pointer', fontFamily: MONO }}>
                Copy summary
              </button>
              {report?.slack_sent_at && (
                <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                  last posted {fmtDay(report.slack_sent_at)}
                </span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
