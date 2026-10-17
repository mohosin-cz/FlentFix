import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { initials, avatarColor } from '../../utils/vendorHub'
import SearchField from '../../components/vendor/SearchField'
import { KIND, STATUS, M, PAY_MODE, parseDay, addDays, todayIST, dayLabel, rangeLabel, fmtDays, num, payLine } from '../../utils/leave'

// Vendor management → Leave.
//
// The order is the order of the job: what is waiting for a decision (with what
// it runs into and who could cover), then who is off over the next two weeks
// against the work they are booked on, then the record. Balances and holidays
// sit to the side — looked up, not worked through.
//
// Rules live in the database (vendor_leave.sql): 15 paid days a leave year
// from joining, sick unlimited, emergency decided case by case, Sundays and
// holidays never count. Only mohosin, shanafil and himanshu decide; the
// server enforces that, the page just doesn't offer buttons that would fail.

const F = "var(--font-nav, 'Urbanist', 'Poppins', sans-serif)"
const C = { text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)', border: 'var(--border, #2e3040)', panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', accent: 'var(--accent, #c8963e)' }

// ── small pieces ───────────────────────────────────────────────────────────
function Panel({ title, meta, right, children, pad = false }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '11px 14px', borderBottom: `1px solid ${C.border}` }}>
        <h2 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: C.text }}>{title}</h2>
        {meta && <span style={{ fontSize: 12, color: C.muted }}>{meta}</span>}
        {right && <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{right}</span>}
      </div>
      <div style={{ padding: pad ? 14 : 0 }}>{children}</div>
    </section>
  )
}
function Stat({ label, value, sub, tone }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 0, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px' }}>
      <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.1, marginTop: 3, color: tone || C.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
function Chip({ ink, soft, children, title }) {
  return <span title={title} style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 600, color: ink, background: soft, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>{children}</span>
}
function Btn({ tone, children, onClick, disabled, title, small }) {
  const t = tone === 'ok' ? { b: `${M.green}88`, bg: M.greenSoft, c: M.green }
    : tone === 'no' ? { b: `${M.red}88`, bg: M.redSoft, c: M.red }
    : tone === 'primary' ? { b: 'rgba(200,150,62,0.45)', bg: 'rgba(200,150,62,0.12)', c: C.accent }
    : { b: C.border, bg: C.input, c: C.dim }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{ minHeight: small ? 32 : 36, padding: small ? '0 10px' : '0 13px', borderRadius: 8, border: `1px solid ${t.b}`, background: t.bg, color: t.c, fontWeight: 600, fontSize: 12.5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', fontFamily: F }}>
      {children}
    </button>
  )
}
function Warn({ tone = 'warn', children }) {
  const ink = tone === 'warn' ? M.red : tone === 'amber' ? M.amber : tone === 'ok' ? M.green : M.blue
  const soft = tone === 'warn' ? M.redSoft : tone === 'amber' ? M.amberSoft : tone === 'ok' ? M.greenSoft : M.blueSoft
  return <div style={{ borderLeft: `3px solid ${ink}`, background: soft, borderRadius: '0 8px 8px 0', padding: '7px 10px', fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>{children}</div>
}
function Avatar({ name, size = 30 }) {
  const c = avatarColor(name || '?')
  return <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, background: c + '22', color: c, border: `1px solid ${c}55` }}>{initials(name || '?')}</span>
}
const inputStyle = { minHeight: 38, padding: '0 10px', fontSize: 13, color: C.text, background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, outline: 'none', fontFamily: F, boxSizing: 'border-box' }
function Select({ value, onChange, options, label }) {
  return (
    <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, paddingRight: 8 }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function Sheet({ title, onClose, children, phone }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(8,9,13,0.6)', display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center', padding: phone ? 0 : 20 }}>
      <div role="dialog" aria-label={title} style={{ width: '100%', maxWidth: 520, maxHeight: phone ? '88vh' : '86vh', overflowY: 'auto', background: C.panel, border: `1px solid ${C.border}`, borderRadius: phone ? '16px 16px 0 0' : 14, paddingBottom: 'env(safe-area-inset-bottom)', fontFamily: F, color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.panel, zIndex: 1 }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.dim, cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </div>
    </div>
  )
}

// ── deciding ───────────────────────────────────────────────────────────────
// The approve buttons a request offers, by kind. Emergency has no default:
// whoever approves says how it is paid.
function approveOptions(kind, quote) {
  if (kind === 'sick') return [['free', 'Approve · paid']]
  if (kind === 'emergency') return [['balance', 'From the 15'], ['free', 'Paid, not counted'], ['unpaid', 'Unpaid']]
  const u = Number(quote?.unpaid || 0), p = Number(quote?.paid || 0)
  return [['balance', u > 0 ? `Approve · ${num(p)} paid + ${num(u)} unpaid` : 'Approve'], ['unpaid', 'Approve as unpaid']]
}

