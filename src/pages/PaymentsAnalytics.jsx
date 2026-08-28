import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import LogoSpinner from '../components/LogoSpinner'
import {
  SANS, MONO, GRID, SURFACE, S1, S2, S3, NEUTRAL,
  money, compact, mLabel, mShort, pctChange, share, downloadCsv,
} from '../utils/analytics'
import { Card, Stat, Legend, Columns, HBars, SplitBar, Flag } from '../components/analytics'

// Every rupee spent on every property, in one place. The per-property page
// answers "what did this flat cost"; this one answers the questions that only
// exist across the portfolio — where the money goes, who it goes to, and which
// of it can't be trusted yet.

const RANGE = { all: null, '12m': 12, '6m': 6, '3m': 3 }
const RANGE_LABEL = { all: 'All time', '12m': '12 months', '6m': '6 months', '3m': '3 months' }

// Catch-all payee names: real spend, but not a vendor you can call. Naming them
// keeps the vendor league table from being read as a supplier list.
const CATCH_ALL = ['local', 'amazon', 'online', 'market', 'shop', 'misc']

const UNTAGGED = 'Untagged'
const NO_VENDOR = 'No vendor recorded'
const KIND_ORDER = ['Material', 'Labour', 'Both', 'Unclassified']

const thisMonth = () => new Date().toISOString().slice(0, 7)

const monthKey = (iso) => (iso || '').slice(0, 7)
const monthFirst = (ym) => `${ym}-01`

function minusMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1 - n, d))
  return dt.toISOString().slice(0, 10)
}

// A contiguous month axis between two keys. A month nobody spent in is a gap in
// the data worth seeing, not a label to skip.
function monthSpan(from, to) {
  const out = []
  let [y, m] = from.split('-').map(Number)
  const [ey, em] = to.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

function median(nums) {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const inputSty = {
  padding: '9px 12px', fontSize: 13, color: 'var(--text, #e8e8f0)',
  background: 'var(--bg-input, #252731)', border: `1px solid ${GRID}`,
  borderRadius: 9, outline: 'none', fontFamily: 'inherit',
}
const chipSty = { padding: '8px 13px', fontSize: 12, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }

function SortChips({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          className={`tct tct-bare${value === k ? ' is-on' : ''}`} style={chipSty}>{l}</button>
      ))}
    </div>
  )
}

function TableShell({ children, empty }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 10, overflow: 'hidden', border: `1px solid ${GRID}` }}>
      {children}
      {empty && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, background: 'var(--bg-input, #252731)' }}>
          {empty}
        </div>
      )}
    </div>
  )
}

