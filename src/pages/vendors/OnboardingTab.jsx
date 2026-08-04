import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { signedDocUrls, fmtDate, relTime, initials, avatarColor } from '../../utils/vendorHub'
import VendorDetailSheet from './VendorDetailSheet'

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })

const avatarUrl = (path) => {
  if (!path) return null
  try { return supabase.storage.from('vendor-avatars').getPublicUrl(path).data.publicUrl } catch { return null }
}
function photoOf(v, photos) {
  return (v && avatarUrl(v.avatar_path)) || (v && photos[v.live_photo_path]) || null
}

// ── avatar ──────────────────────────────────────────────────────────────────
function Avatar({ name, url, size = 46 }) {
  return url
    ? <img src={url} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border, #2e3040)' }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(name) + '22', color: avatarColor(name), fontWeight: 700, fontSize: size * 0.36, fontFamily: 'var(--font-mono, monospace)', border: `1px solid ${avatarColor(name)}55` }}>{initials(name)}</div>
}

function Stat({ label, value, color }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: color || 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{value}</span>
      <span style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }}>{label}</span>
    </div>
  )
}

// ── onboarded vendor tile (rich) ────────────────────────────────────────────
function VendorTile({ v, url, properties, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(v)}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', textAlign: 'left', padding: '14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', transition: 'border-color 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-dash, #3a3d52)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #2e3040)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <Avatar name={v.full_name} url={url} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.full_name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 6, padding: '1px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{v.trade}</span>
            {v.pod && <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>{v.pod}</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>{v.vendor_code || '—'}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>{v.reviewed_at ? `onboarded ${fmtDate(v.reviewed_at)}` : ''}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border, #2e3040)' }}>
        <Stat label="Properties" value={properties != null ? properties : 0} />
        <Stat
          label={v.monthly_rate ? 'Rate / month' : 'Rate — not set'}
          value={v.monthly_rate ? money(v.monthly_rate) : '₹0'}
          color={v.monthly_rate ? 'var(--text, #e8e8f0)' : 'var(--accent, #c8963e)'} />
        <Stat label="Joined" value={v.date_of_joining ? fmtDate(v.date_of_joining) : '—'} color="var(--text-dim, #9394a8)" />
      </div>
    </button>
  )
}

// ── new-applications nudge (mild) ───────────────────────────────────────────
function Nudge({ count, onReview }) {
  if (!count) return null
  return (
    <button type="button" onClick={onReview}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '10px 14px', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 10, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
      <span style={{ fontSize: 15 }}>🔔</span>
      <span style={{ flex: 1, fontSize: 12, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{count} new application{count === 1 ? '' : 's'} waiting to be onboarded</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>Review →</span>
    </button>
  )
}

// ── candidates bottom sheet (only opened from the nudge) ────────────────────
function CandidatesSheet({ candidates, photos, onPick, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 640, margin: '0 auto', background: 'var(--bg-panel, #1e2028)', borderRadius: '16px 16px 0 0', maxHeight: '85vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.22s ease-out' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 6px', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 18px 12px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>New applications ({candidates.length})</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 24, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {candidates.map(v => (
            <button key={v.id} type="button" onClick={() => onPick(v)}
              style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%', textAlign: 'left', padding: '12px 14px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
              <Avatar name={v.full_name} url={photoOf(v, photos)} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{v.full_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 6, padding: '1px 8px', fontFamily: 'var(--font-mono, monospace)' }}>{v.trade}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{v.phone}</span>
                </div>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{relTime(v.submitted_at)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── filter chip ─────────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: '6px 12px', fontSize: 12, fontWeight: active ? 700 : 500, borderRadius: 16, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0, border: `1px solid ${active ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, background: active ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)', color: active ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', WebkitTapHighlightColor: 'transparent' }}>{label}</button>
  )
}

export default function OnboardingTab() {
  const [rows, setRows] = useState(null)          // onboarded (approved) vendors
  const [candidates, setCandidates] = useState([])
  const [stats, setStats] = useState({})          // vendor_id -> properties_done
  const [photos, setPhotos] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)  // vendor for detail sheet
  const [showCandidates, setShowCandidates] = useState(false)
  const [tradeFilter, setTradeFilter] = useState('all')
  const [podFilter, setPodFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [onbRes, candRes, statsRes] = await Promise.all([
      supabase.from('vendors').select('*').eq('status', 'approved').order('reviewed_at', { ascending: false, nullsFirst: false }),
      supabase.from('vendors').select('*').eq('status', 'submitted').order('submitted_at', { ascending: false }),
      supabase.rpc('vendor_stats'),
    ])
    const e = onbRes.error || candRes.error
    if (e) { setError(e.message); setRows(null) }
    else {
      setRows(onbRes.data); setCandidates(candRes.data || [])
      const sm = {}; for (const r of statsRes.data || []) sm[r.vendor_id] = r.properties_done
      setStats(sm)
      const map = await signedDocUrls(supabase, [...(onbRes.data || []), ...(candRes.data || [])].map(v => v.live_photo_path), 300)
      setPhotos(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const q = query.trim().toLowerCase()
  const tradeOptions = ['all', ...Array.from(new Set((rows || []).map(v => v.trade).filter(Boolean))).sort()]
  const podsPresent = new Set((rows || []).map(v => v.pod || 'Unassigned'))
  const podOptions = ['all', ...['OG', 'Alpha', 'Unassigned'].filter(p => podsPresent.has(p))]
  const list = (rows || []).filter(v => {
    if (q && ![v.full_name, v.vendor_code, v.trade, v.phone, v.pod, v.city].some(f => (f || '').toLowerCase().includes(q))) return false
    if (tradeFilter !== 'all' && v.trade !== tradeFilter) return false
    if (podFilter !== 'all' && (v.pod || 'Unassigned') !== podFilter) return false
    return true
  })
  const filtered = list.length !== (rows || []).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Nudge count={candidates.length} onReview={() => setShowCandidates(true)} />

      {error && (
        <div style={{ padding: '12px 14px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontFamily: 'var(--font-mono, monospace)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', marginBottom: 4 }}>⚠ Could not load vendors</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', wordBreak: 'break-word' }}>{error}</div>
          <button type="button" onClick={load} style={{ marginTop: 8, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Retry</button>
        </div>
      )}

      {loading && !error && <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>}

      {!loading && !error && rows && (
        rows.length === 0 ? (
          <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No vendors onboarded yet</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>{candidates.length ? 'Review the new applications above to onboard your first vendor.' : 'Onboarded vendors will appear here.'}</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, code, trade, phone…"
                style={{ flex: 1, padding: '10px 14px', fontSize: 16, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>{filtered ? `${list.length} of ${rows.length}` : `${rows.length} vendor${rows.length === 1 ? '' : 's'}`}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
              {tradeOptions.map(t => <FilterChip key={t} label={t === 'all' ? 'All trades' : t} active={tradeFilter === t} onClick={() => setTradeFilter(t)} />)}
            </div>
            {podOptions.length > 2 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
                {podOptions.map(p => <FilterChip key={p} label={p === 'all' ? 'All PODs' : p} active={podFilter === p} onClick={() => setPodFilter(p)} />)}
              </div>
            )}

            {list.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No vendors match your filters.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {list.map(v => <VendorTile key={v.id} v={v} url={photoOf(v, photos)} properties={stats[v.id]} onOpen={setSelected} />)}
              </div>
            )}
          </>
        )
      )}

      {showCandidates && (
        <CandidatesSheet
          candidates={candidates}
          photos={photos}
          onClose={() => setShowCandidates(false)}
          onPick={(v) => { setShowCandidates(false); setSelected(v) }}
        />
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
