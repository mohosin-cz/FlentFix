import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// Setup day, and who actually turned up (pulse-journey-prompt.md §4).
// One read — property_setup_panel(pid) — feeds both pieces:
//   SetupPanel         once a setup date exists: the date and how far away,
//                      each assigned vendor (assigned / punched in at HH:MM /
//                      on site / left), items closed n of N, and whether WiFi
//                      and RO are booked. On setup day the page puts it first.
//   AttendanceHistory  every punch at this PID, by day, kept after setup day.

const MONO = 'var(--font-mono, monospace)'
const box = { background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: 16, minWidth: 0 }
const title = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }
const hhmm = (at) => at ? new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''
const dayKey = (at) => new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
const dayLabel = (k) => {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const yest = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  if (k === today) return 'Today'
  if (k === yest) return 'Yesterday'
  return new Date(k + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

// WiFi / RO / pest control run in two steps (see UtilityRequest): asked the
// partner (pest control: booked for a day) during planning, then recorded on
// the Utilities page at closure.
// The badge says which step it is at — "not booked" alone read as if the
// request had never been made.
const TONE = {
  green: ['var(--green, #6f9a7e)', 'rgba(111,154,126,0.45)'],
  amber: ['var(--accent, #c8963e)', 'rgba(200,150,62,0.45)'],
  red:   ['var(--red, #b0645b)', 'rgba(176,100,91,0.45)'],
  muted: ['var(--text-muted, #6b6d82)', 'var(--border, #2e3040)'],
}
function utilityState(k, data) {
  const name = k === 'wifi' ? 'WiFi' : k === 'ro' ? 'RO' : 'Pest'
  const active = !!data.utilities?.[k]
  const r = data.requests || {}
  const at = r[`${k}_requested_at`], months = r[`${k}_plan_months`]
  const pick = (tone, label, step, hint) => ({ label, step, hint, color: TONE[tone][0], border: TONE[tone][1] })
  if (k === 'pest') {
    const on = r.pest_date && new Date(r.pest_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    if (active) return pick('green', 'Pest control done', 'registered', 'The treatment is recorded on the Utilities page')
    if (at && r.pest_treatment === 'none') return pick('muted', 'Pest not needed', 'registered', 'Marked as not needed for this property')
    if (at) return pick('amber', `Pest booked · ${on}`, 'register', `${r.pest_treatment} on ${on} — record it on the Utilities page once it's done`)
    return pick('red', 'Pest not booked', 'request', 'No pest control treatment booked yet')
  }
  if (active) return pick('green', `${name} active`, 'registered', `${name} details are registered on the Utilities page`)
  if (at && months === 0) return pick('muted', `${name} not needed`, 'registered', `Marked as not needed for this property`)
  if (at) return pick('amber', `${name} requested${months ? ` · ${months} mo` : ''}`, 'register',
    `Requested ${new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — register the details on the Utilities page once it is installed`)
  return pick('red', `${name} not requested`, 'request', `Not yet requested from the partner`)
}

export function useSetupPanel(pid) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const load = useCallback(async () => {
    const [{ data, error }, { data: req }] = await Promise.all([
      supabase.rpc('property_setup_panel', { p_pid: pid }),
      // the planning step — asked the partner, which plan — lives on the property
      supabase.from('properties').select('wifi_requested_at, wifi_plan_months, ro_requested_at, ro_plan_months, pest_requested_at, pest_treatment, pest_date').eq('pid', pid).maybeSingle(),
    ])
    setState({ loading: false, error: error ? error.message : null, data: data ? { ...data, requests: req || {} } : data })
  }, [pid])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

export function SetupPanel({ pid, panel }) {
  const navigate = useNavigate()
  const { loading, error, data } = panel
  if (loading || error || !data || !data.setup_date) return null
  const d = data.days_to_setup
  const isDay = d === 0
  const vendors = data.vendors || []
  const arrived = vendors.filter(v => v.first_in_today).length
  const dateTxt = new Date(data.setup_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <section style={{ ...box, border: `1px solid ${isDay ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, boxShadow: isDay ? '0 0 0 1px rgba(200,150,62,0.25)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ ...title, color: isDay ? 'var(--accent, #c8963e)' : title.color }}>{isDay ? 'setup day' : 'setup'}</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{dateTxt}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: d < 0 ? 'var(--text-muted, #6b6d82)' : 'var(--accent, #c8963e)' }}>
          {isDay ? `${arrived} of ${vendors.length} vendors in` : d > 0 ? `in ${d} day${d === 1 ? '' : 's'}` : `started ${-d} day${d === -1 ? '' : 's'} ago`}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['wifi', 'ro', 'pest'].map(k => {
            const u = utilityState(k, data)
            return (
              <button key={k} type="button" title={u.hint}
                onClick={() => u.step === 'request' ? navigate(`/properties/${pid}#utilities-request`) : navigate(`/properties/${pid}/utilities`)}
                style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 7, cursor: 'pointer', background: 'transparent',
                         border: `1px solid ${u.border}`, color: u.color }}>
                {u.label}
              </button>
            )
          })}
        </span>
      </div>

      {vendors.length === 0 ? (
        <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>
          No vendors assigned yet. <button type="button" onClick={() => navigate(`/properties/${pid}/work-orders`)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: MONO, fontSize: 12 }}>Assign on work orders ›</button>
        </div>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
          {vendors.map(v => {
            const pct = v.items_total ? Math.round((v.items_closed / v.items_total) * 100) : 0
            const status = v.on_site_now ? `on site since ${hhmm(v.first_in_today)}`
              : v.first_in_today ? `came ${hhmm(v.first_in_today)}${v.last_out_today ? `, left ${hhmm(v.last_out_today)}` : ''}`
              : isDay ? 'not arrived'
              : d < 0 ? (v.days_on_site_since_setup ? `${v.days_on_site_since_setup} day${v.days_on_site_since_setup === 1 ? '' : 's'} on site` : 'no punch-in since setup day')
              : 'assigned'
            const tone = v.on_site_now ? 'var(--green, #6f9a7e)' : (isDay && !v.first_in_today) || (d < 0 && !v.days_on_site_since_setup && v.items_closed < v.items_total) ? 'var(--red, #b0645b)' : 'var(--text-dim, #9394a8)'
            return (
              <VendorRow key={v.vendor_id} pid={pid} v={v} status={status} tone={tone} pct={pct} />
            )
          })}
        </div>
      )}
    </section>
  )
}