function Decide({ leave, quote, canDecide, onDone }) {
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  async function run(approve, mode) {
    setBusy(approve ? mode : 'no'); setErr('')
    const { error } = await supabase.rpc('vendor_leave_decide', { p_id: leave.id, p_approve: approve, p_mode: mode || 'auto', p_note: note.trim() || null })
    setBusy('')
    if (error) { setErr(error.message); return }
    onDone(approve ? 'Approved — the vendor sees it on their phone' : 'Declined — your note is on their phone')
  }
  if (!canDecide) return <div style={{ fontSize: 12, color: C.muted }}>Only mohosin, shanafil or himanshu can approve or decline.</div>
  if (declining) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: `1px solid ${M.red}55`, borderRadius: 10, background: C.bg }}>
        <label style={{ fontSize: 12, color: C.muted }}>Why not? The vendor sees this.</label>
        <input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. setup on the 20th can’t move — can you take 22–23?" style={{ ...inputStyle, width: '100%' }} />
        {err && <Warn>{err}</Warn>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Btn tone="no" onClick={() => run(false)} disabled={!note.trim() || !!busy}>{busy === 'no' ? 'Declining…' : 'Decline'}</Btn>
          <Btn onClick={() => { setDeclining(false); setErr('') }}>Back</Btn>
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {approveOptions(leave.kind, quote).map(([mode, label], i) => (
          <Btn key={mode} tone={i === 0 || leave.kind === 'emergency' ? 'ok' : undefined} onClick={() => run(true, mode)} disabled={!!busy}>
            {busy === mode ? 'Approving…' : label}
          </Btn>
        ))}
        <Btn onClick={() => setDeclining(true)} disabled={!!busy}>Decline…</Btn>
      </div>
      {err && <Warn>{err}</Warn>}
    </div>
  )
}

function RequestCard({ r, vendor, canDecide, onDone, onOpenVendor }) {
  const q = r.quote || {}
  const k = KIND[r.kind] || KIND.paid
  const bal = q.balance || {}
  const age = Math.max(0, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000))
  return (
    <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Avatar name={vendor?.name} />
        <button type="button" onClick={onOpenVendor} style={{ background: 'none', border: 'none', padding: 0, color: C.text, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: F }}>{vendor?.name || 'Vendor'}</button>
        <span style={{ fontSize: 12, color: C.muted }}>{vendor?.trade}</span>
        <Chip ink={k.ink} soft={k.soft}>{k.label}</Chip>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: age >= 2 ? M.amber : C.muted }}>{age === 0 ? 'today' : `${age}d ago`}</span>
      </div>
      <div style={{ fontSize: 13.5 }}>
        <b>{rangeLabel(r.start, r.end, r.half)}</b> · {fmtDays(r.days)}
        {r.kind !== 'sick' && <span style={{ color: C.muted }}> · {num(Math.max(Number(bal.left || 0), 0))} of {num(bal.allowance)} paid days left</span>}
      </div>
      {r.reason && <div style={{ fontSize: 12.5, color: C.dim }}>“{r.reason}”</div>}
      {(q.skipped || []).length > 0 && <div style={{ fontSize: 12, color: C.muted }}>Not counted: {q.skipped.map(s => `${dayLabel(s.day)} (${s.why})`).join(', ')}</div>}
      {(q.clashes || []).length > 0 && (
        <Warn>
          <b style={{ color: M.red }}>Booked on: </b>{q.clashes.map(c => `${c.pid} ${c.what} (${dayLabel(c.day)})`).join(' · ')}
          <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
            {(q.cover || []).length ? <>Free to cover, same trade: {q.cover.slice(0, 4).map(c => c.name).join(', ')}{q.cover.length > 4 ? ` +${q.cover.length - 4}` : ''}</> : 'Nobody else in this trade is free on those days.'}
          </div>
        </Warn>
      )}
      {r.kind === 'paid' && Number(q.unpaid) > 0 && <Warn tone="amber">Beyond the balance: approving makes <b>{num(q.unpaid)}</b> day{Number(q.unpaid) === 1 ? '' : 's'} unpaid — payroll deducts {Number(q.unpaid) === 1 ? 'it' : 'them'}.</Warn>}
      {(q.overlaps || []).length > 0 && <Warn>Overlaps other leave of theirs.</Warn>}
      <Decide leave={r} quote={q} canDecide={canDecide} onDone={onDone} />
    </div>
  )
}

