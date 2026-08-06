import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { KINDS, TRADES, METHODS, cleanAmount, inr, todayISO, shiftISO, uploadBill } from '../../utils/payments'

// The form follows how a payment is actually thought about, in order:
//   what kind of spend  →  what work it was for  →  what it was  →  how much
//   →  invoice (optional)  →  note (optional)
// Amount deliberately does not come first: until you have said what the money
// was for, the number has no meaning to file it under.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const field = {
  width: '100%', boxSizing: 'border-box', padding: '10px 11px', fontSize: 14,
  color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)',
  border: '1px solid var(--border, #2e3040)', borderRadius: 9, outline: 'none', fontFamily: 'inherit',
}
const stepLabel = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
  color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7,
}
const stepNum = {
  width: 15, height: 15, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 8.5, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
  color: 'var(--text-muted, #6b6d82)', flexShrink: 0,
}

function Chip({ on, onClick, children, wide }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        minHeight: 36, padding: wide ? '0 18px' : '0 12px', borderRadius: 18, fontSize: 12.5,
        cursor: 'pointer', fontFamily: MONO, whiteSpace: 'nowrap', flex: wide ? 1 : '0 0 auto',
        border: `1px solid ${on ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
        background: on ? 'rgba(200,150,62,0.14)' : 'var(--bg-input, #252731)',
        color: on ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)',
        fontWeight: on ? 700 : 400,
      }}>
      {children}
    </button>
  )
}

// Type to filter, or type something new and create it. The directory grows
// itself — that is the whole point, so the same shop is never typed twice.
function PayeePicker({ payees, trade, value, name, onPick, onCreate }) {
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
  // Rank the trade's own payees first, never filter — you buy cement from the
  // hardware shop whatever trade laid it.
  const matches = useMemo(() => {
    return payees
      .filter(p => !needle || p.name.toLowerCase().includes(needle))
      .sort((a, b) => {
        const am = a.trade === trade ? 0 : 1
        const bm = b.trade === trade ? 0 : 1
        return am - bm || a.name.localeCompare(b.name)
      })
      .slice(0, 8)
  }, [payees, needle, trade])
  const exact = payees.some(p => p.name.trim().toLowerCase() === needle)

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={open ? q : (name || '')}
        placeholder="Search or add a vendor…"
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
              + Add “{q.trim()}”{trade ? ` as ${trade}` : ''}
            </button>
          )}
          {matches.map(p => (
            <button key={p.id} type="button"
              onClick={() => { onPick(p); setOpen(false); setQ('') }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: value === p.id ? 'var(--bg-input, #252731)' : 'none', border: 'none', color: 'var(--text, #e8e8f0)', fontSize: 13, cursor: 'pointer', fontFamily: SANS }}>
              {p.name}
              {p.trade && <span style={{ color: p.trade === trade ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontSize: 11, fontFamily: MONO }}> · {p.trade}</span>}
            </button>
          ))}
          {!matches.length && !needle && (
            <div style={{ padding: '11px 12px', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
              No vendors yet — type a name to add the first.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PaymentSheet({ pid, payees, editing, recentTrades = [], onClose, onSaved, onPayeeCreated }) {
  const phone = useIsMobile(720)
  const [kind, setKind] = useState(editing?.kind || 'Material')
  const [trade, setTrade] = useState(editing?.trade || recentTrades[0] || '')
  const [description, setDescription] = useState(editing?.description || '')
  const [amount, setAmount] = useState(editing?.amount != null ? String(editing.amount) : '')
  const [material, setMaterial] = useState(editing?.material_cost != null ? String(editing.material_cost) : '')
  const [labour, setLabour] = useState(editing?.labour_cost != null ? String(editing.labour_cost) : '')
  const [payeeId, setPayeeId] = useState(editing?.payee_id || null)
  const [payeeName, setPayeeName] = useState(editing?.payee_name || '')
  const [paidOn, setPaidOn] = useState(editing?.paid_on || todayISO())
  const [method, setMethod] = useState(editing?.method || '')
  const [reference, setReference] = useState(editing?.reference || '')
  const [note, setNote] = useState(editing?.note || '')
  const [files, setFiles] = useState([])
  const [extras, setExtras] = useState(!!(editing?.method || editing?.reference || editing?.note))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState('')
  const descRef = useRef(null)

  const both = kind === 'Both'
  const total = both ? (cleanAmount(material) || 0) + (cleanAmount(labour) || 0) : (cleanAmount(amount) || 0)
  const valid = total > 0 && !!trade && !!description.trim() && !!paidOn
    && (!both || (cleanAmount(material) != null && cleanAmount(labour) != null))

  const orderedTrades = useMemo(() => {
    const seen = recentTrades.filter(t => TRADES.includes(t))
    return [...seen, ...TRADES.filter(t => !seen.includes(t))]
  }, [recentTrades])

  function reset() {
    setDescription(''); setAmount(''); setMaterial(''); setLabour('')
    setReference(''); setNote(''); setFiles([]); setErr('')
    descRef.current?.focus()
    // kind, trade, vendor, date and method persist — logging a day of one
    // vendor's invoices should not mean re-picking them each time
  }

  async function save(andAnother) {
    if (!valid || busy) return
    setBusy(true); setErr('')
    try {
      const row = {
        pid,
        paid_on: paidOn,
        kind,
        trade,
        description: description.trim(),
        payee_id: payeeId,
        payee_name: payeeName || null,
        amount: total,
        material_cost: both ? cleanAmount(material) : (kind === 'Material' ? total : null),
        labour_cost: both ? cleanAmount(labour) : (kind === 'Labour' ? total : null),
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
        setFlash(`${inr(total)} logged`)
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
        .insert({ name, trade: trade || null, created_by: user?.email || null })
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
      setErr(`Couldn’t add the vendor: ${e.message || e}`)
    }
  }

  // minWidth 0 matters: a grid child defaults to min-width:auto and refuses to
  // shrink below its input's intrinsic width, which pushed the labour box
  // straight out of the sheet.
  const amountBox = (value, onChange, ariaLabel, big) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, boxSizing: 'border-box', padding: big ? '9px 13px' : '7px 11px', background: 'var(--bg-input, #252731)', border: `1px solid ${cleanAmount(value) ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, borderRadius: 10 }}>
      <span style={{ fontSize: big ? 22 : 15, color: cleanAmount(value) ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>₹</span>
      <input value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" placeholder="0"
        aria-label={ariaLabel}
        style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', fontSize: big ? 26 : 16, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: MONO, padding: 0 }} />
    </div>
  )

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: phone ? 'flex-end' : 'center', justifyContent: 'center',
        padding: phone ? 0 : 20,
      }}>
      <div style={{
        width: '100%', maxWidth: 470, maxHeight: phone ? '94svh' : '90vh', overflowY: 'auto',
        background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)',
        borderRadius: phone ? '16px 16px 0 0' : 14, padding: 18,
        display: 'flex', flexDirection: 'column', gap: 17, fontFamily: SANS,
        paddingBottom: phone ? 'calc(18px + env(safe-area-inset-bottom))' : 18,
      }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>{editing ? 'Edit payment' : 'Log payment'}</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>PID {pid}</span>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>

        {/* 1 — what kind of spend */}
        <div>
          <span style={stepLabel}><span style={stepNum}>1</span> Material or labour</span>
          <div style={{ display: 'flex', gap: 7 }}>
            {KINDS.map(k => (
              <Chip key={k} wide on={kind === k} onClick={() => setKind(k)}>
                {k === 'Both' ? 'Both' : k}
              </Chip>
            ))}
          </div>
          {both && (
            <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 7, lineHeight: 1.5 }}>
              One invoice covering both — enter each part below and they add up.
            </div>
          )}
        </div>

        {/* 2 — what work it was for */}
        <div>
          <span style={stepLabel}><span style={stepNum}>2</span> Trade</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {orderedTrades.map(t => (
              <Chip key={t} on={trade === t} onClick={() => setTrade(t)}>{t}</Chip>
            ))}
          </div>
        </div>

        {/* 3 — what it actually was */}
        <div>
          <span style={stepLabel}><span style={stepNum}>3</span> Description</span>
          <input ref={descRef} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Bathroom tiles and grout" aria-label="Description" style={field} />
        </div>

        {/* 4 — how much */}
        <div>
          <span style={stepLabel}><span style={stepNum}>4</span> Amount</span>
          {both ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, display: 'block', marginBottom: 5 }}>Material</span>
                  {amountBox(material, setMaterial, 'Material amount', false)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, display: 'block', marginBottom: 5 }}>Labour</span>
                  {amountBox(labour, setLabour, 'Labour amount', false)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 13px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Total</span>
                <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, color: total ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{inr(total)}</span>
              </div>
            </div>
          ) : amountBox(amount, setAmount, 'Amount paid', true)}
        </div>

        {/* Who and when — needed, but never the thing being decided. */}
        <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ ...stepLabel, marginBottom: 6 }}>Paid to</span>
            <PayeePicker payees={payees} trade={trade} value={payeeId} name={payeeName}
              onPick={p => { setPayeeId(p.id); setPayeeName(p.name) }} onCreate={createPayee} />
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ ...stepLabel, marginBottom: 6 }}>Date</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <Chip on={paidOn === todayISO()} onClick={() => setPaidOn(todayISO())}>Today</Chip>
              <Chip on={paidOn === shiftISO(-1)} onClick={() => setPaidOn(shiftISO(-1))}>Yesterday</Chip>
              <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} aria-label="Payment date"
                style={{ ...field, flex: 1, minWidth: 130, padding: '8px 10px', fontSize: 13 }} />
            </div>
          </div>
        </div>

        {/* 5 — invoice, explicitly optional */}
        <div>
          <span style={stepLabel}>
            <span style={stepNum}>5</span> Invoice
            <span style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 400, color: 'var(--text-muted, #6b6d82)' }}>· optional</span>
          </span>
          <input type="file" accept="image/*,application/pdf" multiple
            onChange={e => setFiles([...e.target.files])}
            style={{ ...field, padding: '9px 11px', fontSize: 12, cursor: 'pointer' }} />
          {files.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, marginTop: 6 }}>
              {files.length} file{files.length === 1 ? '' : 's'} ready — photos are compressed on upload
            </div>
          )}
        </div>

        {/* 6 — note and the rest */}
        <div>
          <span style={stepLabel}>
            <span style={stepNum}>6</span> Note
            <span style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 400, color: 'var(--text-muted, #6b6d82)' }}>· optional</span>
          </span>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Anything worth remembering about this payment"
            aria-label="Note" style={{ ...field, resize: 'vertical' }} />
          <button type="button" onClick={() => setExtras(x => !x)}
            style={{ marginTop: 8, padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>
            {extras ? '− Hide payment mode' : '+ Payment mode and reference'}
          </button>
          {extras && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {METHODS.map(m => (
                  <Chip key={m} on={method === m} onClick={() => setMethod(method === m ? '' : m)}>{m}</Chip>
                ))}
              </div>
              <input value={reference} onChange={e => setReference(e.target.value)}
                placeholder="Invoice no, UTR, cheque no" aria-label="Reference" style={field} />
            </div>
          )}
        </div>

        {err && (
          <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO, lineHeight: 1.5 }}>{err}</div>
        )}
        {flash && (
          <div style={{ padding: '10px 12px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>{flash} · next one ready</div>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button type="button" disabled={!valid || busy} onClick={() => save(false)}
            style={{
              flex: 1, minWidth: 120, minHeight: 46, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, fontFamily: SANS,
              background: valid ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
              color: valid ? '#1a1408' : 'var(--text-muted, #6b6d82)',
              cursor: busy ? 'wait' : valid ? 'pointer' : 'not-allowed',
            }}>
            {busy ? 'Saving…' : editing ? 'Save changes' : `Save${total ? ` ${inr(total)}` : ''}`}
          </button>
          {!editing && (
            <button type="button" disabled={!valid || busy} onClick={() => save(true)}
              title="Keeps the kind, trade, vendor and date for the next one"
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
