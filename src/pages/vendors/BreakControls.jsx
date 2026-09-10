import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtMs, BREAK_MINUTES, BREAK_LABEL, localDay, localTime } from '../../utils/attendance'

// Staff controls for breaks, alongside the ones for shifts.
//
// Closing a shift somebody walked away from was already possible; a lunch they
// never came back from was not. Every write to vendor_breaks went through an
// RPC keyed on the vendor's own session token, and that token expires with
// their day — so the row kept counting against the allowance and the board
// could only report the overrun, never correct it.
//
// Four things happen on a real site, so there are four controls: a break that
// was never ended, a break with the wrong times, a break that never happened,
// and a break that happened while nobody pressed anything. Each one asks for a
// reason, because each one edits somebody's day, and the server records who
// did it from the caller's own token rather than anything typed here.

const MONO = 'var(--font-mono, monospace)'
const KINDS = ['lunch', 'snack']

const inputCss = {
  width: '100%', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
  borderRadius: 7, padding: '8px 9px', fontSize: 13, color: 'var(--text, #e8e8f0)',
  fontFamily: MONO, colorScheme: 'dark', outline: 'none', boxSizing: 'border-box',
}
const chip = (tone) => ({
  fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, cursor: 'pointer',
  fontFamily: MONO, border: tone === 'solid' ? 'none' : '1px solid var(--border, #2e3040)',
  background: tone === 'solid' ? 'var(--accent, #c8963e)' : 'none',
  color: tone === 'solid' ? '#16171f' : tone === 'danger' ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)',
})

