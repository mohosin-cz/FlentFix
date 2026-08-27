import { useState, useRef, useEffect } from 'react'
import LiveCameraSheet from '../LiveCameraSheet'
import { signedDocUrl } from '../../utils/vendorHub'
import { uploadAssetInvoice, invoiceIsPdfPath, INVOICE_ACCEPT } from '../../utils/assetInvoice'

// Attach the purchase invoice for an asset: photograph it, or pick a file.
//
// Both routes, always. The bill is usually in the box, so the camera is the
// fast path — but it may equally have arrived as a PDF by email, and on Android
// `capture` is a request the OS is free to ignore, so a file picker that opens
// the gallery is never a substitute for a real camera. getUserMedia drives the
// capture and the picker stays as its own button rather than a fallback.
//
// Uploads on selection rather than on form submit: a bill photographed on a
// building site should not be riding on the form staying open.

const MONO = 'var(--font-mono, monospace)'

const btn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  padding: '10px 14px', minHeight: 42, fontSize: 12.5, fontWeight: 600, borderRadius: 9,
  cursor: 'pointer', fontFamily: MONO, border: '1px dashed var(--border-dash, #3a3d52)',
  background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', flex: '1 1 130px',
}

export default function InvoiceCapture({ value, folder, supabase, onChange, disabled }) {
  const [cam, setCam] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)

  // A private bucket needs a signed URL, and it expires — so this re-runs
  // whenever the stored path changes rather than being resolved once.
  useEffect(() => {
    let alive = true
    if (!value || invoiceIsPdfPath(value)) {
      const t = setTimeout(() => { if (alive) setPreview(null) }, 0)
      return () => { alive = false; clearTimeout(t) }
    }
    signedDocUrl(supabase, value).then(u => { if (alive) setPreview(u) }).catch(() => {})
    return () => { alive = false }
  }, [value, supabase])

  async function take(file) {
    if (!file) return
    setBusy(true); setErr('')
    try {
      const path = await uploadAssetInvoice(supabase, folder, file)
      onChange(path)
    } catch (e) {
      setErr(e.message || 'Could not upload that.')
    }
    setBusy(false)
  }

  if (value) {
    const pdf = invoiceIsPdfPath(value)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9 }}>
        {pdf
          ? <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(224,92,106,0.12)', color: 'var(--red, #e05c6a)', fontSize: 9, fontWeight: 700, fontFamily: MONO }}>PDF</span>
          : preview
            ? <img src={preview} alt="Invoice" style={{ width: 40, height: 40, flexShrink: 0, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border, #2e3040)' }} />
            : <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, background: 'var(--bg-panel, #1e2028)' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>✓ Invoice attached</div>
          {preview && !pdf && (
            <a href={preview} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>view full size</a>
          )}
        </div>
        {!disabled && (
          <button type="button" onClick={() => { onChange(null); setPreview(null) }}
            style={{ background: 'none', border: 'none', color: 'var(--red, #e05c6a)', cursor: 'pointer', fontSize: 12, fontFamily: MONO, padding: '8px 6px' }}>Remove</button>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={disabled || busy} onClick={() => setCam(true)} style={btn}>
          {busy ? 'Uploading…' : '📷 Take photo'}
        </button>
        <button type="button" disabled={disabled || busy} onClick={() => fileRef.current?.click()} style={btn}>
          ⤒ Choose file
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 5 }}>
        Photo of the bill, or a PDF
      </div>
      {err && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, lineHeight: 1.5, wordBreak: 'break-word' }}>⚠ {err}</div>
      )}

      <input ref={fileRef} type="file" accept={INVOICE_ACCEPT} style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; take(f) }} />

      <LiveCameraSheet
        open={cam}
        title="Photograph the invoice"
        onClose={() => setCam(false)}
        onDone={fs => { setCam(false); if (fs.length) take(fs[0]) }}
        onFallback={() => { setCam(false); fileRef.current?.click() }}
      />
    </div>
  )
}
