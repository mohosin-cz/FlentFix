import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'

// The steps only a person can confirm, in journey order, with the control for
// the one that is due right where you are looking. Marks land instantly and
// revert visibly if the server refuses. Only the latest mark can be undone.
// Rules live in the database (property_mark_milestone / _undo_milestone).

const MONO = 'var(--font-mono, monospace)'

const STEPS = {
  estimate_final: { label: 'Estimate final', hint: 'Supply has confirmed the landlord’s decision', action: 'Mark estimate final' },
  setup_date:     { label: 'Setup date',     hint: 'The day the vendors go in',                       action: 'Set setup date' },
  setup_closed:   { label: 'Setup closed',   hint: 'All setup work is finished',                     action: 'Mark setup closed' },
  qc_done:        { label: 'QC done',        hint: 'Quality check passed',                           action: 'Mark QC done' },
  handover_done:  { label: 'Handed over',    hint: 'Property handed over (on the handover date)',     action: 'Mark handed over' },
  wo_shared:      { label: 'WO on Slack',    hint: 'Work order shared to Slack',                     action: 'Mark shared on Slack' },
  closed:         { label: 'Closed',         hint: 'Property closed',                                action: 'Close property' },
}

// Why a property may close with no landlord invoice. Mirrors the list in
// property_close_without_invoice (close_needs_invoice.sql).
export const NO_INVOICE_REASONS = {
  landlord_paid_directly: 'Landlord paid the vendors directly',
  no_billable_work:       'No billable work',
  absorbed_by_flent:      'Cost absorbed by Flent',
  invoiced_outside_pulse: 'Invoiced outside Pulse',
  other:                  'Other',
}

const who = (email) => (email === 'stage' ? 'Stage' : (email || '').split('@')[0] || 'someone')
function when(at) {
  if (!at) return ''
  const d = new Date(at), days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return d.toLocaleDateString('en-IN', { weekday: 'long' })
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}
const fmtDay = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
function daysTo(d) {
  if (!d) return null
  const t = new Date(d + 'T00:00:00'); const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((t - today) / 86400000)
}
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

// Setup can't close until every payment is confirmed logged and the WiFi and
// RO details are registered on the Utilities page (unless marked not needed
// when they were requested). The database enforces the same rule.
function SetupCloseChecklist({ pid, checks, busy, btn, onPayments, onClose }) {
  const navigate = useNavigate()
  const pay = !!checks.payments_logged?.at
  const wifiOk = checks.wifi?.not_needed || checks.wifi?.registered
  const roOk = checks.ro?.not_needed || checks.ro?.registered
  const ready = pay && wifiOk && roOk
  const item = (ok, label, action) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 8, border: `1px solid ${ok ? 'rgba(61,186,122,0.4)' : 'var(--border, #2e3040)'}`, fontFamily: MONO, fontSize: 12 }}>
      <span style={{ color: ok ? 'var(--green, #3dba7a)' : 'var(--amber, #c8963e)' }}>{ok ? '✓' : '○'}</span>
      <span style={{ color: ok ? 'var(--text-dim, #9394a8)' : 'var(--text, #e8e8f0)' }}>{label}</span>
      {action}
    </span>
  )
  const link = (txt, onClick) => <button type="button" onClick={onClick} disabled={busy} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>{txt}</button>
  return (
    <>
      {item(pay, pay ? 'All payments logged' : 'All payments logged?', pay ? link('undo', () => onPayments(false)) : <>{link('Payments ›', () => navigate(`/properties/${pid}/payments`))}{link('Confirm', () => onPayments(true))}</>)}
      {item(wifiOk, checks.wifi?.not_needed ? 'WiFi not needed' : 'WiFi details registered', !wifiOk && link('Utilities ›', () => navigate(`/properties/${pid}/utilities`)))}
      {item(roOk, checks.ro?.not_needed ? 'RO not needed' : 'RO details registered', !roOk && link('Utilities ›', () => navigate(`/properties/${pid}/utilities`)))}
      <button type="button" disabled={!ready || busy} onClick={onClose} title={ready ? '' : 'Finish the checks first'}
        style={{ ...btn(ready), opacity: ready ? 1 : 0.5, cursor: ready ? 'pointer' : 'not-allowed' }}>Mark setup closed</button>
    </>
  )
}

