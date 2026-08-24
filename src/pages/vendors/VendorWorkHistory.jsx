import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtTime, fmtDate } from '../../utils/vendorHub'
import { summarizeDay, groupByDay, breakMinutesOn, fmtHrs } from '../../utils/attendance'

// One vendor's working history, for the staff profile sheet: which days they
// worked, when they came and went, regular vs overtime, where, and how much
// break they took.
//
// Hours come from the same summarize() the live board uses, so a day cannot
// read 8h here and 7h there.

const MONO = 'var(--font-mono, monospace)'
const RANGES = [
  { key: 30,  label: '30d' },
  { key: 90,  label: '90d' },
  { key: 365, label: '1y' },
  { key: 0,   label: 'All' },
]

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3, fontFamily: MONO, color: color || 'var(--text, #e8e8f0)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

export default function VendorWorkHistory({ vendorId }) {
  const [days, setDays] = useState(30)
  const [expanded, setExpanded] = useState(null)
  // Keyed result rather than a loading flag: "still loading" is simply the
  // stored key not matching the one being asked for. Nothing has to be reset
  // synchronously when vendorId or the range changes, which is what made this
  // set state straight out of an effect.
  const key = `${vendorId}|${days}`
  const [res, setRes] = useState({ key: null, punches: [], breaks: [], err: '' })
  const loading = res.key !== key
  const punches = loading ? null : res.punches
  const breaks = res.breaks
  const err = loading ? '' : res.err

  useEffect(() => {
    let cancelled = false
    const since = days ? new Date(Date.now() - days * 86400000).toISOString() : null

    let pq = supabase.from('vendor_attendance')
      .select('id, punch_type, punched_at, pid, kind, lat, lng, source')
      .eq('vendor_id', vendorId).order('punched_at', { ascending: false }).limit(2000)
    if (since) pq = pq.gte('punched_at', since)

    let bq = supabase.from('vendor_breaks')
      .select('id, kind, started_at, ended_at')
      .eq('vendor_id', vendorId).order('started_at', { ascending: false }).limit(2000)
    if (since) bq = bq.gte('started_at', since)

    Promise.all([pq, bq]).then(([pRes, bRes]) => {
      if (cancelled) return
      // vendor_breaks may not exist yet on an older database — that must not
      // take the whole history down with it, so it degrades to "no breaks".
      setRes({
        key,
        punches: pRes.error ? [] : (pRes.data || []),
        breaks: bRes.error ? [] : (bRes.data || []),
        err: pRes.error ? pRes.error.message : '',
      })
    })
    return () => { cancelled = true }
  }, [vendorId, days, key])

  const grouped = groupByDay(punches || [])
  const totals = grouped.reduce((acc, d) => {
    const s = summarizeDay(d.punches, d.date)
    if (s.incomplete) { acc.incomplete += 1; return acc }
    acc.reg += s.regMs; acc.ot += s.otMs
    if (s.regMs > 0 || s.otMs > 0) acc.days += 1
    return acc
  }, { reg: 0, ot: 0, days: 0, incomplete: 0 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {RANGES.map(r => (
          <button key={r.key} type="button" onClick={() => setDays(r.key)}
            className={`tct tct-raised${days === r.key ? ' is-on' : ''}`}
            style={{ padding: '7px 12px', minHeight: 34, fontSize: 12, cursor: 'pointer' }}>
            {r.label}
          </button>
        ))}
      </div>

      {err && (
        <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>⚠ Could not load history</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, wordBreak: 'break-word', marginTop: 3 }}>{err}</div>
        </div>
      )}

      {punches == null ? (
        <div style={{ padding: '14px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>
      ) : grouped.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
          No attendance recorded{days ? ` in the last ${days} days` : ''}.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <Tile label="Days worked" value={totals.days} />
            <Tile label="Regular" value={fmtHrs(totals.reg)} color="var(--green, #3dba7a)" />
            <Tile label="Overtime" value={fmtHrs(totals.ot)} color={totals.ot > 0 ? '#5b8def' : undefined} />
          </div>
          {totals.incomplete > 0 && (
            <div style={{ fontSize: 11, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
              {totals.incomplete} day{totals.incomplete > 1 ? 's' : ''} with no check-out — not counted in the totals above.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {grouped.map(d => {
              const s = summarizeDay(d.punches, d.date)
              const brk = breakMinutesOn(breaks, d.date)
              // Every site touched that day, in order. summarize() only keeps
              // the first, which quietly hid the second property whenever
              // somebody moved between two in a day.
              const sites = [...new Set(d.punches.map(p => p.pid).filter(Boolean))]
              const open = expanded === d.date
              return (
                <div key={d.date} style={{ borderTop: '1px solid var(--border, #2e3040)' }}>
                  <button type="button" onClick={() => setExpanded(open ? null : d.date)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 2px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 44 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, minWidth: 84, flexShrink: 0 }}>{fmtDate(d.date)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {sites.length === 0 ? (
                        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>no site</span>
                      ) : sites.slice(0, 3).map(pid => (
                        <span key={pid} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '3px 8px', borderRadius: 6, background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.32)' }}>
                          <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--accent, #c8963e)', fontFamily: MONO }}>PID</span>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: MONO }}>{pid}</span>
                        </span>
                      ))}
                      {/* The date and the badges never shrink, so a day spent
                          across many sites would push the row sideways. Three
                          fit; the rest are a count you can open the day to see. */}
                      {sites.length > 3 && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>+{sites.length - 3}</span>
                      )}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.firstIn ? fmtTime(s.firstIn.punched_at) : '—'} → {s.incomplete ? 'never checked out' : s.status === 'on_site' ? 'on site' : (s.lastOut ? fmtTime(s.lastOut.punched_at) : '—')}
                    </span>
                    {s.incomplete ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>no check-out</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{fmtHrs(s.regMs)}</span>
                        {s.otMs > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#5b8def', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>+{fmtHrs(s.otMs)}</span>}
                      </>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                  </button>

                  {open && (
                    <div style={{ padding: '2px 2px 12px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {d.punches.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontFamily: MONO }}>
                          <span style={{ width: 7, height: 7, borderRadius: 4, flexShrink: 0, background: p.punch_type === 'in' ? ((p.kind || 'regular') === 'overtime' ? '#5b8def' : 'var(--green, #3dba7a)') : 'var(--text-muted, #6b6d82)' }} />
                          <span style={{ width: 30, color: p.punch_type === 'in' ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', fontWeight: 700 }}>{p.punch_type === 'in' ? 'IN' : 'OUT'}</span>
                          <span style={{ color: 'var(--text-dim, #9394a8)', minWidth: 70 }}>{fmtTime(p.punched_at)}</span>
                          {(p.kind || 'regular') === 'overtime' && <span style={{ color: '#5b8def', fontSize: 10 }}>overtime</span>}
                          {p.pid && (
                            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, padding: '1px 6px', borderRadius: 5, background: 'rgba(200,150,62,0.10)' }}>
                              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--accent, #c8963e)' }}>PID</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim, #9394a8)' }}>{p.pid}</span>
                            </span>
                          )}
                          {p.source && p.source !== 'self' && <span style={{ color: 'var(--accent, #c8963e)', fontSize: 10 }}>· {p.source}</span>}
                        </div>
                      ))}
                      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3 }}>
                        Break {Math.round(brk)} min{brk > 60 ? ' · over the hour' : ''}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
