import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { STATUS_FILTERS, statusMeta, fmtDate } from '../../utils/vendorHub'
import VendorDetailSheet from './VendorDetailSheet'

// ── filter chip ─────────────────────────────────────────────────────────────
function FilterChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 13px', fontSize: 12, fontWeight: active ? 700 : 500,
        borderRadius: 16, whiteSpace: 'nowrap', cursor: 'pointer',
        border: `1px solid ${active ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`,
        background: active ? 'rgba(200,150,62,0.12)' : 'var(--bg-input, #252731)',
        color: active ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)',
        fontFamily: 'var(--font-mono, monospace)',
        WebkitTapHighlightColor: 'transparent',
      }}
    >{label}</button>
  )
}

// ── one vendor row ──────────────────────────────────────────────────────────
function VendorRow({ v, onOpen }) {
  const meta = statusMeta(v.status)
  return (
    <button
      type="button"
      onClick={() => onOpen(v)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
        padding: '12px 14px', background: 'var(--bg-panel, #1e2028)',
        border: '1px solid var(--border, #2e3040)', borderRadius: 10, cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.full_name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{v.trade}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {v.phone} · {v.pod || 'unassigned'} · {fmtDate(v.submitted_at)}
        </div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, border: `1px solid ${meta.color}`, borderRadius: 12, padding: '3px 9px', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0, whiteSpace: 'nowrap' }}>{meta.label}</span>
    </button>
  )
}

export default function OnboardingTab() {
  const [filter, setFilter] = useState('submitted')
  const [rows, setRows] = useState(null)     // null = not yet loaded / after error (never renders empty state)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async (f) => {
    setLoading(true)
    setError('')
    let q = supabase
      .from('vendors')
      .select('*')
      .order('submitted_at', { ascending: false })
    if (f !== 'all') q = q.eq('status', f)
    const { data, error } = await q
    if (error) {
      setError(error.message)   // loud error — do NOT fall through to an empty list
      setRows(null)
    } else {
      setRows(data)             // empty state only renders for a successful zero-row response
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* filter chips */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
        {STATUS_FILTERS.map(f => (
          <FilterChip key={f.key} label={f.label} active={filter === f.key} onClick={() => setFilter(f.key)} />
        ))}
      </div>

      {error && (
        <div style={{ padding: '12px 14px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontFamily: 'var(--font-mono, monospace)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', marginBottom: 4 }}>⚠ Could not load applications</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', wordBreak: 'break-word' }}>{error}</div>
          <button type="button" onClick={() => load(filter)} style={{ marginTop: 8, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Retry</button>
        </div>
      )}

      {loading && !error && (
        <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Loading…</div>
      )}

      {/* empty state — ONLY on a successful zero-row response */}
      {!loading && !error && rows && rows.length === 0 && (
        <div style={{ padding: '36px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--text-dim, #9394a8)', fontWeight: 600 }}>No applications here</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4 }}>
            {filter === 'submitted' ? 'No new submissions waiting for review.' : 'Nothing matches this filter.'}
          </div>
        </div>
      )}

      {!error && rows && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(v => <VendorRow key={v.id} v={v} onOpen={setSelected} />)}
        </div>
      )}

      {selected && (
        <VendorDetailSheet
          key={selected.id}
          vendor={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => load(filter)}
        />
      )}
    </div>
  )
}
