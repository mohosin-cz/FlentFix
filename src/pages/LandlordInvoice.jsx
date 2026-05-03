import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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

const LINE_ITEM_COLUMNS = ['invoice_id', 'sl_no', 'description', 'category', 'qty', 'unit', 'unit_price']
const sanitizeLineItem = (data) => Object.fromEntries(
  Object.entries(data).filter(([k]) => LINE_ITEM_COLUMNS.includes(k))
)

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
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#1a1a1a', flexShrink: 0, marginLeft: 16 }}>₹{fmt(r.cost_per_unit)}</div>
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

  const [invoice, setInvoice]       = useState(null)
  const [lineItems, setLineItems]   = useState([])
  const [editing, setEditing]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [copied, setCopied]         = useState(false)
  const [showRateCard, setShowRateCard] = useState(false)

  // Editable invoice fields
  const [landlordName, setLandlordName]   = useState('')
  const [landlordEmail, setLandlordEmail] = useState('')
  const [landlordPhone, setLandlordPhone] = useState('')
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

    // Pre-populate from estimate line items
    const { data: estItems } = await supabase
      .from('inspection_line_items')
      .select('*')
      .eq('inspection_id', inspectionId)
      .neq('excluded_from_estimate', true)

    const seedItems = (estItems || [])
      .filter(i => ((i.material_cost || 0) + (i.labour_cost || 0)) > 0)
      .map((item, idx) => ({
        invoice_id:  newInv.id,
        sl_no:       idx + 1,
        description: item.issue_description || item.item_name || '',
        category:    item.trade || item.section_name || '',
        qty:         1,
        unit:        'job',
        unit_price:  (item.material_cost || 0) + (item.labour_cost || 0),
      }))

    if (seedItems.length > 0) {
      const { data: createdItems } = await supabase
        .from('landlord_invoice_items')
        .insert(seedItems.map(sanitizeLineItem))
        .select()
      setLineItems(createdItems || [])
    }

    applyInvoice(newInv)
    setEditing(true)
    setLoading(false)
  }

  function applyInvoice(inv) {
    setInvoice(inv)
    setLandlordName(inv.landlord_name  || '')
    setLandlordEmail(inv.landlord_email || '')
    setLandlordPhone(inv.landlord_phone || '')
    setNotes(inv.notes || '')
    setTaxRate(inv.tax_rate ?? 18)
    setStatus(inv.status || 'draft')
  }

  // ── Line item helpers ──
  function updateItem(id, field, value) {
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
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

  // ── Save ──
  async function handleSave() {
    if (!invoice) return
    setSaving(true)
    try {
      const sub = lineItems.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.unit_price) || 0), 0)
      const tax = sub * (Number(taxRate) / 100)

      await supabase.from('landlord_invoices')
        .update(sanitizeInvoice({
          landlord_name:  landlordName,
          landlord_email: landlordEmail,
          landlord_phone: landlordPhone,
          notes,
          tax_rate:   Number(taxRate),
          status,
          subtotal:   Math.round(sub),
          tax_amount: Math.round(tax),
          total:      Math.round(sub + tax),
        }))
        .eq('id', invoice.id)

      // Delete all existing items and re-insert (handles deletes + reorders cleanly)
      await supabase.from('landlord_invoice_items').delete().eq('invoice_id', invoice.id)

      const numbered = lineItems.map((item, idx) => sanitizeLineItem({
        invoice_id:  invoice.id,
        sl_no:       idx + 1,
        description: item.description || '',
        category:    item.category || '',
        qty:         Number(item.qty) || 1,
        unit:        item.unit || 'job',
        unit_price:  Number(item.unit_price) || 0,
      }))

      if (numbered.length > 0) {
        const { data: saved } = await supabase
          .from('landlord_invoice_items')
          .insert(numbered)
          .select()
        setLineItems(saved || [])
      } else {
        setLineItems([])
      }

      setEditing(false)
    } catch (err) {
      console.error('Save error:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Share / Copy ──
  const shareUrl = invoice ? `${window.location.origin}/invoice/${invoice.id}` : ''

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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'system-ui', color: '#888', fontSize: 14 }}>
      Loading invoice…
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'system-ui', color: '#c00', fontSize: 14 }}>
      {error}
    </div>
  )

  const st = STATUS_STYLES[status] || STATUS_STYLES.draft

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f0f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .inv-input { border: none; border-bottom: 1px solid #ddd; background: transparent; outline: none; font-family: inherit; font-size: inherit; color: inherit; padding: 2px 0; width: 100%; }
        .inv-input:focus { border-bottom-color: #1a1a1a; }
        .inv-input-num { text-align: right; font-family: monospace; }
        .rc-row:hover { background: #fafafa !important; }
        @media print {
          .invoice-action-bar { display: none !important; }
          .invoice-share-bar  { display: none !important; }
          body { background: #fff !important; }
          .invoice-document { box-shadow: none !important; border: none !important; margin: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      {/* ── ACTION BAR ── */}
      <div className="invoice-action-bar" style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#fff', borderBottom: '1px solid #e8e8e8', position: 'sticky', top: 0, zIndex: 100 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ fontSize: 13, color: '#555', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

      {/* ── SHARE BAR ── */}
      {!editing && shareUrl && (
        <div className="invoice-share-bar" style={{ maxWidth: 860, margin: '10px auto 0', padding: '0 24px' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#999' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 12 }}>🔗 {shareUrl}</span>
            <button onClick={handleCopyLink} style={{ color: copied ? '#16a34a' : '#1a1a1a', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, fontWeight: copied ? 600 : 400 }}>
              {copied ? '✓ Copied!' : 'Copy link'}
            </button>
          </div>
        </div>
      )}

      {/* ── INVOICE DOCUMENT ── */}
      <div className="invoice-document" style={{ maxWidth: 860, margin: '16px auto 60px', background: '#fff', border: '1px solid #e0e0e0', boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>

        {/* ── TOP: Branding + Invoice title ── */}
        <div style={{ padding: '40px 48px 32px', borderBottom: '2px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', color: '#1a1a1a', marginBottom: 6 }}>FLENT</div>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.8 }}>
              Property Management<br />
              Bangalore, India<br />
              hello@flent.in
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.08em', color: '#1a1a1a', marginBottom: 8 }}>INVOICE</div>
            <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#555', marginBottom: 8 }}>{invoice?.invoice_number}</div>
            <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 4, background: st.bg, color: st.color, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
              {editing ? (
                <select value={status} onChange={e => setStatus(e.target.value)} style={{ background: 'transparent', border: 'none', color: st.color, fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', cursor: 'pointer', outline: 'none' }}>
                  {Object.entries(STATUS_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              ) : st.label}
            </span>
          </div>
        </div>

        {/* ── BILL TO + PROPERTY DETAILS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #e8e8e8' }}>
          <div style={{ padding: '24px 48px', borderRight: '1px solid #e8e8e8' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', marginBottom: 12 }}>Bill To</div>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input className="inv-input" placeholder="Landlord name" value={landlordName} onChange={e => setLandlordName(e.target.value)} style={{ fontSize: 14, fontWeight: 600 }} />
                <input className="inv-input" placeholder="Email address" value={landlordEmail} onChange={e => setLandlordEmail(e.target.value)} style={{ fontSize: 12, color: '#555' }} />
                <input className="inv-input" placeholder="Phone number" value={landlordPhone} onChange={e => setLandlordPhone(e.target.value)} style={{ fontSize: 12, color: '#555' }} />
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.8 }}>
                <div style={{ fontWeight: 600 }}>{landlordName || <span style={{ color: '#bbb' }}>—</span>}</div>
                {landlordEmail && <div style={{ color: '#555', fontSize: 12 }}>{landlordEmail}</div>}
                {landlordPhone && <div style={{ color: '#555', fontSize: 12 }}>{landlordPhone}</div>}
              </div>
            )}
          </div>
          <div style={{ padding: '24px 48px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', marginBottom: 12 }}>Property Details</div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.9 }}>
              <div><span style={{ color: '#999', fontSize: 11 }}>PID</span>  <span style={{ color: '#1a1a1a', fontWeight: 600, marginLeft: 8 }}>{invoice?.pid || '—'}</span></div>
              {invoice?.property_address && <div style={{ marginTop: 4, fontSize: 12 }}>{invoice.property_address}</div>}
            </div>
          </div>
        </div>

        {/* ── DATE STRIP ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #e8e8e8' }}>
          {[
            { label: 'Invoice Date', val: fmtDate(invoice?.issue_date) },
            { label: 'Due Date',     val: addDays(invoice?.issue_date, 15) },
            { label: 'Status',       val: st.label, color: st.color },
          ].map(({ label, val, color }, i) => (
            <div key={label} style={{ padding: '14px 48px', borderRight: i < 2 ? '1px solid #e8e8e8' : 'none' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 13, color: color || '#1a1a1a', fontWeight: color ? 600 : 400 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── LINE ITEMS TABLE ── */}
        <div style={{ padding: '0 48px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #1a1a1a' }}>
                {['Sl', 'Description', 'Category', 'Qty', 'Unit', 'Rate', 'Amount', ...(editing ? [''] : [])].map(h => (
                  <th key={h} style={{ padding: '12px 8px', textAlign: h === 'Amount' || h === 'Rate' ? 'right' : h === 'Qty' ? 'center' : 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#999', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => {
                const amount = (Number(item.qty) || 1) * (Number(item.unit_price) || 0)
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 8px', color: '#bbb', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {String(idx + 1).padStart(2, '0')}
                    </td>
                    <td style={{ padding: '10px 8px', maxWidth: 240 }}>
                      {editing
                        ? <input className="inv-input" value={item.description} onChange={e => updateItem(item.id, 'description', e.target.value)} />
                        : <span style={{ color: '#1a1a1a' }}>{item.description || '—'}</span>}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {editing
                        ? <input className="inv-input" value={item.category} onChange={e => updateItem(item.id, 'category', e.target.value)} style={{ width: 90 }} />
                        : <span style={{ fontSize: 11, color: '#888', background: '#f5f5f5', padding: '2px 8px', borderRadius: 3 }}>{item.category || '—'}</span>}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      {editing
                        ? <input className="inv-input inv-input-num" type="number" value={item.qty} onChange={e => updateItem(item.id, 'qty', e.target.value)} style={{ width: 48 }} />
                        : <span>{item.qty}</span>}
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      {editing
                        ? <input className="inv-input" value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)} style={{ width: 44 }} />
                        : <span style={{ color: '#888', fontSize: 12 }}>{item.unit}</span>}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {editing
                        ? <input className="inv-input inv-input-num" type="number" value={item.unit_price} onChange={e => updateItem(item.id, 'unit_price', e.target.value)} style={{ width: 80 }} />
                        : `₹${fmt(item.unit_price)}`}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1a1a1a' }}>
                      ₹{fmt(amount)}
                    </td>
                    {editing && (
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#c00' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#ccc' }}
                        >×</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Add buttons (edit mode) */}
          {editing && (
            <div style={{ display: 'flex', gap: 10, padding: '14px 8px' }}>
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
            <div style={{ width: 280 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                <span style={{ color: '#666' }}>Subtotal</span>
                <span style={{ fontFamily: 'monospace' }}>₹{fmt(subtotal)}</span>
              </div>
              {Number(taxRate) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                  <span style={{ color: '#666', display: 'flex', alignItems: 'center', gap: 6 }}>
                    GST
                    {editing
                      ? <input type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)} style={{ width: 40, fontFamily: 'monospace', fontSize: 13, border: 'none', borderBottom: '1px solid #ddd', outline: 'none', textAlign: 'center' }} />
                      : <span>{taxRate}</span>}
                    %
                  </span>
                  <span style={{ fontFamily: 'monospace' }}>₹{fmt(Math.round(taxAmount))}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 16px', borderTop: '2px solid #1a1a1a', marginTop: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>TOTAL</span>
                <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700 }}>₹{fmt(Math.round(total))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── NOTES ── */}
        <div style={{ padding: '0 48px 32px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>Notes</div>
          {editing
            ? <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes for the landlord…" rows={3} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', color: '#1a1a1a' }} />
            : <div style={{ fontSize: 13, color: notes ? '#555' : '#bbb', lineHeight: 1.7 }}>{notes || 'No notes'}</div>}
        </div>

        {/* ── TERMS ── */}
        <div style={{ padding: '20px 48px 32px', borderTop: '1px solid #e8e8e8', background: '#fafafa' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#999', marginBottom: 8 }}>Terms & Conditions</div>
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.8 }}>
            Payment due within 15 days of invoice date.<br />
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
