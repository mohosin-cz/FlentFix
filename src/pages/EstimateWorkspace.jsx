import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateEstimate, reconcileEstimate, resolveInspectionWithData } from '../utils/generateEstimate'
import { generateInvoice } from '../utils/generateInvoice'
import DisputeThread from '../components/DisputeThread'
import QueryThread from '../components/QueryThread'
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
  const [genError, setGenError]           = useState(null)
  const [creatingInvoice, setCreating]    = useState(false)
  const [invoiceId, setInvoiceId]         = useState(null)
  const [userEmail, setUserEmail]         = useState(null)
  const [copied, setCopied]               = useState(false)
  const [activeTab, setActiveTab]         = useState('overview') // 'overview' | 'queries' | 'history'
  const [versions, setVersions]           = useState([])
  const [disputes, setDisputes]           = useState([])
  const [queryThreadItemId, setQueryThreadItemId] = useState(null)
  const [activity, setActivity]           = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityHasMore, setActivityHasMore] = useState(false)
  const [activityLoadingMore, setActivityLoadingMore] = useState(false)
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

    // Fetch invoice + versions + disputes for the latest estimate
    if (ests?.length) {
      const [{ data: inv }, { data: vers }, { data: disps }] = await Promise.all([
        supabase.from('tax_invoices').select('id').eq('estimate_id', ests[0].id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('estimate_versions').select('id, version_number, total, status, created_by, created_at').eq('estimate_id', ests[0].id).order('version_number', { ascending: false }),
        supabase.from('estimate_disputes').select('*').eq('estimate_id', ests[0].id).order('created_at', { ascending: true }),
      ])
      setInvoiceId(inv?.id || null)
      setVersions(vers || [])
      setDisputes(disps || [])
    } else {
      setVersions([])
      setDisputes([])
    }

    setLoading(false)
  }, [pid])

  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    if (activeTab !== 'history' || !estimates[0]?.id) return
    setActivityLoading(true)
    supabase
      .from('estimate_activity')
      .select('*')
      .eq('estimate_id', estimates[0].id)
      .order('created_at', { ascending: false })
      .limit(51)
      .then(({ data }) => {
        const rows = data || []
        setActivityHasMore(rows.length === 51)
        setActivity(rows.slice(0, 50))
        setActivityLoading(false)
      })
  }, [activeTab, estimates[0]?.id])

  async function loadMoreActivity() {
    if (!estimates[0]?.id || activityLoadingMore) return
    setActivityLoadingMore(true)
    const { data } = await supabase
      .from('estimate_activity')
      .select('*')
      .eq('estimate_id', estimates[0].id)
      .order('created_at', { ascending: false })
      .range(activity.length, activity.length + 50)
    if (data) {
      setActivityHasMore(data.length === 51)
      setActivity(prev => [...prev, ...data.slice(0, 50)])
    }
    setActivityLoadingMore(false)
  }

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
    setGenerating(true); setGenError(null)
    const inspId = await resolveInspectionWithData(pid)
    if (!inspId) { setGenerating(false); setGenError('No inspection with data found.'); return }
    const result = await generateEstimate(inspId, pid, userEmail)
    setGenerating(false)
    if (result.error) { setGenError(result.error); return }
    await fetchAll()
    navigate(`/estimate/${result.id}`)
  }

  async function handleRegenerate(est) {
    setGenerating(true); setGenError(null)
    const inspId = await resolveInspectionWithData(pid)
    if (!inspId) { setGenerating(false); setGenError('No inspection with data found.'); return }
    const result = await reconcileEstimate(inspId, est.id)
    setGenerating(false)
    if (result.error) { setGenError(result.error); return }
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
    const disputeCount = current.estimate_disputes?.[0]?.count || 0
    if (disputeCount > 0) return { text: `${disputeCount} item${disputeCount > 1 ? 's' : ''} queried — review required`, color: '#f0a050', cta: null }
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
  // count = non-removed items only; approved/disputed/pending share that base.
  function getStats(est) {
    const items = est?.estimate_items || []
    const nonRemoved   = items.filter(i => i.status !== 'removed')
    const actualsCount = nonRemoved.filter(i => i.cost_type === 'actuals' && i.status !== 'excluded').length
    const approved  = nonRemoved.filter(i => i.status === 'approved').length
    const disputed  = nonRemoved.filter(i => i.status === 'disputed').length
    const pending   = nonRemoved.filter(i => !i.status || i.status === 'pending').length
    const approvedTotal = nonRemoved
      .filter(i => i.status === 'approved' && i.cost_type === 'priced')
      .reduce((s, i) => s + ((i.material_cost || 0) + (i.labour_cost || 0)) * (i.qty || 1), 0)
    return { count: nonRemoved.length, total: est?.total ?? 0, actualsCount, approved, disputed, pending, approvedTotal }
  }

  // All events across all estimates, newest first
  const allEvents = estimates
    .flatMap(est => (est.estimate_events || []).map(ev => ({ ...ev, _estVersion: estimates.length - estimates.indexOf(est) })))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 20)

  const banner    = getAttentionBanner()
  const stats     = current ? getStats(current) : null
  // Queried = items with any dispute thread (not just status='disputed')
  const queriedItemIds = new Set(disputes.map(d => d.estimate_item_id))
  const queriedCount = (current?.estimate_items || []).filter(
    i => i.status !== 'removed' && queriedItemIds.has(i.id)
  ).length
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

        {genError && (
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 8, fontSize: 12, color: '#f87171', lineHeight: 1.4 }}>
            ⚠ {genError}
          </div>
        )}

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
                    { label: 'Queried',  value: queriedCount,   color: queriedCount > 0 ? '#f0a050' : undefined },
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

                {/* Approved ₹X of ₹Y */}
                {stats.approved > 0 && (
                  <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: '#4dd9c0', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>✓</span>
                    <span style={{ fontSize: 11, color: '#4dd9c0', fontFamily: 'var(--font-mono, monospace)' }}>
                      Approved ₹{stats.approvedTotal.toLocaleString('en-IN')} of ₹{(stats.total || 0).toLocaleString('en-IN')}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
                      ({stats.approved}/{stats.count} items)
                    </span>
                  </div>
                )}

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
                      onClick={() => { setActiveTab('queries') }}
                      style={{ padding: '8px 16px', minHeight: 44, background: 'none', border: '1px solid #f0a050', borderRadius: 6, fontSize: 12, color: '#f0a050', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
                    >
                      Queries ({current.estimate_disputes[0].count})
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
              // Build per-item dispute map for the Queries tab
              const dispMap = {}
              for (const d of disputes) {
                if (!dispMap[d.estimate_item_id]) dispMap[d.estimate_item_id] = []
                dispMap[d.estimate_item_id].push(d)
              }
              const itemsWithThreads = (current?.estimate_items || []).filter(
                i => dispMap[i.id]?.length > 0
              )
              const needsReplyCount = itemsWithThreads.filter(item => {
                const msgs = dispMap[item.id] || []
                return msgs[msgs.length - 1]?.author_type === 'landlord'
              }).length
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
                    <button style={tabStyle('queries')} onClick={() => setActiveTab('queries')}>
                      Queries{itemsWithThreads.length > 0 ? ` (${itemsWithThreads.length}${needsReplyCount > 0 ? ` · ${needsReplyCount} pending` : ''})` : ''}
                    </button>
                    <button style={tabStyle('history')} onClick={() => setActiveTab('history')}>History</button>
                  </div>

                  {activeTab === 'history' && (() => {
                    const FIELD_LABELS = {
                      material_cost: 'Material', labour_cost: 'Labour', qty: 'Qty',
                      cost_type: 'Type', status: 'Status', warranty: 'Warranty',
                      item_name: 'Name', issue_description: 'Finding', action: 'Remedy',
                      trade: 'Trade', area: 'Area', sort_order: 'Order',
                    }
                    const TYPE_LABELS = { priced: 'Priced', actuals: 'Actual', nil: 'None' }
                    const STATUS_LABELS = { pending: 'Pending', excluded: 'Excluded', removed: 'Removed', approved: 'Approved', disputed: 'Disputed' }
                    function describeChange(e) {
                      if (e.action === 'remove')      return 'Removed'
                      if (e.action === 'restore')     return 'Restored'
                      if (e.action === 'lock')        return 'Marked final'
                      if (e.action === 'send')        return `Sent v${e.new_value}`
                      if (e.action === 'query') {
                        const preview = (e.new_value || e.message || '').slice(0, 70)
                        return preview ? `asked: ${preview}` : 'sent a query'
                      }
                      if (e.action === 'query_reply') {
                        const preview = (e.new_value || e.message || '').slice(0, 70)
                        return preview ? `replied: ${preview}` : 'replied to query'
                      }
                      if (e.action === 'status_change') {
                        if (e.new_value === 'approved') return 'Approved by landlord'
                        return `Status → ${e.new_value || '?'}`
                      }
                      if (e.action === 'edit') {
                        const label = FIELD_LABELS[e.field] || e.field
                        if (['material_cost', 'labour_cost'].includes(e.field)) {
                          const fmtV = v => v ? `₹${Number(v).toLocaleString('en-IN')}` : '₹0'
                          return `${label} ${fmtV(e.old_value)} → ${fmtV(e.new_value)}`
                        }
                        if (e.field === 'cost_type') return `Type ${TYPE_LABELS[e.old_value] || e.old_value} → ${TYPE_LABELS[e.new_value] || e.new_value}`
                        if (e.field === 'status')    return `${STATUS_LABELS[e.old_value] || e.old_value} → ${STATUS_LABELS[e.new_value] || e.new_value}`
                        if (e.field === 'qty') return `Qty ${e.old_value} → ${e.new_value}`
                        const old = e.old_value ? `"${e.old_value.slice(0, 40)}"` : 'empty'
                        const nv  = e.new_value ? `"${e.new_value.slice(0, 40)}"` : 'empty'
                        return `${label}: ${old} → ${nv}`
                      }
                      return e.action
                    }
                    return (
                      <div style={{ marginBottom: 20 }}>
                        {activityLoading ? (
                          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted, #6b6d82)' }}>Loading…</div>
                        ) : activity.length === 0 ? (
                          <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted, #6b6d82)' }}>No history yet — edits will appear here</div>
                        ) : (
                          <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>
                            {activity.map((e, i) => {
                              const isSend = e.action === 'send'
                              const isLast = i === activity.length - 1
                              const ts = new Date(e.created_at)
                              const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                              const dateStr = ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                              const actor = (e.changed_by || '').split('@')[0]
                              if (isSend) {
                                return (
                                  <div key={e.id || i} style={{ padding: '10px 16px', borderBottom: isLast ? 'none' : '1px solid var(--border, #2e3040)', background: 'rgba(200,150,62,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 3, height: 28, borderRadius: 2, background: 'var(--accent, #c8963e)', flexShrink: 0 }} />
                                    <div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>
                                        Version {e.new_value} sent · ₹{Number(e.old_value || 0).toLocaleString('en-IN')}
                                      </div>
                                      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>
                                        {actor} · {dateStr} {timeStr}
                                      </div>
                                    </div>
                                  </div>
                                )
                              }
                              const dotColor = e.action === 'query' ? '#f0a050'
                                : e.action === 'query_reply' ? '#818cf8'
                                : (e.action === 'status_change' && e.new_value === 'approved') ? '#4dd9c0'
                                : undefined
                              return (
                                <div
                                  key={e.id || i}
                                  style={{
                                    padding: '7px 16px',
                                    borderBottom: isLast ? 'none' : '1px solid var(--border, #2e3040)',
                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                  }}
                                >
                                  {dotColor && (
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, marginTop: 4, flexShrink: 0 }} />
                                  )}
                                  <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap', marginTop: 1, flexShrink: 0 }}>
                                    {dateStr} {timeStr}
                                  </span>
                                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                    {actor && <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{actor} · </span>}
                                    {e.item_name && <span style={{ fontSize: 11, color: 'var(--text, #e8e8f0)', fontWeight: 500 }}>{e.item_name} · </span>}
                                    <span style={{ fontSize: 11, color: dotColor || 'var(--text-muted, #9394a8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '100%', verticalAlign: 'bottom' }}>{describeChange(e)}</span>
                                  </div>
                                </div>
                              )
                            })}
                            {activityHasMore && (
                              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border, #2e3040)' }}>
                                <button
                                  onClick={loadMoreActivity}
                                  disabled={activityLoadingMore}
                                  style={{ background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, padding: '6px 14px', fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: activityLoadingMore ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
                                >
                                  {activityLoadingMore ? 'Loading…' : 'Load more'}
                                </button>
                              </div>
                            )}
                            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border, #2e3040)', fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
                              History begins from when activity logging was deployed
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {activeTab === 'queries' && (
                    <div style={{ marginBottom: 20 }}>
                      {itemsWithThreads.length === 0 ? (
                        <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-muted, #6b6d82)' }}>
                          No queries yet — landlord questions appear here
                        </div>
                      ) : [...itemsWithThreads].sort((a, b) => {
                          // Needs-reply first, then by most recent message
                          const aMsgs = dispMap[a.id] || []
                          const bMsgs = dispMap[b.id] || []
                          const aNR = aMsgs[aMsgs.length - 1]?.author_type === 'landlord' ? 1 : 0
                          const bNR = bMsgs[bMsgs.length - 1]?.author_type === 'landlord' ? 1 : 0
                          if (aNR !== bNR) return bNR - aNR
                          const aT = aMsgs[aMsgs.length - 1]?.created_at || ''
                          const bT = bMsgs[bMsgs.length - 1]?.created_at || ''
                          return bT.localeCompare(aT)
                        }).map(item => {
                          const msgs = dispMap[item.id] || []
                          const lastMsg = msgs[msgs.length - 1]
                          const needsReply = lastMsg?.author_type === 'landlord'
                          const isExpanded = queryThreadItemId === item.id
                          const isApproved = item.status === 'approved'
                          const firstReason = msgs[0]?.reason_tag
                          const REASON_SHORT_WS = { why_needed:'why?',more_photos:'photos',cost_breakdown:'cost?',self_arrange:'self',not_needed:'not needed',price_too_high:'price',already_fixed:'fixed',question:'query' }
                          const shortTag = REASON_SHORT_WS[firstReason] || firstReason || 'query'
                          return (
                            <div key={item.id} style={{
                              background: isApproved ? 'rgba(77,217,192,0.03)' : 'var(--bg-panel, #1e2028)',
                              border: `1px solid ${isApproved ? 'rgba(77,217,192,0.25)' : needsReply ? 'rgba(240,160,80,0.35)' : 'var(--border, #2e3040)'}`,
                              borderLeft: isApproved ? '3px solid #4dd9c0' : needsReply ? '3px solid #f0a050' : undefined,
                              borderRadius: 10, marginBottom: 10, overflow: 'hidden',
                            }}>
                              {/* Row header — click to expand/collapse thread */}
                              <button
                                onClick={() => setQueryThreadItemId(p => p === item.id ? null : item.id)}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{item.item_name || '—'}</span>
                                    {isApproved && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 100, background: 'rgba(77,217,192,0.15)', color: '#4dd9c0', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, letterSpacing: '0.04em' }}>✓ Approved</span>}
                                    {!isApproved && needsReply && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 100, background: 'rgba(240,160,80,0.15)', color: '#f0a050', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, letterSpacing: '0.04em' }}>● Query · {shortTag}</span>}
                                    {!isApproved && !needsReply && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 100, background: 'rgba(77,217,192,0.1)', color: '#4dd9c0', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, letterSpacing: '0.04em' }}>↩ replied</span>}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                                    {item.area  && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{item.area}</span>}
                                    {item.trade && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{item.trade}</span>}
                                    {lastMsg && (
                                      <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                                        {lastMsg.message?.slice(0, 80)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                                  {((item.material_cost || 0) + (item.labour_cost || 0)) > 0 && (
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>
                                      ₹{((item.material_cost || 0) + (item.labour_cost || 0)).toLocaleString('en-IN')}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{msgs.length} msg{msgs.length !== 1 ? 's' : ''}</span>
                                </div>
                              </button>

                              {/* Inline thread expansion */}
                              {isExpanded && (
                                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border, #2e3040)' }}>
                                  <div style={{ paddingTop: 14 }}>
                                    <QueryThread
                                      itemId={item.id}
                                      estimateId={current.id}
                                      item={item}
                                      userEmail={userEmail}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      }
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

              {/* Version history — real rows from estimate_versions; legacy fallback for pre-lifecycle sends */}
              {(() => {
                const vCount = versions.length > 0 ? versions.length : (current?.sent_at ? 1 : 0)
                return (
                  <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border, #2e3040)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                        Version History{vCount > 0 ? ` · ${vCount}` : ''}
                      </div>
                    </div>
                    <div style={{ overflowY: 'auto', maxHeight: 380 }}>
                      {versions.length === 0 && !current?.sent_at ? (
                        <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>
                          No versions yet — send to create v1
                        </div>
                      ) : versions.length === 0 ? (
                        /* Legacy: sent before estimate_versions table existed */
                        <div style={{ padding: '12px 16px', background: 'rgba(200,150,62,0.04)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>v1</span>
                              <span style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em' }}>LEGACY</span>
                              <StatusBadge status={current.status} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtShort(current.sent_at)}</span>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 8 }}>
                            {stats?.count != null ? `${stats.count} items` : ''}{(current.total || 0) > 0 ? `${stats?.count != null ? ' · ' : ''}₹${current.total.toLocaleString('en-IN')}` : ''}
                          </div>
                          {current.share_token && (
                            <button
                              onClick={() => window.open(`/e/${current.share_token}`, '_blank', 'noopener,noreferrer')}
                              style={{ padding: '4px 10px', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
                            >
                              Open →
                            </button>
                          )}
                        </div>
                      ) : (
                        versions.map((ver, i) => {
                          const isLatest = i === 0
                          return (
                            <div
                              key={ver.id}
                              style={{ padding: '12px 16px', borderBottom: i < versions.length - 1 ? '1px solid var(--border, #2e3040)' : 'none', background: isLatest ? 'rgba(200,150,62,0.04)' : 'none' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>v{ver.version_number}</span>
                                  {isLatest && <span style={{ fontSize: 9, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.06em' }}>LATEST</span>}
                                  <StatusBadge status={ver.status} />
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtShort(ver.created_at)}</span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 8 }}>
                                {(ver.total || 0) > 0 ? `₹${ver.total.toLocaleString('en-IN')}` : '—'}
                                {ver.created_by ? ` · ${ver.created_by.split('@')[0]}` : ''}
                              </div>
                              <button
                                onClick={() => navigate(`/estimate/${current.id}`)}
                                style={{ padding: '4px 10px', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
                              >
                                Open →
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })()}

            </div>}
          </>
        )}
      </div>
    </div>
  )
}
