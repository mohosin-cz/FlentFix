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

  // Last resort: store the original under an extension that matches what it
  // actually is. The old fallback treated anything that wasn't PNG or WebP as
  // JPEG, so an iPhone HEIC — which the compressor above cannot decode, so it
  // always lands here — was written as `.jpg` containing HEIC bytes. Nothing
  // could then render it, and the file gave no clue why.
  const sub = (file.type || '').split('/')[1]?.split(';')[0]?.toLowerCase()
  const ext = ({ jpeg: 'jpg', 'svg+xml': 'svg' }[sub]) ||
    (/^[a-z0-9]{2,5}$/.test(sub || '') ? sub : 'jpg')
  return { file, ext }
}

// Can this browser actually draw the image? HEIC decodes in Safari and not in
// Chrome, so "it is an image" is not the same question as "we can show it".
// Asked before upload, because a file nobody can open is worse stored than
// refused — at least a refusal says what to do about it.
export async function canDecodeImage(blob) {
  try {
    const bmp = await createImageBitmap(blob)
    bmp.close?.()
    return true
  } catch {
    return false
  }
}

// ─── Upload one doc to the private vendor-docs bucket ───────────────────────
// Compresses, then uploads under `${submissionId}/${name}-${nonce}.${ext}`.
// Returns the stored path (never a public URL — the bucket is private and the
// anon key has no read access). Throws the real error on failure.
//
// Every upload writes a NEW object. It used to upsert to a fixed path, which
// bricked the form on the second attempt: the bucket grants anon insert but
// deliberately not update — so nobody can overwrite another vendor's
// documents — and an upsert over an existing object is an update, which RLS
// refuses with "new row violates row-level security policy". The submission id
// is fixed for the page session, so once a submit had failed for any reason,
// every retry hit that wall until the vendor reloaded and started over.
//
// A per-call nonce keeps each attempt an insert, so retries work under the
// existing (tighter) policy. It also fixes the quieter bug in the obvious
// alternative of ignoring "already exists": if the vendor retakes a photo and
// resubmits, the retake is what gets stored, not the first shot.
export async function uploadVendorDoc(supabase, submissionId, name, blob) {
  const { file, ext } = await compressForUpload(blob)
  const nonce = newSubmissionId().slice(0, 8)
  const path = `${submissionId}/${name}-${nonce}.${ext}`
  const { data, error } = await supabase.storage
    .from('vendor-docs')
    .upload(path, file, { contentType: file.type || 'image/jpeg' })
  if (error) throw error
  return data.path
}