// One assigned vendor. The name opens the row to show exactly what they were
// given — loaded on first open, so the panel itself stays one read.
const ITEM_STATE = {
  verified:      ['Verified',      'var(--green, #6f9a7e)'],
  vendor_closed: ['Done · to verify', 'var(--accent, #c8963e)'],
  disputed:      ['Sent back',     'var(--red, #b0645b)'],
  pending:       ['To do',         'var(--text-muted, #6b6d82)'],
}
function VendorRow({ pid, v, status, tone, pct }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)
  const [err, setErr] = useState('')

  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next || items) return
    const { data, error } = await supabase.from('work_orders')
      .select('id, trade, work_order_items(id, area, description, fix_type, quantity, status, included, sort_order, vendor_note, dispute_reason, inspection_line_item_id)')
      .eq('pid', pid).eq('vendor_id', v.vendor_id)
    if (error) { setErr(error.message); return }
    // the item's name ("Ceiling Fan") lives on the inspection line, not the
    // work-order item, whose description is only the finding ("Needs replacement")
    const ids = [...new Set((data || []).flatMap(w => (w.work_order_items || []).map(i => i.inspection_line_item_id)).filter(Boolean))]
    const names = {}
    if (ids.length) {
      const { data: li } = await supabase.from('inspection_line_items').select('id, item_name').in('id', ids)
      ;(li || []).forEach(l => { names[l.id] = l.item_name })
    }
    setItems((data || []).flatMap(w => (w.work_order_items || [])
      .filter(i => i.included !== false)
      .map(i => ({ ...i, trade: w.trade, item_name: names[i.inspection_line_item_id] || null })))
      .sort((x, y) => (x.trade || '').localeCompare(y.trade || '') || (x.sort_order ?? 0) - (y.sort_order ?? 0)))
  }

  return (
    <div style={{ borderTop: '1px solid var(--border, #2e3040)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', flexWrap: 'wrap' }}>
        <button type="button" onClick={toggle} aria-expanded={open}
          style={{ flex: '1 1 160px', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, fontSize: 9, color: 'var(--text-muted, #6b6d82)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
            {v.name}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)', paddingLeft: 16 }}>{(v.trades || []).join(', ')}{v.closure_date ? ` · close by ${new Date(v.closure_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</div>
        </button>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: tone, flex: '0 1 auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {v.on_site_now && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green, #6f9a7e)' }} />}{status}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
          <span style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--bg-input, #252731)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'var(--green, #6f9a7e)' }} /></span>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--text-dim, #9394a8)', minWidth: 54 }}>{v.items_closed}/{v.items_total} done</span>
          {v.items_sent_back > 0 && <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--red, #b0645b)' }}>{v.items_sent_back} sent back</span>}
        </span>
      </div>

      {open && (
        <div style={{ margin: '0 0 12px 16px', padding: '4px 12px', background: 'var(--bg-input, #252731)', borderRadius: 8 }}>
          {err ? <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--red, #b0645b)', padding: '8px 0' }}>{err}</div>
          : !items ? <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted, #6b6d82)', padding: '8px 0' }}>Loading…</div>
          : items.length === 0 ? <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted, #6b6d82)', padding: '8px 0' }}>No items on their work order yet.</div>
          : items.map((i, n) => {
              const [label, color] = ITEM_STATE[i.status] || ITEM_STATE.pending
              const note = i.status === 'disputed' ? i.dispute_reason : i.vendor_note
              return (
                <div key={i.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderTop: n ? '1px solid var(--border, #2e3040)' : 'none', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>
                      {i.item_name
                        ? <><span style={{ fontWeight: 600 }}>{i.item_name}</span>{i.description && i.description !== i.item_name && <span style={{ color: 'var(--text-dim, #9394a8)' }}> — {i.description}</span>}</>
                        : (i.description || '—')}
                      {i.quantity > 1 && <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}> ×{i.quantity}</span>}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>
                      {[i.area, i.fix_type, (v.trades || []).length > 1 && i.trade].filter(Boolean).join(' · ')}
                    </div>
                    {note && <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', marginTop: 2, fontStyle: 'italic' }}>“{note}”</div>}
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{label}</span>
                </div>
              )
            })}
          <div style={{ padding: '8px 0', borderTop: items?.length ? '1px solid var(--border, #2e3040)' : 'none' }}>
            <button type="button" onClick={() => navigate(`/properties/${pid}/work-orders`)}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: MONO, fontSize: 12 }}>Open work orders ›</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function AttendanceHistory({ panel }) {
  const { loading, error, data } = panel
  const [all, setAll] = useState(false)
  const days = useMemo(() => {
    const out = []
    for (const h of data?.history || []) {
      const k = dayKey(h.at)
      if (!out.length || out[out.length - 1].k !== k) out.push({ k, rows: [] })
      out[out.length - 1].rows.push(h)
    }
    return out
  }, [data])

  if (loading) return <section style={box} aria-busy="true"><div style={title}>who came</div><div style={{ height: 12, width: '60%', background: 'var(--border, #2e3040)', borderRadius: 3, marginTop: 12, opacity: 0.6 }} /></section>
  if (error) {
    const notYet = /function|does not exist|schema cache/i.test(error)
    return <section style={box}><div style={title}>who came</div><div style={{ marginTop: 10, fontFamily: MONO, fontSize: 12, color: notYet ? 'var(--text-muted, #6b6d82)' : 'var(--red, #b0645b)' }}>{notYet ? 'Attendance history appears once the setup panel migration is applied.' : `Couldn't load attendance — ${error}`}</div></section>
  }

  const shown = all ? days : days.slice(0, 5)
  return (
    <section style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={title}>who came</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)' }}>{days.length} day{days.length === 1 ? '' : 's'} with punches</span>
      </div>
      {days.length === 0 && <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>No vendor has punched in at this PID.</div>}
      {shown.map(dy => {
        // pair each vendor's in/out for the day
        const byV = new Map()
        for (const h of [...dy.rows].reverse()) {
          const key = h.vendor + '|' + h.kind
          if (!byV.has(key)) byV.set(key, { vendor: h.vendor, trade: h.trade, kind: h.kind, assigned: h.assigned, flag: h.flag, ins: null, outs: null })
          const v = byV.get(key)
          if (h.type === 'in' && !v.ins) v.ins = h.at
          if (h.type === 'out') v.outs = h.at
          if (h.flag) v.flag = h.flag
        }
        return (
          <div key={dy.k} style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{dayLabel(dy.k)}</div>
            {[...byV.values()].map((v, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid var(--border, #2e3040)', flexWrap: 'wrap', fontSize: 12.5 }}>
                <span style={{ fontWeight: 600 }}>{v.vendor}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>{v.trade || ''}{v.kind === 'overtime' ? ' · OT' : ''}</span>
                {!v.assigned && <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)' }}>not on a work order</span>}
                {v.flag === 'unknown_pid' && <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--red, #b0645b)' }}>check PID</span>}
                <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11.5, color: 'var(--text-dim, #9394a8)' }}>{v.ins ? hhmm(v.ins) : '—'} → {v.outs ? hhmm(v.outs) : 'no out'}</span>
              </div>
            ))}
          </div>
        )
      })}
      {days.length > 5 && (
        <button type="button" onClick={() => setAll(a => !a)} style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          {all ? 'Show less' : `All ${days.length} days`}
        </button>
      )}
    </section>
  )
}
