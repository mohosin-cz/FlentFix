import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { elementToPdfBlob, deliverPdf } from '../../utils/savePdf'

// "Download PDF" for anything the portal shows a vendor. `children` is what
// goes in the file; it is drawn off screen at A4 width (794px), so the PDF is
// the full document even when the screen shows the narrow phone layout.
//
// What happened is said in a line under the button — on a phone the file
// can land quietly in Downloads or a share sheet, and "nothing happened" was
// the original complaint.

const MONO = 'var(--font-mono, monospace)'

export default function PdfButton({ filename, children, style, label = '⤓ Download PDF' }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)       // { tone, text }
  const [render, setRender] = useState(false)
  const host = useRef(null)

  async function go() {
    if (busy) return
    setBusy(true); setMsg(null); setRender(true)
    try {
      // let the off-screen copy mount and paint (signature image included)
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      const imgs = [...(host.current?.querySelectorAll('img') || [])]
      await Promise.all(imgs.map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r }))))
      const blob = await elementToPdfBlob(host.current)
      const how = await deliverPdf(blob, filename)
      setMsg(how === 'shared' ? { tone: 'ok', text: 'Saved — pick where to keep it from the share menu.' }
        : how === 'cancelled' ? null
        : how === 'download-in-app' ? { tone: 'warn', text: 'Downloading… If nothing appears, open this page in Chrome (⋮ → Open in browser) and tap again.' }
        : { tone: 'ok', text: `Downloaded — ${filename} is in your Downloads.` })
    } catch (e) {
      console.error('[PdfButton]', e)
      setMsg({ tone: 'err', text: `Couldn’t make the PDF — ${e?.message || 'try again'}. Taking a screenshot works too.` })
    } finally {
      setRender(false); setBusy(false)
    }
  }

  const tone = { ok: '#6f9a7e', warn: 'var(--accent, #c8963e)', err: 'var(--red, #b0645b)' }
  return (
    <>
      <button type="button" onClick={go} disabled={busy} aria-busy={busy}
        style={{ minHeight: 46, borderRadius: 10, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408',
                 fontSize: 13.5, fontWeight: 700, fontFamily: MONO, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.75 : 1, padding: '0 16px', ...style }}>
        {busy ? 'Making the PDF…' : label}
      </button>
      {msg && <div role="status" style={{ fontSize: 11.5, lineHeight: 1.5, color: tone[msg.tone], fontFamily: MONO, textAlign: 'center' }}>{msg.text}</div>}
      {render && createPortal(
        <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 794, background: '#fff', pointerEvents: 'none' }}>
          <div ref={host} style={{ width: 794, background: '#fff' }}>{children}</div>
        </div>,
        document.body,
      )}
    </>
  )
}
