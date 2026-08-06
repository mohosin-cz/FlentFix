import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import PaymentSheet from '../components/property/PaymentSheet'
import { TRADES, KINDS, inr, fmtDayShort, billUrl } from '../utils/payments'

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

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const [{ data: pays, error: pErr }, { data: pay, error: yErr }] = await Promise.all([
        supabase.from('property_payments')
          .select('*, property_payment_bills(id, path, filename, mime)')
          .eq('pid', pid).order('paid_on', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('payment_payees').select('*').order('name'),
      ])
      if (pErr) throw pErr
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
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const totals = useMemo(() => {
    const total = rows.reduce((n, r) => n + Number(r.amount || 0), 0)
    const material = rows.reduce((n, r) => n + Number(r.material_cost || 0), 0)
    const labour = rows.reduce((n, r) => n + Number(r.labour_cost || 0), 0)
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
      total, material, labour, byTrade, byPayee, byMonth,
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
      return [r.description, r.payee_name, r.trade, r.note, r.reference, String(r.amount)]
        .some(v => (v || '').toLowerCase().includes(needle))
    })
  }, [rows, trade, kind, q])

  const shownTotal = shown.reduce((n, r) => n + Number(r.amount || 0), 0)

  async function remove(row) {
    const { error } = await supabase.from('property_payments').delete().eq('id', row.id)
    if (error) { setToast({ text: error.message, tone: 'error' }); return }
    await load({ silent: true })
    setToast({ text: `${inr(row.amount)} deleted` })
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
                style={{ minHeight: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
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
                sub={totals.material || totals.labour ? `${inr(totals.material)} · ${inr(totals.labour)}` : 'no split recorded'} />
              <Kpi label="Average" value={inr(totals.avg)} sub={totals.largest ? `largest ${inr(totals.largest.amount)}` : null} />
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
                    {r.source === 'import' && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>imported</span>}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      <button onClick={() => setSheet({ editing: r })}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 10.5, cursor: 'pointer', fontFamily: MONO }}>Edit</button>
                      <button onClick={() => remove(r)}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 10.5, cursor: 'pointer', fontFamily: MONO }}>Delete</button>
                    </span>
                  </div>
                  {r.note && <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', marginTop: 6, lineHeight: 1.5, wordBreak: 'break-word' }}>{r.note}</div>}
                  {r.reference && <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 4 }}>ref {r.reference}</div>}
                  <BillLinks bills={r.property_payment_bills} />
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
            border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408',
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
          editing={sheet.editing}
          recentTrades={recentTrades}
          onClose={() => setSheet(null)}
          onSaved={() => load({ silent: true })}
          onPayeeCreated={(p) => setPayees(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}

      {toast && (
        <div role="status" style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', zIndex: 500, maxWidth: 'calc(100vw - 32px)', padding: '10px 15px', borderRadius: 10, fontSize: 12.5, fontFamily: SANS, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', background: toast.tone === 'error' ? 'rgba(224,92,106,0.14)' : 'var(--bg-panel, #1e2028)', border: `1px solid ${toast.tone === 'error' ? 'var(--red, #e05c6a)' : 'var(--border, #2e3040)'}`, color: toast.tone === 'error' ? 'var(--red, #e05c6a)' : 'var(--text, #e8e8f0)' }}>
          {toast.text}
        </div>
      )}
    </div>
  )
}