export default function PaymentsAnalytics() {
  const navigate = useNavigate()
  const phone = useIsMobile(640)
  const narrow = useIsMobile(980)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])
  const [props, setProps] = useState([])
  const [billed, setBilled] = useState(new Set())
  const [gone, setGone] = useState(new Set())      // archived or binned

  const [range, setRange] = useState('all')
  const [kind, setKind] = useState('all')
  const [trade, setTrade] = useState('all')
  const [payee, setPayee] = useState('all')
  const [q, setQ] = useState('')
  const [propSort, setPropSort] = useState('total')
  const [payeeSort, setPayeeSort] = useState('total')
  const [propLimit, setPropLimit] = useState(25)
  const [payeeLimit, setPayeeLimit] = useState(15)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      // PostgREST caps a response at 1000 rows, and there are already twice
      // that — page through rather than silently analysing the first thousand.
      const all = []
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await supabase
          .from('property_payments')
          .select('id,pid,paid_on,payee_name,payee_id,amount,method,kind,trade,description,reference,note,source')
          .order('id', { ascending: true })
          .range(from, from + 999)
        if (e) throw e
        all.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      const [pr, bl, ar, bn] = await Promise.all([
        supabase.from('properties').select('pid, name, type'),
        supabase.from('property_payment_bills').select('payment_id'),
        supabase.from('properties_archive').select('pid'),
        supabase.from('properties_bin').select('pid'),
      ])
      if (pr.error) throw pr.error
      setRows(all)
      setProps(pr.data || [])
      setBilled(new Set((bl.data || []).map(b => b.payment_id)))
      // A property that has left the list isn't missing its payments, it's just
      // no longer live — so it must not show up as an omission.
      setGone(new Set([...(ar.data || []), ...(bn.data || [])].map(r => r.pid)))
    } catch (e) {
      setError(e.message || String(e))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const propName = useMemo(() => {
    const m = new Map()
    for (const p of props) {
      // "PID 86" as a name says nothing the pid hasn't already said.
      const n = (p.name || '').trim()
      m.set(p.pid, { name: n && n.toLowerCase().replace(/\s+/g, '') !== `pid${p.pid}`.toLowerCase() && n !== p.pid ? n : '', type: p.type })
    }
    return m
  }, [props])

  const latestDate = useMemo(
    () => rows.reduce((mx, r) => (r.paid_on && r.paid_on > mx ? r.paid_on : mx), ''),
    [rows],
  )

  const tradesInUse = useMemo(
    () => [...new Set(rows.map(r => r.trade || UNTAGGED))].sort((a, b) => a.localeCompare(b)),
    [rows],
  )
  const kindsInUse = useMemo(
    () => [...new Set(rows.map(r => r.kind).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  )

  // One filter set drives every number on the page — the charts, the tables and
  // the flags all describe the same slice, so nothing on screen disagrees.
  const view = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const months = RANGE[range]
    const cut = months && latestDate ? minusMonths(latestDate, months) : null
    return rows.filter(r => {
      if (cut && (!r.paid_on || r.paid_on < cut)) return false
      if (kind !== 'all' && r.kind !== kind) return false
      if (trade !== 'all' && (r.trade || UNTAGGED) !== trade) return false
      if (payee !== 'all' && (r.payee_name || NO_VENDOR) !== payee) return false
      if (needle && ![r.description, r.payee_name, r.trade, r.pid, r.reference, r.note, r.method]
        .some(v => (v || '').toLowerCase().includes(needle))) return false
      return true
    })
  }, [rows, range, kind, trade, payee, q, latestDate])

  const a = useMemo(() => {
    const num = v => Number(v || 0)
    const byMonth = new Map(), byTrade = new Map(), byPayee = new Map()
    const byPid = new Map(), byKind = new Map(), byMethod = new Map()
    let total = 0, undatedTotal = 0, undatedCount = 0

    for (const r of view) {
      const amt = num(r.amount)
      total += amt
      const k = r.kind || 'Unclassified'
      byKind.set(k, (byKind.get(k) || 0) + amt)
      byMethod.set(r.method || 'Not recorded', (byMethod.get(r.method || 'Not recorded') || 0) + amt)

      if (r.paid_on) {
        const ym = monthKey(r.paid_on)
        const g = byMonth.get(ym) || { ym, total: 0, n: 0, pids: new Set(), kinds: {} }
        g.total += amt; g.n++; g.pids.add(r.pid); g.kinds[k] = (g.kinds[k] || 0) + amt
        byMonth.set(ym, g)
      } else { undatedTotal += amt; undatedCount++ }

      const t = r.trade || UNTAGGED
      const gt = byTrade.get(t) || { label: t, value: 0, n: 0, pids: new Set(), kinds: {} }
      gt.value += amt; gt.n++; gt.pids.add(r.pid)
      gt.kinds[k] = (gt.kinds[k] || 0) + amt
      byTrade.set(t, gt)

      const p = r.payee_name || NO_VENDOR
      const gp = byPayee.get(p) || { label: p, value: 0, n: 0, pids: new Set(), undated: 0, linked: false }
      gp.value += amt; gp.n++; gp.pids.add(r.pid)
      if (!r.paid_on) gp.undated++
      if (r.payee_id) gp.linked = true
      byPayee.set(p, gp)

      const gd = byPid.get(r.pid) || { pid: r.pid, value: 0, n: 0, pids: null, undated: 0, first: null, last: null, kinds: {}, payees: new Set() }
      gd.value += amt; gd.n++
      gd.kinds[k] = (gd.kinds[k] || 0) + amt
      if (r.payee_name) gd.payees.add(r.payee_name)
      if (r.paid_on) {
        if (!gd.first || r.paid_on < gd.first) gd.first = r.paid_on
        if (!gd.last || r.paid_on > gd.last) gd.last = r.paid_on
      } else gd.undated++
      byPid.set(r.pid, gd)
    }

    const keys = [...byMonth.keys()].sort()
    const months = keys.length
      ? monthSpan(keys[0], keys[keys.length - 1]).map((ym, i) => {
        const g = byMonth.get(ym)
        return {
          ym, label: mLabel(monthFirst(ym)),
          // A bare month name repeats every year. Januarys and the first bar
          // carry the year so an 18-month axis can't be misread.
          axis: i === 0 || ym.endsWith('-01') ? mLabel(monthFirst(ym)) : mShort(monthFirst(ym)),
          total: g?.total || 0, n: g?.n || 0, pids: g ? g.pids.size : 0,
          kinds: g?.kinds || {},
          note: g ? `${g.n} payment${g.n === 1 ? '' : 's'} · ${g.pids.size} propert${g.pids.size === 1 ? 'y' : 'ies'}` : 'nothing logged',
        }
      })
      : []

    const latest = months[months.length - 1] || null
    const prev = months[months.length - 2] || null
    const amounts = view.map(r => num(r.amount))
    const payees = [...byPayee.values()]
    const topTen = [...payees].sort((x, y) => y.value - x.value).slice(0, 10)

    return {
      total, count: view.length,
      dated: { total: total - undatedTotal, count: view.length - undatedCount },
      undated: { total: undatedTotal, count: undatedCount },
      months, latest, prev,
      properties: [...byPid.values()],
      payees,
      byTrade: [...byTrade.values()].sort((x, y) => y.value - x.value),
      byKind: [...byKind.entries()].sort((x, y) => y[1] - x[1]),
      byMethod: [...byMethod.entries()].sort((x, y) => y[1] - x[1]),
      methodsRecorded: [...byMethod.keys()].filter(m => m !== 'Not recorded'),
      median: median(amounts),
      largest: view.reduce((mx, r) => (num(r.amount) > num(mx?.amount) ? r : mx), null),
      topTenShare: share(topTen.reduce((s, p) => s + p.value, 0), total),
      // Fixed order, so a filter that drops a kind never repaints the others.
      kindsPresent: [...byKind.keys()].sort((x, y) => KIND_ORDER.indexOf(x) - KIND_ORDER.indexOf(y)),
    }
  }, [view])

  // Every one of these is money someone would have to go and ask about.
  const quality = useMemo(() => {
    const dupes = new Map()
    for (const r of view) {
      const k = `${r.pid}|${r.amount}|${r.payee_name || ''}|${r.description || ''}|${r.paid_on || ''}`
      dupes.set(k, (dupes.get(k) || 0) + 1)
    }
    const dupRows = [...dupes.values()].filter(c => c > 1)
    const livePids = new Set(props.filter(p => !gone.has(p.pid)).map(p => p.pid))
    const paidPids = new Set(view.map(r => r.pid))
    const catchAll = a.payees.filter(p => CATCH_ALL.includes(p.label.trim().toLowerCase()))
    return {
      unbilled: view.filter(r => !billed.has(r.id)).length,
      unlinked: view.filter(r => !r.payee_id).length,
      noMethod: view.filter(r => !r.method).length,
      zero: view.filter(r => !Number(r.amount)).length,
      dupGroups: dupRows.length,
      dupExtra: dupRows.reduce((s, c) => s + c - 1, 0),
      unallocated: a.properties.find(p => p.pid === 'UNALLOCATED') || null,
      silent: [...livePids].filter(p => !paidPids.has(p)),
      catchAll,
      catchAllValue: catchAll.reduce((s, p) => s + p.value, 0),
    }
  }, [view, billed, props, gone, a])

  const propertyRows = useMemo(() => {
    const by = {
      total: (x, y) => y.value - x.value,
      count: (x, y) => y.n - x.n,
      recent: (x, y) => (y.last || '').localeCompare(x.last || ''),
      pid: (x, y) => String(x.pid).localeCompare(String(y.pid), undefined, { numeric: true }),
    }
    return [...a.properties].sort(by[propSort] || by.total)
  }, [a, propSort])

  const payeeRows = useMemo(() => {
    const by = {
      total: (x, y) => y.value - x.value,
      count: (x, y) => y.n - x.n,
      properties: (x, y) => y.pids.size - x.pids.size,
      name: (x, y) => x.label.localeCompare(y.label),
    }
    return [...a.payees].sort(by[payeeSort] || by.total)
  }, [a, payeeSort])

  const filtered = range !== 'all' || kind !== 'all' || trade !== 'all' || payee !== 'all' || q.trim()
  function clearFilters() { setRange('all'); setKind('all'); setTrade('all'); setPayee('all'); setQ('') }

  function exportProperties() {
    downloadCsv(
      `property-payments-${range}.csv`,
      ['pid', 'name', 'payments', 'vendors', 'first_paid', 'last_paid', 'undated_payments', 'total'],
      propertyRows.map(p => [
        p.pid, propName.get(p.pid)?.name || '', p.n, p.payees.size,
        p.first || '', p.last || '', p.undated, Math.round(p.value),
      ]),
    )
  }
  function exportPayees() {
    downloadCsv(
      `payment-vendors-${range}.csv`,
      ['vendor', 'payments', 'properties', 'undated_payments', 'linked_to_vendor_record', 'total'],
      payeeRows.map(p => [p.label, p.n, p.pids.size, p.undated, p.linked ? 'yes' : 'no', Math.round(p.value)]),
    )
  }

  const kindColor = (k) => (k === 'Material' ? S1 : k === 'Labour' ? S2 : k === 'Both' ? S3 : NEUTRAL)
  const kindSeries = a.kindsPresent.map(k => ({ key: k, label: k, color: kindColor(k) }))

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: 'var(--text, #e8e8f0)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56, paddingTop: 'env(safe-area-inset-top)', background: SURFACE, borderBottom: `1px solid ${GRID}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate('/properties')} aria-label="Back to properties"
          style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: `1px solid ${GRID}`, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pulse-title" style={{ fontSize: 15.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Payments</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>
            {loading ? '…' : `${a.count.toLocaleString('en-IN')} across ${a.properties.length} properties`}
          </div>
        </div>
        <button onClick={exportProperties} className="tct tct-raised" style={{ ...chipSty, borderRadius: 8 }} disabled={loading}>⤓ CSV</button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: phone ? '14px 16px 96px' : '20px 20px 72px', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
        {loading ? <LogoSpinner /> : error ? (
          <div style={{ padding: 14, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 10, fontSize: 12.5, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>
            Couldn’t load payments: {error}
            <button onClick={load} style={{ marginLeft: 10, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: `1px solid ${GRID}`, borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: MONO }}>Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No payments logged yet</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', marginTop: 6, lineHeight: 1.6, fontFamily: MONO }}>
              Log spend on a property, or import a spreadsheet, and this page builds itself.
            </div>
          </div>
        ) : (
          <>
            {/* ── filters: one row above everything they affect ─────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Search vendor, work, PID, reference…"
                  style={{ ...inputSty, flex: 1, minWidth: 180 }} />
                <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Filter by kind"
                  style={{ ...inputSty, cursor: 'pointer' }}>
                  <option value="all">Material &amp; labour</option>
                  {kindsInUse.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select value={trade} onChange={e => setTrade(e.target.value)} aria-label="Filter by trade"
                  style={{ ...inputSty, cursor: 'pointer' }}>
                  <option value="all">All trades</option>
                  {tradesInUse.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <SortChips value={range} onChange={setRange} options={Object.keys(RANGE).map(k => [k, RANGE_LABEL[k]])} />
                {payee !== 'all' && (
                  <button type="button" onClick={() => setPayee('all')} className="tct tct-bare is-on" style={chipSty}>
                    {payee} ✕
                  </button>
                )}
                {filtered && (
                  <button type="button" onClick={clearFilters} style={{ ...chipSty, background: 'none', border: 'none', color: 'var(--accent, #c8963e)', fontFamily: MONO, cursor: 'pointer' }}>
                    Clear all
                  </button>
                )}
              </div>
              {filtered && (
                <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 }}>
                  {a.count.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')} payments · {money(a.total)}
                  {range !== 'all' && ' · undated payments are outside any date range, so they are excluded here'}
                </div>
              )}
            </div>

            {a.count === 0 ? (
              <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Nothing matches that</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4, fontFamily: MONO }}>Widen the range, or clear the filters.</div>
              </div>
            ) : (
              <>
                {/* ── headline ─────────────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : 'repeat(auto-fit, minmax(158px, 1fr))', gap: 10 }}>
                  <Stat label="Total spent" value={compact(a.total)} tone="var(--accent, #c8963e)"
                    sub={`${a.count.toLocaleString('en-IN')} payments`} />
                  <Stat label="Properties" value={a.properties.length}
                    sub={`avg ${compact(a.total / Math.max(1, a.properties.length))} each`} />
                  <Stat label="Vendors paid" value={a.payees.length}
                    sub={`top 10 take ${a.topTenShare}%`} />
                  <Stat label="Typical payment" value={money(a.median)}
                    sub={a.largest ? `largest ${compact(a.largest.amount)}` : null} />
                  {a.latest && (
                    <Stat label={`${a.latest.label} spend`} value={compact(a.latest.total)}
                      delta={a.prev ? pctChange(a.latest.total, a.prev.total) : null}
                      sub={a.latest.ym === thisMonth()
                        ? `${a.latest.pids} properties · month still running`
                        : `${a.latest.pids} properties`} />
                  )}
                  <Stat label="Has a date"
                    value={`${share(a.dated.total, a.total)}%`}
                    tone={a.undated.count ? 'var(--accent, #c8963e)' : undefined}
                    sub={a.undated.count ? `${compact(a.undated.total)} undated` : 'all dated'} />
                </div>

                {/* ── over time ────────────────────────────────────────────── */}
                <Card title="Spend over time" sub={`${a.months.length} month${a.months.length === 1 ? '' : 's'}, by what the money bought`}>
                  {kindSeries.length > 1 && <Legend items={kindSeries.map(s => ({ label: s.label, color: s.color }))} />}
                  <Columns
                    rows={a.months.map(m => ({ label: m.label, axis: m.axis, note: m.note, ...m.kinds }))}
                    series={kindSeries.length ? kindSeries : [{ key: 'total', label: 'Spend', color: S1 }]}
                    height={phone ? 150 : 200} minBar={phone ? 44 : 0} />
                  {a.undated.count > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 12, borderTop: `1px solid ${GRID}` }}>
                      <SplitBar parts={[
                        { label: 'On the chart above', value: a.dated.total, color: S1 },
                        { label: 'No date recorded', value: a.undated.total, color: NEUTRAL },
                      ]} />
                      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.55 }}>
                        {a.undated.count.toLocaleString('en-IN')} payment{a.undated.count === 1 ? '' : 's'} came in without a payment date,
                        so {share(a.undated.total, a.total)}% of this spend can’t sit on a month. The chart is the {compact(a.dated.total)} that can —
                        read it as a trend, not as the total.
                      </div>
                    </div>
                  )}
                </Card>

                {/* ── composition ──────────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <Card title="Material vs labour" sub="what the money bought">
                    <SplitBar parts={a.byKind.map(([k, v]) => ({ label: k, value: v, color: kindColor(k) }))} height={14} />
                    {/* The portfolio split hides the interesting part: a trade
                        that is nearly all labour is a different kind of cost
                        from one that is nearly all stock. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 12, borderTop: `1px solid ${GRID}` }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                        Split within each trade
                      </div>
                      {a.byTrade.slice(0, 6).map(t => {
                        const mat = t.kinds.Material || 0
                        const lab = t.kinds.Labour || 0
                        const known = mat + lab
                        return (
                          <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 92, flexShrink: 0, fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 2, height: 7, borderRadius: 4, overflow: 'hidden', background: 'var(--bg-input, #252731)' }}>
                              {mat > 0 && <div style={{ width: `${(mat / (known || 1)) * 100}%`, background: S1 }} title={`Material ${money(mat)}`} />}
                              {lab > 0 && <div style={{ width: `${(lab / (known || 1)) * 100}%`, background: S2 }} title={`Labour ${money(lab)}`} />}
                            </div>
                            <span style={{ width: 62, flexShrink: 0, textAlign: 'right', fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                              {known ? `${share(mat, known)}% mat` : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.55 }}>
                      Taken from each payment’s kind. The separate material/labour columns are empty on almost every
                      row, so a per-invoice split isn’t available — this is the honest one.
                    </div>
                  </Card>

                  <Card title="Where the money went" sub={`${a.byTrade.length} trades · tap to filter`}>
                    <HBars
                      rows={a.byTrade.slice(0, 8).map(t => ({
                        label: t.label, value: t.value,
                        sub: `${t.n} · ${t.pids.size} propert${t.pids.size === 1 ? 'y' : 'ies'}`,
                        color: t.label === UNTAGGED ? NEUTRAL : S1,
                      }))}
                      fmt={compact}
                      onPick={r => setTrade(t => (t === r.label ? 'all' : r.label))} />
                    {a.byTrade.length > 8 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                        +{a.byTrade.length - 8} smaller trades, {compact(a.byTrade.slice(8).reduce((s, t) => s + t.value, 0))} between them.
                      </div>
                    )}
                  </Card>
                </div>

                {/* ── properties ───────────────────────────────────────────── */}
                <Card title="By property" sub={`${propertyRows.length} with spend`}
                  right={<SortChips value={propSort} onChange={setPropSort}
                    options={[['total', 'Spend'], ['count', 'Payments'], ['recent', 'Recent'], ['pid', 'PID']]} />}>
                  <TableShell empty={propertyRows.length === 0 ? 'No properties match.' : null}>
                    {propertyRows.slice(0, propLimit).map(p => {
                      const meta = propName.get(p.pid)
                      const mat = p.kinds.Material || 0
                      const lab = p.kinds.Labour || 0
                      return (
                        <button key={p.pid} type="button" onClick={() => navigate(`/properties/${p.pid}/payments`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', background: 'var(--bg-input, #252731)', border: 'none', borderLeft: '2px solid transparent', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', width: '100%' }}
                          onMouseEnter={e => { e.currentTarget.style.borderLeftColor = 'var(--accent, #c8963e)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderLeftColor = 'transparent' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.pid === 'UNALLOCATED' ? 'Unallocated' : `PID ${p.pid}`}
                              {meta?.name && <span style={{ color: 'var(--text-dim, #9394a8)' }}> · {meta.name}</span>}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
                              {p.n} payment{p.n === 1 ? '' : 's'} · {p.payees.size} vendor{p.payees.size === 1 ? '' : 's'}
                              {p.undated ? ` · ${p.undated} undated` : ''}
                              {!phone && p.first ? ` · ${mLabel(p.first)}–${mLabel(p.last)}` : ''}
                            </div>
                          </div>
                          {!phone && (mat > 0 || lab > 0) && (
                            <div style={{ width: 84, flexShrink: 0 }}>
                              <div style={{ display: 'flex', gap: 2, height: 5, borderRadius: 3, overflow: 'hidden', background: 'var(--bg, #16171f)' }}>
                                {mat > 0 && <div style={{ width: `${(mat / (mat + lab)) * 100}%`, background: S1 }} />}
                                {lab > 0 && <div style={{ width: `${(lab / (mat + lab)) * 100}%`, background: S2 }} />}
                              </div>
                              <div style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3 }}>
                                {share(mat, mat + lab)}% mat
                              </div>
                            </div>
                          )}
                          <div style={{ textAlign: 'right', flexShrink: 0, width: phone ? 84 : 96 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO }}>{compact(p.value)}</div>
                            <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{share(p.value, a.total)}% of all</div>
                          </div>
                        </button>
                      )
                    })}
                  </TableShell>
                  {propertyRows.length > propLimit && (
                    <button type="button" onClick={() => setPropLimit(n => n + 50)} className="tct tct-bare" style={{ ...chipSty, alignSelf: 'flex-start' }}>
                      Show {Math.min(50, propertyRows.length - propLimit)} more of {propertyRows.length}
                    </button>
                  )}
                </Card>

                {/* ── vendors ──────────────────────────────────────────────── */}
                <Card title="By vendor" sub={`${payeeRows.length} paid · tap to filter`}
                  right={
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <SortChips value={payeeSort} onChange={setPayeeSort}
                        options={[['total', 'Paid'], ['count', 'Payments'], ['properties', 'Spread'], ['name', 'A–Z']]} />
                      <button onClick={exportPayees} className="tct tct-bare" style={chipSty}>⤓</button>
                    </div>
                  }>
                  <TableShell empty={payeeRows.length === 0 ? 'No vendors match.' : null}>
                    {payeeRows.slice(0, payeeLimit).map(p => {
                      const isCatchAll = CATCH_ALL.includes(p.label.trim().toLowerCase())
                      const on = payee === p.label
                      return (
                        <button key={p.label} type="button" onClick={() => setPayee(on ? 'all' : p.label)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', background: on ? 'rgba(200,150,62,0.10)' : 'var(--bg-input, #252731)', border: 'none', borderLeft: `2px solid ${on ? 'var(--accent, #c8963e)' : 'transparent'}`, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', width: '100%' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.label}
                              {isCatchAll && <span style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginLeft: 7 }}>CATCH-ALL</span>}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
                              {p.n} payment{p.n === 1 ? '' : 's'} · {p.pids.size} propert{p.pids.size === 1 ? 'y' : 'ies'}
                              {p.undated ? ` · ${p.undated} undated` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, width: phone ? 84 : 96 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO }}>{compact(p.value)}</div>
                            <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{share(p.value, a.total)}% of all</div>
                          </div>
                        </button>
                      )
                    })}
                  </TableShell>
                  {payeeRows.length > payeeLimit && (
                    <button type="button" onClick={() => setPayeeLimit(n => n + 40)} className="tct tct-bare" style={{ ...chipSty, alignSelf: 'flex-start' }}>
                      Show {Math.min(40, payeeRows.length - payeeLimit)} more of {payeeRows.length}
                    </button>
                  )}
                </Card>

                {/* ── how it was paid ──────────────────────────────────────── */}
                {a.methodsRecorded.length > 0 && (
                  <Card title="How it was paid" sub={`${a.methodsRecorded.length} method${a.methodsRecorded.length === 1 ? '' : 's'} recorded`}>
                    <HBars rows={a.byMethod.map(([m, v]) => ({
                      label: m, value: v, color: m === 'Not recorded' ? NEUTRAL : S3,
                    }))} fmt={compact} />
                  </Card>
                )}

                {/* ── worth checking ───────────────────────────────────────── */}
                <Card title="Worth checking" sub={`${a.count.toLocaleString('en-IN')} payments in view`}>
                  <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 10 }}>
                    {a.undated.count > 0 && (
                      <Flag n={a.undated.count} label="No payment date"
                        detail={`${money(a.undated.total)} — ${share(a.undated.total, a.total)}% of spend — can't be placed in a month, so no trend includes it.`} />
                    )}
                    {quality.dupGroups > 0 && (
                      <Flag tone="red" n={quality.dupExtra} label="Look like duplicates"
                        detail={`${quality.dupGroups} group${quality.dupGroups === 1 ? '' : 's'} of payments identical in property, amount, vendor, date and description. Either a real repeat or the same bill entered twice.`} />
                    )}
                    {quality.unbilled > 0 && (
                      <Flag n={quality.unbilled} label="No bill attached"
                        detail={`Only ${(a.count - quality.unbilled).toLocaleString('en-IN')} of ${a.count.toLocaleString('en-IN')} payments have an invoice or receipt on file to back them up.`} />
                    )}
                    {quality.catchAll.length > 0 && (
                      <Flag n={quality.catchAll.length} label="Catch-all payee names"
                        detail={`${quality.catchAll.map(c => c.label).join(', ')} — ${money(quality.catchAllValue)}, ${share(quality.catchAllValue, a.total)}% of spend, not attributable to a vendor you can call.`} />
                    )}
                    {quality.unlinked > 0 && (
                      <Flag n={quality.unlinked} label="Vendor typed, not linked"
                        detail="Free text rather than a payee record, so one vendor spelled two ways counts as two." />
                    )}
                    {quality.noMethod > 0 && (
                      <Flag n={quality.noMethod} label="No payment method"
                        detail="Cash or transfer is unrecorded, so these can't be reconciled against a bank statement." />
                    )}
                    {quality.zero > 0 && (
                      <Flag tone="red" n={quality.zero} label="Zero amount"
                        detail="A payment logged at ₹0 — usually an incomplete entry." />
                    )}
                    {quality.unallocated && (
                      <Flag n={quality.unallocated.n} label="Not allocated to a property"
                        detail={`${money(quality.unallocated.value)} parked on the UNALLOCATED pid, so no property carries this cost.`} />
                    )}
                    {quality.silent.length > 0 && !filtered && (
                      <Flag tone="green" n={quality.silent.length} label="Live properties with no spend"
                        detail="On the properties list but nothing logged against them — either genuinely untouched or logged somewhere else."/>
                    )}
                  </div>
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
