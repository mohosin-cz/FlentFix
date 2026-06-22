import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateEstimate, resolveInspectionWithData } from '../utils/generateEstimate'
import DisputeThread from '../components/DisputeThread'
import { useIsMobile } from '../hooks/useIsMobile'
import LogoSpinner from '../components/LogoSpinner'

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_COLUMNS = new Set([
  'issue_description', 'item_name', 'area', 'trade', 'action',
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
  excluded: '#3a3c4e',
  resolved: '#86efac',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

function lineTot(item) {
  if (['removed', 'excluded'].includes(item.status)) return 0
  if (item.cost_type === 'nil' || item.cost_type === 'actuals') return 0
  return (item.material_cost || 0) + (item.labour_cost || 0)
}

function needsPricing(item) {
  return item.cost_type === 'priced'
    && !['removed', 'excluded'].includes(item.status)
    && (item.material_cost || 0) + (item.labour_cost || 0) === 0
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
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

/* ── Shell ── */
.wb-shell { display:flex; flex-direction:column; height:100svh; background:var(--bg,#16171f); overflow:hidden; color:var(--text,#e8e8f0); }
.wb-body  { flex:1; display:flex; overflow:hidden; min-height:0; }
.wb-main  { flex:1; overflow-y:auto; min-width:0; padding-bottom:40px; }
.wb-drw-col { width:380px; flex-shrink:0; border-left:1px solid var(--border,#2e3040); overflow-y:auto; background:var(--bg-panel,#1e2028); display:flex; flex-direction:column; }

/* ── Command bar ── */
.wb-cmd { flex-shrink:0; height:52px; display:flex; align-items:center; gap:8px; padding:0 16px; border-bottom:1px solid var(--border,#2e3040); background:var(--bg-panel,#1e2028); }
.wb-cmd-l { display:flex; align-items:center; gap:8px; flex:1; min-width:0; overflow:hidden; }
.wb-cmd-r { display:flex; align-items:center; gap:6px; flex-shrink:0; }
.wb-cmd-div { width:1px; height:20px; background:var(--border,#2e3040); margin:0 2px; flex-shrink:0; }

/* ── Summary bar ── */
.wb-sum { flex-shrink:0; min-height:44px; display:flex; align-items:center; gap:6px; padding:0 16px; border-bottom:1px solid var(--border,#2e3040); background:rgba(255,255,255,0.012); overflow-x:auto; white-space:nowrap; flex-wrap:wrap; }
.wb-sum::-webkit-scrollbar { display:none; }

/* ── Notes panel ── */
.wb-notes-bar { flex-shrink:0; padding:10px 16px; border-bottom:1px solid var(--border,#2e3040); background:var(--bg-panel,#1e2028); display:flex; align-items:flex-start; gap:10px; }

/* ── Trade group ── */
.wb-group { }
.wb-group-hd {
  display:flex; align-items:center; gap:10px; padding:6px 14px 6px 10px;
  background:var(--bg,#16171f); border-bottom:1px solid var(--border,#2e3040);
  cursor:pointer; user-select:none; position:sticky; top:0; z-index:10;
}
.wb-group-hd:hover { background:rgba(255,255,255,0.02); }
.wb-group-body { }

/* ── Item row ── */
.wb-row {
  display:grid;
  grid-template-columns: 22px minmax(150px,190px) 1fr 98px 84px 60px 26px;
  align-items:center; min-height:52px;
  border-bottom:1px solid rgba(46,48,64,0.55);
  cursor:pointer; transition:background 0.08s; position:relative;
}
.wb-row:hover { background:rgba(255,255,255,0.025); }
.wb-row.is-active { background:rgba(200,150,62,0.055); }
.wb-row.is-active::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background:var(--accent,#c8963e); }
.wb-row.is-removed { opacity:0.4; }
.wb-row.is-excluded { opacity:0.38; }
.wb-row-handle { padding:0 4px; text-align:center; color:#252835; font-size:13px; cursor:grab; }
.wb-ident { padding:6px 8px 6px 6px; min-width:0; }
.wb-ident-area { font-family:'IBM Plex Mono',monospace; font-size:9px; color:var(--text-muted,#6b6d82); text-transform:uppercase; letter-spacing:0.08em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:2px; }
.wb-ident-name { font-family:'Inter',var(--font-sans,sans-serif); font-size:12px; font-weight:600; color:var(--text,#e8e8f0); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wb-ident-chips { display:flex; gap:4px; margin-top:3px; flex-wrap:wrap; }
.wb-finding { padding:6px 8px; min-width:0; }
.wb-finding-text { font-family:'Inter',var(--font-sans,sans-serif); font-size:11px; color:var(--text-dim,#9394a8); overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.4; }
.wb-finding-action { font-family:'IBM Plex Mono',monospace; font-size:9px; color:var(--accent,#c8963e); margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; opacity:0.85; }
.wb-cost-cell { padding:0 8px; text-align:right; }
.wb-type-seg  { display:flex; gap:2px; padding:0 4px; }
.wb-tseg { padding:4px 5px; border-radius:5px; border:none; cursor:pointer; font-family:'IBM Plex Mono',monospace; font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; transition:all 0.1s; background:none; color:#2e3040; }
.wb-tseg:hover { color:var(--text-muted,#6b6d82); background:rgba(255,255,255,0.04); }
.wb-tseg.p-on { background:rgba(200,150,62,0.18); color:var(--accent,#c8963e); }
.wb-tseg.a-on { background:rgba(77,217,192,0.15); color:#4dd9c0; }
.wb-tseg.n-on { background:rgba(147,148,168,0.12); color:#9394a8; }
.wb-kebab { width:22px; height:22px; border:none; background:none; cursor:pointer; color:#2e3040; border-radius:5px; font-size:14px; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.1s; }
.wb-row:hover .wb-kebab { opacity:1; }
.wb-kebab:hover { color:var(--text,#e8e8f0) !important; background:rgba(255,255,255,0.07) !important; }

/* ── Add-item row ── */
.wb-add-row { display:flex; align-items:center; padding:6px 12px; border-bottom:1px solid rgba(46,48,64,0.55); }
.wb-add-btn { display:flex; align-items:center; gap:6px; padding:5px 10px; background:none; border:1px dashed var(--border,#2e3040); border-radius:5px; cursor:pointer; font-family:'IBM Plex Mono',monospace; font-size:10px; color:var(--text-muted,#6b6d82); transition:all 0.15s; }
.wb-add-btn:hover { border-color:var(--text-dim,#9394a8); color:var(--text,#e8e8f0); }

/* ── Drawer ── */
.wb-drw-hd { padding:14px 16px 12px; border-bottom:1px solid var(--border,#2e3040); flex-shrink:0; }
.wb-drw-eyebrow { font-family:'IBM Plex Mono',monospace; font-size:9px; color:var(--text-muted,#6b6d82); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:3px; }
.wb-drw-title  { font-family:'Inter',var(--font-sans,sans-serif); font-size:15px; font-weight:600; color:var(--text,#e8e8f0); }
.wb-drw-nav  { display:flex; align-items:center; gap:6px; margin-top:8px; }
.wb-drw-sec  { padding:12px 16px; border-bottom:1px solid rgba(46,48,64,0.5); }
.wb-drw-lbl  { font-family:'IBM Plex Mono',monospace; font-size:9px; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted,#6b6d82); margin-bottom:6px; }
.wb-drw-ta   { width:100%; padding:9px 11px; background:var(--bg-input,#252731); border:1px solid var(--border,#2e3040); border-radius:5px; color:var(--text,#e8e8f0); font-family:'Inter',var(--font-sans,sans-serif); font-size:13px; resize:vertical; outline:none; box-sizing:border-box; min-height:70px; transition:border-color 0.15s; }
.wb-drw-ta:focus { border-color:var(--accent,#c8963e); }
.wb-drw-inp  { width:100%; padding:8px 10px; background:var(--bg-input,#252731); border:1px solid var(--border,#2e3040); border-radius:5px; color:var(--text,#e8e8f0); font-family:'IBM Plex Mono',monospace; font-size:13px; outline:none; box-sizing:border-box; transition:border-color 0.15s; }
.wb-drw-inp:focus { border-color:var(--accent,#c8963e); }
.wb-drw-row  { display:grid; grid-template-columns:1fr 80px; gap:8px; margin-bottom:8px; }
.wb-drw-row3 { display:grid; grid-template-columns:1fr 72px 52px; gap:8px; }
.wb-drw-placeholder { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:var(--text-muted,#6b6d82); padding:40px 20px; text-align:center; }

/* ── Buttons ── */
.wb-btn { height:32px; padding:0 12px; border-radius:5px; cursor:pointer; font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:5px; white-space:nowrap; transition:all 0.12s; }
.wb-btn-primary { background:var(--accent,#c8963e); border:none; color:#000; }
.wb-btn-primary:hover { opacity:0.88; }
.wb-btn-outline { background:none; border:1px solid var(--border,#2e3040); color:var(--text-muted,#6b6d82); }
.wb-btn-outline:hover { border-color:var(--text-dim,#9394a8); color:var(--text,#e8e8f0); }
.wb-btn-ghost { background:none; border:none; color:var(--text-muted,#6b6d82); }
.wb-btn-ghost:hover { color:var(--text,#e8e8f0); }
.wb-btn-back { width:32px; height:32px; padding:0; background:var(--bg-input,#252731); border:1px solid var(--border,#2e3040); border-radius:5px; color:var(--text-dim,#9394a8); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
.wb-btn-icon { width:28px; height:28px; padding:0; background:var(--bg-input,#252731); border:1px solid var(--border,#2e3040); border-radius:5px; color:var(--text-dim,#9394a8); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; font-size:14px; }
.wb-btn-icon:hover { color:var(--text,#e8e8f0); }
.wb-btn-icon:disabled { opacity:0.35; cursor:default; }

/* ── Pill / chip ── */
.wb-pill { display:inline-flex; align-items:center; gap:5px; padding:0 9px; height:26px; border-radius:100px; font-family:'IBM Plex Mono',monospace; font-size:10px; white-space:nowrap; flex-shrink:0; }
.wb-chip { display:inline-flex; align-items:center; gap:3px; padding:1px 6px; border-radius:100px; font-family:'IBM Plex Mono',monospace; font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; }

/* ── Context menu ── */
.wb-ctx { position:fixed; background:var(--bg-panel,#1e2028); border:1px solid var(--border,#2e3040); border-radius:7px; box-shadow:0 8px 32px rgba(0,0,0,0.5); z-index:600; min-width:140px; overflow:hidden; }
.wb-ctx-item { display:block; width:100%; padding:9px 13px; background:none; border:none; cursor:pointer; font-size:12px; text-align:left; font-family:inherit; color:var(--text,#e8e8f0); }
.wb-ctx-item:hover { background:rgba(255,255,255,0.06); }

/* ── Hints ── */
.wb-hints { position:fixed; bottom:0; left:0; right:0; height:28px; display:flex; align-items:center; gap:14px; padding:0 16px; background:rgba(16,17,22,0.96); border-top:1px solid rgba(46,48,64,0.5); z-index:19; backdrop-filter:blur(8px); overflow:hidden; }
.wb-hint  { font-family:'IBM Plex Mono',monospace; font-size:9px; color:#2e3040; display:flex; align-items:center; gap:4px; }
.wb-hint kbd { color:var(--text-muted,#6b6d82); font-family:inherit; }

/* ── Drawer media grid ── */
.wb-drw-mg { display:grid; grid-template-columns:repeat(auto-fill,minmax(86px,1fr)); gap:8px; }
.wb-media-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; }

/* ── Responsive ── */
@media (max-width:1100px) { .wb-drw-col { display:none !important; } }
@media (min-width:1101px) { .wb-overlay-scrim { display:none !important; } .wb-overlay-drw  { display:none !important; } }
@media (max-width:640px) {
  .wb-cmd { padding:0 10px; gap:6px; }
  .wb-sum { padding:0 10px; }
  .wb-row { grid-template-columns: 0 1fr 0 90px 0 56px 26px; }
  .wb-row-handle, .wb-finding, .wb-type-seg { display:none; }
}
`

// ─── MediaLightbox ────────────────────────────────────────────────────────────

function MediaLightbox({ urls, idx, onClose }) {
  const [cur, setCur] = useState(idx)
  useEffect(() => {
    function handle(e) {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowRight') setCur(i => Math.min(i + 1, urls.length - 1))
      if (e.key === 'ArrowLeft')  setCur(i => Math.max(i - 1, 0))
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
        {isVid ? <video src={url} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 6 }} />
                : <img src={url} alt="" style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 6 }} />}
        {urls.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={e => { e.stopPropagation(); setCur(i => Math.max(i-1,0)) }} disabled={cur===0} style={{ width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,0.15)',border:'none',cursor:cur===0?'default':'pointer',color:'#fff',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',opacity:cur===0?0.3:1 }}>‹</button>
            <span style={{ fontSize:11,color:'#aaa',fontFamily:'IBM Plex Mono,monospace' }}>{cur+1} / {urls.length}</span>
            <button onClick={e => { e.stopPropagation(); setCur(i => Math.min(i+1,urls.length-1)) }} disabled={cur===urls.length-1} style={{ width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,0.15)',border:'none',cursor:cur===urls.length-1?'default':'pointer',color:'#fff',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',opacity:cur===urls.length-1?0.3:1 }}>›</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MediaPanel (bottom-sheet) ────────────────────────────────────────────────

function MediaPanel({ item, media, onClose, onAddMedia, onDeleteMedia, onReplaceMedia, onSetPrimary, onOpenLightbox }) {
  const addRef = useRef(null), replaceRef = useRef(null)
  const [replaceTarget, setReplaceTarget] = useState(null)
  const [uploading, setUploading] = useState(false)
  const isVid = m => m.type === 'video' || /\.(mp4|mov|webm)$/i.test(m.url)

  async function handleAdd(e) {
    const files = Array.from(e.target.files || []); if (!files.length) return; e.target.value = ''
    setUploading(true); await onAddMedia(files); setUploading(false)
  }
  async function handleReplace(e) {
    const file = e.target.files?.[0]; if (!file || !replaceTarget) return; e.target.value = ''
    setUploading(true); await onReplaceMedia(replaceTarget, file); setReplaceTarget(null); setUploading(false)
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:800 }} />
      <div onClick={e => e.stopPropagation()} style={{ position:'fixed',bottom:0,left:0,right:0,maxHeight:'88vh',background:'var(--bg-panel,#1e2028)',borderRadius:'14px 14px 0 0',border:'1px solid var(--border,#2e3040)',zIndex:801,display:'flex',flexDirection:'column',boxShadow:'0 -8px 40px rgba(0,0,0,0.6)' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px 10px',borderBottom:'1px solid var(--border,#2e3040)',flexShrink:0 }}>
          <div>
            <div style={{ fontSize:13,fontWeight:600,color:'var(--text,#e8e8f0)' }}>{item.item_name||'Item'} — Media</div>
            <div style={{ fontSize:10,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace',marginTop:2 }}>
              {media.length} file{media.length!==1?'s':''}{item.area?` · ${item.area}`:''}
            </div>
          </div>
          <button onClick={onClose} style={{ width:36,height:36,background:'none',border:'none',cursor:'pointer',color:'var(--text-muted,#6b6d82)',fontSize:22,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:6 }}>×</button>
        </div>
        <div style={{ padding:'14px 16px 28px',overflowY:'auto',flex:1 }}>
          <input ref={addRef} type="file" accept="image/*,video/*" multiple style={{ display:'none' }} onChange={handleAdd} />
          <input ref={replaceRef} type="file" accept="image/*,video/*" style={{ display:'none' }} onChange={handleReplace} />
          {item.line_item_id && (
            <button onClick={() => addRef.current?.click()} disabled={uploading}
              style={{ display:'flex',alignItems:'center',gap:8,width:'100%',padding:'10px 14px',marginBottom:16,minHeight:44,border:`1px dashed ${uploading?'var(--accent,#c8963e)':'var(--border,#2e3040)'}`,borderRadius:8,background:uploading?'rgba(200,150,62,0.06)':'none',fontSize:13,color:uploading?'var(--accent,#c8963e)':'var(--text-dim,#9394a8)',cursor:uploading?'wait':'pointer',fontFamily:'inherit' }}>
              {uploading ? 'Uploading…' : '+ Add photos / videos'}
            </button>
          )}
          {media.length === 0 ? (
            <div style={{ padding:'28px 0',textAlign:'center',fontSize:12,color:'var(--text-muted,#6b6d82)' }}>
              {item.line_item_id ? 'No media yet.' : 'Manually added item — no inspection link.'}
            </div>
          ) : (
            <div className="wb-media-grid">
              {media.map((m, idx) => {
                const isPrimary = idx===0, vid = isVid(m)
                return (
                  <div key={m.id} style={{ borderRadius:8,overflow:'hidden',background:'#0d0e14',border:`2px solid ${isPrimary?'var(--accent,#c8963e)':'var(--border,#2e3040)'}` }}>
                    <div onClick={() => onOpenLightbox(idx)} style={{ width:'100%',paddingTop:'72%',position:'relative',cursor:'pointer' }}>
                      <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
                        {vid ? <span style={{ color:'#fff',fontSize:28 }}>▶</span> : <img src={m.url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />}
                      </div>
                      {isPrimary && <div style={{ position:'absolute',top:5,left:5,fontSize:8,padding:'2px 6px',borderRadius:3,background:'var(--accent,#c8963e)',color:'#000',fontFamily:'IBM Plex Mono,monospace',fontWeight:700 }}>PRIMARY</div>}
                    </div>
                    <div style={{ padding:'6px 6px 8px',display:'flex',gap:4 }}>
                      {!isPrimary && media.length>1 && <button onClick={() => onSetPrimary(m)} style={{ flex:1,padding:'7px 0',minHeight:36,background:'none',border:'1px solid rgba(200,150,62,0.4)',borderRadius:4,fontSize:9,cursor:'pointer',color:'var(--accent,#c8963e)',fontFamily:'IBM Plex Mono,monospace' }}>★ Primary</button>}
                      <button onClick={() => { setReplaceTarget(m); setTimeout(() => replaceRef.current?.click(),50) }} style={{ flex:1,padding:'7px 0',minHeight:36,background:'none',border:'1px solid var(--border,#2e3040)',borderRadius:4,fontSize:9,cursor:'pointer',color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace' }}>⇄ Swap</button>
                      <button onClick={() => onDeleteMedia(m)} style={{ flex:isPrimary||media.length===1?'0 0 auto':1,padding:'7px 8px',minHeight:36,background:'none',border:'1px solid rgba(248,113,113,0.35)',borderRadius:4,fontSize:9,cursor:'pointer',color:'#f87171',fontFamily:'IBM Plex Mono,monospace' }}>× Del</button>
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

// ─── DrawerMediaSection (inline for ItemDrawer) ───────────────────────────────

function DrawerMediaSection({ item, media, onAddMedia, onDeleteMedia, onReplaceMedia, onSetPrimary, onOpenLightbox }) {
  const addRef = useRef(null), replaceRef = useRef(null)
  const [replaceTarget, setReplaceTarget] = useState(null)
  const [uploading, setUploading] = useState(false)
  const isVid = m => m.type === 'video' || /\.(mp4|mov|webm)$/i.test(m.url)

  async function handleAdd(e) {
    const files = Array.from(e.target.files || []); if (!files.length) return; e.target.value = ''
    setUploading(true); await onAddMedia(files); setUploading(false)
  }
  async function handleReplace(e) {
    const file = e.target.files?.[0]; if (!file || !replaceTarget) return; e.target.value = ''
    setUploading(true); await onReplaceMedia(replaceTarget, file); setReplaceTarget(null); setUploading(false)
  }

  return (
    <div className="wb-drw-sec">
      <div className="wb-drw-lbl">Media</div>
      <input ref={addRef} type="file" accept="image/*,video/*" multiple style={{ display:'none' }} onChange={handleAdd} />
      <input ref={replaceRef} type="file" accept="image/*,video/*" style={{ display:'none' }} onChange={handleReplace} />
      {item.line_item_id && (
        <button onClick={() => addRef.current?.click()} disabled={uploading}
          style={{ display:'flex',alignItems:'center',gap:6,width:'100%',padding:'8px 12px',marginBottom:media.length?10:0,minHeight:36,border:`1px dashed ${uploading?'var(--accent,#c8963e)':'var(--border,#2e3040)'}`,borderRadius:5,background:'none',fontSize:11,color:uploading?'var(--accent,#c8963e)':'var(--text-muted,#6b6d82)',cursor:uploading?'wait':'pointer',fontFamily:'IBM Plex Mono,monospace' }}>
          {uploading ? 'Uploading…' : '+ Add photos / videos'}
        </button>
      )}
      {media.length > 0 && (
        <div className="wb-drw-mg">
          {media.map((m, idx) => {
            const isPrimary = idx===0, vid = isVid(m)
            return (
              <div key={m.id} style={{ borderRadius:6,overflow:'hidden',background:'#0d0e14',border:`2px solid ${isPrimary?'var(--accent,#c8963e)':'var(--border,#2e3040)'}` }}>
                <div onClick={() => onOpenLightbox(idx)} style={{ width:'100%',paddingTop:'75%',position:'relative',cursor:'pointer' }}>
                  <div style={{ position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center' }}>
                    {vid ? <span style={{ color:'#fff',fontSize:20 }}>▶</span> : <img src={m.url} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />}
                  </div>
                  {isPrimary && <div style={{ position:'absolute',top:3,left:3,fontSize:7,padding:'1px 4px',borderRadius:2,background:'var(--accent,#c8963e)',color:'#000',fontFamily:'IBM Plex Mono,monospace',fontWeight:700 }}>✦</div>}
                </div>
                <div style={{ padding:'4px',display:'flex',gap:3 }}>
                  {!isPrimary && media.length>1 && <button onClick={() => onSetPrimary(m)} style={{ flex:1,padding:'4px 0',background:'none',border:'1px solid rgba(200,150,62,0.3)',borderRadius:3,fontSize:8,cursor:'pointer',color:'var(--accent,#c8963e)',fontFamily:'IBM Plex Mono,monospace' }}>★</button>}
                  <button onClick={() => { setReplaceTarget(m); setTimeout(() => replaceRef.current?.click(),50) }} style={{ flex:1,padding:'4px 0',background:'none',border:'1px solid var(--border,#2e3040)',borderRadius:3,fontSize:8,cursor:'pointer',color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace' }}>⇄</button>
                  <button onClick={() => onDeleteMedia(m)} style={{ flex:1,padding:'4px 0',background:'none',border:'1px solid rgba(248,113,113,0.3)',borderRadius:3,fontSize:8,cursor:'pointer',color:'#f87171',fontFamily:'IBM Plex Mono,monospace' }}>×</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {!item.line_item_id && media.length===0 && (
        <div style={{ fontSize:10,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace' }}>No inspection link — media unavailable</div>
      )}
    </div>
  )
}

// ─── DrawerMatPicker ──────────────────────────────────────────────────────────

function DrawerMatPicker({ description, onApply }) {
  const [search, setSearch]   = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (search.trim().length < 1) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('inventory_items')
        .select('id,fxin,item_name,flent_price,trade')
        .gt('flent_price', 0)
        .or(`item_name.ilike.%${search}%,fxin.ilike.%${search}%`)
        .limit(10)
      setResults(data || [])
    }, 220)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!open) return
    const close = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      {description ? (
        <div style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 10px',background:'rgba(200,150,62,0.07)',border:'1px solid rgba(200,150,62,0.25)',borderRadius:5,marginBottom:6 }}>
          <div style={{ flex:1,fontSize:11,color:'var(--text,#e8e8f0)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{description}</div>
          <button type="button" onClick={() => { setOpen(true); setSearch('') }} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-muted,#6b6d82)',fontSize:11,fontFamily:'IBM Plex Mono,monospace',flexShrink:0 }}>⇄</button>
        </div>
      ) : (
        <input
          className="wb-drw-inp"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search inventory by name or FXIN…"
          style={{ marginBottom:6 }}
        />
      )}
      {open && description && (
        <input
          autoFocus
          className="wb-drw-inp"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search to replace material…"
          style={{ marginBottom:6 }}
        />
      )}
      {open && results.length > 0 && (
        <div style={{ position:'absolute',top:'100%',left:0,right:0,background:'var(--bg-panel,#1e2028)',border:'1px solid var(--border,#2e3040)',borderRadius:6,maxHeight:200,overflowY:'auto',zIndex:200,boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>
          {results.map(r => (
            <div key={r.id}
              onMouseDown={() => { onApply(r.item_name, parseFloat(r.flent_price)||0); setOpen(false); setSearch('') }}
              style={{ padding:'8px 10px',borderBottom:'1px solid var(--border,#2e3040)',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8 }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}
            >
              <div style={{ minWidth:0 }}>
                {r.fxin && <div style={{ fontSize:8,color:'var(--accent,#c8963e)',fontFamily:'IBM Plex Mono,monospace',marginBottom:1 }}>{r.fxin}</div>}
                <div style={{ fontSize:11,color:'var(--text,#e8e8f0)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.item_name}</div>
              </div>
              <div style={{ fontSize:11,fontFamily:'IBM Plex Mono,monospace',fontWeight:700,color:'var(--text,#e8e8f0)',flexShrink:0 }}>₹{fmt(r.flent_price)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── ItemDrawer ───────────────────────────────────────────────────────────────

function ItemDrawer({ item, media, allItems, itemIndex, onClose, onUpdate, onAddMedia, onDeleteMedia, onReplaceMedia, onSetPrimary, onOpenLightbox, userEmail, estimateId, onNavigate }) {
  const [drafts, setDrafts] = useState({})

  useEffect(() => { setDrafts({}) }, [item.id])

  function draft(field) {
    return field in drafts ? drafts[field] : (item[field] ?? '')
  }

  function setDraft(field, value) {
    setDrafts(p => ({ ...p, [field]: value }))
  }

  async function commit(field) {
    const value = field in drafts ? drafts[field] : null
    if (value === null) return
    setDrafts(p => { const n = { ...p }; delete n[field]; return n })
    if (value !== (item[field] ?? '')) {
      const isNum = ['material_cost', 'labour_cost', 'qty'].includes(field)
      await onUpdate(item.id, { [field]: isNum ? (parseFloat(value) || 0) : value })
    }
  }

  const tot = lineTot(item)
  const isExcluded = item.status === 'excluded'
  const isRemoved  = item.status === 'removed'

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div className="wb-drw-hd">
        <div className="wb-drw-eyebrow">{item.area || 'No area'}</div>
        <div className="wb-drw-title" style={{ textDecoration: isRemoved||isExcluded ? 'line-through' : 'none', opacity: isRemoved||isExcluded ? 0.55 : 1 }}>
          {item.item_name || 'Untitled item'}
        </div>
        <div className="wb-drw-nav">
          <span style={{ flex:1, fontSize:10, color:'var(--text-muted,#6b6d82)', fontFamily:'IBM Plex Mono,monospace' }}>
            Item {itemIndex+1} of {allItems.length}
          </span>
          <button className="wb-btn-icon" onClick={() => onNavigate(-1)} disabled={itemIndex===0} title="Previous (↑)">‹</button>
          <button className="wb-btn-icon" onClick={() => onNavigate(1)}  disabled={itemIndex===allItems.length-1} title="Next (↓)">›</button>
          <button className="wb-btn-icon" onClick={onClose} title="Close (Esc)" style={{ marginLeft:4 }}>×</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex:1, overflowY:'auto' }}>

        {/* Media */}
        <DrawerMediaSection
          item={item} media={media}
          onAddMedia={onAddMedia} onDeleteMedia={onDeleteMedia}
          onReplaceMedia={onReplaceMedia} onSetPrimary={onSetPrimary}
          onOpenLightbox={onOpenLightbox}
        />

        {/* Finding */}
        <div className="wb-drw-sec">
          <div className="wb-drw-lbl">Finding</div>
          <textarea
            className="wb-drw-ta"
            value={draft('issue_description')}
            onChange={e => setDraft('issue_description', e.target.value)}
            onBlur={() => commit('issue_description')}
            placeholder="Describe what was found…"
            rows={3}
          />
        </div>

        {/* What we'll do */}
        <div className="wb-drw-sec">
          <div className="wb-drw-lbl">What we'll do</div>
          <textarea
            className="wb-drw-ta"
            value={draft('action')}
            onChange={e => setDraft('action', e.target.value)}
            onBlur={() => commit('action')}
            placeholder="Describe the planned repair or replacement…"
            rows={2}
          />
        </div>

        {/* Cost */}
        <div className="wb-drw-sec">
          <div className="wb-drw-lbl">Cost</div>
          <DrawerMatPicker
            description={item.material_description || ''}
            onApply={(desc, price) => onUpdate(item.id, { material_description: desc, material_cost: price })}
          />
          <div className="wb-drw-row">
            <div>
              <div style={{ fontSize:9,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace',marginBottom:3 }}>MATERIAL ₹</div>
              <input type="number" className="wb-drw-inp"
                value={draft('material_cost')}
                onChange={e => setDraft('material_cost', e.target.value)}
                onBlur={() => commit('material_cost')}
                placeholder="0"
              />
            </div>
            <div>
              <div style={{ fontSize:9,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace',marginBottom:3 }}>QTY</div>
              <input type="number" className="wb-drw-inp"
                value={draft('qty')}
                onChange={e => setDraft('qty', e.target.value)}
                onBlur={() => commit('qty')}
                placeholder="1"
              />
            </div>
          </div>
          <div style={{ marginBottom:8 }}>
            <div style={{ fontSize:9,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace',marginBottom:3 }}>LABOUR DESCRIPTION</div>
            <input className="wb-drw-inp"
              value={draft('labour_description')}
              onChange={e => setDraft('labour_description', e.target.value)}
              onBlur={() => commit('labour_description')}
              placeholder="Labour work…"
            />
          </div>
          <div className="wb-drw-row">
            <div>
              <div style={{ fontSize:9,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace',marginBottom:3 }}>LABOUR ₹</div>
              <input type="number" className="wb-drw-inp"
                value={draft('labour_cost')}
                onChange={e => setDraft('labour_cost', e.target.value)}
                onBlur={() => commit('labour_cost')}
                placeholder="0"
              />
            </div>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'flex-end' }}>
              <div style={{ fontSize:9,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace',marginBottom:3 }}>TOTAL</div>
              <div style={{ fontFamily:'IBM Plex Mono,monospace', fontSize:14, fontWeight:700, color:needsPricing(item)?'#f0a050':item.cost_type==='actuals'?'#4dd9c0':'var(--accent,#c8963e)', padding:'8px 0' }}>
                {item.cost_type==='actuals' ? 'On actuals' : item.cost_type==='nil' ? 'Nil' : needsPricing(item) ? '⚠ ₹0' : `₹${fmt(tot)}`}
              </div>
            </div>
          </div>
        </div>

        {/* Type */}
        <div className="wb-drw-sec">
          <div className="wb-drw-lbl">Type</div>
          <div style={{ display:'flex', gap:6 }}>
            {[['priced','Priced',item.cost_type==='priced'],['actuals','On actuals',item.cost_type==='actuals'],['nil','Not charged',item.cost_type==='nil']].map(([ct,label,active]) => (
              <button key={ct} onClick={() => onUpdate(item.id, { cost_type: ct })}
                style={{ flex:1, padding:'9px 0', minHeight:38, borderRadius:5, border:`1px solid ${active?ct==='priced'?'var(--accent,#c8963e)':ct==='actuals'?'#4dd9c0':'rgba(147,148,168,0.4)':'var(--border,#2e3040)'}`, cursor:'pointer', fontSize:10, fontFamily:'IBM Plex Mono,monospace', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', background:active?ct==='priced'?'rgba(200,150,62,0.12)':ct==='actuals'?'rgba(77,217,192,0.1)':'rgba(147,148,168,0.08)':'none', color:active?ct==='priced'?'var(--accent,#c8963e)':ct==='actuals'?'#4dd9c0':'#9394a8':'var(--text-muted,#6b6d82)' }}
              >{label}</button>
            ))}
          </div>
          {item.cost_type==='actuals' && (
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:9,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace',marginBottom:3 }}>BALLPARK ₹ (optional)</div>
              <input type="number" className="wb-drw-inp"
                value={draft('material_cost')}
                onChange={e => setDraft('material_cost', e.target.value)}
                onBlur={() => commit('material_cost')}
                placeholder="Rough estimate…"
              />
            </div>
          )}
        </div>

        {/* Exclude */}
        <div className="wb-drw-sec">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div className="wb-drw-lbl" style={{ marginBottom:2 }}>Exclude from estimate</div>
              <div style={{ fontSize:11, color:'var(--text-muted,#6b6d82)' }}>Dims this row and removes it from the total</div>
            </div>
            <button
              onClick={() => onUpdate(item.id, { status: isExcluded ? 'pending' : 'excluded' })}
              style={{ padding:'8px 14px', borderRadius:5, border:`1px solid ${isExcluded?'rgba(248,113,113,0.45)':'var(--border,#2e3040)'}`, background:isExcluded?'rgba(248,113,113,0.1)':'none', cursor:'pointer', fontSize:11, fontFamily:'IBM Plex Mono,monospace', fontWeight:700, color:isExcluded?'#f87171':'var(--text-muted,#6b6d82)', minWidth:72 }}
            >{isExcluded ? 'Excluded' : 'Exclude'}</button>
          </div>
        </div>

        {/* Dispute thread */}
        {item.status === 'disputed' && (
          <div className="wb-drw-sec">
            <div className="wb-drw-lbl">Dispute thread</div>
            <DisputeThread itemId={item.id} estimateId={estimateId} item={item} userEmail={userEmail} onResolve={() => {}} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── RateDrawer ───────────────────────────────────────────────────────────────

function RateDrawer({ open, mode, onClose, onSelectMaterial, onSelectLabour, isMobile }) {
  const [tab, setTab]         = useState('materials')
  const [search, setSearch]   = useState('')
  const [tradeF, setTradeF]   = useState('all')
  const [matRows, setMatRows] = useState([])
  const [labRows, setLabRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setSearch(''); setTradeF('all')
    if (mode === 'swap-labour') setTab('labour')
    else setTab('materials')
  }, [open, mode])

  useEffect(() => {
    if (!open || tab !== 'materials') return
    const t = setTimeout(async () => {
      setLoading(true)
      let q = supabase.from('inventory_items').select('fxin,item_name,spec,size,trade,flent_price,market_price,price_inc,margin_percent,quantity_remaining').limit(40)
      if (search.trim()) q = q.ilike('item_name', `%${search.trim()}%`)
      if (tradeF !== 'all') q = q.eq('trade', tradeF)
      const { data } = await q.order('item_name')
      setMatRows(data || []); setLoading(false)
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
      setLabRows(data || []); setLoading(false)
    }, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [open, tab, search, tradeF])

  if (!open) return null
  const drawerW = isMobile ? '100%' : 380
  const title   = mode === 'swap-material' ? 'Swap Material' : mode === 'swap-labour' ? 'Swap Labour' : 'Add Item'
  const rows    = tab === 'materials' ? matRows : labRows

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.35)',zIndex:500 }} />
      <div style={{ position:'fixed',top:0,right:0,bottom:0,width:drawerW,background:'var(--bg-panel,#1e2028)',borderLeft:'1px solid var(--border,#2e3040)',zIndex:501,display:'flex',flexDirection:'column',boxShadow:'-8px 0 32px rgba(0,0,0,0.5)' }}>
        <div style={{ padding:'12px 14px 0',borderBottom:'1px solid var(--border,#2e3040)',flexShrink:0 }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
            <span style={{ fontSize:12,fontWeight:600,color:'var(--text,#e8e8f0)',fontFamily:'IBM Plex Mono,monospace' }}>{title}</span>
            <button onClick={onClose} style={{ width:28,height:28,background:'none',border:'none',cursor:'pointer',color:'var(--text-muted,#6b6d82)',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4 }}>×</button>
          </div>
          <div style={{ display:'flex' }}>
            {['materials','labour'].map(t => (
              <button key={t} onClick={() => { setTab(t); setSearch('') }}
                style={{ padding:'7px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12,fontFamily:'IBM Plex Mono,monospace',textTransform:'capitalize',borderBottom:tab===t?'2px solid var(--accent,#c8963e)':'2px solid transparent',color:tab===t?'var(--accent,#c8963e)':'var(--text-muted,#6b6d82)' }}
              >{t}</button>
            ))}
          </div>
        </div>
        <div style={{ padding:'9px 12px',borderBottom:'1px solid var(--border,#2e3040)',flexShrink:0,display:'flex',flexDirection:'column',gap:7 }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tab==='materials'?'Search by name or FXIN…':'Search labour…'}
            style={{ width:'100%',padding:'7px 10px',background:'var(--bg-input,#252731)',border:'1px solid var(--border,#2e3040)',borderRadius:5,color:'var(--text,#e8e8f0)',fontSize:12,outline:'none',fontFamily:'IBM Plex Mono,monospace',boxSizing:'border-box' }}
          />
          <select value={tradeF} onChange={e => setTradeF(e.target.value)}
            style={{ width:'100%',padding:'7px 10px',background:'var(--bg-input,#252731)',border:'1px solid var(--border,#2e3040)',borderRadius:5,color:tradeF==='all'?'var(--text-muted,#6b6d82)':'var(--text,#e8e8f0)',fontSize:12,outline:'none',boxSizing:'border-box' }}>
            <option value="all">All trades</option>
            {Object.keys(TRADE_COLORS).map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
        <div style={{ flex:1,overflowY:'auto' }}>
          {loading && <div style={{ padding:16,textAlign:'center',fontSize:12,color:'var(--text-muted,#6b6d82)' }}>Loading…</div>}
          {!loading && rows.length===0 && <div style={{ padding:20,textAlign:'center',fontSize:12,color:'var(--text-muted,#6b6d82)' }}>{search?'No results':`Type to search ${tab}`}</div>}
          {!loading && tab==='materials' && matRows.map(r => {
            const price = invPrice(r)
            return (
              <div key={r.fxin||r.item_name} onClick={() => onSelectMaterial(r)}
                style={{ padding:'9px 12px',borderBottom:'1px solid var(--border,#2e3040)',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8 }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ display:'flex',gap:6,alignItems:'center',marginBottom:2 }}>
                    {r.fxin && <span style={{ fontSize:9,fontWeight:700,color:'var(--accent,#c8963e)',fontFamily:'IBM Plex Mono,monospace',background:'rgba(200,150,62,0.12)',padding:'1px 5px',borderRadius:3 }}>{r.fxin}</span>}
                    {r.trade && <span style={{ fontSize:9,color:tc(r.trade),textTransform:'uppercase',letterSpacing:'0.05em' }}>{r.trade}</span>}
                  </div>
                  <div style={{ fontSize:12,color:'var(--text,#e8e8f0)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.item_name}{r.spec?` · ${r.spec}`:''}{r.size?` · ${r.size}`:''}</div>
                  {r.quantity_remaining!=null && <div style={{ fontSize:10,color:'var(--text-muted,#6b6d82)',marginTop:1 }}>{r.quantity_remaining} in stock</div>}
                </div>
                <div style={{ textAlign:'right',flexShrink:0 }}>
                  <div style={{ fontSize:13,fontFamily:'IBM Plex Mono,monospace',fontWeight:700,color:'var(--text,#e8e8f0)' }}>₹{fmt(price)}</div>
                </div>
              </div>
            )
          })}
          {!loading && tab==='labour' && labRows.map(r => (
            <div key={r.id} onClick={() => onSelectLabour(r)}
              style={{ padding:'9px 12px',borderBottom:'1px solid var(--border,#2e3040)',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8 }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:9,color:tc(r.trade),textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:2 }}>{r.trade}</div>
                <div style={{ fontSize:12,color:'var(--text,#e8e8f0)' }}>{r.work_type}</div>
                {r.unit && <div style={{ fontSize:10,color:'var(--text-muted,#6b6d82)',marginTop:1 }}>per {r.unit}</div>}
              </div>
              <div style={{ fontSize:13,fontFamily:'IBM Plex Mono,monospace',fontWeight:700,color:'var(--text,#e8e8f0)',flexShrink:0 }}>₹{fmt(r.cost_per_unit)}</div>
            </div>
          ))}
        </div>
        {mode==='add' && (
          <div style={{ padding:'9px 12px',borderTop:'1px solid var(--border,#2e3040)',flexShrink:0 }}>
            <button onClick={() => onSelectMaterial(null)}
              style={{ width:'100%',padding:'8px 0',background:'none',border:'1px dashed var(--border,#2e3040)',borderRadius:5,fontSize:11,color:'var(--text-muted,#6b6d82)',cursor:'pointer',fontFamily:'IBM Plex Mono,monospace' }}>+ Add blank row</button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EstimateWorkbench() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  // ── Data ────────────────────────────────────────────────────────────────────
  const [estimate, setEstimate]         = useState(null)
  const [items, setItems]               = useState([])
  const [inspection, setInspection]     = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [userEmail, setUserEmail]       = useState(null)
  const [versionCount, setVersionCount] = useState(1)
  const [mediaMap, setMediaMap]         = useState({})

  // ── Interaction ─────────────────────────────────────────────────────────────
  const [hoveredId, setHoveredId]   = useState(null)
  const [pinnedId, setPinnedId]     = useState(null)
  const [inList, setInList]         = useState(false)

  // ── Add/swap drawer ─────────────────────────────────────────────────────────
  const [rateDrawerOpen, setRateDrawerOpen]   = useState(false)
  const [rateDrawerMode, setRateDrawerMode]   = useState('add')
  const [rateDrawerTarget, setRateDrawerTarget] = useState(null)

  // ── Context menu ────────────────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState(null) // { itemId, x, y, status }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed]     = useState(new Set())
  const [notesEditing, setNotesEditing] = useState(false)
  const [notesDraft, setNotesDraft]   = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [generating, setGenerating]   = useState(false)
  const [copied, setCopied]           = useState(false)
  const [lightbox, setLightbox]       = useState(null)

  // ── Load ────────────────────────────────────────────────────────────────────

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
    const fetched = itemsRes.data || []
    setItems(fetched)
    setInspection(inspRes.data || null)
    setVersionCount(count || 1)
    setLoading(false)
    loadMedia(fetched)
  }

  async function loadMedia(itemsList) {
    const ids = (itemsList || items).map(i => i.line_item_id).filter(Boolean)
    if (!ids.length) { setMediaMap({}); return }
    const { data } = await supabase.from('line_item_media').select('id,line_item_id,url,type').in('line_item_id', ids).order('id', { ascending: true })
    if (data) {
      const map = {}
      data.forEach(m => { if (!map[m.line_item_id]) map[m.line_item_id] = []; map[m.line_item_id].push(m) })
      setMediaMap(map)
    }
  }

  function updateMediaList(lineItemId, fn) {
    setMediaMap(p => ({ ...p, [lineItemId]: fn(p[lineItemId] || []) }))
  }

  async function handleAddMedia(lineItemId, files) {
    for (const file of files) {
      const ext  = file.name.split('.').pop()
      const path = `workbench/${lineItemId}/${Date.now()}.${ext}`
      const { data: up, error: err } = await supabase.storage.from('inspection-media').upload(path, file, { upsert: true })
      if (err) continue
      const { data: { publicUrl } } = supabase.storage.from('inspection-media').getPublicUrl(up.path)
      const type = file.type.startsWith('video') ? 'video' : 'image'
      const { data: row } = await supabase.from('line_item_media').insert({ line_item_id: lineItemId, url: publicUrl, type }).select().single()
      if (row) updateMediaList(lineItemId, prev => [...prev, row])
    }
  }

  async function handleDeleteMedia(m) {
    if (!window.confirm('Delete this media file?')) return
    await supabase.from('line_item_media').delete().eq('id', m.id)
    const sp = m.url.split('/object/public/inspection-media/')[1]
    if (sp) await supabase.storage.from('inspection-media').remove([decodeURIComponent(sp)])
    updateMediaList(m.line_item_id, prev => prev.filter(x => x.id !== m.id))
  }

  async function handleReplaceMedia(m, file) {
    const ext  = file.name.split('.').pop()
    const path = `workbench/${m.line_item_id}/${Date.now()}.${ext}`
    const { data: up, error: err } = await supabase.storage.from('inspection-media').upload(path, file, { upsert: true })
    if (err) return
    const { data: { publicUrl } } = supabase.storage.from('inspection-media').getPublicUrl(up.path)
    const type = file.type.startsWith('video') ? 'video' : 'image'
    await supabase.from('line_item_media').update({ url: publicUrl, type }).eq('id', m.id)
    const sp = m.url.split('/object/public/inspection-media/')[1]
    if (sp) await supabase.storage.from('inspection-media').remove([decodeURIComponent(sp)])
    updateMediaList(m.line_item_id, prev => prev.map(x => x.id === m.id ? { ...x, url: publicUrl, type } : x))
  }

  async function handleSetPrimary(lineItemId, target) {
    const list = mediaMap[lineItemId] || []
    if (list.length < 2) return
    const primary = list[0]
    if (primary.id === target.id) return
    await Promise.all([
      supabase.from('line_item_media').update({ url: target.url, type: target.type }).eq('id', primary.id),
      supabase.from('line_item_media').update({ url: primary.url, type: primary.type }).eq('id', target.id),
    ])
    updateMediaList(lineItemId, prev => prev.map(x => {
      if (x.id === primary.id) return { ...x, url: target.url, type: target.type }
      if (x.id === target.id)  return { ...x, url: primary.url, type: primary.type }
      return x
    }))
  }

  // ── Item ops ────────────────────────────────────────────────────────────────

  async function updateItem(itemId, updates) {
    const safe = {}
    for (const [k, v] of Object.entries(updates)) {
      if (VALID_COLUMNS.has(k)) safe[k] = v
    }
    if (!Object.keys(safe).length) return
    const prev = items.find(i => i.id === itemId)
    setItems(p => p.map(i => i.id === itemId ? { ...i, ...safe } : i))
    const { error: err } = await supabase.from('estimate_items').update(safe).eq('id', itemId)
    if (err) {
      console.error('[updateItem]', err.message)
      setItems(p => p.map(i => i.id === itemId ? prev : i))
    }
  }

  async function duplicateItem(itemId) {
    const orig = items.find(i => i.id === itemId)
    if (!orig) return
    const { id: _, created_at: __, ...rest } = orig
    const { data: newItem } = await supabase.from('estimate_items').insert({ ...rest, sort_order: maxSort(items)+1, status: 'pending' }).select().single()
    if (newItem) setItems(p => [...p, newItem])
  }

  async function removeItem(itemId) {
    const prev = items.find(i => i.id === itemId)?.status
    setItems(p => p.map(i => i.id === itemId ? { ...i, status: 'removed' } : i))
    const { error: err } = await supabase.from('estimate_items').update({ status: 'removed' }).eq('id', itemId)
    if (err) setItems(p => p.map(i => i.id === itemId ? { ...i, status: prev } : i))
  }

  async function restoreItem(itemId) {
    setItems(p => p.map(i => i.id === itemId ? { ...i, status: 'pending' } : i))
    const { error: err } = await supabase.from('estimate_items').update({ status: 'pending' }).eq('id', itemId)
    if (err) setItems(p => p.map(i => i.id === itemId ? { ...i, status: 'removed' } : i))
  }

  // ── Add-item drawer ops ──────────────────────────────────────────────────────

  async function handleSelectMaterial(r) {
    if (rateDrawerMode === 'add') {
      const price = r ? invPrice(r) : 0
      const { data: newItem } = await supabase.from('estimate_items').insert({
        estimate_id: id, sort_order: maxSort(items)+1,
        trade: r?.trade||'', item_name: r?.item_name||'', area: '',
        issue_description: '',
        material_description: r ? `${r.item_name}${r.spec?` · ${r.spec}`:''}${r.size?` · ${r.size}`:''}` : '',
        material_cost: price, labour_description: '', labour_cost: 0,
        qty: 1, cost_type: 'priced', status: 'pending',
      }).select().single()
      if (newItem) { setItems(p => [...p, newItem]); setPinnedId(newItem.id) }
    }
    setRateDrawerOpen(false)
  }

  async function handleSelectLabour(r) {
    if (!r) return
    if (rateDrawerMode === 'add') {
      const { data: newItem } = await supabase.from('estimate_items').insert({
        estimate_id: id, sort_order: maxSort(items)+1,
        trade: r.trade||'', item_name: r.work_type||'', area: '',
        issue_description: '', material_description: '', material_cost: 0,
        labour_description: `${r.work_type}${r.unit?` · per ${r.unit}`:''}`,
        labour_cost: r.cost_per_unit||0, qty: 1, cost_type: 'priced', status: 'pending',
      }).select().single()
      if (newItem) { setItems(p => [...p, newItem]); setPinnedId(newItem.id) }
    }
    setRateDrawerOpen(false)
  }

  // ── Notes ────────────────────────────────────────────────────────────────────

  async function saveNotes() {
    setSavingNotes(true)
    await supabase.from('estimates').update({ notes: notesDraft }).eq('id', id)
    setEstimate(p => ({ ...p, notes: notesDraft }))
    setNotesEditing(false)
    setSavingNotes(false)
  }

  // ── Regenerate ───────────────────────────────────────────────────────────────

  async function handleRegenerate() {
    if (!window.confirm('Regenerate will replace all items from the inspection. Continue?')) return
    setGenerating(true)
    const inspId = estimate?.inspection_id || await resolveInspectionWithData(estimate?.pid)
    if (!inspId) { setGenerating(false); return }
    await generateEstimate(inspId, estimate?.pid, userEmail)
    await loadData()
    setGenerating(false)
  }

  // ── Share / Send ─────────────────────────────────────────────────────────────

  async function handleCopy(markSent = false) {
    const url = estimate?.share_token
      ? `${window.location.origin}/e/${estimate.share_token}`
      : `${window.location.origin}/estimate/${id}`
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url)
      else { const ta = document.createElement('textarea'); ta.value = url; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); document.body.removeChild(ta) }
    } catch (_) {}
    if (markSent && estimate?.status === 'draft') {
      await supabase.from('estimates').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id)
      await supabase.from('estimate_events').insert({ estimate_id: id, event_type: 'sent', actor: userEmail })
      setEstimate(p => ({ ...p, status: 'sent' }))
    }
    setCopied(true); setTimeout(() => setCopied(false), 2200)
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────

  const navigable = useMemo(() =>
    items.filter(i => i.status !== 'removed').sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
  , [items])

  const activeId = inList ? (hoveredId || pinnedId) : pinnedId

  useEffect(() => {
    function handle(e) {
      if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return
      const curIdx = activeId ? navigable.findIndex(i => i.id === activeId) : -1

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = navigable[curIdx+1]
        if (next) { setPinnedId(next.id); document.getElementById(`wb-row-${next.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prev = navigable[curIdx-1]
        if (prev) { setPinnedId(prev.id); document.getElementById(`wb-row-${prev.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
      } else if (e.key === 'Home') {
        e.preventDefault(); if (navigable[0]) setPinnedId(navigable[0].id)
      } else if (e.key === 'End') {
        e.preventDefault(); const last = navigable[navigable.length-1]; if (last) setPinnedId(last.id)
      } else if (e.key === 'Escape') {
        setPinnedId(null)
      } else if (activeId) {
        if (e.key === 'p' || e.key === 'P') { e.preventDefault(); updateItem(activeId, { cost_type: 'priced' }) }
        else if (e.key === 'a' || e.key === 'A') { e.preventDefault(); updateItem(activeId, { cost_type: 'actuals' }) }
        else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); updateItem(activeId, { cost_type: 'nil' }) }
        else if (e.key === 'e' || e.key === 'E') {
          e.preventDefault()
          const item = items.find(i => i.id === activeId)
          if (item) updateItem(activeId, { status: item.status === 'excluded' ? 'pending' : 'excluded' })
        }
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [activeId, navigable, items])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const tradeGroups = useMemo(() => {
    const map = {}
    for (const item of items) {
      const t = item.trade || 'Other'
      if (!map[t]) map[t] = []
      map[t].push(item)
    }
    return Object.entries(map).map(([trade, rows]) => ({
      trade,
      rows: [...rows].sort((a,b) => (a.sort_order||0)-(b.sort_order||0)),
      groupTotal: rows.filter(i => !['removed','excluded'].includes(i.status)).reduce((s,i) => s+lineTot(i), 0),
    }))
  }, [items])

  const firmTotal   = useMemo(() => items.filter(i => !['removed','excluded'].includes(i.status) && i.cost_type==='priced').reduce((s,i) => s+Math.max(lineTot(i),0), 0), [items])
  const pricedCount = useMemo(() => items.filter(i => !['removed','excluded'].includes(i.status) && i.cost_type==='priced' && !needsPricing(i)).length, [items])
  const actualsCount = useMemo(() => items.filter(i => !['removed','excluded'].includes(i.status) && i.cost_type==='actuals').length, [items])
  const noneCount    = useMemo(() => items.filter(i => !['removed','excluded'].includes(i.status) && i.cost_type==='nil').length, [items])
  const needsCount   = useMemo(() => items.filter(i => needsPricing(i)).length, [items])
  const excludedCount = useMemo(() => items.filter(i => i.status==='excluded').length, [items])

  const drawerItem = useMemo(() => {
    const id_ = inList ? (hoveredId||pinnedId) : pinnedId
    return id_ ? items.find(i => i.id === id_) || null : null
  }, [hoveredId, pinnedId, inList, items])

  const navItems     = navigable.filter(i => i.status !== 'excluded')
  const drawerIdx    = drawerItem ? navItems.findIndex(i => i.id === drawerItem.id) : -1

  function navigateDrawer(delta) {
    if (drawerIdx < 0) return
    const next = navItems[drawerIdx+delta]
    if (next) { setPinnedId(next.id); document.getElementById(`wb-row-${next.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }
  }

  // ── Early returns ─────────────────────────────────────────────────────────────

  if (loading) return <LogoSpinner full />
  if (error) return <div style={{ minHeight:'100svh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg,#16171f)',color:'#f87171',fontFamily:'IBM Plex Mono,monospace',fontSize:13 }}>{error}</div>

  const pid         = estimate?.pid || ''
  const status      = estimate?.status || 'draft'
  const statusColor = EST_STATUS_COLOR[status] || '#9898a4'
  const shareUrl    = estimate?.share_token ? `${window.location.origin}/e/${estimate.share_token}` : null

  // ── Render ────────────────────────────────────────────────────────────────────

  function renderRow(item) {
    const tot      = lineTot(item)
    const isActive = item.id === activeId
    const cls      = ['wb-row', isActive?'is-active':'', item.status==='removed'?'is-removed':'', item.status==='excluded'?'is-excluded':''].filter(Boolean).join(' ')
    const np       = needsPricing(item)
    const color    = item.color || tc(item.trade||'')

    return (
      <div
        key={item.id}
        id={`wb-row-${item.id}`}
        className={cls}
        onMouseEnter={() => setHoveredId(item.id)}
        onMouseLeave={() => setHoveredId(null)}
        onClick={() => setPinnedId(p => p === item.id ? null : item.id)}
      >
        {/* Handle */}
        <div className="wb-row-handle">⠿</div>

        {/* Area + Item */}
        <div className="wb-ident">
          {item.area && <div className="wb-ident-area">{item.area}</div>}
          <div className="wb-ident-name">{item.item_name || '—'}</div>
          {(item.status === 'disputed' || item.status === 'excluded') && (
            <div className="wb-ident-chips">
              {item.status === 'disputed' && <span className="wb-chip" style={{ background:'rgba(240,160,80,0.15)',color:'#f0a050' }}>● Disputed</span>}
              {item.status === 'excluded' && <span className="wb-chip" style={{ background:'rgba(58,60,78,0.5)',color:'#6b6d82' }}>Excluded</span>}
            </div>
          )}
        </div>

        {/* Finding → action */}
        <div className="wb-finding">
          {item.issue_description && <div className="wb-finding-text">{item.issue_description}</div>}
          {item.action && <div className="wb-finding-action">→ {item.action}</div>}
        </div>

        {/* Cost */}
        <div className="wb-cost-cell">
          {item.status === 'removed' ? (
            <span style={{ fontSize:10,color:'#f87171',fontFamily:'IBM Plex Mono,monospace' }}>Removed</span>
          ) : item.cost_type === 'actuals' ? (
            <span style={{ fontSize:10,color:'#4dd9c0',fontFamily:'IBM Plex Mono,monospace',fontWeight:600 }}>On actuals</span>
          ) : item.cost_type === 'nil' ? (
            <span style={{ fontSize:10,color:'#3a3c4e',fontFamily:'IBM Plex Mono,monospace' }}>not charged</span>
          ) : np ? (
            <span style={{ fontSize:9,color:'#f0a050',fontFamily:'IBM Plex Mono,monospace',fontWeight:600 }}>⚠ needs pricing</span>
          ) : (
            <span style={{ fontSize:13,color:'var(--accent,#c8963e)',fontFamily:'IBM Plex Mono,monospace',fontWeight:700 }}>₹{fmt(tot)}</span>
          )}
        </div>

        {/* Type segmented */}
        <div className="wb-type-seg" onClick={e => e.stopPropagation()}>
          <button className={`wb-tseg ${item.cost_type==='priced'?'p-on':''}`} onClick={() => updateItem(item.id,{cost_type:'priced'})} title="Priced (P)">P</button>
          <button className={`wb-tseg ${item.cost_type==='actuals'?'a-on':''}`} onClick={() => updateItem(item.id,{cost_type:'actuals'})} title="Actuals (A)">A</button>
          <button className={`wb-tseg ${item.cost_type==='nil'?'n-on':''}`} onClick={() => updateItem(item.id,{cost_type:'nil'})} title="None (N)">N</button>
        </div>

        {/* Media */}
        <div onClick={e => e.stopPropagation()}>
          <MediaStrip
            media={mediaMap[item.line_item_id] || []}
            onOpenPanel={() => setPinnedId(item.id)}
            onOpenLightbox={idx => setLightbox({ urls: (mediaMap[item.line_item_id]||[]).map(m=>m.url), idx })}
          />
        </div>

        {/* Kebab */}
        <div onClick={e => e.stopPropagation()}>
          <button className="wb-kebab"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              setCtxMenu({ itemId: item.id, status: item.status, x: rect.right-148, y: rect.bottom+4 })
            }}
          >⋯</button>
        </div>
      </div>
    )
  }

  return (
    <div className="wb-shell" onClick={() => { if (ctxMenu) setCtxMenu(null) }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Command bar ── */}
      <div className="wb-cmd" onClick={e => e.stopPropagation()}>
        <div className="wb-cmd-l">
          <button className="wb-btn-back" onClick={() => navigate(`/properties/${pid}/estimates`)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8 2L3 6.5 8 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:13,fontWeight:600,color:'var(--text,#e8e8f0)',whiteSpace:'nowrap' }}>PID {pid}</span>
          {inspection?.house_type && <span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:10,color:'var(--text-muted,#6b6d82)' }}>{inspection.house_type}</span>}
          <span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:10,color:'var(--text-muted,#6b6d82)' }}>v{versionCount}</span>
          {status === 'viewed' && <span className="wb-chip" style={{ background:'rgba(200,150,62,0.15)',color:'var(--accent,#c8963e)' }}>VIEWED</span>}
          <span className="wb-chip" style={{ background:`${statusColor}18`,color:statusColor }}>{status}</span>
        </div>
        <div className="wb-cmd-r">
          <button className="wb-btn wb-btn-ghost" onClick={() => setNotesEditing(p => !p)}>Notes</button>
          <button className="wb-btn wb-btn-ghost" onClick={handleRegenerate} disabled={generating}>{generating?'Regen…':'Regen'}</button>
          <div className="wb-cmd-div" />
          {shareUrl && <button className="wb-btn wb-btn-outline" onClick={() => window.open(shareUrl,'_blank')}>Preview</button>}
          <button className="wb-btn wb-btn-outline" onClick={() => handleCopy(false)}>{copied?'Copied!':'Copy link'}</button>
          <div className="wb-cmd-div" />
          <button className="wb-btn wb-btn-primary" onClick={() => handleCopy(true)}>
            {estimate?.status==='draft' ? 'Send' : 'Resend'}
          </button>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <div className="wb-sum">
        <div className="wb-pill" style={{ background:'rgba(200,150,62,0.1)',border:'1px solid rgba(200,150,62,0.25)' }}>
          <span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:9,color:'var(--text-muted,#6b6d82)',textTransform:'uppercase',letterSpacing:'0.08em' }}>Firm total</span>
          <span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:14,fontWeight:700,color:'var(--accent,#c8963e)' }}>₹{fmt(firmTotal)}</span>
        </div>
        {pricedCount > 0 && <div className="wb-pill" style={{ border:'1px solid var(--border,#2e3040)',color:'var(--text-muted,#6b6d82)' }}><span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:10 }}>Priced {pricedCount}</span></div>}
        {actualsCount > 0 && <div className="wb-pill" style={{ border:'1px solid rgba(77,217,192,0.25)',background:'rgba(77,217,192,0.07)',color:'#4dd9c0' }}><span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:10 }}>On actuals {actualsCount}</span></div>}
        {noneCount > 0 && <div className="wb-pill" style={{ border:'1px solid rgba(147,148,168,0.2)',color:'#6b6d82' }}><span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:10 }}>Not charged {noneCount}</span></div>}
        {needsCount > 0 && <div className="wb-pill" style={{ border:'1px solid rgba(240,160,80,0.35)',background:'rgba(240,160,80,0.08)',color:'#f0a050' }}><span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:10 }}>⚠ Needs pricing {needsCount}</span></div>}
        {excludedCount > 0 && <div className="wb-pill" style={{ border:'1px solid rgba(58,60,78,0.8)',color:'#6b6d82' }}><span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:10 }}>Excluded {excludedCount}</span></div>}
      </div>

      {/* ── Notes panel ── */}
      {notesEditing && (
        <div className="wb-notes-bar" onClick={e => e.stopPropagation()}>
          <textarea
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            placeholder="Internal notes for this estimate…"
            rows={3}
            style={{ flex:1,padding:'8px 10px',background:'var(--bg-input,#252731)',border:'1px solid var(--border,#2e3040)',borderRadius:5,color:'var(--text,#e8e8f0)',fontSize:13,resize:'vertical',outline:'none',fontFamily:'Inter,var(--font-sans,sans-serif)' }}
          />
          <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
            <button className="wb-btn wb-btn-primary" onClick={saveNotes} disabled={savingNotes}>{savingNotes?'Saving…':'Save'}</button>
            <button className="wb-btn wb-btn-ghost"   onClick={() => setNotesEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Body: content + drawer ── */}
      <div className="wb-body">

        {/* ── Main content ── */}
        <div
          className="wb-main"
          onMouseEnter={() => setInList(true)}
          onMouseLeave={() => { setInList(false); setHoveredId(null) }}
        >
          <div style={{ padding: '12px 0 60px' }}>
            {tradeGroups.map(({ trade, rows, groupTotal }) => {
              const color      = tc(trade)
              const isCollapsed = collapsed.has(trade)
              const groupActive = rows.some(r => r.id === activeId)

              return (
                <div key={trade} className="wb-group">
                  {/* Group header */}
                  <div className="wb-group-hd" onClick={() => setCollapsed(p => { const n=new Set(p); n.has(trade)?n.delete(trade):n.add(trade); return n })}>
                    <div style={{ width:3,height:14,borderRadius:2,background:color,flexShrink:0 }} />
                    <span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color }} >{trade}</span>
                    <span style={{ fontSize:9,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace' }}>{rows.filter(r=>r.status!=='removed').length} items</span>
                    <span style={{ flex:1 }} />
                    {groupTotal > 0 && <span style={{ fontFamily:'IBM Plex Mono,monospace',fontSize:12,fontWeight:700,color:'var(--text-dim,#9394a8)' }}>₹{fmt(groupTotal)}</span>}
                    <span style={{ fontSize:12,color:'var(--text-muted,#6b6d82)',marginLeft:8 }}>{isCollapsed?'▸':'▾'}</span>
                  </div>

                  {/* Rows */}
                  {!isCollapsed && (
                    <div className="wb-group-body" style={{ overflowX:'auto' }}>
                      <div style={{ minWidth:580 }}>
                        {rows.map(renderRow)}
                        {/* Add item */}
                        <div className="wb-add-row">
                          <button className="wb-add-btn" onClick={e => { e.stopPropagation(); setRateDrawerMode('add'); setRateDrawerOpen(true) }}>+ Add item</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add first item if no groups */}
            {tradeGroups.length === 0 && (
              <div style={{ padding:'40px 20px',textAlign:'center' }}>
                <div style={{ fontSize:12,color:'var(--text-muted,#6b6d82)',marginBottom:12 }}>No items yet</div>
                <button className="wb-btn wb-btn-outline" onClick={() => { setRateDrawerMode('add'); setRateDrawerOpen(true) }}>+ Add item</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Docked drawer (desktop ≥1101px) ── */}
        <div className="wb-drw-col">
          {drawerItem ? (
            <ItemDrawer
              key={drawerItem.id}
              item={drawerItem}
              media={mediaMap[drawerItem.line_item_id] || []}
              allItems={navItems}
              itemIndex={drawerIdx}
              onClose={() => setPinnedId(null)}
              onNavigate={delta => navigateDrawer(delta)}
              onUpdate={updateItem}
              onAddMedia={files => handleAddMedia(drawerItem.line_item_id, files)}
              onDeleteMedia={handleDeleteMedia}
              onReplaceMedia={handleReplaceMedia}
              onSetPrimary={m => handleSetPrimary(drawerItem.line_item_id, m)}
              onOpenLightbox={idx => setLightbox({ urls: (mediaMap[drawerItem.line_item_id]||[]).map(m=>m.url), idx })}
              userEmail={userEmail}
              estimateId={id}
            />
          ) : (
            <div className="wb-drw-placeholder">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <div style={{ fontSize:11,fontFamily:'IBM Plex Mono,monospace' }}>Hover a line item</div>
              <div style={{ fontSize:10,color:'var(--text-muted,#6b6d82)',fontFamily:'IBM Plex Mono,monospace' }}>or click to pin</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Overlay drawer (≤1100px) ── */}
      {pinnedId && (
        <>
          <div className="wb-overlay-scrim" onClick={() => setPinnedId(null)} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200 }} />
          <div className="wb-overlay-drw" style={{ position:'fixed',top:0,right:0,bottom:0,width:'min(100vw,420px)',background:'var(--bg-panel,#1e2028)',borderLeft:'1px solid var(--border,#2e3040)',zIndex:201,display:'flex',flexDirection:'column',boxShadow:'-8px 0 32px rgba(0,0,0,0.6)',overflowY:'auto' }}>
            {drawerItem && (
              <ItemDrawer
                key={drawerItem.id}
                item={drawerItem}
                media={mediaMap[drawerItem.line_item_id] || []}
                allItems={navItems}
                itemIndex={drawerIdx}
                onClose={() => setPinnedId(null)}
                onNavigate={delta => navigateDrawer(delta)}
                onUpdate={updateItem}
                onAddMedia={files => handleAddMedia(drawerItem.line_item_id, files)}
                onDeleteMedia={handleDeleteMedia}
                onReplaceMedia={handleReplaceMedia}
                onSetPrimary={m => handleSetPrimary(drawerItem.line_item_id, m)}
                onOpenLightbox={idx => setLightbox({ urls: (mediaMap[drawerItem.line_item_id]||[]).map(m=>m.url), idx })}
                userEmail={userEmail}
                estimateId={id}
              />
            )}
          </div>
        </>
      )}

      {/* ── Context menu ── */}
      {ctxMenu && (
        <>
          <div style={{ position:'fixed',inset:0,zIndex:599 }} onClick={() => setCtxMenu(null)} />
          <div className="wb-ctx" style={{ left:ctxMenu.x, top:ctxMenu.y }}>
            <button className="wb-ctx-item" onClick={() => { duplicateItem(ctxMenu.itemId); setCtxMenu(null) }}>Duplicate</button>
            <button className="wb-ctx-item"
              onClick={() => { const item=items.find(i=>i.id===ctxMenu.itemId); updateItem(ctxMenu.itemId,{status:item?.status==='excluded'?'pending':'excluded'}); setCtxMenu(null) }}
              style={{ color:ctxMenu.status==='excluded'?'var(--text,#e8e8f0)':'var(--text-muted,#6b6d82)' }}
            >{ctxMenu.status==='excluded' ? 'Restore' : 'Exclude'}</button>
            {ctxMenu.status === 'removed' ? (
              <button className="wb-ctx-item" style={{ color:'#4dd9c0' }} onClick={() => { restoreItem(ctxMenu.itemId); setCtxMenu(null) }}>Restore</button>
            ) : (
              <button className="wb-ctx-item" style={{ color:'#f87171' }} onClick={() => { removeItem(ctxMenu.itemId); setCtxMenu(null) }}>Remove</button>
            )}
          </div>
        </>
      )}

      {/* ── Rate drawer (add item) ── */}
      <RateDrawer
        open={rateDrawerOpen}
        mode={rateDrawerMode}
        onClose={() => setRateDrawerOpen(false)}
        onSelectMaterial={handleSelectMaterial}
        onSelectLabour={handleSelectLabour}
        isMobile={isMobile}
      />

      {/* ── Lightbox ── */}
      {lightbox && lightbox.urls.length > 0 && (
        <MediaLightbox urls={lightbox.urls} idx={lightbox.idx} onClose={() => setLightbox(null)} />
      )}

      {/* ── Keyboard hints bar ── */}
      <div className="wb-hints">
        <span className="wb-hint"><kbd>↑↓</kbd> / <kbd>j k</kbd> navigate</span>
        <span className="wb-hint"><kbd>P</kbd> priced · <kbd>A</kbd> actuals · <kbd>N</kbd> none</span>
        <span className="wb-hint"><kbd>E</kbd> exclude</span>
        <span className="wb-hint"><kbd>Esc</kbd> close</span>
      </div>
    </div>
  )
}
