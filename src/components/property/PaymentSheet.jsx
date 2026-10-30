import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useIsMobile } from '../../hooks/useIsMobile'
import { KINDS, TRADES, METHODS, UNITS, cleanAmount, cleanQty, fmtQty, lineAmount, itemsTotal, inr, todayISO, shiftISO, uploadBill, billUrl } from '../../utils/payments'

// The form follows how a payment is actually thought about, in order:
//   what kind of spend  →  what work it was for  →  what it was  →  how much
//   →  invoice (optional)  →  note (optional)
// Amount deliberately does not come first: until you have said what the money
// was for, the number has no meaning to file it under.
//
// Step 4 can be itemised. Folded away it is the single ₹ box it always was;
// opened, it is the invoice line by line — quantity, unit, rate — because
// "12 door handles at ₹450" used to save as ₹5,400 and lose both numbers.
// It stays folded by default: most payments are one number and should not have
// to walk past a table to get typed.

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

const miniLabel = { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, display: 'block', marginBottom: 5 }

// One line of an invoice. The three boxes are the same boxed-input-with-a-tiny-
// label pattern the material/labour split already uses, so an itemised payment
// does not look like a different product from a plain one.
function ItemRow({ item, index, single, showKind, onChange, onRemove }) {
  const set = (k) => (v) => onChange({ ...item, [k]: v })
  const computed = cleanQty(item.quantity) != null && cleanAmount(item.unit_rate) != null
  const amount = lineAmount(item)

  const box = (value, onInput, ariaLabel, mode = 'decimal') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, boxSizing: 'border-box', padding: '7px 10px', background: 'var(--bg-input, #252731)', border: `1px solid ${value ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, borderRadius: 9 }}>
      <input value={value} onChange={e => onInput(e.target.value)} inputMode={mode} aria-label={ariaLabel}
        placeholder={ariaLabel === 'Unit' ? 'pcs' : '0'} list={ariaLabel === 'Unit' ? 'payment-units' : undefined}
        style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', fontSize: 15, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: MONO, padding: 0 }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 12px', background: 'var(--bg-sunken, #14151c)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
      {/* With one line, the description is step 3's — asking for it twice is
          the sort of thing that makes people stop itemising. */}
      {!single && (
        <input value={item.description || ''} onChange={e => set('description')(e.target.value)}
          placeholder={`Line ${index + 1} — what it was`} aria-label={`Line ${index + 1} description`}
          style={{ ...field, padding: '8px 10px', fontSize: 13 }} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.25fr)', gap: 8 }}>
        <div style={{ minWidth: 0 }}><span style={miniLabel}>Qty</span>{box(item.quantity || '', set('quantity'), 'Quantity')}</div>
        <div style={{ minWidth: 0 }}><span style={miniLabel}>Unit</span>{box(item.unit || '', set('unit'), 'Unit', 'text')}</div>
        <div style={{ minWidth: 0 }}><span style={miniLabel}>Rate ₹</span>{box(item.unit_rate || '', set('unit_rate'), 'Rate per unit')}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Computed when there is a quantity and a rate; typeable when the line
            is a lump sum, because "site cleaning ₹2,000" has no quantity and
            inventing one would be a lie in the data. */}
        {computed ? (
          <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            {fmtQty(cleanQty(item.quantity))}{item.unit ? ' ' + item.unit : ''} × {inr(cleanAmount(item.unit_rate))} =
            <b style={{ color: 'var(--accent, #c8963e)', fontSize: 13, marginLeft: 5 }}>{inr(amount)}</b>
          </span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg-input, #252731)', border: `1px solid ${cleanAmount(item.amount) ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, borderRadius: 9 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>₹</span>
            <input value={item.amount || ''} onChange={e => set('amount')(e.target.value)} inputMode="decimal"
              placeholder="line total" aria-label={`Line ${index + 1} amount`}
              style={{ width: 92, border: 'none', background: 'none', outline: 'none', fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: MONO, padding: 0 }} />
          </div>
        )}

        {/* Only on a mixed invoice, and the reason it is here: tag the lines
            and the material/labour split is arithmetic instead of two numbers
            somebody types again further down. */}
        {showKind && (
          <div style={{ display: 'flex', gap: 5 }}>
            {['Material', 'Labour'].map(k => (
              <button key={k} type="button" onClick={() => set('kind')(item.kind === k ? null : k)}
                style={{ minHeight: 28, padding: '0 10px', borderRadius: 14, fontSize: 11, cursor: 'pointer', fontFamily: MONO,
                  border: `1px solid ${item.kind === k ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
                  background: item.kind === k ? 'rgba(200,150,62,0.14)' : 'var(--bg-input, #252731)',
                  color: item.kind === k ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
                  fontWeight: item.kind === k ? 700 : 400 }}>
                {k === 'Material' ? 'Mat' : 'Lab'}
              </button>
            ))}
          </div>
        )}

        <button type="button" onClick={onRemove} aria-label={`Remove line ${index + 1}`}
          style={{ marginLeft: 'auto', minHeight: 28, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11, cursor: 'pointer', fontFamily: MONO }}>
          Remove
        </button>
      </div>
    </div>
  )
}

const blankItem = () => ({ key: crypto.randomUUID(), description: '', quantity: '', unit: '', unit_rate: '', amount: '', kind: null })

export default function PaymentSheet({ pid, payees, editing, recentTrades = [], itemsEnabled = true, onClose, onSaved, onPayeeCreated }) {
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
  const [noBill, setNoBill] = useState(!!editing?.no_bill)
  const [files, setFiles] = useState([])
  const [existing, setExisting] = useState(editing?.property_payment_bills || [])
  const [extras, setExtras] = useState(!!(editing?.method || editing?.reference || editing?.note))
  // Opened automatically when the payment being edited already has lines, so
  // an itemised payment never looks like it lost its detail on the way back in.
  const [items, setItems] = useState(() =>
    (editing?.property_payment_items || [])
      .slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(it => ({
        key: it.id, description: it.description || '',
        quantity: it.quantity != null ? fmtQty(it.quantity) : '',
        unit: it.unit || '', unit_rate: it.unit_rate != null ? String(it.unit_rate) : '',
        amount: it.amount != null ? String(it.amount) : '', kind: it.kind || null,
      })))
  const [itemised, setItemised] = useState(!!(editing?.property_payment_items || []).length)
  // Null means "the lines are the total". A string means somebody typed a
  // different one — a discount, a round figure — which is allowed, because a
  // form that refuses to store the invoice as written just gets worked around.
  const [overrideTotal, setOverrideTotal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState('')
  const descRef = useRef(null)

  const both = kind === 'Both'
  const single = items.length === 1
  const linesTotal = itemsTotal(items)
  const total = itemised
    ? (overrideTotal != null ? (cleanAmount(overrideTotal) || 0) : linesTotal)
    : both ? (cleanAmount(material) || 0) + (cleanAmount(labour) || 0) : (cleanAmount(amount) || 0)
  const drift = itemised && overrideTotal != null ? Math.round((total - linesTotal) * 100) / 100 : 0

  // The split, derived from the lines when they carry a tag. Whatever the tags
  // do not cover is reported rather than quietly pushed onto one side.
  const lineSplit = useMemo(() => {
    const m = items.filter(i => i.kind === 'Material').reduce((n, i) => n + lineAmount(i), 0)
    const l = items.filter(i => i.kind === 'Labour').reduce((n, i) => n + lineAmount(i), 0)
    return { material: m, labour: l, untagged: Math.round((linesTotal - m - l) * 100) / 100 }
  }, [items, linesTotal])

  const linesValid = items.length > 0
    && items.every(i => lineAmount(i) > 0)
    && (single || items.every(i => (i.description || '').trim()))
  const valid = total > 0 && !!trade && !!description.trim() && !!paidOn
    && (itemised
      ? linesValid && (!both || lineSplit.untagged === 0 || (cleanAmount(material) != null && cleanAmount(labour) != null))
      : !both || (cleanAmount(material) != null && cleanAmount(labour) != null))

  const orderedTrades = useMemo(() => {
    const seen = recentTrades.filter(t => TRADES.includes(t))
    return [...seen, ...TRADES.filter(t => !seen.includes(t))]
  }, [recentTrades])

  function reset() {
    setDescription(''); setAmount(''); setMaterial(''); setLabour('')
    setReference(''); setNote(''); setFiles([]); setNoBill(false); setErr('')
    setItems(itemised ? [blankItem()] : []); setOverrideTotal(null)
    descRef.current?.focus()
    // kind, trade, vendor, date and method persist — logging a day of one
    // vendor's invoices should not mean re-picking them each time
  }

  // Detaching an invoice removes the row and the stored file together; a
  // payment's invoice has no life of its own once it is off the payment.
  async function removeBill(b) {
    setErr('')
    const { error } = await supabase.from('property_payment_bills').delete().eq('id', b.id)
    if (error) { setErr(`Couldn’t remove the invoice: ${error.message}`); return }
    await supabase.storage.from('property-bills').remove([b.path])
    setExisting(prev => prev.filter(x => x.id !== b.id))
    onSaved()
  }

  async function openBill(b) {
    const url = await billUrl(b.path)
    if (url) window.open(url, '_blank', 'noopener')
    else setErr('Couldn’t open that invoice.')
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
        // Tagged lines beat typed boxes — they are a more specific record of
        // the same fact, and they cannot disagree with the lines they came from.
        material_cost: itemised && both && lineSplit.untagged === 0 ? lineSplit.material
          : both ? cleanAmount(material)
          : (kind === 'Material' ? total : null),
        labour_cost: itemised && both && lineSplit.untagged === 0 ? lineSplit.labour
          : both ? cleanAmount(labour)
          : (kind === 'Labour' ? total : null),
        method: method || null,
        reference: reference.trim() || null,
        note: note.trim() || null,
        // a bill being attached now outweighs an earlier "no bill"
        no_bill: noBill && !files.length,
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

      // Lines are rewritten wholesale rather than diffed. There are a handful
      // of them, they carry no history of their own, and a diff that gets one
      // edge case wrong loses a line without saying so.
      //
      // Gated on itemsEnabled, not just on `editing`: where the lines table
      // does not exist yet, this clean-up was firing on every edit of every
      // payment and failing the save with "could not find the table".
      if (editing && itemsEnabled) {
        const { error } = await supabase.from('property_payment_items').delete().eq('payment_id', paymentId)
        if (error) throw error
      }
      if (itemsEnabled && itemised && items.length) {
        const rows = items.map((it, i) => ({
          payment_id: paymentId,
          position: i,
          description: (single ? description.trim() : (it.description || '').trim()) || null,
          quantity: cleanQty(it.quantity),
          unit: (it.unit || '').trim() || null,
          unit_rate: cleanAmount(it.unit_rate),
          amount: lineAmount(it),
          kind: both ? (it.kind || null) : null,
        }))
        const { error } = await supabase.from('property_payment_items').insert(rows)
        if (error) throw error
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

          {itemised ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {items.map((it, i) => (
                <ItemRow key={it.key} item={it} index={i} single={single} showKind={both}
                  onChange={next => setItems(prev => prev.map((x, j) => (j === i ? next : x)))}
                  onRemove={() => setItems(prev => {
                    const left = prev.filter((_, j) => j !== i)
                    // The last line going is the same intent as closing the
                    // itemiser, so it closes rather than leaving an empty table.
                    if (!left.length) { setItemised(false); setOverrideTotal(null) }
                    return left
                  })} />
              ))}

              <button type="button"
                onClick={() => setItems(prev => {
                  // The first line was the payment's own description. Writing
                  // it onto that line as a second one appears keeps it from
                  // disappearing the moment the invoice stops being one thing.
                  const seeded = prev.length === 1 && !prev[0].description
                    ? [{ ...prev[0], description: description.trim() }]
                    : prev
                  return [...seeded, blankItem()]
                })}
                style={{ alignSelf: 'flex-start', padding: 0, background: 'none', border: 'none', color: 'var(--accent, #c8963e)', fontSize: 12.5, cursor: 'pointer', fontFamily: MONO }}>
                + Add another line
              </button>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 13px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                  {items.length === 1 ? 'Total' : `${items.length} lines`}
                </span>
                {overrideTotal != null ? (
                  <div style={{ marginLeft: 'auto', width: 150 }}>{amountBox(overrideTotal, setOverrideTotal, 'Invoice total', false)}</div>
                ) : (
                  <span style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, color: total ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{inr(total)}</span>
                )}
              </div>

              {/* With every line tagged, the split below is arithmetic. Until
                  then it still has to be typed, and it says how much is
                  waiting on a tag. */}
              {both && (
                lineSplit.untagged === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                    <span>From the lines:</span>
                    <span style={{ color: 'var(--text-dim, #9394a8)' }}>{inr(lineSplit.material)} material</span>
                    <span style={{ color: 'var(--text-dim, #9394a8)' }}>{inr(lineSplit.labour)} labour</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
                      {inr(lineSplit.untagged)} of the lines {lineSplit.untagged === linesTotal ? 'is' : 'is still'} untagged — tag each line Mat or Lab and the split below fills itself in.
                    </span>
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
                  </div>
                )
              )}
              {/* A bill is allowed to differ from its lines — discounts and
                  round figures are real. The difference is shown rather than
                  silently absorbed into one of the two numbers. */}
              {overrideTotal == null ? (
                <button type="button" onClick={() => setOverrideTotal(String(linesTotal))}
                  style={{ alignSelf: 'flex-start', padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
                  The invoice total is different — discount or rounding
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: drift ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                    {drift === 0
                      ? `Same as the lines (${inr(linesTotal)})`
                      : `${inr(Math.abs(drift))} ${drift < 0 ? 'less' : 'more'} than the lines (${inr(linesTotal)})`}
                  </span>
                  <button type="button" onClick={() => setOverrideTotal(null)}
                    style={{ padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
                    use the line total
                  </button>
                </div>
              )}

            </div>
          ) : both ? (
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

          {/* Same disclosure as the payment mode below, for the same reason:
              most payments are one number, and should not have to walk past a
              table of quantities to get typed. */}
          {itemsEnabled && <button type="button"
            onClick={() => {
              if (itemised) { setItemised(false); setOverrideTotal(null); return }
              // Carry the number already typed into the first line's rate, so
              // opening the itemiser never costs you what you had.
              const started = cleanAmount(both ? '' : amount)
              setItems([{ ...blankItem(), amount: started != null ? String(started) : '' }])
              setItemised(true)
            }}
            style={{ marginTop: 8, padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>
            {itemised ? '− Just a total' : '+ Quantity, unit and rate'}
          </button>}
          <datalist id="payment-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
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
          {/* What is already attached, and a way to take it off again. Editing
              could previously only ever add — a wrong invoice was stuck to the
              payment for good. */}
          {existing.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 9 }}>
              {existing.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.filename || 'invoice'}
                  </span>
                  <button type="button" onClick={() => openBill(b)}
                    style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 10.5, cursor: 'pointer', fontFamily: MONO }}>View</button>
                  <button type="button" onClick={() => removeBill(b)} aria-label={`Remove ${b.filename || 'invoice'}`}
                    style={{ padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--red, #b0645b)', fontSize: 10.5, cursor: 'pointer', fontFamily: MONO }}>Remove</button>
                </div>
              ))}
            </div>
          )}
          {/* Two pickers, not one. A single input that takes images and PDFs
              opens Android's document browser, which hides the camera and the
              gallery — so a photographed bill looked impossible to attach.
              "Photo" opens camera + gallery; "PDF" opens files. Picks add up. */}
          {noBill ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)' }}>
              <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-dim, #9394a8)' }}>🚫 No bill for this payment</span>
              <button type="button" onClick={() => setNoBill(false)}
                style={{ minHeight: 32, padding: '0 10px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--accent, #c8963e)', fontSize: 11.5, fontFamily: MONO, cursor: 'pointer' }}>Attach one instead</button>
            </div>
          ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ ...field, flex: '1 1 140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, padding: '0 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--accent, #c8963e)' }}>
              📷 Photo of the bill
              <input type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={e => { const add = [...e.target.files]; e.target.value = ''; setFiles(fs => [...fs, ...add]) }} />
            </label>
            <label style={{ ...field, flex: '1 1 140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44, padding: '0 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--accent, #c8963e)' }}>
              📄 PDF
              <input type="file" accept="application/pdf,image/*" multiple style={{ display: 'none' }}
                onChange={e => { const add = [...e.target.files]; e.target.value = ''; setFiles(fs => [...fs, ...add]) }} />
            </label>
          </div>
          )}
          {!noBill && !files.length && !existing.length && (
            <button type="button" onClick={() => setNoBill(true)}
              style={{ marginTop: 8, minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px dashed var(--border-dash, #3a3d52)', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 12, fontFamily: MONO, cursor: 'pointer' }}>
              🚫 No bill for this payment
            </button>
          )}
          {files.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {files.map((f, i) => (
                <div key={i + f.name} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8 }}>
                  <span aria-hidden style={{ fontSize: 14 }}>{f.type === 'application/pdf' || /\.pdf$/i.test(f.name) ? '📄' : '🖼'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{(f.size / 1e6).toFixed(1)} MB</span>
                  <button type="button" onClick={() => setFiles(fs => fs.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`}
                    style={{ minWidth: 30, minHeight: 30, border: 'none', background: 'none', color: 'var(--red, #b0645b)', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              ))}
              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Photos are compressed on upload.</div>
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
          <div style={{ padding: '10px 12px', background: 'rgba(176,100,91,0.10)', border: '1px solid rgba(176,100,91,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--red, #b0645b)', fontFamily: MONO, lineHeight: 1.5 }}>{err}</div>
        )}
        {flash && (
          <div style={{ padding: '10px 12px', background: 'rgba(111,154,126,0.10)', border: '1px solid rgba(111,154,126,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--green, #6f9a7e)', fontFamily: MONO }}>{flash} · next one ready</div>
        )}

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          <button type="button" disabled={!valid || busy} onClick={() => save(false)}
            style={{
              flex: 1, minWidth: 120, minHeight: 46, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, fontFamily: SANS,
              background: valid ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
              color: valid ? 'var(--on-accent, #1a1408)' : 'var(--text-muted, #6b6d82)',
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
