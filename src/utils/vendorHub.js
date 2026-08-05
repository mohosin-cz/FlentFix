// ─── Vendor hub helpers (internal review side) ──────────────────────────────

export const POD_OPTIONS = ['OG', 'Alpha', 'Unassigned']

// Removing a vendor is admin-only. This hides the control; the real gate is in
// remove_vendor()/restore_vendor(), which check the caller's JWT server-side.
export const ADMIN_EMAIL = 'mohosin@flent.in'
export const isAdmin = (email) => (email || '').trim().toLowerCase() === ADMIN_EMAIL

// The public onboarding URL (the ONLY place the app surfaces this link).
export function onboardUrl() {
  return `${window.location.origin}/onboard`
}

// The public vendor attendance (punch) URL.
export function attendUrl() {
  return `${window.location.origin}/attend`
}

// getCurrentPosition wrapped in a promise, with friendly permission errors.
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Location is not supported on this device.')); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      err => {
        if (err.code === 1) reject(new Error('Location permission is blocked. Tap the lock / ⓘ icon by the address → Location → Allow, then retry.'))
        else if (err.code === 2) reject(new Error('Location is unavailable — move to open sky and retry.'))
        else if (err.code === 3) reject(new Error('Getting location timed out — retry.'))
        else reject(new Error(err.message || 'Could not get location.'))
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  })
}

export function fmtTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// Duration in ms → "3h 20m" / "45m".
export function fmtDuration(ms) {
  if (ms == null || ms < 0) return '—'
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

// Today's date as yyyy-mm-dd in the local timezone (for <input type=date>).
export function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Signed URL for a single private vendor-docs object. Short TTL. NEVER build a
// public URL for this bucket — it is private and must stay private. Throws on
// failure so the caller can surface a real error.
export async function signedDocUrl(supabase, path, ttl = 300) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('vendor-docs').createSignedUrl(path, ttl)
  if (error) throw error
  return data.signedUrl
}

// Batch signed URLs → returns a { path: url } map. Missing/errored paths are
// simply absent from the map (callers fall back to initials).
export async function signedDocUrls(supabase, paths, ttl = 300) {
  const clean = [...new Set(paths.filter(Boolean))]
  if (!clean.length) return {}
  const { data, error } = await supabase.storage.from('vendor-docs').createSignedUrls(clean, ttl)
  if (error) return {}
  const map = {}
  for (const row of data || []) {
    if (row.signedUrl && !row.error) map[row.path] = row.signedUrl
  }
  return map
}

// Clipboard copy, matching the guarded pattern used elsewhere in the app.
export async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Compact form for phones — "01 Sep 25" instead of "01 Sept 2025", which wraps
// inside a third of a 390px card.
export function fmtDateShort(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }).replace('Sept', 'Sep')
}

export function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Short relative time ("3h ago", "2d ago"), falling back to an absolute date.
export function relTime(d) {
  if (!d) return ''
  const secs = (Date.now() - new Date(d).getTime()) / 1000
  if (secs < 60) return 'just now'
  const mins = secs / 60
  if (mins < 60) return `${Math.floor(mins)}m ago`
  const hrs = mins / 60
  if (hrs < 24) return `${Math.floor(hrs)}h ago`
  const days = hrs / 24
  if (days < 7) return `${Math.floor(days)}d ago`
  return fmtDate(d)
}

// Mask an account number to its last 4 digits.
export function maskAccount(no) {
  if (!no) return '—'
  const s = String(no)
  return '•••• ' + s.slice(-4)
}

// ── avatar helpers (initials + a stable, tasteful colour per name) ──────────
const AVATAR_COLORS = ['#c8963e', '#3dba7a', '#5b8def', '#c77dbb', '#d98748', '#57b3b0']

export function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function avatarColor(name) {
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
