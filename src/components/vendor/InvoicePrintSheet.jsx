import { useEffect } from 'react'
import InvoiceDoc from './InvoiceDoc'
import { monthLabel } from '../../utils/vendorInvoice'

// Every signed invoice for a month, one per page, handed to the browser's own
// print dialogue — which is where "Save as PDF" lives. That is how the tax
// invoice and the appliance report already work here, and it keeps a PDF
// library and its fonts out of a bundle that vendors load over mobile data.
//
// The result is a single multi-page PDF: one file to archive, mail to an
// accountant, or attach to the month's payroll record.

export default function InvoicePrintSheet({ period, rows, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // Closing when the dialogue goes away covers both Print and Cancel — there
    // is no way to tell them apart, and leaving the overlay up after a cancel
    // would strand the page.
    const after = () => onClose()
    window.addEventListener('afterprint', after)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('afterprint', after) }
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: '#3a3d52', overflowY: 'auto' }}>
      <style>{`
        @media print {
          /* Only the sheet prints. The app's own chrome, nav and any open
             overlay are hidden by the same rule the other print views use. */
          body > *:not(.inv-print-root) { display: none !important; }
          .inv-print-root { position: static !important; background: #fff !important; overflow: visible !important; }
          .inv-print-bar { display: none !important; }
          .inv-print-page { break-after: page; page-break-after: always; padding: 0 !important; }
          .inv-print-page:last-child { break-after: auto; page-break-after: auto; }
          .inv-doc { box-shadow: none !important; border-radius: 0 !important; max-width: none !important; }
        }
        @page { size: A4; margin: 14mm; }
      `}</style>

      <div className="inv-print-root" style={{ minHeight: '100%' }}>
        <div className="inv-print-bar" style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>
            {rows.length === 1
              ? `${rows[0].invoice.invoice_no} · ${rows[0].name}`
              : `${rows.length} invoices · ${monthLabel(period.period_month)}`}
            <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>
              {rows.length === 1
                ? 'Choose “Save as PDF” as the destination'
                : 'Choose “Save as PDF” as the destination to get one file'}
            </div>
          </div>
          <button type="button" onClick={() => window.print()}
            style={{ minHeight: 42, padding: '0 18px', borderRadius: 9, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer' }}>
            ⤓ Download / print
          </button>
          <button type="button" onClick={onClose}
            style={{ minHeight: 42, padding: '0 14px', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer' }}>
            Close
          </button>
        </div>

        <div style={{ padding: '18px 12px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {rows.map(r => (
            <div key={r.invoice.id} className="inv-print-page">
              <div className="inv-doc">
                <InvoiceDoc data={r.invoice.snapshot}
                  signature={r.invoice.signature_png}
                  signedName={r.invoice.signed_name}
                  signedAt={r.invoice.signed_at} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
