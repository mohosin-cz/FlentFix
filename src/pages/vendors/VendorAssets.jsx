import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../utils/vendorHub'
import AssetStatusChip from './AssetStatusChip'

// What this vendor is currently holding, and what they have handed back.
//
// Current holdings come from vendor_assets.vendor_id. Past ones cannot —
// returning an asset clears that column so the item can go to somebody else —
// so history is read from vendor_asset_events instead, which records who had
// it and when.

const MONO = 'var(--font-mono, monospace)'
const money = n => (n == null || n === '' ? null : '₹' + Math.round(Number(n)).toLocaleString('en-IN'))

export default function VendorAssets({ vendorId }) {
  const [state, setState] = useState({ key: null, held: [], past: [], err: '' })
  const loading = state.key !== vendorId

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('vendor_assets').select('*').eq('vendor_id', vendorId).order('assigned_at', { ascending: false }),
      supabase.from('vendor_asset_events')
        .select('*, asset:vendor_assets(name, category, asset_tag, serial_no, status)')
        .eq('vendor_id', vendorId).order('created_at', { ascending: false }).limit(100),
    ]).then(([aRes, eRes]) => {
      if (cancelled) return
      const held = aRes.data || []
      const heldIds = new Set(held.map(a => a.id))
      // One line per asset they no longer hold, newest movement first.
      const seen = new Set()
      const past = (eRes.data || []).filter(ev => {
        if (!ev.asset || heldIds.has(ev.asset_id) || seen.has(ev.asset_id)) return false
        seen.add(ev.asset_id); return true
      })
      setState({ key: vendorId, held, past, err: aRes.error ? aRes.error.message : '' })
    })
    return () => { cancelled = true }
  }, [vendorId])

  if (loading) return <div style={{ padding: '14px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>

  if (state.err) return (
    <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>⚠ Could not load assets</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, marginTop: 3, wordBreak: 'break-word' }}>{state.err}</div>
      {/relation|does not exist|schema cache/i.test(state.err) && (
        <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 5 }}>Run supabase/migrations/vendor_assets.sql.</div>
      )}
    </div>
  )

  const { held, past } = state
  const value = held.reduce((s, a) => s + Number(a.value || 0), 0)

  if (held.length === 0 && past.length === 0) return (
    <div style={{ padding: '22px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
      Nothing issued to them yet.<br />Log an asset under Assets and assign it by their email.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {held.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Currently holding</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
            {held.length} item{held.length === 1 ? '' : 's'}{value > 0 ? ` · ${money(value)}` : ''}
          </span>
        </div>
      )}

      {held.map(a => (
        <div key={a.id} style={{ padding: '11px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{a.name}</span>
            <AssetStatusChip status={a.status} />
            {a.asset_tag && (
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, padding: '2px 7px', borderRadius: 5, background: 'rgba(200,150,62,0.12)', border: '1px solid rgba(200,150,62,0.30)' }}>
                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--accent, #c8963e)', fontFamily: MONO }}>TAG</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: MONO }}>{a.asset_tag}</span>
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.55 }}>
            {[a.category, [a.make, a.model].filter(Boolean).join(' '), a.serial_no ? `SL ${a.serial_no}` : null, a.condition]
              .filter(Boolean).join(' · ')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            issued {a.assigned_at ? fmtDate(a.assigned_at) : '—'}{a.assigned_by ? ` · ${a.assigned_by}` : ''}{money(a.value) ? ` · ${money(a.value)}` : ''}
          </div>
        </div>
      ))}

      {past.length > 0 && (
        <>
          <span style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>Previously held</span>
          {past.map(ev => (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontFamily: MONO, padding: '6px 2px', borderTop: '1px solid var(--border, #2e3040)' }}>
              <span style={{ color: 'var(--text-dim, #9394a8)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.asset.name}</span>
              <span style={{ color: 'var(--accent, #c8963e)' }}>{ev.action}</span>
              <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{fmtDate(ev.created_at)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
