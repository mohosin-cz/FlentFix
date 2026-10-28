import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import CaptureUpload from './CaptureUpload'
import { newSubmissionId } from '../../utils/vendorOnboard'
import { KIND, STATUS, M, parseDay, addDays, todayIST, dayLabel, rangeLabel, fmtDays, num, payLine, monthGrid, unseenDecisions, markDecisionsSeen } from '../../utils/leave'

// The vendor's leave, in the portal they already open every morning.
//
// What they came to find out comes first — how much they have left — then the
// one thing they came to do, then what happened to what they asked for. Days
// are picked on a calendar rather than typed, because the calendar can show
// what a date picker cannot: that Sunday is already off, that the 2nd is a
// holiday, that they are booked on a setup that Tuesday.

const MONO = 'var(--font-mono, monospace)'
const C = { text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)', border: 'var(--border, #2e3040)', panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', accent: 'var(--accent, #c8963e)' }
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function Card({ title, right, children, pad = true }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '12px 14px 0' }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>{title}</span>
          {right}
        </div>
      )}
      <div style={{ padding: pad ? '10px 14px 14px' : 0 }}>{children}</div>
    </div>
  )
}

function Chip({ ink, soft, children }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: ink, background: soft, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', fontFamily: MONO }}>{children}</span>
}

function Note({ tone = 'info', children }) {
  const ink = tone === 'warn' ? M.red : tone === 'ok' ? M.green : tone === 'amber' ? M.amber : M.blue
  return (
    <div style={{ borderLeft: `3px solid ${ink}`, background: tone === 'warn' ? M.redSoft : tone === 'ok' ? M.greenSoft : tone === 'amber' ? M.amberSoft : M.blueSoft, borderRadius: '0 8px 8px 0', padding: '8px 11px', fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>
      {children}
    </div>
  )
}

// ── calendar: tap the first day, then the last ─────────────────────────────
function Calendar({ start, end, onPick, holidays, weeklyOff, leaveDays, clashDays, minDay, maxDay }) {
  const [view, setView] = useState(() => { const d = parseDay(start || todayIST()); return { y: d.getFullYear(), m: d.getMonth() } })
  const weeks = monthGrid(view.y, view.m)
  const title = new Date(view.y, view.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const shift = (n) => setView(v => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const today = todayIST()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" style={navBtn}>‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 13.5, fontWeight: 700 }}>{title}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" style={navBtn}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {WEEK.map((w, i) => <span key={i} style={{ textAlign: 'center', fontSize: 10.5, color: C.muted, fontFamily: MONO, padding: '2px 0 4px' }}>{w}</span>)}
        {weeks.flat().map((d, i) => {
          if (!d) return <span key={i} />
          const dow = parseDay(d).getDay()
          const hol = holidays[d]
          const off = weeklyOff.includes(dow) || !!hol
          const out = d < minDay || d > maxDay
          const inSel = start && d >= start && d <= (end || start)
          const edge = d === start || d === (end || start)
          const has = leaveDays[d]
          const clash = clashDays[d]
          return (
            <button key={i} type="button" disabled={out} onClick={() => onPick(d)}
              title={hol || (off ? 'Sunday — already off' : has ? `Leave: ${STATUS[has].label.toLowerCase()}` : clash ? `Booked: ${clash}` : '')}
              style={{
                position: 'relative', aspectRatio: '1', minHeight: 38, borderRadius: 9, border: 'none', padding: 0,
                fontSize: 13.5, fontFamily: MONO, fontVariantNumeric: 'tabular-nums', cursor: out ? 'default' : 'pointer',
                background: inSel ? (edge ? C.accent : 'rgba(200,150,62,0.22)') : off ? 'transparent' : C.input,
                color: inSel && edge ? '#16171f' : out ? 'var(--border-dash, #3a3d52)' : off ? C.muted : C.text,
                fontWeight: inSel ? 700 : d === today ? 700 : 500,
                outline: d === today && !inSel ? `1px solid ${C.border}` : 'none',
                WebkitTapHighlightColor: 'transparent',
              }}>
              {parseDay(d).getDate()}
              {hol && <span style={{ position: 'absolute', top: 3, right: 4, width: 5, height: 5, borderRadius: 3, background: M.blue }} />}
              {has && <span style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 14, height: 3, borderRadius: 2, background: STATUS[has].ink }} />}
              {clash && !has && <span style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 14, height: 2, borderRadius: 2, background: M.red }} />}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 9, fontSize: 11, color: C.muted, fontFamily: MONO }}>
        <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: M.blue, marginRight: 5 }} />holiday</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 2, background: M.red, marginRight: 5, verticalAlign: 'middle' }} />you have work</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 3, background: M.green, marginRight: 5, verticalAlign: 'middle' }} />leave already</span>
        <span>faded = already off</span>
      </div>
    </div>
  )
}
const navBtn = { width: 36, height: 36, borderRadius: 9, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontSize: 17, cursor: 'pointer' }

