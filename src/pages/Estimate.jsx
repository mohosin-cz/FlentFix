import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateEstimate, resolveInspectionWithData } from '../utils/generateEstimate'
import DisputeThread from '../components/DisputeThread'
import { useIsMobile } from '../hooks/useIsMobile'
import LogoSpinner from '../components/LogoSpinner'

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_COLUMNS = new Set([
  'issue_description', 'item_name', 'area', 'trade',
  'material_description', 'material_cost', 'labour_description', 'labour_cost',
  'qty', 'cost_type', 'status', 'sort_order',
])

const TRADE_COLORS = {
  electrical:    '#4a9eff',
  plumbing:      '#4dd9c0',
  carpentry:     '#c8963e',
  painting:      '#a78bfa',
  civil:         '#f87171',
  cleaning:      '#86efac',
  hvac:          '#67e8f9',
  flooring:      '#fbbf24',
  masonry:       '#fb923c',
  waterproofing: '#38bdf8',
}

const EST_STATUS_COLOR = {
  draft:              '#9898a4',
  sent:               '#4a9eff',
  viewed:             '#c8963e',
  partially_approved: '#f0a050',
  approved:           '#4dd9c0',
  rejected:           '#f87171',
}

const ITEM_STATUS_COLOR = {
  pending:  '#9898a4',
  approved: '#4dd9c0',
  disputed: '#f0a050',
  removed:  '#f87171',
  resolved: '#86efac',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

function lineTot(item) {
  if (item.status === 'removed' || item.cost_type === 'nil' || item.cost_type === 'actuals') return 0
  return (item.material_cost || 0) + (item.labour_cost || 0)
}

function tc(t) { return TRADE_COLORS[(t || '').toLowerCase()] || '#9394a8' }

function invPrice(r) {
  if (r.flent_price)  return r.flent_price
  if (r.market_price) return r.market_price
  return Math.round((parseFloat(r.price_inc) || 0) * (1 + (r.margin_percent || 0) / 100))
}

function maxSort(items) {
  return items.length > 0 ? Math.max(...items.map(i => i.sort_order || 0)) : 0
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
.wb-toolbar {
  position: sticky; top: 0; z-index: 40;
  height: 52px; display: flex; align-items: center; gap: 10px;
  padding: 0 16px;
  background: var(--bg-panel, #1e2028);
  border-bottom: 1px solid var(--border, #2e3040);
}
.wb-toolbar-left  { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; overflow: hidden; }
.wb-toolbar-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.wb-back-btn {
  width: 32px; height: 32px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-input, #252731); border: 1px solid var(--border, #2e3040);
  border-radius: 6px; color: var(--text-dim, #9394a8); cursor: pointer;
}
.wb-pid { font-family: var(--font-mono, monospace); font-size: 13px; font-weight: 600; color: var(--text, #e8e8f0); white-space: nowrap; }
.wb-ver { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--text-muted, #6b6d82); white-space: nowrap; }
.wb-schip {
  font-size: 9px; padding: 2px 8px; border-radius: 100px;
  font-family: var(--font-mono, monospace); font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; flex-shrink: 0;
}
.wb-totals {
  display: flex; align-items: center; gap: 8px; padding: 0 10px;
  border-left: 1px solid var(--border, #2e3040); flex-shrink: 0;
}
.wb-tval { font-family: var(--font-mono, monospace); font-size: 14px; font-weight: 700; color: var(--accent, #c8963e); }
.wb-tcnt { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--text-muted, #6b6d82); }
.wb-tbtn {
  height: 30px; padding: 0 10px; border-radius: 5px;
  font-size: 11px; font-weight: 600; cursor: pointer;
  font-family: var(--font-mono, monospace); white-space: nowrap;
  display: flex; align-items: center; gap: 4px;
}
.wb-outline { background: none; border: 1px solid var(--border, #2e3040); color: var(--text-muted, #6b6d82); }
.wb-outline:hover { border-color: var(--text-dim, #9394a8); color: var(--text, #e8e8f0); }
.wb-accent { background: var(--accent, #c8963e); border: none; color: #000; }
.wb-accent:hover { opacity: 0.88; }

.wb-content { max-width: 1280px; margin: 0 auto; padding: 16px 16px 100px; }

.wb-more-btn { opacity: 0; transition: opacity 0.1s; }
tr:hover .wb-more-btn { opacity: 1; }
.wb-more-btn:hover { background: rgba(255,255,255,0.07) !important; color: var(--text, #e8e8f0) !important; }

.wb-cost-wrap:hover .wb-swap-btn { opacity: 1 !important; }
.wb-swap-btn:hover { background: rgba(255,255,255,0.07) !important; color: var(--accent, #c8963e) !important; }

.wb-row { transition: background 0.08s; }
.wb-row:hover { background: rgba(255,255,255,0.018) !important; }

@media (max-width: 640px) {
  .wb-toolbar { padding: 0 10px; gap: 6px; }
  .wb-ver { display: none; }
  .wb-totals { padding: 0 8px; }
  .wb-tval { font-size: 13px; }
  .wb-content { padding: 10px 10px 110px; }
}
.wb-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
@media (max-width: 640px) { .wb-media-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); } }
`

// ─── MediaLightbox ───────────────────────────────────────────────────────────

function MediaLightbox({ urls, idx, onClose }) {
  const [cur, setCur] = useState(idx)
  useEffect(() => {
    function handle(e) {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowRight')  setCur(i => Math.min(i + 1, urls.length - 1))
      if (e.key === 'ArrowLeft')   setCur(i => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [urls.length, onClose])
  const url   = urls[cur]
  const isVid = /\.(mp4|mov|webm)$/i.test(url)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <button onClick={onClose} style={{ position: 'fixed', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9901 }}>×</button>
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: '92vw' }}>
        {isVid
          ? <video src={url} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 6 }} />
          : <img src={url} alt="" style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 6 }} />
        }
        {urls.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={e => { e.stopPropagation(); setCur(i => Math.max(i - 1, 0)) }} disabled={cur === 0} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: cur === 0 ? 'default' : 'pointer', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: cur === 0 ? 0.3 : 1 }}>‹</button>
            <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'var(--font-mono, monospace)' }}>{cur + 1} / {urls.length}</span>
            <button onClick={e => { e.stopPropagation(); setCur(i => Math.min(i + 1, urls.length - 1)) }} disabled={cur === urls.length - 1} style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: cur === urls.length - 1 ? 'default' : 'pointer', color: '#fff', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: cur === urls.length - 1 ? 0.3 : 1 }}>›</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MediaStrip (compact in-row thumbnail) ────────────────────────────────────

function MediaStrip({ media = [], onOpenPanel, onOpenLightbox }) {
  const isVid  = m => m.type === 'video' || /\.(mp4|mov|webm)$/i.test(m.url)
  const photos = media.filter(m => !isVid(m))
  const videos = media.filter(m =>  isVid(m))
  const first  = media[0]
  if (!first) {
    return (
      <div onClick={e => { e.stopPropagation(); onOpenPanel() }} style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#3a3c4e', fontSize: 10, fontFamily: 'var(--font-mono, monospace)', userSelect: 'none' }}>
        + add
      </div>
    )
  }
  return (
    <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 5, padding: '0 3px' }}>
      <div
        onClick={e => { e.stopPropagation(); onOpenLightbox(0) }}
        style={{ width: 42, height: 30, borderRadius: 3, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {isVid(first)
          ? <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>▶</span>
          : <img src={first.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
        }
      </div>
      <div onClick={e => { e.stopPropagation(); onOpenPanel() }} style={{ display: 'flex', flexDirection: 'column', gap: 1, cursor: 'pointer', minWidth: 0 }}>
        {photos.length > 0 && <span style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.3, whiteSpace: 'nowrap' }}>▤ {photos.length}</span>}
        {videos.length > 0 && <span style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', lineHeight: 1.3, whiteSpace: 'nowrap' }}>▶ {videos.length}</span>}
      </div>
    </div>
  )
}

// ─── MediaPanel (bottom-sheet media manager) ─────────────────────────────────

function MediaPanel({ item, media, onClose, onAddMedia, onDeleteMedia, onReplaceMedia, onSetPrimary, onOpenLightbox }) {
  const addRef     = useRef(null)
  const replaceRef = useRef(null)
  const [replaceTarget, setReplaceTarget] = useState(null)
  const [uploading, setUploading]         = useState(false)

  async function handleAdd(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    e.target.value = ''
    setUploading(true)
    await onAddMedia(files)
    setUploading(false)
  }

  async function handleReplace(e) {
    const file = e.target.files?.[0]
    if (!file || !replaceTarget) return
    e.target.value = ''
    setUploading(true)
    await onReplaceMedia(replaceTarget, file)
    setReplaceTarget(null)
    setUploading(false)
  }

  const isVid = m => m.type === 'video' || /\.(mp4|mov|webm)$/i.test(m.url)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 800 }} />
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '88vh', background: 'var(--bg-panel, #1e2028)', borderRadius: '14px 14px 0 0', border: '1px solid var(--border, #2e3040)', zIndex: 801, display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{item.item_name || 'Item'} — Media</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>
              {media.length} file{media.length !== 1 ? 's' : ''}{item.area ? ` · ${item.area}` : ''}
              {!item.line_item_id && <span style={{ color: '#f0a050', marginLeft: 6 }}>· inspection link required for media</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #6b6d82)', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px 28px', overflowY: 'auto', flex: 1 }}>
          {/* Hidden file inputs */}
          <input ref={addRef}     type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={handleAdd} />
          <input ref={replaceRef} type="file" accept="image/*,video/*"          style={{ display: 'none' }} onChange={handleReplace} />

          {/* Add button */}
          {item.line_item_id && (
            <button
              onClick={() => addRef.current?.click()}
              disabled={uploading}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', marginBottom: 16, minHeight: 44, border: `1px dashed ${uploading ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, borderRadius: 8, background: uploading ? 'rgba(200,150,62,0.06)' : 'none', fontSize: 13, color: uploading ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', cursor: uploading ? 'wait' : 'pointer', fontFamily: 'inherit' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 11v2a1 1 0 001 1h12a1 1 0 001-1v-2M8 1v9M5 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {uploading ? 'Uploading…' : '+ Add photos / videos'}
            </button>
          )}

          {/* Grid */}
          {media.length === 0 ? (
            <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>
              {item.line_item_id ? 'No media yet — add photos or videos above.' : 'This item was added manually and cannot have inspection media attached.'}
            </div>
          ) : (
            <div className="wb-media-grid">
              {media.map((m, idx) => {
                const isPrimary = idx === 0
                const vid       = isVid(m)
                return (
                  <div key={m.id} style={{ borderRadius: 8, overflow: 'hidden', background: '#0d0e14', border: `2px solid ${isPrimary ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}` }}>
                    {/* Thumb */}
                    <div onClick={() => onOpenLightbox(idx)} style={{ width: '100%', paddingTop: '72%', position: 'relative', cursor: 'pointer' }}>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {vid
                          ? <span style={{ color: '#fff', fontSize: 28, lineHeight: 1 }}>▶</span>
                          : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                        }
                      </div>
                      {isPrimary && (
                        <div style={{ position: 'absolute', top: 5, left: 5, fontSize: 8, padding: '2px 6px', borderRadius: 3, background: 'var(--accent, #c8963e)', color: '#000', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, letterSpacing: '0.06em' }}>PRIMARY</div>
                      )}
                      {vid && (
                        <div style={{ position: 'absolute', top: 5, right: 5, fontSize: 8, padding: '2px 5px', borderRadius: 3, background: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: 'var(--font-mono, monospace)' }}>VIDEO</div>
                      )}
                    </div>
                    {/* Actions */}
                    <div style={{ padding: '6px 6px 8px', display: 'flex', gap: 4 }}>
                      {!isPrimary && media.length > 1 && (
                        <button
                          onClick={() => onSetPrimary(m)}
                          style={{ flex: 1, padding: '7px 0', minHeight: 36, background: 'none', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 4, fontSize: 9, cursor: 'pointer', color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}
                        >★ Primary</button>
                      )}
                      <button
                        onClick={() => { setReplaceTarget(m); setTimeout(() => replaceRef.current?.click(), 50) }}
                        style={{ flex: 1, padding: '7px 0', minHeight: 36, background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, fontSize: 9, cursor: 'pointer', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}
                      >⇄ Swap</button>
                      <button
                        onClick={() => onDeleteMedia(m)}
                        style={{ flex: isPrimary || media.length === 1 ? '0 0 auto' : 1, padding: '7px 8px', minHeight: 36, background: 'none', border: '1px solid rgba(248,113,113,0.35)', borderRadius: 4, fontSize: 9, cursor: 'pointer', color: '#f87171', fontFamily: 'var(--font-mono, monospace)' }}
                      >× Del</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── RateDrawer ───────────────────────────────────────────────────────────────

function RateDrawer({ open, mode, onClose, onSelectMaterial, onSelectLabour, isMobile }) {
  const [tab, setTab]             = useState('materials')
  const [search, setSearch]       = useState('')
  const [tradeF, setTradeF]       = useState('all')
  const [matRows, setMatRows]     = useState([])
  const [labRows, setLabRows]     = useState([])
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    if (!open) return
    setSearch('')
    setTradeF('all')
    if (mode === 'swap-labour') setTab('labour')
    else setTab('materials')
  }, [open, mode])

  useEffect(() => {
    if (!open || tab !== 'materials') return
    const t = setTimeout(async () => {
      setLoading(true)
      let q = supabase.from('inventory_items')
        .select('fxin,item_name,spec,size,trade,flent_price,market_price,price_inc,margin_percent,quantity_remaining')
        .limit(40)
      if (search.trim()) q = q.ilike('item_name', `%${search.trim()}%`)
      if (tradeF !== 'all') q = q.eq('trade', tradeF)
      const { data } = await q.order('item_name')
      setMatRows(data || [])
      setLoading(false)
    }, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [open, tab, search, tradeF])

  useEffect(() => {
    if (!open || tab !== 'labour') return
    const t = setTimeout(async () => {
      setLoading(true)
      let q = supabase.from('labour_rates').select('id,trade,work_type,cost_per_unit,unit').limit(50)
      if (search.trim()) q = q.ilike('work_type', `%${search.trim()}%`)
      if (tradeF !== 'all') q = q.eq('trade', tradeF)
      const { data } = await q.order('trade')
      setLabRows(data || [])
      setLoading(false)
    }, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [open, tab, search, tradeF])

  if (!open) return null

  const drawerW = isMobile ? '100%' : 380
  const title   = mode === 'swap-material' ? 'Swap Material' : mode === 'swap-labour' ? 'Swap Labour' : 'Add Item'
  const rows    = tab === 'materials' ? matRows : labRows

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 500 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: drawerW,
        background: 'var(--bg-panel, #1e2028)', borderLeft: '1px solid var(--border, #2e3040)',
        zIndex: 501, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 14px 0', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{title}</span>
            <button onClick={onClose} style={{ width: 28, height: 28, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #6b6d82)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: 'flex' }}>
            {['materials', 'labour'].map(t => (
              <button key={t} onClick={() => { setTab(t); setSearch('') }}
                style={{ padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono, monospace)', textTransform: 'capitalize', borderBottom: tab === t ? '2px solid var(--accent, #c8963e)' : '2px solid transparent', color: tab === t ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)' }}
              >{t}</button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'materials' ? 'Search by name or FXIN…' : 'Search labour…'}
            style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text, #e8e8f0)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box' }}
          />
          <select value={tradeF} onChange={e => setTradeF(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: tradeF === 'all' ? 'var(--text-muted, #6b6d82)' : 'var(--text, #e8e8f0)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
          >
            <option value="all">All trades</option>
            {Object.keys(TRADE_COLORS).map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>Loading…</div>}
          {!loading && rows.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>
              {search ? 'No results' : `Type to search ${tab}`}
            </div>
          )}
          {!loading && tab === 'materials' && matRows.map(r => {
            const price = invPrice(r)
            return (
              <div key={r.fxin || r.item_name}
                onClick={() => onSelectMaterial(r)}
                style={{ padding: '9px 12px', borderBottom: '1px solid var(--border, #2e3040)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                    {r.fxin && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', background: 'rgba(200,150,62,0.12)', padding: '1px 5px', borderRadius: 3 }}>{r.fxin}</span>}
                    {r.trade && <span style={{ fontSize: 9, color: tc(r.trade), textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.trade}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.item_name}{r.spec ? ` · ${r.spec}` : ''}{r.size ? ` · ${r.size}` : ''}
                  </div>
                  {r.quantity_remaining != null && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 1 }}>{r.quantity_remaining} in stock</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>₹{fmt(price)}</div>
                </div>
              </div>
            )
          })}
          {!loading && tab === 'labour' && labRows.map(r => (
            <div key={r.id}
              onClick={() => onSelectLabour(r)}
              style={{ padding: '9px 12px', borderBottom: '1px solid var(--border, #2e3040)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: tc(r.trade), textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{r.trade}</div>
                <div style={{ fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{r.work_type}</div>
                {r.unit && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 1 }}>per {r.unit}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>₹{fmt(r.cost_per_unit)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Blank row shortcut (add mode only) */}
        {mode === 'add' && (
          <div style={{ padding: '9px 12px', borderTop: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
            <button
              onClick={() => onSelectMaterial(null)}
              style={{ width: '100%', padding: '8px 0', background: 'none', border: '1px dashed var(--border, #2e3040)', borderRadius: 5, fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
            >+ Add blank row</button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EstimateWorkbench() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const isMobile     = useIsMobile()

  // Data
  const [estimate, setEstimate]     = useState(null)
  const [items, setItems]           = useState([])
  const [inspection, setInspection] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [userEmail, setUserEmail]   = useState(null)
  const [versionCount, setVersionCount] = useState(1)

  // Inline editing
  const [editingCell, setEditingCell] = useState(null)  // { itemId, field }
  const [cellDraft, setCellDraft]     = useState('')

  // Drawer
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [drawerMode, setDrawerMode]     = useState('add')
  const [drawerTarget, setDrawerTarget] = useState(null)

  // UI
  const [collapsed, setCollapsed]         = useState(new Set())
  const [openMenu, setOpenMenu]           = useState(null)   // { itemId, status, x, y }
  const [notesEditing, setNotesEditing]   = useState(false)
  const [notesDraft, setNotesDraft]       = useState('')
  const [savingNotes, setSavingNotes]     = useState(false)
  const [generating, setGenerating]       = useState(false)
  const [copied, setCopied]               = useState(false)
  const [moreOpen, setMoreOpen]           = useState(false)
  const [mediaMap, setMediaMap]           = useState({}) // { [lineItemId]: [{id,url,type}] }
  const [mediaPanel, setMediaPanel]       = useState(null) // estimate_items row | null
  const [lightbox, setLightbox]           = useState(null) // { urls, idx } | null

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    const [{ data: { user } }, { data: est }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('estimates').select('id,pid,inspection_id,status,notes,share_token,created_at,created_by,inspector_name,approved_by_name').eq('id', id).maybeSingle(),
    ])
    setUserEmail(user?.email || null)
    if (!est) { setError('Estimate not found'); setLoading(false); return }
    setEstimate(est)
    setNotesDraft(est.notes || '')

    const [itemsRes, inspRes, { count }] = await Promise.all([
      supabase.from('estimate_items').select('*').eq('estimate_id', id).order('sort_order'),
      supabase.from('inspections').select('id,pid,house_type,inspection_date').eq('id', est.inspection_id).maybeSingle(),
      supabase.from('estimates').select('id', { count: 'exact', head: true }).eq('pid', est.pid),
    ])
    const fetchedItems = itemsRes.data || []
    setItems(fetchedItems)
    setInspection(inspRes.data || null)
    setVersionCount(count || 1)
    setLoading(false)
    loadMedia(fetchedItems)
  }

  async function loadMedia(itemsList) {
    const lineItemIds = (itemsList || items).map(i => i.line_item_id).filter(Boolean)
    if (!lineItemIds.length) { setMediaMap({}); return }
    const { data } = await supabase
      .from('line_item_media')
      .select('id, line_item_id, url, type')
      .in('line_item_id', lineItemIds)
      .order('id', { ascending: true })
    if (data) {
      const map = {}
      data.forEach(m => { if (!map[m.line_item_id]) map[m.line_item_id] = []; map[m.line_item_id].push(m) })
      setMediaMap(map)
    }
  }

  function updateMediaList(lineItemId, updater) {
    setMediaMap(prev => ({ ...prev, [lineItemId]: updater(prev[lineItemId] || []) }))
  }

  async function handleAddMedia(lineItemId, files) {
    for (const file of files) {
      const ext  = file.name.split('.').pop()
      const path = `workbench/${lineItemId}/${Date.now()}.${ext}`
      const { data: uploaded, error } = await supabase.storage.from('inspection-media').upload(path, file, { upsert: true })
      if (error) continue
      const { data: { publicUrl } } = supabase.storage.from('inspection-media').getPublicUrl(uploaded.path)
      const type = file.type.startsWith('video') ? 'video' : 'image'
      const { data: row } = await supabase.from('line_item_media').insert({ line_item_id: lineItemId, url: publicUrl, type }).select().single()
      if (row) updateMediaList(lineItemId, prev => [...prev, row])
    }
  }

  async function handleDeleteMedia(m) {
    if (!window.confirm('Delete this media file?')) return
    await supabase.from('line_item_media').delete().eq('id', m.id)
    const storagePath = m.url.split('/object/public/inspection-media/')[1]
    if (storagePath) await supabase.storage.from('inspection-media').remove([decodeURIComponent(storagePath)])
    updateMediaList(m.line_item_id, prev => prev.filter(x => x.id !== m.id))
  }

  async function handleReplaceMedia(m, file) {
    const ext  = file.name.split('.').pop()
    const path = `workbench/${m.line_item_id}/${Date.now()}.${ext}`
    const { data: uploaded, error } = await supabase.storage.from('inspection-media').upload(path, file, { upsert: true })
    if (error) return
    const { data: { publicUrl } } = supabase.storage.from('inspection-media').getPublicUrl(uploaded.path)
    const type = file.type.startsWith('video') ? 'video' : 'image'
    await supabase.from('line_item_media').update({ url: publicUrl, type }).eq('id', m.id)
    const storagePath = m.url.split('/object/public/inspection-media/')[1]
    if (storagePath) await supabase.storage.from('inspection-media').remove([decodeURIComponent(storagePath)])
    updateMediaList(m.line_item_id, prev => prev.map(x => x.id === m.id ? { ...x, url: publicUrl, type } : x))
  }

  async function handleSetPrimary(lineItemId, targetMedia) {
    const list = mediaMap[lineItemId] || []
    if (list.length < 2) return
    const primary = list[0]
    if (primary.id === targetMedia.id) return
    await Promise.all([
      supabase.from('line_item_media').update({ url: targetMedia.url, type: targetMedia.type }).eq('id', primary.id),
      supabase.from('line_item_media').update({ url: primary.url,    type: primary.type    }).eq('id', targetMedia.id),
    ])
    updateMediaList(lineItemId, prev => prev.map(x => {
      if (x.id === primary.id)     return { ...x, url: targetMedia.url, type: targetMedia.type }
      if (x.id === targetMedia.id) return { ...x, url: primary.url,    type: primary.type    }
      return x
    }))
  }

  // Derived
  const tradeGroups = useMemo(() => {
    const map = {}
    for (const item of items) {
      const t = item.trade || 'Other'
      if (!map[t]) map[t] = []
      map[t].push(item)
    }
    return Object.entries(map).map(([trade, rows]) => ({
      trade,
      rows: [...rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      total:       rows.reduce((s, i) => s + lineTot(i), 0),
      activeCount: rows.filter(i => i.status !== 'removed').length,
    }))
  }, [items])

  const subtotal     = useMemo(() => items.reduce((s, i) => s + lineTot(i), 0), [items])
  const activeCount  = useMemo(() => items.filter(i => i.status !== 'removed' && i.cost_type !== 'nil').length, [items])
  const disputedItems = useMemo(() => items.filter(i => i.status === 'disputed'), [items])

  // ── Inline edit ────────────────────────────────────────────────────────────

  function startEdit(itemId, field, currentValue) {
    if (!VALID_COLUMNS.has(field)) return
    setEditingCell({ itemId, field })
    setCellDraft(String(currentValue ?? ''))
  }

  async function commitEdit() {
    if (!editingCell) return
    const { itemId, field } = editingCell
    const isNum = ['material_cost', 'labour_cost', 'qty'].includes(field)
    const value = isNum ? (parseFloat(cellDraft) || 0) : cellDraft
    setEditingCell(null)
    setCellDraft('')
    const prev = items.find(i => i.id === itemId)
    if (!prev || prev[field] === value) return
    setItems(p => p.map(i => i.id === itemId ? { ...i, [field]: value } : i))
    const { error: err } = await supabase.from('estimate_items').update({ [field]: value }).eq('id', itemId)
    if (err) {
      setItems(p => p.map(i => i.id === itemId ? { ...i, [field]: prev[field] } : i))
      console.error('[commitEdit]', err.message)
      return
    }
    supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'edited', actor: userEmail, meta: { item_id: itemId, field } }).then(() => {})
  }

  function cancelEdit() { setEditingCell(null); setCellDraft('') }
  function isEditing(itemId, field) { return editingCell?.itemId === itemId && editingCell?.field === field }

  // ── Row ops ────────────────────────────────────────────────────────────────

  async function duplicateItem(itemId) {
    const orig = items.find(i => i.id === itemId)
    if (!orig) return
    const { id: _, created_at: __, ...rest } = orig
    const { data: newItem } = await supabase.from('estimate_items')
      .insert({ ...rest, sort_order: maxSort(items) + 1, status: 'pending' })
      .select().single()
    if (newItem) {
      setItems(p => [...p, newItem])
      supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'edited', actor: userEmail, meta: { action: 'duplicate', item_id: itemId } }).then(() => {})
    }
  }

  async function removeItem(itemId) {
    const prev = items.find(i => i.id === itemId)?.status
    setItems(p => p.map(i => i.id === itemId ? { ...i, status: 'removed' } : i))
    const { error: err } = await supabase.from('estimate_items').update({ status: 'removed' }).eq('id', itemId)
    if (err) setItems(p => p.map(i => i.id === itemId ? { ...i, status: prev } : i))
    else supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'edited', actor: userEmail, meta: { action: 'remove', item_id: itemId } }).then(() => {})
  }

  async function restoreItem(itemId) {
    setItems(p => p.map(i => i.id === itemId ? { ...i, status: 'pending' } : i))
    const { error: err } = await supabase.from('estimate_items').update({ status: 'pending' }).eq('id', itemId)
    if (err) setItems(p => p.map(i => i.id === itemId ? { ...i, status: 'removed' } : i))
  }

  async function setCostType(itemId, costType) {
    setItems(p => p.map(i => i.id === itemId ? { ...i, cost_type: costType } : i))
    await supabase.from('estimate_items').update({ cost_type: costType }).eq('id', itemId)
    supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'edited', actor: userEmail, meta: { item_id: itemId, field: 'cost_type', value: costType } }).then(() => {})
  }

  // ── Drawer ops ─────────────────────────────────────────────────────────────

  function openAddDrawer() { setDrawerMode('add'); setDrawerTarget(null); setDrawerOpen(true) }
  function openSwapDrawer(mode, itemId) { setDrawerMode(mode); setDrawerTarget(itemId); setDrawerOpen(true) }

  async function handleSelectMaterial(r) {
    if (drawerMode === 'add') {
      const price = r ? invPrice(r) : 0
      const row = {
        estimate_id: id,
        sort_order: maxSort(items) + 1,
        trade: r?.trade || '',
        item_name: r?.item_name || '',
        area: '',
        issue_description: '',
        material_description: r ? `${r.item_name}${r.spec ? ` · ${r.spec}` : ''}${r.size ? ` · ${r.size}` : ''}` : '',
        material_cost: price,
        labour_description: '',
        labour_cost: 0,
        qty: 1,
        cost_type: 'priced',
        status: 'pending',
      }
      const { data: newItem } = await supabase.from('estimate_items').insert(row).select().single()
      if (newItem) {
        setItems(p => [...p, newItem])
        supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'edited', actor: userEmail, meta: { action: 'add_material', fxin: r?.fxin } }).then(() => {})
      }
    } else if (drawerMode === 'swap-material' && drawerTarget && r) {
      const price = invPrice(r)
      const desc  = `${r.item_name}${r.spec ? ` · ${r.spec}` : ''}${r.size ? ` · ${r.size}` : ''}`
      setItems(p => p.map(i => i.id === drawerTarget ? { ...i, material_description: desc, material_cost: price } : i))
      await supabase.from('estimate_items').update({ material_description: desc, material_cost: price }).eq('id', drawerTarget)
      supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'edited', actor: userEmail, meta: { action: 'swap_material', item_id: drawerTarget } }).then(() => {})
    }
    setDrawerOpen(false)
  }

  async function handleSelectLabour(r) {
    if (!r) return
    if (drawerMode === 'add') {
      const row = {
        estimate_id: id,
        sort_order: maxSort(items) + 1,
        trade: r.trade || '',
        item_name: r.work_type || '',
        area: '',
        issue_description: '',
        material_description: '',
        material_cost: 0,
        labour_description: `${r.work_type}${r.unit ? ` · per ${r.unit}` : ''}`,
        labour_cost: r.cost_per_unit || 0,
        qty: 1,
        cost_type: 'priced',
        status: 'pending',
      }
      const { data: newItem } = await supabase.from('estimate_items').insert(row).select().single()
      if (newItem) {
        setItems(p => [...p, newItem])
        supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'edited', actor: userEmail, meta: { action: 'add_labour', labour_id: r.id } }).then(() => {})
      }
    } else if (drawerMode === 'swap-labour' && drawerTarget) {
      const desc = `${r.work_type}${r.unit ? ` · per ${r.unit}` : ''}`
      setItems(p => p.map(i => i.id === drawerTarget ? { ...i, labour_description: desc, labour_cost: r.cost_per_unit || 0 } : i))
      await supabase.from('estimate_items').update({ labour_description: desc, labour_cost: r.cost_per_unit || 0 }).eq('id', drawerTarget)
      supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'edited', actor: userEmail, meta: { action: 'swap_labour', item_id: drawerTarget } }).then(() => {})
    }
    setDrawerOpen(false)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async function saveNotes() {
    setSavingNotes(true)
    await supabase.from('estimates').update({ notes: notesDraft }).eq('id', id)
    setEstimate(p => ({ ...p, notes: notesDraft }))
    setNotesEditing(false)
    setSavingNotes(false)
  }

  // ── Regenerate ─────────────────────────────────────────────────────────────

  async function handleRegenerate() {
    if (!window.confirm('Regenerate will replace all items from the inspection, discarding manual edits. Continue?')) return
    setGenerating(true)
    const inspId = estimate?.inspection_id || await resolveInspectionWithData(estimate?.pid)
    if (!inspId) { setGenerating(false); return }
    await generateEstimate(inspId, estimate?.pid, userEmail)
    await loadData()
    setGenerating(false)
  }

  // ── Share ──────────────────────────────────────────────────────────────────

  async function handleCopy(markSent = false) {
    const shareUrl = estimate?.share_token
      ? `${window.location.origin}/e/${estimate.share_token}`
      : `${window.location.origin}/estimate/${id}`
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const ta = document.createElement('textarea')
        ta.value = shareUrl; ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta); ta.focus(); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta)
      }
    } catch (_) {}
    if (markSent && estimate?.status === 'draft') {
      await supabase.from('estimates').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id)
      await supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'sent', actor: userEmail })
      setEstimate(p => ({ ...p, status: 'sent' }))
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  // ─── Early returns ────────────────────────────────────────────────────────

  if (loading) return <LogoSpinner full />
  if (error) return (
    <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #16171f)', color: '#f87171', fontFamily: 'var(--font-mono, monospace)', fontSize: 13 }}>{error}</div>
  )

  const pid         = estimate?.pid || ''
  const status      = estimate?.status || 'draft'
  const statusColor = EST_STATUS_COLOR[status] || '#9898a4'
  const shareUrl    = estimate?.share_token ? `${window.location.origin}/e/${estimate.share_token}` : null

  // ─── Render helpers ───────────────────────────────────────────────────────

  function cellInput(itemId, field, mono = false, type = 'text') {
    return (
      <input
        autoFocus
        type={type}
        value={cellDraft}
        onChange={e => setCellDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); e.stopPropagation() }}
        onClick={e => e.stopPropagation()}
        style={{
          display: 'block', width: '100%', height: 36, padding: '0 8px',
          background: 'var(--bg-input, #252731)', border: '1px solid var(--accent, #c8963e)',
          borderRadius: 0, color: 'var(--text, #e8e8f0)', fontSize: 13, outline: 'none',
          fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
        }}
      />
    )
  }

  function renderTextCell(item, field, mono = false, dimmed = false) {
    const val        = item[field] ?? ''
    const isRemoved  = item.status === 'removed'
    if (isEditing(item.id, field)) {
      return <td onClick={e => e.stopPropagation()} style={{ padding: 0 }}>{cellInput(item.id, field, mono)}</td>
    }
    return (
      <td
        onClick={e => { e.stopPropagation(); startEdit(item.id, field, val) }}
        style={{ cursor: 'text', padding: 0 }}
      >
        <div style={{ padding: '0 8px', height: 36, display: 'flex', alignItems: 'center' }}>
          <span style={{
            fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: mono ? 'var(--font-mono, monospace)' : 'inherit',
            color: val ? (dimmed ? 'var(--text-muted, #6b6d82)' : 'var(--text, #e8e8f0)') : '#3a3c4e',
            textDecoration: isRemoved ? 'line-through' : 'none',
            opacity: isRemoved ? 0.5 : 1,
          }}>{val || '—'}</span>
        </div>
      </td>
    )
  }

  function renderCostCell(item, descField, costField, label) {
    const desc       = item[descField] || ''
    const cost       = item[costField] || 0
    const isRemoved  = item.status === 'removed'
    const editDesc   = isEditing(item.id, descField)
    const editCost   = isEditing(item.id, costField)
    const isSwapMat  = costField === 'material_cost'

    return (
      <td style={{ padding: 0 }}>
        <div className="wb-cost-wrap" style={{ padding: '3px 6px 3px 8px', minHeight: 36, opacity: isRemoved ? 0.45 : 1 }}>
          {/* Description row */}
          {editDesc ? (
            <input autoFocus value={cellDraft} onChange={e => setCellDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); e.stopPropagation() }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', height: 17, padding: '0 4px', background: 'var(--bg-input, #252731)', border: '1px solid var(--accent, #c8963e)', borderRadius: 2, color: 'var(--text, #e8e8f0)', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 17 }}>
              <span
                onClick={e => { e.stopPropagation(); startEdit(item.id, descField, desc) }}
                style={{ fontSize: 11, color: desc ? 'var(--text-muted, #6b6d82)' : '#3a3c4e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', flex: 1, lineHeight: 1 }}
              >{desc || `${label}…`}</span>
              <span
                className="wb-swap-btn"
                title={`Swap ${label.toLowerCase()}`}
                onClick={e => { e.stopPropagation(); openSwapDrawer(isSwapMat ? 'swap-material' : 'swap-labour', item.id) }}
                style={{ flexShrink: 0, width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, borderRadius: 2, cursor: 'pointer', color: 'var(--text-muted, #6b6d82)', fontSize: 10, lineHeight: 1 }}
              >⇄</span>
            </div>
          )}
          {/* Cost row */}
          {editCost ? (
            <input autoFocus type="number" value={cellDraft} onChange={e => setCellDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); e.stopPropagation() }}
              onClick={e => e.stopPropagation()}
              style={{ width: '100%', height: 17, padding: '0 4px', background: 'var(--bg-input, #252731)', border: '1px solid var(--accent, #c8963e)', borderRadius: 2, color: 'var(--text, #e8e8f0)', fontSize: 12, fontFamily: 'var(--font-mono, monospace)', outline: 'none', marginTop: 1, boxSizing: 'border-box' }}
            />
          ) : (
            <div
              onClick={e => { e.stopPropagation(); startEdit(item.id, costField, cost) }}
              style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: cost > 0 ? 'var(--text, #e8e8f0)' : '#3a3c4e', cursor: 'text', lineHeight: 1, marginTop: 1, textDecoration: isRemoved ? 'line-through' : 'none' }}
            >{cost > 0 ? `₹${fmt(cost)}` : '₹0'}</div>
          )}
        </div>
      </td>
    )
  }

  function renderDesktopRow(item) {
    const tot           = lineTot(item)
    const isRemoved     = item.status === 'removed'
    const itemStatColor = ITEM_STATUS_COLOR[item.status] || '#9898a4'

    return (
      <tr key={item.id} className="wb-row" style={{ borderBottom: '1px solid var(--border, #2e3040)' }}>
        {/* Drag handle */}
        <td style={{ padding: '0 4px', textAlign: 'center', color: '#333848', fontSize: 12, cursor: 'grab', userSelect: 'none' }}>⠿</td>

        {/* Area */}
        {renderTextCell(item, 'area', false, true)}

        {/* Item name */}
        {renderTextCell(item, 'item_name')}

        {/* Description */}
        {renderTextCell(item, 'issue_description')}

        {/* Material */}
        {renderCostCell(item, 'material_description', 'material_cost', 'Material')}

        {/* Labour */}
        {renderCostCell(item, 'labour_description', 'labour_cost', 'Labour')}

        {/* Qty */}
        <td onClick={e => { e.stopPropagation(); startEdit(item.id, 'qty', item.qty) }} style={{ padding: 0, cursor: 'text' }}>
          {isEditing(item.id, 'qty') ? (
            <input autoFocus type="number" value={cellDraft} onChange={e => setCellDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); e.stopPropagation() }}
              onClick={e => e.stopPropagation()}
              style={{ display: 'block', width: '100%', height: 36, padding: '0 8px', background: 'var(--bg-input, #252731)', border: '1px solid var(--accent, #c8963e)', borderRadius: 0, color: 'var(--text, #e8e8f0)', fontSize: 13, fontFamily: 'var(--font-mono, monospace)', outline: 'none' }}
            />
          ) : (
            <div style={{ padding: '0 8px', height: 36, display: 'flex', alignItems: 'center', fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text, #e8e8f0)', opacity: isRemoved ? 0.45 : 1 }}>
              {item.qty || 1}
            </div>
          )}
        </td>

        {/* Cost type */}
        <td onClick={e => e.stopPropagation()} style={{ padding: '0 3px' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[['priced','P'], ['actuals','A'], ['nil','N']].map(([ct, label]) => (
              <button key={ct} onClick={e => { e.stopPropagation(); setCostType(item.id, ct) }}
                style={{ padding: '2px 5px', borderRadius: 3, border: 'none', cursor: 'pointer', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', fontFamily: 'var(--font-mono, monospace)', background: item.cost_type === ct ? 'rgba(200,150,62,0.2)' : 'none', color: item.cost_type === ct ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', transition: 'all 0.1s' }}
              >{label}</button>
            ))}
          </div>
        </td>

        {/* Total */}
        <td style={{ padding: '0 8px', textAlign: 'right' }}>
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: item.cost_type === 'actuals' ? 'var(--text-muted, #6b6d82)' : item.cost_type === 'nil' || isRemoved ? '#3a3c4e' : 'var(--accent, #c8963e)', textDecoration: isRemoved ? 'line-through' : 'none' }}>
            {item.cost_type === 'actuals' ? 'act' : item.cost_type === 'nil' ? 'nil' : `₹${fmt(tot)}`}
          </span>
        </td>

        {/* Status */}
        <td style={{ padding: '0 5px' }}>
          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 100, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: `${itemStatColor}18`, color: itemStatColor, whiteSpace: 'nowrap' }}>
            {item.status || 'pending'}
          </span>
        </td>

        {/* Media */}
        <td style={{ padding: 0 }} onClick={e => e.stopPropagation()}>
          <MediaStrip
            media={mediaMap[item.line_item_id] || []}
            onOpenPanel={() => setMediaPanel(item)}
            onOpenLightbox={idx => setLightbox({ urls: (mediaMap[item.line_item_id] || []).map(m => m.url), idx })}
          />
        </td>

        {/* Row actions ⋯ */}
        <td style={{ padding: 0, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <button className="wb-more-btn"
            onClick={e => {
              e.stopPropagation()
              const rect = e.currentTarget.getBoundingClientRect()
              setOpenMenu({ itemId: item.id, status: item.status, x: rect.right - 148, y: rect.bottom + 4 })
            }}
            style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted, #6b6d82)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 15, margin: '0 auto' }}
          >⋯</button>
        </td>
      </tr>
    )
  }

  function renderMobileCard(item) {
    const tot           = lineTot(item)
    const isRemoved     = item.status === 'removed'
    const itemStatColor = ITEM_STATUS_COLOR[item.status] || '#9898a4'

    function mField(field, label, type = 'text') {
      const val = item[field] ?? ''
      return (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted, #6b6d82)', marginBottom: 4, fontFamily: 'var(--font-mono, monospace)' }}>{label}</div>
          {isEditing(item.id, field) ? (
            <input autoFocus type={type} value={cellDraft} onChange={e => setCellDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
              style={{ width: '100%', padding: 10, fontSize: 16, background: 'var(--bg-input, #252731)', border: '1px solid var(--accent, #c8963e)', borderRadius: 5, color: 'var(--text, #e8e8f0)', outline: 'none', fontFamily: type === 'number' ? 'var(--font-mono, monospace)' : 'inherit', boxSizing: 'border-box' }}
            />
          ) : (
            <div onClick={() => startEdit(item.id, field, val)}
              style={{ fontSize: 14, color: val ? 'var(--text, #e8e8f0)' : '#3a3c4e', padding: '9px 10px', background: 'var(--bg-input, #252731)', borderRadius: 5, cursor: 'text', minHeight: 42, display: 'flex', alignItems: 'center', fontFamily: type === 'number' ? 'var(--font-mono, monospace)' : 'inherit', textDecoration: isRemoved ? 'line-through' : 'none' }}
            >{val || '—'}</div>
          )}
        </div>
      )
    }

    return (
      <div key={item.id} style={{ background: 'var(--bg, #16171f)', border: `1px solid ${isRemoved ? '#f8717133' : 'var(--border, #2e3040)'}`, borderRadius: 7, padding: 12, marginBottom: 8, opacity: isRemoved ? 0.65 : 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', textDecoration: isRemoved ? 'line-through' : 'none' }}>{item.item_name || '—'}</div>
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 100, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, textTransform: 'uppercase', background: `${itemStatColor}18`, color: itemStatColor, display: 'inline-block', marginTop: 4 }}>{item.status || 'pending'}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: 'var(--accent, #c8963e)' }}>
              {item.cost_type === 'actuals' ? 'On actuals' : item.cost_type === 'nil' ? 'Nil' : `₹${fmt(tot)}`}
            </div>
          </div>
        </div>

        {mField('area', 'Area')}
        {mField('issue_description', 'Description')}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted, #6b6d82)', marginBottom: 4, fontFamily: 'var(--font-mono, monospace)' }}>Material ₹</div>
            {isEditing(item.id, 'material_cost') ? (
              <input autoFocus type="number" value={cellDraft} onChange={e => setCellDraft(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                style={{ width: '100%', padding: 10, fontSize: 16, background: 'var(--bg-input, #252731)', border: '1px solid var(--accent, #c8963e)', borderRadius: 5, color: 'var(--text, #e8e8f0)', outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box' }} />
            ) : (
              <div onClick={() => startEdit(item.id, 'material_cost', item.material_cost)} style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', padding: '9px 10px', background: 'var(--bg-input, #252731)', borderRadius: 5, cursor: 'text', minHeight: 42, display: 'flex', alignItems: 'center', fontFamily: 'var(--font-mono, monospace)' }}>₹{fmt(item.material_cost)}</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted, #6b6d82)', marginBottom: 4, fontFamily: 'var(--font-mono, monospace)' }}>Labour ₹</div>
            {isEditing(item.id, 'labour_cost') ? (
              <input autoFocus type="number" value={cellDraft} onChange={e => setCellDraft(e.target.value)} onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                style={{ width: '100%', padding: 10, fontSize: 16, background: 'var(--bg-input, #252731)', border: '1px solid var(--accent, #c8963e)', borderRadius: 5, color: 'var(--text, #e8e8f0)', outline: 'none', fontFamily: 'var(--font-mono, monospace)', boxSizing: 'border-box' }} />
            ) : (
              <div onClick={() => startEdit(item.id, 'labour_cost', item.labour_cost)} style={{ fontSize: 14, color: 'var(--text, #e8e8f0)', padding: '9px 10px', background: 'var(--bg-input, #252731)', borderRadius: 5, cursor: 'text', minHeight: 42, display: 'flex', alignItems: 'center', fontFamily: 'var(--font-mono, monospace)' }}>₹{fmt(item.labour_cost)}</div>
            )}
          </div>
        </div>

        {/* Cost type */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted, #6b6d82)', marginBottom: 5, fontFamily: 'var(--font-mono, monospace)' }}>Cost Type</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {['priced', 'actuals', 'nil'].map(ct => (
              <button key={ct} onClick={() => setCostType(item.id, ct)}
                style={{ flex: 1, padding: '10px 0', minHeight: 44, borderRadius: 5, border: `1px solid ${item.cost_type === ct ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, cursor: 'pointer', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)', background: item.cost_type === ct ? 'rgba(200,150,62,0.12)' : 'none', color: item.cost_type === ct ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)' }}
              >{ct}</button>
            ))}
          </div>
        </div>

        {/* Swap buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button onClick={() => openSwapDrawer('swap-material', item.id)}
            style={{ flex: 1, padding: '8px 0', minHeight: 40, background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>⇄ Material</button>
          <button onClick={() => openSwapDrawer('swap-labour', item.id)}
            style={{ flex: 1, padding: '8px 0', minHeight: 40, background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>⇄ Labour</button>
        </div>

        {/* Media */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted, #6b6d82)', marginBottom: 6, fontFamily: 'var(--font-mono, monospace)' }}>Media</div>
          {(() => {
            const media = mediaMap[item.line_item_id] || []
            const isVid = m => m.type === 'video' || /\.(mp4|mov|webm)$/i.test(m.url)
            return (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {media.slice(0, 4).map((m, idx) => (
                  <div key={m.id} onClick={() => setLightbox({ urls: media.map(x => x.url), idx })} style={{ width: 64, height: 48, borderRadius: 4, overflow: 'hidden', background: '#111', border: idx === 0 ? '2px solid var(--accent, #c8963e)' : '1px solid var(--border, #2e3040)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isVid(m)
                      ? <span style={{ color: '#fff', fontSize: 16, lineHeight: 1 }}>▶</span>
                      : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
                    }
                  </div>
                ))}
                {media.length > 4 && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>+{media.length - 4}</div>}
                <button
                  onClick={() => setMediaPanel(item)}
                  style={{ minWidth: 56, minHeight: 44, padding: '0 8px', background: 'none', border: '1px dashed var(--border, #2e3040)', borderRadius: 5, fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
                >{media.length ? 'Manage' : '+ Add'}</button>
              </div>
            )
          })()}
        </div>

        {/* Row actions */}
        <div style={{ display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border, #2e3040)' }}>
          <button onClick={() => duplicateItem(item.id)} style={{ flex: 1, padding: '10px 0', minHeight: 44, background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, fontSize: 11, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Duplicate</button>
          {isRemoved
            ? <button onClick={() => restoreItem(item.id)} style={{ flex: 1, padding: '10px 0', minHeight: 44, background: 'none', border: '1px solid #4dd9c0', borderRadius: 5, fontSize: 11, color: '#4dd9c0', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Restore</button>
            : <button onClick={() => removeItem(item.id)} style={{ flex: 1, padding: '10px 0', minHeight: 44, background: 'none', border: '1px solid #f87171', borderRadius: 5, fontSize: 11, color: '#f87171', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>Remove</button>
          }
        </div>
      </div>
    )
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div
      style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-sans, Poppins, sans-serif)' }}
      onClick={() => { if (editingCell) commitEdit(); if (openMenu) setOpenMenu(null); if (moreOpen) setMoreOpen(false) }}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Toolbar ── */}
      <div className="wb-toolbar" onClick={e => e.stopPropagation()}>
        <div className="wb-toolbar-left">
          <button className="wb-back-btn" onClick={() => navigate(`/properties/${pid}/estimates`)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M8 2L3 6.5 8 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <span className="wb-pid">PID {pid}</span>
          {inspection?.house_type && <span className="wb-ver">· {inspection.house_type}</span>}
          <span className="wb-ver">v{versionCount}</span>
          <span className="wb-schip" style={{ background: `${statusColor}18`, color: statusColor }}>{status}</span>
        </div>
        <div className="wb-totals">
          <span className="wb-tval">₹{fmt(subtotal)}</span>
          <span className="wb-tcnt">{activeCount} items</span>
        </div>
        <div className="wb-toolbar-right">
          {!isMobile ? (
            <>
              <button className="wb-tbtn wb-outline" onClick={handleRegenerate} disabled={generating}>{generating ? '…' : '↺ Regen'}</button>
              <button className="wb-tbtn wb-outline" onClick={e => { e.stopPropagation(); setNotesEditing(true) }}>Notes</button>
              {shareUrl && <button className="wb-tbtn wb-outline" onClick={() => window.open(shareUrl, '_blank')}>Preview ↗</button>}
              {shareUrl && (
                <button className="wb-tbtn wb-outline" onClick={e => { e.stopPropagation(); handleCopy(false) }}>
                  {copied ? '✓ Copied' : 'Copy link'}
                </button>
              )}
              <button className="wb-tbtn wb-accent" onClick={e => { e.stopPropagation(); handleCopy(true) }}>
                {copied ? '✓ Sent!' : 'Send ↗'}
              </button>
            </>
          ) : (
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button className="wb-tbtn wb-outline" onClick={() => setMoreOpen(p => !p)}>⋯</button>
              {moreOpen && (
                <>
                  <div onClick={() => setMoreOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, zIndex: 101, minWidth: 168, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {[
                      { label: '↺ Regenerate', fn: () => { setMoreOpen(false); handleRegenerate() } },
                      { label: 'Edit Notes', fn: () => { setMoreOpen(false); setNotesEditing(true) } },
                      shareUrl && { label: 'Preview ↗', fn: () => { setMoreOpen(false); window.open(shareUrl, '_blank') } },
                      shareUrl && { label: 'Copy link', fn: () => { setMoreOpen(false); handleCopy(false) } },
                      { label: 'Send to landlord', fn: () => { setMoreOpen(false); handleCopy(true) }, accent: true },
                    ].filter(Boolean).map((item, i) => (
                      <button key={i} onClick={item.fn}
                        style={{ display: 'block', width: '100%', padding: '11px 14px', minHeight: 44, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left', fontFamily: 'var(--font-mono, monospace)', color: item.accent ? 'var(--accent, #c8963e)' : 'var(--text, #e8e8f0)', borderBottom: i < 3 ? '1px solid var(--border, #2e3040)' : 'none' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                      >{item.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="wb-content">

        {/* Trade groups */}
        {tradeGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted, #6b6d82)', fontSize: 13 }}>
            <div style={{ marginBottom: 16 }}>No items yet.</div>
            <button onClick={openAddDrawer}
              style={{ padding: '10px 20px', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 6, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
            >+ Add First Item</button>
          </div>
        ) : (
          <>
            {tradeGroups.map(({ trade, rows, total, activeCount: ac }) => {
              const isCollapsed = collapsed.has(trade)
              const color       = tc(trade)
              return (
                <div key={trade} style={{ marginBottom: 10 }}>
                  {/* Trade header */}
                  <div
                    onClick={e => { e.stopPropagation(); setCollapsed(prev => { const n = new Set(prev); isCollapsed ? n.delete(trade) : n.add(trade); return n }) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', userSelect: 'none', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: isCollapsed ? 7 : '7px 7px 0 0', borderLeft: `3px solid ${color}` }}
                  >
                    <span style={{ fontSize: 9, color: 'var(--text-muted, #6b6d82)', display: 'inline-block', lineHeight: 1, transition: 'transform 0.15s', transform: isCollapsed ? 'none' : 'rotate(90deg)' }}>▶</span>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text, #e8e8f0)', flex: 1 }}>{trade}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{ac} items</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, color: total > 0 ? color : 'var(--text-muted, #6b6d82)' }}>₹{fmt(total)}</span>
                  </div>

                  {/* Items */}
                  {!isCollapsed && (isMobile ? (
                    <div style={{ border: '1px solid var(--border, #2e3040)', borderTop: 'none', borderRadius: '0 0 7px 7px', padding: '8px', background: 'var(--bg-panel, #1e2028)' }}>
                      {rows.map(item => renderMobileCard(item))}
                    </div>
                  ) : (
                    <div style={{ border: '1px solid var(--border, #2e3040)', borderTop: 'none', borderRadius: '0 0 7px 7px', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 964 }}>
                        <colgroup>
                          <col style={{ width: 26 }} />
                          <col style={{ width: 78 }} />
                          <col style={{ width: 114 }} />
                          <col />
                          <col style={{ width: 142 }} />
                          <col style={{ width: 142 }} />
                          <col style={{ width: 48 }} />
                          <col style={{ width: 82 }} />
                          <col style={{ width: 74 }} />
                          <col style={{ width: 76 }} />
                          <col style={{ width: 64 }} />
                          <col style={{ width: 36 }} />
                        </colgroup>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border, #2e3040)' }}>
                            {['', 'Area', 'Item', 'Description', 'Material', 'Labour', 'Qty', 'Type', 'Total', 'Status', 'Media', ''].map((h, i) => (
                              <th key={i} style={{ padding: '5px 8px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted, #6b6d82)', textAlign: i === 8 ? 'right' : 'left', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(item => renderDesktopRow(item))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )
            })}

            {/* Add item */}
            <button onClick={e => { e.stopPropagation(); openAddDrawer() }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent, #c8963e)'; e.currentTarget.style.color = 'var(--accent, #c8963e)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border, #2e3040)'; e.currentTarget.style.color = 'var(--text-muted, #6b6d82)' }}
              style={{ marginTop: 6, padding: '7px 14px', height: 34, background: 'none', border: '1px dashed var(--border, #2e3040)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}
            >+ Add item</button>
          </>
        )}

        {/* Notes card */}
        <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Notes & Terms</span>
            {notesEditing ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setNotesEditing(false); setNotesDraft(estimate?.notes || '') }} style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', padding: 0 }}>Cancel</button>
                <button onClick={saveNotes} disabled={savingNotes} style={{ fontSize: 11, color: 'var(--accent, #c8963e)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', padding: 0 }}>{savingNotes ? 'Saving…' : 'Save'}</button>
              </div>
            ) : (
              <button onClick={e => { e.stopPropagation(); setNotesEditing(true) }} style={{ fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', padding: 0 }}>Edit</button>
            )}
          </div>
          {notesEditing ? (
            <textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              onClick={e => e.stopPropagation()}
              placeholder="Notes for the landlord (terms, scope exclusions, validity period)…"
              style={{ width: '100%', minHeight: 90, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, color: 'var(--text, #e8e8f0)', fontSize: 13, padding: '8px 10px', resize: 'vertical', outline: 'none', fontFamily: 'var(--font-sans, Poppins, sans-serif)', boxSizing: 'border-box' }}
              onFocus={e => { e.target.style.borderColor = 'var(--accent, #c8963e)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--border, #2e3040)' }}
            />
          ) : (
            <div style={{ fontSize: 13, color: estimate?.notes ? 'var(--text-muted, #6b6d82)' : '#3a3c4e', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontStyle: estimate?.notes ? 'normal' : 'italic' }}>
              {estimate?.notes || 'No notes — click Edit to add.'}
            </div>
          )}
        </div>

        {/* Disputes */}
        {disputedItems.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#f0a050', fontFamily: 'var(--font-mono, monospace)', marginBottom: 10 }}>
              Disputes ({disputedItems.length})
            </div>
            {disputedItems.map(item => (
              <div key={item.id} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid rgba(240,160,80,0.35)', borderRadius: 8, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)', marginBottom: 2 }}>{item.item_name || '—'}</div>
                    {item.issue_description && <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5 }}>{item.issue_description}</div>}
                    <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                      {item.area  && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{item.area}</span>}
                      {item.trade && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: 'var(--bg-input, #252731)', color: tc(item.trade), fontFamily: 'var(--font-mono, monospace)' }}>{item.trade}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>₹{fmt(lineTot(item))}</div>
                    <div style={{ fontSize: 10, color: '#f0a050', marginTop: 2 }}>⚑ disputed</div>
                  </div>
                </div>
                <DisputeThread itemId={item.id} estimateId={id} item={item} userEmail={userEmail} onResolve={loadData} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Row menu ── */}
      {openMenu && (
        <>
          <div onClick={() => setOpenMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 9000 }} />
          <div style={{ position: 'fixed', top: openMenu.y, left: openMenu.x, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 9001, minWidth: 148, overflow: 'hidden' }}>
            <button onClick={() => { duplicateItem(openMenu.itemId); setOpenMenu(null) }}
              style={{ display: 'block', width: '100%', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left', fontFamily: 'inherit', color: 'var(--text, #e8e8f0)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >Duplicate</button>
            {openMenu.status === 'removed' ? (
              <button onClick={() => { restoreItem(openMenu.itemId); setOpenMenu(null) }}
                style={{ display: 'block', width: '100%', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left', fontFamily: 'inherit', color: '#4dd9c0', borderTop: '1px solid var(--border, #2e3040)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >Restore</button>
            ) : (
              <button onClick={() => { removeItem(openMenu.itemId); setOpenMenu(null) }}
                style={{ display: 'block', width: '100%', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, textAlign: 'left', fontFamily: 'inherit', color: '#f87171', borderTop: '1px solid var(--border, #2e3040)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >Remove</button>
            )}
          </div>
        </>
      )}

      {/* ── Media panel ── */}
      {mediaPanel && (
        <MediaPanel
          item={mediaPanel}
          media={mediaMap[mediaPanel.line_item_id] || []}
          onClose={() => setMediaPanel(null)}
          onAddMedia={files => handleAddMedia(mediaPanel.line_item_id, files)}
          onDeleteMedia={m => handleDeleteMedia(m)}
          onReplaceMedia={(m, file) => handleReplaceMedia(m, file)}
          onSetPrimary={m => handleSetPrimary(mediaPanel.line_item_id, m)}
          onOpenLightbox={idx => setLightbox({ urls: (mediaMap[mediaPanel.line_item_id] || []).map(m => m.url), idx })}
        />
      )}

      {/* ── Lightbox ── */}
      {lightbox && lightbox.urls.length > 0 && (
        <MediaLightbox
          urls={lightbox.urls}
          idx={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* ── Rate drawer ── */}
      <RateDrawer
        open={drawerOpen}
        mode={drawerMode}
        onClose={() => setDrawerOpen(false)}
        onSelectMaterial={handleSelectMaterial}
        onSelectLabour={handleSelectLabour}
        isMobile={isMobile}
      />
    </div>
  )
}
