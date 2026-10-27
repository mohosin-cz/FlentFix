import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import SitePicker from './SitePicker'
import { fmtTime, fmtDuration } from '../../utils/vendorHub'

// Sent on to another property mid-shift: the vendor taps "Move", picks the
// next site the same way they picked the first, and taps once more. No
// selfie, no second check-in — it is the same shift, now somewhere else.
//
// Above the button, the day so far as a route: each site, when they got
// there, how long they stayed, and where they are now. That list is what
// they would otherwise have to remember and tell the office.

const MONO = 'var(--font-mono, monospace)'
const GREEN = 'var(--green, #6f9a7e)'

export default function SiteMove({ token, shift, tick, ot, onBreak, busy, onMove }) {
  const [moving, setMoving] = useState(false)
  const [to, setTo] = useState('')
  const [names, setNames] = useState({})
  const legs = shift ? shift.legs : []
  const here = legs.length ? legs[legs.length - 1] : null
  const tone = ot ? '#7f93b8' : GREEN

  // names for the PIDs on the route (their own sites — nothing else is shown)
  useEffect(() => {
    let alive = true
    supabase.rpc('attend_my_sites', { p_token: token }).then(({ data }) => {
      if (!alive || !data) return
      const m = {}; for (const s of data) m[s.pid] = s.name || s.label || ''
      setNames(m)
    })
    return () => { alive = false }
  }, [token, legs.length])

  if (!here) return null
  const same = to && here.pid && to.trim().toLowerCase() === String(here.pid).toLowerCase()

  async function go() {
    const ok = await onMove(to.trim())
    if (ok) { setMoving(false); setTo('') }
  }

  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 4px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
          {legs.length > 1 ? `Your sites · ${legs.length}` : 'Your site'}
        </span>
      </div>

      {/* the route, oldest first; the last one is where they are */}
      <ol style={{ listStyle: 'none', margin: 0, padding: '4px 14px 12px' }}>
        {legs.map((l, i) => {
          const now = l.open
          return (
            <li key={i} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', columnGap: 10, alignItems: 'start' }}>
              <span aria-hidden style={{ position: 'relative', display: 'flex', justifyContent: 'center', height: '100%' }}>
                <span style={{ width: now ? 10 : 8, height: now ? 10 : 8, borderRadius: 6, marginTop: now ? 5 : 6, background: now ? tone : 'var(--text-muted, #6b6d82)', boxShadow: now ? `0 0 0 3px ${ot ? 'rgba(127,147,184,0.25)' : 'rgba(111,154,126,0.25)'}` : 'none', zIndex: 1 }} />
                {i < legs.length - 1 && <span style={{ position: 'absolute', top: 14, bottom: -6, width: 2, background: 'var(--border, #2e3040)' }} />}
              </span>
              <div style={{ minWidth: 0, paddingBottom: i < legs.length - 1 ? 12 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: now ? 15 : 13.5, fontWeight: now ? 700 : 600, color: now ? 'var(--text, #e8e8f0)' : 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
                    PID {l.pid || '—'}
                  </span>
                  {now && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', color: tone, fontFamily: MONO }}>YOU ARE HERE</span>}
                </div>
                {names[l.pid] && <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names[l.pid]}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
                  {fmtTime(new Date(l.from).toISOString())}{l.open ? ' – now' : ` – ${fmtTime(new Date(l.to).toISOString())}`}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: now ? tone : 'var(--text-dim, #9394a8)', fontFamily: MONO, fontVariantNumeric: 'tabular-nums', paddingTop: 2 }}>
                {fmtDuration(l.open ? Math.max(0, tick - l.from) : l.ms)}
              </span>
            </li>
          )
        })}
      </ol>

      <div style={{ borderTop: '1px solid var(--border, #2e3040)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!moving ? (
          <button type="button" onClick={() => setMoving(true)} disabled={onBreak}
            style={{ minHeight: 50, borderRadius: 10, border: `1px solid ${onBreak ? 'var(--border, #2e3040)' : 'var(--accent, #c8963e)'}`, background: onBreak ? 'transparent' : 'rgba(200,150,62,0.12)', color: onBreak ? 'var(--text-muted, #6b6d82)' : 'var(--accent, #c8963e)', fontSize: 15, fontWeight: 700, fontFamily: MONO, cursor: onBreak ? 'not-allowed' : 'pointer' }}>
            {onBreak ? 'End your break to move' : '⇄  Move to another site'}
          </button>
        ) : (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Where are you going now?</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, marginTop: -6 }}>
              Leaving PID {here.pid || '—'}. Your shift carries on — no new check-in or photo.
            </div>
            <SitePicker token={token} value={to} onChange={setTo} />
            {same && <div style={{ fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>You are already at PID {here.pid} — pick the next site.</div>}
            <button type="button" onClick={go} disabled={!to.trim() || same || busy}
              style={{ minHeight: 52, borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700, fontFamily: MONO,
                background: !to.trim() || same ? 'var(--bg-input, #252731)' : tone, color: !to.trim() || same ? 'var(--text-muted, #6b6d82)' : '#0f1013',
                cursor: !to.trim() || same || busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Moving…' : to.trim() && !same ? `Move to PID ${to.trim()}` : 'Pick a site above'}
            </button>
            <button type="button" onClick={() => { setMoving(false); setTo('') }} disabled={busy}
              style={{ minHeight: 40, border: 'none', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 13, fontFamily: MONO, cursor: 'pointer' }}>
              Cancel — stay at PID {here.pid || '—'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
