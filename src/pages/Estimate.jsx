import { useState, useEffect, useRef, useMemo, useCallback, Component } from 'react'
import { HIGH_VALUE_VIDEO_THRESHOLD, validateProofVideo } from '../utils/proofVideo'
import EstimateDashboard from '../components/estimate/EstimateDashboard'
import ItemDrawer from '../components/estimate/ItemDrawer'
import RateDrawer from '../components/estimate/RateDrawer'
import { MediaLightbox, TypeSeg, ScoreChip, MediaCell } from '../components/estimate/parts'
import { CSS } from '../components/estimate/workbenchCss'
import { uiType, dbType, tc, fmt, itemTot, getScore, invPrice, maxSort } from '../utils/estimateHelpers'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { reconcileEstimate, resolveInspectionWithData } from '../utils/generateEstimate'
import { uploadMedia } from '../utils/mediaUtils'
import { logActivity } from '../utils/activityUtils'
import DisputeThread from '../components/DisputeThread'
import QueryThread from '../components/QueryThread'
import LogoSpinner from '../components/LogoSpinner'

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_COLUMNS = new Set([
  'issue_description','item_name','area','trade','action','warranty',
  'material_description','material_cost','labour_description','labour_cost',
  'qty','cost_type','status','sort_order',
])

// DB cost_type: 'priced' | 'actuals' | 'nil'  ↔  UI type: 'priced' | 'actual' | 'none'
const REASON_SHORT = {
  why_needed: 'why?', more_photos: 'photos', cost_breakdown: 'cost?',
  self_arrange: 'self', not_needed: 'not needed', price_too_high: 'price',
  already_fixed: 'fixed', question: 'query',
}

// ─── Error boundary ───────────────────────────────────────────────────────────

class WbErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ minHeight:'100vh',background:'#0c0d11',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:24,fontFamily:'var(--font-mono, monospace)' }}>
        <div style={{ fontSize:12,color:'#d07050',fontWeight:700 }}>Workbench error</div>
        <div style={{ fontSize:11,color:'#595e69',maxWidth:480,textAlign:'center',wordBreak:'break-word' }}>{String(this.state.err)}</div>
        <button onClick={() => { this.setState({ err:null }); window.location.reload() }}
          style={{ marginTop:8,padding:'8px 20px',background:'none',border:'1px solid #23272f',borderRadius:5,color:'#868a94',cursor:'pointer',fontFamily:'inherit',fontSize:11 }}>
          Reload
        </button>
      </div>
    )
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

