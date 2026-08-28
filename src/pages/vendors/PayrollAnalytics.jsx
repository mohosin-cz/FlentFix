import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import LogoSpinner from '../../components/LogoSpinner'
import {
  SANS, MONO, GRID, SURFACE, S1, S2, S3,
  money, compact, mLabel, mShort, pctChange as pct, downloadCsv,
} from '../../utils/analytics'
import { Card, Stat, Legend, Columns, HBars, Flag } from '../../components/analytics'

// ─────────────────────────────────────────────────────────────────────────────
export default function PayrollAnalytics() {
  const navigate = useNavigate()
  const phone = useIsMobile(640)
  const narrow = useIsMobile(980)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lines, setLines] = useState([])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('latest')

  // no synchronous setState here — `loading` starts true, so the effect only
  // ever writes state after the await
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error: e } = await supabase
        .from('vendor_payouts')
        .select('*, period:vendor_payroll_periods(period_month, status, days_in_month)')
      if (!alive) return
      if (e) { setError(e.message); setLoading(false); return }
      setLines((data || []).filter(r => r.period))
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const a = useMemo(() => {
    if (!lines.length) return null
    const byMonth = new Map()
    for (const r of lines) {
      const ym = r.period.period_month
      const g = byMonth.get(ym) || {
        ym, label: mLabel(ym), status: r.period.status, lines: 0, people: new Set(),
        total: 0, earned: 0, ot: 0, otDays: 0, advGiven: 0, advRec: 0,
      }
      const days = r.days_worked == null ? 30 : Number(r.days_worked)
      g.lines++
      g.people.add(r.beneficiary_name)
      g.total += Number(r.total_payout || 0)
      g.earned += Number(r.fixed_pay || 0) * days / 30
      g.ot += Number(r.ot_amount || 0)
      g.otDays += Number(r.ot_days || 0)
      g.advGiven += Number(r.advance_given || 0)
      g.advRec += Number(r.advance_recovered || 0)
      byMonth.set(ym, g)
    }
    const months = [...byMonth.values()]
      .sort((x, y) => x.ym.localeCompare(y.ym))
      .map(m => ({ ...m, axis: mShort(m.ym), headcount: m.people.size, note: `${m.people.size} paid · ${m.status}` }))

    const latest = months[months.length - 1]
    const prev = months[months.length - 2]

    // people
    const byPerson = new Map()
    for (const r of lines) {
      const k = r.beneficiary_name || '—'
      const p = byPerson.get(k) || { name: k, team: r.team, cost_centre: r.cost_centre, months: 0, total: 0, byYm: {} }
      p.months++; p.total += Number(r.total_payout || 0)
      p.byYm[r.period.period_month] = (p.byYm[r.period.period_month] || 0) + Number(r.total_payout || 0)
      p.team = p.team || r.team; p.cost_centre = p.cost_centre || r.cost_centre
      byPerson.set(k, p)
    }
    const people = [...byPerson.values()].map(p => ({
      ...p,
      avg: p.total / p.months,
      latest: p.byYm[latest?.ym] || 0,
      prev: p.byYm[prev?.ym] || 0,
      change: pct(p.byYm[latest?.ym] || 0, p.byYm[prev?.ym] || 0),
    }))

    const group = (key) => {
      const m = new Map()
      for (const r of lines) {
        const k = (r[key] || '').trim() || 'Unassigned'
        const g = m.get(k) || { label: k, value: 0, people: new Set() }
        g.value += Number(r.total_payout || 0); g.people.add(r.beneficiary_name)
        m.set(k, g)
      }
      return [...m.values()].map(g => ({ ...g, sub: `${g.people.size} paid` })).sort((x, y) => y.value - x.value)
    }

    // data quality — every one of these is a real reconciliation risk
    const mismatch = lines.filter(r => {
      const days = r.days_worked == null ? 30 : Number(r.days_worked)
      const calc = Number(r.fixed_pay || 0) * days / 30 + Number(r.allowance || 0) + Number(r.ot_amount || 0) - Number(r.advance_recovered || 0)
      return Math.abs(calc - Number(r.total_payout || 0)) > 1
    })
    const mismatchGap = mismatch.reduce((s, r) => {
      const days = r.days_worked == null ? 30 : Number(r.days_worked)
      return s + (Number(r.fixed_pay || 0) * days / 30 + Number(r.allowance || 0) + Number(r.ot_amount || 0) - Number(r.advance_recovered || 0) - Number(r.total_payout || 0))
    }, 0)

    const ytd = months.reduce((s, m) => s + m.total, 0)
    const otTotal = months.reduce((s, m) => s + m.ot, 0)

    return {
      months, latest, prev, people, ytd, otTotal,
      byTeam: group('team'), byCentre: group('cost_centre'),
      quality: {
        mismatch: mismatch.length, mismatchGap,
        orphan: lines.filter(r => !r.vendor_id).length,
        noUtr: lines.filter(r => !r.utr).length,
        noCentre: lines.filter(r => !r.cost_centre).length,
        zero: lines.filter(r => !Number(r.total_payout)).length,
        total: lines.length,
      },
    }
  }, [lines])

  const peopleRows = useMemo(() => {
    if (!a) return []
    const needle = q.trim().toLowerCase()
    const rows = a.people.filter(p => !needle || [p.name, p.team, p.cost_centre].some(f => (f || '').toLowerCase().includes(needle)))
    const by = { latest: (x, y) => y.latest - x.latest, total: (x, y) => y.total - x.total, avg: (x, y) => y.avg - x.avg,
      change: (x, y) => (y.change ?? -1e9) - (x.change ?? -1e9), name: (x, y) => x.name.localeCompare(y.name) }
    return rows.sort(by[sort] || by.latest)
  }, [a, q, sort])

  function exportCsv() {
    if (!a) return
    const cols = ['name', 'team', 'cost_centre', 'months_paid', 'latest', 'average', 'total', 'change_pct']
    const body = peopleRows.map(p => [p.name, p.team, p.cost_centre, p.months, Math.round(p.latest), Math.round(p.avg), Math.round(p.total), p.change == null ? '' : p.change.toFixed(1)])
    downloadCsv(`payroll-analytics-${a.latest.ym}.csv`, cols, body)
  }

  const chipSty = { padding: '8px 13px', fontSize: 12, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: 'var(--text, #e8e8f0)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56, paddingTop: 'env(safe-area-inset-top)', background: SURFACE, borderBottom: `1px solid ${GRID}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate('/vendors')} aria-label="Back" style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: `1px solid ${GRID}`, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div className="pulse-title" style={{ flex: 1, minWidth: 0, fontSize: 15.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {phone ? 'Payroll' : 'Payroll analytics'}
        </div>
        <button onClick={exportCsv} className="tct tct-raised" style={{ ...chipSty, borderRadius: 8 }}>⤓ CSV</button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1180, margin: '0 auto', padding: phone ? '14px 16px 90px' : '20px 20px 60px', display: 'flex', flexDirection: 'column', gap: 14, boxSizing: 'border-box' }}>
        {loading ? <LogoSpinner /> : error ? (
          <div style={{ padding: 14, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 10, fontSize: 12.5, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>Couldn’t load: {error}</div>
        ) : !a ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', border: `1px dashed var(--border-dash, #3a3d52)`, borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No payroll yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>Generate a month from the Payroll tab and the analysis will build itself.</div>
          </div>
        ) : (
          <>
            {/* headline */}
            <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Stat label={`${a.latest.label} payout`} value={money(a.latest.total)} tone="var(--accent, #c8963e)" delta={a.prev ? pct(a.latest.total, a.prev.total) : null} />
              <Stat label="People paid" value={a.latest.headcount} delta={a.prev ? pct(a.latest.headcount, a.prev.headcount) : null} />
              <Stat label="Average / person" value={money(a.latest.total / Math.max(1, a.latest.headcount))} />
              <Stat label={`Total · ${a.months.length} months`} value={compact(a.ytd)} sub={`${a.months[0].label} – ${a.latest.label}`} />
            </div>

            {/* trend */}
            <Card title="Payroll by month" sub={`${a.months.length} periods`}>
              <Columns rows={a.months.map(m => ({ label: m.label, axis: m.axis, total: m.total, note: m.note }))}
                series={[{ key: 'total', label: 'Total payout', color: S1 }]} height={phone ? 150 : 190} />
            </Card>

            {/* composition */}
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 14 }}>
              <Card title="What the pay was made of" sub="gross, before advance adjustment">
                <Legend items={[{ label: 'Earned', color: S1 }, { label: 'Overtime', color: S2 }]} />
                <Columns rows={a.months.map(m => ({ label: m.label, axis: m.axis, earned: m.earned, ot: m.ot }))}
                  series={[{ key: 'earned', label: 'Earned', color: S1 }, { key: 'ot', label: 'Overtime', color: S2 }]}
                  height={phone ? 140 : 170} labelLast={false} />
              </Card>

              <Card title="Overtime" sub={`${compact(a.otTotal)} across ${a.months.length} months`}>
                <Columns rows={a.months.map(m => ({ label: m.label, axis: m.axis, otDays: m.otDays, note: `${money(m.ot)} · ${m.otDays} days` }))}
                  series={[{ key: 'otDays', label: 'OT days', color: S2 }]}
                  fmt={(v) => Math.round(v)} height={phone ? 140 : 170} />
                <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 }}>
                  One OT day pays a day's rate. {a.latest.otDays ? `${a.latest.otDays} days in ${a.latest.label} — ${((a.latest.ot / a.latest.total) * 100).toFixed(1)}% of that month.` : `None recorded in ${a.latest.label}.`}
                </div>
              </Card>
            </div>

            {/* advances — a deduction from salary, not a second income stream */}
            <Card title="Advance adjusted in salary" sub="reduces that month's take-home">
              <Columns rows={a.months.map(m => ({ label: m.label, axis: m.axis, adj: m.advRec, note: m.advGiven ? `${money(m.advGiven)} advanced this month` : undefined }))}
                series={[{ key: 'adj', label: 'Adjusted', color: S3 }]}
                height={phone ? 130 : 160} />
              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
                {(() => {
                  const given = a.months.reduce((s2, m) => s2 + m.advGiven, 0)
                  const adj = a.months.reduce((s2, m) => s2 + m.advRec, 0)
                  const givenMonths = a.months.filter(m => m.advGiven).map(m => m.label)
                  return (
                    <>
                      The payout above is already net of this — an advance comes off the salary it is adjusted against.
                      <br />
                      {money(given)} advanced{givenMonths.length ? ` (${givenMonths.join(', ')})` : ''} · {money(adj)} adjusted back.
                      {adj > given && ` ${money(adj - given)} more has been adjusted than these records show was given, so some advances pre-date them.`}
                      {given > adj && ` ${money(given - adj)} still to be adjusted.`}
                    </>
                  )
                })()}
              </div>
            </Card>

            {/* where it goes */}
            <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 14 }}>
              <Card title="By team" sub="all periods"><HBars rows={a.byTeam} /></Card>
              <Card title="By cost centre" sub="all periods"><HBars rows={a.byCentre} /></Card>
            </div>

            {/* people */}
            <Card title="People" sub={`${peopleRows.length} of ${a.people.length}`}
              right={
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[['latest', 'Latest'], ['change', 'Movers'], ['total', 'Total'], ['name', 'A–Z']].map(([k, l]) => (
                    <button key={k} onClick={() => setSort(k)} aria-pressed={sort === k}
                      className={`tct tct-bare${sort === k ? ' is-on' : ''}`} style={chipSty}>{l}</button>
                  ))}
                </div>
              }>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, team, cost centre…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: `1px solid ${GRID}`, borderRadius: 8, outline: 'none', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 10, overflow: 'hidden', border: `1px solid ${GRID}` }}>
                {peopleRows.length === 0 && <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, background: 'var(--bg-input, #252731)' }}>Nobody matches that.</div>}
                {peopleRows.map(p => (
                  <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', background: 'var(--bg-input, #252731)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
                        {[p.team, p.cost_centre].filter(Boolean).join(' · ') || 'unassigned'} · {p.months} mo
                      </div>
                    </div>
                    {!phone && (
                      <div style={{ textAlign: 'right', flexShrink: 0, width: 88 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{money(p.avg)}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>AVG</div>
                      </div>
                    )}
                    <div style={{ textAlign: 'right', flexShrink: 0, width: phone ? 92 : 100 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: p.latest ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{money(p.latest)}</div>
                      <div style={{ fontSize: 9.5, fontFamily: MONO, color: p.change == null ? 'var(--text-muted, #6b6d82)' : p.change > 0 ? 'var(--red, #e05c6a)' : p.change < 0 ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }}>
                        {p.change == null ? a.latest.label : `${p.change > 0 ? '▲' : p.change < 0 ? '▼' : ''} ${Math.abs(Math.round(p.change))}%`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* data quality */}
            <Card title="Worth checking" sub={`${a.quality.total} payout lines`}>
              <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 10 }}>
                {a.quality.mismatch > 0 && (
                  <Flag tone="red" n={a.quality.mismatch} label="Lines that don't add up"
                    detail={`Fixed + OT − advance doesn't equal the stored total, off by ${money(Math.abs(a.quality.mismatchGap))} overall. Mostly legacy imports.`} />
                )}
                {a.quality.orphan > 0 && (
                  <Flag n={a.quality.orphan} label="Not linked to a vendor"
                    detail="Imported lines with no vendor_id, so they never join attendance or the roster." />
                )}
                {a.quality.noUtr > 0 && (
                  <Flag n={a.quality.noUtr} label="No UTR recorded"
                    detail="Payment reference missing, so a line can't be traced to a bank transfer." />
                )}
                {a.quality.noCentre > 0 && (
                  <Flag n={a.quality.noCentre} label="No cost centre"
                    detail="These fall into Unassigned above and can't be charged to a budget." />
                )}
                {a.quality.zero > 0 && (
                  <Flag tone="red" n={a.quality.zero} label="Paid nothing"
                    detail="A line was generated at ₹0 — usually a vendor with no monthly rate set." />
                )}
                {a.byTeam.length > 1 && (
                  <Flag tone="green" n={a.byTeam.length} label="Distinct team names"
                    detail={a.byTeam.map(t => t.label).join(', ') + ' — check none of these are the same team spelled two ways.'} />
                )}
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
