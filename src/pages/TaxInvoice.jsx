import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import LogoSpinner from '../components/LogoSpinner'

// ─── Number to words (Indian system) ─────────────────────────────────────────

const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
              'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
              'Seventeen','Eighteen','Nineteen']
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function _words(n) {
  if (n === 0) return ''
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + _words(n % 100) : '')
}

function toWords(n) {
  if (!n || n === 0) return 'Zero'
  n = Math.floor(n)
  const crore    = Math.floor(n / 1e7)
  const lakh     = Math.floor((n % 1e7) / 1e5)
  const thousand = Math.floor((n % 1e5) / 1e3)
  const rest     = n % 1e3
  let parts = []
  if (crore)    parts.push(_words(crore)    + ' Crore')
  if (lakh)     parts.push(_words(lakh)     + ' Lakh')
  if (thousand) parts.push(_words(thousand) + ' Thousand')
  if (rest)     parts.push(_words(rest))
  return parts.join(' ')
}

function amountInWords(amount) {
  const rupees = Math.floor(amount)
  const paise  = Math.round((amount - rupees) * 100)
  let result   = toWords(rupees) + ' Rupees'
  if (paise)   result += ' and ' + toWords(paise) + ' Paise'
  return result + ' Only'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtINR(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Print CSS ────────────────────────────────────────────────────────────────

const PRINT_CSS = `
@media print {
  body { background: #fff !important; }
  .ti-app-header, .ti-download-bar { display: none !important; }
  .ti-page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
  .ti-item-row-mobile { page-break-inside: avoid; }
}
`

// ─── Component ───────────────────────────────────────────────────────────────

export default function TaxInvoice() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const isMobile  = useIsMobile()

  const [invoice,    setInvoice]    = useState(null)
  const [items,      setItems]      = useState([])
  const [actuals,    setActuals]    = useState([])
  const [address,    setAddress]    = useState('')
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const { data: inv, error: invErr } = await supabase
        .from('tax_invoices')
        .select('*')
        .eq('id', id)
        .single()

      if (invErr || !inv) { setError('Invoice not found.'); setLoading(false); return }
      setInvoice(inv)

      const [{ data: lineItems }, { data: insp }] = await Promise.all([
        supabase.from('tax_invoice_items').select('*').eq('invoice_id', id).order('sort_order'),
        supabase.from('inspections').select('config').eq('pid', inv.pid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      setItems(lineItems || [])
      setAddress(insp?.config?.address || `PID ${inv.pid}`)

      // Actuals items from the estimate (excluded from fixed total)
      if (inv.estimate_id) {
        const { data: estItems } = await supabase
          .from('estimate_items')
          .select('area, issue_description, item_name')
          .eq('estimate_id', inv.estimate_id)
          .eq('status', 'approved')
          .eq('cost_type', 'actuals')
        setActuals(estItems || [])
      }

      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <LogoSpinner full />

  if (error || !invoice) {
    return (
      <div style={{ minHeight: '100svh', background: '#f5f4f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: '#888', fontSize: 14 }}>
        {error || 'Invoice not found.'}
      </div>
    )
  }

  const HSN = '9954'

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* App header — hidden in print */}
      <div className="ti-app-header" style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg-panel, #1e2028)',
        borderBottom: '1px solid var(--border, #2e3040)',
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', height: 52,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em' }}>TAX INVOICE</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{invoice.invoice_number}</div>
        </div>
      </div>

      {/* Invoice document */}
      <div style={{ background: '#f0ede8', minHeight: 'calc(100svh - 52px)', padding: isMobile ? '12px 0 100px' : '24px 20px 80px' }}>
        <div
          className="ti-page"
          style={{
            background: '#fff',
            maxWidth: 780,
            margin: '0 auto',
            borderRadius: isMobile ? 0 : 8,
            boxShadow: '0 2px 20px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            fontFamily: "'Source Sans 3', 'Segoe UI', system-ui, sans-serif",
            color: '#1a1a1a',
          }}
        >

          {/* ── Letterhead ── */}
          <div style={{ background: '#111', padding: isMobile ? '20px 20px 16px' : '28px 40px 22px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 16,
            }}>
              {/* Brand */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, background: '#fff', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, flexShrink: 0 }}>
                  <img src="/logo.svg" alt="Flent" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>Flent</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>GSTIN: 29ABLCS8677C1Z0</div>
                </div>
              </div>

              {/* TAX INVOICE badge */}
              <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: '#c8963e', letterSpacing: '-0.01em', fontFamily: "'Source Sans 3', sans-serif" }}>
                  TAX INVOICE
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2, fontFamily: 'monospace' }}>
                  {invoice.invoice_number}
                </div>
              </div>
            </div>
          </div>

          {/* ── Invoice meta ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: 0,
            borderBottom: '1px solid #e8e4de',
          }}>
            {/* Bill To */}
            <div style={{ padding: isMobile ? '16px 20px' : '20px 40px', borderRight: isMobile ? 'none' : '1px solid #e8e4de', borderBottom: isMobile ? '1px solid #e8e4de' : 'none' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9b9080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Bill To</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 4 }}>{invoice.landlord_name || 'Landlord'}</div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>{address}</div>
            </div>

            {/* From + Invoice details */}
            <div style={{ padding: isMobile ? '16px 20px' : '20px 40px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9b9080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>From</div>
              <div style={{ fontSize: 13, color: '#555', lineHeight: 1.7, marginBottom: 12 }}>
                The Mayfair, Binnamangala<br />
                Indiranagar, Bengaluru 560008<br />
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#888' }}>GSTIN: 29ABLCS8677C1Z0</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12 }}>
                <span style={{ color: '#9b9080' }}>Date</span>
                <span style={{ color: '#111', fontWeight: 500 }}>{fmtDate(invoice.created_at)}</span>
                <span style={{ color: '#9b9080' }}>PID</span>
                <span style={{ color: '#111', fontWeight: 500, fontFamily: 'monospace' }}>{invoice.pid}</span>
              </div>
            </div>
          </div>

          {/* ── Line items ── */}
          <div style={{ padding: isMobile ? '0' : '0 40px' }}>
            {isMobile ? (
              /* Stacked cards on mobile */
              <div style={{ padding: '0 20px' }}>
                <div style={{ padding: '12px 0 8px', fontSize: 10, fontWeight: 700, color: '#9b9080', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '2px solid #111' }}>
                  Line Items
                </div>
                {items.map((item, i) => (
                  <div key={item.id || i} className="ti-item-row-mobile" style={{ padding: '12px 0', borderBottom: '1px solid #e8e4de' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#9b9080', fontFamily: 'monospace', marginBottom: 3 }}>#{i + 1} · HSN {HSN}</div>
                        <div style={{ fontSize: 13, color: '#111', lineHeight: 1.4 }}>{item.description}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#111', fontFamily: 'monospace' }}>{fmtINR(item.amount)}</div>
                        <div style={{ fontSize: 11, color: '#9b9080', marginTop: 2, fontFamily: 'monospace' }}>
                          {item.qty} × {fmtINR(item.rate)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: '#aaa' }}>No priced line items</div>
                )}
              </div>
            ) : (
              /* Full table on desktop */
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #111' }}>
                    {['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Amount'].map(h => (
                      <th key={h} style={{
                        padding: '10px 8px', textAlign: h === 'Amount' || h === 'Rate' || h === 'Qty' ? 'right' : h === '#' ? 'center' : 'left',
                        fontSize: 10, fontWeight: 700, color: '#9b9080', textTransform: 'uppercase', letterSpacing: '0.08em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id || i} style={{ borderBottom: '1px solid #e8e4de' }}>
                      <td style={{ padding: '11px 8px', textAlign: 'center', fontSize: 12, color: '#9b9080', fontFamily: 'monospace' }}>{i + 1}</td>
                      <td style={{ padding: '11px 8px', lineHeight: 1.4, color: '#111' }}>{item.description}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'center', fontSize: 12, fontFamily: 'monospace', color: '#666' }}>{HSN}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#444' }}>{item.qty}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#444' }}>{fmtINR(item.rate)}</td>
                      <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#111' }}>{fmtINR(item.amount)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: '24px 8px', textAlign: 'center', color: '#aaa', fontSize: 13 }}>No priced line items</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Totals ── */}
          <div style={{ padding: isMobile ? '16px 20px 20px' : '16px 40px 24px', borderTop: '1px solid #e8e4de' }}>
            <div style={{ maxWidth: isMobile ? '100%' : 280, marginLeft: 'auto' }}>
              {[
                { label: 'Subtotal', value: invoice.subtotal },
                { label: 'CGST @ 9%', value: invoice.cgst },
                { label: 'SGST @ 9%', value: invoice.sgst },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, color: '#555', borderBottom: '1px solid #f0ede8' }}>
                  <span>{row.label}</span>
                  <span style={{ fontFamily: 'monospace' }}>{fmtINR(row.value)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 6px', fontSize: 16, fontWeight: 700, color: '#111', borderTop: '2px solid #111', marginTop: 4 }}>
                <span>Grand Total</span>
                <span style={{ fontFamily: 'monospace', color: '#c8963e' }}>{fmtINR(invoice.total)}</span>
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 8, fontStyle: 'italic', lineHeight: 1.4 }}>
                {amountInWords(invoice.total)}
              </div>
            </div>
          </div>

          {/* ── Variable / actuals section ── */}
          {actuals.length > 0 && (
            <div style={{ margin: isMobile ? '0 20px 20px' : '0 40px 24px', background: '#fdf8f2', border: '1px solid #e8c87a', borderRadius: 6, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9b7830', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Variable — Charged on Actuals
              </div>
              <div style={{ fontSize: 12, color: '#776040', marginBottom: 8, lineHeight: 1.5 }}>
                The following items will be billed separately at cost once work is completed:
              </div>
              {actuals.map((it, i) => (
                <div key={i} style={{ fontSize: 13, color: '#555', padding: '3px 0', borderBottom: i < actuals.length - 1 ? '1px solid #e8dcc0' : 'none' }}>
                  {[it.area, it.issue_description || it.item_name].filter(Boolean).join(' — ')}
                </div>
              ))}
            </div>
          )}

          {/* ── Footer ── */}
          <div style={{ padding: isMobile ? '14px 20px 20px' : '16px 40px 24px', borderTop: '1px solid #e8e4de', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
            <div style={{ fontSize: 11, color: '#999', lineHeight: 1.6 }}>
              This is a computer generated invoice.<br />
              Subject to Bengaluru jurisdiction.
            </div>
            <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 28 }}>Authorised Signatory</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>Flent</div>
              <div style={{ fontSize: 11, color: '#999' }}>GSTIN: 29ABLCS8677C1Z0</div>
            </div>
          </div>

        </div>
      </div>

      {/* Download bar — hidden in print */}
      <div className="ti-download-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg-panel, #1e2028)',
        borderTop: '1px solid var(--border, #2e3040)',
        padding: `12px 20px calc(12px + env(safe-area-inset-bottom))`,
        display: 'flex', gap: 10,
      }}>
        <button
          onClick={() => window.print()}
          style={{
            flex: 1, height: 44, background: 'var(--accent, #c8963e)', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#000',
            cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          Download PDF
        </button>
        <button
          onClick={() => navigate(-1)}
          style={{
            height: 44, padding: '0 20px', background: 'none',
            border: '1px solid var(--border, #2e3040)', borderRadius: 8,
            fontSize: 13, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          Close
        </button>
      </div>
    </>
  )
}
