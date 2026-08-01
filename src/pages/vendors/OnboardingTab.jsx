import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { signedDocUrls, relTime, fmtDate, initials, avatarColor } from '../../utils/vendorHub'
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

// ── Candidates / Onboarded segment ──────────────────────────────────────────
function Segment({ view, onView, candCount, onbCount }) {
  const item = (key, label, count) => {
    const on = view === key
    return (
      <button
        type="button"
        onClick={() => onView(key)}
        style={{
          flex: 1, padding: '9px 8px', fontSize: 13, fontWeight: on ? 700 : 500,
          border: 'none', borderRadius: 8, cursor: 'pointer',
          background: on ? 'var(--bg-input, #252731)' : 'transparent',
          color: on ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
          fontFamily: 'var(--font-mono, monospace)',
          boxShadow: on ? 'inset 0 0 0 1px var(--border, #2e3040)' : 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >{label}{count != null ? ` (${count})` : ''}</button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
      {item('candidates', 'Candidates', candCount)}
      {item('onboarded', 'Onboarded', onbCount)}
    </div>
  )
}

// ── candidate card (pending) ────────────────────────────────────────────────
function CandidateCard({ v, photo, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(v)} style={cardStyle}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-dash, #3a3d52)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #2e3040)' }}>
      <Avatar name={v.full_name} url={photo} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={nameStyle}>{v.full_name}</div>
        <div style={metaRow}>
          <span style={tradeTag}>{v.trade}</span>
          {v.pod && <span style={podTxt}>{v.pod}</span>}
          <span style={subTxt}>{v.phone}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ ...subTxt, fontSize: 10, whiteSpace: 'nowrap' }}>{relTime(v.submitted_at)}</span>
        <Chevron />
      </div>
    </button>
  )
}

// ── onboarded roster row (read-only, tap to view) ───────────────────────────
function RosterRow({ v, photo, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(v)} style={cardStyle}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-dash, #3a3d52)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #2e3040)' }}>
      <Avatar name={v.full_name} url={photo} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={nameStyle}>{v.full_name}</div>
        <div style={metaRow}>
          <span style={tradeTag}>{v.trade}</span>
          {v.pod && <span style={podTxt}>{v.pod}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>{v.vendor_code || '—'}</span>
        <span style={{ ...subTxt, fontSize: 10, whiteSpace: 'nowrap' }}>{v.reviewed_at ? fmtDate(v.reviewed_at) : ''}</span>
      </div>
    </button>
  )
}

function Chevron() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="var(--text-muted, #6b6d82)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

const cardStyle = { display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: '13px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.15s' }
const nameStyle = { fontSize: 15, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const metaRow = { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }
const tradeTag = { fontSize: 11, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 6, padding: '1px 8px', fontFamily: 'var(--font-mono, monospace)' }
const podTxt = { fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }
const subTxt = { fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }

export default function OnboardingTab() {
  const [view, setView] = useState('candidates')
  const [cands, setCands] = useState(null)     // null = not loaded / after error
  const [onboarded, setOnboarded] = useState(null)
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [candRes, onbRes] = await Promise.all([
      supabase.from('vendors').select('*').eq('status', 'submitted').order('submitted_at', { ascending: false }),
      supabase.from('vendors').select('*').eq('status', 'approved').order('reviewed_at', { ascending: false }),
    ])
    const e = candRes.error || onbRes.error
    if (e) {
      setError(e.message)   // loud error — never fall through to an empty list
      setCands(null); setOnboarded(null)
    } else {
      setCands(candRes.data); setOnboarded(onbRes.data)
      const map = await signedDocUrls(supabase, [...candRes.data, ...onbRes.data].map(v => v.live_photo_path), 300)
      setPhotos(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const q = query.trim().toLowerCase()
  const roster = (onboarded || []).filter(v => !q ||
    [v.full_name, v.vendor_code, v.trade, v.phone, v.pod].some(f => (f || '').toLowerCase().includes(q)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Segment view={view} onView={setView} candCount={cands ? cands.length : null} onbCount={onboarded ? onboarded.length : null} />

      {error && (
        <div style={{ padding: '12px 14px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontFamily: 'var(--font-mono, monospace)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', marginBottom: 4 }}>⚠ Could not load vendors</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', wordBreak: 'break-word' }}>{error}</div>
          <button type="button" onClick={load} style={{ marginTop: 8, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Retry</button>
        </div>
      )}

      {loading && !error && (
        <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>
      )}

      {/* ── Candidates ──────────────────────────────────────────────────── */}
      {!loading && !error && view === 'candidates' && cands && (
        cands.length === 0 ? (
          <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>All caught up</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>No new candidates waiting to be onboarded.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {cands.map(v => <CandidateCard key={v.id} v={v} photo={photos[v.live_photo_path]} onOpen={setSelected} />)}
          </div>
        )
      )}

      {/* ── Onboarded roster ────────────────────────────────────────────── */}
      {!loading && !error && view === 'onboarded' && onboarded && (
        onboarded.length === 0 ? (
          <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No vendors onboarded yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>Onboarded vendors and their codes will appear here.</div>
          </div>
        ) : (
          <>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, code, trade, phone…"
              style={{ width: '100%', padding: '10px 14px', fontSize: 16, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }}
            />
            {roster.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No match for “{query}”.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {roster.map(v => <RosterRow key={v.id} v={v} photo={photos[v.live_photo_path]} onOpen={setSelected} />)}
              </div>
            )}
          </>
        )
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
