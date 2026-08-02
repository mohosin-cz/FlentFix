import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import ShareSheet from '../../components/vendor/ShareSheet'
import { attendUrl, fmtTime, fmtDuration, todayStr } from '../../utils/vendorHub'

// ── summarise one vendor's punches for the day ──────────────────────────────
function summarize(list) {
  const ms = { regular: 0, overtime: 0 }
  const open = { regular: null, overtime: null }
  let firstIn = null, lastOut = null
  for (const p of list) {
    const k = p.kind || 'regular'
    if (p.punch_type === 'in') { if (!firstIn) firstIn = p; if (open[k] == null) open[k] = new Date(p.punched_at).getTime() }
    else { lastOut = p; if (open[k] != null) { ms[k] += new Date(p.punched_at).getTime() - open[k]; open[k] = null } }
  }
  const now = Date.now()
  const regMs = ms.regular + (open.regular != null ? now - open.regular : 0)
  const otMs = ms.overtime + (open.overtime != null ? now - open.overtime : 0)
  const anyOpen = open.regular != null || open.overtime != null
  const last = list[list.length - 1]
  return { firstIn, lastOut, status: anyOpen ? 'on_site' : 'checked_out', regMs, otMs, site: (firstIn && firstIn.pid) || last.pid || null }
}

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: 1, padding: '12px 10px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'var(--font-mono, monospace)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function AttendRow({ s, siteLabel }) {
  const on = s.status === 'on_site'
  const color = on ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{s.trade}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          in {fmtTime(s.firstIn && s.firstIn.punched_at)} · out {s.lastOut ? fmtTime(s.lastOut.punched_at) : '—'}{siteLabel ? ` · ${siteLabel}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 10, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>{on ? 'On site' : 'Checked out'}</span>
        <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDuration(s.regMs)}{s.otMs > 0 ? <span style={{ color: '#5b8def' }}> · OT {fmtDuration(s.otMs)}</span> : ''}</span>
      </div>
    </div>
  )
}

export default function AttendanceTab() {
  const [date, setDate] = useState(todayStr())
  const [punches, setPunches] = useState(null)   // null = not loaded / after error
  const [approved, setApproved] = useState([])
  const [siteMap, setSiteMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState(false)
  const [showAbsent, setShowAbsent] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const start = new Date(`${date}T00:00:00`)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    const [pRes, vRes, sRes] = await Promise.all([
      supabase.from('vendor_attendance')
        .select('*, vendor:vendors(full_name,trade,pod,vendor_code)')
        .gte('punched_at', start.toISOString()).lt('punched_at', end.toISOString())
        .order('punched_at', { ascending: true }),
      supabase.from('vendors').select('id,full_name,trade,pod,vendor_code').eq('status', 'approved'),
      supabase.rpc('attend_sites'),
    ])
    const e = pRes.error || vRes.error
    if (e) {
      setError(e.message); setPunches(null)
    } else {
      setPunches(pRes.data); setApproved(vRes.data || [])
      const map = {}; for (const s of sRes.data || []) map[s.pid] = s.label
      setSiteMap(map)
    }
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  // realtime: any new punch on this day → refresh the board
  useEffect(() => {
    const ch = supabase.channel('attendance-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vendor_attendance' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // group punches by vendor → summaries
  const byVendor = {}
  for (const p of punches || []) {
    (byVendor[p.vendor_id] = byVendor[p.vendor_id] || []).push(p)
  }
  const summaries = Object.entries(byVendor).map(([vid, list]) => {
    const s = summarize(list)
    const v = list[0].vendor || {}
    return { vid, name: v.full_name || 'Unknown', trade: v.trade || '', ...s }
  }).sort((a, b) => (a.status === b.status ? 0 : a.status === 'on_site' ? -1 : 1))

  const onSite = summaries.filter(s => s.status === 'on_site').length
  const out = summaries.filter(s => s.status === 'checked_out').length
  const punchedIds = new Set(Object.keys(byVendor))
  const absent = approved.filter(v => !punchedIds.has(v.id))
  const isToday = date === todayStr()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* date + share */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)}
          style={{ flex: 1, padding: '9px 12px', fontSize: 14, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'var(--font-mono, monospace)' }} />
        <button type="button" onClick={() => setSharing(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', background: 'rgba(200,150,62,0.10)', border: '1px solid var(--accent, #c8963e)', borderRadius: 8, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>⇱ Punch link</button>
      </div>

      {error && (
        <div style={{ padding: '12px 14px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontFamily: 'var(--font-mono, monospace)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', marginBottom: 4 }}>⚠ Could not load attendance</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', wordBreak: 'break-word' }}>{error}</div>
          <button type="button" onClick={load} style={{ marginTop: 8, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Retry</button>
        </div>
      )}

      {loading && !error && <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>}

      {!loading && !error && punches && (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <Tile label={isToday ? 'On site now' : 'On site'} value={onSite} color="var(--green, #3dba7a)" />
            <Tile label="Checked out" value={out} color="var(--text-dim, #9394a8)" />
            <Tile label="Not marked" value={absent.length} color="var(--amber, #c8963e)" />
          </div>

          {summaries.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
              <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No punches {isToday ? 'yet today' : 'on this day'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>Check-ins appear here live as vendors punch in.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {summaries.map(s => <AttendRow key={s.vid} s={s} siteLabel={s.site ? (siteMap[s.site] || s.site) : ''} />)}
            </div>
          )}

          {absent.length > 0 && (
            <div style={{ border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>
              <button type="button" onClick={() => setShowAbsent(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: 'var(--bg-panel, #1e2028)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>Not marked — {absent.length} approved vendor{absent.length === 1 ? '' : 's'}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>{showAbsent ? '▲' : '▼'}</span>
              </button>
              {showAbsent && (
                <div style={{ padding: '4px 14px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: '1px solid var(--border, #2e3040)' }}>
                  {absent.map(v => (
                    <span key={v.id} style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: '3px 10px', fontFamily: 'var(--font-mono, monospace)' }}>{v.full_name}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {sharing && <ShareSheet title="Vendor punch link" subtitle="Vendors check in / out here" url={attendUrl()} onClose={() => setSharing(false)} />}
    </div>
  )
}
