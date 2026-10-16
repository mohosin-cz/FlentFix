import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'

// Your day, as a briefing rather than a queue. The same state Home shows,
// shaped by your_day_digest() into one sentence and five short lists, with a
// "copy as text" that drops a WhatsApp-ready plain-text version on the
// clipboard — the daily "what's happening" message, written by the system.

const MONO = 'var(--font-mono, monospace)'
const SANS = 'var(--font-sans, Poppins, sans-serif)'
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const n = (k, one, many) => `${k} ${k === 1 ? one : (many || one + 's')}`

function ago(since, ageDays) {
  if (ageDays == null) return ''
  if (ageDays === 0) return 'today'
  if (ageDays === 1) return 'yesterday'
  if (ageDays < 7 && since) return `since ${WEEKDAYS[new Date(since).getDay()]}`
  if (ageDays < 30) return `${ageDays} days`
  if (ageDays < 60) return 'over a month'
  return `${Math.round(ageDays / 30)} months`
}

// The sentence. "You have 4 things to do, 3 are waiting on landlords, 1 is going wrong."
function sentence(c, team) {
  if (!c) return ''
  const who = team ? 'The team has' : 'You have'
  const parts = []
  parts.push(`${who} ${n(c.needs_you, 'thing', 'things')} to do`)
  if (c.today > 0) parts.push(`${n(c.today, 'vendor or handover is', 'vendors or handovers are')} on site today`)
  if (c.waiting_landlord > 0) parts.push(`${c.waiting_landlord} ${c.waiting_landlord === 1 ? 'is' : 'are'} waiting on landlords`)
  if (c.waiting_vendor > 0) parts.push(`${c.waiting_vendor} on vendors`)
  parts.push(c.going_wrong > 0 ? `${c.going_wrong} ${c.going_wrong === 1 ? 'is' : 'are'} going wrong` : 'nothing is going wrong')
  if (parts.length === 1) return parts[0] + '.'
  return parts.slice(0, -1).join(', ') + (parts.length > 2 ? ', and ' : ' and ') + parts[parts.length - 1] + '.'
}

// Plain text for the clipboard. Bullets and short lines; WhatsApp eats markdown.
function asText(d, team, name) {
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  const L = []
  L.push(`${team ? 'Team' : name ? name + "'s" : 'Your'} day — ${date}`)
  L.push(sentence(d.greeting_counts, team))
  const block = (title, rows, fmt) => {
    if (!rows || rows.length === 0) return
    L.push('')
    L.push(title.toUpperCase())
    for (const r of rows) L.push('• ' + fmt(r))
  }
  const pn = r => `${r.pid}${r.property_name ? ' ' + r.property_name : ''}`
  block('Do', d.needs_you, r => `${pn(r)} — ${r.action}${r.urgency === 'overdue' ? ` (overdue, ${ago(null, r.age_days)})` : ''}`)
  block('On site today', d.today, r => `${pn(r)} — ${r.label}`)
  block('Going wrong', d.going_wrong, r => `${pn(r)} — ${r.headline}${r.overdue_by > 0 ? ` (over by ${r.overdue_by}d)` : ''}`)
  block('Waiting on others', d.waiting, r => `${pn(r)} — ${r.label} — ${r.blocked_on} · ${ago(null, r.age_days)}`)
  block('Moved recently', d.moved_recently, r => `${pn(r)} → ${r.label}`)
  L.push('')
  L.push('— Pulse')
  return L.join('\n')
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'; ta.style.top = '-1000px'
    document.body.appendChild(ta)
    ta.select(); ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

function useDigest(scope) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase.rpc('your_day_digest', { p_scope: scope })
    if (error) { setState(s => ({ ...s, loading: false, error: error.message })); return }
    setState({ loading: false, error: null, data: data || {} })
  }, [scope])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

// ─── pieces ──────────────────────────────────────────────────────────────────

const panel = { background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }

function Line({ pid, name, text, meta, tone, onGo, last }) {
  return (
    <button type="button" onClick={onGo} disabled={!onGo}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '8px 14px', textAlign: 'left', background: 'none', border: 'none',
               borderBottom: last ? 'none' : '1px solid var(--border, #2e3040)', cursor: onGo ? 'pointer' : 'default', color: 'var(--text, #e8e8f0)', fontFamily: SANS,
               WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, lineHeight: 1.35, wordBreak: 'break-word' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--accent, #c8963e)', fontWeight: 700 }}>{pid}</span>
          {name && <span style={{ color: 'var(--text-dim, #9394a8)', fontSize: 12 }}> {name}</span>}
          {' — '}{text}
        </span>
        {meta && <span style={{ display: 'block', fontFamily: MONO, fontSize: 11, color: tone || 'var(--text-muted, #6b6d82)', marginTop: 2 }}>{meta}</span>}
      </span>
      {onGo && <span aria-hidden="true" style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 18, flexShrink: 0 }}>›</span>}
    </button>
  )
}

