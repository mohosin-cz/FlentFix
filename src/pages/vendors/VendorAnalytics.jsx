import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import LogoSpinner from '../../components/LogoSpinner'
import {
  SANS, MONO, GRID, SURFACE, S1, S2, S3,
  money, compact, mLabel, mShort, pctChange as pct, share, downloadCsv,
} from '../../utils/analytics'
import { Card, Stat, Legend, Columns, HBars, SplitBar, Flag } from '../../components/analytics'

// One analytics page for vendor management, rather than one per area.
//
// Payroll had its own dashboard and nothing else did, so the questions that
// span areas had nowhere to be asked — and the biggest one spans two: payroll
// pays by `days_worked`, typed by hand with a carry-forward default, while
// attendance records punches. Nothing had ever compared them.
//
// What is deliberately NOT here matters as much as what is. Every panel below
// is built on a column that is actually populated:
//   * no "invoice viewed" stage — viewed_at is set on none of them, so a
//     funnel would report that no vendor ever opens their invoice
//   * no break analysis — twenty-seven rows in total is not a trend
//   * no pod dimension — all but one active vendor has none
//   * no "absent" anywhere: there is no roster, shift or holiday table, so a
//     day with no punch is "not marked", which is not the same thing
//   * attendance figures start at 1 Sept 2026, when punching actually rolled
//     out. August is a two-vendor pilot against a full month of payroll, and
//     charting it reads as mass absence.

const ROLLOUT = '2026-09-01'         // first day attendance was really in use
const TABS = [
  { k: 'overview',   l: 'Overview' },
  { k: 'payroll',    l: 'Payroll' },
  { k: 'attendance', l: 'Attendance' },
  { k: 'delivery',   l: 'Delivery' },
  { k: 'workforce',  l: 'Workforce' },
]

const dayKey = (d) => {
  const t = new Date(d)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}
const monthKey = (d) => dayKey(d).slice(0, 7)
const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const days = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000
const isActive = (v) => v.status === 'approved' && !v.exited_at && !v.archived_at
const fmtDays = (n) => (n == null ? '—' : n < 1 ? `${Math.round(n * 24)}h` : `${n.toFixed(1)}d`)
const fmtInt = (n) => String(Math.round(n))

