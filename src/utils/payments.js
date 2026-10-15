import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'

// A payment has two independent axes, not one mixed list:
//   kind   — what the money bought: material, labour, or both on one invoice
//   trade  — what work it was for
// Mixing them ("Materials" next to "Cleaning") makes both unanswerable: you
// can no longer ask what the plumbing cost, or what went on materials overall.

export const KINDS = ['Material', 'Labour', 'Both']

// The vendor roster's own vocabulary, plus the non-trade heads that setup
// still spends on. Stored as free text so a new one never needs a migration.
export const TRADES = [
  'Carpenter',
  'Electrician',
  'Plumber',
  'Painter',
  'Cleaner',
  'Pest control',
  'Civil / masonry',
  'Appliances',
  'Furniture',
  'Supervisor',
  'General help',
  'Transport',
  'Society & deposits',
  'Other',
]

export const METHODS = ['Cash', 'UPI', 'Bank transfer', 'Card', 'Cheque']

// How things are counted when they are bought. Free text like TRADES — the
// list is a suggestion, not a constraint, because the next invoice will say
// "rft" or "quintal" and that should just work.
export const UNITS = ['pcs', 'nos', 'set', 'box', 'bag', 'kg', 'ltr', 'm', 'sqft', 'hr', 'day', 'trip']


