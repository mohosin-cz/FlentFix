import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import ShareSheet from '../../components/vendor/ShareSheet'
import { attendUrl, fmtTime, fmtDate, fmtDuration, fmtElapsed, fmtBreakLeft, todayStr, initials, avatarColor } from '../../utils/vendorHub'
import { summarize, openBreakOf, breakTotals, fmtMs, BREAK_MINUTES, BREAK_LABEL } from '../../utils/attendance'

const avatarUrl = (path) => {
  if (!path) return null
  try { return supabase.storage.from('vendor-avatars').getPublicUrl(path).data.publicUrl } catch { return null }
}
const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`
const shiftDay = (d, delta) => { const dt = new Date(`${d}T12:00:00`); dt.setDate(dt.getDate() + delta); const s = dt.toISOString().slice(0, 10); const t = todayStr(); return s > t ? t : s }
const dayNav = { width: 34, minWidth: 34, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontSize: 15, fontFamily: 'var(--font-mono, monospace)' }

// ── summarise one vendor's punches for the day (kind-aware) ──────────────────
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
// pair punches into in→out sessions (per vendor, per kind), newest first
function buildSessions(punches) {
  const byVK = {}
  for (const p of punches) { const key = `${p.vendor_id}|${p.kind || 'regular'}`; (byVK[key] = byVK[key] || []).push(p) }
  const out = []
  for (const key of Object.keys(byVK)) {
    const list = [...byVK[key]].sort((a, b) => new Date(a.punched_at) - new Date(b.punched_at))
    let openIn = null
    for (const p of list) {
      if (p.punch_type === 'in') { if (openIn) out.push({ vendor: openIn.vendor, kind: openIn.kind || 'regular', inP: openIn, outP: null }); openIn = p }
      else if (openIn) { out.push({ vendor: openIn.vendor, kind: openIn.kind || 'regular', inP: openIn, outP: p }); openIn = null }
      else out.push({ vendor: p.vendor, kind: p.kind || 'regular', inP: null, outP: p })
    }
    if (openIn) out.push({ vendor: openIn.vendor, kind: openIn.kind || 'regular', inP: openIn, outP: null })
  }
  return out.sort((a, b) => new Date((b.outP || b.inP).punched_at) - new Date((a.outP || a.inP).punched_at))
}

function PunchLine({ label, p, ot }) {
  const inn = label === 'IN'
  const c = inn ? (ot ? '#5b8def' : 'var(--green, #3dba7a)') : 'var(--text-muted, #6b6d82)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: 'var(--font-mono, monospace)', minWidth: 28 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtTime(p.punched_at)}</span>
      {p.selfie_path && <a href={avatarUrl(p.selfie_path)} target="_blank" rel="noreferrer" title="Punch selfie" style={{ display: 'inline-flex', lineHeight: 0 }}>
        <img src={avatarUrl(p.selfie_path)} alt="selfie" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border, #2e3040)' }} />
      </a>}
      <Loc p={p} />
    </div>
  )
}

// prominent PID badge (loud, top of a tile)
function PidBadge({ pid, siteMap }) {
  if (!pid) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, padding: '6px 11px', background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.32)', borderRadius: 8, width: 'fit-content' }}>
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>PID</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.02em' }}>{(siteMap && siteMap[pid]) || pid}</span>
    </div>
  )
}

// one session (check-in + its check-out) as a tile
function SessionTile({ ses, siteMap, brk, now }) {
  const ot = ses.kind === 'overtime'
  const open = !ses.outP
  const v = ses.vendor
  const pid = (ses.inP && ses.inP.pid) || (ses.outP && ses.outP.pid) || null
  const dur = (ses.inP && ses.outP) ? new Date(ses.outP.punched_at).getTime() - new Date(ses.inP.punched_at).getTime() : null
  const statusC = ot ? '#5b8def' : 'var(--green, #3dba7a)'
  const onBreak = open && !!brk
  const brkOver = onBreak ? Math.max(0, (now - new Date(brk.started_at).getTime()) - (BREAK_MINUTES[brk.kind] || 0) * 60000) : 0
  const brkTone = brkOver > 0 ? 'var(--red, #e05c6a)' : 'var(--accent, #c8963e)'
  return (
    <div style={{ padding: '12px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12 }}>
      <PidBadge pid={pid} siteMap={siteMap} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <Ava v={v} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v ? v.full_name : 'Unknown'}</span>
            {ot && <span style={{ fontSize: 9, color: '#5b8def', border: '1px solid #5b8def55', borderRadius: 4, padding: '0 5px', fontFamily: 'var(--font-mono, monospace)' }}>OT</span>}
          </div>
          {v && v.trade && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{v.trade}</span>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {open
            ? <>
                {/* The same seconds the vendor is watching on their own phone.
                    This used to be a static "On site" pill, so the board could
                    not tell you how long someone had been there without doing
                    the arithmetic off the IN time. */}
                <div style={{ fontSize: 15, fontWeight: 700, color: onBreak ? brkTone : statusC, fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
                  {fmtElapsed(now - new Date(ses.inP.punched_at).getTime())}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 1 }}>
                  {ot ? 'overtime' : 'on site'}
                </div>
              </>
            : <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDuration(dur)}</span>}
        </div>
      </div>
      {ses.inP && <PunchLine label="IN" p={ses.inP} ot={ot} />}
      {ses.outP
        ? <PunchLine label="OUT" p={ses.outP} ot={ot} />
        : onBreak
          ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '7px 10px', background: brkOver > 0 ? 'rgba(224,92,106,0.12)' : 'rgba(200,150,62,0.10)', border: `1px solid ${brkOver > 0 ? 'rgba(224,92,106,0.40)' : 'rgba(200,150,62,0.30)'}`, borderRadius: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: brkTone, fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                On {BREAK_LABEL[brk.kind].toLowerCase()}
              </span>
              <span style={{ marginInlineStart: 'auto', fontSize: 12, fontWeight: 700, color: brkTone, fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
                {fmtBreakLeft({ ...brk, minutes: BREAK_MINUTES[brk.kind] }, now)}
              </span>
              {/* fmtBreakLeft returns +mm:ss once the allowance is gone, so the
                  word after it has to turn too — "+20:02 left" reads as twenty
                  minutes in hand when it means twenty minutes over. */}
              <span style={{ fontSize: 10, color: brkOver > 0 ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{brkOver > 0 ? 'over' : 'left'}</span>
            </div>
          : <div style={{ marginTop: 6, fontSize: 11, color: statusC, fontFamily: 'var(--font-mono, monospace)' }}>OUT&nbsp;&nbsp;— still on site</div>}
    </div>
  )
}

// ── one vendor roster row ───────────────────────────────────────────────────
function RosterRow({ s, siteLabel, onOpen, now }) {
  const on = s.status === 'on_site'
  const onBreak = on && !!s.brk
  // A break is its own state, not a flavour of "on site": the difference is
  // exactly what a supervisor looking at this board wants to know.
  const breakOver = onBreak && s.bt.open && s.bt.open.overMs > 0
  const color = breakOver ? 'var(--red, #e05c6a)' : onBreak ? 'var(--accent, #c8963e)' : on ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)'
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
        <span style={{ fontSize: 10, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 10, padding: '2px 8px', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>
          {onBreak ? `On ${BREAK_LABEL[s.brk.kind].toLowerCase()}` : on ? 'On site' : 'Checked out'}
        </span>
        {onBreak && (
          <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtBreakLeft({ ...s.brk, minutes: BREAK_MINUTES[s.brk.kind] }, now)} {breakOver ? 'over' : 'left'}
          </span>
        )}
        <span style={{ fontSize: 11, color: on ? 'var(--text, #e8e8f0)' : 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
          {on ? fmtElapsed(s.regMs + s.otMs) : fmtDuration(s.regMs)}
          {!on && s.otMs > 0 ? <span style={{ color: '#5b8def' }}> · OT {fmtDuration(s.otMs)}</span> : ''}
        </span>
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
          {/* Time on site includes the breaks inside it, so the break total is
              shown beside it rather than quietly deducted. Changing what a
              shift pays is a decision for payroll, not for a display — but
              nobody can make that decision from a number they cannot see. */}
          <Tile label="On break" value={fmtDuration(s.bt.takenMs)}
            sub={s.bt.overMs > 0 ? `+${fmtMs(s.bt.overMs)} over` : (s.bt.count ? 'within allowance' : null)}
            color={s.bt.overMs > 0 ? 'var(--red, #e05c6a)' : 'var(--text, #e8e8f0)'} />
        </div>

        <div style={{ overflowY: 'auto', padding: '0 18px 18px', flex: 1, minHeight: 0 }}>
          {s.bt.count > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 0 2px' }}>Breaks</div>
              {s.bt.rows.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border, #2e3040)', fontFamily: 'var(--font-mono, monospace)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: r.overMs > 0 ? 'var(--red, #e05c6a)' : r.open ? 'var(--accent, #c8963e)' : 'var(--green, #3dba7a)' }} />
                  <span style={{ width: 54, flexShrink: 0, fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{r.label}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--text-muted, #6b6d82)' }}>
                    {fmtTime(new Date(r.startedAt).toISOString())}
                    {r.endedAt ? ` – ${fmtTime(new Date(r.endedAt).toISOString())}` : ' – never ended'}
                    <span style={{ marginInlineStart: 8 }}>allowed {Math.round(r.allowedMs / 60000)}m</span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.overMs > 0 ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)' }}>
                    {fmtMs(r.takenMs)}{r.overMs > 0 ? ` +${fmtMs(r.overMs)}` : ''}
                  </span>
                </div>
              ))}
            </>
          )}
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
  const [breaks, setBreaks] = useState([])
  // A running shift is a number that changes every second. The board showed a
  // frozen one — or none at all — while the vendor's own phone counted up.
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const start = new Date(`${date}T00:00:00`)
    const end = new Date(start); end.setDate(end.getDate() + 1)
    const [pRes, vRes, sRes, bRes] = await Promise.all([
      supabase.from('vendor_attendance')
        .select('*, vendor:vendors(full_name,trade,pod,vendor_code,avatar_path)')
        .gte('punched_at', start.toISOString()).lt('punched_at', end.toISOString())
        .order('punched_at', { ascending: true }),
      supabase.from('vendors').select('id,full_name,trade,pod,vendor_code').eq('status', 'approved'),
      supabase.rpc('attend_sites'),
      supabase.from('vendor_breaks').select('*').eq('break_day', date),
    ])
    const e = pRes.error || vRes.error
    if (e) { setError(e.message); setPunches(null) }
    else {
      setPunches(pRes.data); setApproved(vRes.data || [])
      const map = {}; for (const s of sRes.data || []) map[s.pid] = s.label
      setSiteMap(map)
      setBreaks(bRes.data || [])
    }
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  // realtime: a punch, or a break starting or ending → refresh.
  //
  // Breaks need UPDATE as well as INSERT: starting one inserts a row, ending
  // one sets ended_at on it. Listening only for inserts would show someone
  // going on lunch and never coming back from it.
  useEffect(() => {
    const ch = supabase.channel('attendance-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vendor_attendance' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_breaks' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // group punches by vendor → summaries.
  // `now` is threaded through so an open shift counts up rather than sitting
  // at the value it had when the page loaded.
  const byVendor = {}
  for (const p of punches || []) { (byVendor[p.vendor_id] = byVendor[p.vendor_id] || []).push(p) }
  const summaries = Object.entries(byVendor).map(([vid, list]) => {
    const s = summarize(list, now); const v = list[0].vendor || {}
    return { vid, name: v.full_name || 'Unknown', trade: v.trade || '', vendor: v, punches: list, brk: openBreakOf(breaks, vid), bt: breakTotals((breaks || []).filter(b => b.vendor_id === vid), now), ...s }
  }).sort((a, b) => (a.status === b.status ? 0 : a.status === 'on_site' ? -1 : 1))

  const anyOnSite = summaries.some(s => s.status === 'on_site')
  const isTodayLive = date === todayStr()

  // One second, and only while something is actually running on today's board.
  // A ticker on a past day, or on a day where everyone has gone home, is a
  // re-render a second for a number that cannot change.
  useEffect(() => {
    if (!isTodayLive || !anyOnSite) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [isTodayLive, anyOnSite])

  const sessions = buildSessions(punches || [])   // in→out pairs, newest first
  const onSite = summaries.filter(s => s.status === 'on_site').length
  const onBreakNow = summaries.filter(s => s.status === 'on_site' && s.brk).length
  // Anyone over their allowance today — running long now, or finished long and
  // now on the record. This is the notification: it sits at the top of the
  // board staff already watch, and the realtime subscription keeps it current.
  const overrun = summaries.filter(s => s.bt.overMs > 0)
  const out = summaries.filter(s => s.status === 'checked_out').length
  const punchedIds = new Set(Object.keys(byVendor))
  const absent = approved.filter(v => !punchedIds.has(v.id)).length
  const totalReg = summaries.reduce((a, s) => a + s.regMs, 0)
  const totalOt = summaries.reduce((a, s) => a + s.otMs, 0)
  const isToday = date === todayStr()
  const dateLabel = fmtDate(`${date}T12:00:00`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" onClick={() => setDate(shiftDay(date, -1))} style={dayNav}>‹</button>
        <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)}
          style={{ flex: '0 1 auto', width: 138, padding: '8px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'var(--font-mono, monospace)' }} />
        <button type="button" onClick={() => setDate(shiftDay(date, 1))} disabled={isToday} style={{ ...dayNav, opacity: isToday ? 0.35 : 1 }}>›</button>
        {!isToday && <button type="button" onClick={() => setDate(todayStr())} style={{ ...dayNav, width: 'auto', padding: '0 10px', fontSize: 11 }}>Today</button>}
        <button type="button" onClick={() => setSharing(true)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 11px', background: 'rgba(200,150,62,0.10)', border: '1px solid var(--accent, #c8963e)', borderRadius: 8, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>⇱ Punch link</button>
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
            <Tile label={isToday ? 'On site now' : 'On site'} value={onSite} sub={onBreakNow > 0 ? `${onBreakNow} on break` : null} color="var(--green, #3dba7a)" />
            <Tile label="Checked out" value={out} color="var(--text-dim, #9394a8)" />
            <Tile label="Not marked" value={absent} color="var(--amber, #c8963e)" />
          </div>
          {overrun.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '11px 13px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.38)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>⚠</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em' }}>
                  {overrun.length} break{overrun.length === 1 ? '' : 's'} over allowance
                </span>
              </div>
              {overrun.map(s => (
                <div key={s.vid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontFamily: 'var(--font-mono, monospace)' }}>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ color: 'var(--text-muted, #6b6d82)' }}>
                    {s.bt.over.map(r => r.label.toLowerCase()).join(', ')}
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--red, #e05c6a)', fontVariantNumeric: 'tabular-nums' }}>
                    +{fmtMs(s.bt.overMs)}{s.bt.open && s.bt.open.overMs > 0 ? ' · still out' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

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
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{sessions.length} session{sessions.length === 1 ? '' : 's'}</span>
              </div>
              {sessions.length === 0
                ? <div style={{ padding: '30px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No punches {isToday ? 'yet today' : 'on this day'}.</div>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {sessions.map((ses, i) => <SessionTile key={(ses.inP || ses.outP).id || i} ses={ses} siteMap={siteMap} now={now}
                      brk={openBreakOf(breaks, ses.vendor && (ses.inP || ses.outP).vendor_id)} />)}
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
                  {summaries.map(s => <RosterRow key={s.vid} s={s} now={now} siteLabel={s.site ? (siteMap[s.site] || s.site) : ''} onOpen={() => setSelected(s)} />)}
                </div>
          )}
        </>
      )}

      {selected && <VendorDayDetail s={selected} dateLabel={dateLabel} siteMap={siteMap} onClose={() => setSelected(null)} />}
      {sharing && <ShareSheet title="Vendor punch link" subtitle="Vendors check in / out here" url={attendUrl()} onClose={() => setSharing(false)} />}
    </div>
  )
}