function Para({ lead, children, tone }) {
  return (
    <section style={{ marginTop: 24 }}>
      <p style={{ margin: '0 0 10px', fontSize: 15, lineHeight: 1.5, color: tone || 'var(--text, #e8e8f0)' }}>{lead}</p>
      {children}
    </section>
  )
}

function Skeleton() {
  return (
    <div aria-busy="true" style={{ marginTop: 18 }}>
      {[0, 1, 2].map(i => <div key={i} style={{ height: 14, width: `${80 - i * 18}%`, borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.6, marginBottom: 12 }} />)}
      <div style={{ ...panel, marginTop: 18, height: 140, opacity: 0.6 }} />
    </div>
  )
}

const CAP = 8

export default function Digest() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const phone = useIsMobile(640)
  const email = session?.user?.email ?? ''
  const name = session?.user?.user_metadata?.full_name?.split(' ')[0] ?? email.split('@')[0]

  const [team, setTeam] = useState(() => { try { return localStorage.getItem('home2.team') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('home2.team', team ? '1' : '0') } catch { /* private window */ } }, [team])
  const { loading, error, data, reload } = useDigest(team ? 'all' : 'me')

  const [copied, setCopied] = useState(null) // null · 'ok' · 'fail'
  const [showText, setShowText] = useState(false)
  const taRef = useRef(null)
  const text = useMemo(() => (data ? asText(data, team, name) : ''), [data, team, name])
  const copy = async () => {
    const ok = await copyText(text)
    setCopied(ok ? 'ok' : 'fail')
    if (!ok) setShowText(true)
    setTimeout(() => setCopied(null), 2200)
  }
  useEffect(() => { if (showText && taRef.current) { taRef.current.focus(); taRef.current.select() } }, [showText])

  const go = (route) => route && navigate(route)
  const c = data?.greeting_counts
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  // the lists, capped — the sentence carries the totals
  const needs = data?.needs_you || []
  const today = data?.today || []
  const wrong = data?.going_wrong || []
  const landlord = (data?.waiting || []).filter(w => w.blocked_on === 'landlord')
  const vendor = (data?.waiting || []).filter(w => w.blocked_on === 'vendor')
  const moved = data?.moved_recently || []

  const more = (list, route, label) => list.length > CAP && (
    <button type="button" onClick={() => navigate(route)} style={{ width: '100%', minHeight: 40, background: 'var(--bg-input, #252731)', border: 'none', borderTop: '1px solid var(--border, #2e3040)', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
      +{list.length - CAP} more · {label} →
    </button>
  )

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '0 16px', paddingTop: 'env(safe-area-inset-top, 0px)',
                       background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
        <button type="button" onClick={() => navigate('/home2')} title="Home"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 14, fontWeight: 700, color: 'var(--accent, #c8963e)', letterSpacing: '0.04em' }}>
          pulse
        </button>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>your day</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 2 }}>
          {[['me', 'Mine'], ['all', 'Team']].map(([k, l]) => {
            const on = team ? k === 'all' : k === 'me'
            return (
              <button key={k} type="button" onClick={() => setTeam(k === 'all')} aria-pressed={on}
                style={{ minHeight: 34, padding: '0 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 11.5, fontWeight: 700,
                         background: on ? 'var(--accent, #c8963e)' : 'transparent', color: on ? 'var(--on-accent, #16171f)' : 'var(--text-dim, #9394a8)',
                         WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
                {l}
              </button>
            )
          })}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: phone ? '18px 16px calc(32px + env(safe-area-inset-bottom, 0px))' : '26px 24px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{date}</div>
            <div style={{ fontSize: phone ? 20 : 24, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em', marginTop: 4 }}>
              {team ? "The team's day" : `${name ? name + "'s" : 'Your'} day`}
            </div>
          </div>
          <button type="button" onClick={copy} disabled={!data}
            style={{ minHeight: 40, padding: '0 14px', borderRadius: 9, border: `1px solid ${copied === 'ok' ? 'var(--green, #3dba7a)' : 'var(--border, #2e3040)'}`,
                     background: copied === 'ok' ? 'rgba(61,186,122,0.12)' : 'var(--bg-input, #252731)', color: copied === 'ok' ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)',
                     fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: data ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
            {copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Select & copy below' : 'Copy as text'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(224,92,106,0.32)', background: 'rgba(224,92,106,0.10)', fontFamily: MONO, fontSize: 12, color: 'var(--red, #e05c6a)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}>Couldn't build the digest — {error}</span>
            <button type="button" onClick={reload} style={{ minHeight: 34, padding: '0 12px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {loading && !data && <Skeleton />}

        {data && (
          <>
            {/* the sentence */}
            <p style={{ fontSize: phone ? 17 : 19, lineHeight: 1.5, margin: '18px 0 0', fontWeight: 500 }}>
              {c?.total === 0
                ? (team ? 'There are no live properties.' : 'Nothing is assigned to you today.')
                : sentence(c, team)}
            </p>

            {showText && (
              <textarea ref={taRef} readOnly value={text} rows={10}
                style={{ marginTop: 14, width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontFamily: MONO, fontSize: 12, lineHeight: 1.5, resize: 'vertical' }} />
            )}

            {/* Going wrong comes first when there is any — it is the thing to read before coffee. */}
            {wrong.length > 0 && (
              <Para tone="var(--red, #e05c6a)" lead={`${n(wrong.length, 'thing is', 'things are')} going wrong${wrong.filter(w => w.severity === 'critical').length ? `, ${wrong.filter(w => w.severity === 'critical').length} critical` : ''}.`}>
                <div style={{ ...panel, borderColor: 'rgba(224,92,106,0.35)' }}>
                  {wrong.slice(0, CAP).map((r, i) => (
                    <Line key={`${r.category}:${r.pid}:${i}`} pid={r.pid} name={r.property_name} text={r.headline}
                      meta={`${r.category.replace(/_/g, ' ')} · ${r.overdue_by > 0 ? `over by ${r.overdue_by}d` : ago(null, r.age_days)}`} tone="var(--red, #e05c6a)"
                      onGo={() => go(r.route)} last={i === Math.min(wrong.length, CAP) - 1 && wrong.length <= CAP} />
                  ))}
                  {more(wrong, '/alerts', 'alert window')}
                </div>
              </Para>
            )}

            <Para lead={needs.length === 0 ? `Nothing needs ${team ? 'the team' : 'you'} right now.` : `To do${needs.length > CAP ? `, the ${CAP} most pressing of ${needs.length}` : ''}:`}>
              {needs.length > 0 && (
                <div style={panel}>
                  {needs.slice(0, CAP).map((r, i) => (
                    <Line key={r.pid} pid={r.pid} name={r.property_name} text={r.action}
                      meta={`${r.label} · ${ago(null, r.age_days)}`} tone={r.urgency === 'overdue' ? 'var(--red, #e05c6a)' : undefined}
                      onGo={() => go(r.route)} last={i === Math.min(needs.length, CAP) - 1 && needs.length <= CAP} />
                  ))}
                  {more(needs, '/home2', 'home')}
                </div>
              )}
            </Para>

            {today.length > 0 && (
              <Para lead={`On site today:`}>
                <div style={panel}>
                  {today.map((r, i) => <Line key={r.pid + r.label} pid={r.pid} name={r.property_name} text={r.label} meta={r.action} onGo={() => go(r.route)} last={i === today.length - 1} />)}
                </div>
              </Para>
            )}

            <Para lead={landlord.length + vendor.length === 0 ? 'Nobody is holding anything up.' : `Waiting on others — ${n(landlord.length, 'landlord')}, ${n(vendor.length, 'vendor')}. Not ${team ? "the team's" : 'yours'} to do; ages showing.`}>
              {landlord.length + vendor.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 12 }}>
                  {[['Landlords', landlord], ['Vendors', vendor]].map(([lane, items]) => (
                    <div key={lane} style={panel}>
                      <div style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, borderBottom: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)' }}>
                        {lane} · {items.length}
                      </div>
                      {items.length === 0
                        ? <div style={{ padding: 14, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>none</div>
                        : items.slice(0, CAP).map((r, i) => (
                            <Line key={r.pid + r.label} pid={r.pid} name={r.property_name} text={r.label}
                              meta={`${ago(null, r.age_days)}${r.urgency === 'overdue' ? ' · too long' : ''}`} tone={r.urgency === 'overdue' ? 'var(--red, #e05c6a)' : undefined}
                              onGo={() => go(r.route)} last={i === Math.min(items.length, CAP) - 1 && items.length <= CAP} />
                          ))}
                      {more(items, '/home2', 'home')}
                    </div>
                  ))}
                </div>
              )}
            </Para>

            <Para lead={moved.length === 0
              ? `Nothing crossed a stage since ${data.baseline ? new Date(data.baseline).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'yesterday'}.`
              : `${n(moved.length, 'thing', 'things')} moved since ${data.baseline ? new Date(data.baseline).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'yesterday'}:`}>
              {moved.length > 0 && (
                <div style={panel}>
                  {moved.slice(0, CAP).map((r, i) => (
                    <Line key={r.pid + r.label} pid={r.pid} name={r.property_name} text={`→ ${r.label}`}
                      meta={`${r.blocked_on === 'setup_ops' ? 'with you' : 'with ' + r.blocked_on} · ${ago(r.since, r.age_days)}`}
                      onGo={() => go(r.route)} last={i === Math.min(moved.length, CAP) - 1 && moved.length <= CAP} />
                  ))}
                  {more(moved, '/home2', 'home')}
                </div>
              )}
            </Para>
          </>
        )}

        <div style={{ marginTop: 32, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textAlign: 'center' }}>
          Built live from the journey engine ·{' '}
          <button type="button" onClick={() => navigate('/alerts')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>alert window</button>
          {' · '}
          <button type="button" onClick={() => navigate('/home2')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 10.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>home</button>
        </div>
      </main>
    </div>
  )
}