export default function VendorAnalytics() {
  const navigate = useNavigate()
  const phone = useIsMobile(640)
  const narrow = useIsMobile(980)

  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [raw, setRaw] = useState(null)
  const [ym, setYm] = useState(null)          // month under the reconciliation
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('gap')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await Promise.all([
        supabase.from('vendors').select('id,full_name,vendor_code,trade,team,cost_centre,status,monthly_rate,date_of_joining,exited_at,archived_at'),
        supabase.from('vendor_payouts').select('*, period:vendor_payroll_periods(period_month,status,days_in_month)'),
        supabase.from('vendor_payroll_periods').select('id,period_month,status,days_in_month'),
        supabase.from('vendor_attendance').select('id,vendor_id,punch_type,punched_at,kind,pid,source'),
        supabase.from('work_orders').select('id,pid,trade,vendor_id,vendor_name,status,scheduled_end,issued_at,vendor_completed_at,verified_at'),
        supabase.from('vendor_invoices').select('id,vendor_id,invoice_no,status,net_payable,subtotal,invoice_date,sent_at,signed_at,reopened_at'),
        supabase.from('vendor_assets').select('id,name,category,status,value,vendor_id,assigned_at,returned_at'),
        supabase.from('vendor_asset_requests').select('id,vendor_id,item_name,status,created_at'),
        supabase.from('vendor_edit_requests').select('id,vendor_id,status,requested_at'),
        supabase.rpc('vendor_portal_login_health'),
      ])
      if (!alive) return
      // The first two carry everything the page is about; a failure there is
      // worth saying out loud rather than rendering an empty dashboard that
      // looks like a business with no vendors and no payroll.
      const fatal = res[0].error || res[1].error
      if (fatal) { setError(fatal.message); setLoading(false); return }
      setRaw({
        // stamped here, not read during render: "still open today" has to be
        // judged against the same moment the punches were fetched, and reading
        // the clock while rendering makes one render disagree with the next
        loadedAt: Date.now(),
        vendors: res[0].data || [], payouts: (res[1].data || []).filter(r => r.period),
        periods: res[2].data || [], punches: res[3].data || [], wos: res[4].data || [],
        invoices: res[5].data || [], assets: res[6].data || [], assetReqs: res[7].data || [],
        editReqs: res[8].data || [], health: res[9].data || [],
        // a panel whose own table would not read says so, instead of showing zero
        missing: ['punches', 'work orders', 'invoices', 'assets', 'asset requests', 'edit requests', 'portal access']
          .filter((_, i) => res[i + 3].error),
      })
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const a = useMemo(() => {
    if (!raw) return null
    const { vendors, payouts, punches, wos, invoices, assets, assetReqs, editReqs, health } = raw

    const vById = new Map(vendors.map(v => [v.id, v]))
    const active = vendors.filter(isActive)
    const runRate = active.reduce((s, v) => s + Number(v.monthly_rate || 0), 0)

    // ── payroll by month ────────────────────────────────────────────────────
    const byMonth = new Map()
    for (const r of payouts) {
      const k = r.period.period_month
      const g = byMonth.get(k) || { ym: k, label: mLabel(k), axis: mShort(k), status: r.period.status,
        total: 0, fixed: 0, ot: 0, allowance: 0, advRec: 0, otDays: 0, people: new Set(), paidDays: 0 }
      const d = r.days_worked == null ? 30 : Number(r.days_worked)
      g.total += Number(r.total_payout || 0)
      g.fixed += Number(r.fixed_pay || 0) * d / 30
      g.ot += Number(r.ot_amount || 0)
      g.allowance += Number(r.allowance || 0)
      g.advRec += Number(r.advance_recovered || 0)
      g.otDays += Number(r.ot_days || 0)
      g.paidDays += d
      g.people.add(r.vendor_id || r.beneficiary_name)
      byMonth.set(k, g)
    }
    const months = [...byMonth.values()].sort((x, y) => x.ym.localeCompare(y.ym))
      .map(m => ({ ...m, headcount: m.people.size, note: `${m.people.size} paid · ${m.status}` }))
    const latest = months[months.length - 1] || null
    const prevM = months[months.length - 2] || null

    // ── attendance, from rollout only ───────────────────────────────────────
    const live = punches.filter(p => dayKey(p.punched_at) >= ROLLOUT)
    const punchDays = new Map()          // vendor -> Set(day)
    const otDaysSet = new Map()
    const byDay = new Map()              // day -> Set(vendor)
    const arrivals = []                  // hour of each vendor's first IN
    const firstInOfDay = new Map()       // vendor|day -> ms
    for (const p of live) {
      const d = dayKey(p.punched_at)
      if (!punchDays.has(p.vendor_id)) punchDays.set(p.vendor_id, new Set())
      punchDays.get(p.vendor_id).add(d)
      if (!byDay.has(d)) byDay.set(d, new Set())
      byDay.get(d).add(p.vendor_id)
      if ((p.kind || 'regular') === 'overtime') {
        if (!otDaysSet.has(p.vendor_id)) otDaysSet.set(p.vendor_id, new Set())
        otDaysSet.get(p.vendor_id).add(d)
      }
      if (p.punch_type === 'in') {
        const k = `${p.vendor_id}|${d}`
        const ms = new Date(p.punched_at).getTime()
        if (!firstInOfDay.has(k) || ms < firstInOfDay.get(k)) firstInOfDay.set(k, ms)
      }
    }
    for (const ms of firstInOfDay.values()) arrivals.push(new Date(ms).getHours())
    const arrivalRows = (() => {
      const m = new Map()
      for (const h of arrivals) m.set(h, (m.get(h) || 0) + 1)
      return [...m.entries()].sort((x, y) => x[0] - y[0])
        .map(([h, n]) => ({ label: `${String(h).padStart(2, '0')}:00`, axis: String(h), count: n }))
    })()

    // Unclosed: an IN with no punch after it. Today's open shifts are normal,
    // so they are counted separately from the ones left hanging on a past day.
    const byVendorPunch = new Map()
    for (const p of punches) {
      if (!byVendorPunch.has(p.vendor_id)) byVendorPunch.set(p.vendor_id, [])
      byVendorPunch.get(p.vendor_id).push(p)
    }
    const today = dayKey(raw.loadedAt)
    let unclosedPast = 0, openToday = 0
    for (const list of byVendorPunch.values()) {
      const sorted = [...list].sort((x, y) => new Date(x.punched_at) - new Date(y.punched_at))
      const last = sorted[sorted.length - 1]
      if (last && last.punch_type === 'in') {
        if (dayKey(last.punched_at) === today) openToday++
        else unclosedPast++
      }
    }

    const dayRows = [...byDay.entries()].sort((x, y) => x[0].localeCompare(y[0]))
      .map(([d, set]) => ({ label: new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        axis: String(new Date(d).getDate()), vendors: set.size, note: `${set.size} punched` }))
    const last7 = dayRows.slice(-7)
    const coverageNow = last7.length
      ? Math.max(...last7.map(r => r.vendors))
      : 0

    // ── the reconciliation: days paid vs days punched ───────────────────────
    const recoYm = ym || latest?.ym || null
    const reco = (() => {
      if (!recoYm) return { rows: [], gapDays: 0, gapMoney: 0, month: null }
      const mLines = payouts.filter(r => r.period.period_month === recoYm)
      const rows = mLines.map(r => {
        const v = vById.get(r.vendor_id)
        const set = punchDays.get(r.vendor_id)
        const punched = set ? [...set].filter(d => d.slice(0, 7) === recoYm.slice(0, 7)).length : 0
        const paid = r.days_worked == null ? 30 : Number(r.days_worked)
        const perDay = paid > 0 ? Number(r.total_payout || 0) / paid : 0
        return {
          id: r.id, name: r.beneficiary_name || v?.full_name || '—',
          code: v?.vendor_code || '', trade: v?.trade || '',
          paid, punched, gap: paid - punched, payout: Number(r.total_payout || 0),
          gapMoney: Math.max(0, paid - punched) * perDay,
          otPaid: Number(r.ot_days || 0),
          otPunched: (otDaysSet.get(r.vendor_id) ? [...otDaysSet.get(r.vendor_id)].filter(d => d.slice(0, 7) === recoYm.slice(0, 7)).length : 0),
        }
      })
      return {
        month: recoYm, rows,
        gapDays: rows.reduce((s, r) => s + Math.max(0, r.gap), 0),
        gapMoney: rows.reduce((s, r) => s + r.gapMoney, 0),
        anyPunched: rows.some(r => r.punched > 0),
      }
    })()

    // ── delivery: work orders ───────────────────────────────────────────────
    const woStatus = (() => {
      const m = new Map()
      for (const w of wos) m.set(w.status || 'unknown', (m.get(w.status || 'unknown') || 0) + 1)
      return [...m.entries()].map(([label, value]) => ({ label, value })).sort((x, y) => y.value - x.value)
    })()
    const woIssueToDone = wos.filter(w => w.issued_at && w.vendor_completed_at).map(w => days(w.issued_at, w.vendor_completed_at))
    const woDoneToVerify = wos.filter(w => w.vendor_completed_at && w.verified_at).map(w => days(w.vendor_completed_at, w.verified_at))
    const woSchedulable = wos.filter(w => w.scheduled_end && w.vendor_completed_at)
    const woOnTime = woSchedulable.filter(w => dayKey(w.vendor_completed_at) <= w.scheduled_end).length
    const woAwaitingVerify = wos.filter(w => w.vendor_completed_at && !w.verified_at).length
    const woVerifiedNoCompletion = wos.filter(w => w.verified_at && !w.vendor_completed_at).length
    const woByTrade = (() => {
      const m = new Map()
      for (const w of wos) {
        const k = (w.trade || '').trim() || 'Unassigned'
        const g = m.get(k) || { label: k, value: 0, done: 0 }
        g.value++; if (w.verified_at) g.done++
        m.set(k, g)
      }
      return [...m.values()].map(g => ({ ...g, sub: `${g.done} verified` })).sort((x, y) => y.value - x.value)
    })()

    // ── delivery: invoices ──────────────────────────────────────────────────
    const invSigned = invoices.filter(i => i.signed_at)
    const invOutstanding = invoices.filter(i => !i.signed_at)
    const timeToSign = invSigned.filter(i => i.sent_at).map(i => days(i.sent_at, i.signed_at))
    const invValue = (list) => list.reduce((s, i) => s + Number(i.net_payable || i.subtotal || 0), 0)

    // ── workforce flow ──────────────────────────────────────────────────────
    const flow = (() => {
      const m = new Map()
      const touch = (k) => { if (!m.has(k)) m.set(k, { ym: k, label: mLabel(k + '-01'), axis: mShort(k + '-01'), joined: 0, left: 0 }); return m.get(k) }
      for (const v of raw.vendors) {
        if (v.date_of_joining) touch(String(v.date_of_joining).slice(0, 7)).joined++
        if (v.exited_at) touch(monthKey(v.exited_at)).left++
      }
      return [...m.values()].sort((x, y) => x.ym.localeCompare(y.ym))
        .map(r => ({ ...r, note: `${r.joined} joined · ${r.left} left` }))
    })()
    const byTrade = (() => {
      const m = new Map()
      for (const v of active) {
        const k = (v.trade || '').trim() || 'Unassigned'
        const g = m.get(k) || { label: k, value: 0, cost: 0 }
        g.value++; g.cost += Number(v.monthly_rate || 0)
        m.set(k, g)
      }
      return [...m.values()].map(g => ({ ...g, sub: money(g.cost) })).sort((x, y) => y.value - x.value)
    })()
    const exits = raw.vendors.filter(v => v.exited_at).length

    // ── attention: everything that wants a person, not a chart ─────────────
    const lockedOut = (health || [])
      .filter(h => { const v = vById.get(h.vendor_id); return v && isActive(v) && (h.live_sessions || 0) === 0 })
      .map(h => ({ ...h, vendor: vById.get(h.vendor_id) }))
      .sort((x, y) => String(y.last_login_at || '').localeCompare(String(x.last_login_at || '')))
    const assetsWithLeavers = assets.filter(x => {
      const v = x.vendor_id ? vById.get(x.vendor_id) : null
      return x.status === 'assigned' && v && !isActive(v)
    })
    const draftPeriods = raw.periods.filter(p => p.status === 'draft')
    const openAssetReqs = assetReqs.filter(r => !['deployed', 'denied', 'received'].includes(r.status))
    const openEditReqs = editReqs.filter(r => ['requested', 'granted', 'submitted'].includes(r.status))

    return {
      active, runRate, months, latest, prevM, reco, recoYm,
      attendance: {
        dayRows, coverageNow, arrivalRows, unclosedPast, openToday,
        punchingVendors: punchDays.size,
        otVendorDays: [...otDaysSet.values()].reduce((s, set) => s + set.size, 0),
        firstDay: dayRows[0]?.label, lastDay: dayRows[dayRows.length - 1]?.label,
      },
      delivery: {
        woStatus, woTotal: wos.length, woOnTime, woSchedulable: woSchedulable.length,
        woAwaitingVerify, woVerifiedNoCompletion, woByTrade,
        medIssueToDone: median(woIssueToDone), medDoneToVerify: median(woDoneToVerify),
        invTotal: invoices.length, invSigned: invSigned.length,
        invOutstanding: invOutstanding.length, invOutstandingValue: invValue(invOutstanding),
        medTimeToSign: median(timeToSign), invReopened: invoices.filter(i => i.reopened_at).length,
      },
      workforce: { flow, byTrade, exits, total: raw.vendors.length },
      assets: {
        count: assets.length, value: assets.reduce((s, x) => s + Number(x.value || 0), 0),
        withLeavers: assetsWithLeavers,
      },
      attention: { lockedOut, assetsWithLeavers, draftPeriods, openAssetReqs, openEditReqs },
    }
  }, [raw, ym])

  const recoRows = useMemo(() => {
    if (!a) return []
    const needle = q.trim().toLowerCase()
    const rows = a.reco.rows.filter(r => !needle || [r.name, r.code, r.trade].some(f => (f || '').toLowerCase().includes(needle)))
    const by = {
      gap: (x, y) => y.gap - x.gap,
      money: (x, y) => y.gapMoney - x.gapMoney,
      paid: (x, y) => y.paid - x.paid,
      punched: (x, y) => y.punched - x.punched,
      name: (x, y) => x.name.localeCompare(y.name),
    }
    return [...rows].sort(by[sort] || by.gap)
  }, [a, q, sort])

  function exportReco() {
    if (!a || !a.reco.month) return
    downloadCsv(`vendor-reconciliation-${a.reco.month}.csv`,
      ['name', 'code', 'trade', 'days_paid', 'days_punched', 'gap_days', 'ot_days_paid', 'ot_days_punched', 'payout', 'gap_value'],
      recoRows.map(r => [r.name, r.code, r.trade, r.paid, r.punched, r.gap, r.otPaid, r.otPunched, Math.round(r.payout), Math.round(r.gapMoney)]))
  }

  const chipSty = { padding: '8px 13px', fontSize: 12, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }
  const inputSty = { background: 'var(--bg-input, #252731)', border: `1px solid ${GRID}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: 'var(--text, #e8e8f0)', fontFamily: MONO, outline: 'none', minWidth: 0 }
  const grid = (min) => ({ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10 })

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: 'var(--text, #e8e8f0)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56, paddingTop: 'env(safe-area-inset-top)', background: SURFACE, borderBottom: `1px solid ${GRID}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate('/vendors')} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: `1px solid ${GRID}`, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="pulse-title" style={{ flex: 1, minWidth: 0, fontSize: 15.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {phone ? 'Vendors' : 'Vendor analytics'}
        </div>
        {tab === 'payroll' && a && a.reco.month && (
          <button onClick={exportReco} className="tct tct-raised" style={{ ...chipSty, borderRadius: 8 }}>⤓ CSV</button>
        )}
      </header>

      {/* Section nav. Five areas in one scroll is a page nobody reaches the
          bottom of, and on a phone it is a minute of thumb. */}
      <nav style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '10px 16px', borderBottom: `1px solid ${GRID}`, background: 'var(--bg, #16171f)', position: 'sticky', top: 56, zIndex: 9, WebkitOverflowScrolling: 'touch' }}>
        {TABS.map(t => (
          <button key={t.k} type="button" onClick={() => setTab(t.k)}
            className={tab === t.k ? 'tct tct-raised' : 'tct'}
            style={{ ...chipSty, borderRadius: 999, opacity: tab === t.k ? 1 : 0.65 }}>{t.l}</button>
        ))}
      </nav>

      <main style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: phone ? '14px 16px 90px' : '20px 20px 60px', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
        {loading ? <LogoSpinner /> : error ? (
          <div style={{ padding: 14, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 10, fontSize: 12.5, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Couldn’t load: {error}</div>
        ) : !a || !a.active.length ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Nothing to analyse yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>Onboard a vendor and this builds itself.</div>
          </div>
        ) : (
          <>
            {raw.missing.length > 0 && (
              <div style={{ padding: '10px 13px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 10, fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
                Could not read: {raw.missing.join(', ')}. Those panels are blank because the query failed, not because there is nothing there.
              </div>
            )}

            {/* ══ OVERVIEW ══════════════════════════════════════════════════ */}
            {tab === 'overview' && <>
              <div style={grid(150)}>
                <Stat label="On roll" value={a.active.length} sub={`${a.workforce.total} ever · ${a.workforce.exits} left`} />
                <Stat label="Monthly run-rate" value={compact(a.runRate)} sub="sum of agreed rates" />
                <Stat label={a.latest ? `${a.latest.label} payout` : 'Payout'} value={a.latest ? money(a.latest.total) : '—'}
                  tone="var(--accent, #c8963e)" delta={a.prevM && a.latest ? pct(a.latest.total, a.prevM.total) : null} />
                <Stat label="Punching" value={`${a.attendance.coverageNow}/${a.active.length}`}
                  sub="busiest of the last 7 days" tone={a.attendance.coverageNow < a.active.length / 2 ? 'var(--red, #e05c6a)' : undefined} />
              </div>

              {/* The one number that spans two systems, and the reason this
                  page exists. Money, not a count. */}
              <Card title="Days paid vs days punched"
                sub={a.reco.month ? `${mLabel(a.reco.month)} · attendance from ${new Date(ROLLOUT).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'no payroll yet'}>
                {!a.reco.month ? (
                  <Empty>No payroll period to reconcile.</Empty>
                ) : !a.reco.anyPunched ? (
                  <Flag n="—" tone="amber" label={`No punches at all in ${mLabel(a.reco.month)}`}
                    detail="Payroll ran on typed days for this month and attendance was not in use, so there is nothing to compare. Pick a later month." />
                ) : (
                  <>
                    <div style={grid(140)}>
                      <Stat label="Days paid" value={fmtInt(a.reco.rows.reduce((s, r) => s + r.paid, 0))} />
                      <Stat label="Days punched" value={fmtInt(a.reco.rows.reduce((s, r) => s + r.punched, 0))} />
                      <Stat label="Unmatched days" value={fmtInt(a.reco.gapDays)} tone="var(--red, #e05c6a)" />
                      <Stat label="At that day rate" value={money(a.reco.gapMoney)} tone="var(--red, #e05c6a)" />
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
                      An unmatched day is a day paid with no punch behind it. It is not proof of anything — a vendor who worked
                      without the app looks identical to one who did not work — which is exactly why it belongs in front of a
                      person before the period is marked final, rather than in a report afterwards.
                    </div>
                    <button type="button" onClick={() => setTab('payroll')} className="tct" style={{ ...chipSty, borderRadius: 8, alignSelf: 'flex-start' }}>
                      Open the per-vendor breakdown →
                    </button>
                  </>
                )}
              </Card>

              <Card title="Wants a person" sub="not a chart">
                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 10 }}>
                  {a.attention.lockedOut.length > 0 && (
                    <Flag n={a.attention.lockedOut.length} tone="red" label="Locked out of the portal"
                      detail={`No live session, so the next visit needs the password: ${a.attention.lockedOut.slice(0, 3).map(x => x.vendor.full_name).join(', ')}${a.attention.lockedOut.length > 3 ? `, +${a.attention.lockedOut.length - 3} more` : ''}. Their password is readable on their profile.`} />
                  )}
                  {a.delivery.invOutstanding > 0 && (
                    <Flag n={a.delivery.invOutstanding} tone="amber" label="Invoices sent, not signed"
                      detail={`${money(a.delivery.invOutstandingValue)} outstanding. Median signing time is ${fmtDays(a.delivery.medTimeToSign)} once sent.`} />
                  )}
                  {a.delivery.woAwaitingVerify > 0 && (
                    <Flag n={a.delivery.woAwaitingVerify} tone="amber" label="Work done, awaiting verification"
                      detail={`Vendor marked complete and nobody has verified. Median verification takes ${fmtDays(a.delivery.medDoneToVerify)}.`} />
                  )}
                  {a.attendance.unclosedPast > 0 && (
                    <Flag n={a.attendance.unclosedPast} tone="red" label="Shifts never closed"
                      detail="A check-in on a past day with no check-out after it. Every hours figure that includes one is wrong. Close them from the Attendance tab." />
                  )}
                  {a.attention.assetsWithLeavers.length > 0 && (
                    <Flag n={a.attention.assetsWithLeavers.length} tone="red" label="Assets with people who left"
                      detail={`${money(a.attention.assetsWithLeavers.reduce((s, x) => s + Number(x.value || 0), 0))} still assigned to exited or archived vendors.`} />
                  )}
                  {a.attention.draftPeriods.length > 0 && (
                    <Flag n={a.attention.draftPeriods.length} tone="amber" label="Payroll still in draft"
                      detail={a.attention.draftPeriods.map(p => mLabel(p.period_month)).join(', ') + ' — not locked, so the figures can still move.'} />
                  )}
                  {a.attention.openAssetReqs.length > 0 && (
                    <Flag n={a.attention.openAssetReqs.length} tone="amber" label="Asset requests open"
                      detail={a.attention.openAssetReqs.slice(0, 3).map(r => r.item_name).filter(Boolean).join(', ') || 'Waiting on a decision.'} />
                  )}
                  {a.attention.openEditReqs.length > 0 && (
                    <Flag n={a.attention.openEditReqs.length} tone="amber" label="Profile edit requests open"
                      detail="A vendor is waiting on access to correct their own details." />
                  )}
                  {[a.attention.lockedOut.length, a.delivery.invOutstanding, a.delivery.woAwaitingVerify,
                    a.attendance.unclosedPast, a.attention.assetsWithLeavers.length, a.attention.draftPeriods.length,
                    a.attention.openAssetReqs.length, a.attention.openEditReqs.length].every(n => !n) && (
                    <Flag n="0" tone="green" label="Nothing waiting"
                      detail="No lock-outs, unsigned invoices, unverified work, unclosed shifts or open requests." />
                  )}
                </div>
              </Card>
            </>}

            {/* ══ PAYROLL ═══════════════════════════════════════════════════ */}
            {tab === 'payroll' && <>
              {!a.months.length ? <Empty>No payroll periods yet.</Empty> : <>
                <div style={grid(150)}>
                  <Stat label={`${a.latest.label} payout`} value={money(a.latest.total)} tone="var(--accent, #c8963e)"
                    delta={a.prevM ? pct(a.latest.total, a.prevM.total) : null} />
                  <Stat label="People paid" value={a.latest.headcount} delta={a.prevM ? pct(a.latest.headcount, a.prevM.headcount) : null} />
                  <Stat label="Average / person" value={money(a.latest.total / Math.max(1, a.latest.headcount))} />
                  <Stat label={`Total · ${a.months.length} months`} value={compact(a.months.reduce((s, m) => s + m.total, 0))}
                    sub={`${a.months[0].label} – ${a.latest.label}`} />
                </div>

                <Card title="Payroll by month" sub={`${a.months.length} periods`}>
                  <Legend items={[{ label: 'Earned', color: S1 }, { label: 'Overtime', color: S2 }, { label: 'Allowance', color: S3 }]} />
                  <Columns rows={a.months.map(m => ({ label: m.label, axis: m.axis, earned: m.fixed, ot: m.ot, allowance: m.allowance, note: m.note }))}
                    series={[{ key: 'earned', label: 'Earned', color: S1 }, { key: 'ot', label: 'Overtime', color: S2 }, { key: 'allowance', label: 'Allowance', color: S3 }]}
                    height={phone ? 150 : 190} minBar={phone ? 26 : 0} />
                </Card>

                <Card title="Days paid vs days punched" sub="per vendor"
                  right={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {a.months.slice(-6).map(m => (
                      <button key={m.ym} type="button" onClick={() => setYm(m.ym)}
                        className={m.ym === a.recoYm ? 'tct tct-raised' : 'tct'}
                        style={{ ...chipSty, borderRadius: 999, padding: '6px 10px', fontSize: 11, opacity: m.ym === a.recoYm ? 1 : 0.6 }}>{m.axis}</button>
                    ))}
                  </div>}>
                  {!a.reco.anyPunched ? (
                    <Flag n="—" tone="amber" label={`Nothing punched in ${mLabel(a.reco.month)}`}
                      detail="Attendance was not in use that month, so every day would read as unmatched. Choose a later month." />
                  ) : <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, trade…"
                        style={{ ...inputSty, flex: '1 1 190px' }} />
                      <select value={sort} onChange={e => setSort(e.target.value)} style={{ ...inputSty, flex: '0 0 auto', colorScheme: 'dark' }}>
                        <option value="gap">Biggest gap</option>
                        <option value="money">Gap value</option>
                        <option value="paid">Days paid</option>
                        <option value="punched">Days punched</option>
                        <option value="name">Name</option>
                      </select>
                    </div>
                    {recoRows.length === 0 ? <Empty>Nothing matches “{q}”.</Empty> : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: 520, borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11.5 }}>
                          <thead>
                            <tr style={{ textAlign: 'left', color: 'var(--text-muted, #6b6d82)' }}>
                              <th style={th}>Vendor</th><th style={thR}>Paid</th><th style={thR}>Punched</th>
                              <th style={thR}>Gap</th><th style={thR}>OT p/p</th><th style={thR}>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recoRows.map(r => (
                              <tr key={r.id} style={{ borderTop: `1px solid ${GRID}` }}>
                                <td style={td}>
                                  <span style={{ color: 'var(--text, #e8e8f0)' }}>{r.name}</span>
                                  {r.trade && <span style={{ color: 'var(--text-muted, #6b6d82)' }}> · {r.trade}</span>}
                                </td>
                                <td style={tdR}>{fmtInt(r.paid)}</td>
                                <td style={{ ...tdR, color: r.punched === 0 ? 'var(--red, #e05c6a)' : 'var(--text, #e8e8f0)' }}>{r.punched}</td>
                                <td style={{ ...tdR, fontWeight: 700, color: r.gap > 0 ? 'var(--red, #e05c6a)' : 'var(--green, #3dba7a)' }}>{r.gap > 0 ? `+${fmtInt(r.gap)}` : fmtInt(r.gap)}</td>
                                <td style={tdR}>{fmtInt(r.otPaid)}/{r.otPunched}</td>
                                <td style={tdR}>{r.gapMoney > 0 ? money(r.gapMoney) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
                      “OT p/p” is overtime days paid over overtime days punched. Value prices the gap at that vendor's own day rate for the month.
                    </div>
                  </>}
                </Card>
              </>}
            </>}

            {/* ══ ATTENDANCE ════════════════════════════════════════════════ */}
            {tab === 'attendance' && <>
              <div style={{ padding: '10px 13px', background: 'var(--bg-input, #252731)', border: `1px solid ${GRID}`, borderRadius: 10, fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
                Everything here starts {new Date(ROLLOUT).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}, when punching came into real use.
                August was a two-vendor pilot, and charting it against a full month of payroll reads as mass absence.
                A day with no punch is <strong style={{ color: 'var(--text-dim, #9394a8)' }}>not marked</strong> — there is no roster or leave record, so it cannot be called absent.
              </div>

              {!a.attendance.dayRows.length ? <Empty>No punches since rollout.</Empty> : <>
                <div style={grid(150)}>
                  <Stat label="Vendors punching" value={a.attendance.punchingVendors} sub={`of ${a.active.length} on roll`} />
                  <Stat label="Busiest day" value={a.attendance.coverageNow} sub="last 7 recorded days" />
                  <Stat label="Overtime days" value={a.attendance.otVendorDays} sub="vendor-days with OT" />
                  <Stat label="Shifts never closed" value={a.attendance.unclosedPast}
                    tone={a.attendance.unclosedPast ? 'var(--red, #e05c6a)' : 'var(--green, #3dba7a)'}
                    sub={a.attendance.openToday ? `${a.attendance.openToday} open today, which is normal` : 'past days only'} />
                </div>

                <Card title="How many punched, by day" sub={`${a.attendance.firstDay} – ${a.attendance.lastDay}`}>
                  <Columns rows={a.attendance.dayRows} series={[{ key: 'vendors', label: 'Vendors', color: S1 }]}
                    fmt={fmtInt} height={phone ? 150 : 180} minBar={phone ? 20 : 0} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
                    Adoption, not attendance: the gap between this and {a.active.length} on roll is mostly people who have not started using the app.
                  </div>
                </Card>

                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <Card title="When people check in" sub="first check-in of each day">
                    {!a.attendance.arrivalRows.length ? <Empty>No check-ins recorded.</Empty> : <>
                      <Columns rows={a.attendance.arrivalRows} series={[{ key: 'count', label: 'Check-ins', color: S3 }]}
                        fmt={fmtInt} height={phone ? 140 : 170} minBar={phone ? 18 : 0} />
                      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
                        Nothing in the system declares a shift start, so this is the spread rather than a lateness count.
                        Set an expected start and it becomes punctuality.
                      </div>
                    </>}
                  </Card>

                  <Card title="Overtime and coverage">
                    <SplitBar parts={[
                      { label: 'Punching', value: a.attendance.punchingVendors, color: S1 },
                      { label: 'Not yet', value: Math.max(0, a.active.length - a.attendance.punchingVendors), color: 'var(--text-muted, #6b6d82)' },
                    ]} />
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.7 }}>
                      {a.attendance.punchingVendors} of {a.active.length} on roll have punched at least once since rollout
                      ({share(a.attendance.punchingVendors, a.active.length)}%).
                      {a.attention.lockedOut.length > 0 && ` ${a.attention.lockedOut.length} of the rest cannot get in — they have no live session and need their password.`}
                    </div>
                  </Card>
                </div>
              </>}
            </>}

            {/* ══ DELIVERY ══════════════════════════════════════════════════ */}
            {tab === 'delivery' && <>
              <div style={grid(150)}>
                <Stat label="Work orders" value={a.delivery.woTotal} sub={`${a.delivery.woStatus.find(s => s.label === 'verified')?.value || 0} verified`} />
                <Stat label="Issued → done" value={fmtDays(a.delivery.medIssueToDone)} sub="median" />
                <Stat label="Done → verified" value={fmtDays(a.delivery.medDoneToVerify)} sub="median" />
                <Stat label="Invoices signed" value={`${a.delivery.invSigned}/${a.delivery.invTotal}`}
                  sub={a.delivery.invOutstanding ? `${money(a.delivery.invOutstandingValue)} outstanding` : 'all signed'} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 14 }}>
                <Card title="Work orders by state">
                  {!a.delivery.woTotal ? <Empty>No work orders yet.</Empty> : (
                    <HBars rows={a.delivery.woStatus.map(s => ({ label: s.label.replace(/_/g, ' '), value: s.value }))} fmt={fmtInt} color={S1} />
                  )}
                </Card>
                <Card title="By trade" sub="issued, and how many verified">
                  {!a.delivery.woByTrade.length ? <Empty>No work orders yet.</Empty> : (
                    <HBars rows={a.delivery.woByTrade} fmt={fmtInt} color={S3} />
                  )}
                </Card>
              </div>

              <Card title="Finishing on time" sub={`${a.delivery.woSchedulable} of ${a.delivery.woTotal} work orders have both a scheduled end and a completion`}>
                {a.delivery.woSchedulable === 0 ? (
                  <Flag n="—" tone="amber" label="Not measurable yet"
                    detail="On-time needs a scheduled end date and a recorded completion. Too few work orders carry both." />
                ) : <>
                  <SplitBar parts={[
                    { label: 'On time', value: a.delivery.woOnTime, color: S3 },
                    { label: 'Late', value: a.delivery.woSchedulable - a.delivery.woOnTime, color: S2 },
                  ]} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
                    Measured only across the {a.delivery.woSchedulable} with both dates — {share(a.delivery.woSchedulable, a.delivery.woTotal)}% of all work orders.
                    The rest have no scheduled end to be judged against, so they are left out rather than counted as on time.
                    {a.delivery.woVerifiedNoCompletion > 0 && ` ${a.delivery.woVerifiedNoCompletion} were verified with no vendor completion recorded at all.`}
                  </div>
                </>}
              </Card>

              <Card title="Invoices" sub="sent, then signed">
                {!a.delivery.invTotal ? <Empty>No vendor invoices yet.</Empty> : <>
                  <SplitBar parts={[
                    { label: 'Signed', value: a.delivery.invSigned, color: S3 },
                    { label: 'Awaiting signature', value: a.delivery.invOutstanding, color: S2 },
                  ]} />
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.7 }}>
                    Median {fmtDays(a.delivery.medTimeToSign)} from sent to signed.
                    {a.delivery.invReopened > 0 && ` ${a.delivery.invReopened} reopened after signing.`}
                    <br />
                    There is no “opened” stage here on purpose: <code>viewed_at</code> is recorded on none of the {a.delivery.invTotal},
                    so a funnel would claim no vendor has ever opened their invoice rather than that we do not track it.
                  </div>
                </>}
              </Card>
            </>}

            {/* ══ WORKFORCE ═════════════════════════════════════════════════ */}
            {tab === 'workforce' && <>
              <div style={grid(150)}>
                <Stat label="On roll" value={a.active.length} />
                <Stat label="Ever onboarded" value={a.workforce.total} sub={`${a.workforce.exits} exited`} />
                <Stat label="Monthly run-rate" value={compact(a.runRate)} />
                <Stat label="Average rate" value={money(a.runRate / Math.max(1, a.active.length))} sub="per person / month" />
              </div>

              <Card title="Joiners and leavers" sub="by month">
                {!a.workforce.flow.length ? <Empty>No joining dates recorded.</Empty> : <>
                  <Legend items={[{ label: 'Joined', color: S3 }, { label: 'Left', color: S2 }]} />
                  <Columns rows={a.workforce.flow} series={[{ key: 'joined', label: 'Joined', color: S3 }, { key: 'left', label: 'Left', color: S2 }]}
                    fmt={fmtInt} height={phone ? 150 : 180} minBar={phone ? 24 : 0} labelLast={false} />
                </>}
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 14 }}>
                <Card title="On roll by trade" sub="count, and what it costs a month">
                  {!a.workforce.byTrade.length ? <Empty>Nobody on roll.</Empty> : (
                    <HBars rows={a.workforce.byTrade} fmt={fmtInt} color={S1} />
                  )}
                </Card>
                <Card title="Assets out" sub={`${a.assets.count} assigned · ${money(a.assets.value)}`}>
                  {!a.assets.count ? <Empty>No assets assigned.</Empty> : <>
                    <SplitBar parts={[
                      { label: 'With people on roll', value: Math.max(0, a.assets.count - a.assets.withLeavers.length), color: S3 },
                      { label: 'With people who left', value: a.assets.withLeavers.length, color: S2 },
                    ]} />
                    <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
                      {a.assets.withLeavers.length === 0
                        ? 'Everything assigned is with somebody still on roll.'
                        : `${a.assets.withLeavers.map(x => x.name).filter(Boolean).join(', ')} — assigned to vendors who have exited or been archived, and never returned.`}
                    </div>
                  </>}
                </Card>
              </div>
            </>}
          </>
        )}
      </main>
    </div>
  )
}

const th  = { padding: '7px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }
const thR = { ...th, textAlign: 'right' }
const td  = { padding: '8px', minWidth: 0 }
const tdR = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

function Empty({ children }) {
  return (
    <div style={{ padding: '22px 14px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
      {children}
    </div>
  )
}
