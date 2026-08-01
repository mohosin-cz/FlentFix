// ─── Vendor hub helpers (internal review side) ──────────────────────────────

// status → chip label + colour (theme tokens; blue for under_review is the one
// status without a theme token, so it's spelled out)
export const STATUS_META = {
  submitted:    { label: 'Submitted',    color: 'var(--amber, #c8963e)' },
  under_review: { label: 'Under review', color: '#5b8def' },
  approved:     { label: 'Approved',     color: 'var(--green, #3dba7a)' },
  rejected:     { label: 'Rejected',     color: 'var(--red, #e05c6a)' },
  withdrawn:    { label: 'Withdrawn',    color: 'var(--text-muted, #6b6d82)' },
}

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Unknown', color: 'var(--text-muted, #6b6d82)' }
}

// filter chips — default is 'submitted'
export const STATUS_FILTERS = [
  { key: 'submitted',    label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'approved',     label: 'Approved' },
  { key: 'rejected',     label: 'Rejected' },
  { key: 'all',          label: 'All' },
]

export const POD_OPTIONS = ['OG', 'Alpha', 'Unassigned']

export const REJECTION_REASONS = [
  'Documents unclear / unreadable',
  'Details do not match documents',
  'Duplicate application',
  'Failed verification call',
  'Location / liveness check failed',
  'Incomplete payout details',
  'Other',
]

// The public onboarding URL (the ONLY place the app surfaces this link).
export function onboardUrl() {
  return `${window.location.origin}/onboard`
}

// Signed URL for a private vendor-docs object. Short TTL. NEVER build a public
// URL for this bucket — it is private and must stay private. Throws on failure
// so the caller can surface a real error.
export async function signedDocUrl(supabase, path, ttl = 300) {
  if (!path) return null
  const { data, error } = await supabase.storage.from('vendor-docs').createSignedUrl(path, ttl)
  if (error) throw error
  return data.signedUrl
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

export function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Mask an account number to its last 4 digits.
export function maskAccount(no) {
  if (!no) return '—'
  const s = String(no)
  return '•••• ' + s.slice(-4)
}