// ── apply ──────────────────────────────────────────────────────────────────
function ApplyForm({ token, status, onDone, onClose }) {
  const today = status.today || todayIST()
  const [kind, setKind] = useState('paid')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [half, setHalf] = useState('')
  const [reason, setReason] = useState('')
  const [doc, setDoc] = useState(null)
  const [docFolder] = useState(() => `leave/${newSubmissionId()}`)
  const [quoteRaw, setQuote] = useState(null)
  const [quoteErr, setQuoteErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const quote = start ? quoteRaw : null
  const minDay = kind === 'paid' ? today : addDays(today, -7)
  const maxDay = addDays(today, 120)
  const holidays = useMemo(() => Object.fromEntries((status.holidays || []).map(h => [h.day, h.name])), [status.holidays])
  const leaveDays = useMemo(() => {
    const m = {}
    for (const l of status.leaves || []) {
      if (l.status !== 'pending' && l.status !== 'approved') continue
      for (let d = l.start; d <= l.end; d = addDays(d, 1)) m[d] = l.status
    }
    return m
  }, [status.leaves])
  const clashDays = useMemo(() => Object.fromEntries((quote?.clashes || []).map(c => [c.day, `${c.pid} ${c.what}`])), [quote])

  // A paid leave cannot start in the past; switching kind must not leave a
  // selection the server will refuse.
  function chooseKind(k) {
    setKind(k)
    if (k === 'paid' && start && start < today) { setStart(''); setEnd('') }
  }

  function pick(d) {
    setErr('')
    if (!start || (end && end !== start) || d < start) { setStart(d); setEnd(d); return }
    if (d === start) return
    setEnd(d); setHalf('')
  }

  useEffect(() => {
    if (!start) return undefined
    let alive = true
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('attend_leave_quote', { p_token: token, p_kind: kind, p_start: start, p_end: end || start, p_half: half || null })
      if (!alive) return
      if (error) { setQuoteErr(error.message); setQuote(null) } else { setQuoteErr(''); setQuote(data) }
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [token, kind, start, end, half])

  const single = start && (!end || end === start)
  const counted = quote ? Number(quote.days) : null
  // sick leave: a doctor's note is optional for a day, required beyond that
  const needsDoc = kind === 'sick' && counted != null && counted > 1
  const blocked = !start || counted === 0 || (quote?.overlaps || []).length > 0 || (kind === 'emergency' && !reason.trim()) || (needsDoc && !doc)

  async function send() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('attend_leave_apply', { p_token: token, p_kind: kind, p_start: start, p_end: end || start, p_half: single && half ? half : null, p_reason: reason.trim() || null, p_doc: kind === 'sick' ? doc : null })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return (
    <Card title="Ask for leave" right={<button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12.5, cursor: 'pointer', fontFamily: MONO }}>Close</button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Label>What kind</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {Object.entries(KIND).map(([k, v]) => {
              const on = kind === k
              return (
                <button key={k} type="button" onClick={() => chooseKind(k)} aria-pressed={on}
                  style={{ minHeight: 46, borderRadius: 10, border: `1px solid ${on ? v.ink : C.border}`, background: on ? v.soft : C.input, color: on ? v.ink : C.dim, fontWeight: on ? 700 : 500, fontSize: 13, cursor: 'pointer', fontFamily: MONO }}>
                  {v.short}
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>{KIND[kind].hint}</div>
        </div>

        <div>
          <Label>{!start ? 'Tap the first day' : single ? 'Tap the last day, or keep one day' : 'Your days'}</Label>
          <Calendar start={start} end={end} onPick={pick} holidays={holidays} weeklyOff={status.weekly_off || [0]}
            leaveDays={leaveDays} clashDays={clashDays} minDay={minDay} maxDay={maxDay} />
        </div>

        {single && (
          <div>
            <Label>Full or half day</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[['', 'Full day'], ['first', 'First half'], ['second', 'Second half']].map(([k, l]) => {
                const on = half === k
                return <button key={k} type="button" onClick={() => setHalf(k)} aria-pressed={on}
                  style={{ minHeight: 42, borderRadius: 10, border: `1px solid ${on ? C.accent : C.border}`, background: on ? 'rgba(200,150,62,0.12)' : C.input, color: on ? C.accent : C.dim, fontWeight: on ? 700 : 500, fontSize: 12.5, cursor: 'pointer', fontFamily: MONO }}>{l}</button>
              })}
            </div>
          </div>
        )}

        {start && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {rangeLabel(start, end || start, single ? half : null)}
              {counted != null && <span style={{ color: C.dim, fontWeight: 500 }}> · {fmtDays(counted)}</span>}
            </div>
            {quote && (quote.skipped || []).length > 0 && (
              <div style={{ fontSize: 12, color: C.muted }}>
                Not counted, already off: {quote.skipped.map(s => `${dayLabel(s.day)} (${s.why})`).join(', ')}
              </div>
            )}
            {quote && kind === 'paid' && counted > 0 && (
              Number(quote.unpaid) > 0
                ? <Note tone="amber">You have <b>{num(quote.balance?.left)}</b> paid days left, so <b>{num(quote.paid)} paid</b> and <b>{num(quote.unpaid)} unpaid</b> — unpaid days come off your pay.</Note>
                : <Note tone="ok">All {fmtDays(counted)} paid. You’ll have <b>{num(Number(quote.balance?.left) - counted)}</b> left.</Note>
            )}
            {kind === 'emergency' && <Note>The office decides whether it is paid from your balance, paid without counting, or unpaid.</Note>}
            {(quote?.clashes || []).length > 0 && (
              <Note tone="warn">
                <b style={{ color: M.red }}>You are booked on: </b>
                {quote.clashes.map(c => `${c.pid} ${c.what} (${dayLabel(c.day)})`).join(', ')}. The office will see this and plan cover.
              </Note>
            )}
            {(quote?.overlaps || []).length > 0 && <Note tone="warn">You already have leave on some of these days.</Note>}
            {quoteErr && <Note tone="warn">{quoteErr}</Note>}
          </div>
        )}

        <div>
          <Label>{kind === 'emergency' ? 'What happened' : 'Reason (optional)'}</Label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={300}
            placeholder={kind === 'sick' ? 'e.g. fever' : kind === 'emergency' ? 'Tell the office what the emergency is' : 'e.g. going home for a wedding'}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14, color: C.text, background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, outline: 'none', fontFamily: 'inherit', resize: 'none' }} />
        </div>

        {kind === 'sick' && (
          <div>
            <Label>Doctor’s note or prescription {needsDoc ? <b style={{ color: M.red }}>· needed for more than 1 day</b> : '(optional for 1 day)'}</Label>
            <CaptureUpload supabase={supabase} folder={docFolder} name="sick-note" value={doc} onChange={setDoc}
              hint="A clear photo, or a PDF" camTitle="Photo of the note" doneLabel="Note attached" />
          </div>
        )}

        {err && <Note tone="warn">{err}</Note>}
        {needsDoc && !doc && start && <div style={{ fontSize: 12, color: M.red, textAlign: 'center' }}>Attach the doctor’s note to send this.</div>}
        <button type="button" onClick={send} disabled={busy || blocked}
          style={{ width: '100%', minHeight: 52, borderRadius: 12, border: 'none', background: busy || blocked ? C.input : C.accent, color: busy || blocked ? C.muted : '#16171f', fontSize: 15.5, fontWeight: 700, cursor: busy || blocked ? 'not-allowed' : 'pointer', fontFamily: MONO }}>
          {busy ? 'Sending…' : 'Send to the office'}
        </button>
      </div>
    </Card>
  )
}
function Label({ children }) { return <div style={{ fontSize: 12, color: C.muted, marginBottom: 7 }}>{children}</div> }

// ── one request ────────────────────────────────────────────────────────────
function LeaveRow({ l, today, token, onChanged }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const st = STATUS[l.status] || STATUS.pending
  const k = KIND[l.kind] || KIND.paid
  const canCancel = l.status === 'pending' || (l.status === 'approved' && l.start > today)

  async function cancel() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('attend_leave_cancel', { p_token: token, p_id: l.id })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onChanged()
  }

  return (
    <div style={{ padding: '11px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700 }}>{rangeLabel(l.start, l.end, l.half)}</span>
        <Chip ink={st.ink} soft={st.soft}>{st.label}</Chip>
      </div>
      <div style={{ fontSize: 12, color: C.muted, fontFamily: MONO }}>
        <span style={{ color: k.ink }}>{k.short}</span> · {fmtDays(l.days)}
        {l.status === 'approved' && payLine(l) && <> · {payLine(l)}</>}
        {l.status === 'approved' && l.decided_by && <> · by {l.decided_by}</>}
        {l.source === 'staff' && <> · recorded by the office</>}
      </div>
      {l.reason && <div style={{ fontSize: 12.5, color: C.dim }}>“{l.reason}”</div>}
      {l.kind === 'sick' && <SickDoc l={l} token={token} onChanged={onChanged} />}
      {l.note && <Note tone={l.status === 'declined' ? 'warn' : 'info'}>{l.decided_by ? `${l.decided_by}: ` : ''}{l.note}</Note>}
      {l.status === 'cancelled' && l.cancelled_by && <div style={{ fontSize: 11.5, color: C.muted }}>Cancelled by {l.cancelled_by}</div>}
      {err && <Note tone="warn">{err}</Note>}
      {canCancel && (confirm ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: 12.5, color: C.dim }}>Cancel this {l.status === 'approved' ? 'approved leave' : 'request'}?</span>
          <button type="button" onClick={() => setConfirm(false)} disabled={busy} style={smallBtn(false)}>Keep</button>
          <button type="button" onClick={cancel} disabled={busy} style={smallBtn(true)}>{busy ? 'Cancelling…' : 'Yes, cancel'}</button>
        </div>
      ) : (
        <div><button type="button" onClick={() => setConfirm(true)} style={smallBtn(false)}>Cancel {l.status === 'approved' ? 'leave' : 'request'}</button></div>
      ))}
    </div>
  )
}
// The note often comes after the doctor's visit, so it can be added later.
function SickDoc({ l, token, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [folder] = useState(() => `leave/${newSubmissionId()}`)
  const [err, setErr] = useState('')
  if (l.has_doc) return <div style={{ fontSize: 12, color: M.green, fontFamily: MONO }}>📎 Doctor’s note sent</div>
  if (l.status === 'declined' || l.status === 'cancelled') return null
  const missing = Number(l.days) > 1
  async function attach(path) {
    if (!path) return
    setErr('')
    const { error } = await supabase.rpc('attend_leave_attach', { p_token: token, p_id: l.id, p_doc: path })
    if (error) { setErr(error.message); return }
    onChanged()
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {!adding
        ? <div><button type="button" onClick={() => setAdding(true)} style={smallBtn(false)}>{missing ? '📎 Add the doctor’s note' : '📎 Add a document'}</button></div>
        : <CaptureUpload supabase={supabase} folder={folder} name="sick-note" value={null} onChange={attach}
            hint="A clear photo, or a PDF" camTitle="Photo of the note" />}
      {err && <Note tone="warn">{err}</Note>}
    </div>
  )
}

const smallBtn = (danger) => ({ minHeight: 36, padding: '0 13px', borderRadius: 9, border: `1px solid ${danger ? M.red : C.border}`, background: danger ? M.redSoft : 'transparent', color: danger ? M.red : C.dim, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: MONO })

// ── what the Time tab shows about today ────────────────────────────────────
export function LeaveTodayBanner({ status, onOpen }) {
  if (!status) return null
  if (status.on_leave) {
    const l = status.on_leave
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 14px', borderRadius: 12, background: M.greenSoft, border: `1px solid ${M.green}55` }}>
        <span style={{ fontSize: 22 }}>🌴</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>You’re on leave {l.half ? `(${l.half} half) ` : ''}today</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{KIND[l.kind]?.label || 'Leave'} · approved{l.end > status.today ? ` · until ${dayLabel(l.end)}` : ''}. Came in anyway? Check in as usual.</div>
        </div>
        {onOpen && <button type="button" onClick={onOpen} style={{ ...smallBtn(false), flexShrink: 0 }}>View</button>}
      </div>
    )
  }
  if (status.holiday_today) {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 14px', borderRadius: 12, background: M.blueSoft, border: `1px solid ${M.blue}55` }}>
        <span style={{ fontSize: 22 }}>🎉</span>
        <div style={{ flex: 1, fontSize: 13.5, color: C.text }}><b>{status.holiday_today}</b> — a holiday today.</div>
      </div>
    )
  }
  return null
}

