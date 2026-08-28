import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { signedDocUrls, fmtDateShort, relTime, initials, avatarColor, isAdmin } from '../../utils/vendorHub'
import SearchField from '../../components/vendor/SearchField'
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
      style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', textAlign: 'left', padding: '14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
      {/* A third of a row, not a whole one: the vendor code moves under the
          name rather than fighting it for the same line, and the date drops to
          a footer where it cannot squeeze the two numbers that matter. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <Avatar name={v.full_name} url={url} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.full_name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.28)', borderRadius: 6, padding: '1px 7px', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{v.trade}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.vendor_code || '—'}</span>
            {v.pod && <span style={{ fontSize: 10.5, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.pod}</span>}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border, #2e3040)' }}>
        <Stat label="Properties" value={properties != null ? properties : 0} />
        <Stat
          label={v.monthly_rate ? 'Rate / month' : 'Rate — not set'}
          value={v.monthly_rate ? money(v.monthly_rate) : '₹0'}
          color={v.monthly_rate ? 'var(--text, #e8e8f0)' : 'var(--accent, #c8963e)'} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: -4 }}>
        Joined {v.date_of_joining ? fmtDateShort(v.date_of_joining) : '—'}
        {v.reviewed_at && ` · onboarded ${fmtDateShort(v.reviewed_at)}`}
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
// The shared hub field, sized down to sit in the trade-filter row. Kept as a
// wrapper rather than a second implementation so both searches in the hub
// look and behave identically.
function SearchBox({ value, onChange, count, total, filtered }) {
  return (
    <SearchField
      value={value} onChange={onChange}
      placeholder="Search vendors…"
      ariaLabel="Search vendors by name, code, trade or phone"
      count={filtered ? count : total} total={total}
      style={{ flex: '0 1 250px', minWidth: 176, maxWidth: 250, height: 34, borderRadius: 9, padding: '0 10px' }}
    />
  )
}

// ── filter chip ─────────────────────────────────────────────────────────────
// Same treatment as the Home header nav: bare at rest, hover raises a plateau
// and goes gold, the chosen one stays recessed under a lit gold floor. Padding
// is a touch tighter than the nav's so the row stays compact next to search.
function FilterChip({ label, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`tct tct-bare${active ? ' is-on' : ''}`}
      style={{ padding: '10px 16px', fontSize: 12.5, lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>{label}</button>
  )
}


// Portal passwords are per-vendor and set on each profile, but the first pass
// is seventeen people at once — and until every one of them has a password,
// making the portal password-only locks whoever is missing out of punching in.
// So the roster shows how many are still without, and can issue them in one go.
function PasswordRollout({ rows, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const missing = (rows || []).filter(v => !v.portal_password_set_at)
  if (!missing.length) return null

  async function generateAll() {
    if (!window.confirm(`Issue a portal password to the ${missing.length} vendor${missing.length === 1 ? '' : 's'} without one?\n\nReveal and share each from their profile afterwards.`)) return
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('vendor_generate_all_portal_passwords')
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone && onDone()
    window.alert(`${data} issued. Open each vendor to reveal and share theirs.`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '11px 13px', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 11 }}>
      <span style={{ fontSize: 15 }}>🔑</span>
      <div style={{ flex: 1, minWidth: 180, fontSize: 12.5, color: 'var(--accent, #c8963e)', lineHeight: 1.5 }}>
        {missing.length} vendor{missing.length === 1 ? ' has' : 's have'} no portal password — they can&rsquo;t sign in to punch or see their payslips.
        {err && <div style={{ color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, marginTop: 4 }}>⚠ {err}</div>}
      </div>
      <button type="button" onClick={generateAll} disabled={busy}
        style={{ minHeight: 40, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', cursor: 'pointer' }}>
        {busy ? 'Issuing…' : 'Issue for all'}
      </button>
    </div>
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
  const [archived, setArchived] = useState([])
  const [rejected, setRejected] = useState([])
  const [view, setView] = useState('onroll')   // 'onroll' | 'archived' | 'removed' | 'rejected'

  const { session } = useAuth()
  const admin = isAdmin(session?.user?.email)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [onbRes, candRes, exitRes, archRes, rejRes, statsRes] = await Promise.all([
      supabase.from('vendors').select('*').eq('status', 'approved').order('reviewed_at', { ascending: false, nullsFirst: false }),
      supabase.from('vendors').select('*').eq('status', 'submitted').order('submitted_at', { ascending: false }),
      supabase.from('vendors').select('*').eq('status', 'exited').order('exited_at', { ascending: false, nullsFirst: false }),
      supabase.from('vendors').select('*').eq('status', 'archived').order('archived_at', { ascending: false, nullsFirst: false }),
      supabase.from('vendors').select('*').eq('status', 'rejected').order('reviewed_at', { ascending: false, nullsFirst: false }),
      supabase.rpc('vendor_stats'),
    ])
    const e = onbRes.error || candRes.error
    if (e) { setError(e.message); setRows(null) }
    else {
      setRows(onbRes.data); setCandidates(candRes.data || []); setRemoved(exitRes.data || []); setArchived(archRes.data || []); setRejected(rejRes.data || [])
      const sm = {}; for (const r of statsRes.data || []) sm[r.vendor_id] = r.properties_done
      setStats(sm)
      const map = await signedDocUrls(supabase, [...(onbRes.data || []), ...(candRes.data || []), ...(exitRes.data || []), ...(archRes.data || []), ...(rejRes.data || [])].map(v => v.live_photo_path), 300)
      setPhotos(map)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const q = query.trim().toLowerCase()
  // one list, two sources — removed vendors are only reachable by the admin
  const source = view === 'removed' ? removed : view === 'archived' ? archived : view === 'rejected' ? rejected : (rows || [])
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

  // every POD in use anywhere, so a custom name is reusable once created
  const knownPods = Array.from(new Set(
    [...(rows || []), ...removed, ...archived, ...rejected, ...candidates].map(v => v.pod).filter(Boolean)
  )).sort()

  // switching roster resets the filters, which describe the list you just left
  const switchView = (next) => { setView(next); setTradeFilter('all'); setPodFilter('all') }

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
        source.length === 0 ? (
          <div style={{ padding: '44px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>{view === 'removed' ? 'Nobody has been removed' : view === 'archived' ? 'Nobody is archived' : view === 'rejected' ? 'Nothing has been rejected' : 'No vendors onboarded yet'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>
              {view === 'rejected' ? 'Applications you turn down will be listed here, and can be put back on the pending list.'
                : view === 'removed' ? 'Vendors you take off the roster will be listed here, and can be put back.'
                : view === 'archived' ? 'Vendors parked while they are away will be listed here, and can be returned to the roster.'
                : candidates.length ? 'Review the new applications above to onboard your first vendor.' : 'Onboarded vendors will appear here.'}
            </div>
            {/* the toggle lives in the filter row, which this branch replaces —
                without this you would be stranded in an empty removed roster */}
            {view !== 'onroll' && (
              <button type="button" onClick={() => switchView('onroll')}
                style={{ marginTop: 14, padding: '7px 13px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
                ‹ Back to on roll
              </button>
            )}
          </div>
        ) : (
          <>
            {/* One row for everything: the on-roll/removed toggle, the trades,
                and search. Wraps rather than crushing on narrow screens. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch', flex: '1 1 240px', minWidth: 0, alignItems: 'center' }}>
                {/* Admin only — nothing disappears without a way back to it */}
                {(archived.length > 0 || (admin && removed.length > 0) || view !== 'onroll') && (
                  <>
                    <FilterChip label={`On roll · ${(rows || []).length}`} active={view === 'onroll'} onClick={() => switchView('onroll')} />
                    <FilterChip label={`Archived · ${archived.length}`} active={view === 'archived'} onClick={() => switchView('archived')} />
                    {rejected.length > 0 && <FilterChip label={`Rejected · ${rejected.length}`} active={view === 'rejected'} onClick={() => switchView('rejected')} />}
                    {admin && <FilterChip label={`Removed · ${removed.length}`} active={view === 'removed'} onClick={() => switchView('removed')} />}
                    <span aria-hidden="true" style={{ flexShrink: 0, width: 1, height: 20, background: 'var(--border, #2e3040)', margin: '0 2px' }} />
                  </>
                )}
                {tradeOptions.map(t => <FilterChip key={t} label={t === 'all' ? 'All trades' : t} active={tradeFilter === t} onClick={() => setTradeFilter(t)} />)}
              </div>
              <SearchBox value={query} onChange={setQuery} count={list.length} total={source.length} filtered={filtered} />
            </div>
            {view === 'onroll' && <PasswordRollout rows={rows} onDone={load} />}

            {podOptions.length > 2 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
                {podOptions.map(p => <FilterChip key={p} label={p === 'all' ? 'All PODs' : p} active={podFilter === p} onClick={() => setPodFilter(p)} />)}
              </div>
            )}

            {list.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>No vendors match your filters.</div>
            ) : (
              <div className="vendor-grid" style={{ display: 'grid', gap: 12 }}>
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
          knownPods={knownPods}
          onClose={() => setSelected(null)}
          onOnboarded={() => { setSelected(null); load() }}
          onUpdated={load}
        />
      )}
    </div>
  )
}
