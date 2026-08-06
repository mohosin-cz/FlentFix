import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { CATEGORIES, METHODS, cleanAmount, inr, todayISO, shiftISO, uploadBill } from '../../utils/payments'

// Logging a payment should feel like jotting a note, not filling a form. The
// amount is what you actually know, so it comes first and takes the focus;
// category, payee and date sit under it with the answer usually already
// filled in; everything else is folded away until asked for.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const field = {
  width: '100%', boxSizing: 'border-box', padding: '10px 11px', fontSize: 14,
  color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)',
  border: '1px solid var(--border, #2e3040)', borderRadius: 9, outline: 'none', fontFamily: 'inherit',
}
const label = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
  color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, display: 'block', marginBottom: 6,
}

function Chip({ on, onClick, children, tone }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        minHeight: 34, padding: '0 12px', borderRadius: 17, fontSize: 12, cursor: 'pointer', fontFamily: MONO,
        whiteSpace: 'nowrap',
        border: `1px solid ${on ? (tone || 'var(--accent, #c8963e)') : 'var(--border, #2e3040)'}`,
        background: on ? (tone ? 'rgba(61,186,122,0.14)' : 'rgba(200,150,62,0.14)') : 'var(--bg-input, #252731)',
        color: on ? (tone || 'var(--accent, #c8963e)') : 'var(--text-dim, #9394a8)',
        fontWeight: on ? 700 : 400,
      }}>
      {children}
    </button>
  )
}

