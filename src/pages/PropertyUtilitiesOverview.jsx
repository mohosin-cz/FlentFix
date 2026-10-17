import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator'
import { useIsMobile } from '../hooks/useIsMobile'
import LogoSpinner from '../components/LogoSpinner'
import UtilitiesAnalytics from '../components/UtilitiesAnalytics'
import UtilitiesExplore from '../components/utilities/UtilitiesExplore'
import UtilitiesRecords from '../components/utilities/UtilitiesRecords'
import UtilitiesQuality from '../components/utilities/UtilitiesQuality'
import UtilitiesCompare from '../components/utilities/UtilitiesCompare'
import UtilityRecordSheet from '../components/utilities/UtilityRecordSheet'
import { UTILITY_TYPES, typeLabel, typeColor, dueInfo, dueBucket, monthlyCost, installsInMonth, pidQuery, LIVE_STATUSES } from '../utils/propertyUtils'
import { DIMS, buildChecks, monthlyOf, annualOf, canonPlan, missingOf } from '../utils/utilitiesModel'
import UtilityIcon from '../components/UtilityIcon'
import HomeMark from '../components/HomeMark'

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'
const money = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const nowYM = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

const DUE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue', color: 'var(--red, #e05c6a)' },
  { key: 'due', label: 'Due ≤7d', color: 'var(--red, #e05c6a)' },
  { key: 'month', label: 'This month', color: 'var(--accent, #c8963e)' },
  { key: 'later', label: 'Later', color: 'var(--green, #3dba7a)' },
  { key: 'none', label: 'No date', color: 'var(--text-muted, #6b6d82)' },
]

// The list is the operational view — find a property, see what is due. The four
// after it are the record room: the same rows asked questions of, rather than
// walked down.
const TABS = [
  { k: 'list', l: 'Utilities' },
  { k: 'explore', l: 'Explore' },
  { k: 'records', l: 'Records' },
  { k: 'quality', l: 'Data quality' },
  { k: 'compare', l: 'Compare' },
]
const BOOK_TABS = new Set(['explore', 'records', 'quality', 'compare'])