function EstimateWorkbenchInner() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [estimate, setEstimate]         = useState(null)
  const [views, setViews]               = useState([])      // landlord 'viewed' events, newest first
  const [statusF, setStatusF]           = useState('all')   // all | approved | disputed | pending
  const [items, setItems]               = useState([])
  const [inspection, setInspection]     = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [userEmail, setUserEmail]       = useState(null)
  const [versionCount, setVersionCount] = useState(1)
  const [mediaMap, setMediaMap]         = useState({})

  const [pinnedId, setPinnedId]           = useState(null)
  const [rateDrawerOpen, setRateDrawerOpen] = useState(false)
  const [ctxMenu, setCtxMenu]             = useState(null)
  const [collapsed, setCollapsed]         = useState(new Set())
  const [notesEditing, setNotesEditing]   = useState(false)
  const [notesDraft, setNotesDraft]       = useState('')
  const [savingNotes, setSavingNotes]     = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [copied, setCopied]               = useState(false)
  const [hasUnsent, setHasUnsent]         = useState(false)
  const [locking, setLocking]             = useState(false)
  const [sending, setSending]             = useState(false)
  const [sendError, setSendError]         = useState(null)
  const [lightbox, setLightbox]           = useState(null)
  const [disputeMap, setDisputeMap]       = useState({})
  const [drawerInitTab, setDrawerInitTab] = useState('details')
  const [pulseIds, setPulseIds]           = useState(new Set())
  const initialQueryIds                   = useRef(null)
  const prevDisputeMapRef                 = useRef({})

  // Group headers stick under the command bar, so they need its real height —
  // measured, not assumed, because the bar wraps to three rows on a phone.
  // A callback ref rather than useRef + useEffect: the header unmounts while
  // the page is loading, and an effect would leave the observer watching the
  // detached node, pinning --cmd-h to whatever it measured first.
  const cmdRoRef = useRef(null)
  const cmdRef = useCallback(node => {
    cmdRoRef.current?.disconnect()
    if (!node) { document.documentElement.style.removeProperty('--cmd-h'); return }
    const apply = () => document.documentElement.style.setProperty('--cmd-h', `${Math.round(node.getBoundingClientRect().height)}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(node)
    cmdRoRef.current = ro
  }, [])

  const dragRef          = useRef(null)   // { itemId, trade }
  const activityTimers   = useRef(new Map())
  const activityFirstOld = useRef(new Map())
  const [dragOverId,    setDragOverId]    = useState(null)
  const [dragOverTrade, setDragOverTrade] = useState(null)

  // Both loaders are declared above loadData because it calls them. itemsRef
  // keeps loadMedia's "default to current items" behaviour without making the
  // callback depend on items, which would rebuild it on every edit.
  const itemsRef = useRef([])
  useEffect(() => { itemsRef.current = items }, [items])

  const loadDisputes = useCallback(async (estId) => {
    const { data } = await supabase.from('estimate_disputes').select('*').eq('estimate_id', estId).order('created_at', { ascending: true })
    if (!data) return
    const m = {}
    for (const d of data) { if (!m[d.estimate_item_id]) m[d.estimate_item_id] = []; m[d.estimate_item_id].push(d) }
    setDisputeMap(m)
  }, [])

  const loadMedia = useCallback(async (itemsList) => {
    const ids = (itemsList || itemsRef.current).map(i => i.line_item_id).filter(Boolean)
    if (!ids.length) { setMediaMap({}); return }
    const { data } = await supabase.from('line_item_media').select('id,line_item_id,url,type,is_proof_video').in('line_item_id', ids).order('id', { ascending: true })
    if (data) {
      const map = {}
      data.forEach(m => { if (!map[m.line_item_id]) map[m.line_item_id]=[]; map[m.line_item_id].push(m) })
      setMediaMap(map)
    }
  }, [])

  // Declared here, not further down: the keyboard handler below closes over it,
  // and reading it after the fact meant locking an estimate left the shortcuts
  // still able to edit until something else re-ran the effect.
  const isLocked = !!estimate?.locked

  // ── Load ─────────────────────────────────────────────────────────────────────

  // Declared before the effect that runs it, and memoised on id, so the effect
  // can depend on it honestly instead of relying on hoisting.
  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: { user } }, { data: est }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('estimates').select('id,pid,inspection_id,status,notes,share_token,created_at,created_by,total,current_version,locked,locked_at,locked_by,first_viewed_at,approved_by_name,approved_at,sent_at').eq('id', id).maybeSingle(),
    ])
    setUserEmail(user?.email || null)
    if (!est) { setError('Estimate not found'); setLoading(false); return }
    setEstimate(est)
    setNotesDraft(est.notes || '')

    // Try join with inspection_line_items for score/notes; fallback to plain select
    let itemsData = null
    const { data: d1, error: e1 } = await supabase
      .from('estimate_items')
      .select('*, inspection_line_items(item_score, notes, availability_status, action)')
      .eq('estimate_id', id)
      .order('sort_order')
    if (e1) {
      const { data: d2 } = await supabase.from('estimate_items').select('*').eq('estimate_id', id).order('sort_order')
      itemsData = d2
    } else {
      itemsData = d1
    }

    const [inspRes, estCountRes, viewRes] = await Promise.all([
      supabase.from('inspections').select('id,pid,house_type,inspection_date').eq('id', est.inspection_id).maybeSingle(),
      supabase.from('estimates').select('id').eq('pid', est.pid),
      supabase.from('estimate_events').select('created_at')
        .eq('estimate_id', id).eq('event_type', 'viewed').order('created_at', { ascending: false }),
    ])
    const fetched = itemsData || []
    setItems(fetched)
    setInspection(inspRes.data || null)
    setVersionCount(estCountRes.data?.length || 1)
    setViews(viewRes.data || [])
    setLoading(false)
    loadMedia(fetched)
    loadDisputes(id)

    // Auto-backfill stored total if null (first open after migration or after regenerate)
    if (est.total == null) {
      const firmTotal = fetched
        .filter(i => !['removed', 'excluded'].includes(i.status) && i.cost_type === 'priced')
        .reduce((s, i) => s + ((parseFloat(i.material_cost) || 0) + (parseFloat(i.labour_cost) || 0)) * (i.qty || 1), 0)
      supabase.from('estimates').update({ total: firmTotal }).eq('id', id)
        .then(() => setEstimate(prev => prev ? { ...prev, total: firmTotal } : prev))
    }
  }, [id, loadMedia, loadDisputes])

  useEffect(() => { loadData() }, [loadData])


  function updateMediaList(lineItemId, fn) {
    setMediaMap(p => ({ ...p, [lineItemId]: fn(p[lineItemId]||[]) }))
  }

  async function handleAddMedia(lineItemId, files) {
    for (const file of files) {
      const baseName = `workbench/${lineItemId}/${Date.now()}`
      let publicUrl
      try { publicUrl = await uploadMedia(supabase, file, baseName); if (!publicUrl) continue }
      catch (e) { console.error('[addMedia]', e.message); continue }
      const type = file.type.startsWith('video') ? 'video' : 'image'
      const { data: row } = await supabase.from('line_item_media').insert({ line_item_id: lineItemId, url: publicUrl, type }).select().single()
      if (row) updateMediaList(lineItemId, prev => [...prev, row])
    }
  }

  async function handleDeleteMedia(m) {
    if (!window.confirm('Delete this file?')) return
    await supabase.from('line_item_media').delete().eq('id', m.id)
    const sp = m.url.split('/object/public/inspection-media/')[1]
    if (sp) await supabase.storage.from('inspection-media').remove([decodeURIComponent(sp)])
    updateMediaList(m.line_item_id, prev => prev.filter(x => x.id !== m.id))
  }

  async function handleReplaceMedia(m, file) {
    const baseName = `workbench/${m.line_item_id}/${Date.now()}`
    let publicUrl
    try { publicUrl = await uploadMedia(supabase, file, baseName); if (!publicUrl) return }
    catch (e) { console.error('[replaceMedia]', e.message); return }
    const type = file.type.startsWith('video') ? 'video' : 'image'
    await supabase.from('line_item_media').update({ url: publicUrl, type }).eq('id', m.id)
    const sp = m.url.split('/object/public/inspection-media/')[1]
    if (sp) await supabase.storage.from('inspection-media').remove([decodeURIComponent(sp)])
    updateMediaList(m.line_item_id, prev => prev.map(x => x.id===m.id ? { ...x, url:publicUrl, type } : x))
  }

  async function handleSetPrimary(lineItemId, target) {
    const list = mediaMap[lineItemId] || []
    if (list.length < 2) return
    const primary = list[0]
    if (primary.id === target.id) return
    await Promise.all([
      supabase.from('line_item_media').update({ url:target.url, type:target.type }).eq('id', primary.id),
      supabase.from('line_item_media').update({ url:primary.url, type:primary.type }).eq('id', target.id),
    ])
    updateMediaList(lineItemId, prev => prev.map(x => {
      if (x.id === primary.id) return { ...x, url:target.url, type:target.type }
      if (x.id === target.id)  return { ...x, url:primary.url, type:primary.type }
      return x
    }))
  }

  async function handleAddProofVideo(lineItemId, file) {
    try {
      await validateProofVideo(file)
    } catch (err) {
      alert(err.message); return
    }
    const baseName = `workbench/${lineItemId}/${Date.now()}_proof`
    let publicUrl
    try { publicUrl = await uploadMedia(supabase, file, baseName); if (!publicUrl) return }
    catch (e) { console.error('[addProofVideo]', e.message); return }
    const { data: row } = await supabase.from('line_item_media').insert({ line_item_id: lineItemId, url: publicUrl, type: 'video', is_proof_video: true }).select().single()
    if (row) updateMediaList(lineItemId, prev => [...prev, row])
  }

  // ── Item ops ──────────────────────────────────────────────────────────────────

  function scheduleLog(itemId, itemName, field, oldVal, newVal) {
    const key = `${itemId}:${field}`
    if (!activityFirstOld.current.has(key)) {
      activityFirstOld.current.set(key, String(oldVal ?? ''))
    }
    clearTimeout(activityTimers.current.get(key))
    activityTimers.current.set(key, setTimeout(() => {
      const firstOld = activityFirstOld.current.get(key) ?? ''
      activityFirstOld.current.delete(key)
      activityTimers.current.delete(key)
      const nv = String(newVal ?? '')
      if (firstOld === nv) return
      logActivity(supabase, id, { action: 'edit', field, old_value: firstOld, new_value: nv, item_id: itemId, item_name: itemName, changed_by: userEmail })
    }, 2000))
  }

  async function updateItem(itemId, updates) {
    const safe = {}
    for (const [k, v] of Object.entries(updates)) {
      if (VALID_COLUMNS.has(k)) safe[k] = v
    }
    if (!Object.keys(safe).length) return
    const prev = items.find(i => i.id === itemId)
    const newItems = items.map(i => i.id === itemId ? { ...i, ...safe } : i)
    setItems(() => newItems)
    const { error: err } = await supabase.from('estimate_items').update(safe).eq('id', itemId)
    if (err) {
      console.error('[updateItem]', err.message)
      setItems(p => p.map(i => i.id === itemId ? prev : i))
    } else {
      // estimates.total is maintained by a DB trigger — no client write needed
      if (estimate?.status !== 'draft') setHasUnsent(true)
      for (const [field, newVal] of Object.entries(safe)) {
        scheduleLog(itemId, prev?.item_name, field, prev?.[field], newVal)
      }
    }
  }

  // ── Reorder / move-across-trade ───────────────────────────────────────────────

  async function saveSortBatch(changes) {
    // Only writes sort_order and optionally trade — never total_cost (GENERATED)
    await Promise.all(changes.map(({ id, sort_order, trade }) => {
      const upd = { sort_order }
      if (trade !== undefined) upd.trade = trade
      return supabase.from('estimate_items').update(upd).eq('id', id)
    }))
  }

  function getGroupSorted(trade) {
    return items
      .filter(i => (i.trade || '') === trade && i.status !== 'removed')
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }

  function reorderWithinGroup(trade, fromId, toId) {
    if (fromId === toId) return
    const group = getGroupSorted(trade)
    const fromIdx = group.findIndex(i => i.id === fromId)
    const toIdx   = group.findIndex(i => i.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...group]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const changes = reordered.map((it, i) => ({ id: it.id, sort_order: (i + 1) * 10 }))
    setItems(prev => prev.map(it => { const c = changes.find(ch => ch.id === it.id); return c ? { ...it, sort_order: c.sort_order } : it }))
    saveSortBatch(changes)
  }

  function moveItemInGroup(trade, itemId, direction) {
    const group = getGroupSorted(trade)
    const idx = group.findIndex(i => i.id === itemId)
    if (idx === -1) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= group.length) return
    const reordered = [...group]
    const [moved] = reordered.splice(idx, 1)
    reordered.splice(newIdx, 0, moved)
    const changes = reordered.map((it, i) => ({ id: it.id, sort_order: (i + 1) * 10 }))
    setItems(prev => prev.map(it => { const c = changes.find(ch => ch.id === it.id); return c ? { ...it, sort_order: c.sort_order } : it }))
    saveSortBatch(changes)
  }

  async function moveAcrossTrade(itemId, newTrade) {
    const srcItem = items.find(i => i.id === itemId)
    if (!srcItem) return
    const oldTrade = srcItem.trade || ''
    const destItems = items
      .filter(i => (i.trade || '') === newTrade && i.status !== 'removed' && i.id !== itemId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    const newDestGroup = [...destItems, srcItem]
    const changes = newDestGroup.map((it, i) => ({
      id: it.id, sort_order: (i + 1) * 10,
      ...(it.id === itemId ? { trade: newTrade } : {}),
    }))
    setItems(prev => prev.map(it => {
      const c = changes.find(ch => ch.id === it.id)
      if (!c) return it
      return { ...it, sort_order: c.sort_order, ...(it.id === itemId ? { trade: newTrade } : {}) }
    }))
    await saveSortBatch(changes)
    if (oldTrade !== newTrade) {
      logActivity(supabase, id, { action: 'reorder', field: 'trade', old_value: oldTrade, new_value: newTrade, item_id: itemId, item_name: srcItem.item_name, changed_by: userEmail })
    }
  }

  async function duplicateItem(itemId) {
    const orig = items.find(i => i.id === itemId)
    if (!orig) return
    const { id: _, created_at: __, inspection_line_items: ___, ...rest } = orig
    const { data: newItem } = await supabase.from('estimate_items').insert({ ...rest, sort_order: maxSort(items)+1, status: 'pending' }).select().single()
    if (newItem) {
      setItems(p => [...p, newItem])
      logActivity(supabase, id, { action: 'add', item_name: orig.item_name, changed_by: userEmail })
    }
  }

  async function removeItem(itemId) {
    const prevItem = items.find(i => i.id === itemId)
    setItems(p => p.map(i => i.id===itemId ? { ...i, status:'removed' } : i))
    const { error: err } = await supabase.from('estimate_items').update({ status:'removed' }).eq('id', itemId)
    if (err) setItems(p => p.map(i => i.id===itemId ? { ...i, status: prevItem?.status } : i))
    else logActivity(supabase, id, { action: 'remove', item_id: itemId, item_name: prevItem?.item_name, changed_by: userEmail })
  }

  async function restoreItem(itemId) {
    const prevItem = items.find(i => i.id === itemId)
    setItems(p => p.map(i => i.id===itemId ? { ...i, status:'pending' } : i))
    const { error: err } = await supabase.from('estimate_items').update({ status:'pending' }).eq('id', itemId)
    if (err) setItems(p => p.map(i => i.id===itemId ? { ...i, status:'removed' } : i))
    else logActivity(supabase, id, { action: 'restore', item_id: itemId, item_name: prevItem?.item_name, changed_by: userEmail })
  }

  async function handleSelectMaterial(r) {
    const price = r ? invPrice(r) : 0
    const { data: newItem } = await supabase.from('estimate_items').insert({
      estimate_id: id, sort_order: maxSort(items)+1,
      trade: r?.trade||'', item_name: r?.item_name||'New item', area: '',
      issue_description: '',
      material_description: r ? `${r.item_name}${r.spec?` · ${r.spec}`:''}${r.size?` · ${r.size}`:''}` : '',
      material_cost: price, labour_description: '', labour_cost: 0,
      qty: 1, cost_type: 'priced', status: 'pending',
    }).select().single()
    if (newItem) { setItems(p => [...p, newItem]); setPinnedId(newItem.id) }
    setRateDrawerOpen(false)
  }

  async function handleSelectLabour(r) {
    if (!r) return
    const { data: newItem } = await supabase.from('estimate_items').insert({
      estimate_id: id, sort_order: maxSort(items)+1,
      trade: r.trade||'', item_name: r.work_type||'Labour', area: '',
      issue_description: '', material_description: '', material_cost: 0,
      labour_description: `${r.work_type}${r.unit?` · per ${r.unit}`:''}`,
      labour_cost: r.cost_per_unit||0, qty: 1, cost_type: 'priced', status: 'pending',
    }).select().single()
    if (newItem) { setItems(p => [...p, newItem]); setPinnedId(newItem.id) }
    setRateDrawerOpen(false)
  }

  async function saveNotes() {
    setSavingNotes(true)
    await supabase.from('estimates').update({ notes: notesDraft }).eq('id', id)
    setEstimate(p => ({ ...p, notes: notesDraft }))
    setNotesEditing(false)
    setSavingNotes(false)
  }

  async function handleRegenerate() {
    if (!window.confirm('Regen: inserts missing items and marks removed ones. Your edits are preserved. Continue?')) return
    setGenerating(true)
    const inspId = estimate?.inspection_id || await resolveInspectionWithData(estimate?.pid)
    if (!inspId) { setGenerating(false); return }
    const result = await reconcileEstimate(inspId, id)
    if (result.error) {
      setSendError(`Regen failed: ${result.error}`)
      setGenerating(false)
      return
    }
    await loadData()
    setGenerating(false)
  }

  function copyLink() {
    const url = estimate?.share_token
      ? `${window.location.origin}/e/${estimate.share_token}`
      : `${window.location.origin}/estimate/${id}`
    try {
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url)
      else { const ta = document.createElement('textarea'); ta.value = url; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta) }
    } catch { /* ignore clipboard */ }
    setCopied(true); setTimeout(() => setCopied(false), 2200)
  }

  async function handleSend() {
    if (sending) return
    setSending(true)
    setSendError(null)

    const liveItems = items.filter(i => i.status !== 'removed')
    if (liveItems.length === 0) {
      setSendError('Nothing to send — estimate has no items.')
      setSending(false)
      return
    }
    const snapTotal = liveItems
      .filter(i => i.status !== 'excluded' && i.cost_type === 'priced')
      .reduce((s, i) => s + ((parseFloat(i.material_cost)||0) + (parseFloat(i.labour_cost)||0)) * (i.qty||1), 0)
    const nextVersion = (estimate?.current_version || 0) + 1

    function abort(stage, msg) {
      const full = `Send failed [${stage}]: ${msg}`
      console.error('[handleSend]', full, { estimate_id: id, nextVersion, userEmail })
      setSendError(full)
      logActivity(supabase, id, { action: 'send_failed', new_value: full, changed_by: userEmail })
      setSending(false)
    }

    // ── Step 1: create version row ──────────────────────────────────────────────
    const { data: ver, error: vErr } = await supabase
      .from('estimate_versions')
      .insert({ estimate_id: id, version_number: nextVersion, total: snapTotal, status: 'active', created_by: userEmail })
      .select('id').single()

    if (vErr || !ver?.id) {
      abort('version_create', vErr?.message || 'no row returned')
      return
    }

    // ── Step 2: snapshot items ──────────────────────────────────────────────────
    const snapRows = liveItems.map(item => ({
      version_id:           ver.id,
      estimate_item_id:     item.id,
      line_item_id:         item.line_item_id,
      sort_order:           item.sort_order,
      area:                 item.area,
      item_name:            item.item_name,
      trade:                item.trade,
      section_name:         item.section_name || '',
      issue_description:    item.issue_description,
      material_description: item.material_description,
      material_cost:        item.material_cost,
      action:               item.action,
      labour_description:   item.labour_description,
      labour_cost:          item.labour_cost,
      qty:                  item.qty,
      cost_type:            item.cost_type,
      status:               item.status,
      warranty:             item.warranty,
    }))

    const { error: snapErr } = await supabase.from('estimate_version_items').insert(snapRows)
    if (snapErr) {
      await supabase.from('estimate_versions').delete().eq('id', ver.id)
      abort('version_items', snapErr.message)
      return
    }

    // ── Step 3: verify count ────────────────────────────────────────────────────
    const { count: insertedCount, error: countErr } = await supabase
      .from('estimate_version_items')
      .select('id', { count: 'exact', head: true })
      .eq('version_id', ver.id)

    if (countErr || insertedCount !== snapRows.length) {
      await supabase.from('estimate_version_items').delete().eq('version_id', ver.id)
      await supabase.from('estimate_versions').delete().eq('id', ver.id)
      abort('verify', countErr?.message || `expected ${snapRows.length} items, got ${insertedCount}`)
      return
    }

    // ── Step 4: mark prior versions superseded ──────────────────────────────────
    await supabase.from('estimate_versions').update({ status: 'superseded' }).eq('estimate_id', id).neq('id', ver.id)

    // ── Step 5: update estimate — ONLY after both inserts verified ──────────────
    const now = new Date().toISOString()
    const { error: estErr } = await supabase
      .from('estimates')
      .update({ current_version: nextVersion, status: 'sent', sent_at: now })
      .eq('id', id)

    if (estErr) {
      // Version committed but estimate row not updated — rollback the version
      await supabase.from('estimate_version_items').delete().eq('version_id', ver.id)
      await supabase.from('estimate_versions').delete().eq('id', ver.id)
      abort('estimate_update', estErr.message)
      return
    }

    // ── Step 6: success ─────────────────────────────────────────────────────────
    await supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'sent', actor: userEmail })
    setEstimate(p => ({ ...p, current_version: nextVersion, status: 'sent', sent_at: now }))
    setHasUnsent(false)
    logActivity(supabase, id, { action: 'send', old_value: String(snapTotal), new_value: String(nextVersion), changed_by: userEmail })
    copyLink()
    setSending(false)
  }

  async function handleLock() {
    if (!window.confirm('Mark this estimate as final? All editing will be disabled and the landlord will see a read-only view.')) return
    setLocking(true)
    const now = new Date().toISOString()
    await supabase.from('estimates').update({ locked: true, locked_at: now, locked_by: userEmail }).eq('id', id)
    setEstimate(p => ({ ...p, locked: true, locked_at: now, locked_by: userEmail }))
    setLocking(false)
    logActivity(supabase, id, { action: 'lock', changed_by: userEmail })
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const [query, setQuery] = useState('')

  // Search across the fields someone would actually recall: what it is, where
  // it is, what was found, what we plan to do, and the trade.
  const needle = query.trim().toLowerCase()
  const statusCounts = useMemo(() => {
    const live = items.filter(i => !['removed', 'excluded'].includes(i.status))
    return {
      all: live.length,
      approved: live.filter(i => i.status === 'approved').length,
      disputed: live.filter(i => i.status === 'disputed').length,
      pending:  live.filter(i => !['approved', 'disputed'].includes(i.status)).length,
    }
  }, [items])

  // One predicate for text and decision, so the count in the find bar and the
  // rows on screen can never disagree.
  const matchesStatus = useCallback((it) => {
    if (statusF === 'all') return true
    if (['removed', 'excluded'].includes(it.status)) return false
    if (statusF === 'pending') return !['approved', 'disputed'].includes(it.status)
    return it.status === statusF
  }, [statusF])

  const matchesQuery = useCallback((it) => {
    if (!matchesStatus(it)) return false
    if (!needle) return true
    return [it.item_name, it.area, it.issue_description, it.action, it.trade]
      .some(f => (f || '').toLowerCase().includes(needle))
  }, [needle, matchesStatus])

  const totalCount = useMemo(() => items.filter(i => i.status !== 'removed').length, [items])
  const matchCount = useMemo(() => items.filter(i => i.status !== 'removed' && matchesQuery(i)).length, [items, matchesQuery])

  const navigable = useMemo(() =>
    items.filter(i => i.status !== 'removed' && matchesQuery(i)).sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
  , [items, matchesQuery])

  const drawerItem = useMemo(() =>
    pinnedId ? items.find(i => i.id === pinnedId) || null : null
  , [pinnedId, items])

  const drawerIdx = useMemo(() =>
    drawerItem ? navigable.findIndex(i => i.id === drawerItem.id) : -1
  , [drawerItem, navigable])

  // Grouped case-insensitively: "Cleaning" and "cleaning" are one trade, not
  // two half-empty sections. The first spelling seen becomes the group's value,
  // so dragging into it normalises the odd one out rather than preserving it.
  const tradeGroups = useMemo(() => {
    const map = {}
    for (const item of items.filter(matchesQuery)) {
      const raw = (item.trade || '').trim()
      const key = raw.toLowerCase()
      if (!map[key]) map[key] = { trade: raw, rows: [] }
      map[key].rows.push(item)
    }
    return Object.values(map).map(({ trade, rows }) => ({
      trade,
      rows: [...rows].sort((a,b) => (a.sort_order||0)-(b.sort_order||0)),
      subtotal: rows.filter(i => !['removed','excluded'].includes(i.status) && i.cost_type==='priced').reduce((s,i) => s+itemTot(i), 0),
    }))
  }, [items, matchesQuery])

  const panelOpen = pinnedId !== null

  function navigateDrawer(delta) {
    if (drawerIdx < 0) return
    const next = navigable[drawerIdx + delta]
    if (next) { setPinnedId(next.id); document.getElementById(`row-${next.id}`)?.scrollIntoView({ block:'nearest', behavior:'smooth' }) }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    function handle(e) {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return
      const curIdx = pinnedId ? navigable.findIndex(i => i.id === pinnedId) : -1
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault()
        if (pinnedId) { const it = items.find(i => i.id === pinnedId); if (it) moveItemInGroup(it.trade || '', pinnedId, 1) }
      } else if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault()
        if (pinnedId) { const it = items.find(i => i.id === pinnedId); if (it) moveItemInGroup(it.trade || '', pinnedId, -1) }
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = navigable[curIdx+1] || navigable[0]
        if (next) { setPinnedId(next.id); document.getElementById(`row-${next.id}`)?.scrollIntoView({ block:'nearest', behavior:'smooth' }) }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prev = curIdx > 0 ? navigable[curIdx-1] : navigable[navigable.length-1]
        if (prev) { setPinnedId(prev.id); document.getElementById(`row-${prev.id}`)?.scrollIntoView({ block:'nearest', behavior:'smooth' }) }
      } else if (e.key === 'Home') {
        e.preventDefault(); if (navigable[0]) setPinnedId(navigable[0].id)
      } else if (e.key === 'End') {
        e.preventDefault(); const last=navigable[navigable.length-1]; if (last) setPinnedId(last.id)
      } else if (e.key === 'Escape') {
        e.preventDefault(); setPinnedId(null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (pinnedId) setPinnedId(null)
        else if (navigable[0]) setPinnedId(navigable[0].id)
      } else if (pinnedId && !isLocked) {
        if (e.key === 'p' || e.key === 'P') { e.preventDefault(); updateItem(pinnedId, { cost_type:'priced' }) }
        else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); updateItem(pinnedId, { cost_type:'actuals' }) }
        else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); updateItem(pinnedId, { cost_type:'nil' }) }
        else if (e.key === 'e' || e.key === 'E') {
          e.preventDefault()
          const it = items.find(i => i.id === pinnedId)
          if (it) updateItem(pinnedId, { status: it.status==='excluded' ? 'pending' : 'excluded' })
        }
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
    // updateItem and moveItemInGroup are re-created every render; listing them
    // would rebind the listener on every keystroke. They read current state
    // when invoked, so the closure staleness that matters is isLocked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedId, navigable, items, isLocked])

  // ── Pulse new queries ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (Object.keys(disputeMap).length === 0) return
    const openIds = new Set(
      Object.entries(disputeMap)
        .filter(([, ds]) => ds.length > 0 && ds[ds.length - 1].author_type === 'landlord')
        .map(([itemId]) => itemId)
    )
    if (initialQueryIds.current === null) {
      initialQueryIds.current = openIds
      prevDisputeMapRef.current = disputeMap
      return
    }
    const newIds = [...openIds].filter(id => !initialQueryIds.current.has(id) && !prevDisputeMapRef.current[id])
    if (newIds.length > 0) {
      const s = new Set(newIds)
      setPulseIds(p => new Set([...p, ...s]))
      setTimeout(() => setPulseIds(p => { const n = new Set(p); s.forEach(id => n.delete(id)); return n }), 1600)
      newIds.forEach(id => initialQueryIds.current.add(id))
    }
    prevDisputeMapRef.current = disputeMap
  }, [disputeMap])

  // ── Cell renderers ────────────────────────────────────────────────────────────

  function tcell(it) {
    const tot = itemTot(it)
    if (it.status === 'excluded')    return <span className="mut">excl</span>
    if (it.cost_type === 'actuals')  return <span className="act-cell">On actuals</span>
    if (it.cost_type === 'nil')      return <span className="none-cell">₹0</span>
    if (it.cost_type === 'priced' && tot > 0) return <span className="tot-cell">₹{fmt(tot)}</span>
    return <span className="np-cell">⚠ price</span>
  }

  function mcell(it) {
    const tot = itemTot(it)
    return it.cost_type==='priced' && tot>0 && (it.material_cost||0)>0
      ? <span className="num">₹{fmt(it.material_cost)}</span>
      : <span className="mut">—</span>
  }

  function lcell(it) {
    const tot = itemTot(it)
    return it.cost_type==='priced' && tot>0 && (it.labour_cost||0)>0
      ? <span className="num">₹{fmt(it.labour_cost)}</span>
      : <span className="mut">—</span>
  }

  // ── Early returns ─────────────────────────────────────────────────────────────

  if (loading) return <LogoSpinner full />
  if (error)   return <div style={{ minHeight:'100vh',background:'#0c0d11',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--clay)',fontFamily:'var(--mono)',fontSize:13 }}>{error}</div>

  const pid      = estimate?.pid || ''
  const status   = estimate?.status || 'draft'
  const isViewed = status === 'viewed'
  const shareUrl = estimate?.share_token ? `${window.location.origin}/e/${estimate.share_token}` : null
  const mrShift  = panelOpen ? 430 : 0

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:'100vh',background:'var(--bg)',color:'var(--ink)',fontFamily:'var(--sans)',fontSize:13 }} onClick={() => ctxMenu && setCtxMenu(null)}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Locked banner */}
      {isLocked && (
        <div style={{ background:'rgba(200,150,62,0.12)',borderBottom:'1px solid rgba(200,150,62,0.3)',padding:'8px 20px',fontSize:12,color:'var(--gold)',fontFamily:'var(--mono)',display:'flex',alignItems:'center',gap:8 }}>
          <span>🔒</span>
          <span>Estimate marked final by {estimate.locked_by?.split('@')[0] || 'admin'} — editing is disabled.</span>
        </div>
      )}

      {/* Command bar */}
      <header className="cmd" ref={cmdRef}>
        <div className="l">
          <button className="back" onClick={() => navigate(`/properties/${pid}/estimates`)}>‹</button>
          <div>
            <div className="ttl">
              PID {pid}
              {inspection?.house_type && <span className="sub"> · {inspection.house_type}</span>}
              <span className="sub"> · v{estimate?.current_version || versionCount}</span>
              {isViewed && <span className="pill viewed" style={{ marginLeft:8 }}>VIEWED</span>}
              {hasUnsent && !isLocked && <span className="pill" style={{ marginLeft:8,background:'rgba(248,113,113,0.15)',color:'#f87171',border:'1px solid rgba(248,113,113,0.3)' }}>● unsent changes</span>}
              {isLocked && <span className="pill" style={{ marginLeft:8,background:'rgba(200,150,62,0.15)',color:'var(--gold)',border:'1px solid rgba(200,150,62,0.3)' }}>FINAL</span>}
            </div>
          </div>
        </div>
        <div className="acts">
          {!isLocked && <button className="btn ghost tct tct-bare" onClick={handleRegenerate} disabled={generating}>{generating ? 'Regen…' : 'Regen'}</button>}
          <button className="btn ghost tct tct-bare" onClick={() => setNotesEditing(p => !p)}>Notes</button>
          {shareUrl && <button className="btn ghost tct tct-bare" onClick={() => window.open(shareUrl,'_blank')}>Preview</button>}
          <button className="btn ghost tct tct-bare" onClick={copyLink}>{copied ? 'Copied!' : 'Copy link'}</button>
          {sendError && (
            <span style={{ fontSize:11,color:'#f87171',fontFamily:'var(--mono)',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }} title={sendError}>
              ⚠ {sendError}
            </span>
          )}
          {!isLocked && (() => {
            const liveCount = items.filter(i => i.status !== 'removed').length
            const isEmpty = liveCount === 0
            return (
              <button className="btn primary tct tct-raised" onClick={handleSend} disabled={sending || isEmpty}
                title={isEmpty ? 'Nothing to send — estimate has no items' : undefined}>
                {sending ? 'Sending…' : isEmpty ? 'No items' : status === 'draft' ? 'Send →' : 'Resend →'}
              </button>
            )
          })()}
          {!isLocked && status !== 'draft' && (
            // .tct draws no border, so the old gold outline became a shadow ring.
            // Mark final is irreversible and shouldn't read as a bare-text
            // action sitting next to Notes.
            <button className="btn ghost tct tct-bare" onClick={handleLock} disabled={locking}
              style={{ color:'var(--gold)' }}>
              {locking ? 'Locking…' : 'Mark final'}
            </button>
          )}
        </div>
      </header>

      {/* Shift content when drawer open */}
      <div style={{ marginRight: mrShift, transition:'margin-right .16s' }}>

        {/* Dashboard */}
        {(() => {
          const openQueryCount = Object.values(disputeMap).filter(ds => ds.length > 0 && ds[ds.length - 1].author_type === 'landlord').length
          return <EstimateDashboard items={items} mediaMap={mediaMap} openQueryCount={openQueryCount} estimate={estimate} views={views} />
        })()}

        {/* Notes bar */}
        {notesEditing && (
          <div className="notes-bar">
            <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} placeholder="Internal notes for this estimate…" rows={3}
              style={{ flex:1,padding:'8px 10px',background:'var(--panel2)',border:'1px solid var(--line)',borderRadius:5,color:'var(--ink2)',fontSize:13,resize:'vertical',outline:'none',fontFamily:'var(--sans)',transition:'border-color .15s' }}
              onFocus={e => e.target.style.borderColor='var(--gold)'} onBlur={e => e.target.style.borderColor='var(--line)'}
            />
            <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
              <button className="btn primary tct tct-raised" onClick={saveNotes} disabled={savingNotes}>{savingNotes ? 'Saving…' : 'Save'}</button>
              <button className="btn ghost tct tct-bare" onClick={() => setNotesEditing(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Board */}
        <main className="board">
          <div className="findbar">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery('') } }}
              placeholder="Find an item — name, area, finding, remedy, trade"
              aria-label="Find an item"
            />
            {needle
              ? <><span className="cnt">{matchCount} of {totalCount}</span>
                  <button className="clr" onClick={() => setQuery('')} aria-label="Clear search">×</button></>
              : <span className="cnt">{totalCount} items</span>}
          </div>

          {/* Decision filter. Counts sit on the chips so an empty state is
              obvious before you click into it. */}
          <div className="sfilter" style={{ padding:'0 13px 10px' }}>
            {[
              { k:'all',      l:'All',      n:statusCounts.all },
              { k:'approved', l:'Approved', n:statusCounts.approved },
              { k:'disputed', l:'Disputed', n:statusCounts.disputed },
              { k:'pending',  l:'Awaiting', n:statusCounts.pending },
            ].map(f => (
              <button key={f.k} className={`sfbtn tct tct-raised${statusF === f.k ? ' is-on' : ''}`}
                aria-pressed={statusF === f.k}
                onClick={() => setStatusF(f.k)}>
                {f.l} {f.n}
              </button>
            ))}
            {statusF !== 'all' && (
              <button className="sfbtn" onClick={() => setStatusF('all')} title="Clear the decision filter">×</button>
            )}
          </div>
          {needle && matchCount === 0 && (
            <div className="nores">Nothing matches “{query.trim()}”.</div>
          )}
          {tradeGroups.map(({ trade, rows, subtotal }) => {
            const color = tc(trade)
            const isCollapsed = collapsed.has(trade)
            const visibleRows = rows.filter(r => r.status !== 'removed')

            return (
              <div key={trade || '__unc'} className={`grp ${dragOverTrade === trade ? 'drag-target' : ''}`} style={{ '--trade-col': color }}
                onDragEnter={() => { if (dragRef.current && (dragRef.current.trade || '') !== trade) setDragOverTrade(trade) }}
                onDragOver={e => { if (dragRef.current) e.preventDefault() }}
                onDrop={e => {
                  e.preventDefault()
                  if (!dragRef.current) return
                  const { itemId: fId, trade: sT } = dragRef.current
                  if (sT !== trade) moveAcrossTrade(fId, trade)
                  dragRef.current = null; setDragOverId(null); setDragOverTrade(null)
                }}>
                {/* Group header */}
                <div className="ghead" style={{ borderLeftColor: color }}
                  onClick={() => setCollapsed(p => { const n=new Set(p); n.has(trade)?n.delete(trade):n.add(trade); return n })}>
                  <span className="gt">{isCollapsed ? '▸' : '▾'} {trade || 'Uncategorised'}</span>
                  <span className="gr">
                    {(() => {
                      const approvedInGroup = visibleRows.filter(r => r.status === 'approved').length
                      const openQInGroup = visibleRows.filter(r => {
                        const rds = disputeMap[r.id]
                        return rds?.length > 0 && rds[rds.length - 1].author_type === 'landlord'
                      }).length
                      return (
                        <>
                          <b>{visibleRows.length} items</b> · ₹{fmt(subtotal)}
                          {approvedInGroup > 0 && <span style={{ marginLeft:8,color:'var(--good)' }}>✓ {approvedInGroup}/{visibleRows.length}</span>}
                          {openQInGroup > 0 && <span style={{ marginLeft:8,color:'var(--amber)' }}>↩ {openQInGroup} quer{openQInGroup > 1 ? 'ies' : 'y'}</span>}
                        </>
                      )
                    })()}
                  </span>
                </div>

                {!isCollapsed && (
                  <>
                    {/* Column headers */}
                    <div className="grp-body">
                      <div className="colhead">
                        <span />
                        <span>Cond</span>
                        <span>Area · Item</span>
                        <span>Finding</span>
                        <span>Material</span>
                        <span>Labour</span>
                        <span>Qty</span>
                        <span>Total</span>
                        <span>Type</span>
                        <span>Media</span>
                        <span />
                      </div>

                      {/* Rows */}
                      {rows.map(item => {
                        if (item.status === 'removed') return null
                        const type       = uiType(item.cost_type)
                        const isActive   = item.id === pinnedId
                        const isDim      = type === 'none' || item.status === 'excluded'
                        const score      = getScore(item)
                        const ds         = disputeMap[item.id]
                        const hasDispute = ds?.length > 0
                        const lastDs     = hasDispute ? ds[ds.length - 1] : null
                        const qNeedsReply = hasDispute && lastDs?.author_type === 'landlord'
                        const isApproved  = item.status === 'approved'
                        const isQNew      = qNeedsReply && pulseIds.has(item.id)
                        const rowCls   = ['row',
                          isActive ? 'active' : '',
                          isDim ? 'dim' : '',
                          dragOverId === item.id ? 'drag-over' : '',
                          isApproved && hasDispute ? 'q-approved' : '',
                          isApproved && !hasDispute ? 's-approved' : '',
                          item.status === 'disputed' ? 's-disputed' : '',
                          qNeedsReply && !isApproved ? 'q-open' : '',
                          isQNew ? 'q-new' : '',
                        ].filter(Boolean).join(' ')
                        const media    = mediaMap[item.line_item_id] || []

                        return (
                          <div key={item.id} id={`row-${item.id}`} className={rowCls}
                            onClick={() => { setDrawerInitTab('details'); setPinnedId(p => p===item.id ? null : item.id) }}
                            onDragEnter={e => { if (dragRef.current && dragRef.current.itemId !== item.id) { e.preventDefault(); setDragOverId(item.id) } }}
                            onDragOver={e => { if (dragRef.current) e.preventDefault() }}
                            onDrop={e => {
                              e.preventDefault()
                              if (!dragRef.current || dragRef.current.itemId === item.id) { setDragOverId(null); return }
                              const { itemId: fId, trade: sT } = dragRef.current
                              const dT = item.trade || ''
                              if (sT === dT) reorderWithinGroup(sT, fId, item.id)
                              else moveAcrossTrade(fId, dT)
                              dragRef.current = null; setDragOverId(null); setDragOverTrade(null)
                            }}>
                            <div className="hnd" draggable={!needle}
                              onDragStart={e => { e.stopPropagation(); dragRef.current = { itemId: item.id, trade: item.trade || '' }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id) }}
                              onDragEnd={() => { dragRef.current = null; setDragOverId(null); setDragOverTrade(null) }}>⠿</div>
                            <div><ScoreChip score={score} /></div>
                            <div className="idn">
                              {/* Approved rides the area line, not the name
                                  line. Sharing 148px with the item name, it
                                  wrapped under long names and sat inline after
                                  short ones, so the column never held a line.
                                  It is also the quiet case — the loud ones
                                  below stay beside the name where they catch
                                  the eye. */}
                              <div className="ar">
                                <span className="ar-area">{item.area || '—'}</span>
                                {item.status === 'approved' && (
                                  <button className="spill spill-approved"
                                    onClick={e => { e.stopPropagation(); setDrawerInitTab(hasDispute ? 'thread' : 'details'); setPinnedId(item.id) }}>
                                    ✓ Approved
                                  </button>
                                )}
                              </div>
                              <div className="it">
                                <span className="itname">{item.item_name || '—'}</span>
                                {item.status === 'disputed' && (
                                  <button className="spill spill-disputed"
                                    onClick={e => { e.stopPropagation(); setDrawerInitTab(hasDispute ? 'thread' : 'details'); setPinnedId(item.id) }}>
                                    ✕ Disputed
                                  </button>
                                )}
                                {item.status === 'excluded' && <span className="spill spill-excluded">excluded</span>}
                                {(() => {
                                  if (!hasDispute) return null
                                  const firstReason = ds[0]?.reason_tag
                                  const shortTag = REASON_SHORT[firstReason] || firstReason || 'query'
                                  // The thread chip now says only what the thread
                                  // is doing; the decision is the pill beside it.
                                  if (isApproved && !qNeedsReply) return null
                                  const decided = item.status === 'approved' || item.status === 'disputed'
                                  return (
                                    <button
                                      className={qNeedsReply ? 'qchip qchip-open' : 'qchip qchip-done'}
                                      title={qNeedsReply ? `Query · ${shortTag}` : 'Replied'}
                                      onClick={e => { e.stopPropagation(); setDrawerInitTab('thread'); setPinnedId(item.id) }}
                                    >
                                      {qNeedsReply ? (decided ? '● Query' : `● Query · ${shortTag}`) : '↩ replied'}
                                    </button>
                                  )
                                })()}
                              </div>
                            </div>
                            <div className="fnd">
                              <div className="fnd-txt">{item.issue_description}</div>
                              {item.action && <span className="wd">→ {item.action}</span>}
                            </div>
                            <div>{mcell(item)}</div>
                            <div>{lcell(item)}</div>
                            <div><span className="num">{item.qty || 1}</span></div>
                            <div>{tcell(item)}</div>
                            <TypeSeg type={type} onSet={t => updateItem(item.id, { cost_type: dbType(t) })} />
                            <MediaCell
                              media={media}
                              onOpen={() => setPinnedId(p => p===item.id ? null : item.id)}
                            />
                            <div>
                              <button className="kb"
                                onClick={e => {
                                  e.stopPropagation()
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setCtxMenu({ itemId:item.id, status:item.status, trade:item.trade||'', x:rect.right-148, y:rect.bottom+4 })
                                }}>⋯</button>
                            </div>
                          </div>
                        )
                      })}

                      {/* Add item */}
                      <div className="addrow" onClick={e => { e.stopPropagation(); setRateDrawerOpen(true) }}>+ Add item</div>
                    </div>
                  </>
                )}
              </div>
            )
          })}

          {tradeGroups.length === 0 && (
            <div style={{ padding:'60px 0',textAlign:'center',color:'var(--muted)',fontFamily:'var(--mono)',fontSize:12 }}>
              No items yet.{' '}
              <span style={{ color:'var(--gold)',cursor:'pointer' }} onClick={() => setRateDrawerOpen(true)}>+ Add item</span>
            </div>
          )}
        </main>
      </div>

      {/* Drawer scrim (mobile) */}
      {panelOpen && <div className="drw-scrim" onClick={() => setPinnedId(null)} />}

      {/* Detail drawer */}
      <aside className={`dwr ${panelOpen ? 'show' : ''}`}>
        {drawerItem && (
          <ItemDrawer
            key={pinnedId}
            key={drawerItem.id}
            item={drawerItem}
            media={mediaMap[drawerItem.line_item_id] || []}
            allItems={navigable}
            itemIndex={drawerIdx}
            onClose={() => setPinnedId(null)}
            onNavigate={navigateDrawer}
            onUpdate={isLocked ? () => {} : updateItem}
            onAddMedia={isLocked ? () => {} : files => handleAddMedia(drawerItem.line_item_id, files)}
            onAddProofVideo={isLocked ? () => {} : file => handleAddProofVideo(drawerItem.line_item_id, file)}
            onDeleteMedia={isLocked ? () => {} : handleDeleteMedia}
            onReplaceMedia={isLocked ? () => {} : handleReplaceMedia}
            onSetPrimary={isLocked ? () => {} : m => handleSetPrimary(drawerItem.line_item_id, m)}
            onOpenLightbox={idx => setLightbox({ urls:(mediaMap[drawerItem.line_item_id]||[]).map(m=>m.url), idx })}
            userEmail={userEmail}
            estimateId={id}
            readOnly={isLocked}
            initTab={drawerInitTab}
            disputes={disputeMap[drawerItem.id] || []}
          />
        )}
      </aside>

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div style={{ position:'fixed',inset:0,zIndex:599 }} onClick={() => setCtxMenu(null)} />
          <div className="ctx-menu" style={{ left:ctxMenu.x, top:ctxMenu.y }}>
            <button className="ctx-item" onClick={() => { duplicateItem(ctxMenu.itemId); setCtxMenu(null) }}>Duplicate</button>
            <button className="ctx-item"
              onClick={() => { const it=items.find(i=>i.id===ctxMenu.itemId); updateItem(ctxMenu.itemId,{status:it?.status==='excluded'?'pending':'excluded'}); setCtxMenu(null) }}
              style={{ color:ctxMenu.status==='excluded'?'var(--ink2)':'var(--muted)' }}>
              {ctxMenu.status === 'excluded' ? 'Restore' : 'Exclude'}
            </button>
            {ctxMenu.status === 'removed'
              ? <button className="ctx-item" style={{ color:'var(--teal)' }} onClick={() => { restoreItem(ctxMenu.itemId); setCtxMenu(null) }}>Restore</button>
              : <button className="ctx-item" style={{ color:'var(--clay)' }} onClick={() => { removeItem(ctxMenu.itemId); setCtxMenu(null) }}>Remove</button>
            }
            {tradeGroups.filter(g => g.trade !== ctxMenu.trade).length > 0 && (
              <>
                <div style={{ padding:'5px 13px 2px',fontSize:9,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--faint)',fontFamily:'var(--mono)',borderTop:'1px solid var(--line)',marginTop:2 }}>Move to trade</div>
                {tradeGroups.filter(g => g.trade !== ctxMenu.trade).map(g => (
                  <button key={g.trade||'__unc'} className="ctx-item" style={{ paddingLeft:20 }}
                    onClick={() => { moveAcrossTrade(ctxMenu.itemId, g.trade); setCtxMenu(null) }}>
                    → {g.trade || 'Uncategorised'}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* Rate drawer */}
      <RateDrawer open={rateDrawerOpen} onClose={() => setRateDrawerOpen(false)} onSelectMaterial={handleSelectMaterial} onSelectLabour={handleSelectLabour} />

      {/* Lightbox */}
      {lightbox && lightbox.urls.length > 0 && (
        <MediaLightbox urls={lightbox.urls} idx={lightbox.idx} onClose={() => setLightbox(null)} />
      )}

      {/* Hint bar */}
      <div className="hint">
        Click row · <kbd>↑</kbd><kbd>↓</kbd> navigate · drag <kbd>⠿</kbd> reorder · <kbd>Alt</kbd>+<kbd>↑↓</kbd> move within group ·{' '}
        <kbd>P</kbd><kbd>A</kbd><kbd>N</kbd> type · <kbd>E</kbd> exclude · <kbd>Esc</kbd> close
      </div>
    </div>
  )
}

export default function EstimateWorkbench() {
  return (
    <WbErrorBoundary>
      <EstimateWorkbenchInner />
    </WbErrorBoundary>
  )
}