// Type to filter, or type something new and create it. The directory grows
// itself — that is the whole point, so the same shop is never typed twice.
function PayeePicker({ payees, value, name, onPick, onCreate }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  const needle = q.trim().toLowerCase()
  const matches = useMemo(
    () => payees.filter(p => !needle || p.name.toLowerCase().includes(needle)).slice(0, 8),
    [payees, needle],
  )
  const exact = payees.some(p => p.name.trim().toLowerCase() === needle)

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={open ? q : (name || '')}
        placeholder="Search or add a payee…"
        onFocus={() => { setOpen(true); setQ('') }}
        onChange={e => { setQ(e.target.value); setOpen(true) }}
        style={field}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 40, maxHeight: 236, overflowY: 'auto', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, boxShadow: '0 12px 32px rgba(0,0,0,0.45)' }}>
          {needle && !exact && (
            <button type="button"
              onClick={() => { onCreate(q.trim()); setOpen(false); setQ('') }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 12px', background: 'none', border: 'none', borderBottom: matches.length ? '1px solid var(--border, #2e3040)' : 'none', color: 'var(--accent, #c8963e)', fontSize: 13, cursor: 'pointer', fontFamily: SANS }}>
              + Add “{q.trim()}”
            </button>
          )}
          {matches.map(p => (
            <button key={p.id} type="button"
              onClick={() => { onPick(p); setOpen(false); setQ('') }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: value === p.id ? 'var(--bg-input, #252731)' : 'none', border: 'none', color: 'var(--text, #e8e8f0)', fontSize: 13, cursor: 'pointer', fontFamily: SANS }}>
              {p.name}
              {p.category && <span style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 11, fontFamily: MONO }}> · {p.category}</span>}
            </button>
          ))}
          {!matches.length && !needle && (
            <div style={{ padding: '11px 12px', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
              No payees yet — type a name to add the first.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PaymentSheet({ pid, payees, editing, recentCategories = [], onClose, onSaved, onPayeeCreated }) {
  const phone = useIsMobile(720)
  const [amount, setAmount] = useState(editing?.amount != null ? String(editing.amount) : '')
  const [category, setCategory] = useState(editing?.category || recentCategories[0] || 'Materials')
  const [payeeId, setPayeeId] = useState(editing?.payee_id || null)
  const [payeeName, setPayeeName] = useState(editing?.payee_name || '')
  const [paidOn, setPaidOn] = useState(editing?.paid_on || todayISO())
  const [material, setMaterial] = useState(editing?.material_cost != null ? String(editing.material_cost) : '')
  const [labour, setLabour] = useState(editing?.labour_cost != null ? String(editing.labour_cost) : '')
  const [method, setMethod] = useState(editing?.method || '')
  const [reference, setReference] = useState(editing?.reference || '')
  const [note, setNote] = useState(editing?.note || '')
  const [files, setFiles] = useState([])
  const [more, setMore] = useState(!!(editing?.material_cost || editing?.labour_cost || editing?.method || editing?.note))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState('')
  const amountRef = useRef(null)

  useEffect(() => { amountRef.current?.focus() }, [])

  // Material and labour are a breakdown of the amount, not a second source of
  // truth. Editing either keeps the total in step right there in the handler —
  // deriving it in an effect would make the total lag a render behind what you
  // just typed. The total stays independently editable for the many payments
  // that have no split at all.
  const splitTotal = (cleanAmount(material) || 0) + (cleanAmount(labour) || 0)
  const hasSplit = material !== '' || labour !== ''
  const editSplit = (which, value) => {
    const nextMaterial = which === 'material' ? value : material
    const nextLabour = which === 'labour' ? value : labour
    if (which === 'material') setMaterial(value); else setLabour(value)
    const sum = (cleanAmount(nextMaterial) || 0) + (cleanAmount(nextLabour) || 0)
    if (nextMaterial !== '' || nextLabour !== '') setAmount(sum ? String(sum) : '')
  }

  const amt = cleanAmount(amount)
  const valid = amt != null && amt > 0 && !!category && !!paidOn

  const orderedCategories = useMemo(() => {
    const seen = recentCategories.filter(c => CATEGORIES.includes(c))
    return [...seen, ...CATEGORIES.filter(c => !seen.includes(c))]
  }, [recentCategories])

  function reset() {
    setAmount(''); setMaterial(''); setLabour(''); setReference(''); setNote(''); setFiles([])
    setErr('')
    amountRef.current?.focus()
    // category, payee, date and method deliberately persist — logging fifteen
    // receipts from one shop on one day should not mean re-picking them fifteen times
  }

  async function save(andAnother) {
    if (!valid || busy) return
    setBusy(true); setErr('')
    try {
      const row = {
        pid,
        paid_on: paidOn,
        category,
        payee_id: payeeId,
        payee_name: payeeName || null,
        amount: amt,
        material_cost: material === '' ? null : cleanAmount(material),
        labour_cost: labour === '' ? null : cleanAmount(labour),
        method: method || null,
        reference: reference.trim() || null,
        note: note.trim() || null,
        updated_at: new Date().toISOString(),
      }
      let paymentId = editing?.id
      if (editing) {
        const { error } = await supabase.from('property_payments').update(row).eq('id', editing.id)
        if (error) throw error
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase.from('property_payments')
          .insert({ ...row, created_by: user?.email || null }).select('id').single()
        if (error) throw error
        paymentId = data.id
      }

      if (files.length) {
        const { data: { user } } = await supabase.auth.getUser()
        for (const f of files) {
          const meta = await uploadBill(f, pid)
          const { error } = await supabase.from('property_payment_bills')
            .insert({ payment_id: paymentId, ...meta, uploaded_by: user?.email || null })
          if (error) throw error
        }
      }

      onSaved()
      if (andAnother) {
        setFlash(`${inr(amt)} logged`)
        setTimeout(() => setFlash(''), 2200)
        reset()
      } else {
        onClose()
      }
    } catch (e) {
      setErr(e.message || String(e))
    }
    setBusy(false)
  }

  async function createPayee(name) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.from('payment_payees')
        .insert({ name, category, created_by: user?.email || null })
        .select().single()
      if (error) {
        // the unique index is case-insensitive, so a "duplicate" means it is
        // already there under a different spelling — use that one
        if (error.code === '23505') {
          const { data: existing } = await supabase.from('payment_payees')
            .select().ilike('name', name).maybeSingle()
          if (existing) { setPayeeId(existing.id); setPayeeName(existing.name); onPayeeCreated?.(existing); return }
        }
        throw error
      }
      setPayeeId(data.id); setPayeeName(data.name)
      onPayeeCreated?.(data)
    } catch (e) {
      setErr(`Couldn’t add the payee: ${e.message || e}`)
    }
  }

  const dateChips = [
    { label: 'Today', value: todayISO() },
    { label: 'Yesterday', value: shiftISO(-1) },
  ]

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center',
        padding: phone ? 0 : 20,
      }}>
      <div style={{
        width: '100%', maxWidth: 460, maxHeight: phone ? '92svh' : '88vh', overflowY: 'auto',
        background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)',
        borderRadius: phone ? '16px 16px 0 0' : 14, padding: 18,
        display: 'flex', flexDirection: 'column', gap: 16, fontFamily: SANS,
        paddingBottom: phone ? 'calc(18px + env(safe-area-inset-bottom))' : 18,
      }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>
            {editing ? 'Edit payment' : 'Log payment'}
          </span>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>PID {pid}</span>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        {/* The number is what you know. Everything else is a detail about it. */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-input, #252731)', border: `1px solid ${amt > 0 ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, borderRadius: 12 }}>
            <span style={{ fontSize: 26, color: amt > 0 ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>₹</span>
            <input
              ref={amountRef}
              value={amount}
              onChange={e => { setAmount(e.target.value); setMaterial(''); setLabour('') }}
              inputMode="decimal"
              placeholder="0"
              aria-label="Amount paid"
              style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', fontSize: 30, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: MONO, padding: 0 }}
            />
          </div>
          {hasSplit && splitTotal > 0 && (
            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 6 }}>
              {inr(cleanAmount(material) || 0)} material + {inr(cleanAmount(labour) || 0)} labour
            </div>
          )}
        </div>

        <div>
          <span style={label}>Category</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {orderedCategories.map(c => (
              <Chip key={c} on={category === c} onClick={() => setCategory(c)}>{c}</Chip>
            ))}
          </div>
        </div>

        <div>
          <span style={label}>Paid to</span>
          <PayeePicker
            payees={payees}
            value={payeeId}
            name={payeeName}
            onPick={p => { setPayeeId(p.id); setPayeeName(p.name) }}
            onCreate={createPayee}
          />
          {payeeName && (
            <button type="button" onClick={() => { setPayeeId(null); setPayeeName('') }}
              style={{ marginTop: 6, padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11, cursor: 'pointer', fontFamily: MONO }}>
              clear
            </button>
          )}
        </div>

        <div>
          <span style={label}>Date</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {dateChips.map(d => (
              <Chip key={d.label} on={paidOn === d.value} onClick={() => setPaidOn(d.value)}>{d.label}</Chip>
            ))}
            <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)}
              aria-label="Payment date"
              style={{ ...field, width: 'auto', flex: 1, minWidth: 140, padding: '8px 10px', fontSize: 13 }} />
          </div>
        </div>

        <button type="button" onClick={() => setMore(m => !m)}
          style={{ alignSelf: 'flex-start', padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>
          {more ? '− Fewer details' : '+ Split, method, bill, note'}
        </button>

        {more && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <span style={label}>Material ₹</span>
                <input value={material} onChange={e => editSplit('material', e.target.value)} inputMode="decimal" placeholder="0" style={field} />
              </div>
              <div>
                <span style={label}>Labour ₹</span>
                <input value={labour} onChange={e => editSplit('labour', e.target.value)} inputMode="decimal" placeholder="0" style={field} />
              </div>
            </div>

            <div>
              <span style={label}>Method</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {METHODS.map(m => (
                  <Chip key={m} on={method === m} onClick={() => setMethod(method === m ? '' : m)}>{m}</Chip>
                ))}
              </div>
            </div>

            <div>
              <span style={label}>Reference</span>
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="UTR, cheque no, txn id" style={field} />
            </div>

            <div>
              <span style={label}>Bill</span>
              <input type="file" accept="image/*,application/pdf" multiple
                onChange={e => setFiles([...e.target.files])}
                style={{ ...field, padding: '9px 11px', fontSize: 12, cursor: 'pointer' }} />
              {files.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, marginTop: 6 }}>
                  {files.length} file{files.length === 1 ? '' : 's'} ready — photos are compressed on upload
                </div>
              )}
            </div>

            <div>
              <span style={label}>Note</span>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="What was this for?" style={{ ...field, resize: 'vertical' }} />
            </div>
          </div>
        )}

        {err && (
          <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO, lineHeight: 1.5 }}>
            {err}
          </div>
        )}
        {flash && (
          <div style={{ padding: '10px 12px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>
            {flash} · next one ready
          </div>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button type="button" disabled={!valid || busy} onClick={() => save(false)}
            style={{
              flex: 1, minWidth: 120, minHeight: 46, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, fontFamily: SANS,
              background: valid ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
              color: valid ? '#1a1408' : 'var(--text-muted, #6b6d82)',
              cursor: busy ? 'wait' : valid ? 'pointer' : 'not-allowed',
            }}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Save'}
          </button>
          {!editing && (
            <button type="button" disabled={!valid || busy} onClick={() => save(true)}
              title="Keeps the category, payee and date for the next one"
              style={{
                minHeight: 46, padding: '0 14px', borderRadius: 10, fontSize: 13, fontFamily: MONO,
                border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)',
                color: valid ? 'var(--text-dim, #9394a8)' : 'var(--text-muted, #6b6d82)',
                cursor: busy ? 'wait' : valid ? 'pointer' : 'not-allowed',
              }}>
              Save &amp; add another
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
