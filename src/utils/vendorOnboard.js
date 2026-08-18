import imageCompression from 'browser-image-compression'

// ─── Field validators ──────────────────────────────────────────────────────
// Each returns a boolean. Callers turn `false` into a user-facing message.

const s = v => (v || '').trim()

// 10-digit Indian mobile (starts 6–9)
export const isPhone   = v => /^[6-9]\d{9}$/.test(s(v))
export const isPincode = v => /^\d{6}$/.test(s(v))
export const isEmail   = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s(v))
// IFSC: 4 letters + '0' + 6 alphanumerics (11 chars)
export const isIFSC    = v => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s(v).toUpperCase())
// PAN: AAAAA9999A
export const isPAN     = v => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s(v).toUpperCase())
// UPI: name@handle
export const isUPI     = v => /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(s(v))
// Aadhaar — we only ever handle the last 4 digits, never the full number
export const isLast4   = v => /^\d{4}$/.test(s(v))

// ─── Submission id ─────────────────────────────────────────────────────────
// crypto.randomUUID() only exists in a secure context. The onboarding link is
// handed to vendors and opened on whatever phone they have, and the moment one
// of them opens it over plain http the call is undefined and the component
// throws during render — a blank page, before the form has painted.
// crypto.getRandomValues has no such restriction, so build the v4 by hand.
export function newSubmissionId() {
  if (globalThis.crypto?.randomUUID) {
    try { return crypto.randomUUID() } catch { /* fall through */ }
  }
  const b = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40   // version 4
  b[8] = (b[8] & 0x3f) | 0x80   // variant 10
  const h = [...b].map(x => x.toString(16).padStart(2, '0'))
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`
}

// ─── Image compression ─────────────────────────────────────────────────────
// Compress an image blob/File to <= 400KB before upload.
//
// WebP first, then JPEG, then the original bytes. It used to be WebP or
// nothing: any device whose canvas cannot encode WebP — some older Android
// WebViews — failed the whole submission at the first document, which is a
// hard stop for a vendor standing in front of a runner with no other way in.
// A slightly larger JPEG is always better than a blocked onboarding.
// Returns { file, ext } so the caller stores the extension that matches.
export async function compressForUpload(blob) {
  const file = blob instanceof File
    ? blob
    : new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' })
  const base = { maxSizeMB: 0.4, maxWidthOrHeight: 1600, useWebWorker: true, initialQuality: 0.82 }

  try {
    const webp = await imageCompression(file, { ...base, fileType: 'image/webp' })
    // Some engines resolve without actually re-encoding; trust the result only
    // if it really came back as WebP.
    if (webp?.type === 'image/webp') return { file: webp, ext: 'webp' }
    return { file: webp, ext: 'jpg' }
  } catch (e) {
    console.warn('[compressForUpload] webp failed, trying jpeg:', e?.message)
  }

  try {
    const jpg = await imageCompression(file, { ...base, fileType: 'image/jpeg' })
    return { file: jpg, ext: 'jpg' }
  } catch (e) {
    console.warn('[compressForUpload] jpeg failed, sending original:', e?.message)
  }

  const ext = /png$/i.test(file.type) ? 'png' : /webp$/i.test(file.type) ? 'webp' : 'jpg'
  return { file, ext }
}

// ─── Upload one doc to the private vendor-docs bucket ───────────────────────
// Compresses, then uploads under `${submissionId}/${name}.webp`.
// Returns the stored path (never a public URL — the bucket is private and the
// anon key has no read access). Throws the real error on failure.
export async function uploadVendorDoc(supabase, submissionId, name, blob) {
  const { file, ext } = await compressForUpload(blob)
  const path = `${submissionId}/${name}.${ext}`
  const { data, error } = await supabase.storage
    .from('vendor-docs')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })
  if (error) throw error
  return data.path
}