export const inr = (n) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0))}`

// "₹19,500" typed into a number input silently clears it, so amounts are text
// inputs everywhere and the currency, commas and spaces are stripped here.
export const cleanAmount = (s) => {
  const t = String(s ?? '').replace(/[^0-9.]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

// Quantities are not money: 2.5 kg and 0.75 day are both real, so this keeps
// three decimals where cleanAmount keeps two.
export const cleanQty = (v) => {
  const t = String(v ?? '').replace(/[^0-9.]/g, '')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null
}

// 12, not 12.000. 2.5, not 2.500.
export const fmtQty = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return String(Math.round(v * 1000) / 1000)
}

// A line's money. Quantity × rate when both are there, otherwise whatever was
// typed as the amount — a line can legitimately be a lump sum with no quantity
// ("site cleaning, ₹2,000"), and forcing a quantity on it would mean inventing
// one.
export const lineAmount = (it) => {
  const q = cleanQty(it.quantity)
  const r = cleanAmount(it.unit_rate)
  if (q != null && r != null) return Math.round(q * r * 100) / 100
  return cleanAmount(it.amount) ?? 0
}

export const itemsTotal = (items) => (items || []).reduce((n, it) => n + lineAmount(it), 0)

// What the metadata row on a payment card says about its lines.
export const itemSummary = (items) => {
  const list = items || []
  if (!list.length) return null
  if (list.length === 1) {
    const it = list[0]
    const q = it.quantity != null ? fmtQty(it.quantity) : null
    if (!q) return null
    return `${q}${it.unit ? ' ' + it.unit : ''}${it.unit_rate != null ? ' × ' + inr(it.unit_rate) : ''}`
  }
  return `${list.length} items`
}

// The material/labour split of one payment, and what could not be attributed.
// Three sources in order of how much they actually know:
//   1. per-line kinds, when the invoice was itemised
//   2. material_cost / labour_cost, when somebody typed the split
//   3. `kind` alone — a Material payment is all material, and so on
// `unsplit` is everything none of those could place. It is returned rather
// than quietly folded into one side, because a ratio that silently absorbs
// what it does not know is not a ratio.
export function splitOf(row) {
  const items = row.property_payment_items || []
  const tagged = items.filter(it => it.kind)
  if (tagged.length) {
    const material = tagged.filter(it => it.kind === 'Material').reduce((n, it) => n + Number(it.amount || 0), 0)
    const labour = tagged.filter(it => it.kind === 'Labour').reduce((n, it) => n + Number(it.amount || 0), 0)
    return { material, labour, unsplit: Math.max(0, Number(row.amount || 0) - material - labour) }
  }
  const m = row.material_cost == null ? null : Number(row.material_cost)
  const l = row.labour_cost == null ? null : Number(row.labour_cost)
  if (m != null || l != null) {
    return { material: m || 0, labour: l || 0, unsplit: Math.max(0, Number(row.amount || 0) - (m || 0) - (l || 0)) }
  }
  const amt = Number(row.amount || 0)
  if (row.kind === 'Material') return { material: amt, labour: 0, unsplit: 0 }
  if (row.kind === 'Labour') return { material: 0, labour: amt, unsplit: 0 }
  return { material: 0, labour: 0, unsplit: amt }   // 'Both' with nothing to split it by
}

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const shiftISO = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const fmtDate = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const fmtDayShort = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// Retrofitted rows come from spreadsheets typed by people, so the date column
// is whatever that person felt like that day. Day-first is assumed for
// ambiguous d/m vs m/d because this is an Indian operation — an assumption
// worth stating rather than hiding, so the importer shows the parsed result
// back for every row before anything is written.
export function parseDateLoose(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)                       // 2026-08-06
  if (m) return iso(+m[1], +m[2], +m[3])

  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)              // 06/08/2026, 6-8-26
  if (m) {
    let [, d, mo, y] = m
    y = +y < 100 ? 2000 + +y : +y
    return iso(y, +mo, +d)
  }

  m = s.match(/^(\d{1,2})[\s-]*([a-z]{3,})[\s-]*(\d{2,4})?$/i)          // 12 Jul 2026, 12-Jul
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mo >= 0) {
      const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear()
      return iso(y, mo + 1, +m[1])
    }
  }

  m = s.match(/^([a-z]{3,})[\s-]+(\d{1,2}),?[\s-]*(\d{2,4})?$/i)        // Jul 12 2026
  if (m) {
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    if (mo >= 0) {
      const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear()
      return iso(y, mo + 1, +m[2])
    }
  }

  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return null
}

function iso(y, m, d) {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Sheets spell the kind a dozen ways. Anything unrecognised falls through to
// the importer's default rather than silently becoming Material.
export function normaliseKind(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return null
  if (/^(both|mixed|material\s*\+\s*labour|labour\s*\+\s*material|m\s*&\s*l)/.test(s)) return 'Both'
  if (/^(lab|labour|labor|work|workmanship|service|wages)/.test(s)) return 'Labour'
  if (/^(mat|material|materials|goods|supply|supplies|purchase)/.test(s)) return 'Material'
  return null
}

export function normaliseTrade(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const hit = TRADES.find(t => t.toLowerCase() === s.toLowerCase())
  return hit || s          // keep whatever they wrote; the list is only a suggestion
}

// A CSV parser that survives quoted fields containing commas, newlines and
// escaped quotes — which is most real exports. Returns rows of raw strings.
export function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const src = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      } else field += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); field = ''
      if (row.some(v => v.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.some(v => v.trim() !== '')) rows.push(row)
  return rows
}

// Guess which column is which from the header names, so the common case needs
// no mapping at all. Anything unmatched is left for the user to set.
const FIELD_HINTS = {
  paid_on: ['date', 'paid on', 'paid_on', 'payment date', 'txn date', 'day'],
  amount: ['amount', 'total', 'paid', 'value', 'sum', 'amt'],
  kind: ['kind', 'type', 'material or labour', 'expense type', 'head'],
  trade: ['trade', 'category', 'work', 'service', 'department'],
  description: ['description', 'particulars', 'details', 'item', 'work done', 'for'],
  payee_name: ['vendor', 'payee', 'paid to', 'supplier', 'shop', 'party'],
  material_cost: ['material cost', 'material amount', 'material', 'materials'],
  labour_cost: ['labour cost', 'labor cost', 'labour amount', 'labour', 'labor'],
  quantity: ['quantity', 'qty', 'nos', 'count', 'units', 'no of items'],
  unit: ['unit', 'uom', 'units of measure', 'measure'],
  unit_rate: ['rate', 'unit rate', 'price', 'unit price', 'per unit', 'mrp'],
  method: ['method', 'mode', 'payment mode', 'paid via'],
  reference: ['reference', 'ref', 'txn', 'transaction', 'utr', 'cheque', 'invoice no', 'bill no'],
  note: ['note', 'notes', 'remark', 'remarks', 'comment'],
}

export function guessMapping(headers) {
  const map = {}
  const used = new Set()
  // exact matches first, so "Material cost" does not get claimed by the looser
  // "material" hint belonging to a different field
  for (const pass of ['exact', 'loose']) {
    for (const [field, hints] of Object.entries(FIELD_HINTS)) {
      if (map[field] != null) continue
      const idx = headers.findIndex((h, i) => {
        if (used.has(i)) return false
        const clean = String(h || '').trim().toLowerCase()
        return pass === 'exact'
          ? hints.some(hint => clean === hint)
          : hints.some(hint => clean.includes(hint))
      })
      if (idx >= 0) { map[field] = idx; used.add(idx) }
    }
  }
  return map
}

// Invoices are photographed on a phone. Compress images; leave PDFs alone.
export async function uploadBill(file, pid) {
  let toUpload = file
  if (file.type?.startsWith('image/')) {
    try {
      toUpload = await imageCompression(file, {
        maxSizeMB: 0.5, maxWidthOrHeight: 2000, useWebWorker: true,
        fileType: 'image/webp', initialQuality: 0.82,
      })
    } catch {
      toUpload = file            // an invoice that uploads large beats one that doesn't upload
    }
  }
  const ext = toUpload.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() || 'bin')
  const path = `${pid}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('property-bills').upload(path, toUpload, {
    contentType: toUpload.type || 'application/octet-stream',
    upsert: false,
  })
  if (error) throw error
  return { path, filename: file.name, mime: toUpload.type || file.type, size_bytes: toUpload.size }
}

export async function billUrl(path) {
  const { data, error } = await supabase.storage.from('property-bills').createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl || null
}