// ── who's off ──────────────────────────────────────────────────────────────
function WhoIsOff({ board, vendors, onShift, onOpen, phone }) {
  const [everyone, setEveryone] = useState(false)
  const days = useMemo(() => { const out = []; for (let d = board.from; d <= board.to; d = addDays(d, 1)) out.push(d); return out }, [board.from, board.to])
  const hol = useMemo(() => Object.fromEntries((board.holidays || []).map(h => [h.day, h.name])), [board.holidays])
  const off = board.policy?.weekly_off || [0]
  const cell = useMemo(() => { const m = {}; for (const r of board.days || []) m[`${r.vendor_id}|${r.day}`] = r; return m }, [board.days])
  const work = useMemo(() => { const m = {}; for (const w of board.work || []) { const k = `${w.vendor_id}|${w.day}`; (m[k] = m[k] || []).push(w.pid) } return m }, [board.work])
  const active = new Set([...(board.days || []).map(r => r.vendor_id)])
  const busy = new Set([...(board.work || []).map(w => w.vendor_id)])
  const rows = vendors.filter(v => everyone || active.has(v.id))
    .sort((a, b) => (active.has(b.id) - active.has(a.id)) || (busy.has(b.id) - busy.has(a.id)) || a.name.localeCompare(b.name))
  const nameW = phone ? 92 : 150

  return (
    <Panel title="Who’s off" meta={`${dayLabel(board.from)} – ${dayLabel(board.to)}`}
      right={<>
        <Btn small onClick={() => onShift(-7)} title="A week earlier">‹</Btn>
        <Btn small onClick={() => onShift(0)}>Today</Btn>
        <Btn small onClick={() => onShift(7)} title="A week later">›</Btn>
        <Btn small tone={everyone ? 'primary' : undefined} onClick={() => setEveryone(e => !e)}>{everyone ? 'Everyone' : 'Only people off'}</Btn>
      </>}>
      {rows.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: C.muted }}>Nobody is off in these two weeks. <button type="button" onClick={() => setEveryone(true)} style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', padding: 0, fontFamily: F, fontSize: 13 }}>Show everyone</button></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `${nameW}px repeat(${days.length}, minmax(34px, 1fr))`, minWidth: nameW + days.length * 36, fontSize: 11.5 }}>
            <div style={{ position: 'sticky', left: 0, background: C.panel, zIndex: 1 }} />
            {days.map(d => {
              const dt = parseDay(d), isOff = off.includes(dt.getDay()) || hol[d]
              return (
                <div key={d} title={hol[d] || (isOff ? 'Sunday' : '')} style={{ textAlign: 'center', padding: '7px 0 5px', color: d === board.today ? C.accent : C.muted, fontWeight: d === board.today ? 700 : 500, background: isOff ? 'rgba(255,255,255,0.025)' : 'transparent', borderBottom: `1px solid ${C.border}` }}>
                  <div>{dt.toLocaleDateString('en-GB', { weekday: 'narrow' })}</div>
                  <div style={{ fontVariantNumeric: 'tabular-nums' }}>{dt.getDate()}</div>
                  {hol[d] && <div style={{ width: 5, height: 5, borderRadius: 3, background: M.blue, margin: '2px auto 0' }} />}
                </div>
              )
            })}
            {rows.map(v => (
              <div key={v.id} style={{ display: 'contents' }}>
                <div style={{ position: 'sticky', left: 0, zIndex: 1, background: C.panel, padding: '6px 8px 6px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${v.name} · ${v.trade}`}>
                  {phone ? v.name.split(' ')[0] : v.name}
                </div>
                {days.map(d => {
                  const r = cell[`${v.id}|${d}`], w = work[`${v.id}|${d}`]
                  const isOff = off.includes(parseDay(d).getDay()) || hol[d]
                  const look = !r ? null
                    : r.status === 'pending' ? { t: '?', c: M.amber, bg: M.amberSoft }
                    : r.kind === 'sick' ? { t: 'sick', c: M.blue, bg: M.blueSoft }
                    : r.paid ? { t: 'off', c: M.green, bg: M.greenSoft }
                    : { t: 'unp', c: M.red, bg: M.redSoft }
                  const clash = r && w
                  return (
                    <div key={d} style={{ padding: 3, borderBottom: `1px solid ${C.border}`, background: isOff ? 'rgba(255,255,255,0.025)' : 'transparent' }}>
                      <button type="button" disabled={!r} onClick={() => r && onOpen(r.leave_id)}
                        title={[r && `${KIND[r.kind]?.label} · ${STATUS[r.status]?.label}${r.half ? ' · half day' : ''}${r.status === 'approved' ? (r.paid ? ' · paid' : ' · unpaid') : ''}`, w && `Booked: ${w.join(', ')}`].filter(Boolean).join('\n')}
                        style={{ width: '100%', height: 26, borderRadius: 5, border: clash ? `1.5px solid ${M.red}` : 'none', padding: 0, cursor: r ? 'pointer' : 'default',
                          background: look ? look.bg : 'transparent', color: look ? look.c : C.muted, fontSize: 10.5, fontWeight: 700, fontFamily: F,
                          boxShadow: w && !r ? `inset 0 -2px 0 rgba(200,150,62,0.55)` : 'none' }}>
                        {look ? (r.half ? '½' : look.t) : ''}
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', padding: '10px 14px', fontSize: 11.5, color: C.muted, borderTop: `1px solid ${C.border}` }}>
        <span><Chip ink={M.green} soft={M.greenSoft}>off</Chip> paid</span>
        <span><Chip ink={M.red} soft={M.redSoft}>unp</Chip> unpaid</span>
        <span><Chip ink={M.blue} soft={M.blueSoft}>sick</Chip></span>
        <span><Chip ink={M.amber} soft={M.amberSoft}>?</Chip> asked</span>
        <span><span style={{ display: 'inline-block', width: 16, height: 8, boxShadow: 'inset 0 -2px 0 rgba(200,150,62,0.55)', verticalAlign: 'middle' }} /> booked work</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 10, border: `1.5px solid ${M.red}`, borderRadius: 3, verticalAlign: 'middle' }} /> off on a booked day — fix it</span>
      </div>
    </Panel>
  )
}

// ── record ─────────────────────────────────────────────────────────────────
function LeaveLog({ log, vendorsById, onOpen }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [kind, setKind] = useState('all')
  const [when, setWhen] = useState('all')
  const today = todayIST()
  const rows = log.filter(l => {
    const name = (l.vendor?.full_name || vendorsById[l.vendor_id]?.name || '').toLowerCase()
    if (q && !name.includes(q.toLowerCase()) && !(l.reason || '').toLowerCase().includes(q.toLowerCase())) return false
    if (status !== 'all' && l.status !== status) return false
    if (kind !== 'all' && l.kind !== kind) return false
    if (when === 'upcoming' && l.end_date < today) return false
    if (when === 'past' && l.end_date >= today) return false
    return true
  })
  return (
    <Panel title="Leave record" meta="every request, newest first">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 14px' }}>
        <SearchField value={q} onChange={setQ} placeholder="Search vendor or reason" count={rows.length} total={log.length} />
        <Select label="Status" value={status} onChange={setStatus} options={[['all', 'All statuses'], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])]} />
        <Select label="Kind" value={kind} onChange={setKind} options={[['all', 'All kinds'], ...Object.entries(KIND).map(([k, v]) => [k, v.label])]} />
        <Select label="When" value={when} onChange={setWhen} options={[['all', 'Any time'], ['upcoming', 'Now and coming'], ['past', 'Past']]} />
      </div>
      {rows.length === 0 ? <div style={{ padding: '6px 14px 16px', fontSize: 13, color: C.muted }}>{log.length ? 'Nothing matches.' : 'No leave asked for yet. Requests from the vendor app land in “Waiting” above.'}</div> : (
        <div>
          {rows.slice(0, 200).map(l => {
            const name = l.vendor?.full_name || vendorsById[l.vendor_id]?.name || 'Vendor'
            const st = STATUS[l.status] || STATUS.pending, k = KIND[l.kind] || KIND.paid
            return (
              <button key={l.id} type="button" onClick={() => onOpen(l.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderTop: `1px solid ${C.border}`, color: C.text, cursor: 'pointer', fontFamily: F }}>
                <span style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>{name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 2 }}>{rangeLabel(l.start_date, l.end_date, l.half)} · {fmtDays(l.days)}{payLine(l) ? ` · ${payLine(l)}` : ''}</span>
                </span>
                <Chip ink={k.ink} soft={k.soft}>{k.short}</Chip>
                <Chip ink={st.ink} soft={st.soft}>{st.label}</Chip>
                <span style={{ width: 86, fontSize: 11.5, color: C.muted, textAlign: 'right' }}>{l.decided_by ? l.decided_by.split('@')[0] : l.source === 'staff' ? 'office' : ''}</span>
              </button>
            )
          })}
          {rows.length > 200 && <div style={{ padding: '8px 14px 12px', fontSize: 12, color: C.muted }}>Showing 200 of {rows.length} — narrow the search.</div>}
        </div>
      )}
    </Panel>
  )
}

function Balances({ vendors, phone, onOpenVendor }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('left')
  const rows = vendors.filter(v => !q || v.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
      : sort === 'unpaid' ? (Number(b.balance.unpaid) - Number(a.balance.unpaid)) || a.name.localeCompare(b.name)
      : sort === 'joined' ? String(a.balance.joined).localeCompare(String(b.balance.joined))
      : (Number(a.balance.left) - Number(b.balance.left)) || a.name.localeCompare(b.name))
  return (
    <Panel title="Balances" meta="this leave year, from each joining date">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 14px' }}>
        <SearchField value={q} onChange={setQ} placeholder="Search" count={rows.length} total={vendors.length} style={{ flex: '1 1 160px' }} />
        <Select label="Sort" value={sort} onChange={setSort} options={[['left', 'Fewest left'], ['unpaid', 'Most unpaid'], ['name', 'Name'], ['joined', 'Joined']]} />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: phone ? 0 : 420 }}>
          <thead><tr style={{ color: C.muted, fontSize: 12, textAlign: 'left' }}>
            <th style={th}>Vendor</th>{!phone && <th style={th}>Year from</th>}<th style={{ ...th, textAlign: 'right' }}>Used</th><th style={{ ...th, textAlign: 'right' }}>Left</th><th style={{ ...th, textAlign: 'right' }}>Sick</th><th style={{ ...th, textAlign: 'right' }}>Unpaid</th>
          </tr></thead>
          <tbody>
            {rows.map(v => {
              const b = v.balance || {}
              return (
                <tr key={v.id} onClick={() => onOpenVendor(v.id)} style={{ cursor: 'pointer', borderTop: `1px solid ${C.border}` }}>
                  <td style={td}><div style={{ fontWeight: 600 }}>{v.name}</div><div style={{ fontSize: 11.5, color: C.muted }}>{v.trade}{phone && b.year_start ? ` · from ${dayLabel(b.year_start)}` : ''}</div></td>
                  {!phone && <td style={{ ...td, color: C.muted, fontSize: 12 }}>{b.year_start ? dayLabel(b.year_start, { year: true }) : '—'}</td>}
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(b.used)}{Number(b.pending) > 0 && <span style={{ color: M.amber, fontSize: 11.5 }}> +{num(b.pending)}?</span>}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: Number(b.left) <= 0 ? M.red : Number(b.left) <= 3 ? M.amber : C.text }}>{num(Math.max(Number(b.left), 0))}</td>
                  <td style={{ ...td, textAlign: 'right', color: Number(b.sick) ? C.text : C.muted }}>{num(b.sick)}</td>
                  <td style={{ ...td, textAlign: 'right', color: Number(b.unpaid) ? M.red : C.muted }}>{num(b.unpaid)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
const th = { padding: '8px 14px', fontWeight: 600, borderTop: `1px solid ${C.border}` }
const td = { padding: '9px 14px', verticalAlign: 'top' }

function Holidays({ board, canDecide, onChanged }) {
  const [day, setDay] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('festival')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [removing, setRemoving] = useState('')
  const [perYear, setPerYear] = useState(String(board.policy?.paid_per_year ?? 15))
  const [showPast, setShowPast] = useState(false)
  useEffect(() => { setPerYear(String(board.policy?.paid_per_year ?? 15)) }, [board.policy?.paid_per_year])
  const upcoming = (board.holidays || []).filter(h => h.day >= board.today)
  const past = (board.holidays || []).filter(h => h.day < board.today).reverse()

  async function add() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('vendor_holiday_set', { p_day: day, p_name: name.trim(), p_kind: kind })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setDay(''); setName(''); onChanged('Holiday added — leave across it now counts one day less')
  }
  async function remove(d) {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('vendor_holiday_remove', { p_day: d })
    setBusy(false); setRemoving('')
    if (error) { setErr(error.message); return }
    onChanged('Holiday removed')
  }
  async function saveRule() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('vendor_leave_policy_set', { p_paid_per_year: Number(perYear) })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onChanged('Rule saved')
  }

  const hRow = (h) => (
    <div key={h.day} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderTop: `1px solid ${C.border}` }}>
      <span style={{ width: 96, flexShrink: 0, fontSize: 12, color: C.muted }}>{dayLabel(h.day, { year: h.day.slice(0, 4) !== board.today.slice(0, 4) })}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{h.name}</span>
      <span style={{ fontSize: 11.5, color: h.kind === 'national' ? M.blue : C.muted }}>{h.kind}</span>
      {canDecide && (removing === h.day
        ? <><Btn small tone="no" onClick={() => remove(h.day)} disabled={busy}>Remove</Btn><Btn small onClick={() => setRemoving('')}>Keep</Btn></>
        : <button type="button" onClick={() => setRemoving(h.day)} aria-label={`Remove ${h.name}`} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13 }}>✕</button>)}
    </div>
  )

  return (
    <Panel title="Holidays and rules">
      <div style={{ padding: '10px 14px', display: 'grid', gap: 6, fontSize: 12.5, color: C.dim, lineHeight: 1.5 }}>
        <div><b style={{ color: C.text }}>Paid leave</b> · {num(board.policy?.paid_per_year)} days a leave year, counted from each vendor’s joining date; unused days don’t carry over.</div>
        <div><b style={{ color: C.text }}>Sick</b> · unlimited, paid, doesn’t use the balance.</div>
        <div><b style={{ color: C.text }}>Emergency</b> · whoever approves picks: from the balance, paid without counting, or unpaid.</div>
        <div><b style={{ color: C.text }}>Beyond the balance</b> · unpaid, deducted from the month’s 30-day pro-rate in payroll.</div>
        <div><b style={{ color: C.text }}>Never counted</b> · Sundays and the holidays below.</div>
        {canDecide && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            <span>Paid days a year</span>
            <input type="number" min={0} max={60} value={perYear} onChange={e => setPerYear(e.target.value)} style={{ ...inputStyle, width: 70 }} />
            {String(board.policy?.paid_per_year) !== perYear && <Btn small tone="primary" onClick={saveRule} disabled={busy}>Save</Btn>}
          </div>
        )}
      </div>
      {upcoming.length === 0 && <div style={{ padding: '8px 14px', fontSize: 12.5, color: C.muted, borderTop: `1px solid ${C.border}` }}>No holidays ahead. Add the festivals you give off.</div>}
      {upcoming.map(hRow)}
      {past.length > 0 && (
        <>
          <button type="button" onClick={() => setShowPast(s => !s)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', borderTop: `1px solid ${C.border}`, color: C.dim, fontSize: 12.5, cursor: 'pointer', fontFamily: F }}>{showPast ? '▾' : '▸'} Past year ({past.length})</button>
          {showPast && past.map(hRow)}
        </>
      )}
      {canDecide && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 14px', borderTop: `1px solid ${C.border}` }}>
          <input type="date" value={day} onChange={e => setDay(e.target.value)} aria-label="Holiday date" style={{ ...inputStyle, flex: '0 1 150px' }} />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Diwali" aria-label="Holiday name" style={{ ...inputStyle, flex: '1 1 120px', minWidth: 0 }} />
          <Select label="Kind" value={kind} onChange={setKind} options={[['national', 'National'], ['festival', 'Festival'], ['company', 'Company']]} />
          <Btn tone="primary" onClick={add} disabled={busy || !day || !name.trim()}>Add</Btn>
        </div>
      )}
      {err && <div style={{ padding: '0 14px 12px' }}><Warn>{err}</Warn></div>}
    </Panel>
  )
}

