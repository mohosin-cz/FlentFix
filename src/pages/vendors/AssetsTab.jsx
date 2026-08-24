import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { initials, avatarColor } from '../../utils/vendorHub'
import { CATEGORIES, STATUS_META, assetMoney } from '../../utils/assetMeta'
import AssetStatusChip from './AssetStatusChip'
import AssetFormSheet from './AssetFormSheet'
import SearchField from '../../components/vendor/SearchField'

// The asset register: what we have issued, who is holding it, and what state
// it is in. An item is one row for its whole life — assignment moves it
// between vendors rather than creating a new record each time, so "where is
// drill 3" has one answer.

const MONO = 'var(--font-mono, monospace)'
const money = n => assetMoney(n) || '—'

function Tile({ label, value, sub, color }) {
  return (
    <div style={{ flex: '1 1 130px', minWidth: 0, padding: '11px 13px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 3, fontFamily: MONO, color: color || 'var(--text, #e8e8f0)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function Sel({ label, value, onChange, options }) {
  const on = value !== 'all'
  return (
    <label className={`tct tct-raised${on ? ' is-on' : ''}`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 24px 0 12px', cursor: 'pointer', minWidth: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.085em', textTransform: 'uppercase', fontFamily: MONO, flexShrink: 0, color: on ? 'rgba(200,150,62,0.7)' : 'var(--text-muted, #6b6d82)' }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
        style={{ appearance: 'none', WebkitAppearance: 'none', background: 'none', border: 'none', outline: 'none', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer', maxWidth: 150, minWidth: 0, flex: '1 1 auto' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span aria-hidden="true" style={{ position: 'absolute', right: 10, fontSize: 8, opacity: 0.5, pointerEvents: 'none' }}>▾</span>
    </label>
  )
}

function AssetRow({ a, vendor, onOpen }) {
  return (
    <button type="button" onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', minHeight: 60,
        padding: '11px 13px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)',
        borderRadius: 10, cursor: 'pointer' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{a.name}</span>
          <AssetStatusChip status={a.status} />
          {a.asset_tag && (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '2px 7px', borderRadius: 5, background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.30)' }}>
              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--accent, #c8963e)', fontFamily: MONO }}>TAG</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: MONO }}>{a.asset_tag}</span>
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[a.category, [a.make, a.model].filter(Boolean).join(' '), a.serial_no ? `SL ${a.serial_no}` : null]
            .filter(Boolean).join(' · ') || '—'}
        </div>
      </div>

      {vendor ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, maxWidth: 190 }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: MONO, background: avatarColor(vendor.full_name) + '22', color: avatarColor(vendor.full_name), border: `1px solid ${avatarColor(vendor.full_name)}66` }}>{initials(vendor.full_name)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vendor.full_name}</div>
            {vendor.vendor_code && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{vendor.vendor_code}</div>}
          </div>
        </div>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, flexShrink: 0 }}>unassigned</span>
      )}
      <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', flexShrink: 0 }}>›</span>
    </button>
  )
}

