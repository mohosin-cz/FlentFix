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

// ─── Image compression ─────────────────────────────────────────────────────
// Compress any image blob/File to WebP at <= 400KB before upload.
// Throws on failure so the caller can surface a real error (never silent).
export async function compressToWebp(blob) {
  const file = blob instanceof File
    ? blob
    : new File([blob], 'capture.jpg', { type: blob.type || 'image/jpeg' })
  return imageCompression(file, {
    maxSizeMB: 0.4,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.82,
  })
}

// ─── Upload one doc to the private vendor-docs bucket ───────────────────────
// Compresses, then uploads under `${submissionId}/${name}.webp`.
// Returns the stored path (never a public URL — the bucket is private and the
// anon key has no read access). Throws the real error on failure.
export async function uploadVendorDoc(supabase, submissionId, name, blob) {
  const webp = await compressToWebp(blob)
  const path = `${submissionId}/${name}.webp`
  const { data, error } = await supabase.storage
    .from('vendor-docs')
    .upload(path, webp, { upsert: true, contentType: 'image/webp' })
  if (error) throw error
  return data.path
}