// Shown wherever a closed property is read: it closed with no landlord
// invoice, and this is why. Amber, not red — it was a decision, not a fault.
export function NoInvoiceFlag({ ni }) {
  const label = NO_INVOICE_REASONS[ni.reason] || ni.reason
  return (
    <span title={`${label}${ni.note ? ` — ${ni.note}` : ''} · ${who(ni.by)}, ${when(ni.at)}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 8, maxWidth: '100%',
               border: '1px solid rgba(200,150,62,0.45)', background: 'rgba(200,150,62,0.10)', fontFamily: MONO, fontSize: 11.5, color: 'var(--accent, #c8963e)' }}>
      <b style={{ whiteSpace: 'nowrap' }}>No invoice</b>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text, #e8e8f0)' }}>
        {label}{ni.note ? ` — ${ni.note}` : ''}
      </span>
      <span style={{ whiteSpace: 'nowrap', color: 'var(--text-muted, #6b6d82)' }}>· {who(ni.by)}</span>
    </span>
  )
}

// controlsOnly: render just the row of controls (for the journey bar, which
// shows who marked each milestone itself). onData hands every fresh milestone
// state up; onChange fires after a mark, undo or tick lands.
export default function MilestoneStrip({ pid, controlsOnly = false, onData, onChange }) {
  const navigate = useNavigate()
  const phone = useIsMobile(720)
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [closeDate, setCloseDate] = useState(todayIso())
  const [moving, setMoving] = useState(false)
  const [hoDate, setHoDate] = useState('')
  const [hoMoving, setHoMoving] = useState(false)
  const [noInv, setNoInv] = useState(false)        // "close without invoice" open
  const [noInvReason, setNoInvReason] = useState('')

  // What Stage says. Stage's dates are the source of truth; a date set here
  // stays in Pulse (nothing is written back), and "Use Stage's" hands it back.
  const [stage, setStage] = useState(null)
  const load = useCallback(async () => {
    const [{ data, error }, sd] = await Promise.all([
      supabase.rpc('property_milestones', { p_pid: pid }),
      supabase.rpc('property_stage_dates', { p_pid: pid }),
    ])
    setState({ loading: false, error: error ? error.message : null, data })
    setStage(sd.error ? null : sd.data)
  }, [pid])

  async function takeStageDate(kind) {
    setErr(null); setBusy(true)
    const { data, error } = await supabase.rpc('property_use_stage_date', { p_pid: pid, p_kind: kind })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setState({ loading: false, error: null, data })
    setMoving(false); setHoMoving(false); setDate(''); setHoDate('')
    onChange && onChange()
  }
  useEffect(() => { load() }, [load])
  useEffect(() => { if (state.data && onData) onData(state.data) }, [state.data, onData])

  async function act(kind, key, extra = {}) {
    setErr(null)
    const before = state.data
    // optimistic: show it done (or undone) now
    const me = (await supabase.auth.getSession()).data.session?.user?.email || ''
    setState(s => ({ ...s, data: s.data && {
      ...s.data,
      milestones: s.data.milestones.map(m => m.key !== key ? m
        : kind === 'mark' ? { ...m, done: true, at: new Date().toISOString(), by: me, date: extra.p_date || m.date }
        : { ...m, done: false, at: null, by: null, date: m.key === 'handover_done' ? m.date : null }),
    } }))
    setBusy(true)
    const { data, error } = kind === 'mark'
      ? await supabase.rpc('property_mark_milestone', { p_pid: pid, p_key: key, p_date: extra.p_date ?? null, p_note: extra.p_note ?? null })
      : await supabase.rpc('property_undo_milestone', { p_pid: pid, p_key: key })
    setBusy(false)
    if (error) { setState(s => ({ ...s, data: before })); setErr(error.message); return }
    setState({ loading: false, error: null, data })
    setDate(''); setNote(''); setMoving(false)
    onChange && onChange()
  }

  // The handover date is a plan, not a mark: it can be set any time after the
  // setup date, moved until the handover is marked, and is what the
  // "handover tomorrow" alert keys off.
  async function setHandoverDate() {
    setErr(null); setBusy(true)
    const { data, error } = await supabase.rpc('property_set_handover_date', { p_pid: pid, p_date: hoDate })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setState({ loading: false, error: null, data })
    setHoDate(''); setHoMoving(false)
    onChange && onChange()
  }

  async function closeWithoutInvoice() {
    setErr(null); setBusy(true)
    const { data, error } = await supabase.rpc('property_close_without_invoice',
      { p_pid: pid, p_reason: noInvReason, p_note: note || null, p_date: closeDate || null })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setState({ loading: false, error: null, data })
    setNote(''); setNoInv(false); setNoInvReason('')
    onChange && onChange()
  }

  const box = controlsOnly ? {} : { background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', padding: phone ? '12px 16px' : '12px 24px' }

  if (state.loading) return <div style={box} aria-busy="true"><div style={{ height: 34, borderRadius: 8, background: 'var(--border, #2e3040)', opacity: 0.4 }} /></div>
  if (state.error) {
    const notYet = /function|does not exist|schema cache/i.test(state.error)
    return <div style={{ ...box, fontFamily: MONO, fontSize: 12, color: notYet ? 'var(--text-muted, #6b6d82)' : 'var(--red, #e05c6a)' }}>{notYet ? 'Milestones appear once the journey milestones migration is applied.' : `Couldn't load milestones — ${state.error}`}</div>
  }
  if (!state.data) return null

  const { milestones, due, undoable } = state.data
  const setup = milestones.find(m => m.key === 'setup_date')
  const setupClosed = milestones.find(m => m.key === 'setup_closed')?.done
  const dt = daysTo(setup?.date)
  const handover = milestones.find(m => m.key === 'handover_done')
  const hdt = daysTo(handover?.date)
  const rel = (n) => n == null ? '' : n === 0 ? 'today' : n > 0 ? `in ${n}d` : `${-n}d ago`

  const btn = (primary) => ({ minHeight: 36, padding: '0 14px', borderRadius: 8, border: `1px solid ${primary ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, background: primary ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)', color: primary ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontFamily: MONO, fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' })
  const input = { minHeight: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', fontFamily: MONO, fontSize: 12.5 }

  return (
    <div style={box}>
      {/* the steps */}
      {!controlsOnly && <div style={{ display: 'grid', gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : `repeat(${milestones.length}, minmax(0, 1fr))`, gap: 8 }}>
        {milestones.map(m => {
          const s = STEPS[m.key]; const isDue = m.key === due
          return (
            <div key={m.key} title={s.hint}
              style={{ padding: '8px 10px', borderRadius: 8, minWidth: 0,
                       border: `1px ${m.done || isDue ? 'solid' : 'dashed'} ${isDue ? 'var(--accent, #c8963e)' : m.done ? 'rgba(61,186,122,0.35)' : 'var(--border, #2e3040)'}`,
                       background: isDue ? 'rgba(200,150,62,0.08)' : 'transparent' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: MONO, color: m.done ? 'var(--green, #3dba7a)' : isDue ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.done ? '✓ ' : ''}{s.label}
              </div>
              <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--text-dim, #9394a8)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.key === 'setup_date' && m.done ? `${fmtDay(m.date)}${dt != null ? ` · ${rel(dt)}` : ''}`
                  : m.key === 'handover_done' && m.done && m.date ? `${fmtDay(m.date)} · ${who(m.by)}`
                  : m.key === 'handover_done' && m.date ? `planned ${fmtDay(m.date)} · ${rel(hdt)}`
                  : m.done ? `${who(m.by)}, ${when(m.at)}`
                  : isDue ? 'due now' : '—'}
              </div>
            </div>
          )
        })}
      </div>}

      {/* the control for what is due, and undo for the latest */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: controlsOnly ? 0 : 10 }}>
        {due === 'setup_date' || moving ? (
          <>
            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>{moving ? 'Move setup date to' : 'Setup date'}</span>
            <input type="date" value={date} min={todayIso()} onChange={e => setDate(e.target.value)} style={input} aria-label="Setup date" />
            {stage?.setup && stage.setup !== setup?.date && <button type="button" disabled={busy} onClick={() => takeStageDate('setup')} style={btn(false)} title="Take Stage's setup date and follow Stage from now on">Use Stage’s · {fmtDay(stage.setup)}</button>}
            <button type="button" disabled={!date || busy} onClick={() => act('mark', 'setup_date', { p_date: date })} style={{ ...btn(true), opacity: date ? 1 : 0.5 }}>{moving ? 'Move' : 'Set setup date'}</button>
            {moving && <button type="button" onClick={() => { setMoving(false); setDate('') }} style={btn(false)}>Cancel</button>}
          </>
        ) : hoMoving || (due === 'handover_done' && !handover?.date) ? (
          <>
            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>{handover?.date ? 'Move handover date to' : 'Handover date'}</span>
            <input type="date" value={hoDate} onChange={e => setHoDate(e.target.value)} style={input} aria-label="Handover date" />
            {stage?.handover && stage.handover !== handover?.date && <button type="button" disabled={busy} onClick={() => takeStageDate('handover')} style={btn(false)} title="Take Stage's handover date and follow Stage from now on">Use Stage’s · {fmtDay(stage.handover)}</button>}
            <button type="button" disabled={!hoDate || busy} onClick={setHandoverDate} style={{ ...btn(true), opacity: hoDate ? 1 : 0.5 }}>{handover?.date ? 'Move' : 'Set handover date'}</button>
            {hoMoving && <button type="button" onClick={() => { setHoMoving(false); setHoDate('') }} style={btn(false)}>Cancel</button>}
          </>
        ) : due === 'closed' && (state.data.invoice?.exists || !state.data.invoice) ? (
          <>
            {state.data.invoice?.exists && (
              <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--green, #3dba7a)' }}>✓ Invoice{state.data.invoice.number ? ` ${state.data.invoice.number}` : ''}</span>
            )}
            <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} style={input} aria-label="Closure date" />
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Closure note (optional)" style={{ ...input, flex: '1 1 200px', minWidth: 0 }} />
            <button type="button" disabled={busy} onClick={() => act('mark', 'closed', { p_date: closeDate || null, p_note: note })} style={btn(true)}>Close property</button>
          </>
        ) : due === 'closed' && !noInv ? (
          // No invoice with lines yet: create it, or say why none is needed.
          <>
            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--amber, #c8963e)' }}>○ No landlord invoice yet</span>
            {state.data.invoice?.inspection_id && (
              <button type="button" onClick={() => navigate(`/invoice/${state.data.invoice.inspection_id}`)} style={btn(true)}>Create invoice ›</button>
            )}
            <button type="button" onClick={() => setNoInv(true)} style={btn(false)}>No invoice needed…</button>
          </>
        ) : due === 'closed' ? (
          <>
            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>Why no invoice?</span>
            <select value={noInvReason} onChange={e => setNoInvReason(e.target.value)} style={input} aria-label="Why no invoice">
              <option value="">Pick a reason</option>
              {Object.entries(NO_INVOICE_REASONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={noInvReason === 'other' ? 'Say why (required)' : 'Note (optional)'} style={{ ...input, flex: '1 1 200px', minWidth: 0 }} />
            <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} style={input} aria-label="Closure date" />
            {(() => {
              const ok = noInvReason && (noInvReason !== 'other' || note.trim())
              return <button type="button" disabled={!ok || busy} onClick={closeWithoutInvoice} style={{ ...btn(true), opacity: ok ? 1 : 0.5 }}>Close without invoice</button>
            })()}
            <button type="button" onClick={() => { setNoInv(false); setNoInvReason('') }} style={btn(false)}>Cancel</button>
          </>
        ) : due === 'setup_closed' && dt != null && dt > 0 ? (
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>Setup is on {fmtDay(setup.date)} — close it once the work is done.</span>
        ) : due === 'setup_closed' && state.data.checks ? (
          <SetupCloseChecklist pid={pid} checks={state.data.checks} busy={busy} btn={btn}
            onPayments={async (done) => {
              setErr(null); setBusy(true)
              const { data, error } = await supabase.rpc('property_mark_payments_logged', { p_pid: pid, p_done: done })
              setBusy(false)
              if (error) { setErr(error.message); return }
              setState({ loading: false, error: null, data })
              onChange && onChange()
            }}
            onClose={() => act('mark', 'setup_closed')} />
        ) : due === 'handover_done' ? (
          <>
            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>Handover {fmtDay(handover.date)} · {rel(hdt)}</span>
            <button type="button" disabled={busy} onClick={() => act('mark', 'handover_done')} style={btn(true)}>Mark handed over</button>
          </>
        ) : due ? (
          <button type="button" disabled={busy} onClick={() => act('mark', due)} style={btn(true)}>{STEPS[due].action}</button>
        ) : (
          <>
            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--green, #3dba7a)' }}>Property closed.</span>
            {state.data.no_invoice && <NoInvoiceFlag ni={state.data.no_invoice} />}
          </>
        )}

        {setup?.done && !setupClosed && !moving && due !== 'setup_date' && (
          <button type="button" onClick={() => { setMoving(true); setDate(setup.date || '') }} style={btn(false)}>Move setup date</button>
        )}
        {setup?.done && handover && !handover.done && !hoMoving && !moving && due !== 'setup_date' && (due !== 'handover_done' || handover.date) && (
          <button type="button" onClick={() => { setHoMoving(true); setHoDate(handover.date || '') }} style={btn(false)}
            title={handover.date ? `Handover planned for ${fmtDay(handover.date)}` : 'Plan the handover day ahead'}>
            {handover.date ? `Move handover date` : 'Set handover date'}
          </button>
        )}
        {undoable && (
          <button type="button" disabled={busy} onClick={() => act('undo', undoable)} style={{ ...btn(false), marginLeft: 'auto' }}
            title={`Undo "${STEPS[undoable].label}"`}>
            Undo {STEPS[undoable].label.toLowerCase()}
          </button>
        )}
      </div>

      <DateSources setup={setup} handover={handover} stage={stage} busy={busy} onUse={takeStageDate} btn={btn} />
      {err && <div role="alert" style={{ marginTop: 8, fontFamily: MONO, fontSize: 12, color: 'var(--red, #e05c6a)' }}>Not saved — {err}</div>}
    </div>
  )
}

// Where the setup and handover dates come from, said in one line: from Stage,
// or changed in Pulse (with Stage's date beside it and a way back).
function DateSources({ setup, handover, stage, busy, onUse, btn }) {
  if (!stage) return null
  const rows = []
  for (const [kind, label, cur, by] of [['setup', 'Setup', setup?.date, setup?.by], ['handover', 'Handover', handover?.date, handover?.date_by]]) {
    const sd = stage[kind]
    if (!sd && !cur) continue
    if (by === 'stage' || (!by && cur && cur === sd)) rows.push({ kind, text: `${label} ${fmtDay(cur)} · from Stage`, tone: 'var(--text-muted, #6b6d82)' })
    else if (sd && cur && cur !== sd) rows.push({ kind, text: `${label} ${fmtDay(cur)} · changed in Pulse${by && by !== 'none' ? ` by ${who(by)}` : ''} · Stage says ${fmtDay(sd)}`, tone: 'var(--amber, #c8963e)', use: true })
    else if (sd && !cur) rows.push({ kind, text: `${label}: cleared in Pulse · Stage says ${fmtDay(sd)}`, tone: 'var(--amber, #c8963e)', use: true })
  }
  if (!rows.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
      {rows.map(r => (
        <div key={r.kind} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontFamily: MONO, fontSize: 11.5, color: r.tone }}>
          <span>{r.text}</span>
          {r.use && <button type="button" disabled={busy} onClick={() => onUse(r.kind)} style={{ ...btn(false), minHeight: 26, padding: '0 9px', fontSize: 11 }}>Use Stage’s</button>}
        </div>
      ))}
    </div>
  )
}
