import { useState, useRef, useEffect } from 'react'
import LiveCameraSheet from '../LiveCameraSheet'
import { signedDocUrl } from '../../utils/vendorHub'
import { uploadAssetFile, isPdfPath, IMAGE_OR_PDF } from '../../utils/assetFiles'

// Photograph it, or pick a file. Used for an asset's purchase invoice and for
// the photo of the item itself.
//
// Both routes, always. The thing being captured is usually in front of you, so
// the camera is the fast path — but an invoice may equally have arrived as a
// PDF by email. On Android `capture` is a request the OS is free to ignore, so
// a file picker that opens the gallery is never a substitute for a real camera:
// getUserMedia drives the capture and the picker stays its own button rather
// than a fallback.
//
// Uploads on selection rather than on form submit, because something
// photographed on a building site should not be riding on the form staying open.

const MONO = 'var(--font-mono, monospace)'

// One card per file, not a label plus two big buttons plus a hint. Two of
// those side by side was most of the visual weight on a form that is mostly
// text fields, and it made an optional attachment read louder than the serial
// number nobody is allowed to skip.
// Text-styled, but still a real target: 44px tall with a negative margin so
// the hit box extends past the visible text without pushing the card open.
// A link that only looks tappable is the kind of thing that works on a desk
// and fails on a phone held in one hand at a site.
const link = {
  background: 'none', border: 'none', padding: '0 6px', margin: '-6px 0',
  minHeight: 44, display: 'inline-flex', alignItems: 'center',
  fontSize: 12.5, fontWeight: 600, fontFamily: MONO, cursor: 'pointer',
  color: 'var(--accent, #c8963e)',
}

export default function CaptureUpload({
  value, folder, supabase, onChange, disabled,
  name = 'file',
  accept = IMAGE_OR_PDF,
  hint = 'Photo, or a PDF',
  camTitle = 'Take photo',
  doneLabel = 'Attached',
  icon = '📎',
}) {
  const [cam, setCam] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(null)
  const fileRef = useRef(null)

  // A private bucket needs a signed URL, and it expires — so this re-runs
  // whenever the stored path changes rather than being resolved once.
  useEffect(() => {
    let alive = true
    if (!value || isPdfPath(value)) {
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
      const path = await uploadAssetFile(supabase, folder, file, name)
      onChange(path)
    } catch (e) {
      const msg = /row-level security/i.test(e.message || '')
        ? "Upload isn't permitted for this account yet — the office needs to enable it."
        : (e.message || 'Could not upload that.')
      setErr(msg)
    }
    setBusy(false)
  }

  if (value) {
    const pdf = isPdfPath(value)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9 }}>
        {pdf
          ? <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(224,92,106,0.12)', color: 'var(--red, #e05c6a)', fontSize: 9, fontWeight: 700, fontFamily: MONO }}>PDF</span>
          : preview
            ? <img src={preview} alt="" style={{ width: 40, height: 40, flexShrink: 0, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border, #2e3040)' }} />
            : <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 6, background: 'var(--bg-panel, #1e2028)' }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>✓ {doneLabel}</div>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 10 }}>
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1, opacity: busy ? 0.5 : 0.8 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {busy
            ? <div style={{ fontSize: 12.5, color: 'var(--accent, #c8963e)', fontFamily: MONO }}>Uploading…</div>
            : (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                <button type="button" disabled={disabled} onClick={() => setCam(true)} style={link}>Take photo</button>
                <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>or</span>
                <button type="button" disabled={disabled} onClick={() => fileRef.current?.click()} style={link}>choose a file</button>
              </div>
            )}
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.4 }}>{hint}</div>
        </div>
      </div>
      {err && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, lineHeight: 1.5, wordBreak: 'break-word' }}>⚠ {err}</div>
      )}

      <input ref={fileRef} type="file" accept={accept} style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; take(f) }} />

      <LiveCameraSheet
        open={cam}
        title={camTitle}
        onClose={() => setCam(false)}
        onDone={fs => { setCam(false); if (fs.length) take(fs[0]) }}
        onFallback={() => { setCam(false); fileRef.current?.click() }}
      />
    </div>
  )
}
