import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { initials, avatarColor } from '../../utils/vendorHub'
import InvoiceDoc from '../../components/vendor/InvoiceDoc'
import InvoiceFlow from './InvoiceFlow'
import ShareLinks from '../../components/vendor/ShareLinks'
import { INVOICE_STATUS, STATUS_ORDER, inr, sumLines, sendBlockers, monthLabel } from '../../utils/vendorInvoice'

// The signature stage: reviewed → invoiced → signed → final.
//
// Each vendor gets an invoice raised in their name against Slaash Technologies
// for the trade work they did, split across the PIDs staff pick here. It is
// emailed as a tokenised link, they sign it, and the signed copy is held
// against the payout line.
//
// Two rules this screen exists to enforce:
//   - An invoice cannot be sent until its PID split adds back up to the total.
//     A half-allocated invoice is a document that disagrees with itself.
//   - Once sent, it is frozen. The database refuses edits too; this just makes
//     the refusal visible before someone tries.

const MONO = 'var(--font-mono, monospace)'

const inp = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 15, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }
const lbl = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: MONO }
const actBtn = { padding: '8px 13px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: MONO, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', minHeight: 38 }
const primaryBtn = { ...actBtn, background: 'var(--accent, #c8963e)', color: '#1a1408', border: 'none', fontWeight: 700 }

function Err({ children, onClose }) {
  if (!children) return null
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word', display: 'flex', gap: 8 }}>
      <span style={{ flex: 1 }}>⚠ {children}</span>
      {onClose && <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>×</button>}
    </div>
  )
}

function Chip({ status }) {
  const m = INVOICE_STATUS[status] || INVOICE_STATUS.none
  return (
    <span title={m.hint} style={{ fontSize: 9.5, fontWeight: 700, fontFamily: MONO, color: m.color, border: `1px solid ${m.color}`, borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</span>
  )
}

function Ava({ name, size = 32 }) {
  const c = avatarColor(name || '?')
  return <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, fontFamily: MONO, background: c + '22', color: c, border: `1px solid ${c}55` }}>{initials(name || '?')}</span>
}

function Sheet({ title, subtitle, onClose, children, wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(8,9,13,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: wide ? 820 : 560, maxHeight: '93vh', overflowY: 'auto', background: 'var(--bg-panel, #1e2028)', borderRadius: '16px 16px 0 0', borderTop: '1px solid var(--border, #2e3040)', padding: '16px 18px 34px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border, #2e3040)', margin: '-4px auto 0', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: 0 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── billing entity (bill-to) ─────────────────────────────────────────────────
const ENTITY_FIELDS = [
  ['legal_name', 'Legal name', 'Slaash Technologies Pvt Ltd'],
  ['address_line', 'Registered address', 'Street, area'],
  ['city', 'City', 'Bengaluru'],
  ['state', 'State', 'Karnataka'],
  ['state_code', 'State code', '29'],
  ['pincode', 'PIN', '560001'],
  ['gstin', 'GSTIN', '29AABCS1234A1Z5'],
  ['cin', 'CIN', 'U72900KA2020PTC123456'],
  ['pan', 'PAN', 'AABCS1234A'],
  ['email', 'Email', 'accounts@slaash.com'],
  ['phone', 'Phone', '+91 …'],
]

export function BillingEntitySheet({ onClose }) {
  const [row, setRow] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.from('payroll_billing_entity').select('*').eq('id', 1).maybeSingle()
      .then(({ data, error }) => { setErr(error ? error.message : ''); setRow(data || { id: 1 }) })
  }, [])

  async function save() {
    setBusy(true); setErr(''); setSaved(false)
    const patch = { id: 1, updated_at: new Date().toISOString() }
    for (const [k] of ENTITY_FIELDS) patch[k] = (row[k] || '').trim() || null
    const { error } = await supabase.from('payroll_billing_entity').upsert(patch)
    if (error) setErr(error.message); else setSaved(true)
    setBusy(false)
  }

  return (
    <Sheet title="Billing entity" subtitle="Appears as “Bill to” on every vendor invoice" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.55 }}>
        Vendors raise their invoices on this entity. Blank fields are simply left off the document.
      </div>
      {row === null ? <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {ENTITY_FIELDS.map(([k, label, ph]) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: (k === 'legal_name' || k === 'address_line') ? '1 / -1' : 'auto' }}>
              <span style={lbl}>{label}</span>
              <input style={inp} value={row[k] || ''} placeholder={ph} onChange={e => setRow(r => ({ ...r, [k]: e.target.value }))} />
            </label>
          ))}
        </div>
      )}
      <Err>{err}</Err>
      {saved && <div style={{ fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>✓ Saved.</div>}
      <button type="button" onClick={save} disabled={busy || !row} style={{ ...primaryBtn, minHeight: 46, fontSize: 14 }}>{busy ? 'Saving…' : 'Save'}</button>
    </Sheet>
  )
}

