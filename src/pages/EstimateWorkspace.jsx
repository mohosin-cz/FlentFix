import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateEstimate, resolveInspectionWithData } from '../utils/generateEstimate'
import { generateInvoice } from '../utils/generateInvoice'
import DisputeThread from '../components/DisputeThread'
import { useIsMobile } from '../hooks/useIsMobile'
import LogoSpinner from '../components/LogoSpinner'

const STATUS_COLOR = {
  draft:              '#9898a4',
  sent:               '#4a9eff',
  viewed:             '#c8963e',
  partially_approved: '#f0a050',
  approved:           '#4dd9c0',
  rejected:           '#f87171',
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtShort(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function fmtTime(str) {
  if (!str) return ''
  return new Date(str).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || STATUS_COLOR.draft
  return (
    <span style={{
      fontSize: 10, padding: '3px 9px', borderRadius: 100,
      background: `${color}22`, color,
      textTransform: 'uppercase', letterSpacing: '0.06em',
      fontFamily: 'var(--font-mono, monospace)', fontWeight: 700,
    }}>
      {status || 'draft'}
    </span>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

export default function EstimateWorkspace() {
  const navigate  = useNavigate()
  const { pid }   = useParams()

  const [estimates, setEstimates]         = useState([])
  const [property, setProperty]           = useState(null)
  const [loading, setLoading]             = useState(true)
  const [generating, setGenerating]       = useState(false)
  const [creatingInvoice, setCreating]    = useState(false)
  const [invoiceId, setInvoiceId]         = useState(null)
  const [userEmail, setUserEmail]         = useState(null)
  const [copied, setCopied]               = useState(false)
  const [activeTab, setActiveTab]         = useState('overview') // 'overview' | 'disputes'
  const isMobile = useIsMobile()

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: { user } }, { data: ests }, { data: prop }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('estimates')
        .select('*, estimate_items(id, status, cost_type, material_cost, labour_cost, item_name, area, trade, issue_description, sort_order), estimate_events(*), estimate_disputes(count)')
        .eq('pid', pid)
        .order('created_at', { ascending: false }),
      supabase.from('inspections').select('house_type, config').eq('pid', pid).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    setUserEmail(user?.email || null)
    setEstimates(ests || [])
    setProperty(prop)

    // Check for existing invoice on the latest estimate
    if (ests?.length) {
      const { data: inv } = await supabase
        .from('tax_invoices')
        .select('id')
        .eq('estimate_id', ests[0].id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setInvoiceId(inv?.id || null)
    }

    setLoading(false)
  }, [pid])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Realtime: refresh when items or disputes change for current estimate
  useEffect(() => {
    const current = estimates[0]
    if (!current?.id) return
    const channel = supabase.channel(`ws-${current.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimate_items',    filter: `estimate_id=eq.${current.id}` }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimate_disputes', filter: `estimate_id=eq.${current.id}` }, fetchAll)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [estimates[0]?.id])

  async function handleNewVersion() {
    setGenerating(true)
    const inspId = await resolveInspectionWithData(pid)
    if (!inspId) { setGenerating(false); alert('No inspection with data found.'); return }
    const estId = await generateEstimate(inspId, pid, userEmail)
    setGenerating(false)
    if (estId) { await fetchAll(); navigate(`/estimate/${estId}`) }
  }

  async function handleRegenerate(est) {
    setGenerating(true)
    const inspId = await resolveInspectionWithData(pid)
    if (!inspId) { setGenerating(false); return }
    await generateEstimate(inspId, pid, userEmail)
    setGenerating(false)
    await fetchAll()
  }

  async function handleCreateInvoice() {
    if (!current?.id) return
    setCreating(true)
    const invId = await generateInvoice(current.id, userEmail)
    setCreating(false)
    if (invId) { setInvoiceId(invId); navigate(`/tax-invoice/${invId}`) }
    else alert('Failed to create invoice — check approved items.')
  }

  // Current = latest estimate
  const current = estimates[0] || null

  // Attention banner logic
  function getAttentionBanner() {
    if (!current) return null
    const disputes = current.estimate_disputes?.[0]?.count || 0
    if (disputes > 0) return { text: `${disputes} item${disputes > 1 ? 's' : ''} disputed — review required`, color: '#f0a050', cta: null }
    if (current.status === 'rejected') return { text: 'Estimate rejected — generate a new version or edit', color: '#f87171', cta: null }
    if (current.status === 'approved') {
      if (invoiceId) return { text: 'Invoice created', color: '#4dd9c0', cta: { label: 'View Invoice →', action: () => navigate(`/tax-invoice/${invoiceId}`) } }
      return { text: 'Estimate approved — ready to invoice', color: '#4dd9c0', cta: { label: creatingInvoice ? 'Creating…' : 'Create Invoice', action: handleCreateInvoice } }
    }
    if (current.status === 'sent') return { text: 'Estimate sent — awaiting landlord review', color: '#4a9eff', cta: null }
    if (current.status === 'viewed') return { text: 'Landlord has viewed the estimate', color: '#c8963e', cta: null }
    return null
  }

  // Stats from current estimate — headline total always from estimates.total (canonical stored value).
  function getStats(est) {
    const items = est?.estimate_items || []
    const actualsCount = items.filter(i => i.cost_type === 'actuals' && !['removed', 'excluded'].includes(i.status)).length
    const approved  = items.filter(i => i.status === 'approved').length
    const disputed  = items.filter(i => i.status === 'disputed').length
    const pending   = items.filter(i => !i.status || i.status === 'pending').length
    return { count: items.length, total: est?.total ?? 0, actualsCount, approved, disputed, pending }
  }

  // All events across all estimates, newest first
  const allEvents = estimates
    .flatMap(est => (est.estimate_events || []).map(ev => ({ ...ev, _estVersion: estimates.length - estimates.indexOf(est) })))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20)

  const banner    = getAttentionBanner()
  const stats     = current ? getStats(current) : null
  const houseType = property?.house_type || ''
  const address   = property?.config?.address || ''

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}>

      {/* ── Header ── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button
          onClick={() => navigate(`/properties/${pid}`)}
          style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em' }}>Estimate Workspace</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>
            PID {pid}{houseType ? ` · ${houseType}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {current && (
            <button
              onClick={() => handleRegenerate(current)}
              disabled={generating}
              style={{ height: 34, padding: '0 12px', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: generating ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}
            >
              ↻ Regen
            </button>
          )}
          <button
            onClick={handleNewVersion}
            disabled={generating}
            style={{ height: 34, padding: '0 12px', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#000', cursor: generating ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap', opacity: generating ? 0.7 : 1 }}
          >
            {generating ? '…' : '+ New'}
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 80px' }}>

        {loading ? (
          <LogoSpinner />
        ) : estimates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ color: 'var(--text-muted, #6b6d82)', marginBottom: 20, fontSize: 13 }}>No estimates yet</div>
            <button
              onClick={handleNewVersion}
              disabled={generating}
              style={{ padding: '12px 24px', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 14, color: '#000', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {generating ? 'Generating…' : '+ Generate First Estimate'}
            </button>
          </div>
        ) : (
          <>
            {/* ── Attention banner ── */}
            {banner && (
              <div style={{ marginBottom: 16, padding: '10px 16px', background: `${banner.color}11`, border: `1px solid ${banner.color}44`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: banner.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: banner.color, fontFamily: 'var(--font-mono, monospace)' }}>{banner.text}</span>
                </div>
                {banner.cta && (
                  <button
                    onClick={banner.cta.action}
                    disabled={creatingInvoice}
                    style={{ padding: '5px 12px', background: banner.color, border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, color: '#000', cursor: creatingInvoice ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {banner.cta.label}
                  </button>
                )}
              </div>
            )}

            {/* ── Current estimate hero card ── */}
            {current && stats && (
              <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
                {/* Card top */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 6 }}>CURRENT ESTIMATE · v{estimates.length}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <StatusBadge status={current.status} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDate(current.created_at)}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>
                      {(stats.total || 0) > 0 ? `₹${stats.total.toLocaleString('en-IN')}` : '—'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>
                      total estimate{stats.actualsCount > 0 ? ` · +${stats.actualsCount} on actuals` : ''}
                    </div>
                  </div>
                </div>

                {/* 4-stat row — 2×2 on mobile */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', borderBottom: '1px solid var(--border, #2e3040)' }}>
                  {[
                    { label: 'Items',    value: stats.count,    color: undefined },
                    { label: 'Approved', value: stats.approved, color: stats.approved > 0 ? '#4dd9c0' : undefined },
                    { label: 'Disputed', value: stats.disputed, color: stats.disputed > 0 ? '#f0a050' : undefined },
                    { label: 'Pending',  value: stats.pending,  color: stats.pending > 0  ? 'var(--text, #e8e8f0)' : undefined },
                  ].map((s, i) => (
                    <div key={s.label} style={{
                      borderRight: isMobile ? (i % 2 === 0 ? '1px solid var(--border, #2e3040)' : 'none') : (i < 3 ? '1px solid var(--border, #2e3040)' : 'none'),
                      borderBottom: isMobile && i < 2 ? '1px solid var(--border, #2e3040)' : 'none',
                    }}>
                      <StatBox label={s.label} value={s.value} color={s.color} />
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(120px, auto))', gap: 8 }}>
                  <button
                    onClick={() => navigate(`/estimate/${current.id}`)}
                    style={{ padding: '8px 16px', minHeight: 44, background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#000', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
                  >
                    Open Workbench →
                  </button>
                  {current.share_token && (
                    <button
                      onClick={async () => {
                        const shareToken = current.share_token
                        if (!shareToken) return
                        const cleanUrl   = `${window.location.origin}/e/${shareToken}`
                        const previewUrl = `${cleanUrl}?preview=1`
                        // Open tab first (must be synchronous within the click gesture)
                        window.open(previewUrl, '_blank', 'noopener,noreferrer')
                        if (navigator.clipboard && window.isSecureContext) {
                          await navigator.clipboard.writeText(cleanUrl).catch(() => {})
                        } else {
                          const ta = document.createElement('textarea')
                          ta.value = cleanUrl; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta)
                          ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
                        }
                        setCopied(true); setTimeout(() => setCopied(false), 1500)
                        if (current.status === 'draft') {
                          await supabase.from('estimates').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', current.id)
                          await supabase.from('estimate_events').insert({ estimate_id: current.id, event_type: 'sent', actor: 'flent' })
                          setEstimates(prev => prev.map(e => e.id === current.id ? { ...e, status: 'sent' } : e))
                        }
                      }}
                      style={{ padding: '8px 16px', minHeight: 44, background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 6, fontSize: 12, color: copied ? '#4dd9c0' : 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', transition: 'color 0.2s' }}
                    >
                      {copied ? '✓ Opened + copied' : '↗ Share Link'}
                    </button>
                  )}
                  {(current.estimate_disputes?.[0]?.count || 0) > 0 && (
                    <button
                      onClick={() => { setActiveTab('disputes') }}
                      style={{ padding: '8px 16px', minHeight: 44, background: 'none', border: '1px solid #f0a050', borderRadius: 6, fontSize: 12, color: '#f0a050', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
                    >
                      Disputes ({current.estimate_disputes[0].count})
                    </button>
                  )}
                  {invoiceId && (
                    <button
                      onClick={() => navigate(`/tax-invoice/${invoiceId}`)}
                      style={{ padding: '8px 16px', minHeight: 44, background: 'none', border: '1px solid #4dd9c0', borderRadius: 6, fontSize: 12, color: '#4dd9c0', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
                    >
                      View Invoice →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Tabs ── */}
            {(() => {
              const disputedItems = (current?.estimate_items || []).filter(i => i.status === 'disputed')
              const disputeCount  = disputedItems.length
              const tabStyle = (key) => ({
                padding: '10px 16px', minHeight: 44, background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontFamily: 'var(--font-mono, monospace)',
                color: activeTab === key ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)',
                borderBottom: activeTab === key ? '2px solid var(--accent, #c8963e)' : '2px solid transparent',
                transition: 'color 0.15s',
              })
              return (
                <>
                  <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border, #2e3040)', marginBottom: 16 }}>
                    <button style={tabStyle('overview')} onClick={() => setActiveTab('overview')}>Overview</button>
                    <button style={tabStyle('disputes')} onClick={() => setActiveTab('disputes')}>
                      Disputes{disputeCount > 0 ? ` (${disputeCount})` : ''}
                    </button>
                  </div>

                  {activeTab === 'disputes' && (
                    <div style={{ marginBottom: 20 }}>
                      {disputeCount === 0 ? (
                        <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted, #6b6d82)' }}>
                          No disputed items
                        </div>
                      ) : disputedItems.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(item => (
                        <div key={item.id} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid rgba(240,160,80,0.35)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
                          {/* Item header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', marginBottom: 3 }}>{item.item_name || '—'}</div>
                              {item.issue_description && <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5 }}>{item.issue_description}</div>}
                              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                {item.area  && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{item.area}</span>}
                                {item.trade && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{item.trade}</span>}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>
                                ₹{((item.material_cost || 0) + (item.labour_cost || 0)).toLocaleString('en-IN')}
                              </div>
                              <div style={{ fontSize: 10, color: '#f0a050', marginTop: 2 }}>⚑ disputed</div>
                            </div>
                          </div>
                          <DisputeThread
                            itemId={item.id}
                            estimateId={current.id}
                            item={item}
                            userEmail={userEmail}
                            onResolve={fetchAll}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}

            {/* ── Two-column bottom (overview tab only) ── */}
            {activeTab === 'overview' && <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>

              {/* Activity timeline */}
              <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Activity</div>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 380 }}>
                  {allEvents.length === 0 ? (
                    <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>No activity yet</div>
                  ) : allEvents.map((ev, i) => {
                    const isLast = i === allEvents.length - 1
                    const evColor = ev.event_type === 'approved' ? '#4dd9c0' : ev.event_type === 'rejected' ? '#f87171' : ev.event_type === 'disputed' ? '#f0a050' : ev.event_type === 'sent' ? '#4a9eff' : 'var(--text-muted, #6b6d82)'
                    return (
                      <div key={ev.id || i} style={{ display: 'flex', gap: 12, padding: '10px 16px', borderBottom: isLast ? 'none' : '1px solid var(--border, #2e3040)', alignItems: 'flex-start' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: evColor, marginTop: 4, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12, color: 'var(--text, #e8e8f0)', textTransform: 'capitalize' }}>{(ev.event_type || '').replace(/_/g, ' ')}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>v{ev._estVersion}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>
                            {fmtShort(ev.created_at)} {fmtTime(ev.created_at)}
                            {ev.actor ? ` · ${ev.actor.split('@')[0]}` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Version history */}
              <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Version History · {estimates.length}</div>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 380 }}>
                  {estimates.map((est, i) => {
                    const version = estimates.length - i
                    const s = getStats(est)
                    const isCurrent = i === 0
                    return (
                      <div
                        key={est.id}
                        style={{ padding: '12px 16px', borderBottom: i < estimates.length - 1 ? '1px solid var(--border, #2e3040)' : 'none', background: isCurrent ? 'rgba(200,150,62,0.04)' : 'none' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>v{version}</span>
                            {isCurrent && <span style={{ fontSize: 9, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em' }}>CURRENT</span>}
                            <StatusBadge status={est.status} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtShort(est.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 8 }}>
                          {s.count} items{s.total > 0 ? ` · ₹${s.total.toLocaleString('en-IN')}` : ''}
                          {est.created_by ? ` · ${est.created_by.split('@')[0]}` : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => navigate(`/estimate/${est.id}`)}
                            style={{ padding: '4px 10px', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
                          >
                            Open →
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

            </div>}
          </>
        )}
      </div>
    </div>
  )
}
