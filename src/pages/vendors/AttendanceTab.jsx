import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import ShareSheet from '../../components/vendor/ShareSheet'
import { attendUrl, fmtTime, fmtDate, fmtDuration, todayStr, initials, avatarColor } from '../../utils/vendorHub'

const avatarUrl = (path) => {
  if (!path) return null
  try { return supabase.storage.from('vendor-avatars').getPublicUrl(path).data.publicUrl } catch { return null }
}
const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`

// ── summarise one vendor's punches for the day (kind-aware) ──────────────────
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
  const last = list[list.length - 1]
  return { firstIn, lastOut, status: (open.regular != null || open.overtime != null) ? 'on_site' : 'checked_out', regMs, otMs, site: (firstIn && firstIn.pid) || last.pid || null }
}

// ── avatar (small) ──────────────────────────────────────────────────────────
function Ava({ v, size = 34 }) {
  const name = (v && v.full_name) || '?'
  const url = v && avatarUrl(v.avatar_path)
  return url
    ? <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border, #2e3040)' }} />
    : <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(name) + '22', color: avatarColor(name), fontWeight: 700, fontSize: size * 0.38, fontFamily: 'var(--font-mono, monospace)', border: `1px solid ${avatarColor(name)}55` }}>{initials(name)}</span>
}

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ flex: 1, padding: '12px 10px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: 'var(--font-mono, monospace)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── location line (coords + accuracy + map link) ────────────────────────────
function Loc({ p }) {
  if (p.lat == null || p.lng == null) return <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>no location</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
      📍 {Number(p.lat).toFixed(4)},{Number(p.lng).toFixed(4)} · ±{Math.round(p.accuracy || 0)}m
      <a href={mapsLink(p.lat, p.lng)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--accent, #c8963e)', textDecoration: 'none' }}>map ↗</a>
    </span>
  )
}

function PunchTag({ p, big }) {
  const inn = p.punch_type === 'in'
  const ot = (p.kind || 'regular') === 'overtime'
  const c = inn ? (ot ? '#5b8def' : 'var(--green, #3dba7a)') : 'var(--text-muted, #6b6d82)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: big ? 12 : 11, fontWeight: 700, color: c, fontFamily: 'var(--font-mono, monospace)' }}>{inn ? 'IN' : 'OUT'}</span>
      {ot && <span style={{ fontSize: 9, color: '#5b8def', border: '1px solid #5b8def55', borderRadius: 4, padding: '0 4px', fontFamily: 'var(--font-mono, monospace)' }}>OT</span>}
    </span>
  )
}

// ── one live-feed event ─────────────────────────────────────────────────────
function FeedRow({ p, siteLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
      <Ava v={p.vendor} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.vendor ? p.vendor.full_name : 'Unknown'}</span>
          <PunchTag p={p} />
        </div>
        <div style={{ marginTop: 2 }}><Loc p={p} /></div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtTime(p.punched_at)}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{siteLabel || p.pid || ''}</div>
      </div>
    </div>
  )
}

// ── one vendor roster row ───────────────────────────────────────────────────
function RosterRow({ s, siteLabel, onOpen }) {
  const on = s.status === 'on_site'
  const color = on ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)'
  return (
    <button type="button" onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '11px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
      <Ava v={s.vendor} size={36} />
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
    </button>
  )
}

// ── vendor day detail (bottom sheet): all punches + locations ───────────────
function VendorDayDetail({ s, dateLabel, siteMap, onClose }) {
  const on = s.status === 'on_site'
  const color = on ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)'
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, margin: '0 auto', background: 'var(--bg-panel, #1e2028)', borderRadius: '16px 16px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.22s ease-out' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 6px', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 18px 14px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          <Ava v={s.vendor} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>{s.trade} · {dateLabel}</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 10, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{on ? 'On site' : 'Checked out'}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '12px 18px', flexShrink: 0 }}>
          <Tile label="Regular" value={fmtDuration(s.regMs)} color="var(--green, #3dba7a)" />
          <Tile label="Overtime" value={fmtDuration(s.otMs)} color="#5b8def" />
          <Tile label="Punches" value={s.punches.length} color="var(--text, #e8e8f0)" />
        </div>

        <div style={{ overflowY: 'auto', padding: '0 18px 18px', flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 0 2px' }}>Punch log</div>
          {[...s.punches].reverse().map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0, background: p.punch_type === 'in' ? ((p.kind || 'regular') === 'overtime' ? '#5b8def' : 'var(--green, #3dba7a)') : 'var(--text-muted, #6b6d82)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <PunchTag p={p} big />
                  <span style={{ fontSize: 12, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtTime(p.punched_at)}</span>
                  {p.pid && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>· {siteMap[p.pid] || p.pid}</span>}
                </div>
                <div style={{ marginTop: 3 }}><Loc p={p} /></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AttendanceTab() {
  const [date, setDate] = useState(todayStr())
  const [view, setView] = useState('feed')
  const [punches, setPunches] = useState(null)
  const [approved, setApproved] = useState([])
  const [siteMap, setSiteMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState(false)
  const [selected, setSelected] = useState(null)   // vendor summary for detail sheet

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const start = new Date(`${date}T00:00:00`)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    const [pRes, vRes, sRes] = await Promise.all([
      supabase.from('vendor_attendance')
        .select('*, vendor:vendors(full_name,trade,pod,vendor_code,avatar_path)')
        .gte('punched_at', start.toISOString()).lt('punched_at', end.toISOString())
        .order('punched_at', { ascending: true }),
      supabase.from('vendors').select('id,full_name,trade,pod,vendor_code').eq('status', 'approved'),
      supabase.rpc('attend_sites'),
    ])
    const e = pRes.error || vRes.error
    if (e) { setError(e.message); setPunches(null) }
    else {
      setPunches(pRes.data); setApproved(vRes.data || [])
      const map = {}; for (const s of sRes.data || []) map[s.pid] = s.label
      setSiteMap(map)
    }
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  // realtime: any new punch → refresh (drives the live feed)
  useEffect(() => {
    const ch = supabase.channel('attendance-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vendor_attendance' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // group punches by vendor → summaries
  const byVendor = {}
  for (const p of punches || []) { (byVendor[p.vendor_id] = byVendor[p.vendor_id] || []).push(p) }
  const summaries = Object.entries(byVendor).map(([vid, list]) => {
    const s = summarize(list); const v = list[0].vendor || {}
    return { vid, name: v.full_name || 'Unknown', trade: v.trade || '', vendor: v, punches: list, ...s }
  }).sort((a, b) => (a.status === b.status ? 0 : a.status === 'on_site' ? -1 : 1))

  const feed = [...(punches || [])].reverse()   // newest first
  const onSite = summaries.filter(s => s.status === 'on_site').length
  const out = summaries.filter(s => s.status === 'checked_out').length
  const punchedIds = new Set(Object.keys(byVendor))
  const absent = approved.filter(v => !punchedIds.has(v.id)).length
  const totalReg = summaries.reduce((a, s) => a + s.regMs, 0)
  const totalOt = summaries.reduce((a, s) => a + s.otMs, 0)
  const isToday = date === todayStr()
  const dateLabel = fmtDate(`${date}T12:00:00`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <Tile label="Not marked" value={absent} color="var(--amber, #c8963e)" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>
            <span>Logged: <b style={{ color: 'var(--green, #3dba7a)' }}>{fmtDuration(totalReg)}</b> regular</span>
            <span><b style={{ color: '#5b8def' }}>{fmtDuration(totalOt)}</b> overtime</span>
          </div>

          {/* view toggle */}
          <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
            {[{ k: 'feed', l: 'Live feed' }, { k: 'roster', l: 'By vendor' }].map(o => {
              const on = view === o.k
              return <button key={o.k} type="button" onClick={() => setView(o.k)} style={{ flex: 1, padding: '9px 8px', fontSize: 13, fontWeight: on ? 700 : 500, border: 'none', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--bg-input, #252731)' : 'transparent', color: on ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', boxShadow: on ? 'inset 0 0 0 1px var(--border, #2e3040)' : 'none' }}>{o.l}</button>
            })}
          </div>

          {/* ── LIVE FEED ─────────────────────────────────────────────────── */}
          {view === 'feed' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: isToday ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{isToday ? 'Live' : dateLabel}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{feed.length} event{feed.length === 1 ? '' : 's'}</span>
              </div>
              {feed.length === 0
                ? <div style={{ padding: '30px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No punches {isToday ? 'yet today' : 'on this day'}.</div>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {feed.map((p, i) => <FeedRow key={p.id || i} p={p} siteLabel={p.pid ? (siteMap[p.pid] || p.pid) : ''} />)}
                  </div>}
            </>
          )}

          {/* ── BY VENDOR ─────────────────────────────────────────────────── */}
          {view === 'roster' && (
            summaries.length === 0
              ? <div style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
                  <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No attendance {isToday ? 'yet today' : 'on this day'}</div>
                </div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {summaries.map(s => <RosterRow key={s.vid} s={s} siteLabel={s.site ? (siteMap[s.site] || s.site) : ''} onOpen={() => setSelected(s)} />)}
                </div>
          )}
        </>
      )}

      {selected && <VendorDayDetail s={selected} dateLabel={dateLabel} siteMap={siteMap} onClose={() => setSelected(null)} />}
      {sharing && <ShareSheet title="Vendor punch link" subtitle="Vendors check in / out here" url={attendUrl()} onClose={() => setSharing(false)} />}
    </div>
  )
}