// ── the PID split editor ─────────────────────────────────────────────────────
function SplitSheet({ invoice, lines: initial, properties, onClose, onSaved }) {
  const locked = invoice.status !== 'draft'
  const [lines, setLines] = useState(() =>
    (initial.length ? initial : [{ id: 'new-0', pid: '', description: '', amount: invoice.subtotal, sort: 0 }])
      .map((l, i) => ({ ...l, sort: i })))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const allocated = sumLines(lines)
  const remaining = Math.round(Number(invoice.subtotal || 0) - allocated)

  const upd = (i, patch) => setLines(ls => ls.map((l, k) => k === i ? { ...l, ...patch } : l))
  const add = () => setLines(ls => [...ls, { id: 'new-' + Date.now(), pid: '', description: ls[0]?.description || '', amount: Math.max(0, remaining), sort: ls.length }])
  const del = (i) => setLines(ls => ls.filter((_, k) => k !== i))

  // Even split, with the rounding remainder pushed onto the first line so the
  // total still reconciles exactly rather than being a rupee or two out.
  function splitEven() {
    const n = lines.length
    if (!n) return
    const total = Math.round(Number(invoice.subtotal || 0))
    const each = Math.floor(total / n)
    setLines(ls => ls.map((l, i) => ({ ...l, amount: i === 0 ? total - each * (n - 1) : each })))
  }

  async function save() {
    setBusy(true); setErr('')
    try {
      const { error: dErr } = await supabase.from('vendor_invoice_lines').delete().eq('invoice_id', invoice.id)
      if (dErr) throw dErr
      const rows = lines.map((l, i) => ({
        invoice_id: invoice.id,
        pid: (l.pid || '').trim() || null,
        description: (l.description || '').trim() || null,
        amount: Number(l.amount || 0),
        sort: i,
      }))
      if (rows.length) {
        const { error: iErr } = await supabase.from('vendor_invoice_lines').insert(rows)
        if (iErr) throw iErr
      }
      onSaved()
    } catch (e) { setErr(e.message || String(e)); setBusy(false) }
  }

  return (
    <Sheet wide title={invoice._name || 'Invoice'} subtitle={`${invoice.invoice_no} · gross ${inr(invoice.subtotal)}`} onClose={onClose}>
      {locked && (
        <div style={{ padding: '10px 12px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 8, fontSize: 12, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
          Already sent — the split is locked. Void it and raise a new invoice to change anything.
        </div>
      )}

      <datalist id="pid-options">
        {properties.map(p => <option key={p.pid} value={p.pid}>{p.name || ''}</option>)}
      </datalist>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lines.map((l, i) => (
          <div key={l.id ?? i} style={{ display: 'grid', gridTemplateColumns: '86px 1fr 116px 34px', gap: 8, alignItems: 'center' }}>
            <input style={inp} list="pid-options" value={l.pid || ''} readOnly={locked} placeholder="PID"
              onChange={e => upd(i, { pid: e.target.value })} />
            <input style={inp} value={l.description || ''} readOnly={locked} placeholder="Description of work"
              onChange={e => upd(i, { description: e.target.value })} />
            <input style={{ ...inp, textAlign: 'right', fontFamily: MONO }} inputMode="decimal" readOnly={locked}
              value={l.amount ?? ''} onChange={e => upd(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} />
            {!locked && lines.length > 1
              ? <button type="button" onClick={() => del(i)} title="Remove line"
                  style={{ background: 'none', border: 'none', color: 'var(--red, #e05c6a)', cursor: 'pointer', fontSize: 15, padding: 6 }}>✕</button>
              : <span />}
          </div>
        ))}
      </div>

      {!locked && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={add} style={actBtn}>+ Add PID</button>
          <button type="button" onClick={splitEven} style={actBtn}>Split evenly</button>
          <span style={{ marginInlineStart: 'auto', fontSize: 12, fontFamily: MONO, color: remaining === 0 ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)' }}>
            {remaining === 0 ? '✓ Fully allocated' : remaining > 0 ? `${inr(remaining)} left to allocate` : `${inr(-remaining)} over`}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 13px', background: 'var(--bg-input, #252731)', borderRadius: 9, fontFamily: MONO, fontSize: 12.5 }}>
        <span style={{ color: 'var(--text-muted, #6b6d82)' }}>Allocated / gross</span>
        <span style={{ fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{inr(allocated)} / {inr(invoice.subtotal)}</span>
      </div>

      <Err>{err}</Err>
      {!locked && (
        <button type="button" onClick={save} disabled={busy} style={{ ...primaryBtn, minHeight: 46, fontSize: 14 }}>
          {busy ? 'Saving…' : 'Save split'}
        </button>
      )}
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function InvoiceStage({ period, payouts, onChanged }) {
  const [invoices, setInvoices] = useState(null)
  const [lines, setLines] = useState({})
  const [properties, setProperties] = useState([])
  const [vendors, setVendors] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(null)
  const [preview, setPreview] = useState(null)
  const [entityOpen, setEntityOpen] = useState(false)
  const [note, setNote] = useState('')
  const [flowOpen, setFlowOpen] = useState(false)

  const load = useCallback(async () => {
    const [{ data: inv, error: iErr }, { data: props }, { data: vends }] = await Promise.all([
      supabase.from('vendor_invoices').select('*').eq('period_id', period.id),
      supabase.from('properties').select('pid,name').order('pid'),
      supabase.from('vendors').select('id,full_name,email,phone').eq('status', 'approved'),
    ])
    if (iErr) { setErr(iErr.message); setInvoices([]); return }
    setInvoices(inv || [])
    setProperties(props || [])
    setVendors(Object.fromEntries((vends || []).map(v => [v.id, v])))
    const ids = (inv || []).map(i => i.id)
    if (ids.length) {
      const { data: ln } = await supabase.from('vendor_invoice_lines').select('*').in('invoice_id', ids).order('sort')
      const m = {}
      for (const l of ln || []) (m[l.invoice_id] = m[l.invoice_id] || []).push(l)
      setLines(m)
    } else setLines({})
  }, [period.id])

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  // One row per payout line, whether or not it has an invoice yet — otherwise a
  // vendor who was never invoiced quietly vanishes from the stage that exists
  // to catch exactly that.
  // An address on two vendor records means an emailed link could reach the
  // wrong person's pay. There is one such pair in the roster today.
  const sharedEmails = useMemo(() => {
    const seen = {}, dupes = new Set()
    for (const v of Object.values(vendors)) {
      const e = (v.email || '').trim().toLowerCase()
      if (!e) continue
      if (seen[e]) dupes.add(e); else seen[e] = true
    }
    return dupes
  }, [vendors])

  const rows = useMemo(() => {
    const byPayout = {}
    for (const i of invoices || []) byPayout[i.payout_id] = i
    return (payouts || []).map(p => {
      const inv = byPayout[p.id]
      const ln = inv ? (lines[inv.id] || []) : []
      const status = inv ? inv.status : 'none'
      // A payout edited after its invoice was frozen no longer matches what the
      // vendor was asked to sign. Silent divergence is the whole risk here.
      const drifted = inv && inv.status !== 'draft' && Math.round(Number(inv.net_payable || 0)) !== Math.round(Number(p.total_payout || 0))
      const v = vendors[p.vendor_id] || {}
      return {
        payout: p, invoice: inv, lines: ln, status, drifted,
        name: p.beneficiary_name || v.full_name || '—',
        phone: v.phone, email: v.email,
        sharedEmail: sharedEmails.has((v.email || '').trim().toLowerCase()),
        link: inv?.token ? `${window.location.origin}/vi/${inv.token}` : null,
        blockers: inv ? sendBlockers(inv, ln) : ['No invoice raised'],
      }
    }).sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name))
  }, [payouts, invoices, lines, vendors, sharedEmails])

  const counts = useMemo(() => {
    const c = { none: 0, draft: 0, sent: 0, viewed: 0, signed: 0, void: 0 }
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1
    return c
  }, [rows])

  const readyToSend = rows.filter(r => r.invoice && r.invoice.status === 'draft' && r.blockers.length === 0)
  const missing = (payouts || []).length - (invoices || []).length
  const allSigned = rows.length > 0 && rows.every(r => r.status === 'signed' || r.status === 'void')

  // Freeze the document and hand back its link.
  //
  // There is no mail server to hand this to — no function to deploy, no secret
  // to set, no verified domain — so "send" means: snapshot it, mark it issued,
  // and give the staff member the link to pass on from their own WhatsApp or
  // mail client. That is also better deliverability than an unauthenticated
  // domain would have had, since sixteen of seventeen vendors are on Gmail.
  const issue = useCallback(async (ids) => {
    if (!ids.length) return []
    setBusy('send'); setErr(''); setNote('')
    const out = []
    const failed = []
    for (const id of ids) {
      const { data, error } = await supabase.rpc('invoice_prepare_send', { p_invoice_id: id })
      if (error) { failed.push(error.message); continue }
      out.push({ id, token: data?.token, invoiceNo: data?.invoice_no, net: data?.net_payable, snapshot: data?.snapshot })
    }
    setBusy('')
    if (failed.length) setErr(`${failed.length} couldn't be issued — ${failed[0]}`)
    if (out.length) setNote(`${out.length} invoice${out.length === 1 ? '' : 's'} issued. Send the links below.`)
    await load()
    return out
  }, [load])

  // One entry point for the whole PID pass: raise anything missing, then open
  // the cards. Two buttons for "make the invoices" and "fill them in" is a
  // distinction that matters to the database, not to the person doing the work.
  async function startFlow() {
    setErr(''); setNote('')
    if (missing > 0) {
      setBusy('gen')
      const { error } = await supabase.rpc('invoice_generate_for_period', { p_period_id: period.id })
      setBusy('')
      if (error) { setErr(error.message); return }
      await load()
    }
    setFlowOpen(true)
  }

  async function voidInvoice(inv) {
    if (!window.confirm(`Void ${inv.invoice_no}? The vendor's link stops working and you can raise a fresh one.`)) return
    setErr('')
    const { error } = await supabase.from('vendor_invoices').update({ status: 'void' }).eq('id', inv.id)
    if (error) { setErr(error.message); return }
    load()
  }

  async function reraise(inv) {
    if (!window.confirm(`Delete ${inv.invoice_no} and raise a fresh draft from the current payout figures?`)) return
    setErr('')
    const { error } = await supabase.from('vendor_invoices').delete().eq('id', inv.id)
    if (error) { setErr(error.message); return }
    await supabase.rpc('invoice_generate_for_period', { p_period_id: period.id })
    load()
  }


  if (invoices === null) {
    return <div style={{ padding: 22, fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading invoices…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* progress */}
      <div style={{ padding: 14, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>Invoices · {monthLabel(period.period_month)}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            {counts.signed} of {rows.length} signed
          </span>
          <button type="button" onClick={() => setEntityOpen(true)} style={{ ...actBtn, marginInlineStart: 'auto' }}>Bill-to details</button>
        </div>

        <div style={{ height: 6, background: 'var(--bg-input, #252731)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${rows.length ? (counts.signed / rows.length) * 100 : 0}%`, background: 'var(--green, #3dba7a)', transition: 'width .2s' }} />
          <div style={{ width: `${rows.length ? ((counts.sent + counts.viewed) / rows.length) * 100 : 0}%`, background: 'var(--accent, #c8963e)', transition: 'width .2s' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {!allSigned && (
            <button type="button" onClick={startFlow} disabled={busy === 'gen'} style={{ ...primaryBtn, padding: '10px 16px', fontSize: 13 }}>
              {busy === 'gen' ? 'Raising…' : missing > 0 ? `▸ Raise & set PIDs · ${missing}` : '▸ Set PIDs one by one'}
            </button>
          )}
          {readyToSend.length > 0 && (
            <button type="button" onClick={() => issue(readyToSend.map(r => r.invoice.id))} disabled={busy === 'send'} style={actBtn}>
              {busy === 'send' ? 'Issuing…' : `Issue ${readyToSend.length} for signing`}
            </button>
          )}
          {allSigned && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>
              ✓ All signed — the month can be marked final
            </span>
          )}
        </div>

        {note && <div style={{ fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>{note}</div>}
        <Err onClose={() => setErr('')}>{err}</Err>
      </div>

      {/* rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => {
          const pids = r.lines.map(l => l.pid).filter(Boolean)
          const canSend = r.invoice && r.invoice.status === 'draft' && r.blockers.length === 0
          return (
            <div key={r.payout.id} style={{ padding: '12px 13px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 11, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Ava name={r.name} />
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
                    {r.invoice?.invoice_no || 'no invoice'} · net {inr(r.payout.total_payout)}
                    {pids.length > 0 && <> · PID {pids.join(', ')}</>}
                  </div>
                </div>
                <Chip status={r.status} />
              </div>

              {r.drifted && (
                <div style={{ fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, lineHeight: 1.5 }}>
                  ⚠ Payout changed to {inr(r.payout.total_payout)} after this invoice was sent for {inr(r.invoice.net_payable)}. Void and re-raise.
                </div>
              )}
              {r.invoice && r.invoice.status === 'draft' && r.blockers.length > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
                  {r.blockers.join(' · ')}
                </div>
              )}
              {r.invoice?.send_error && r.invoice.status === 'draft' && (
                <div style={{ fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, lineHeight: 1.5 }}>
                  Last send failed — try again.
                </div>
              )}

              {['sent', 'viewed'].includes(r.status) && r.link && (
                <ShareLinks sharedEmail={r.sharedEmail}
                  row={{ link: r.link, name: r.name, phone: r.phone, email: r.email,
                    invoiceNo: r.invoice.invoice_no, periodMonth: period.period_month, net: r.invoice.net_payable }} />
              )}

              {r.invoice && (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setEditing({ ...r.invoice, _name: r.name })} style={actBtn}>
                    {r.invoice.status === 'draft' ? 'Edit PIDs' : 'View split'}
                  </button>
                  {canSend && (
                    <button type="button" onClick={() => issue([r.invoice.id])} disabled={busy === 'send'} style={primaryBtn}>
                      {busy === 'send' ? 'Issuing…' : 'Issue for signing'}
                    </button>
                  )}
                  {r.invoice.snapshot && (
                    <button type="button" onClick={() => setPreview(r)} style={actBtn}>Preview</button>
                  )}
                  {r.invoice.status === 'draft' && (
                    <button type="button" onClick={() => reraise(r.invoice)} style={{ ...actBtn, marginInlineStart: 'auto' }}>Re-raise</button>
                  )}
                  {['sent', 'viewed'].includes(r.invoice.status) && (
                    <button type="button" onClick={() => voidInvoice(r.invoice)} style={{ ...actBtn, marginInlineStart: 'auto', color: 'var(--red, #e05c6a)' }}>Void</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editing && (
        <SplitSheet invoice={editing} lines={lines[editing.id] || []} properties={properties}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); onChanged && onChanged() }} />
      )}
      {preview && (
        <Sheet wide title={`${preview.invoice.invoice_no}`} subtitle={preview.name} onClose={() => setPreview(null)}>
          <InvoiceDoc data={preview.invoice.snapshot} compact
            signature={preview.invoice.signature_png} signedName={preview.invoice.signed_name} signedAt={preview.invoice.signed_at} />
        </Sheet>
      )}
      {flowOpen && (
        <InvoiceFlow period={period} rows={rows} properties={properties}
          onSend={issue} onClose={() => { setFlowOpen(false); load(); onChanged && onChanged() }} />
      )}
      {entityOpen && <BillingEntitySheet onClose={() => setEntityOpen(false)} />}
    </div>
  )
}
