import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { signedDocUrls, fmtDate, relTime, initials, avatarColor, isAdmin } from '../../utils/vendorHub'
import { useAuth } from '../../contexts/AuthContext'
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

// ── search box ──────────────────────────────────────────────────────────────
// Sits at the end of the trade-filter row, so the count rides inside the field
// rather than adding a third thing competing for that row.
function SearchBox({ value, onChange, count, total, filtered }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, flex: '0 1 250px', minWidth: 176, height: 34,
      padding: '0 8px 0 10px', background: 'var(--bg-input, #252731)', borderRadius: 9,
      border: `1px solid ${focused ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
      transition: 'border-color 0.15s',
    }}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }} aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" stroke="var(--text-muted, #6b6d82)" strokeWidth="1.6" />
        <path d="M10.5 10.5L14 14" stroke="var(--text-muted, #6b6d82)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={e => { if (e.key === 'Escape' && value) onChange('') }}
        placeholder="Search vendors…"
        aria-label="Search vendors by name, code, trade or phone"
        style={{ flex: 1, minWidth: 0, padding: '7px 0', border: 'none', background: 'none', outline: 'none', color: 'var(--text, #e8e8f0)', fontSize: 13, fontFamily: 'inherit' }} />
      {value && (
        <button type="button" onClick={() => onChange('')} title="Clear search" aria-label="Clear search"
          style={{ flexShrink: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 15, lineHeight: 1, cursor: 'pointer' }}>×</button>
      )}
      <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', paddingLeft: 2, borderLeft: '1px solid var(--border, #2e3040)', paddingInlineStart: 7 }}>
        {filtered ? `${count}/${total}` : total}
      </span>
    </div>
  )
}

// ── filter chip ─────────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`tct tct-raised${active ? ' is-on' : ''}`}
      style={{ padding: '7px 13px', fontSize: 12, borderRadius: 16, whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</button>
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
  const [removed, setRemoved] = useState([])
  const [showRemoved, setShowRemoved] = useState(false)

  const { session } = useAuth()
  const admin = isAdmin(session?.user?.email)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [onbRes, candRes, exitRes, statsRes] = await Promise.all([
      supabase.from('vendors').select('*').eq('status', 'approved').order('reviewed_at', { ascending: false, nullsFirst: false }),
      supabase.from('vendors').select('*').eq('status', 'submitted').order('submitted_at', { ascending: false }),
      supabase.from('vendors').select('*').eq('status', 'exited').order('exited_at', { ascending: false, nullsFirst: false }),
      supabase.rpc('vendor_stats'),
    ])
    const e = onbRes.error || candRes.error
    if (e) { setError(e.message); setRows(null) }
    else {
      setRows(onbRes.data); setCandidates(candRes.data || []); setRemoved(exitRes.data || [])
      const sm = {}; for (const r of statsRes.data || []) sm[r.vendor_id] = r.properties_done
      setStats(sm)
      const map = await signedDocUrls(supabase, [...(onbRes.data || []), ...(candRes.data || []), ...(exitRes.data || [])].map(v => v.live_photo_path), 300)
      setPhotos(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const q = query.trim().toLowerCase()
  // one list, two sources — removed vendors are only reachable by the admin
  const source = showRemoved ? removed : (rows || [])
  const tradeOptions = ['all', ...Array.from(new Set(source.map(v => v.trade).filter(Boolean))).sort()]
  const podsPresent = new Set(source.map(v => v.pod || 'Unassigned'))
  const podOptions = ['all', ...['OG', 'Alpha', 'Unassigned'].filter(p => podsPresent.has(p))]
  const list = source.filter(v => {
    if (q && ![v.full_name, v.vendor_code, v.trade, v.phone, v.pod, v.city].some(f => (f || '').toLowerCase().includes(q))) return false
    if (tradeFilter !== 'all' && v.trade !== tradeFilter) return false
    if (podFilter !== 'all' && (v.pod || 'Unassigned') !== podFilter) return false
    return true
  })
  const filtered = list.length !== source.length

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

      {/* Admin only: the removed roster lives behind this, so nothing disappears
          without a way back to it. */}
      {!loading && !error && admin && (removed.length > 0 || showRemoved) && (
        <div style={{ display: 'flex', gap: 8 }}>
          <FilterChip label={`On roll · ${(rows || []).length}`} active={!showRemoved} onClick={() => { setShowRemoved(false); setTradeFilter('all'); setPodFilter('all') }} />
          <FilterChip label={`Removed · ${removed.length}`} active={showRemoved} onClick={() => { setShowRemoved(true); setTradeFilter('all'); setPodFilter('all') }} />
        </div>
      )}

      {!loading && !error && rows && (
        source.length === 0 ? (
          <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>{showRemoved ? 'Nobody has been removed' : 'No vendors onboarded yet'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>
              {showRemoved ? 'Vendors you take off the roster will be listed here, and can be put back.'
                : candidates.length ? 'Review the new applications above to onboard your first vendor.' : 'Onboarded vendors will appear here.'}
            </div>
          </div>
        ) : (
          <>
            {/* One row: trades take the space they need, search sits at the end.
                Wraps below the chips on narrow screens rather than crushing them. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch', flex: '1 1 240px', minWidth: 0 }}>
                {tradeOptions.map(t => <FilterChip key={t} label={t === 'all' ? 'All trades' : t} active={tradeFilter === t} onClick={() => setTradeFilter(t)} />)}
              </div>
              <SearchBox value={query} onChange={setQuery} count={list.length} total={source.length} filtered={filtered} />
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
