// A document on screen → a real PDF file the person keeps.
//
// The vendor portal used to hand this to window.print(), which fails on the
// phones vendors actually use: WhatsApp's in-app browser and home-screen apps
// have no print at all, and the print rule hid the page's own root so even
// Chrome saved a blank page. This draws the element to a canvas and wraps it
// in an A4 PDF instead.
//
// The two libraries are loaded on the first tap, not with the portal — vendors
// open it over mobile data every morning to mark attendance.

const A4_W = 210, A4_H = 297, MARGIN = 10   // mm

export async function elementToPdfBlob(el) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  if (document.fonts?.ready) await document.fonts.ready
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false })

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const w = A4_W - MARGIN * 2
  const pxPerMm = canvas.width / w
  const pagePx = Math.floor((A4_H - MARGIN * 2) * pxPerMm)

  // Long documents run onto further pages, cut at page height.
  for (let y = 0, page = 0; y < canvas.height; y += pagePx, page++) {
    const h = Math.min(pagePx, canvas.height - y)
    const slice = document.createElement('canvas')
    slice.width = canvas.width; slice.height = h
    slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    if (page) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN, w, h / pxPerMm)
  }
  return pdf.output('blob')
}

const UA = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const IOS = /iP(hone|ad|od)/.test(UA) || (/Macintosh/.test(UA) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
// In-app browsers (WhatsApp, Instagram, Facebook…) are Android WebViews — "; wv)"
// in the UA — and often swallow a blob download without a word.
const IN_APP = /; wv\)|FBAN|FBAV|Instagram|WhatsApp/i.test(UA)

// Hands the file over the way this device can actually keep it: the share
// sheet on iPhone and inside in-app browsers ("Save to Files", WhatsApp,
// Drive…), a plain download everywhere else. Returns how it went.
export async function deliverPdf(blob, filename) {
  const file = typeof File === 'function' ? new File([blob], filename, { type: 'application/pdf' }) : null
  if ((IOS || IN_APP) && file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'
      // fall through to a download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return IN_APP ? 'download-in-app' : 'downloaded'
}

export const pdfEnv = { IOS, IN_APP }
