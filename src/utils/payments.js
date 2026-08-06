import imageCompression from 'browser-image-compression'
import { supabase } from '../lib/supabase'

// Shared vocabulary and parsing for property spend logging. Categories are
// stored as free text so a new one never needs a migration; this list is what
// the UI offers, ordered by how often setup actually spends on it.
export const CATEGORIES = [
  'Materials',
  'Labour',
  'Appliances',
  'Furniture',
  'Cleaning',
  'Pest control',
  'Utilities',
  'Society & deposits',
  'Transport',
  'Permits',
  'Other',
]

export const METHODS = ['Cash', 'UPI', 'Bank transfer', 'Card', 'Cheque']

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
  category: ['category', 'type', 'head', 'expense type'],
  payee_name: ['vendor', 'payee', 'paid to', 'supplier', 'shop', 'name', 'party'],
  material_cost: ['material', 'material cost', 'materials'],
  labour_cost: ['labour', 'labor', 'labour cost', 'labor cost'],
  method: ['method', 'mode', 'payment mode', 'paid via'],
  reference: ['reference', 'ref', 'txn', 'transaction', 'utr', 'cheque'],
  note: ['note', 'notes', 'remark', 'remarks', 'description', 'details'],
  pid: ['pid', 'property', 'property id', 'flat'],
}

export function guessMapping(headers) {
  const map = {}
  const used = new Set()
  for (const [field, hints] of Object.entries(FIELD_HINTS)) {
    const idx = headers.findIndex((h, i) => {
      if (used.has(i)) return false
      const clean = String(h || '').trim().toLowerCase()
      return hints.some(hint => clean === hint) || hints.some(hint => clean.includes(hint))
    })
    if (idx >= 0) { map[field] = idx; used.add(idx) }
  }
  return map
}

// Bills are receipts photographed on a phone. Compress images; leave PDFs alone.
export async function uploadBill(file, pid) {
  let toUpload = file
  if (file.type?.startsWith('image/')) {
    try {
      toUpload = await imageCompression(file, {
        maxSizeMB: 0.5, maxWidthOrHeight: 2000, useWebWorker: true,
        fileType: 'image/webp', initialQuality: 0.82,
      })
    } catch {
      toUpload = file            // a bill that uploads large beats one that doesn't upload
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