// ── the form behind every control ───────────────────────────────────────────
// One form for all four actions. They differ only in which fields are open and
// which RPC the Save button calls, and splitting them into four near-identical
// forms is how the date handling in one of them drifts.
function BreakForm({ mode, breakRow, vendorId, kind, date, now, onDone, onCancel }) {
  const label = BREAK_LABEL[kind] || kind
  const allowed = BREAK_MINUTES[kind] || 0

  // Sensible starting points rather than blanks — but a break that already has
  // an end prefills with THAT end, never with a guess. Offering the allowance
  // instead meant opening Edit to correct a start time silently proposed a new
  // end as well: a 131-minute lunch came up reading 45, and saving the start
  // would have quietly erased the overrun it was opened to look at.
  const startMs = breakRow ? new Date(breakRow.startedAt).getTime()
                           : new Date(`${date}T13:00`).getTime()
  const endGuess = breakRow && breakRow.endedAt
    ? new Date(breakRow.endedAt).getTime()
    : breakRow
      // still running: the allowance is the likely answer, but never the future
      ? Math.min(startMs + allowed * 60000, now)
      : startMs + allowed * 60000

  const [sDay,  setSDay]  = useState(() => localDay(startMs))
  const [sTime, setSTime] = useState(() => localTime(startMs))
  const [eDay,  setEDay]  = useState(() => localDay(endGuess))
  const [eTime, setETime] = useState(() => localTime(endGuess))
  const [running, setRunning] = useState(() => mode === 'adjust' ? !breakRow.endedAt : false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const editStart = mode === 'adjust' || mode === 'add'
  const editEnd   = mode !== 'delete' && !(mode === 'adjust' && running) && !(mode === 'add' && running)

  const sMs = sDay && sTime ? new Date(`${sDay}T${sTime}`).getTime() : NaN
  const eMs = eDay && eTime ? new Date(`${eDay}T${eTime}`).getTime() : NaN
  const wantEnd = editEnd || mode === 'end'

  const bad = mode === 'delete' ? ''
    : !Number.isFinite(sMs) ? 'Enter when the break started'
    : sMs > now ? 'The break cannot start in the future'
    : !wantEnd ? ''
    : !Number.isFinite(eMs) ? 'Enter when the break ended'
    : eMs < sMs ? 'The break cannot end before it started'
    : eMs > now ? 'The break cannot end in the future'
    : ''

  const takenMs = Number.isFinite(sMs) && Number.isFinite(eMs) && wantEnd ? eMs - sMs : NaN
  const overMs  = Number.isFinite(takenMs) ? takenMs - allowed * 60000 : NaN

  async function submit() {
    if (bad || !reason.trim()) return
    setBusy(true); setErr('')
    const iso = (ms) => new Date(ms).toISOString()
    let res
    if (mode === 'end') {
      res = await supabase.rpc('attend_staff_end_break', {
        p_break_id: breakRow.id, p_ended_at: iso(eMs), p_reason: reason.trim(),
      })
    } else if (mode === 'adjust') {
      res = await supabase.rpc('attend_staff_adjust_break', {
        p_break_id: breakRow.id, p_started_at: iso(sMs),
        p_ended_at: running ? null : iso(eMs), p_reason: reason.trim(),
      })
    } else if (mode === 'add') {
      res = await supabase.rpc('attend_staff_add_break', {
        p_vendor_id: vendorId, p_kind: kind, p_started_at: iso(sMs),
        p_ended_at: running ? null : iso(eMs), p_reason: reason.trim(),
      })
    } else {
      res = await supabase.rpc('attend_staff_delete_break', {
        p_break_id: breakRow.id, p_reason: reason.trim(),
      })
    }
    setBusy(false)
    if (res.error) { setErr(res.error.message); return }
    onDone(res.data)
  }

  const title = mode === 'end' ? `End this ${label.toLowerCase()} break`
    : mode === 'adjust' ? `Correct this ${label.toLowerCase()} break`
    : mode === 'add' ? `Record a ${label.toLowerCase()} break`
    : `Remove this ${label.toLowerCase()} break`
  const verb = mode === 'end' ? 'End break' : mode === 'adjust' ? 'Save times'
    : mode === 'add' ? 'Record break' : 'Remove break'
  const accent = mode === 'delete' ? 'var(--red, #e05c6a)' : 'var(--accent, #c8963e)'

  return (
    <div style={{ marginTop: 9, padding: '11px 12px', background: 'var(--bg, #16171f)', border: `1px solid ${accent}`, borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent, fontFamily: MONO }}>
        {title}
      </div>

      {mode === 'delete' ? (
        <div style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', lineHeight: 1.5 }}>
          The break is removed from the record. What it was, and why it went, stay on the audit trail.
        </div>
      ) : (
        <>
          {editStart && (
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 130px', minWidth: 0 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Date started</span>
                <input type="date" value={sDay} onChange={e => setSDay(e.target.value)} style={inputCss} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 1 110px', minWidth: 0 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Time started</span>
                <input type="time" value={sTime} onChange={e => setSTime(e.target.value)} style={inputCss} />
              </label>
            </div>
          )}

          {(mode === 'adjust' || mode === 'add') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, cursor: 'pointer' }}>
              <input type="checkbox" checked={running} onChange={e => setRunning(e.target.checked)} style={{ accentColor: 'var(--accent, #c8963e)', width: 15, height: 15 }} />
              Still on this break
            </label>
          )}

          {editEnd && (
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 130px', minWidth: 0 }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Date ended</span>
                <input type="date" value={eDay} onChange={e => setEDay(e.target.value)} style={inputCss} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 1 110px', minWidth: 0 }}>
                <span style={{ fontSize: 10, color: accent, fontFamily: MONO }}>Time ended</span>
                <input type="time" value={eTime} onChange={e => setETime(e.target.value)} style={inputCss} />
              </label>
            </div>
          )}
        </>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Reason · required</span>
        <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}
          placeholder={mode === 'end' ? 'Back on site at 1:50, forgot to end it'
            : mode === 'add' ? 'Took lunch, phone was flat'
            : mode === 'delete' ? 'Started by mistake, never left site'
            : 'Times confirmed with site supervisor'}
          style={{ ...inputCss, resize: 'vertical' }} />
      </label>

      <div style={{ fontSize: 11, fontFamily: MONO, color: bad ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)' }}>
        {bad || (mode === 'delete' ? 'Removed from the record'
          : running ? `Left running · ${allowed}m allowed`
          : Number.isFinite(takenMs)
            ? `Records ${fmtMs(takenMs)} of ${allowed}m${overMs > 0 ? ` · ${fmtMs(overMs)} over` : ' · within allowance'}`
            : '')}
      </div>
      {err && <div style={{ fontSize: 11, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>⚠ {err}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={submit} disabled={busy || !!bad || !reason.trim()}
          style={{ ...chip('solid'), padding: '7px 13px', fontSize: 11.5,
            background: accent, cursor: busy || bad || !reason.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || bad || !reason.trim() ? 0.5 : 1 }}>
          {busy ? 'Saving…' : verb}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          style={{ ...chip(), padding: '7px 13px', fontSize: 11.5 }}>Cancel</button>
      </div>
    </div>
  )
}

// ── one break on the record, with its controls ──────────────────────────────
function BreakRow({ r, now, onChanged }) {
  const [mode, setMode] = useState(null)
  const dot = r.overMs > 0 ? 'var(--red, #e05c6a)' : r.open ? 'var(--accent, #c8963e)' : 'var(--green, #3dba7a)'

  return (
    <div style={{ padding: '9px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: MONO, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, flexShrink: 0, background: dot }} />
        <span style={{ width: 54, flexShrink: 0, fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{r.label}</span>
        <span style={{ flex: 1, minWidth: 120, fontSize: 11.5, color: 'var(--text-muted, #6b6d82)' }}>
          {localTime(new Date(r.startedAt).getTime())}
          {r.endedAt ? ` – ${localTime(new Date(r.endedAt).getTime())}` : ' – still out'}
          <span style={{ marginInlineStart: 8 }}>allowed {Math.round(r.allowedMs / 60000)}m</span>
        </span>
        <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.overMs > 0 ? 'var(--red, #e05c6a)' : 'var(--text-dim, #9394a8)' }}>
          {fmtMs(r.takenMs)}{r.overMs > 0 ? ` +${fmtMs(r.overMs)}` : ''}
        </span>
        {/* The end button only exists while there is something to end, and it
            is the loud one — a break still running is the thing staff came to
            this panel to deal with. */}
        <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {r.open && <button type="button" onClick={() => setMode(mode === 'end' ? null : 'end')} style={chip('solid')}>End</button>}
          <button type="button" onClick={() => setMode(mode === 'adjust' ? null : 'adjust')} style={chip()}>Edit</button>
          <button type="button" onClick={() => setMode(mode === 'delete' ? null : 'delete')} style={chip('danger')}>Remove</button>
        </span>
      </div>
      {mode && (
        <BreakForm mode={mode} breakRow={r} kind={r.kind} date={localDay(new Date(r.startedAt).getTime())} now={now}
          onDone={() => { setMode(null); onChanged && onChanged() }}
          onCancel={() => setMode(null)} />
      )}
    </div>
  )
}

// ── the panel: every break on this day, and the ones that are missing ───────
export function BreaksPanel({ s, date, now, onChanged }) {
  const [adding, setAdding] = useState(null)
  const rows = s.bt.rows || []
  const taken = new Set(rows.map(r => r.kind))
  const missing = KINDS.filter(k => !taken.has(k))

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 0 2px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Breaks</span>
        {s.bt.overMs > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>
            {fmtMs(s.bt.overMs)} over
          </span>
        )}
      </div>

      {rows.length === 0 && !adding && (
        <div style={{ padding: '6px 0 2px', fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
          No breaks on the record for this day.
        </div>
      )}

      {rows.map(r => <BreakRow key={r.id} r={r} now={now} onChanged={onChanged} />)}

      {/* A break nobody pressed is not the same as a break nobody took, and
          only the office knows which. */}
      {missing.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 2px', borderTop: rows.length ? '1px solid var(--border, #2e3040)' : 'none', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 120, fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            Not on the record: {missing.map(k => BREAK_LABEL[k].toLowerCase()).join(', ')}
          </span>
          {missing.map(k => (
            <button key={k} type="button" onClick={() => setAdding(adding === k ? null : k)} style={chip()}>
              + {BREAK_LABEL[k]}
            </button>
          ))}
        </div>
      )}

      {adding && (
        <BreakForm mode="add" vendorId={s.vid} kind={adding} date={date} now={now}
          onDone={() => { setAdding(null); onChanged && onChanged() }}
          onCancel={() => setAdding(null)} />
      )}
    </>
  )
}

// ── the end control on its own, for the live feed ───────────────────────────
// The full set lives in the vendor's day sheet, which is the right home for
// correcting a record. But the live feed is where staff already are when they
// notice, and it is where "Close this shift" sits — so a break still running
// gets its one urgent control in the same place, rather than two views away.
//
// Takes a raw vendor_breaks row, since that is what the feed already has, and
// maps it into the shape the form works in.
export function EndBreakControl({ brk, now, onEnded }) {
  const [open, setOpen] = useState(false)
  if (!brk) return null

  const row = { id: brk.id, kind: brk.kind, startedAt: brk.started_at, endedAt: brk.ended_at || null }

  if (open) {
    return (
      <BreakForm mode="end" breakRow={row} kind={brk.kind}
        date={localDay(new Date(brk.started_at).getTime())} now={now}
        onDone={(r) => { setOpen(false); onEnded && onEnded(r) }}
        onCancel={() => setOpen(false)} />
    )
  }
  return (
    <button type="button" onClick={() => setOpen(true)}
      style={{ marginTop: 9, marginInlineStart: 8, fontSize: 11, fontFamily: MONO, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid rgba(200,150,62,0.35)', borderRadius: 7, padding: '5px 11px', cursor: 'pointer' }}>
      End this break
    </button>
  )
}
