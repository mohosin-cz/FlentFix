import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { SectionLabel } from '../ui'
import { inr } from '../../utils/payments'

// Where did the money go — payments grouped by the work order they paid for
// and, through its items, the inspection areas that work traced back to.
//
// Payments with no work_order_id sit under "Unlinked", count in the open.
// That number is a data-quality signal, not an embarrassment to hide: on the
// day this shipped it was every payment on file.

const MONO = 'var(--font-mono, monospace)'

export default function MoneyTrail({ pid }) {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: null, rows: null })
  const [showAllUnlinked, setShowAllUnlinked] = useState(false)

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await supabase.rpc('property_money_trail', { p_pid: pid })
    if (error) { setState({ loading: false, error: error.message, rows: null }); return }
    setState({ loading: false, error: null, rows: data || [] })
  }, [pid])
  useEffect(() => { load() }, [load])

  const { loading, error, rows } = state
  const linked = (rows || []).filter(r => r.group_kind === 'work_order')
  const unlinked = (rows || []).filter(r => r.group_kind === 'unlinked')
  const sum = (xs, k) => xs.reduce((n, r) => n + Number(r[k] || 0), 0)
  const linkedTotal = sum(linked, 'total')
  const unlinkedTotal = sum(unlinked, 'total')
  const unlinkedN = sum(unlinked, 'n_payments')
  const grand = linkedTotal + unlinkedTotal
  const hasAnything = linked.some(r => r.n_payments > 0) || unlinkedN > 0

  const panel = { background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, overflow: 'hidden' }
  const rowStyle = (last) => ({ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 16px', borderBottom: last ? 'none' : '1px solid var(--border, #2e3040)', flexWrap: 'wrap' })

  return (
    <>
      <div style={{ marginTop: 28, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <SectionLabel>Where did the money go</SectionLabel>
        {!loading && !error && hasAnything && (
          <button type="button" onClick={() => navigate(`/properties/${encodeURIComponent(pid)}/payments`)}
            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--accent, #c8963e)', fontFamily: MONO, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            all payments →
          </button>
        )}
      </div>

      {loading && (
        <div style={panel} aria-busy="true">
          {[0, 1, 2].map(i => (
            <div key={i} style={rowStyle(i === 2)}>
              <div style={{ height: 11, width: 140, borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.7 }} />
              <div style={{ height: 11, width: 70, borderRadius: 3, background: 'var(--border, #2e3040)', opacity: 0.7, marginLeft: 'auto' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: '11px 13px', background: 'rgba(176,100,91,0.10)', border: '1px solid rgba(176,100,91,0.32)', borderRadius: 9, fontFamily: MONO, fontSize: 11.5, color: 'var(--red, #b0645b)' }}>
          ⚠ {error}
          <button type="button" onClick={load} style={{ marginLeft: 10, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, padding: '3px 9px', cursor: 'pointer', fontFamily: MONO }}>Retry</button>
        </div>
      )}

      {!loading && !error && !hasAnything && (
        <div style={{ ...panel, padding: '18px 16px', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
          No payments logged for this property{linked.length > 0 ? ` — ${linked.length} work order${linked.length > 1 ? 's' : ''}, nothing paid against ${linked.length > 1 ? 'them' : 'it'} yet` : ''}.
        </div>
      )}

      {!loading && !error && hasAnything && (
        <div style={panel}>
          {/* Headline: how much of the spend can be traced at all. */}
          <div style={{ ...rowStyle(false), background: 'var(--bg-input, #252731)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', fontFamily: MONO, flex: 1 }}>
              {inr(grand)} spent · <span style={{ color: linkedTotal > 0 ? 'var(--green, #6f9a7e)' : 'var(--red, #b0645b)' }}>
                {grand > 0 ? Math.round((linkedTotal / grand) * 100) : 0}% traceable to a work order
              </span>
            </span>
          </div>

          {linked.filter(r => r.n_payments > 0).map((r, i, arr) => (
            <div key={r.work_order_id} style={rowStyle(false)}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)' }}>
                  {r.trade}{r.vendor_name ? ` · ${r.vendor_name}` : ''}
                  <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginLeft: 8 }}>{(r.wo_status || '').replace(/_/g, ' ')}</span>
                </div>
                {r.areas?.length > 0 && (
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3 }}>
                    {r.areas.filter(Boolean).slice(0, 6).join(' · ')}{r.areas.length > 6 ? ` · +${r.areas.length - 6}` : ''}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', fontFamily: MONO }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{inr(r.total)}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)' }}>
                  {r.n_payments} payment{r.n_payments > 1 ? 's' : ''}
                  {Number(r.material) > 0 || Number(r.labour) > 0 ? ` · ${inr(r.material)} mat + ${inr(r.labour)} lab` : ''}
                  {r.undated > 0 ? ` · ${r.undated} undated` : ''}
                </div>
              </div>
              <button type="button" onClick={() => navigate(`/properties/${encodeURIComponent(pid)}/work-orders#wo-${r.work_order_id}`)}
                style={{ minHeight: 30, padding: '0 10px', borderRadius: 7, border: '1px solid var(--border, #2e3040)', background: 'none', color: 'var(--text-dim, #9394a8)', fontSize: 10.5, fontFamily: MONO, cursor: 'pointer' }}>
                work order ›
              </button>
            </div>
          ))}

          {unlinkedN > 0 && (
            <div style={{ ...rowStyle(true), flexDirection: 'column', gap: 8, background: 'rgba(176,100,91,0.05)' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', width: '100%', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--red, #b0645b)', fontWeight: 600, flex: 1, minWidth: 160 }}>
                  Unlinked · {unlinkedN} payment{unlinkedN > 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: MONO }}>{inr(unlinkedTotal)}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 }}>
                These carry no work order, so nothing says which job they paid for. By trade:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
                {(showAllUnlinked ? unlinked : unlinked.slice(0, 5)).map((r, i) => (
                  <div key={r.trade || `untagged-${i}`} style={{ display: 'flex', gap: 10, fontSize: 11.5, fontFamily: MONO, color: 'var(--text-dim, #9394a8)' }}>
                    <span style={{ flex: 1 }}>{r.trade || 'untagged'}</span>
                    <span style={{ color: 'var(--text-muted, #6b6d82)' }}>{r.n_payments}×{r.undated > 0 ? ` · ${r.undated} undated` : ''}</span>
                    <span style={{ minWidth: 80, textAlign: 'right', color: 'var(--text, #e8e8f0)' }}>{inr(r.total)}</span>
                  </div>
                ))}
                {unlinked.length > 5 && (
                  <button type="button" onClick={() => setShowAllUnlinked(v => !v)}
                    style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    {showAllUnlinked ? 'Show less ↑' : `All ${unlinked.length} trades →`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