function Kpi({ label, value, color, sub, span }) {
  return (
    <div style={{ minWidth: 0, gridColumn: span ? '1 / -1' : 'auto', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{label}{sub ? ` · ${sub}` : ''}</div>
    </div>
  )
}

export default function PropertyUtilitiesOverview() {
  const navigate = useNavigate()
  const narrow = useIsMobile(980)
  const phone = useIsMobile(640)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [book, setBook] = useState([])          // every row, whatever its status
  const [properties, setProperties] = useState([])
  const [tab, setTab] = useState('list')
  const [q, setQ] = useState('')
  const [typeF, setTypeF] = useState('all')
  const [dueF, setDueF] = useState('all')
  const [showAnalytics, setShowAnalytics] = useState(false)

  // record-room state, shared by Explore / Records / Quality / Compare
  const [filters, setFilters] = useState([])    // [{ dim, val }]
  const [pinned, setPinned] = useState(null)    // a check's result carried into Records
  const [incRetired, setIncRetired] = useState(false)
  const [openRow, setOpenRow] = useState(null)

  const fetchData = useCallback(async () => {
    setError(null)
    const [{ data: utils, error: uErr }, { data: props }] = await Promise.all([
      supabase.from('property_utilities').select('*'),
      supabase.from('properties').select('pid, name, address, deleted_at'),
    ])
    if (uErr) { setError(uErr.message); setLoading(false); return }
    const pmap = new Map((props || []).map(p => [String(p.pid), p]))
    const enriched = (utils || []).map(u => ({ ...u, prop: pmap.get(String(u.pid)) || null, due: dueInfo(u), bucket: dueBucket(u) }))
    setBook(enriched)
    setProperties((props || []).filter(p => !p.deleted_at))
    setLoading(false)
  }, [])

  const { pullDistance, isRefreshing } = usePullToRefresh(fetchData)
  useEffect(() => { fetchData() }, [fetchData])

  // The list tab is unchanged: live rows only, soonest due first.
  const rows = useMemo(() => book.filter(r => LIVE_STATUSES.has(r.status))
    .slice().sort((a, b) => (a.due ? a.due.days : Infinity) - (b.due ? b.due.days : Infinity)), [book])

  const lastMonth = useMemo(() => {
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { ...installsInMonth(rows, prev.getFullYear(), prev.getMonth()),
             label: prev.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) }
  }, [rows])

  const kpi = useMemo(() => {
    const ym = nowYM()
    return {
      monthly: rows.reduce((a, r) => a + monthlyCost(r), 0),
      active: rows.length,
      props: new Set(rows.map(r => r.pid)).size,
      thisMonth: rows.filter(r => r.start_date && r.start_date.slice(0, 7) === ym).length,
    }
  }, [rows])

  const presentTypes = useMemo(() => { const set = new Set(rows.map(r => r.utility_type)); return UTILITY_TYPES.filter(t => set.has(t.key)) }, [rows])

  // ── the book, scoped ──────────────────────────────────────────────────────
  // Superseded and cancelled records are off by default — they are history, and
  // counting them in a run-rate would double what the company actually pays.
  // They are one toggle away because history is the reason the chain exists.
  const inScope = useMemo(() => (incRetired ? book : book.filter(r => LIVE_STATUSES.has(r.status))), [book, incRetired])

  const scoped = useMemo(() => {
    let out = inScope
    if (pinned) { const ids = new Set(pinned.rows.map(r => r.id)); out = out.filter(r => ids.has(r.id)) }
    for (const f of filters) out = out.filter(r => DIMS[f.dim].of(r) === f.val)
    const needle = q.trim().toLowerCase()
    if (needle) {
      const pid = pidQuery(q)
      out = pid
        ? out.filter(r => String(r.pid) === pid || String(r.account_number ?? '').trim() === pid)
        : out.filter(r => [r.pid, r.prop && r.prop.name, r.prop && r.prop.address, r.provider, r.plan_type, r.account_number, r.ssid, r.notes, typeLabel(r)]
            .filter(Boolean).some(v => String(v).toLowerCase().includes(needle)))
    }
    return out
  }, [inScope, filters, pinned, q])

  // Checks always run over the whole scope, never the filtered view — a filter
  // that hides a contradiction must not make it look resolved.
  const checks = useMemo(() => buildChecks(inScope), [inScope])
  const contradicting = useMemo(() => new Set(checks.filter(c => c.fam === 'con').flatMap(c => c.rows.map(r => r.id))).size, [checks])

  const addFilter = useCallback((dim, val) => {
    setFilters(f => (f.some(x => x.dim === dim && x.val === val) ? f : [...f, { dim, val }]))
  }, [])
  const clearAll = () => { setFilters([]); setPinned(null); setQ('') }

  const exportCsv = useCallback((sorted) => {
    const header = ['pid', 'property', 'type', 'provider', 'plan_as_typed', 'plan_normalised', 'account_number', 'start_date',
      'billing_amount', 'billing_cycle', 'monthly', 'annualised', 'added_cost', 'status', 'invoice_link', 'payment_mode',
      'source', 'updated_at', 'missing_fields']
    const line = (r) => [r.pid, r.prop?.name, typeLabel(r), r.provider, r.plan_type, canonPlan(r.plan_type), r.account_number, r.start_date,
      r.billing_amount, r.billing_cycle, Math.round(monthlyOf(r)), Math.round(annualOf(r)), r.added_cost, r.status, r.invoice_link,
      r.payment_mode, r.source, r.updated_at, missingOf(r).map(m => m.label).join('; ')]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    const csv = header.join(',') + '\n' + sorted.map(line).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `utilities-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  // ── list tab ──────────────────────────────────────────────────────────────
  const pidQ = useMemo(() => pidQuery(q), [q])
  const pidHits = useMemo(() => (pidQ ? rows.filter(
    r => String(r.pid) === pidQ || String(r.account_number ?? '').trim() === pidQ,
  ) : []), [rows, pidQ])

  const isIdSearch = !!q.trim() && !!pidQ
  const exactPid = isIdSearch && pidHits.length > 0
  const foundPid = exactPid ? String(pidHits[0].pid) : pidQ

  const matchesText = useCallback((r) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    if (pidQ) return String(r.pid) === pidQ || String(r.account_number ?? '').trim() === pidQ
    const hay = [r.pid, r.prop && r.prop.name, r.prop && r.prop.address, r.provider, r.plan_type, r.account_number, typeLabel(r)].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(needle)
  }, [q, pidQ])

  const filtered = useMemo(() => rows.filter(r => {
    if (typeF !== 'all' && r.utility_type !== typeF) return false
    if (dueF !== 'all' && r.bucket !== dueF) return false
    return matchesText(r)
  }), [rows, typeF, dueF, matchesText])

  const hiddenByChips = exactPid && filtered.length === 0 ? pidHits.length : 0

  const chipCls = (on) => `tct tct-bare${on ? ' is-on' : ''}`
  const chipSty = { flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '10px 14px', fontSize: 12.5, lineHeight: 1, whiteSpace: 'nowrap' }

  const typeChips = presentTypes.length > 1 ? (
    <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 8, WebkitOverflowScrolling: 'touch' }}>
      <button onClick={() => setTypeF('all')} className={chipCls(typeF === 'all')} style={chipSty}>All types</button>
      {presentTypes.map(t => <button key={t.key} onClick={() => setTypeF(t.key)} className={chipCls(typeF === t.key)} style={chipSty}><UtilityIcon type={t.key} size={14} />{t.label}</button>)}
    </div>
  ) : null

  const searchBox = (placeholder) => (
    <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }}>
        <circle cx="7" cy="7" r="4.5" stroke="var(--text-muted, #6b6d82)" strokeWidth="1.6" />
        <path d="M10.5 10.5L14 14" stroke="var(--text-muted, #6b6d82)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', padding: '10px 13px 10px 34px', fontSize: 13.5, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, outline: 'none', fontFamily: SANS }} />
      {q && <button onClick={() => setQ('')} aria-label="Clear search" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 6, border: 'none', background: 'var(--bg-panel, #1e2028)', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 13 }}>×</button>}
    </div>
  )

  const listView = (
    <div style={{ flex: 1, minWidth: 0 }}>
      {narrow && rows.length > 0 && (
        <button onClick={() => setShowAnalytics(true)} style={{ width: '100%', marginBottom: 12, padding: '11px 0', background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 10, fontSize: 13.5, fontWeight: 700, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-nav)' }}>Analytics &amp; spend</button>
      )}
      <div style={{ display: 'flex', marginBottom: 12 }}>{searchBox('Search PID, property, provider, account…')}</div>
      {typeChips}
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 8, marginBottom: 12, WebkitOverflowScrolling: 'touch' }}>
        {DUE_FILTERS.map(f => <button key={f.key} onClick={() => setDueF(f.key)} className={chipCls(dueF === f.key)} style={chipSty}>{f.label}</button>)}
      </div>
      {/* Name the property when a PID resolves, so an exact hit is confirmed
          rather than assumed — "228" and "1228" are one keystroke apart. */}
      <div style={{ fontSize: 11, color: exactPid ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginBottom: 10 }}>
        {exactPid
          ? `PID ${foundPid}${pidHits[0].prop?.name && pidHits[0].prop.name !== `PID ${foundPid}` ? ` · ${pidHits[0].prop.name}` : ''} · ${filtered.length} of ${pidHits.length}`
          : `${filtered.length} of ${rows.length}${(q || typeF !== 'all' || dueF !== 'all') ? ' · filtered' : ''}`}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: '36px 20px', border: '1px dashed rgba(200,150,62,0.2)', borderRadius: 10, textAlign: 'center', color: 'var(--text-muted, #6b6d82)', fontFamily: SANS, lineHeight: 1.7 }}>
          {rows.length === 0 ? 'No active utilities yet — add them from a property.'
            : hiddenByChips ? (
              <>
                PID {foundPid} has {hiddenByChips} {hiddenByChips === 1 ? 'utility' : 'utilities'}, hidden by the filters above.
                <br />
                <button onClick={() => { setTypeF('all'); setDueF('all') }}
                  style={{ marginTop: 12, padding: '9px 16px', borderRadius: 9, border: '1px solid rgba(200,150,62,0.35)', background: 'rgba(200,150,62,0.1)', color: 'var(--accent, #c8963e)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
                  Clear the filters
                </button>
              </>
            )
            : isIdSearch ? `No property with PID ${pidQ} in the active utilities.`
            : 'Nothing matches these filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => {
            const color = typeColor(r)
            return (
              <button key={r.id} onClick={() => navigate(`/properties/${r.pid}/utilities`)} style={s.row}>
                <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: `${color}22`, border: `1px solid ${color}44`, color }}><UtilityIcon type={r.utility_type} size={18} /></div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeLabel(r)}{r.provider && !phone ? <span style={{ fontWeight: 400, color: 'var(--text-muted, #6b6d82)' }}> · {r.provider}</span> : null}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, overflow: 'hidden' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accent, #c8963e)', fontFamily: MONO, background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 5, padding: '1px 7px', flexShrink: 0 }}>PID {r.pid}</span>
                    {phone && r.provider && <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, flexShrink: 0 }}>{r.provider}</span>}
                    {r.prop && r.prop.name && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prop.name}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {r.due ? <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: r.due.color, fontFamily: SANS }}>
                      {r.due.days < 0 ? `${-r.due.days} days over` : r.due.days === 0 ? 'Due today' : r.due.days === 1 ? 'Tomorrow' : `${r.due.days} days`}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
                      {r.due.periodsLapsed > 1 ? `${r.due.periodsLapsed} periods` : r.due.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </div>
                  </> : <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>no date</div>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  // ── the record room's shared filter bar ───────────────────────────────────
  const retired = book.length - rows.length
  const filterBar = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {searchBox('PID, property, provider, plan, account number, SSID…')}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 11px', borderRadius: 10,
          background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', fontSize: 12, cursor: 'pointer',
          color: incRetired ? 'var(--text, #e8e8f0)' : 'var(--text-dim, #9394a8)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={incRetired} onChange={() => setIncRetired(v => !v)} style={{ margin: 0 }} />
          Include retired <span style={{ fontFamily: MONO, color: 'var(--text-muted, #6b6d82)' }}>{retired}</span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5 }}>
        {filters.length === 0 && !pinned && !q
          ? <span style={{ color: 'var(--text-muted, #6b6d82)' }}>No filter — {inScope.length} records in scope. Click anything to narrow it.</span>
          : <>
              {pinned && <Chip label="from a check" value={pinned.label} onX={() => setPinned(null)} />}
              {filters.map((f, i) => (
                <Chip key={f.dim + f.val} label={DIMS[f.dim].label} value={f.val} onX={() => setFilters(x => x.filter((_, j) => j !== i))} />
              ))}
              {q && <Chip label="search" value={q} onX={() => setQ('')} />}
              <button onClick={clearAll} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}>clear all</button>
              <span style={{ color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{scoped.length} of {inScope.length}</span>
            </>}
      </div>
    </div>
  )

  return (
    <>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <div style={s.page}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 24px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', minHeight: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 100, boxSizing: 'border-box' }}>
          <HomeMark />
          <span className="pulse-title" style={{ fontSize: 15.5 }}>Utilities</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>every property's services, recharges and dues</span>
        </div>

        <main style={s.main}>
          {loading ? <LogoSpinner /> : error ? (
            <div style={{ padding: 16, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 10, fontSize: 13, color: '#f87171', fontFamily: MONO }}>Couldn’t load: {error}</div>
          ) : (
            <>
              {tab === 'list' && (
                <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : 'repeat(auto-fit, minmax(108px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <Kpi label={`${lastMonth.label} installs · ${lastMonth.count}`} value={`${money(lastMonth.monthlyAdded)} /mo`} color="var(--accent, #c8963e)" />
                  <Kpi label="Per year" value={money(kpi.monthly * 12)} color="var(--text-dim, #9394a8)" />
                  <Kpi label="Active" value={kpi.active} color="var(--text, #e8e8f0)" />
                  <Kpi label="Properties" value={kpi.props} color="var(--text, #e8e8f0)" />
                  <Kpi label="New" sub="this mo" value={kpi.thisMonth} color="var(--green, #3dba7a)" span={phone} />
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
                {TABS.map(t => (
                  <button key={t.k} onClick={() => setTab(t.k)} aria-pressed={tab === t.k}
                    className={`tct tct-bare${tab === t.k ? ' is-on' : ''}`}
                    style={{ padding: '10px 16px', fontSize: 12.5, lineHeight: 1, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                    {t.l}
                    {t.k === 'quality' && contradicting > 0 && (
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--accent, #c8963e)' }}>{contradicting}</span>
                    )}
                  </button>
                ))}
              </div>

              {BOOK_TABS.has(tab) && filterBar}

              {tab === 'explore' ? (
                <UtilitiesExplore rows={scoped} allRows={inScope} propertyCount={properties.length} narrow={narrow}
                  onDrill={addFilter} onDrill2={(d1, v1, d2, v2) => { addFilter(d1, v1); addFilter(d2, v2) }} />
              ) : tab === 'records' ? (
                <UtilitiesRecords rows={scoped} narrow={narrow} phone={phone}
                  scopeNote={pinned ? pinned.label : (filters.length || q) ? 'filtered' : 'the whole book'}
                  onOpen={setOpenRow} onExport={exportCsv} />
              ) : tab === 'quality' ? (
                <UtilitiesQuality checks={checks} rows={inScope} properties={properties} narrow={narrow}
                  onOpen={setOpenRow} onSendToRecords={(c) => { setPinned({ label: c.label, rows: c.rows }); setTab('records') }} />
              ) : tab === 'compare' ? (
                <UtilitiesCompare rows={scoped} properties={properties} narrow={narrow} onDrill={addFilter} />
              ) : (
                <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
                  {listView}
                  {!narrow && rows.length > 0 && (
                    <aside style={{ width: 360, flexShrink: 0, position: 'sticky', top: 78, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto' }}>
                      <UtilitiesAnalytics rows={rows} onType={setTypeF} onDue={setDueF} />
                    </aside>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {openRow && (
        <UtilityRecordSheet key={openRow.id} row={openRow} allRows={book} phone={phone}
          onClose={() => setOpenRow(null)} onOpen={setOpenRow}
          onGoToProperty={(pid) => navigate(`/properties/${pid}/utilities`)} />
      )}

      {narrow && showAnalytics && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,9,13,0.6)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-end' }} onClick={e => { if (e.target === e.currentTarget) setShowAnalytics(false) }}>
          <div style={{ width: '100%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg, #16171f)', borderTop: '1px solid var(--border, #2e3040)', borderRadius: '18px 18px 0 0', padding: '16px 18px 40px', position: 'relative' }}>
            <button onClick={() => setShowAnalytics(false)} style={{ position: 'absolute', right: 18, top: 14, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', zIndex: 1 }}>×</button>
            <UtilitiesAnalytics rows={rows} onType={(k) => { setTypeF(k); setShowAnalytics(false) }} onDue={(d) => { setDueF(d); setShowAnalytics(false) }} />
          </div>
        </div>
      )}
    </>
  )
}

function Chip({ label, value, onX }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 25, padding: '0 4px 0 9px', borderRadius: 13,
      background: 'var(--bg-input, #252731)', boxShadow: 'inset 0 0 0 1px var(--border, #2e3040)', fontSize: 11.5, color: 'var(--text, #e8e8f0)', maxWidth: 280 }}>
      <i style={{ fontStyle: 'normal', color: 'var(--text-muted, #6b6d82)' }}>{label}</i>
      <b style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</b>
      <button onClick={onX} aria-label={`Remove ${label} filter`} style={{ width: 17, height: 17, borderRadius: '50%', border: 'none', background: 'none',
        color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
    </span>
  )
}

const s = {
  page: { minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: 'var(--text, #e8e8f0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  main: { flex: 1, padding: '18px 24px 48px', width: '100%', boxSizing: 'border-box' },
  row: { display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer' },
}
