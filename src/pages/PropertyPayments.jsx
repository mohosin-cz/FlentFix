import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import PaymentSheet from '../components/property/PaymentSheet'
import { TRADES, KINDS, inr, fmtDayShort, fmtQty, billUrl, splitOf, itemSummary } from '../utils/payments'

// Everything spent on a property during setup, and what it adds up to.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
const monthKey = (iso) => (iso || '').slice(0, 7)
const monthLabel = (k) => (k ? new Date(`${k}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—')

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

// A bar per row, sorted by size. At this many categories a chart would carry
// less information than the numbers themselves.
function Breakdown({ title, rows, total, empty }) {
  if (!rows.length) return <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{empty}</div>
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map(r => (
          <div key={r.key}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', color: 'var(--text, #e8e8f0)' }}>{r.key}</span>
              <span style={{ fontFamily: MONO, color: 'var(--text, #e8e8f0)', flexShrink: 0 }}>{inr(r.total)}</span>
              <span style={{ fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', fontSize: 10.5, width: 34, textAlign: 'right', flexShrink: 0 }}>{pct(r.total, total)}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-input, #252731)', marginTop: 5, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct(r.total, total)}%`, background: 'var(--accent, #c8963e)', borderRadius: 2, opacity: 0.75 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// What the payment was made up of. One line is already summarised in the chip
// row above, so this only earns its space once an invoice has more than one
// thing on it — at which point it is the only place that detail exists.
function ItemLines({ items, amount }) {
  const list = (items || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (list.length < 2) return null
  const sum = list.reduce((n, it) => n + Number(it.amount || 0), 0)
  const drift = Math.round((Number(amount || 0) - sum) * 100) / 100
  return (
    <div style={{ marginTop: 9, borderTop: '1px solid var(--border, #2e3040)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
      {list.map(it => (
        <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 11.5 }}>
          <span style={{ flex: 1, minWidth: 0, color: 'var(--text-dim, #9394a8)', wordBreak: 'break-word' }}>
            {it.description || 'line'}
            {it.kind && <span style={{ color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}> · {it.kind === 'Material' ? 'mat' : 'lab'}</span>}
          </span>
          {it.quantity != null && (
            <span style={{ color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, flexShrink: 0 }}>
              {fmtQty(it.quantity)}{it.unit ? ` ${it.unit}` : ''}{it.unit_rate != null ? ` × ${inr(it.unit_rate)}` : ''}
            </span>
          )}
          <span style={{ fontFamily: MONO, color: 'var(--text, #e8e8f0)', flexShrink: 0 }}>{inr(it.amount)}</span>
        </div>
      ))}
      {/* A bill that does not match its lines is a fact about the bill — a
          discount, a round figure — so it is stated rather than reconciled
          away behind the scenes. */}
      {Math.abs(drift) >= 0.5 && (
        <div style={{ fontSize: 10.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, marginTop: 2 }}>
          lines come to {inr(sum)} · {inr(Math.abs(drift))} {drift < 0 ? 'less' : 'more'} was charged
        </div>
      )}
    </div>
  )
}

function BillLinks({ bills }) {
  const [urls, setUrls] = useState(null)
  if (!bills?.length) return null
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
      {urls
        ? urls.map((u, i) => (
          <a key={i} href={u.url || '#'} target="_blank" rel="noreferrer"
            style={{ fontSize: 10.5, color: u.url ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO, textDecoration: 'underline' }}>
            {u.name}
          </a>
        ))
        : (
          <button type="button"
            onClick={async () => setUrls(await Promise.all(bills.map(async b => ({ name: b.filename || 'bill', url: await billUrl(b.path) }))))}
            style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 10.5, cursor: 'pointer', fontFamily: MONO }}>
            {bills.length} bill{bills.length === 1 ? '' : 's'}
          </button>
        )}
    </div>
  )
}

export default function PropertyPayments() {
  const navigate = useNavigate()
  const { pid } = useParams()
  const phone = useIsMobile(720)

  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [payees, setPayees] = useState([])
  const [estimate, setEstimate] = useState(0)
  const [sheet, setSheet] = useState(null)      // { editing } | {}
  const [trade, setTrade] = useState('all')
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const [toast, setToast] = useState(null)
  const [confirming, setConfirming] = useState(null)
  // False only until the lines migration has run somewhere. It gates the
  // itemiser rather than the page, so nobody can type lines that cannot save.
  const [itemsReady, setItemsReady] = useState(true)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const BILLS = 'property_payment_bills(id, path, filename, mime)'
      const ITEMS = 'property_payment_items(id, position, description, quantity, unit, unit_rate, amount, kind)'
      const fetchPays = (select) => supabase.from('property_payments').select(select)
        .eq('pid', pid).order('paid_on', { ascending: false }).order('created_at', { ascending: false })

      let [{ data: pays, error: pErr }, { data: pay, error: yErr }] = await Promise.all([
        fetchPays(`*, ${BILLS}, ${ITEMS}`),
        supabase.from('payment_payees').select('*').order('name'),
      ])
      // If the lines table is not there yet, the join is the only thing that
      // failed — the payments themselves are fine. Falling back keeps the page
      // working on an environment the migration has not reached, instead of
      // showing "couldn't load payments" for a feature nobody asked for yet.
      if (pErr) {
        const retry = await fetchPays(`*, ${BILLS}`)
        if (retry.error) throw pErr
        pays = retry.data
        pErr = null
        setItemsReady(false)
      } else setItemsReady(true)
      if (yErr) throw yErr
      setRows(pays || [])
      setPayees(pay || [])

      // What the inspection expected this property to cost, for context on
      // what it actually did. No FK from properties to inspections.
      const { data: insps } = await supabase.from('inspections').select('id').eq('pid', pid)
      const ids = (insps || []).map(i => i.id)
      if (ids.length) {
        const { data: li } = await supabase.from('inspection_line_items')
          .select('material_cost, labour_cost').in('inspection_id', ids)
        setEstimate((li || []).reduce((n, r) => n + Number(r.material_cost || 0) + Number(r.labour_cost || 0), 0))
      } else setEstimate(0)

      setLoaded(true)
    } catch (e) {
      setError(e.message || String(e))
      if (!silent) setLoaded(false)
    }
    setLoading(false)
  }, [pid])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!toast) return
    // An undo on a deleted record gets a long window — you may well look away
    // before realising the mistake, and the confirm already cost a deliberate tap.
    const t = setTimeout(() => setToast(null), toast.tone === 'error' ? 8000 : toast.undo ? 20000 : 2600)
    return () => clearTimeout(t)
  }, [toast])

  const totals = useMemo(() => {
    const total = rows.reduce((n, r) => n + Number(r.amount || 0), 0)
    // Through splitOf, so the ratio uses the best thing each row knows about
    // itself — its tagged lines, then its typed split, then its kind. Reading
    // material_cost alone reported '—' for every imported row, which is most
    // of them. What still cannot be placed is counted and shown, not dropped.
    const sp = rows.map(splitOf)
    const material = sp.reduce((n, s) => n + s.material, 0)
    const labour = sp.reduce((n, s) => n + s.labour, 0)
    const unsplit = sp.reduce((n, s) => n + s.unsplit, 0)
    const items = rows.reduce((n, r) => n + (r.property_payment_items?.length || 0), 0)
    const itemised = rows.filter(r => r.property_payment_items?.length).length
    const byTrade = Object.values(rows.reduce((m, r) => {
      const k = r.trade || 'Untagged'
      ;(m[k] = m[k] || { key: k, total: 0, n: 0 }).total += Number(r.amount || 0)
      m[k].n++
      return m
    }, {})).sort((a, b) => b.total - a.total)
    const byPayee = Object.values(rows.reduce((m, r) => {
      const k = r.payee_name || 'No vendor recorded'
      ;(m[k] = m[k] || { key: k, total: 0, n: 0 }).total += Number(r.amount || 0)
      m[k].n++
      return m
    }, {})).sort((a, b) => b.total - a.total)
    const byMonth = Object.values(rows.reduce((m, r) => {
      const k = monthKey(r.paid_on)
      ;(m[k] = m[k] || { key: k, total: 0, n: 0 }).total += Number(r.amount || 0)
      m[k].n++
      return m
    }, {})).sort((a, b) => a.key.localeCompare(b.key))
    const withBill = rows.filter(r => r.property_payment_bills?.length).length
    return {
      total, material, labour, unsplit, items, itemised, byTrade, byPayee, byMonth,
      count: rows.length,
      avg: rows.length ? total / rows.length : 0,
      withBill,
      largest: [...rows].sort((a, b) => Number(b.amount) - Number(a.amount))[0] || null,
    }
  }, [rows])

  const recentTrades = useMemo(() => {
    const seen = []
    for (const r of rows) if (r.trade && !seen.includes(r.trade)) seen.push(r.trade)
    return seen
  }, [rows])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (trade !== 'all' && r.trade !== trade) return false
      if (kind !== 'all' && r.kind !== kind) return false
      if (!needle) return true
      // Line descriptions are searched too — once an invoice is itemised, the
      // thing you remember buying is often only written on one of its lines.
      return [r.description, r.payee_name, r.trade, r.note, r.reference, String(r.amount),
        ...(r.property_payment_items || []).map(it => it.description)]
        .some(v => (v || '').toLowerCase().includes(needle))
    })
  }, [rows, trade, kind, q])

  const shownTotal = shown.reduce((n, r) => n + Number(r.amount || 0), 0)

  // Confirmed, then still undoable. The invoice files are left in storage on
  // delete precisely so undo can put the rows back pointing at them; a purge
  // would make this a one-way door with a friendly confirmation on it.
  async function remove(row) {
    setConfirming(null)
    const { error } = await supabase.from('property_payments').delete().eq('id', row.id)
    if (error) { setToast({ text: `Couldn’t delete: ${error.message}`, tone: 'error' }); return }
    await load({ silent: true })
    setToast({
      text: `${inr(row.amount)} · ${row.description || 'payment'} deleted`,
      undo: async () => {
        // The delete cascades to both children, so undo has to put all three
        // back. Restoring the payment and silently losing its lines would be
        // worse than not offering undo at all.
        const { property_payment_bills: bills, property_payment_items: items, ...payment } = row
        const { error: pErr } = await supabase.from('property_payments').insert(payment)
        if (pErr) throw new Error(pErr.message)
        if (bills?.length) {
          const { error: bErr } = await supabase.from('property_payment_bills')
            .insert(bills.map(b => ({ ...b, payment_id: row.id })))
          if (bErr) throw new Error(bErr.message)
        }
        if (items?.length) {
          const { error: iErr } = await supabase.from('property_payment_items')
            .insert(items.map(it => ({ ...it, payment_id: row.id })))
          if (iErr) throw new Error(iErr.message)
        }
        await load({ silent: true })
      },
    })
  }

  const tradesInUse = useMemo(
    () => TRADES.filter(t => rows.some(r => r.trade === t))
      .concat([...new Set(rows.map(r => r.trade).filter(t => t && !TRADES.includes(t)))]),
    [rows],
  )

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS, display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(`/properties/${pid}`)} aria-label="Back to property"
          style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pulse-title" style={{ fontSize: 15.5 }}>Payments</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>PID {pid}</div>
        </div>
        <button onClick={() => navigate(`/properties/${pid}/payments/import`)}
          title="Bring in past payments from a spreadsheet"
          style={{ minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12, cursor: 'pointer', fontFamily: MONO, flexShrink: 0 }}>
          Import
        </button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 860, margin: '0 auto', padding: phone ? '14px 16px 110px' : '18px 20px 110px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loading && <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>}
        {!loading && error && <ErrStrip onRetry={() => load()}>Couldn’t load payments: {error}</ErrStrip>}

        {!loading && loaded && rows.length === 0 && (
          <div style={{ padding: '44px 20px', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Nothing logged yet</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', marginTop: 6, lineHeight: 1.6, fontFamily: MONO }}>
              Log what you spend as you spend it, or bring the past in from a spreadsheet.
            </div>
            <div style={{ display: 'flex', gap: 9, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
              <button onClick={() => setSheet({})}
                style={{ minHeight: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--accent, #c8963e)', color: 'var(--on-accent, #1a1408)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
                Log a payment
              </button>
              <button onClick={() => navigate(`/properties/${pid}/payments/import`)}
                style={{ minHeight: 42, padding: '0 16px', borderRadius: 10, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, cursor: 'pointer', fontFamily: MONO }}>
                Import a spreadsheet
              </button>
            </div>
          </div>
        )}

        {!loading && loaded && rows.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Kpi label="Total spent" value={inr(totals.total)} sub={`${totals.count} payment${totals.count === 1 ? '' : 's'}`} />
              <Kpi label="vs estimate" value={estimate ? `${totals.total > estimate ? '+' : ''}${inr(totals.total - estimate)}` : '—'}
                tone={estimate ? (totals.total > estimate ? 'var(--red, #e05c6a)' : 'var(--green, #3dba7a)') : undefined}
                sub={estimate ? `estimate ${inr(estimate)}` : 'no estimate on file'} />
              <Kpi label="Material / labour"
                value={totals.material || totals.labour ? `${pct(totals.material, totals.material + totals.labour)}/${pct(totals.labour, totals.material + totals.labour)}` : '—'}
                sub={totals.material || totals.labour
                  ? `${inr(totals.material)} · ${inr(totals.labour)}${totals.unsplit ? ` · ${inr(totals.unsplit)} unsplit` : ''}`
                  : 'no split recorded'} />
              <Kpi label="Average" value={inr(totals.avg)} sub={totals.largest ? `largest ${inr(totals.largest.amount)}` : null} />
              <Kpi label="Itemised" value={`${totals.itemised}/${totals.count}`}
                tone={totals.itemised < totals.count ? 'var(--accent, #c8963e)' : undefined}
                sub={totals.items ? `${totals.items} line${totals.items === 1 ? '' : 's'} recorded` : 'no quantities recorded yet'} />
              <Kpi label="With a bill" value={`${totals.withBill}/${totals.count}`}
                tone={totals.withBill < totals.count ? 'var(--accent, #c8963e)' : undefined}
                sub={totals.withBill < totals.count ? `${totals.count - totals.withBill} unreceipted` : 'all receipted'} />
            </div>

            <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: 14, display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 20 }}>
              <Breakdown title="By trade" rows={totals.byTrade} total={totals.total} empty="—" />
              <Breakdown title="By vendor" rows={totals.byPayee.slice(0, 8)} total={totals.total} empty="No vendors recorded" />
              {totals.byMonth.length > 1 && (
                <div style={{ gridColumn: phone ? 'auto' : '1 / -1' }}>
                  <Breakdown title="By month" rows={totals.byMonth.map(m => ({ ...m, key: monthLabel(m.key) }))} total={totals.total} empty="—" />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search description, vendor, amount…"
                style={{ flex: 1, minWidth: 160, padding: '9px 11px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, outline: 'none', fontFamily: 'inherit' }} />
              <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Filter by kind"
                style={{ padding: '9px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                <option value="all">Material &amp; labour</option>
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
              <select value={trade} onChange={e => setTrade(e.target.value)} aria-label="Filter by trade"
                style={{ padding: '9px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
                <option value="all">All trades</option>
                {tradesInUse.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {(q || trade !== 'all' || kind !== 'all') && (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                {shown.length} of {rows.length} · {inr(shownTotal)}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shown.map(r => (
                <div key={r.id} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 11, padding: '12px 14px' }}>
                  {/* What it was, then how much. The description is what a
                      person scans for; the number only means something once
                      they have found the line. */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, color: 'var(--text, #e8e8f0)', flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                      {r.description || <span style={{ color: 'var(--text-muted, #6b6d82)' }}>no description</span>}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, fontFamily: MONO, flexShrink: 0 }}>{inr(r.amount)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 7 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent, #c8963e)', border: '1px solid rgba(200,150,62,0.35)', background: 'rgba(200,150,62,0.08)', borderRadius: 6, padding: '2px 7px', fontFamily: MONO }}>{r.trade || 'untagged'}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-dim, #9394a8)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: '2px 7px', fontFamily: MONO }}>{r.kind}</span>
                    {r.payee_name && <span style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)' }}>{r.payee_name}</span>}
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{fmtDayShort(r.paid_on)}</span>
                    {r.kind === 'Both' && (
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                        {inr(r.material_cost || 0)} mat + {inr(r.labour_cost || 0)} lab
                      </span>
                    )}
                    {r.method && <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{r.method}</span>}
                    {itemSummary(r.property_payment_items) && (
                      <span style={{ fontSize: 10.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: '2px 7px' }}>
                        {itemSummary(r.property_payment_items)}
                      </span>
                    )}
                    {r.source === 'import' && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>imported</span>}
                  </div>
                  <ItemLines items={r.property_payment_items} amount={r.amount} />
                  {r.note && <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', marginTop: 6, lineHeight: 1.5, wordBreak: 'break-word' }}>{r.note}</div>}
                  {r.reference && <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 4 }}>ref {r.reference}</div>}
                  <BillLinks bills={r.property_payment_bills} />

                  {/* On their own line, at button size, with delete in red.
                      These were 10.5px muted text tucked into the metadata row
                      and read as labels rather than controls — which is the
                      same as not having built them. */}
                  {confirming === r.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--border, #2e3040)' }}>
                      <span style={{ flex: 1, minWidth: 160, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>
                        Delete this payment?
                      </span>
                      <button onClick={() => remove(r)}
                        style={{ minHeight: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--red, #e05c6a)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>
                        Delete
                      </button>
                      <button onClick={() => setConfirming(null)}
                        style={{ minHeight: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--border, #2e3040)' }}>
                      <button onClick={() => setSheet({ editing: r })}
                        style={{ minHeight: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO }}>
                        Edit
                      </button>
                      <button onClick={() => setConfirming(r.id)}
                        style={{ minHeight: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--red, #e05c6a)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO }}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {shown.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                  Nothing matches that.
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Always one tap away, because the point is logging as you go. */}
      {!loading && rows.length > 0 && (
        <button onClick={() => setSheet({})}
          style={{
            position: 'fixed', right: 20, bottom: 'calc(24px + env(safe-area-inset-bottom))', zIndex: 60,
            display: 'flex', alignItems: 'center', gap: 8, minHeight: 50, padding: '0 20px', borderRadius: 25,
            border: 'none', background: 'var(--accent, #c8963e)', color: 'var(--on-accent, #1a1408)',
            fontSize: 14, fontWeight: 700, fontFamily: SANS, cursor: 'pointer',
            boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
          }}>
          <span style={{ fontSize: 19, lineHeight: 1 }}>+</span> Log payment
        </button>
      )}

      {sheet && (
        <PaymentSheet
          pid={pid}
          payees={payees}
          itemsEnabled={itemsReady}
          editing={sheet.editing}
          recentTrades={recentTrades}
          onClose={() => setSheet(null)}
          onSaved={() => load({ silent: true })}
          onPayeeCreated={(p) => setPayees(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 500, maxWidth: 'calc(100vw - 32px)', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 15px', borderRadius: 10, fontSize: 12.5, fontFamily: SANS, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', background: toast.tone === 'error' ? 'rgba(224,92,106,0.14)' : 'var(--bg-panel, #1e2028)', border: `1px solid ${toast.tone === 'error' ? 'var(--red, #e05c6a)' : 'var(--border, #2e3040)'}`, color: toast.tone === 'error' ? 'var(--red, #e05c6a)' : 'var(--text, #e8e8f0)' }}>
          <span style={{ minWidth: 0 }}>{toast.text}</span>
          {toast.undo && (
            <button type="button"
              onClick={async () => {
                const fn = toast.undo
                setToast({ text: 'Restoring…' })
                try { await fn(); setToast({ text: 'Payment restored' }) }
                catch (e) { setToast({ text: `Couldn’t restore: ${e.message || e}`, tone: 'error' }) }
              }}
              style={{ flexShrink: 0, minHeight: 32, padding: '0 12px', borderRadius: 7, border: '1px solid var(--accent, #c8963e)', background: 'rgba(200,150,62,0.12)', color: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
