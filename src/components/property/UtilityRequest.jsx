import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { HashScroll } from '../../hooks/useHashScroll'

// Planning utilities = asking the partners. One partner installs WiFi, another
// the RO; each gets a ready message — property, address, plan length, when it
// is needed — and the request is ticked here once sent. The address is the
// Google Maps link when Pulse has one, otherwise a blank line to fill in.
// Plans: 1, 3, 6, 9 or 12 months. "Not needed" takes a utility off the list
// (and off the setup-closure checks).

const MONO = 'var(--font-mono, monospace)'
const PLANS = [1, 3, 6, 9, 12]
const KINDS = [
  { key: 'wifi', label: 'WiFi', what: 'a WiFi connection', partner: 'WiFi partner' },
  { key: 'ro',   label: 'RO',   what: 'an RO water purifier', partner: 'RO partner' },
]
const fmtDay = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
const who = (e) => (e || '').split('@')[0] || 'someone'
const when = (at) => at ? new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''

function message(kind, prop, months, sender) {
  const setup = prop.setup_date
  const needBy = setup ? fmtDay(new Date(new Date(setup + 'T00:00:00').getTime() - 86400000).toLocaleDateString('en-CA')) : ''
  return [
    `Hi, we need ${kind.what} at a Flent home.`,
    '',
    `Property: ${prop.name || 'PID ' + prop.pid} (PID ${prop.pid})`,
    `Address: ${prop.maps_url || ''}`,
    prop.units ? `Units: ${prop.units}` : null,
    `Plan: ${months} month${months === 1 ? '' : 's'}`,
    setup ? `Needed by: ${needBy} (setup on ${fmtDay(setup)})` : 'Needed by: ',
    '',
    'Please confirm the installation date.',
    `— ${sender ? sender + ' from ' : ''}Flent`,
  ].filter(l => l !== null).join('\n')
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok
  } catch { return false }
}

function KindCard({ kind, prop, check, locked, sender, onDone }) {
  const [months, setMonths] = useState(null)
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => { if (months) setText(message(kind, prop, months, sender)) }, [months, kind, prop, sender])

  async function mark(m) {
    setBusy(true); setErr(null)
    const { data, error } = await supabase.rpc('property_request_utility', { p_pid: prop.pid, p_kind: kind.key, p_months: m })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMonths(null); setText(''); setCopied(false)
    onDone(data)
  }

  const requested = check?.requested_at
  const notNeeded = check?.not_needed
  const chip = (on) => ({ minHeight: 34, minWidth: 44, padding: '0 10px', borderRadius: 8, border: `1px solid ${on ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, background: on ? 'rgba(200,150,62,0.14)' : 'var(--bg-input, #252731)', color: on ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: 'pointer' })
  const btn = (primary) => ({ minHeight: 36, padding: '0 14px', borderRadius: 8, border: `1px solid ${primary ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, background: primary ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)', color: primary ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' })

  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{kind.label}</span>
        {requested && !notNeeded && <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--green, #3dba7a)' }}>✓ requested · {check.plan_months}-month plan · {who(check.requested_by)}, {when(requested)}</span>}
        {notNeeded && <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--text-muted, #6b6d82)' }}>not needed · {who(check.requested_by)}</span>}
        {!requested && <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--amber, #c8963e)' }}>not requested yet</span>}
        {requested && !locked && (
          <button type="button" disabled={busy} onClick={() => mark(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>undo</button>
        )}
      </div>

      {!requested && !locked && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginRight: 2 }}>Plan</span>
            {PLANS.map(m => <button key={m} type="button" onClick={() => { setMonths(m); setCopied(false) }} style={chip(months === m)}>{m}m</button>)}
            <button type="button" disabled={busy} onClick={() => mark(0)} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer', marginLeft: 4, textDecoration: 'underline', textUnderlineOffset: 3 }}>not needed here</button>
          </div>
          {months && (
            <>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={9} aria-label={`Message to the ${kind.partner}`}
                style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, padding: 10, borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontSize: 13.5, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }} />
              {!prop.maps_url && <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--amber, #c8963e)', marginTop: 4 }}>No map link for this property — fill the address in before sending.</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={async () => setCopied(await copy(text))} style={btn(!copied)}>{copied ? 'Copied ✓' : `Copy message for the ${kind.partner}`}</button>
                <button type="button" disabled={busy} onClick={() => mark(months)} style={btn(copied)}>{busy ? 'Saving…' : 'Mark requested'}</button>
              </div>
            </>
          )}
        </>
      )}
      {err && <div role="alert" style={{ marginTop: 6, fontFamily: MONO, fontSize: 12, color: 'var(--red, #e05c6a)' }}>Not saved — {err}</div>}
    </div>
  )
}

export default function UtilityRequest({ pid, onChange }) {
  const { session } = useAuth()
  const sender = (session?.user?.user_metadata?.full_name || session?.user?.email || '').split(/[\s@]/)[0]
  const [state, setState] = useState({ loading: true, error: null, prop: null, ms: null })

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([
      supabase.from('properties').select('pid, name, maps_url, units, setup_date, estimate_final_at, setup_closed_at').eq('pid', pid).maybeSingle(),
      supabase.rpc('property_milestones', { p_pid: pid }),
    ])
    const err = p.error || m.error
    setState({ loading: false, error: err ? err.message : null, prop: p.data, ms: m.data })
  }, [pid])
  useEffect(() => { load() }, [load])

  const { loading, error, prop, ms } = state
  if (loading || error || !prop || !ms?.checks) return null
  if (!prop.estimate_final_at) return null          // planning starts once the estimate is final

  const box = { background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '14px 16px 4px' }
  const locked = !!prop.setup_closed_at
  return (
    <section id="utilities-request" style={{ ...box, scrollMarginTop: 96 }}>
      <HashScroll ready prefix="utilities-request" />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }}>utilities · request</span>
        {prop.setup_date && <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)' }}>setup {fmtDay(prop.setup_date)}</span>}
      </div>
      {KINDS.map(k => <KindCard key={k.key} kind={k} prop={prop} check={ms.checks[k.key]} locked={locked} sender={sender}
        onDone={(data) => { setState(s => ({ ...s, ms: data })); onChange && onChange() }} />)}
    </section>
  )
}
