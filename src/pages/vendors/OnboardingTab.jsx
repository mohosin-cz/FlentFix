import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { signedDocUrls, relTime, initials, avatarColor } from '../../utils/vendorHub'
import VendorDetailSheet from './VendorDetailSheet'

// ── avatar: live selfie if we have a signed URL, else coloured initials ──────
function Avatar({ name, url, size = 46 }) {
  return url ? (
    <img src={url} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border, #2e3040)' }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(name) + '22', color: avatarColor(name), fontWeight: 700, fontSize: size * 0.36, fontFamily: 'var(--font-mono, monospace)', border: `1px solid ${avatarColor(name)}55` }}>
      {initials(name)}
    </div>
  )
}

// ── one candidate card ──────────────────────────────────────────────────────
function CandidateCard({ v, photo, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(v)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
        padding: '13px 14px', background: 'var(--bg-panel, #1e2028)',
        border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.15s, transform 0.05s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-dash, #3a3d52)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #2e3040)' }}
    >
      <Avatar name={v.full_name} url={photo} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.full_name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 6, padding: '1px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{v.trade}</span>
          {v.pod && <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{v.pod}</span>}
          <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{v.phone}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>{relTime(v.submitted_at)}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="var(--text-muted, #6b6d82)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    </button>
  )
}

export default function OnboardingTab() {
  const [rows, setRows] = useState(null)   // null = not loaded / after error (never renders empty state)
  const [photos, setPhotos] = useState({}) // path -> signed url
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    // Candidates = people who submitted and haven't been onboarded yet.
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
    if (error) {
      setError(error.message)   // loud error — never fall through to an empty list
      setRows(null)
    } else {
      setRows(data)
      // batch signed URLs for the live-photo avatars (best-effort)
      const map = await signedDocUrls(supabase, (data || []).map(v => v.live_photo_path), 300)
      setPhotos(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows && rows.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {rows.length} candidate{rows.length === 1 ? '' : 's'} waiting
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 14px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontFamily: 'var(--font-mono, monospace)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', marginBottom: 4 }}>⚠ Could not load candidates</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', wordBreak: 'break-word' }}>{error}</div>
          <button type="button" onClick={load} style={{ marginTop: 8, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Retry</button>
        </div>
      )}

      {loading && !error && (
        <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>
      )}

      {/* empty state — ONLY on a successful zero-row response */}
      {!loading && !error && rows && rows.length === 0 && (
        <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🎉</div>
          <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>All caught up</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>No new candidates waiting to be onboarded.</div>
        </div>
      )}

      {!error && rows && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(v => <CandidateCard key={v.id} v={v} photo={photos[v.live_photo_path]} onOpen={setSelected} />)}
        </div>
      )}

      {selected && (
        <VendorDetailSheet
          key={selected.id}
          vendor={selected}
          onClose={() => setSelected(null)}
          onOnboarded={() => { setSelected(null); load() }}
          onUpdated={load}
        />
      )}
    </div>
  )
}
