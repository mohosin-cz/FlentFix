import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { advanceStage } from '../utils/propertyJourney'
import { useIsMobile } from '../hooks/useIsMobile'
import { COMPANY } from '../utils/company'
import FlentWordmark from '../components/FlentWordmark'

// ─── Column sanitizers ────────────────────────────────────────────────────────
const INVOICE_COLUMNS = [
  'invoice_number', 'pid', 'inspection_id', 'status',
  'issue_date', 'due_date', 'landlord_name', 'landlord_email',
  'landlord_phone', 'property_address', 'subtotal',
  'tax_rate', 'tax_amount', 'total', 'notes', 'terms',
]
const sanitizeInvoice = (data) => Object.fromEntries(
  Object.entries(data).filter(([k]) => INVOICE_COLUMNS.includes(k))
)

const LINE_ITEM_COLUMNS = ['invoice_id', 'sl_no', 'description', 'category', 'qty', 'unit', 'unit_price', 'wo_item_id']
const sanitizeLineItem = (data) => Object.fromEntries(
  Object.entries(data).filter(([k]) => LINE_ITEM_COLUMNS.includes(k))
)

// ─── Verified work → invoice lines ────────────────────────────────────────────
// A landlord is billed for work a vendor did and staff signed off, so this
// reads work_order_items at status 'verified' and nothing else. Pending,
// vendor-closed and disputed items are work in progress; putting them on an
// invoice bills for something that may still come back.
//
// Designer-raised lines are left out. They are scope — what the property could
// become — and they carry no inspection row to price them, so they would arrive
// at ₹0 and read as free work on a document that goes to a landlord.
//
// The price has to be fetched separately because a work order item deliberately
// has no cost on it: WorkOrdersSection snapshots an inspection into the
// vendor's copy without ever copying a price, so a vendor never sees what the
// landlord pays. material_cost + labour_cost on the inspection row is the total
// for that line rather than a rate, so it is divided back out by quantity —
// that is what keeps qty × unit_price equal to the figure the estimate used.
async function fetchVerifiedWorkOrderLines(pid, skipWoItemIds = new Set()) {
  const { data: wos, error: woErr } = await supabase
    .from('work_orders')
    .select('id, trade, work_order_items(id, area, description, quantity, status, source, inspection_line_item_id, sort_order)')
    .eq('pid', pid)
    .order('created_at', { ascending: true })
  if (woErr) throw woErr

  const verified = (wos || []).flatMap(w =>
    (w.work_order_items || [])
      .filter(i => i.status === 'verified' && i.source !== 'designer')
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(i => ({ ...i, trade: w.trade }))
  )

  const fresh = verified.filter(i => !skipWoItemIds.has(i.id))
  if (fresh.length === 0) return { lines: [], verified: verified.length, unpriced: 0 }

  const inspIds = [...new Set(fresh.map(i => i.inspection_line_item_id).filter(Boolean))]
  let costs = new Map()
  if (inspIds.length) {
    const { data: rows, error: cErr } = await supabase
      .from('inspection_line_items')
      .select('id, area, item_name, trade, issue_description, qty, material_cost, labour_cost')
      .in('id', inspIds)
    if (cErr) throw cErr
    costs = new Map((rows || []).map(r => [r.id, r]))
  }

  const lines = fresh.map(it => {
    const src   = costs.get(it.inspection_line_item_id)
    const total = (Number(src?.material_cost) || 0) + (Number(src?.labour_cost) || 0)
    const qty   = Number(it.quantity) > 0 ? Number(it.quantity) : 1
    // The vendor's copy of the description is the one that was worked to, so it
    // wins over the inspector's original wording.
    const what  = (it.description || '').trim() || (src?.issue_description || '').trim() || (src?.item_name || '').trim()
    const area  = (it.area || src?.area || '').trim()
    const raw   = [area && area.toLowerCase() !== 'custom' ? area : '', what].filter(Boolean).join(' — ') || what
    return {
      description: raw,
      // Kept so the rewrite that arrives a moment later can tell a line nobody
      // has touched from one somebody has already corrected by hand.
      _raw: raw,
      category:    it.trade || src?.trade || '',
      qty,
      unit:        'job',
      unit_price:  total ? +(total / qty).toFixed(2) : 0,
      wo_item_id:  it.id,
    }
  })

  return { lines, verified: verified.length, unpriced: lines.filter(l => !l.unit_price).length }
}