// ── sheets ─────────────────────────────────────────────────────────────────
function LeaveSheet({ leave, vendor, canDecide, onClose, onDone, phone }) {
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [note, setNote] = useState('')
  const today = todayIST()
  useEffect(() => {
    let alive = true
    supabase.rpc('vendor_leave_quote', { p_vendor: leave.vendor_id, p_kind: leave.kind, p_start: leave.start_date, p_end: leave.end_date, p_half: leave.half, p_exclude: leave.id })
      .then(({ data }) => { if (alive) setQuote(data) })
    return () => { alive = false }
  }, [leave])
  const st = STATUS[leave.status] || STATUS.pending, k = KIND[leave.kind] || KIND.paid
  const mode = leave.status !== 'approved' ? null : leave.counts_balance ? 'balance' : Number(leave.paid_days) > 0 ? 'free' : 'unpaid'

  async function repay(m) {
    setBusy(m); setErr('')
    const { error } = await supabase.rpc('vendor_leave_repay', { p_id: leave.id, p_mode: m })
    setBusy('')
    if (error) { setErr(error.message); return }
    onDone(`Now ${PAY_MODE[m].toLowerCase()}`)
  }
  async function cancel() {
    setBusy('cancel'); setErr('')
    const { error } = await supabase.rpc('vendor_leave_cancel', { p_id: leave.id, p_note: note.trim() || null })
    setBusy('')
    if (error) { setErr(error.message); return }
    onDone('Leave cancelled')
  }

  return (
    <Sheet title={vendor?.name || leave.vendor?.full_name || 'Leave'} onClose={onClose} phone={phone}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Chip ink={k.ink} soft={k.soft}>{k.label}</Chip><Chip ink={st.ink} soft={st.soft}>{st.label}</Chip>{leave.source === 'staff' && <Chip ink={C.dim} soft={C.input}>recorded by the office</Chip>}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{rangeLabel(leave.start_date, leave.end_date, leave.half)} <span style={{ color: C.dim, fontWeight: 500 }}>· {fmtDays(leave.days)}</span></div>
      {leave.status === 'approved' && <div style={{ fontSize: 13, color: C.dim }}>{payLine(leave) || 'nothing to pay'}</div>}
      {leave.reason && <div style={{ fontSize: 13, color: C.dim }}>“{leave.reason}”</div>}
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
        Asked {new Date(leave.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        {leave.decided_by && <> · {leave.status === 'declined' ? 'declined' : 'approved'} by {leave.decided_by.split('@')[0]}</>}
        {leave.cancelled_by && <> · cancelled by {leave.cancelled_by === 'vendor' ? 'the vendor' : leave.cancelled_by.split('@')[0]}</>}
      </div>
      {leave.decision_note && <Warn tone={leave.status === 'declined' ? 'warn' : 'info'}>{leave.decision_note}</Warn>}
      {quote && (quote.clashes || []).length > 0 && (leave.status === 'pending' || leave.status === 'approved') && (
        <Warn><b style={{ color: M.red }}>Booked on: </b>{quote.clashes.map(c => `${c.pid} ${c.what} (${dayLabel(c.day)})`).join(' · ')}
          {(quote.cover || []).length > 0 && <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>Free to cover: {quote.cover.slice(0, 5).map(c => c.name).join(', ')}</div>}
        </Warn>
      )}
      {leave.status === 'pending' && <Decide leave={{ ...leave, start: leave.start_date, end: leave.end_date }} quote={quote} canDecide={canDecide} onDone={onDone} />}
      {leave.status === 'approved' && canDecide && (
        <>
          <div style={{ fontSize: 12, color: C.muted }}>How it’s paid</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(PAY_MODE).map(([m, l]) => <Btn key={m} tone={mode === m ? 'primary' : undefined} onClick={() => repay(m)} disabled={!!busy || mode === m}>{busy === m ? 'Saving…' : l}</Btn>)}
          </div>
          {cancelling ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, border: `1px solid ${M.red}55`, borderRadius: 10, background: C.bg }}>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note for the record (optional)" style={{ ...inputStyle, width: '100%' }} />
              <div style={{ display: 'flex', gap: 6 }}><Btn tone="no" onClick={cancel} disabled={!!busy}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel this leave'}</Btn><Btn onClick={() => setCancelling(false)}>Keep it</Btn></div>
            </div>
          ) : <div><Btn onClick={() => setCancelling(true)}>{leave.start_date <= today ? 'Cancel (they came in)' : 'Cancel leave'}</Btn></div>}
        </>
      )}
      {err && <Warn>{err}</Warn>}
    </Sheet>
  )
}

