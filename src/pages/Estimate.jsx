import { useState, useEffect, useRef, useMemo, Component } from 'react'
import { HIGH_VALUE_VIDEO_THRESHOLD, validateProofVideo } from '../utils/proofVideo'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateEstimate, reconcileEstimate, resolveInspectionWithData } from '../utils/generateEstimate'
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
function uiType(ct) { return ct === 'actuals' ? 'actual' : ct === 'nil' ? 'none' : 'priced' }
function dbType(t)  { return t === 'actual' ? 'actuals' : t === 'none' ? 'nil' : 'priced' }

function rrTxt(s) { return s <= 3 ? 'replace' : s <= 6 ? 'repair' : 'ok' }
function scls(s)  { return s <= 3 ? 'lo' : s <= 6 ? 'mid' : 'hi' }
function barCol(s){ return s <= 3 ? 'var(--clay)' : s <= 6 ? 'var(--amber)' : 'var(--good)' }

const TRADE_COL = {
  woodwork:'var(--amber)',carpentry:'var(--amber)',
  electrical:'var(--blue)',plumbing:'var(--teal)',
  cleaning:'var(--good)',painting:'#a78bfa',
  civil:'var(--clay)',waterproofing:'var(--blue)',
  flooring:'var(--amber)',hvac:'var(--teal)',masonry:'var(--clay)',
}
function tc(t) { return TRADE_COL[(t||'').toLowerCase()] || 'var(--muted)' }

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

// total_cost is GENERATED in DB; fall back to computing locally
function itemTot(it) {
  if (it.total_cost != null) return it.total_cost
  return ((it.material_cost||0)+(it.labour_cost||0))*(it.qty||1)
}

function getScore(it)  { return it.inspection_line_items?.item_score ?? null }
function getNotes(it)  { return it.inspection_line_items?.notes ?? '' }
function getAvail(it)  { return it.inspection_line_items?.availability_status ?? '' }

function needsPricing(it) {
  return it.cost_type === 'priced'
    && !['removed','excluded'].includes(it.status)
    && (it.material_cost||0)+(it.labour_cost||0) === 0
}

function invPrice(r) {
  if (r.flent_price) return r.flent_price
  if (r.market_price) return r.market_price
  return Math.round((parseFloat(r.price_inc)||0)*(1+(r.margin_percent||0)/100))
}

function maxSort(items) { return items.length ? Math.max(...items.map(i => i.sort_order||0)) : 0 }