// ─── Say what was done, not what was wrong ───────────────────────────────────
// An inspection records a fault in the shorthand of somebody standing in the
// room with a phone — "Socket dead", "Other", "Needs replacement". Pulled onto
// an invoice that tells the person paying nothing, so invoice-describe reads the
// item, the room, the action and the material together and writes the line a
// landlord can actually read. It is asked for words only: it cannot add a line,
// drop one, or touch a price.
//
// This runs AFTER the lines are on screen, never as part of getting them there.
// A model call is seconds, and no one should watch a spinner to find out
// whether their invoice has anything on it. Anything that goes wrong — no key,
// no network, a line it did not answer for — leaves that line as it was pulled.
// Vague wording is worth fixing; it is not worth failing a pull over.
async function describeLines(lines) {
  const ids = lines.map(l => l.wo_item_id).filter(Boolean)
  if (!ids.length) return {}
  const { data, error } = await supabase.functions.invoke('invoice-describe', {
    body: { wo_item_ids: ids },
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.error || 'Nothing came back')
  return data.descriptions || {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function addDays(str, n) {
  if (!str) return '—'
  const d = new Date(str)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

// The document was the one surface still rendering in whatever font the OS
// supplied, so an invoice looked like a different product to the app that
// issued it. These read the app's own tokens rather than naming faces again:
// Urbanist for text, JetBrains Mono for anything you read as a number. The
// fallbacks repeat the token values, for print and for any surface that
// somehow renders without theme.css.
const SANS = "var(--font-sans, 'Urbanist', 'Poppins', sans-serif)"
const MONO = "var(--font-mono, 'JetBrains Mono', 'Fira Mono', monospace)"

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function pullSummary(added, verified, unpriced) {
  const already = verified - added
  let text = `Added ${plural(added, 'verified item', 'verified items')} from the work orders`
  if (already > 0) text += ` · ${already} already on this invoice`
  if (unpriced > 0) text += ` · ${plural(unpriced, 'line has', 'lines have')} no cost on the inspection, so price ${unpriced === 1 ? 'it' : 'them'} before sending`
  return `${text}.`
}

const STATUS_STYLES = {
  draft:   { bg: '#f5f5f5', color: '#888',    label: 'DRAFT' },
  sent:    { bg: '#eff6ff', color: '#3b82f6', label: 'SENT' },
  paid:    { bg: '#f0fdf4', color: '#16a34a', label: 'PAID' },
  overdue: { bg: '#fef2f2', color: '#dc2626', label: 'OVERDUE' },
}

// ─── Rate Card Modal ──────────────────────────────────────────────────────────
function RateCardModal({ onAdd, onClose }) {
  const [search, setSearch] = useState('')
  const [rates, setRates]   = useState([])

  useEffect(() => {
    supabase.from('labour_rates')
      .select('*')
      .ilike('work_type', `%${search}%`)
      .limit(20)
      .then(({ data }) => setRates(data || []))
  }, [search])

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '65vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#1a1a1a' }}>Add from Rate Card</div>
          <input
            autoFocus
            placeholder="Search rate card…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '8px 12px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {rates.length === 0 && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: '#bbb', fontSize: 12 }}>No results</div>
          )}
          {rates.map(r => (
            <div
              key={r.id}
              onClick={() => { onAdd(r); onClose() }}
              style={{ padding: '11px 20px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fafafa' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{r.work_type}</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{r.trade} · per {r.unit}</div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 13, color: '#1a1a1a', flexShrink: 0, marginLeft: 16 }}>₹{fmt(r.cost_per_unit)}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 20px', borderTop: '1px solid #eee' }}>
          <button onClick={onClose} style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LandlordInvoice() {
  const { inspectionId } = useParams()
  const navigate = useNavigate()
  // A phone gets the same document, not a second one. The margins close up and
  // the panels stop sitting side by side; the seven-column table of numbers is
  // the one thing that cannot shrink, so it scrolls inside its own box rather
  // than dragging the whole invoice sideways with it.
  const isMobile = useIsMobile()
  // Seven columns of numbers on a 390px screen: the gutter inside each cell is
  // the cheapest width to give back before anything has to scroll.
  const cellX = isMobile ? 4 : 8

  const [invoice, setInvoice]       = useState(null)
  const [lineItems, setLineItems]   = useState([])
  const [editing, setEditing]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(true)
  const isNewInvoice = useRef(false)
  const [error, setError]           = useState('')
  const [copied, setCopied]         = useState(false)
  const [showRateCard, setShowRateCard] = useState(false)
  const [pulling, setPulling]       = useState(false)
  const [describing, setDescribing] = useState(false)
  // One strip under the action bar for anything the page needs to say: what a
  // pull brought in, and why a save did not go through. A save that fails is
  // the thing this page was worst at — the line item writes were discarded
  // without a word for as long as the table was missing.
  const [notice, setNotice]         = useState(null)

  // Editable invoice fields
  const [landlordName, setLandlordName]   = useState('')
  // Held separately because it is the only thing left in Property Details now
  // that the PID has come off, and older invoices were written without it.
  const [propertyAddress, setPropertyAddress] = useState('')
  const [notes, setNotes]                 = useState('')
  const [taxRate, setTaxRate]             = useState(18)
  const [status, setStatus]               = useState('draft')

  // ── Load or create invoice ──
  useEffect(() => {
    if (!inspectionId) { setError('No inspection ID'); setLoading(false); return }
    loadInvoice()
  }, [inspectionId])

  async function loadInvoice() {
    setLoading(true)

    // Check if invoice already exists for this inspection
    const { data: existing } = await supabase
      .from('landlord_invoices')
      .select('*')
      .eq('inspection_id', inspectionId)
      .maybeSingle()

    if (existing) {
      applyInvoice(existing)
      const { data: items } = await supabase
        .from('landlord_invoice_items')
        .select('*')
        .eq('invoice_id', existing.id)
        .order('sl_no')
      setLineItems(items || [])
      // Invoices made before this was captured have an empty address, and with
      // the PID gone that would leave the panel blank. The inspection still
      // knows where the property is.
      if (!existing.property_address) {
        const { data: insp } = await supabase
          .from('inspections').select('config').eq('id', inspectionId).maybeSingle()
        if (insp?.config?.address) setPropertyAddress(insp.config.address)
      }
      setLoading(false)
      return
    }

    // Create new invoice
    const year = new Date().getFullYear()
    const { count } = await supabase.from('landlord_invoices').select('id', { count: 'exact', head: true })
    const invoiceNumber = `INV-${year}-${String((count || 0) + 1).padStart(4, '0')}`

    // Load inspection data
    const { data: insp } = await supabase
      .from('inspections')
      .select('pid, house_type, inspection_date, config')
      .eq('id', inspectionId)
      .single()

    const issueDate = new Date().toISOString().split('T')[0]
    const dueDate   = new Date(Date.now() + 15 * 864e5).toISOString().split('T')[0]

    const { data: newInv, error: createErr } = await supabase
      .from('landlord_invoices')
      .insert(sanitizeInvoice({
        inspection_id:    inspectionId,
        invoice_number:   invoiceNumber,
        pid:              insp?.pid || '',
        property_address: insp?.config?.address || '',
        issue_date:       issueDate,
        due_date:         dueDate,
        status:           'draft',
        tax_rate:         18,
        notes:            '',
        landlord_name:    '',
        landlord_email:   '',
        landlord_phone:   '',
      }))
      .select()
      .single()

    if (createErr) { setError(createErr.message); setLoading(false); return }

    // Seed from the work orders, not from the inspection. An inspection says
    // what was wrong; a verified work order says what was actually done, and
    // that is what a landlord is billed for. Opening the invoice is the one
    // click — the same pull is on a button for when more work is signed off
    // after this.
    if (insp?.pid) {
      try {
        const { lines, verified, unpriced } = await fetchVerifiedWorkOrderLines(insp.pid)
        if (lines.length > 0) {
          const { data: createdItems, error: seedErr } = await supabase
            .from('landlord_invoice_items')
            .insert(lines.map((l, idx) => sanitizeLineItem({ ...l, invoice_id: newInv.id, sl_no: idx + 1 })))
            .select()
          if (seedErr) throw seedErr
          const seeded = createdItems || []
          setLineItems(seeded)
          setNotice({ tone: 'ok', text: pullSummary(lines.length, verified, unpriced) })
          // The lines are saved and on screen; the wording catches up.
          rewriteDescriptions(seeded.map(r => ({ ...r, _raw: r.description })))
        } else {
          setNotice({ tone: 'info', text: 'No verified work orders for this property yet, so the invoice starts empty. Add lines by hand, or pull again once work is signed off.' })
        }
      } catch (e) {
        setNotice({ tone: 'err', text: `Could not read the work orders: ${e.message}` })
      }
    }

    applyInvoice(newInv)
    isNewInvoice.current = true
    setEditing(true)
    setLoading(false)
  }

  function applyInvoice(inv) {
    setInvoice(inv)
    setLandlordName(inv.landlord_name || '')
    setPropertyAddress(inv.property_address || '')
    setNotes(inv.notes || '')
    setTaxRate(inv.tax_rate ?? 18)
    setStatus(inv.status || 'draft')
  }

  // ── Line item helpers ──
  function updateItem(id, field, value) {
    setLineItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const next = { ...i, [field]: value }
      // The amount field holds what was typed while it is being typed. Change
      // the quantity and that keystroke is no longer the answer, so it goes and
      // the amount is derived from the rate again.
      if (field === 'qty') delete next._amountRaw
      return next
    }))
  }

  // The document shows a quantity and a line total; the rate is what those two
  // imply, and it is no longer a column. A total is also what staff actually
  // have in hand, so that is what the field takes and the per-unit price is
  // worked back out — qty × unit_price still equals the printed figure.
  function updateAmount(item, raw) {
    const qty = Number(item.qty) > 0 ? Number(item.qty) : 1
    setLineItems(prev => prev.map(i => i.id === item.id
      ? { ...i, _amountRaw: raw, unit_price: raw === '' ? 0 : Number(raw) / qty }
      : i))
  }

  function addBlankItem() {
    const maxSl = lineItems.reduce((m, i) => Math.max(m, i.sl_no || 0), 0)
    setLineItems(prev => [...prev, {
      id: `new_${Date.now()}`,
      invoice_id: invoice?.id,
      sl_no: maxSl + 1,
      description: '',
      category: '',
      qty: 1,
      unit: 'job',
      unit_price: 0,
    }])
  }

  function addFromRateCard(rate) {
    const maxSl = lineItems.reduce((m, i) => Math.max(m, i.sl_no || 0), 0)
    setLineItems(prev => [...prev, {
      id: `new_${Date.now()}`,
      invoice_id: invoice?.id,
      sl_no: maxSl + 1,
      description: rate.work_type,
      category: rate.trade || '',
      qty: 1,
      unit: rate.unit || 'job',
      unit_price: rate.cost_per_unit || 0,
    }])
  }

  function removeItem(id) {
    setLineItems(prev => prev.filter(i => i.id !== id))
  }

  // Pull again after the first time. Only work that is not already billed comes
  // in, so this is safe to press whenever another trade is signed off — lines
  // you typed by hand and prices you corrected are left exactly as they are.
  async function pullFromWorkOrders() {
    if (!invoice?.pid) { setNotice({ tone: 'err', text: 'This invoice has no PID on it, so there are no work orders to look up.' }); return }
    setPulling(true)
    setNotice(null)
    try {
      const already = new Set(lineItems.map(i => i.wo_item_id).filter(Boolean))
      const { lines, verified, unpriced } = await fetchVerifiedWorkOrderLines(invoice.pid, already)

      if (verified === 0) {
        setNotice({ tone: 'info', text: 'No verified work orders for this property yet. Items appear here once a vendor has done the work and it has been signed off.' })
        return
      }
      if (lines.length === 0) {
        setNotice({ tone: 'info', text: `Nothing new — ${verified === 1 ? 'the one verified item is' : `all ${verified} verified items are`} already on this invoice.` })
        return
      }

      const maxSl = lineItems.reduce((m, i) => Math.max(m, i.sl_no || 0), 0)
      const stamp = Date.now()
      const added = lines.map((l, idx) => ({
        ...l,
        id: `new_${stamp}_${idx}`,
        invoice_id: invoice.id,
        sl_no: maxSl + idx + 1,
      }))
      setLineItems(prev => [...prev, ...added])
      setEditing(true)
      setNotice({ tone: 'ok', text: `${pullSummary(lines.length, verified, unpriced)} Save to keep them.` })
      rewriteDescriptions(added)
    } catch (e) {
      setNotice({ tone: 'err', text: `Could not read the work orders: ${e.message}` })
    } finally {
      setPulling(false)
    }
  }

  // Replaces the pulled wording with something a landlord can read, in place,
  // once it comes back. A line whose description no longer matches what was
  // pulled has been edited by hand since, and a person's wording wins over a
  // model's — so it is left alone.
  async function rewriteDescriptions(pulled) {
    if (!pulled?.length) return
    setDescribing(true)
    try {
      const written = await describeLines(pulled)
      // Counted from what came back, not inside the state updater — that runs
      // when React chooses to, and twice in development.
      const changed = pulled.filter(p => written[p.wo_item_id]).length
      const unclear = pulled.filter(p => written[p.wo_item_id]?.confidence === 'low').length
      setLineItems(prev => prev.map(i => {
        const w = i.wo_item_id ? written[i.wo_item_id] : null
        // A description that no longer matches what was pulled has been edited
        // by hand since; a person's wording beats a model's.
        if (!w || (i._raw && i.description !== i._raw)) return i
        return { ...i, description: w.description, unclear: w.confidence === 'low' }
      }))
      if (changed) {
        let text = `${plural(changed, 'description', 'descriptions')} rewritten from what the work orders record.`
        if (unclear > 0) text += ` ${plural(unclear, 'line was', 'lines were')} logged without an action, so the wording is thin — read ${unclear === 1 ? 'it' : 'them'} before sending.`
        setNotice(n => ({ tone: n?.tone === 'err' ? 'err' : 'ok', text: `${n?.text ? `${n.text} ` : ''}${text} Save to keep them.` }))
      }
    } catch (e) {
      // Not a failure of the pull. The lines are there; only the wording is the
      // inspector's rather than the invoice's.
      setNotice(n => ({
        tone: n?.tone === 'err' ? 'err' : 'info',
        text: `${n?.text ? `${n.text} ` : ''}Descriptions are as the inspection recorded them — ${e.message}`,
      }))
    } finally {
      setDescribing(false)
    }
  }

  // ── Save ──
  async function handleSave() {
    if (!invoice) return
    setSaving(true)
    try {
      const sub = lineItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unit_price) || 0), 0)
      const tax = sub * (Number(taxRate) / 100)

      const numbered = lineItems.map((item, idx) => sanitizeLineItem({
        sl_no:       idx + 1,
        description: item.description || '',
        category:    item.category || '',
        qty:         Number(item.qty) || 1,
        unit:        item.unit || 'job',
        unit_price:  Number(item.unit_price) || 0,
        // Kept through the rewrite, or a re-pull would bill every verified item
        // a second time.
        wo_item_id:  item.wo_item_id || null,
      }))

      // One statement, one transaction. Rewriting the lines used to be a delete
      // followed by an insert, so anything that failed in between left the
      // invoice with no lines at all and the work only still on screen. The
      // function also updates the header and derives the totals from the lines
      // it just wrote, so a stored total cannot describe a line that is not
      // there.
      const { data: saved, error: saveErr } = await supabase.rpc('landlord_invoice_save', {
        p_invoice_id:       invoice.id,
        p_landlord_name:    landlordName,
        p_property_address: propertyAddress,
        p_notes:            notes,
        p_tax_rate:         Number(taxRate) || 0,
        p_status:           status,
        p_items:            numbered,
      })
      if (saveErr) throw saveErr

      setLineItems([...(saved || [])].sort((a, b) => (a.sl_no || 0) - (b.sl_no || 0)))
      setInvoice(prev => (prev ? { ...prev, subtotal: Math.round(sub), tax_amount: Math.round(tax), total: Math.round(sub + tax) } : prev))

      if (isNewInvoice.current && invoice?.pid) {
        advanceStage(supabase, invoice.pid, 'invoice_created', null)
        isNewInvoice.current = false
      }
      setNotice(null)
      setEditing(false)
    } catch (err) {
      console.error('Save error:', err)
      setNotice({ tone: 'err', text: `Save failed: ${err.message}. Nothing on screen has been lost — fix the problem and press Save again.` })
    } finally {
      setSaving(false)
    }
  }

  // ── Share / Copy ──
  // The route takes an inspection id, not an invoice id. Sharing invoice.id
  // sent the reader to a URL that matched no invoice, and the page's
  // load-or-create then minted a fresh one — a duplicate per click.
  const shareUrl = invoice?.inspection_id ? `${window.location.origin}/invoice/${invoice.inspection_id}` : ''

  async function handleCopyLink() {
    if (!shareUrl) return
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); return } catch (_) {}
    }
    const ta = document.createElement('textarea')
    ta.value = shareUrl
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
    document.body.appendChild(ta); ta.focus(); ta.select()
    try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch (e) { console.error(e) }
    document.body.removeChild(ta)
  }

  // ── Totals ──
  const subtotal  = lineItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unit_price) || 0), 0)
  const taxAmount = subtotal * (Number(taxRate) / 100)
  const total     = subtotal + taxAmount

  // ── Loading / Error states ──
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: SANS, color: '#888', fontSize: 14 }}>
      Loading invoice…
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: SANS, color: '#c00', fontSize: 14 }}>
      {error}
    </div>
  )

  const st = STATUS_STYLES[status] || STATUS_STYLES.draft

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f0f0', fontFamily: SANS, color: '#1a1a1a' }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .inv-input { border: none; border-bottom: 1px solid #ddd; background: transparent; outline: none; font-family: inherit; font-size: inherit; color: #1a1a1a; padding: 2px 0; width: 100%; }
        .inv-input:focus { border-bottom-color: #1a1a1a; }
        .inv-input-num { text-align: right; font-family: var(--font-mono, 'JetBrains Mono', 'Fira Mono', monospace); }
        .rc-row:hover { background: #fafafa !important; }
        .inv-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media print {
          .invoice-action-bar { display: none !important; }
          .invoice-share-bar  { display: none !important; }
          .invoice-notice     { display: none !important; }
          body { background: #fff !important; }
          .invoice-document { box-shadow: none !important; border: none !important; margin: 0 !important; max-width: 100% !important; }
          .inv-table-wrap { overflow-x: visible !important; }
        }
      `}</style>

      {/* ── ACTION BAR ── */}
      <div className="invoice-action-bar" style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: isMobile ? '10px 14px' : '12px 24px', background: '#fff', borderBottom: '1px solid #e8e8e8', position: 'sticky', top: 0, zIndex: 100 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ fontSize: 13, color: '#555', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} style={{ padding: '7px 14px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', color: '#555', cursor: 'pointer', fontSize: 12 }}>
                Preview
              </button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '7px 16px', border: 'none', borderRadius: 6, background: '#1a1a1a', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} style={{ padding: '7px 14px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', color: '#555', cursor: 'pointer', fontSize: 12 }}>
                ✏ Edit
              </button>
              <button onClick={() => window.print()} style={{ padding: '7px 14px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', color: '#555', cursor: 'pointer', fontSize: 12 }}>
                ⬇ PDF
              </button>
              <button onClick={handleCopyLink} style={{ padding: '7px 14px', border: '1px solid #1a1a1a', borderRadius: 6, background: '#1a1a1a', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                {copied ? '✓ Copied!' : '↗ Share'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── NOTICE ── */}
      {notice && (
        <div className="invoice-notice" style={{ maxWidth: 860, margin: '10px auto 0', padding: isMobile ? '0 14px' : '0 24px' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, lineHeight: 1.55, borderRadius: 6, padding: '9px 13px',
            background: notice.tone === 'err' ? '#fef2f2' : notice.tone === 'ok' ? '#f0fdf4' : '#f7f7f7',
            border: `1px solid ${notice.tone === 'err' ? '#f6cfcf' : notice.tone === 'ok' ? '#c9ebd5' : '#e5e5e5'}`,
            color: notice.tone === 'err' ? '#a32222' : notice.tone === 'ok' ? '#166534' : '#666',
          }}>
            <span style={{ flexShrink: 0 }}>{notice.tone === 'err' ? '⚠' : notice.tone === 'ok' ? '✓' : 'ℹ'}</span>
            <span style={{ flex: 1 }}>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'inherit', opacity: 0.5, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
          </div>
        </div>
      )}

      {/* ── SHARE BAR ── */}
      {!editing && shareUrl && (
        <div className="invoice-share-bar" style={{ maxWidth: 860, margin: '10px auto 0', padding: isMobile ? '0 14px' : '0 24px' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#999' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 12 }}>🔗 {shareUrl}</span>
            <button onClick={handleCopyLink} style={{ color: copied ? '#16a34a' : '#1a1a1a', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, fontWeight: copied ? 600 : 400 }}>
              {copied ? '✓ Copied!' : 'Copy link'}
            </button>
          </div>
        </div>
      )}

      {/* ── INVOICE DOCUMENT ── */}
      <div className="invoice-document" style={{ maxWidth: 860, margin: isMobile ? '12px 0 48px' : '16px auto 60px', background: '#fff', border: '1px solid #e0e0e0', borderLeft: isMobile ? 'none' : '1px solid #e0e0e0', borderRight: isMobile ? 'none' : '1px solid #e0e0e0', boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>

        {/* ── TOP: Branding + Invoice title ── */}
        <div style={{ padding: isMobile ? '24px 18px 20px' : '40px 48px 32px', borderBottom: '2px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <FlentWordmark height={30} variant="dark" style={{ marginBottom: 6 }} />
            {/* One definition of the entity, in src/utils/company.js — the
                three hand-written copies this replaced had already drifted. */}
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.7, marginTop: 2, maxWidth: 360 }}>
              <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{COMPANY.legal_name}</span><br />
              {COMPANY.address_line}<br />
              {COMPANY.city}, {COMPANY.state} {COMPANY.pincode}<br />
              <span style={{ fontFamily: MONO, fontSize: 11, color: '#888' }}>GSTIN: {COMPANY.gstin}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.08em', color: '#1a1a1a', marginBottom: 8 }}>INVOICE</div>
            <div style={{ fontFamily: MONO, fontSize: 14, color: '#555', marginBottom: 8 }}>{invoice?.invoice_number}</div>
            <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 4, background: st.bg, color: st.color, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
              {editing ? (
                <select value={status} onChange={e => setStatus(e.target.value)} style={{ background: 'transparent', border: 'none', color: st.color, fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer', outline: 'none' }}>
                  {Object.entries(STATUS_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : st.label}
            </span>
          </div>
        </div>

        {/* ── BILL TO ── */}
        {/* The name and the address of the property the work was done at, one
            under the other. Property Details had held nothing else since the
            PID came off, so a second panel for a heading alone went with it. */}
        <div style={{ padding: isMobile ? '20px 18px' : '24px 48px', borderBottom: '1px solid #e8e8e8' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', marginBottom: 12 }}>Bill To</div>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
              <input className="inv-input" placeholder="Landlord name" value={landlordName} onChange={e => setLandlordName(e.target.value)} style={{ fontSize: 14, fontWeight: 600 }} />
              <input className="inv-input" placeholder="Property address" value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} style={{ fontSize: 13, color: '#555' }} />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.7, maxWidth: 420 }}>
              <div style={{ fontWeight: 600 }}>{landlordName || <span style={{ color: '#bbb' }}>—</span>}</div>
              {propertyAddress && <div style={{ color: '#555', marginTop: 2 }}>{propertyAddress}</div>}
            </div>
          )}
        </div>

        {/* ── DATE STRIP ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #e8e8e8' }}>
          {[
            { label: 'Invoice Date', val: fmtDate(invoice?.issue_date) },
            { label: 'Due Date',     val: addDays(invoice?.issue_date, 15) },
            { label: 'Status',       val: st.label, color: st.color },
          ].map(({ label, val, color }, i) => (
            <div key={label} style={{ padding: isMobile ? '12px' : '14px 48px', borderRight: i < 2 ? '1px solid #e8e8e8' : 'none' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, color: color || '#1a1a1a', fontWeight: color ? 600 : 400 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── LINE ITEMS TABLE ── */}
        <div style={{ padding: isMobile ? '0 18px 0' : '0 48px 0' }}>
          <div className="inv-table-wrap">
          <table style={{ width: '100%', minWidth: isMobile && lineItems.length > 0 ? 440 : undefined, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #1a1a1a' }}>
                {['Sl', 'Description', 'Category', 'Qty', 'Amount', ...(editing ? [''] : [])].map(h => (
                  <th key={h} style={{ padding: `12px ${cellX}px`, textAlign: h === 'Amount' ? 'right' : h === 'Qty' ? 'center' : 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => {
                const amount = (Number(item.qty) || 1) * (Number(item.unit_price) || 0)
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td
                      title={editing && item.wo_item_id
                        ? (item.unclear
                            ? 'Pulled from verified work, but the inspection recorded no action — check the wording'
                            : 'Pulled from verified work — removing it here does not touch the work order')
                        : undefined}
                      style={{ padding: `10px ${cellX}px`, color: '#bbb', fontFamily: MONO, fontSize: 12, whiteSpace: 'nowrap' }}
                    >
                      {String(idx + 1).padStart(2, '0')}
                      {/* Only while editing: on the landlord's copy a marker
                          for where a line came from is noise. */}
                      {editing && item.wo_item_id && <span style={{ color: item.unclear ? '#c8963e' : '#16a34a', marginLeft: 3 }}>•</span>}
                    </td>
                    <td style={{ padding: `10px ${cellX}px`, maxWidth: 240 }}>
                      {editing
                        ? <input className="inv-input" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} />
                        : <span style={{ color: '#1a1a1a' }}>{item.description || '—'}</span>}
                    </td>
                    <td style={{ padding: `10px ${cellX}px` }}>
                      {editing
                        ? <input className="inv-input" value={item.category} onChange={e => updateItem(item.id, 'category', e.target.value)} style={{ width: 90 }} />
                        : <span style={{ fontSize: 11, color: '#888', background: '#f5f5f5', padding: '2px 8px', borderRadius: 3 }}>{item.category || '—'}</span>}
                    </td>
                    <td style={{ padding: `10px ${cellX}px`, textAlign: 'center' }}>
                      {editing
                        ? <input className="inv-input inv-input-num" type="number" value={item.qty} onChange={e => updateItem(item.id, 'qty', e.target.value)} style={{ width: 48 }} />
                        : <span>{item.qty}</span>}
                    </td>
                    <td style={{ padding: `10px ${cellX}px`, textAlign: 'right', fontFamily: MONO, fontWeight: 600, color: '#1a1a1a' }}>
                      {editing
                        ? <input className="inv-input inv-input-num" type="number" value={item._amountRaw ?? (amount || '')} onChange={e => updateAmount(item, e.target.value)} placeholder="0" style={{ width: 96 }} />
                        : `₹${fmt(amount)}`}
                    </td>
                    {editing && (
                      <td style={{ padding: `10px ${cellX}px`, textAlign: 'center' }}>
                        <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#c00' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#ccc' }}
                        >×</button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {lineItems.length === 0 && (
                <tr>
                  <td colSpan={editing ? 6 : 5} style={{ padding: '30px 8px', textAlign: 'center', color: '#bbb', fontSize: 12.5, lineHeight: 1.7 }}>
                    Nothing on this invoice yet.<br />
                    {editing
                      ? 'Pull the verified work from this property’s work orders, or add a line by hand.'
                      : 'Press Edit to pull the verified work from this property’s work orders.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          {/* Add buttons (edit mode) */}
          {editing && (
            <div style={{ display: 'flex', gap: 10, padding: '14px 8px', flexWrap: 'wrap' }}>
              <button onClick={pullFromWorkOrders} disabled={pulling} style={{ fontSize: 12, color: '#fff', background: '#1a1a1a', border: '1px solid #1a1a1a', borderRadius: 6, padding: '6px 14px', cursor: pulling ? 'wait' : 'pointer', opacity: pulling ? 0.7 : 1, fontWeight: 600 }}>
                {pulling ? 'Reading work orders…' : describing ? 'Writing descriptions…' : '↻ Pull verified work'}
              </button>
              <button onClick={addBlankItem} style={{ fontSize: 12, color: '#555', background: 'none', border: '1px dashed #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                + Add Item
              </button>
              <button onClick={() => setShowRateCard(true)} style={{ fontSize: 12, color: '#1a1a1a', background: 'none', border: '1px dashed #1a1a1a', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                + Add from Rate Card
              </button>
            </div>
          )}

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 0 0', borderTop: '1px solid #e8e8e8', marginTop: editing ? 0 : 0 }}>
            <div style={{ width: 280, maxWidth: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                <span style={{ color: '#666' }}>Subtotal</span>
                <span style={{ fontFamily: MONO }}>₹{fmt(subtotal)}</span>
              </div>
              {Number(taxRate) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                  <span style={{ color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
                    GST
                    {editing
                      ? <input type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)} style={{ width: 40, fontFamily: MONO, fontSize: 13, border: 'none', borderBottom: '1px solid #ddd', outline: 'none', textAlign: 'center' }} />
                      : <span>{taxRate}</span>}
                    %
                  </span>
                  <span style={{ fontFamily: MONO }}>₹{fmt(Math.round(taxAmount))}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 16px', borderTop: '2px solid #1a1a1a', marginTop: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>TOTAL</span>
                <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700 }}>₹{fmt(Math.round(total))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── NOTES ── */}
        <div style={{ padding: isMobile ? '0 18px 28px' : '0 48px 32px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>Notes</div>
          {editing
            ? <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes for the landlord…" rows={3} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: '#1a1a1a' }} />
            : <div style={{ fontSize: 13, color: notes ? '#555' : '#bbb', lineHeight: 1.7 }}>{notes || 'No notes'}</div>}
        </div>

        {/* ── TERMS ── */}
        <div style={{ padding: isMobile ? '18px 18px 28px' : '20px 48px 32px', borderTop: '1px solid #e8e8e8', background: '#fafafa' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>Terms & Conditions</div>
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.8 }}>
            All amounts in INR. GST included where applicable.
          </div>
          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: '#aaa' }}>
            Thank you for your trust in Flent. 🏠
          </div>
        </div>

      </div>

      {/* Rate Card Modal */}
      {showRateCard && (
        <RateCardModal
          onAdd={addFromRateCard}
          onClose={() => setShowRateCard(false)}
        />
      )}
    </div>
  )
}