function RecordSheet({ vendors, initialVendor, onClose, onDone, phone }) {
  const today = todayIST()
  const [vid, setVid] = useState(initialVendor || '')
  const [kind, setKind] = useState('sick')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [half, setHalf] = useState('')
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState('auto')
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const single = start && start === end
  const e2 = end < start ? start : end

  useEffect(() => { setMode(kind === 'emergency' ? 'free' : 'auto') }, [kind])
  useEffect(() => {
    if (!vid || !start) { setQuote(null); return }
    let alive = true
    const t = setTimeout(() => {
      supabase.rpc('vendor_leave_quote', { p_vendor: vid, p_kind: kind, p_start: start, p_end: e2, p_half: single && half ? half : null })
        .then(({ data }) => { if (alive) setQuote(data) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [vid, kind, start, e2, half, single])

  async function save() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('vendor_leave_record', { p_vendor: vid, p_kind: kind, p_start: start, p_end: e2, p_half: single && half ? half : null, p_reason: reason.trim() || null, p_mode: mode })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone('Leave recorded and approved')
  }

  const lbl = { fontSize: 12, color: C.muted, marginBottom: 5 }
  return (
    <Sheet title="Record leave" onClose={onClose} phone={phone}>
      <div style={{ fontSize: 12.5, color: C.dim }}>For leave someone phoned in. It’s approved as you save it, and shows on their phone.</div>
      <div><div style={lbl}>Vendor</div>
        <select value={vid} onChange={e => setVid(e.target.value)} style={{ ...inputStyle, width: '100%' }}>
          <option value="">Pick a vendor…</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name} · {v.trade}</option>)}
        </select>
      </div>
      <div><div style={lbl}>Kind</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{Object.entries(KIND).map(([k, v]) => <Btn key={k} tone={kind === k ? 'primary' : undefined} onClick={() => setKind(k)}>{v.label}</Btn>)}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}><div style={lbl}>First day</div><input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ ...inputStyle, width: '100%' }} /></div>
        <div style={{ flex: '1 1 140px' }}><div style={lbl}>Last day</div><input type="date" value={e2} min={start} onChange={e => setEnd(e.target.value)} style={{ ...inputStyle, width: '100%' }} /></div>
      </div>
      {single && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[['', 'Full day'], ['first', 'First half'], ['second', 'Second half']].map(([h, l]) => <Btn key={h} small tone={half === h ? 'primary' : undefined} onClick={() => setHalf(h)}>{l}</Btn>)}</div>}
      {kind !== 'sick' && (
        <div><div style={lbl}>How it’s paid</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(kind === 'paid' ? [['auto', 'From the 15 (rest unpaid)'], ['unpaid', 'Unpaid']] : Object.entries(PAY_MODE)).map(([m, l]) => <Btn key={m} small tone={mode === m ? 'primary' : undefined} onClick={() => setMode(m)}>{l}</Btn>)}
          </div>
        </div>
      )}
      <div><div style={lbl}>{kind === 'emergency' ? 'What happened' : 'Reason (optional)'}</div><input value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputStyle, width: '100%' }} /></div>
      {quote && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 13 }}><b>{fmtDays(quote.days)}</b>{kind === 'paid' && mode === 'auto' && Number(quote.unpaid) > 0 ? ` · ${num(quote.paid)} paid, ${num(quote.unpaid)} unpaid` : ''}<span style={{ color: C.muted }}> · {num(Math.max(Number(quote.balance?.left || 0), 0))} paid days left</span></div>
          {(quote.clashes || []).length > 0 && <Warn><b style={{ color: M.red }}>Booked on: </b>{quote.clashes.map(c => `${c.pid} ${c.what} (${dayLabel(c.day)})`).join(' · ')}</Warn>}
          {(quote.overlaps || []).length > 0 && <Warn>They already have leave on some of these days.</Warn>}
        </div>
      )}
      {err && <Warn>{err}</Warn>}
      <Btn tone="ok" onClick={save} disabled={busy || !vid || !start || (kind === 'emergency' && !reason.trim())}>{busy ? 'Saving…' : 'Record and approve'}</Btn>
    </Sheet>
  )
}