// ─── CSS (ported node-for-node from reference) ────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
:root{--bg:#0c0d11;--panel:#14161c;--panel2:#181b22;--line:#23272f;--line2:#2f343f;--ink:#eae8e2;--ink2:#c3c1ba;--muted:#868a94;--faint:#595e69;--gold:#e3aa5a;--teal:#5fb6a8;--clay:#d07050;--amber:#e1a93f;--good:#5fae6e;--blue:#6088c6;--mono:'IBM Plex Mono',ui-monospace,monospace;--sans:'Inter',system-ui,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
.ey{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.cmd{position:sticky;top:0;z-index:6;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 22px;background:rgba(12,13,17,.95);border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}
.cmd .l{display:flex;align-items:center;gap:12px}
.back{width:44px;height:44px;border:1px solid var(--line2);border-radius:5px;display:grid;place-items:center;color:var(--ink2);background:none;cursor:pointer;flex-shrink:0;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.back:hover{background:rgba(255,255,255,.06)}
.ttl{font-family:var(--mono);font-weight:600;font-size:15px;color:var(--ink)}
.sub{color:var(--muted);font-size:12px;font-family:var(--mono)}
.pill{font-family:var(--mono);font-size:10px;letter-spacing:.1em;padding:3px 7px;border-radius:4px;border:1px solid var(--line2);color:var(--muted)}
.pill.viewed{color:var(--gold);border-color:rgba(227,170,90,.4)}
.pill.status{text-transform:uppercase;letter-spacing:.08em}
.acts{display:flex;align-items:center;gap:8px}
.btn{font-size:13px;font-weight:500;padding:10px 14px;min-height:44px;border-radius:5px;border:1px solid var(--line2);background:transparent;color:var(--ink2);cursor:pointer;font-family:var(--sans);touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.btn:hover{background:rgba(255,255,255,.04)}
.btn.ghost{border-color:transparent;color:var(--muted);padding:8px 9px}
.btn.ghost:hover{color:var(--ink2);background:rgba(255,255,255,.04)}
.btn.primary{background:var(--gold);color:#231a0a;border-color:var(--gold);font-weight:600}
.btn.primary:hover{opacity:.9}
.dash{display:grid;grid-template-columns:1.15fr 1fr 1.15fr 1fr;gap:12px;padding:13px 22px;border-bottom:1px solid var(--line);background:var(--panel);transition:margin-right .16s}
.card{border:1px solid var(--line);border-radius:7px;background:var(--panel2);padding:11px 13px;display:flex;flex-direction:column;gap:9px}
.card .ct{font-family:var(--mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.big{font-family:var(--mono);font-weight:700;font-size:21px;color:var(--gold);line-height:1}
.mlrow{display:flex;justify-content:space-between;font-family:var(--mono);font-size:11px;color:var(--ink2)}
.mlrow .lbl{color:var(--muted)}
.splitbar,.stackbar{height:8px;border-radius:4px;overflow:hidden;display:flex;background:#23272f}
.splitbar i,.stackbar i{display:block;height:100%}
.condrow{display:flex;align-items:baseline;gap:9px}
.condnum{font-family:var(--mono);font-weight:700;font-size:21px;line-height:1}
.meter{height:8px;border-radius:4px;background:#23272f;overflow:hidden}
.meter>i{display:block;height:100%;border-radius:4px}
.dist,.legend{font-family:var(--mono);font-size:10px;color:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:9px}
.legend span b{color:var(--ink2);font-weight:600}
.dot{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:4px;vertical-align:middle}
.flagrow{display:flex;align-items:center;justify-content:space-between;font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.flagrow .clay{color:var(--clay)}
.board{padding:16px 22px 80px;transition:margin-right .16s}
.grp{margin-bottom:16px;border:1px solid var(--line);border-radius:7px;overflow:hidden;background:var(--panel)}
.ghead{display:flex;align-items:center;justify-content:space-between;padding:13px 13px;min-height:48px;border-bottom:1px solid var(--line);cursor:pointer;border-left:3px solid var(--muted);touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ghead:hover{background:rgba(255,255,255,.02)}
.ghead .gt{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);font-weight:600}
.ghead .gr{font-family:var(--mono);font-size:11px;color:var(--muted)}
.ghead .gr b{color:var(--ink)}
.grp-body{overflow-x:auto}
.colhead,.row{display:grid;grid-template-columns:16px 44px 148px 1fr 78px 78px 34px 88px 122px 56px 16px;gap:10px;align-items:center;padding:8px 13px;min-width:700px}
.colhead{padding:7px 13px;border-bottom:1px solid var(--line)}
.colhead span{font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
.row{border-bottom:1px solid rgba(35,39,47,.55);cursor:pointer;transition:background .1s}
.row:last-child{border-bottom:none}
.row:hover{background:var(--panel2)}
.row.active{background:rgba(227,170,90,.07);box-shadow:inset 2px 0 0 var(--gold)}
.row.dim{opacity:.5}
.hnd{color:var(--faint);font-size:12px;cursor:grab;user-select:none}
.hnd:active{cursor:grabbing}
.row.drag-over{background:rgba(227,170,90,.1)!important;box-shadow:inset 2px 0 0 var(--gold),inset 0 2px 0 rgba(227,170,90,.25)}
.grp.drag-target>.ghead{background:rgba(227,170,90,.06)}
.sc{font-family:var(--mono);font-weight:600;font-size:11px;padding:2px 0;border-radius:4px;text-align:center;display:block}
.sc.lo{color:#e8a3a3;background:rgba(208,112,80,.16);border:1px solid rgba(208,112,80,.4)}
.sc.mid{color:var(--amber);background:rgba(225,169,63,.13);border:1px solid rgba(225,169,63,.35)}
.sc.hi{color:#8fce9c;background:rgba(95,174,110,.13);border:1px solid rgba(95,174,110,.35)}
.sc.na{color:var(--faint);background:rgba(89,94,105,.1);border:1px solid rgba(89,94,105,.3)}
.idn .it{font-weight:600;color:var(--ink);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.idn .ar{font-family:var(--mono);font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.ddot{color:var(--clay);font-size:9px;margin-left:5px}
.fnd{color:var(--ink2);font-size:12px;line-height:1.4;overflow:hidden}
.fnd-txt{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fnd .wd{display:block;color:var(--muted);font-size:11px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.num{font-family:var(--mono);font-size:11.5px;color:var(--ink2)}
.mut{font-family:var(--mono);font-size:11px;color:var(--faint)}
.tot-cell{font-family:var(--mono);font-weight:600;font-size:12.5px;color:var(--ink)}
.act-cell{font-family:var(--mono);font-size:10.5px;color:var(--teal);font-style:italic}
.none-cell{font-family:var(--mono);font-size:11.5px;color:var(--faint)}
.np-cell{font-family:var(--mono);font-size:12px;color:var(--amber)}
.seg{display:inline-flex;border:1px solid var(--line2);border-radius:5px;overflow:hidden}
.seg b{font-family:var(--mono);font-size:11px;padding:8px 10px;min-height:36px;color:var(--muted);font-weight:500;cursor:pointer;user-select:none;border:none;background:none;display:flex;align-items:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.seg b:hover{background:rgba(255,255,255,.05);color:var(--ink2)}
.seg b.on{color:#231a0a;background:var(--gold);font-weight:600}
.seg b.on.t{background:var(--teal);color:#0a1f1b}
.seg b.on.n{background:#3a3f4b;color:var(--ink2)}
.med{display:flex;align-items:center;gap:1px;flex-wrap:wrap}
.med .ms{font-family:var(--mono);font-size:10px;color:var(--muted);margin-right:6px}
.add-med{font-family:var(--mono);font-size:9.5px;color:var(--faint);border:1px dashed var(--line2);border-radius:4px;padding:4px 6px;cursor:pointer}
.add-med:hover{border-color:var(--muted);color:var(--muted)}
.kb{color:var(--faint);text-align:center;font-size:12px}
.addrow{padding:12px 13px;min-height:44px;font-family:var(--mono);font-size:12px;color:var(--muted);border-top:1px solid var(--line);cursor:pointer;display:flex;align-items:center;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.addrow:hover{color:var(--ink2);background:rgba(255,255,255,.02)}
.dwr{position:fixed;top:0;right:0;height:100%;width:min(412px,100vw);background:var(--panel);border-left:1px solid var(--line2);z-index:9;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .16s}
.dwr.show{transform:none;box-shadow:-24px 0 60px rgba(0,0,0,.45)}
.dh{display:flex;align-items:flex-start;justify-content:space-between;padding:15px 18px;border-bottom:1px solid var(--line);flex-shrink:0}
.dh .ey-area{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.dh .it{font-weight:600;font-size:16px;margin-top:3px;color:var(--ink)}
.dh .cnt{font-family:var(--mono);font-size:10px;color:var(--faint);margin-top:5px}
.dnav{display:flex;align-items:center;gap:6px;flex-shrink:0}
.ic{width:44px;height:44px;border:1px solid var(--line2);border-radius:5px;display:grid;place-items:center;color:var(--ink2);cursor:pointer;font-size:15px;background:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ic:hover{background:rgba(255,255,255,.06);color:var(--ink)}
.ic:disabled{opacity:.3;cursor:default}
.db{padding:15px 18px;overflow-y:auto;flex:1}
.sec{margin-bottom:15px}
.sec>.ey{margin-bottom:7px;display:block}
.gal{display:flex;gap:8px;flex-wrap:wrap}
.gal .g{position:relative;width:80px;height:60px;border-radius:5px;background:#2a2f3a;border:1px solid var(--line2);overflow:hidden;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;color:rgba(255,255,255,.4)}
.gal .g img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;z-index:1}
.gal .g .bd{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;filter:blur(10px) brightness(0.45);transform:scale(1.1);z-index:0}
.gadd{width:60px;height:60px;border:1px dashed var(--line2);border-radius:5px;display:grid;place-items:center;color:var(--faint);font-family:var(--mono);font-size:10px;cursor:pointer;flex-shrink:0}
.gadd:hover{border-color:var(--muted);color:var(--muted)}
.fld{background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:10px 12px;color:var(--ink2);font-size:16px;line-height:1.5;min-height:44px}
.fld-ta{background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:10px 12px;color:var(--ink2);font-size:16px;line-height:1.5;width:100%;resize:vertical;outline:none;font-family:var(--sans);min-height:60px;transition:border-color .15s}
.fld-ta:focus{border-color:var(--gold)}
.crow{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)}
.crow:last-child{border-bottom:none}
.crow .lbl{color:var(--muted);font-size:12px}
.crow .val{font-family:var(--mono);font-size:12.5px;color:var(--ink2)}
.crow .inp{background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:10px 10px;color:var(--ink);font-family:var(--mono);font-size:16px;width:110px;text-align:right;outline:none;transition:border-color .15s;min-height:44px}
.crow .inp:focus{border-color:var(--gold)}
.matpick{display:flex;align-items:center;gap:8px;background:var(--panel2);border:1px solid var(--line2);border-radius:5px;padding:8px 10px;cursor:pointer;transition:border-color .15s}
.matpick:hover{border-color:var(--gold)}
.matpick .fx{font-family:var(--mono);font-size:9.5px;color:var(--muted);flex-shrink:0}
.matpick .nm{font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink2)}
.matpick .pr{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--gold);flex-shrink:0}
.mat-search{background:var(--panel2);border:1px solid var(--line2);border-radius:5px;padding:8px 10px;color:var(--ink2);font-family:var(--mono);font-size:12px;width:100%;outline:none;margin-bottom:5px;transition:border-color .15s}
.mat-search:focus{border-color:var(--gold)}
.mat-results{background:var(--panel2);border:1px solid var(--line);border-radius:5px;max-height:180px;overflow-y:auto;margin-bottom:8px}
.mat-opt{padding:7px 10px;cursor:pointer;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:8px}
.mat-opt:last-child{border-bottom:none}
.mat-opt:hover{background:rgba(255,255,255,.04)}
.mat-opt .mo-nm{font-size:12px;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mat-opt .mo-fx{font-family:var(--mono);font-size:9px;color:var(--muted)}
.mat-opt .mo-pr{font-family:var(--mono);font-size:12px;color:var(--gold);flex-shrink:0}
.tot2{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--line2)}
.tot2 .v{font-family:var(--mono);font-weight:700;font-size:18px;color:var(--gold)}
.tg{display:flex;align-items:center;justify-content:space-between}
.sw{width:38px;height:21px;border-radius:11px;background:#2a2f3a;border:1px solid var(--line2);position:relative;cursor:pointer;flex-shrink:0;transition:background .12s;display:inline-block}
.sw::after{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:var(--muted);top:2px;left:2px;transition:left .12s,background .12s}
.sw.on{background:rgba(227,170,90,.35);border-color:var(--gold)}
.sw.on::after{left:20px;background:var(--gold)}
.cbar{height:6px;border-radius:3px;background:#23272f;overflow:hidden;margin-top:9px}
.cbar>i{display:block;height:100%;border-radius:3px}
.avl{font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:5px;border:1px solid var(--line2);color:var(--muted)}
.avl.ok{color:#8fce9c;border-color:rgba(95,174,110,.4)}
.avl.proc{color:var(--amber);border-color:rgba(225,169,63,.4)}
.margin-val{color:#8fce9c}
.hist{font-family:var(--mono);font-size:11px;color:var(--muted);line-height:1.8}
.disp-box{border:1px solid rgba(208,112,80,.4);border-radius:6px;background:rgba(208,112,80,.07);padding:11px}
.disp-box .who{font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--clay)}
.disp-box .msg{font-size:12px;color:var(--ink2);margin:6px 0}
.hint{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:20;font-family:var(--mono);font-size:11px;color:var(--ink2);background:rgba(20,22,28,.95);border:1px solid var(--line2);border-radius:6px;padding:7px 13px;white-space:nowrap;pointer-events:none}
.hint kbd{font-family:var(--mono);font-size:10px;color:var(--gold);border:1px solid var(--line2);border-radius:3px;padding:0 4px;margin:0 1px}
.drw-scrim{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:8;display:none}
.notes-bar{padding:10px 22px;border-bottom:1px solid var(--line);background:var(--panel);display:flex;align-items:flex-start;gap:10px}
.ctx-menu{position:fixed;background:var(--panel);border:1px solid var(--line2);border-radius:7px;box-shadow:0 8px 32px rgba(0,0,0,.5);z-index:600;min-width:140px;overflow:hidden}
.ctx-item{display:block;width:100%;padding:9px 13px;background:none;border:none;cursor:pointer;font-size:12px;text-align:left;font-family:var(--sans);color:var(--ink2)}
.ctx-item:hover{background:rgba(255,255,255,.06)}
@media(max-width:1100px){
  .drw-scrim{display:block}
  .board,.dash{margin-right:0!important}
}
@keyframes lb-spin{to{transform:rotate(360deg)}}
.qchip{border:none;cursor:pointer;padding:0 6px;border-radius:4px;font-family:var(--mono);font-size:9px;font-weight:700;letter-spacing:.04em;margin-left:5px;height:17px;display:inline-flex;align-items:center;vertical-align:middle;line-height:1}
.qchip-open{background:rgba(240,160,80,.18);color:#f0a050}
.qchip-done{background:rgba(95,174,110,.13);color:#5fae6e}
.dwr-tabs{display:flex;border-bottom:1px solid var(--line);flex-shrink:0;background:var(--panel)}
.dwr-tab{padding:9px 14px;background:none;border:none;border-bottom:2px solid transparent;font-size:11px;font-family:var(--mono);cursor:pointer;color:var(--muted);transition:color .12s;display:flex;align-items:center;gap:5px;min-height:40px}
.dwr-tab.on{color:var(--gold);border-bottom-color:var(--gold)}
.dwr-tab-dot{width:6px;height:6px;border-radius:50%;background:#f0a050;display:inline-block}
`

// ─── MediaLightbox ────────────────────────────────────────────────────────────

function MediaLightbox({ urls, idx, onClose }) {
  const [cur, setCur]         = useState(idx)
  const [vidLoading, setVidLoading] = useState(false)
  const videoRef              = useRef(null)

  const handleClose = () => { videoRef.current?.pause(); onClose() }

  useEffect(() => {
    const h = e => {
      if (e.key === 'Escape')     { videoRef.current?.pause(); onClose() }
      if (e.key === 'ArrowRight') setCur(i => Math.min(i+1, urls.length-1))
      if (e.key === 'ArrowLeft')  setCur(i => Math.max(i-1, 0))
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [urls.length, onClose])

  const url    = urls[cur]
  const isVid  = /\.(mp4|mov|webm|m4v)$/i.test(url)
  const poster = isVid ? url.replace(/(\.[^.]+)$/, '_thumb.webp') : undefined

  // Reset spinner state whenever the displayed URL changes to a video
  useEffect(() => {
    if (isVid) setVidLoading(true)
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div onClick={handleClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.92)',zIndex:9900,display:'flex',alignItems:'center',justifyContent:'center' }}>
      <button onClick={handleClose} style={{ position:'fixed',top:14,right:14,width:34,height:34,borderRadius:'50%',background:'rgba(255,255,255,.15)',border:'none',cursor:'pointer',color:'#fff',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center',zIndex:9901 }}>×</button>
      <div onClick={e => e.stopPropagation()} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:12,maxWidth:'92vw' }}>
        {isVid ? (
          <div style={{ position:'relative',display:'flex',alignItems:'center',justifyContent:'center' }}>
            {vidLoading && (
              <div style={{ position:'absolute',top:'50%',left:'50%',marginTop:-18,marginLeft:-18,
                width:36,height:36,borderRadius:'50%',border:'3px solid rgba(255,255,255,.2)',
                borderTopColor:'#fff',animation:'lb-spin 0.65s linear infinite',zIndex:1,pointerEvents:'none' }} />
            )}
            <video
              ref={videoRef}
              key={url}
              src={url}
              poster={poster}
              controls
              playsInline
              autoPlay
              preload="metadata"
              onCanPlay={() => setVidLoading(false)}
              style={{ maxWidth:'90vw',maxHeight:'80vh',borderRadius:6,display:'block' }}
            />
          </div>
        ) : (
          <img src={url} alt="" style={{ maxWidth:'90vw',maxHeight:'80vh',objectFit:'contain',borderRadius:6 }} />
        )}
        {urls.length > 1 && (
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <button onClick={e => { e.stopPropagation(); setCur(i => Math.max(i-1,0)) }} disabled={cur===0} style={{ width:34,height:34,borderRadius:'50%',background:'rgba(255,255,255,.15)',border:'none',cursor:cur===0?'default':'pointer',color:'#fff',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',opacity:cur===0?.3:1 }}>‹</button>
            <span style={{ fontSize:11,color:'#aaa',fontFamily:'var(--mono)' }}>{cur+1} / {urls.length}</span>
            <button onClick={e => { e.stopPropagation(); setCur(i => Math.min(i+1,urls.length-1)) }} disabled={cur===urls.length-1} style={{ width:34,height:34,borderRadius:'50%',background:'rgba(255,255,255,.15)',border:'none',cursor:cur===urls.length-1?'default':'pointer',color:'#fff',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',opacity:cur===urls.length-1?.3:1 }}>›</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TypeSeg ─────────────────────────────────────────────────────────────────

function TypeSeg({ type, onSet, stopProp = true }) {
  return (
    <div className="seg" onClick={stopProp ? e => e.stopPropagation() : undefined}>
      <b className={type === 'priced' ? 'on' : ''} onClick={() => onSet('priced')}>Priced</b>
      <b className={type === 'actual' ? 'on t' : ''} onClick={() => onSet('actual')}>Actual</b>
      <b className={type === 'none' ? 'on n' : ''} onClick={() => onSet('none')}>None</b>
    </div>
  )
}

// ─── ScoreChip ────────────────────────────────────────────────────────────────

function ScoreChip({ score, style }) {
  if (score == null) return <span className="sc na" style={style}>—</span>
  return <span className={`sc ${scls(score)}`} style={style}>{score}</span>
}

// ─── MediaCell (row) ──────────────────────────────────────────────────────────

function MediaCell({ media, onOpen }) {
  const isVid  = m => m.type === 'video' || /\.(mp4|mov|webm)$/i.test(m.url)
  const photos = (media || []).filter(m => !isVid(m)).length
  const videos = (media || []).filter(m =>  isVid(m)).length
  return (
    <div className="med" onClick={e => { e.stopPropagation(); onOpen() }}>
      {photos > 0 && <span className="ms">▤ {photos}</span>}
      {videos > 0 && <span className="ms">▶ {videos}</span>}
      {photos === 0 && videos === 0 && <span className="add-med">+ add</span>}
    </div>
  )
}

// ─── DrawerGallery ────────────────────────────────────────────────────────────

function DrawerGallery({ item, media, onAddMedia, onDeleteMedia, onReplaceMedia, onSetPrimary, onOpenLightbox }) {
  const addRef = useRef(null), repRef = useRef(null)
  const [repTarget, setRepTarget] = useState(null)
  const [uploading, setUploading] = useState(false)
  const isVid = m => m.type === 'video' || /\.(mp4|mov|webm)$/i.test(m.url)

  async function handleAdd(e) {
    const files = Array.from(e.target.files||[]); if (!files.length) return; e.target.value=''
    setUploading(true); await onAddMedia(files); setUploading(false)
  }
  async function handleRep(e) {
    const f = e.target.files?.[0]; if (!f || !repTarget) return; e.target.value=''
    setUploading(true); await onReplaceMedia(repTarget, f); setRepTarget(null); setUploading(false)
  }

  return (
    <>
      <input ref={addRef} type="file" accept="image/*,video/*" multiple style={{ display:'none' }} onChange={handleAdd} />
      <input ref={repRef} type="file" accept="image/*,video/*" style={{ display:'none' }} onChange={handleRep} />
      <div className="gal">
        {media.map((m, i) => (
          <div key={m.id} style={{ position:'relative' }} title={i===0?'Primary':''}>
            <div className="g" onClick={() => onOpenLightbox(i)}>
              {isVid(m) ? (
                <>
                  <img src={m.url.replace(/(\.[^.]+)$/, '_thumb.webp')} alt="" aria-hidden="true" className="bd" onError={e => e.target.style.display='none'} />
                  <img src={m.url.replace(/(\.[^.]+)$/, '_thumb.webp')} alt="" style={{ position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',display:'block',zIndex:1 }} onError={e => e.target.style.display='none'} />
                  <span style={{ position:'relative',zIndex:2,fontSize:18,color:'#fff',textShadow:'0 1px 6px rgba(0,0,0,.8)',lineHeight:1 }}>▶</span>
                </>
              ) : (
                <>
                  <img src={m.url} alt="" aria-hidden="true" className="bd" onError={e => e.target.style.display='none'} />
                  <img src={m.url} alt="" onError={e => e.target.style.display='none'} />
                </>
              )}
            </div>
            {i === 0 && <div style={{ position:'absolute',top:2,left:2,fontSize:7,padding:'1px 4px',borderRadius:2,background:'var(--gold)',color:'#231a0a',fontFamily:'var(--mono)',fontWeight:700 }}>★</div>}
            <div style={{ display:'flex',gap:3,marginTop:3 }}>
              {i > 0 && media.length > 1 && <button onClick={() => onSetPrimary(m)} style={{ flex:1,fontSize:8,padding:'3px 0',background:'none',border:'1px solid rgba(227,170,90,.4)',borderRadius:3,color:'var(--gold)',cursor:'pointer',fontFamily:'var(--mono)' }}>★</button>}
              <button onClick={() => { setRepTarget(m); setTimeout(() => repRef.current?.click(),50) }} style={{ flex:1,fontSize:8,padding:'3px 0',background:'none',border:'1px solid var(--line)',borderRadius:3,color:'var(--muted)',cursor:'pointer',fontFamily:'var(--mono)' }}>⇄</button>
              <button onClick={() => onDeleteMedia(m)} style={{ flex:1,fontSize:8,padding:'3px 0',background:'none',border:'1px solid rgba(208,112,80,.35)',borderRadius:3,color:'var(--clay)',cursor:'pointer',fontFamily:'var(--mono)' }}>×</button>
            </div>
          </div>
        ))}
        {item.line_item_id && (
          <div className="gadd" onClick={() => !uploading && addRef.current?.click()}>
            {uploading ? '…' : '+ add'}
          </div>
        )}
      </div>
    </>
  )
}

// ─── DrawerMatPicker ──────────────────────────────────────────────────────────

function DrawerMatPicker({ description, fxin, onApply }) {
  const [search, setSearch]   = useState('')
  const [results, setResults] = useState([])
  const [picking, setPicking] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!picking || search.trim().length < 1) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('inventory_items')
        .select('id,fxin,item_name,flent_price,market_price,price_inc,margin_percent')
        .or(`item_name.ilike.%${search}%,fxin.ilike.%${search}%`)
        .gt('flent_price', 0).limit(10)
      setResults(data || [])
    }, 220)
    return () => clearTimeout(t)
  }, [search, picking])

  useEffect(() => {
    if (!picking) return
    const close = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setPicking(false); setSearch('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [picking])

  return (
    <div ref={wrapRef}>
      {description && !picking ? (
        <div className="matpick" onClick={() => setPicking(true)}>
          {fxin && <span className="fx">{fxin}</span>}
          <span className="nm">{description}</span>
          <span className="pr" style={{ fontSize:10,color:'var(--muted)' }}>⇄</span>
        </div>
      ) : (
        <input autoFocus={picking} className="mat-search"
          value={search} onChange={e => setSearch(e.target.value)}
          onFocus={() => setPicking(true)}
          placeholder="Search by name or FXIN…"
        />
      )}
      {picking && results.length > 0 && (
        <div className="mat-results">
          {results.map(r => (
            <div key={r.id} className="mat-opt"
              onMouseDown={() => { onApply(r); setPicking(false); setSearch('') }}>
              <div style={{ minWidth:0 }}>
                {r.fxin && <div className="mo-fx">{r.fxin}</div>}
                <div className="mo-nm">{r.item_name}</div>
              </div>
              <div className="mo-pr">₹{fmt(r.flent_price)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Proof video upload button (used inside dossier) ─────────────────────────
function ProofVideoInput({ onAddProofVideo }) {
  const inputRef = useRef(null)
  const [state, setState] = useState('idle') // 'idle' | 'uploading' | 'error'
  const [errMsg, setErrMsg] = useState('')
  async function handleChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setState('uploading'); setErrMsg('')
    try { await onAddProofVideo(file); setState('idle') }
    catch (err) { setErrMsg(err.message); setState('error') }
  }
  return (
    <div style={{ display:'flex',flexDirection:'column',gap:4,marginTop:4 }}>
      {errMsg && <div style={{ fontSize:11,color:'var(--clay)',fontFamily:'var(--mono)' }}>✗ {errMsg}</div>}
      <input ref={inputRef} type="file" accept="video/*" capture="environment" style={{ display:'none' }} onChange={handleChange} />
      <button type="button" disabled={state === 'uploading'}
        onClick={() => { setErrMsg(''); inputRef.current?.click() }}
        style={{ display:'flex',alignItems:'center',gap:6,padding:'7px 12px',border:'1px solid rgba(225,169,63,.4)',borderRadius:5,background:'rgba(225,169,63,.08)',color:'var(--amber)',fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:'var(--mono)',letterSpacing:'.04em',width:'fit-content' }}>
        <span>●</span>{state === 'uploading' ? 'Uploading…' : 'Add / replace proof video'}
      </button>
    </div>
  )
}

// ─── ItemDrawer (dossier) ─────────────────────────────────────────────────────

function ItemDrawer({
  item, media, allItems, itemIndex,
  onClose, onNavigate, onUpdate,
  onAddMedia, onAddProofVideo, onDeleteMedia, onReplaceMedia, onSetPrimary,
  onOpenLightbox, userEmail, estimateId, readOnly,
  initTab = 'details', disputes = [],
}) {
  const [drafts, setDrafts] = useState({})
  const [drawerTab, setDrawerTab] = useState(initTab)
  useEffect(() => setDrafts({}), [item.id])

  const hasThread = disputes?.length > 0 || item.status === 'disputed'
  const lastMsg   = disputes?.length > 0 ? disputes[disputes.length - 1] : null
  const threadUnread = lastMsg?.author_type === 'landlord'

  function dv(f) { return f in drafts ? drafts[f] : (item[f] ?? '') }
  function sd(f, v) { setDrafts(p => ({ ...p, [f]: v })) }
  async function commit(f) {
    const v = drafts[f]; if (v === undefined) return
    setDrafts(p => { const n={...p}; delete n[f]; return n })
    if (v !== (item[f] ?? '')) {
      const num = ['material_cost','labour_cost','qty'].includes(f)
      await onUpdate(item.id, { [f]: num ? (parseFloat(v)||0) : v })
    }
  }

  const type   = uiType(item.cost_type)
  const tot    = itemTot(item)
  const np     = needsPricing(item)
  const excl   = item.status === 'excluded'
  const score  = getScore(item)
  const notes  = getNotes(item)
  const avail  = getAvail(item)
  const mat    = item.material_cost || 0
  const lab    = item.labour_cost || 0
  const warr   = item.warranty || ''
  const hist   = item.created_at
    ? `Added ${new Date(item.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`
    : ''

  // Rate card: only show when we have material cost info
  const hasMat  = mat > 0 && item.material_description

  function costSection() {
    if (excl) return <div className="fld" style={{ color:'var(--muted)' }}>Excluded from this estimate.</div>
    if (type === 'none') return <><div className="matpick"><span className="nm">Not charged</span><span className="pr" style={{ color:'var(--faint)' }}>₹0</span></div><div className="tot2"><span className="ey">Total</span><span className="v" style={{ color:'var(--faint)' }}>₹0</span></div></>
    // Both 'priced' and 'actual' show editable inputs.
    // For 'actual', inputs are optional ballpark; row stays out of firm total.
    return (
      <>
        {type === 'actual' && (
          <div className="fld" style={{ color:'var(--teal)', fontStyle:'italic', marginBottom:4 }}>
            On actuals — ballpark only, not counted in firm total.
          </div>
        )}
        {np && type !== 'actual' && (
          <div className="fld" style={{ color:'var(--amber)' }}>⚠ No price yet — get a vendor quote, then set a price.</div>
        )}
        <DrawerMatPicker
          description={item.material_description || ''}
          fxin={item.material_fxin || ''}
          onApply={readOnly ? () => {} : r => onUpdate(item.id, { material_description: r.item_name, material_cost: invPrice(r) })}
        />
        <div style={{ marginTop:6 }}>
          <div className="crow">
            <span className="lbl">Material</span>
            <input className="inp" type="number" inputMode="decimal" value={dv('material_cost')} onChange={e => sd('material_cost', e.target.value)} onBlur={() => commit('material_cost')} disabled={readOnly} />
          </div>
          <div className="crow">
            <span className="lbl">Labour</span>
            <input className="inp" type="number" inputMode="decimal" value={dv('labour_cost')} onChange={e => sd('labour_cost', e.target.value)} onBlur={() => commit('labour_cost')} disabled={readOnly} />
          </div>
          <div className="crow">
            <span className="lbl">Qty</span>
            <input className="inp" type="number" inputMode="numeric" value={dv('qty')} onChange={e => sd('qty', e.target.value)} onBlur={() => commit('qty')} style={{ width:60 }} disabled={readOnly} />
          </div>
        </div>
        {type === 'priced' && <div className="tot2"><span className="ey">Total</span><span className="v">₹{fmt(tot)}</span></div>}
      </>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="dh">
        <div>
          <div className="ey-area">{item.area ? `${item.trade || ''} · ${item.area}` : (item.trade || 'Item')}</div>
          <div className="it">{item.item_name || 'Untitled'}</div>
          <div className="cnt">Item {itemIndex+1} of {allItems.length}</div>
        </div>
        <div className="dnav">
          <button className="ic" onClick={() => onNavigate(-1)} disabled={itemIndex === 0}>‹</button>
          <button className="ic" onClick={() => onNavigate(1)}  disabled={itemIndex === allItems.length-1}>›</button>
          <button className="ic" onClick={onClose}>×</button>
        </div>
      </div>

      {/* Tab bar — only when there's a thread */}
      {hasThread && (
        <div className="dwr-tabs">
          <button className={`dwr-tab ${drawerTab === 'details' ? 'on' : ''}`} onClick={() => setDrawerTab('details')}>Details</button>
          <button className={`dwr-tab ${drawerTab === 'thread' ? 'on' : ''}`} onClick={() => setDrawerTab('thread')}>
            Thread
            {threadUnread && <span className="dwr-tab-dot" />}
          </button>
        </div>
      )}

      {/* Scrollable body — Details tab */}
      {drawerTab === 'details' && <div className="db">

        {/* Media */}
        <div className="sec">
          <span className="ey">Media</span>
          <DrawerGallery item={item} media={media}
            onAddMedia={onAddMedia} onDeleteMedia={onDeleteMedia}
            onReplaceMedia={onReplaceMedia} onSetPrimary={onSetPrimary}
            onOpenLightbox={onOpenLightbox}
          />
        </div>

        {/* Proof video — shown only for high-value items */}
        {(() => {
          const itTot = ((parseFloat(item.material_cost)||0) + (parseFloat(item.labour_cost)||0)) * (item.qty||1)
          if (itTot < HIGH_VALUE_VIDEO_THRESHOLD || item.status === 'excluded' || item.status === 'removed') return null
          const proofVid = media.find(m => m.is_proof_video)
          const proofInputRef = { current: null }
          return (
            <div className="sec">
              <span className="ey">Proof Video</span>
              {proofVid ? (
                <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                  <video src={proofVid.url} poster={proofVid.url.replace(/(\.[^.]+)$/, '_thumb.webp')} preload="none" muted style={{ width:80,height:60,objectFit:'cover',borderRadius:6 }} />
                  <span style={{ fontSize:11,color:'var(--good)',fontFamily:'var(--mono)',fontWeight:600 }}>✓ Proof video on file</span>
                </div>
              ) : (
                <div style={{ padding:'10px 12px',borderRadius:6,border:'1px solid rgba(225,169,63,.4)',background:'rgba(225,169,63,.06)',display:'flex',flexDirection:'column',gap:6 }}>
                  <div style={{ fontSize:11,color:'var(--amber)',fontFamily:'var(--mono)',fontWeight:700 }}>⬤ No proof video — required for ₹{Math.round(itTot).toLocaleString('en-IN')} item</div>
                  <div style={{ fontSize:11,color:'var(--muted)' }}>10 s minimum · portrait (vertical) orientation</div>
                </div>
              )}
              {!readOnly && (
                <ProofVideoInput onAddProofVideo={onAddProofVideo} />
              )}
            </div>
          )
        })()}

        {/* Condition */}
        {score != null && (
          <div className="sec">
            <span className="ey">Condition</span>
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <ScoreChip score={score} style={{ padding:'2px 8px',display:'inline-block' }} />
              <span style={{ fontFamily:'var(--mono)',fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--muted)' }}>{rrTxt(score)}</span>
            </div>
            <div className="cbar"><i style={{ width:`${score*10}%`,background:barCol(score) }} /></div>
          </div>
        )}

        {/* Finding */}
        <div className="sec">
          <span className="ey">Finding</span>
          <textarea className="fld-ta" value={dv('issue_description')} onChange={e => sd('issue_description', e.target.value)} onBlur={() => commit('issue_description')} placeholder="Describe what was found…" rows={3} disabled={readOnly} />
        </div>

        {/* What we'll do */}
        <div className="sec">
          <span className="ey">What we'll do</span>
          <textarea className="fld-ta" value={dv('action')} onChange={e => sd('action', e.target.value)} onBlur={() => commit('action')} placeholder="Planned repair or replacement…" rows={2} disabled={readOnly} />
        </div>

        {/* Inspector notes */}
        {notes && (
          <div className="sec">
            <span className="ey">Inspector notes</span>
            <div className="fld" style={{ color:'var(--muted)' }}>{notes}</div>
          </div>
        )}

        {/* Cost */}
        <div className="sec">
          <span className="ey">Cost</span>
          {costSection()}
        </div>

        {/* Rate card (internal) */}
        {hasMat && (
          <div className="sec">
            <span className="ey">Rate card · <span style={{ color:'var(--faint)' }}>internal</span></span>
            <div className="crow"><span className="lbl">Charge</span><span className="val">₹{fmt(mat)}</span></div>
            <div className="crow" style={{ borderBottom:'none' }}><span className="lbl">Labour</span><span className="val">₹{fmt(lab)}</span></div>
          </div>
        )}

        {/* Availability */}
        {avail && (
          <div className="sec tg">
            <span className="ey">Availability</span>
            <span className={`avl ${avail === 'ok' ? 'ok' : 'proc'}`}>{avail === 'ok' ? 'In stock' : 'To procure'}</span>
          </div>
        )}

        {/* Warranty */}
        <div className="sec tg">
          <span className="ey">Warranty</span>
          <input
            style={{ background:'none',border:'none',outline:'none',fontFamily:'var(--mono)',fontSize:12,color: warr ? 'var(--ink2)' : 'var(--faint)',textAlign:'right',width:120 }}
            value={dv('warranty')} onChange={e => sd('warranty', e.target.value)} onBlur={() => commit('warranty')}
            placeholder="—" disabled={readOnly}
          />
        </div>

        {/* Type */}
        <div className="sec">
          <span className="ey">Type · <span style={{ color:'var(--faint)' }}>P / A / N</span></span>
          <TypeSeg type={type} onSet={readOnly ? () => {} : t => onUpdate(item.id, { cost_type: dbType(t) })} stopProp={false} />
        </div>

        {/* Exclude toggle */}
        {!readOnly && (
          <div className="sec tg">
            <span className="ey">Exclude · <span style={{ color:'var(--faint)' }}>E</span></span>
            <div className={`sw ${excl ? 'on' : ''}`} onClick={() => onUpdate(item.id, { status: excl ? 'pending' : 'excluded' })} />
          </div>
        )}

        {/* History */}
        {hist && (
          <div className="sec">
            <span className="ey">History</span>
            <div className="hist">{hist}</div>
          </div>
        )}

        {/* Dispute thread */}
        {item.status === 'disputed' && (
          <div className="sec">
            <span className="ey">Dispute</span>
            <div className="disp-box">
              <div className="who">Landlord dispute · open</div>
              <DisputeThread itemId={item.id} estimateId={estimateId} item={item} userEmail={userEmail} onResolve={() => {}} />
            </div>
          </div>
        )}
      </div>}

      {/* Thread tab */}
      {drawerTab === 'thread' && (
        <div className="db">
          <div className="sec">
            <QueryThread
              itemId={item.id}
              estimateId={estimateId}
              item={item}
              userEmail={userEmail}
            />
          </div>
        </div>
      )}
    </>
  )
}

// ─── RateDrawer (add-item flow) ───────────────────────────────────────────────

function RateDrawer({ open, onClose, onSelectMaterial, onSelectLabour }) {
  const [tab, setTab]         = useState('materials')
  const [search, setSearch]   = useState('')
  const [tradeF, setTradeF]   = useState('all')
  const [matRows, setMatRows] = useState([])
  const [labRows, setLabRows] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (open) { setSearch(''); setTradeF('all'); setTab('materials') } }, [open])

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
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:500 }} />
      <div style={{ position:'fixed',top:0,right:0,bottom:0,width:380,background:'var(--panel)',borderLeft:'1px solid var(--line2)',zIndex:501,display:'flex',flexDirection:'column',boxShadow:'-8px 0 32px rgba(0,0,0,.5)' }}>
        <div style={{ padding:'12px 14px 0',borderBottom:'1px solid var(--line)',flexShrink:0 }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
            <span style={{ fontFamily:'var(--mono)',fontSize:12,fontWeight:600,color:'var(--ink)' }}>Add Item</span>
            <button onClick={onClose} className="ic">×</button>
          </div>
          <div style={{ display:'flex' }}>
            {['materials','labour'].map(t => (
              <button key={t} onClick={() => { setTab(t); setSearch('') }}
                style={{ padding:'7px 14px',background:'none',border:'none',cursor:'pointer',fontSize:12,fontFamily:'var(--mono)',textTransform:'capitalize',borderBottom:tab===t?`2px solid var(--gold)`:'2px solid transparent',color:tab===t?'var(--gold)':'var(--muted)' }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding:'9px 12px',borderBottom:'1px solid var(--line)',flexShrink:0,display:'flex',flexDirection:'column',gap:7 }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'materials' ? 'Search by name or FXIN…' : 'Search labour…'}
            className="mat-search" style={{ marginBottom:0 }} />
          <select value={tradeF} onChange={e => setTradeF(e.target.value)}
            style={{ width:'100%',padding:'7px 10px',background:'var(--panel2)',border:'1px solid var(--line)',borderRadius:5,color:'var(--ink2)',fontSize:12,outline:'none' }}>
            <option value="all">All trades</option>
            {Object.keys(TRADE_COL).map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </div>
        <div style={{ flex:1,overflowY:'auto' }}>
          {loading && <div style={{ padding:16,textAlign:'center',fontSize:12,color:'var(--muted)' }}>Loading…</div>}
          {!loading && tab === 'materials' && matRows.map(r => (
            <div key={r.fxin||r.item_name} className="mat-opt" onClick={() => onSelectMaterial(r)}>
              <div style={{ minWidth:0 }}>
                {r.fxin && <div className="mo-fx">{r.fxin} · {r.trade}</div>}
                <div className="mo-nm">{r.item_name}{r.spec?` · ${r.spec}`:''}{r.size?` · ${r.size}`:''}</div>
                {r.quantity_remaining != null && <div style={{ fontSize:10,color:'var(--faint)' }}>{r.quantity_remaining} in stock</div>}
              </div>
              <div className="mo-pr">₹{fmt(invPrice(r))}</div>
            </div>
          ))}
          {!loading && tab === 'labour' && labRows.map(r => (
            <div key={r.id} className="mat-opt" onClick={() => onSelectLabour(r)}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:9,color:'var(--muted)',fontFamily:'var(--mono)',textTransform:'uppercase' }}>{r.trade}</div>
                <div className="mo-nm">{r.work_type}{r.unit?` · per ${r.unit}`:''}</div>
              </div>
              <div className="mo-pr">₹{fmt(r.cost_per_unit)}</div>
            </div>
          ))}
        </div>
        <div style={{ padding:'9px 12px',borderTop:'1px solid var(--line)',flexShrink:0 }}>
          <button onClick={() => onSelectMaterial(null)}
            style={{ width:'100%',padding:'8px 0',background:'none',border:'1px dashed var(--line)',borderRadius:5,fontSize:11,color:'var(--muted)',cursor:'pointer',fontFamily:'var(--mono)' }}>
            + Add blank row
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ items, mediaMap }) {
  const g = useMemo(() => {
    let firm=0, mat=0, lab=0, p=0, a=0, n=0, nd=0, rep=0, rpr=0, ok=0, dp=0, ng=0, np=0, ss=0, scoredCount=0
    items.forEach(it => {
      const score = getScore(it)
      if (score != null) { ss += score; scoredCount++ }
      if (score != null && score <= 3) rep++; else if (score != null && score <= 6) rpr++; else if (score != null) ok++
      if (it.status === 'disputed') dp++
      const itMedia = mediaMap[it.line_item_id] || []
      const photos = itMedia.filter(m => m.type !== 'video' && !/\.(mp4|mov|webm)$/i.test(m.url)).length
      if (!photos && it.status !== 'excluded' && it.status !== 'removed') ng++
      if (it.status !== 'excluded' && it.status !== 'removed') {
        const itTot = ((parseFloat(it.material_cost)||0) + (parseFloat(it.labour_cost)||0)) * (it.qty||1)
        if (itTot >= HIGH_VALUE_VIDEO_THRESHOLD && !itMedia.some(m => m.is_proof_video)) np++
      }
      if (it.status === 'excluded' || it.status === 'removed') return
      if (it.cost_type === 'actuals') { a++ }
      else if (it.cost_type === 'nil') { n++ }
      else {
        const tot = itemTot(it)
        if (tot > 0) {
          p++; firm += tot
          mat += (it.material_cost||0) * (it.qty||1)
          lab += (it.labour_cost||0)  * (it.qty||1)
        } else { nd++ }
      }
    })
    const total   = items.filter(i => i.status !== 'removed').length
    const cond    = scoredCount > 0 ? (ss / scoredCount).toFixed(1) : null
    const matPct  = mat+lab ? Math.round(mat/(mat+lab)*100) : 0
    const ready   = p+a+n
    const rpct    = total > 0 ? Math.round(ready/total*100) : 0
    return { firm, mat, lab, p, a, n, nd, rep, rpr, ok, dp, ng, np, cond, total, matPct, ready, rpct }
  }, [items, mediaMap])

  const stack = (c, col) => c && g.total
    ? <i key={col} style={{ width:`${Math.round(c/g.total*100)}%`,background:col }} />
    : null

  return (
    <div className="dash">
      {/* Totals */}
      <div className="card">
        <div className="ct">Totals</div>
        <div className="big">₹{fmt(g.firm)}</div>
        <div className="splitbar">
          <i style={{ width:`${g.matPct}%`,background:'var(--blue)' }} />
          <i style={{ width:`${100-g.matPct}%`,background:'var(--gold)' }} />
        </div>
        <div className="mlrow"><span className="lbl"><span className="dot" style={{ background:'var(--blue)' }}/>Materials</span><span>₹{fmt(g.mat)}</span></div>
        <div className="mlrow"><span className="lbl"><span className="dot" style={{ background:'var(--gold)' }}/>Labour</span><span>₹{fmt(g.lab)}</span></div>
      </div>

      {/* Overall condition */}
      <div className="card">
        <div className="ct">Overall condition</div>
        <div className="condrow">
          <span className="condnum" style={{ color: g.cond ? barCol(parseFloat(g.cond)) : 'var(--faint)' }}>{g.cond ?? '—'}</span>
          <span className="dist">/ 10</span>
        </div>
        <div className="meter">
          {g.cond && <i style={{ width:`${parseFloat(g.cond)*10}%`,background:barCol(parseFloat(g.cond)) }} />}
        </div>
        <div className="dist">{g.rep} replace · {g.rpr} repair · {g.ok} ok</div>
      </div>

      {/* Pricing coverage */}
      <div className="card">
        <div className="ct">Pricing coverage</div>
        <div className="stackbar">
          {stack(g.p, 'var(--gold)')}
          {stack(g.a, 'var(--teal)')}
          {stack(g.n, '#3a3f4b')}
          {stack(g.nd,'var(--amber)')}
        </div>
        <div className="legend">
          <span><span className="dot" style={{ background:'var(--gold)' }}/>Priced <b>{g.p}</b></span>
          <span><span className="dot" style={{ background:'var(--teal)' }}/>Actuals <b>{g.a}</b></span>
          <span><span className="dot" style={{ background:'#3a3f4b' }}/>None <b>{g.n}</b></span>
          <span><span className="dot" style={{ background:'var(--amber)' }}/>Needs <b>{g.nd}</b></span>
        </div>
      </div>

      {/* Send readiness */}
      <div className="card">
        <div className="ct">Send readiness</div>
        <div className="condrow">
          <span className="condnum" style={{ color:'var(--ink)',fontSize:18 }}>{g.rpct}%</span>
          <span className="dist">{g.ready}/{g.total} priced</span>
        </div>
        <div className="meter"><i style={{ width:`${g.rpct}%`,background:'var(--good)' }} /></div>
        <div className="flagrow">
          <span className="clay">● Disputed {g.dp}</span>
          <span>▤ No photo {g.ng}</span>
          {g.np > 0 && <span style={{ color:'var(--amber)' }}>⬤ No proof {g.np}</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Error boundary ───────────────────────────────────────────────────────────

class WbErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ minHeight:'100vh',background:'#0c0d11',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:24,fontFamily:'IBM Plex Mono,monospace' }}>
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

  const dragRef          = useRef(null)   // { itemId, trade }
  const activityTimers   = useRef(new Map())
  const activityFirstOld = useRef(new Map())
  const [dragOverId,    setDragOverId]    = useState(null)
  const [dragOverTrade, setDragOverTrade] = useState(null)

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    const [{ data: { user } }, { data: est }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('estimates').select('id,pid,inspection_id,status,notes,share_token,created_at,created_by,total,current_version,locked,locked_at,locked_by').eq('id', id).maybeSingle(),
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

    const [inspRes, estCountRes] = await Promise.all([
      supabase.from('inspections').select('id,pid,house_type,inspection_date').eq('id', est.inspection_id).maybeSingle(),
      supabase.from('estimates').select('id').eq('pid', est.pid),
    ])
    const fetched = itemsData || []
    setItems(fetched)
    setInspection(inspRes.data || null)
    setVersionCount(estCountRes.data?.length || 1)
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
  }

  async function loadDisputes(estId) {
    const { data } = await supabase.from('estimate_disputes').select('*').eq('estimate_id', estId).order('created_at', { ascending: true })
    if (!data) return
    const m = {}
    for (const d of data) { if (!m[d.estimate_item_id]) m[d.estimate_item_id] = []; m[d.estimate_item_id].push(d) }
    setDisputeMap(m)
  }

  async function loadMedia(itemsList) {
    const ids = (itemsList || items).map(i => i.line_item_id).filter(Boolean)
    if (!ids.length) { setMediaMap({}); return }
    const { data } = await supabase.from('line_item_media').select('id,line_item_id,url,type,is_proof_video').in('line_item_id', ids).order('id', { ascending: true })
    if (data) {
      const map = {}
      data.forEach(m => { if (!map[m.line_item_id]) map[m.line_item_id]=[]; map[m.line_item_id].push(m) })
      setMediaMap(map)
    }
  }

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

  const navigable = useMemo(() =>
    items.filter(i => i.status !== 'removed').sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
  , [items])

  const drawerItem = useMemo(() =>
    pinnedId ? items.find(i => i.id === pinnedId) || null : null
  , [pinnedId, items])

  const drawerIdx = useMemo(() =>
    drawerItem ? navigable.findIndex(i => i.id === drawerItem.id) : -1
  , [drawerItem, navigable])

  const tradeGroups = useMemo(() => {
    const map = {}
    for (const item of items) {
      const t = item.trade || ''
      if (!map[t]) map[t] = []
      map[t].push(item)
    }
    return Object.entries(map).map(([trade, rows]) => ({
      trade,
      rows: [...rows].sort((a,b) => (a.sort_order||0)-(b.sort_order||0)),
      subtotal: rows.filter(i => !['removed','excluded'].includes(i.status) && i.cost_type==='priced').reduce((s,i) => s+itemTot(i), 0),
    }))
  }, [items])

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
  }, [pinnedId, navigable, items])

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
  const isLocked = !!estimate?.locked
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
      <header className="cmd">
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
          {!isLocked && <button className="btn ghost" onClick={handleRegenerate} disabled={generating}>{generating ? 'Regen…' : 'Regen'}</button>}
          <button className="btn ghost" onClick={() => setNotesEditing(p => !p)}>Notes</button>
          {shareUrl && <button className="btn" onClick={() => window.open(shareUrl,'_blank')}>Preview</button>}
          <button className="btn" onClick={copyLink}>{copied ? 'Copied!' : 'Copy link'}</button>
          {sendError && (
            <span style={{ fontSize:11,color:'#f87171',fontFamily:'var(--mono)',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }} title={sendError}>
              ⚠ {sendError}
            </span>
          )}
          {!isLocked && (() => {
            const liveCount = items.filter(i => i.status !== 'removed').length
            const isEmpty = liveCount === 0
            return (
              <button className="btn primary" onClick={handleSend} disabled={sending || isEmpty}
                title={isEmpty ? 'Nothing to send — estimate has no items' : undefined}>
                {sending ? 'Sending…' : isEmpty ? 'No items' : status === 'draft' ? 'Send →' : 'Resend →'}
              </button>
            )
          })()}
          {!isLocked && status !== 'draft' && (
            <button className="btn ghost" onClick={handleLock} disabled={locking} style={{ color:'var(--gold)',borderColor:'rgba(200,150,62,0.4)' }}>
              {locking ? 'Locking…' : 'Mark final'}
            </button>
          )}
        </div>
      </header>

      {/* Shift content when drawer open */}
      <div style={{ marginRight: mrShift, transition:'margin-right .16s' }}>

        {/* Dashboard */}
        <Dashboard items={items} mediaMap={mediaMap} />

        {/* Notes bar */}
        {notesEditing && (
          <div className="notes-bar">
            <textarea value={notesDraft} onChange={e => setNotesDraft(e.target.value)} placeholder="Internal notes for this estimate…" rows={3}
              style={{ flex:1,padding:'8px 10px',background:'var(--panel2)',border:'1px solid var(--line)',borderRadius:5,color:'var(--ink2)',fontSize:13,resize:'vertical',outline:'none',fontFamily:'var(--sans)',transition:'border-color .15s' }}
              onFocus={e => e.target.style.borderColor='var(--gold)'} onBlur={e => e.target.style.borderColor='var(--line)'}
            />
            <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
              <button className="btn primary" onClick={saveNotes} disabled={savingNotes}>{savingNotes ? 'Saving…' : 'Save'}</button>
              <button className="btn ghost" onClick={() => setNotesEditing(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Board */}
        <main className="board">
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
                  <span className="gr"><b>{visibleRows.length} items</b> · ₹{fmt(subtotal)}</span>
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
                        const type     = uiType(item.cost_type)
                        const isActive = item.id === pinnedId
                        const isDim    = type === 'none' || item.status === 'excluded'
                        const score    = getScore(item)
                        const rowCls   = ['row', isActive?'active':'', isDim?'dim':'', dragOverId===item.id?'drag-over':''].filter(Boolean).join(' ')
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
                            <div className="hnd" draggable
                              onDragStart={e => { e.stopPropagation(); dragRef.current = { itemId: item.id, trade: item.trade || '' }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id) }}
                              onDragEnd={() => { dragRef.current = null; setDragOverId(null); setDragOverTrade(null) }}>⠿</div>
                            <div><ScoreChip score={score} /></div>
                            <div className="idn">
                              <div className="ar">{item.area || '—'}</div>
                              <div className="it">
                                {item.item_name || '—'}
                                {(() => {
                                  const ds = disputeMap[item.id]
                                  if (ds?.length) {
                                    const last = ds[ds.length - 1]
                                    const needsReply = last.author_type === 'landlord'
                                    return (
                                      <button
                                        className={needsReply ? 'qchip qchip-open' : 'qchip qchip-done'}
                                        onClick={e => { e.stopPropagation(); setDrawerInitTab('thread'); setPinnedId(item.id) }}
                                      >
                                        {needsReply ? '● Q' : '✓'}
                                      </button>
                                    )
                                  }
                                  if (item.status === 'disputed') return <span className="ddot">●</span>
                                  return null
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