// ── the tab ────────────────────────────────────────────────────────────────
export default function PortalLeave({ token, status, error, reload }) {
  const [applying, setApplying] = useState(false)
  const [sent, setSent] = useState(false)
  const [showOld, setShowOld] = useState(false)

  // Opening the tab is seeing the answers.
  useEffect(() => { if (status) markDecisionsSeen(unseenDecisions(status)) }, [status])

  if (error) {
    return <Note tone="warn">Leave isn’t available right now. {error}</Note>
  }
  if (!status) return <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12, color: C.muted, fontFamily: MONO }}>Loading…</div>

  const b = status.balance || {}
  const today = status.today || todayIST()
  const leaves = status.leaves || []
  const open = leaves.filter(l => l.status === 'pending' || (l.status === 'approved' && l.end >= today))
  const past = leaves.filter(l => !open.includes(l))
  const left = Number(b.left || 0)

  return (
    <>
      <LeaveTodayBanner status={status} />

      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: C.muted }}>Paid leave left</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <span style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, fontFamily: MONO, color: left > 0 ? C.text : M.red, fontVariantNumeric: 'tabular-nums' }}>{num(Math.max(left, 0))}</span>
              <span style={{ fontSize: 13, color: C.muted, fontFamily: MONO }}>of {num(b.allowance)}</span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, textAlign: 'right', lineHeight: 1.5, fontFamily: MONO }}>
            {b.year_start && <>year {dayLabel(b.year_start)} –<br />{dayLabel(b.year_end, { year: true })}</>}
          </div>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: C.input, overflow: 'hidden', marginTop: 12 }}>
          <div style={{ height: '100%', width: `${Math.min(100, (Number(b.used || 0) / Math.max(Number(b.allowance || 1), 1)) * 100)}%`, background: M.green, borderRadius: 3 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
          {[['Used', b.used], ['Waiting', b.pending], ['Sick', b.sick], ['Unpaid', b.unpaid]].map(([k, v]) => (
            <div key={k} style={{ background: C.bg, borderRadius: 9, padding: '8px 9px' }}>
              <div style={{ fontSize: 10.5, color: C.muted }}>{k}</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: MONO, marginTop: 2, color: k === 'Unpaid' && Number(v) > 0 ? M.red : C.text }}>{num(v)}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
          15 paid days every year from your joining date{b.joined ? ` (${dayLabel(b.joined, { year: true })})` : ''}. Sick leave is unlimited. Sundays and national holidays are already off and never count.
        </div>
      </Card>

      {sent && !applying && <Note tone="ok">Sent. The office will approve or reply here — you’ll see it on this tab.</Note>}

      {applying
        ? <ApplyForm token={token} status={status} onClose={() => setApplying(false)} onDone={() => { setApplying(false); setSent(true); reload() }} />
        : <button type="button" onClick={() => { setApplying(true); setSent(false) }}
            style={{ width: '100%', minHeight: 52, borderRadius: 12, border: `1px solid rgba(200,150,62,0.45)`, background: 'rgba(200,150,62,0.12)', color: C.accent, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>
            + Ask for leave
          </button>}

      <Card title="Your leave" right={<span style={{ fontSize: 11.5, color: C.muted, fontFamily: MONO }}>{open.length ? `${open.length} open` : ''}</span>} pad={false}>
        <div style={{ height: 6 }} />
        {open.length === 0 && <div style={{ padding: '6px 14px 14px', fontSize: 12.5, color: C.muted }}>Nothing coming up.</div>}
        {open.map(l => <LeaveRow key={l.id} l={l} today={today} token={token} onChanged={reload} />)}
        {past.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.border}` }}>
            <button type="button" onClick={() => setShowOld(s => !s)} style={{ width: '100%', padding: '11px 14px', background: 'none', border: 'none', color: C.dim, fontSize: 12.5, textAlign: 'left', cursor: 'pointer', fontFamily: MONO }}>
              {showOld ? '▾' : '▸'} Earlier ({past.length})
            </button>
            {showOld && past.map(l => <LeaveRow key={l.id} l={l} today={today} token={token} onChanged={reload} />)}
          </div>
        )}
      </Card>

      {(status.holidays || []).length > 0 && (
        <Card title="Holidays coming up">
          {status.holidays.slice(0, 6).map(h => (
            <div key={h.day} style={{ display: 'flex', gap: 10, padding: '6px 0', fontSize: 13 }}>
              <span style={{ width: 92, flexShrink: 0, color: C.muted, fontFamily: MONO, fontSize: 12 }}>{dayLabel(h.day)}</span>
              <span>{h.name}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