function VendorSheet({ vendor, log, onClose, onOpen, onRecord, canDecide, phone }) {
  const b = vendor.balance || {}
  const mine = log.filter(l => l.vendor_id === vendor.id)
  return (
    <Sheet title={vendor.name} onClose={onClose} phone={phone}>
      <div style={{ fontSize: 12.5, color: C.muted }}>{vendor.trade}{vendor.code ? ` · ${vendor.code}` : ''} · joined {b.joined ? dayLabel(b.joined, { year: true }) : '—'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8 }}>
        {[['Left', Math.max(Number(b.left), 0), Number(b.left) <= 0 ? M.red : null], ['Used', b.used], ['Waiting', b.pending], ['Sick', b.sick], ['Unpaid', b.unpaid, Number(b.unpaid) ? M.red : null]].map(([k, v, tone]) => (
          <div key={k} style={{ background: C.bg, borderRadius: 9, padding: '8px 10px' }}><div style={{ fontSize: 11.5, color: C.muted }}>{k}</div><div style={{ fontSize: 18, fontWeight: 600, color: tone || C.text }}>{num(v)}</div></div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>Leave year {b.year_start ? `${dayLabel(b.year_start, { year: true })} – ${dayLabel(b.year_end, { year: true })}` : '—'} · {num(b.allowance)} paid days</div>
      {canDecide && <div><Btn tone="primary" onClick={onRecord}>+ Record leave for {vendor.name.split(' ')[0]}</Btn></div>}
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>History</div>
      {mine.length === 0 ? <div style={{ fontSize: 12.5, color: C.muted }}>No leave yet.</div> : mine.map(l => {
        const st = STATUS[l.status], k = KIND[l.kind]
        return (
          <button key={l.id} type="button" onClick={() => onOpen(l.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 0', background: 'none', border: 'none', borderTop: `1px solid ${C.border}`, color: C.text, textAlign: 'left', cursor: 'pointer', fontFamily: F }}>
            <span style={{ flex: '1 1 160px', fontSize: 13 }}>{rangeLabel(l.start_date, l.end_date, l.half)} <span style={{ color: C.muted }}>· {fmtDays(l.days)}</span></span>
            <Chip ink={k.ink} soft={k.soft}>{k.short}</Chip><Chip ink={st.ink} soft={st.soft}>{st.label}</Chip>
          </button>
        )
      })}
    </Sheet>
  )
}

// ── the tab ────────────────────────────────────────────────────────────────
export default function LeaveTab() {
  const phone = useIsMobile(640)
  const wide = !useIsMobile(1000)
  const [from, setFrom] = useState(() => todayIST())
  const [board, setBoard] = useState(null)
  const [log, setLog] = useState([])
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [openLeave, setOpenLeave] = useState(null)
  const [openVendor, setOpenVendor] = useState(null)
  const [recording, setRecording] = useState(null)   // '' for any vendor, or a vendor id

  const load = useCallback(async () => {
    const [b, l] = await Promise.all([
      supabase.rpc('vendor_leave_board', { p_from: from, p_to: addDays(from, 13) }),
      supabase.from('vendor_leaves').select('*, vendor:vendors(full_name,trade)').order('start_date', { ascending: false }).limit(1000),
    ])
    if (b.error) { setError(b.error.message); return }
    setError(''); setBoard(b.data); setLog(l.data || [])
  }, [from])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const ch = supabase.channel('vendor-leaves-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_leaves' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3200); return () => clearTimeout(t) }, [toast])

  const done = (msg) => { setOpenLeave(null); setRecording(null); setToast(msg); load() }

  const vendors = useMemo(() => board?.vendors || [], [board])
  const vendorsById = useMemo(() => Object.fromEntries(vendors.map(v => [v.id, v])), [vendors])

  if (error) {
    return <Warn>Couldn’t load leave: {error}{/function .* does not exist|relation .* does not exist/.test(error) ? ' — the vendor_leave migration needs to be applied.' : ''}</Warn>
  }
  if (!board) return <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 13, color: C.muted, fontFamily: F }}>Loading…</div>

  const today = board.today
  const pending = board.pending || []
  const approvedDays = (board.days || []).filter(r => r.status === 'approved')
  const offToday = new Set(approvedDays.filter(r => r.day === today).map(r => r.vendor_id))
  const offWeek = new Set(approvedDays.filter(r => r.day >= today && r.day <= addDays(today, 6)).map(r => r.vendor_id))
  const workSet = new Set((board.work || []).map(w => `${w.vendor_id}|${w.day}`))
  const clashes = new Set((board.days || []).filter(r => workSet.has(`${r.vendor_id}|${r.day}`)).map(r => r.leave_id))
  const oldest = pending.reduce((m, r) => Math.max(m, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000)), 0)
  const leaveRow = openLeave ? log.find(l => l.id === openLeave) : null
  const vendorRow = openVendor ? vendorsById[openVendor] : null

  const requests = (
    <Panel title="Waiting for a decision" meta={pending.length ? `${pending.length} · clashes first` : null}
      right={board.can_decide && <Btn tone="primary" small onClick={() => setRecording('')}>+ Record leave</Btn>}>
      {pending.length === 0
        ? <div style={{ padding: 16, fontSize: 13, color: C.muted }}>Nothing waiting. New requests from the vendor app appear here, and in your bell.</div>
        : [...pending].sort((a, b) => ((b.quote?.clashes || []).length > 0) - ((a.quote?.clashes || []).length > 0) || a.start.localeCompare(b.start))
            .map(r => <RequestCard key={r.id} r={r} vendor={vendorsById[r.vendor_id]} canDecide={board.can_decide} onDone={done} onOpenVendor={() => setOpenVendor(r.vendor_id)} />)}
    </Panel>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: F, color: C.text }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Stat label="Waiting for you" value={pending.length} sub={pending.length ? `oldest ${oldest === 0 ? 'today' : `${oldest}d`}` : 'all decided'} tone={pending.length ? M.amber : null} />
        <Stat label="Off today" value={offToday.size} sub={offToday.size ? [...offToday].map(id => vendorsById[id]?.name.split(' ')[0]).filter(Boolean).slice(0, 3).join(', ') : 'everyone is in'} />
        <Stat label="Off this week" value={offWeek.size} sub={`to ${dayLabel(addDays(today, 6))}`} />
        <Stat label="Leave on booked work" value={clashes.size} sub={clashes.size ? 'see the red boxes below' : 'no clashes in view'} tone={clashes.size ? M.red : null} />
        <Stat label="This month" value={`${num(board.month?.paid)} · ${num(board.month?.unpaid)}`} sub="paid · unpaid days" />
      </div>

      {!board.can_decide && <Warn tone="info">You can see leave here; approving and declining is for mohosin, shanafil and himanshu.</Warn>}

      <div style={{ display: 'grid', gridTemplateColumns: wide ? 'minmax(0, 1.6fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {requests}
          <WhoIsOff board={board} vendors={vendors} phone={phone} onOpen={setOpenLeave}
            onShift={(n) => setFrom(f => (n === 0 ? todayIST() : addDays(f, n)))} />
          <LeaveLog log={log} vendorsById={vendorsById} onOpen={setOpenLeave} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Balances vendors={vendors} phone={phone} onOpenVendor={setOpenVendor} />
          <Holidays board={board} canDecide={board.can_decide} onChanged={(m) => { setToast(m); load() }} />
        </div>
      </div>

      {toast && <div role="status" style={{ position: 'fixed', left: '50%', bottom: 'calc(24px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 1400, background: C.text, color: C.bg, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, maxWidth: 'calc(100vw - 32px)' }}>{toast}</div>}
      {leaveRow && <LeaveSheet leave={leaveRow} vendor={vendorsById[leaveRow.vendor_id]} canDecide={board.can_decide} phone={phone} onClose={() => setOpenLeave(null)} onDone={done} />}
      {vendorRow && !leaveRow && recording == null && <VendorSheet vendor={vendorRow} log={log} canDecide={board.can_decide} phone={phone} onClose={() => setOpenVendor(null)}
        onOpen={(id) => setOpenLeave(id)} onRecord={() => setRecording(vendorRow.id)} />}
      {recording != null && <RecordSheet vendors={vendors} initialVendor={recording} phone={phone} onClose={() => setRecording(null)} onDone={done} />}
    </div>
  )
}