export default function AssetsTab() {
  const { session } = useAuth()
  const [assets, setAssets] = useState(null)
  const [vendors, setVendors] = useState([])
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [catF, setCatF] = useState('all')
  const [vendorF, setVendorF] = useState('all')
  const [sheet, setSheet] = useState(null)   // { mode:'new' } | { mode:'edit', asset }

  const load = useCallback(async () => {
    const [aRes, vRes] = await Promise.all([
      supabase.from('vendor_assets').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('vendors').select('id, full_name, vendor_code, email, trade, status').limit(2000),
    ])
    setErr(aRes.error ? aRes.error.message : '')
    setAssets(aRes.error ? [] : (aRes.data || []))
    setVendors(vRes.data || [])
  }, [])

  // Deferred a tick: load() sets state, and doing that synchronously out of
  // an effect cascades an extra render.
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])

  const vendorById = useMemo(() => {
    const m = new Map()
    for (const v of vendors) m.set(v.id, v)
    return m
  }, [vendors])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (assets || []).filter(a => {
      if (statusF !== 'all' && a.status !== statusF) return false
      if (catF !== 'all' && a.category !== catF) return false
      if (vendorF !== 'all') {
        if (vendorF === '__none' ? a.vendor_id : a.vendor_id !== vendorF) return false
      }
      if (!needle) return true
      const v = a.vendor_id ? vendorById.get(a.vendor_id) : null
      return [a.name, a.asset_tag, a.serial_no, a.make, a.model, a.category, a.notes, v?.full_name, v?.vendor_code]
        .some(f => (f || '').toLowerCase().includes(needle))
    })
  }, [assets, q, statusF, catF, vendorF, vendorById])

  const stats = useMemo(() => {
    const all = assets || []
    return {
      total: all.length,
      assigned: all.filter(a => a.status === 'assigned').length,
      stores: all.filter(a => a.status === 'in_stores').length,
      trouble: all.filter(a => a.status === 'lost' || a.status === 'damaged').length,
      value: all.filter(a => a.status !== 'returned').reduce((s, a) => s + Number(a.value || 0), 0),
    }
  }, [assets])

  const activeFilters = [statusF, catF, vendorF].filter(v => v !== 'all').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {err && (
        <div style={{ padding: '12px 14px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontFamily: MONO }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)' }}>⚠ Could not load assets</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', wordBreak: 'break-word', marginTop: 3 }}>{err}</div>
          {/relation|does not exist|schema cache|Could not find the table/i.test(err) && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', marginTop: 6 }}>
              Run <code style={{ color: 'var(--text-dim, #9394a8)' }}>supabase/migrations/vendor_assets.sql</code>.
            </div>
          )}
        </div>
      )}

      {/* summary */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Tile label="Assets" value={assets == null ? '…' : stats.total} sub={`${stats.stores} in stores`} />
        <Tile label="With vendors" value={assets == null ? '…' : stats.assigned} color="var(--green, #3dba7a)" />
        <Tile label="Lost / damaged" value={assets == null ? '…' : stats.trouble} color={stats.trouble ? 'var(--red, #e05c6a)' : undefined} />
        <Tile label="Value held" value={assets == null ? '…' : money(stats.value)} sub="excludes returned" color="var(--accent, #c8963e)" />
      </div>

      {/* search + log */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchField
          value={q} onChange={setQ}
          placeholder="Search name, tag, serial, vendor…"
          ariaLabel="Search assets by name, tag, serial number or vendor"
          count={assets == null ? null : list.length}
          total={assets == null ? null : assets.length}
        />
        <button type="button" onClick={() => setSheet({ mode: 'new' })}
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 42, padding: '0 16px', borderRadius: 11, cursor: 'pointer', flexShrink: 0,
            background: 'var(--accent, #c8963e)', border: 'none', color: '#1a1408', fontSize: 13, fontWeight: 700, fontFamily: MONO }}>
          + Log asset
        </button>
      </div>

      {/* filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Sel label="Status" value={statusF} onChange={setStatusF}
          options={[{ value: 'all', label: 'Any status' }, ...Object.entries(STATUS_META).map(([k, m]) => ({ value: k, label: m.label }))]} />
        <Sel label="Category" value={catF} onChange={setCatF}
          options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES.map(c => ({ value: c, label: c }))]} />
        <Sel label="Holder" value={vendorF} onChange={setVendorF}
          options={[{ value: 'all', label: 'Anyone' }, { value: '__none', label: 'Unassigned' },
            ...vendors.filter(v => v.status === 'approved').sort((a, b) => a.full_name.localeCompare(b.full_name))
              .map(v => ({ value: v.id, label: v.full_name }))]} />
        {(activeFilters > 0 || q) && (
          <button type="button" className="tct tct-bare" onClick={() => { setStatusF('all'); setCatF('all'); setVendorF('all'); setQ('') }}
            style={{ height: 36, padding: '0 12px', fontSize: 12, cursor: 'pointer' }}>
            Clear{activeFilters ? ` ${activeFilters} filter${activeFilters > 1 ? 's' : ''}` : ''}
          </button>
        )}
      </div>

      {/* list */}
      {assets == null ? (
        <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>
      ) : assets.length === 0 ? (
        <div style={{ padding: '52px 24px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>No assets logged yet</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', marginTop: 7, lineHeight: 1.6, maxWidth: 340, marginInline: 'auto' }}>
            Log a tool, device or uniform here, then assign it to a vendor by their email. It will show on their profile.
          </div>
          <button type="button" onClick={() => setSheet({ mode: 'new' })}
            style={{ marginTop: 16, minHeight: 42, padding: '0 18px', borderRadius: 10, cursor: 'pointer', background: 'var(--accent, #c8963e)', border: 'none', color: '#1a1408', fontSize: 13, fontWeight: 700, fontFamily: MONO }}>
            + Log the first asset
          </button>
        </div>
      ) : list.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
          Nothing matches {q ? `“${q.trim()}”` : 'these filters'}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map(a => (
            <AssetRow key={a.id} a={a} vendor={a.vendor_id ? vendorById.get(a.vendor_id) : null}
              onOpen={() => setSheet({ mode: 'edit', asset: a })} />
          ))}
        </div>
      )}

      {sheet && (
        <AssetFormSheet
          mode={sheet.mode}
          asset={sheet.asset}
          vendors={vendors}
          actor={session?.user?.email || 'staff'}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); load() }}
        />
      )}
    </div>
  )
}
