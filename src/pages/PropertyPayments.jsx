import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import PaymentSheet from '../components/property/PaymentSheet'
import { LineageToggle } from '../components/LineageStrip'
import { useHashScroll } from '../hooks/useHashScroll'
import { TRADES, KINDS, inr, fmtDayShort, fmtQty, billUrl, uploadBill, splitOf, itemSummary } from '../utils/payments'
import DocViewer from '../components/vendor/DocViewer'
import HomeMark from '../components/HomeMark'

// Everything spent on a property during setup, and what it adds up to.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0)
const monthKey = (iso) => (iso || '').slice(0, 7)
const monthLabel = (k) => (k ? new Date(`${k}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—')

function ErrStrip({ children, onRetry }) {
  return (
    <div style={{ padding: '11px 13px', background: 'rgba(176,100,91,0.10)', border: '1px solid rgba(176,100,91,0.32)', borderRadius: 9, fontFamily: MONO }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--red, #b0645b)' }}>⚠ {children}</div>
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

// ── the ledger ────────────────────────────────────────────────────────────────
const LEDGER_COLS = { display: 'grid', gridTemplateColumns: '78px minmax(0, 2.4fr) minmax(0, 1.1fr) minmax(0, 1.2fr) minmax(0, 1.1fr) 76px 104px', columnGap: 12, alignItems: 'center' }
const dim = { color: 'var(--text-muted, #6b6d82)' }
const ell = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }

// The Bill column, as a control. With a bill: one click opens it (a short
// list first when there are several). Without one: one click picks a photo or
// PDF and attaches it to this payment.
function BillCell({ r, compact, onChanged }) {
  const bills = r.property_payment_bills || []
  const [view, setView] = useState(null)       // { url, name }
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const stop = (e) => e.stopPropagation()

  async function open(b) {
    setMenu(false); setErr('')
    const url = await billUrl(b.path)
    if (!url) { setErr('Couldn’t open it'); return }
    setView({ url, name: b.filename || b.path })
  }
  async function attach(e) {
    const files = [...(e.target.files || [])]; e.target.value = ''
    if (!files.length) return
    setBusy(true); setErr('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      for (const f of files) {
        const meta = await uploadBill(f, r.pid)
        const { error } = await supabase.from('property_payment_bills').insert({ payment_id: r.id, ...meta, uploaded_by: user?.email || null })
        if (error) throw error
      }
      onChanged && onChanged()
    } catch (x) { setErr(x.message || 'Upload failed') }
    setBusy(false)
  }

  const look = { minHeight: compact ? 28 : 30, padding: '0 8px', borderRadius: 7, fontFamily: MONO, fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }
  return (
    <span onClick={stop} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', flexShrink: 0 }}>
      {bills.length > 0 ? (
        <button type="button" title={bills.length === 1 ? `Open ${bills[0].filename || 'the bill'}` : `${bills.length} bills`}
          onClick={() => bills.length === 1 ? open(bills[0]) : setMenu(m => !m)}
          style={{ ...look, border: '1px solid rgba(200,150,62,0.35)', background: 'rgba(200,150,62,0.08)', color: 'var(--accent, #c8963e)' }}>
          📎 {bills.length > 1 ? bills.length : 'View'}
        </button>
      ) : (
        <label title="Attach a photo or PDF of the bill"
          style={{ ...look, border: '1px dashed var(--border-dash, #3a3d52)', color: 'var(--text-muted, #6b6d82)', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Uploading…' : '+ Bill'}
          <input type="file" accept="image/*,application/pdf" multiple disabled={busy} onChange={attach} style={{ display: 'none' }} />
        </label>
      )}
      {menu && (
        <span style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20, minWidth: 180, maxWidth: 260, display: 'flex', flexDirection: 'column', padding: 4, borderRadius: 9, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', boxShadow: '0 12px 30px rgba(0,0,0,0.45)' }}>
          {bills.map((b, i) => (
            <button key={b.id || i} type="button" onClick={() => open(b)}
              style={{ minHeight: 34, padding: '0 9px', border: 'none', background: 'none', textAlign: 'left', color: 'var(--text, #e8e8f0)', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📎 {b.filename || `bill ${i + 1}`}
            </button>
          ))}
        </span>
      )}
      {err && <span style={{ fontSize: 10.5, color: 'var(--red, #b0645b)', fontFamily: MONO, maxWidth: 140 }}>{err}</span>}
      {view && <DocViewer url={view.url} name={view.name} onClose={() => setView(null)} />}
    </span>
  )
}

function LedgerRow({ r, phone, open, onToggle, confirming, onEdit, onAskDelete, onCancelDelete, onDelete, onChanged }) {
  const items = itemSummary(r.property_payment_items)
  const what = r.description || <span style={dim}>no description</span>
  const kind = r.kind === 'Both' ? `mat ${inr(r.material_cost || 0)} + lab ${inr(r.labour_cost || 0)}` : (r.kind || '').toLowerCase()
  const methodRef = [r.method, r.reference && `ref ${r.reference}`].filter(Boolean).join(' · ')
  const tag = (t) => <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--accent, #c8963e)' }}>{t}</span>
  const btn = (danger) => ({ minHeight: 34, padding: '0 14px', borderRadius: 8, border: danger === 'solid' ? 'none' : '1px solid var(--border, #2e3040)', background: danger === 'solid' ? 'var(--red, #b0645b)' : 'var(--bg-input, #252731)', color: danger === 'solid' ? '#fff' : danger ? 'var(--red, #b0645b)' : 'var(--text-dim, #9394a8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO })

  return (
    <div id={`pay-${r.id}`} style={{ borderTop: '1px solid var(--border, #2e3040)', scrollMarginTop: 96, background: open ? 'var(--bg-input, #252731)' : 'transparent' }}>
      {/* A div acting as the button, so the bill control can sit inside it */}
      <div role="button" tabIndex={0} onClick={onToggle} aria-expanded={open}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onToggle() } }}
        style={{ ...(phone ? { display: 'flex', flexDirection: 'column', gap: 4 } : LEDGER_COLS), width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: phone ? '11px 14px' : '10px 14px', color: 'var(--text, #e8e8f0)', cursor: 'pointer', fontSize: 13 }}>
        {phone ? (
          <>
            <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', width: '100%' }}>
              <span style={{ ...ell, flex: 1 }}>{what}</span>
              <BillCell r={r} compact onChanged={onChanged} />
              <b style={{ fontFamily: MONO, fontSize: 14, flexShrink: 0 }}>{inr(r.amount)}</b>
            </span>
            <span style={{ ...ell, width: '100%', fontSize: 11, fontFamily: MONO, ...dim }}>
              {fmtDayShort(r.paid_on)} · {tag(r.trade || 'untagged')} · {kind}{r.payee_name ? ` · ${r.payee_name}` : ''}{methodRef ? ` · ${methodRef}` : ''}{items ? ` · ${items}` : ''}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontFamily: MONO, fontSize: 11.5, ...dim }}>{fmtDayShort(r.paid_on)}</span>
            <span style={ell} title={typeof r.description === 'string' ? r.description : ''}>
              {what}{items && <span style={{ fontFamily: MONO, fontSize: 11, ...dim }}> · {items}</span>}
              {r.source === 'import' && <span style={{ fontFamily: MONO, fontSize: 10, ...dim }}> · imported</span>}
            </span>
            <span style={{ ...ell, fontFamily: MONO, fontSize: 11 }}>{tag(r.trade || 'untagged')} <span style={dim}>· {kind}</span></span>
            <span style={{ ...ell, fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>{r.payee_name || <span style={dim}>—</span>}</span>
            <span style={{ ...ell, fontFamily: MONO, fontSize: 11, ...dim }}>{methodRef || '—'}</span>
            <BillCell r={r} onChanged={onChanged} />
            <b style={{ fontFamily: MONO, fontSize: 13.5, textAlign: 'right' }}>{inr(r.amount)}</b>
          </>
        )}
      </div>

      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {phone && r.description && <div style={{ fontSize: 13, wordBreak: 'break-word' }}>{r.description}</div>}
          <ItemLines items={r.property_payment_items} amount={r.amount} />
          {r.note && <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5, wordBreak: 'break-word' }}>{r.note}</div>}
          <BillLinks bills={r.property_payment_bills} />
          <LineageToggle kind="payment" id={r.id} style={{ marginTop: 4 }} />
          {confirming ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 6 }}>
              <span style={{ flex: 1, minWidth: 160, fontSize: 12, color: 'var(--red, #b0645b)', fontFamily: MONO }}>Delete this payment?</span>
              <button type="button" onClick={onDelete} style={btn('solid')}>Delete</button>
              <button type="button" onClick={onCancelDelete} style={btn(false)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="button" onClick={onEdit} style={btn(false)}>Edit</button>
              <button type="button" onClick={onAskDelete} style={btn(true)}>Delete</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PropertyPayments() {
  const navigate = useNavigate()
  const { pid } = useParams()
  const phone = useIsMobile(720)

  const [loading, setLoading] = useState(true)
  useHashScroll(!loading, { prefix: 'pay-' })
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
  const [openRow, setOpenRow] = useState(null)
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
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 52, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, paddingTop: 'env(safe-area-inset-top, 0px)', boxSizing: 'content-box', zIndex: 10 }}>
        <HomeMark />
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

      <main style={{ flex: 1, width: '100%', padding: phone ? '14px 16px 110px' : '18px 20px 110px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                tone={estimate ? (totals.total > estimate ? 'var(--red, #b0645b)' : 'var(--green, #6f9a7e)') : undefined}
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

            {/* A ledger: one line per payment, every detail on that line, newest
                first. Tap a line for its item lines, note, bills and actions. */}
            <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
              {!phone && (
                <div style={{ ...LEDGER_COLS, padding: '9px 14px', borderBottom: '1px solid var(--border, #2e3040)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                  <span>Date</span><span>What</span><span>Trade · type</span><span>Paid to</span><span>Method · ref</span><span>Bill</span><span style={{ textAlign: 'right' }}>Amount</span>
                </div>
              )}
              {shown.map(r => (
                <LedgerRow key={r.id} r={r} phone={phone} open={openRow === r.id}
                  onToggle={() => { setOpenRow(o => o === r.id ? null : r.id); setConfirming(null) }}
                  confirming={confirming === r.id}
                  onEdit={() => setSheet({ editing: r })}
                  onAskDelete={() => setConfirming(r.id)} onCancelDelete={() => setConfirming(null)}
                  onDelete={() => remove(r)} onChanged={() => load({ silent: true })} />
              ))}
              {shown.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                  Nothing matches that.
                </div>
              )}
              {shown.length > 0 && (
                <div style={{ ...(phone ? { display: 'flex', justifyContent: 'space-between' } : LEDGER_COLS), padding: '10px 14px', borderTop: '1px solid var(--border, #2e3040)', fontFamily: MONO, fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>
                  {phone ? <><span>{shown.length} payment{shown.length === 1 ? '' : 's'}</span><b style={{ color: 'var(--text, #e8e8f0)' }}>{inr(shownTotal)}</b></>
                    : <><span /><span>{shown.length} payment{shown.length === 1 ? '' : 's'}</span><span /><span /><span /><span /><b style={{ textAlign: 'right', color: 'var(--text, #e8e8f0)' }}>{inr(shownTotal)}</b></>}
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
        <div role="status" aria-live="polite" style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 500, maxWidth: 'calc(100vw - 32px)', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 15px', borderRadius: 10, fontSize: 12.5, fontFamily: SANS, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', background: toast.tone === 'error' ? 'rgba(176,100,91,0.14)' : 'var(--bg-panel, #1e2028)', border: `1px solid ${toast.tone === 'error' ? 'var(--red, #b0645b)' : 'var(--border, #2e3040)'}`, color: toast.tone === 'error' ? 'var(--red, #b0645b)' : 'var(--text, #e8e8f0)' }}>
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
