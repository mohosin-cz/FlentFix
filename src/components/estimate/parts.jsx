// Extracted from Estimate.jsx — the workbench page had grown past 2,000 lines
// and these pieces have no dependency on its state.

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt, scls, rrTxt } from '../../utils/estimateHelpers'

// ─── MediaLightbox ────────────────────────────────────────────────────────────

export function MediaLightbox({ urls, idx, onClose }) {
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

  // Reset the spinner when the displayed URL changes. Adjusting during render
  // rather than in an effect: an effect leaves one frame where the spinner is
  // off but the new video has not loaded, which flashes the poster.
  const [prevUrl, setPrevUrl] = useState(url)
  if (url !== prevUrl) { setPrevUrl(url); setVidLoading(isVid) }

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

export function TypeSeg({ type, onSet, stopProp = true }) {
  return (
    <div className="seg" onClick={stopProp ? e => e.stopPropagation() : undefined}>
      <b className={type === 'priced' ? 'on' : ''} onClick={() => onSet('priced')}>Priced</b>
      <b className={type === 'actual' ? 'on t' : ''} onClick={() => onSet('actual')}>Actual</b>
      <b className={type === 'none' ? 'on n' : ''} onClick={() => onSet('none')}>None</b>
    </div>
  )
}

// ─── ScoreChip ────────────────────────────────────────────────────────────────

// The number alone doesn't say which way is bad, and the colour only helps if
// you already know the scale — so hovering names the verdict outright.
export function ScoreChip({ score, style }) {
  if (score == null) return <span className="sc na" style={style} title="Not scored during inspection">—</span>
  return <span className={`sc ${scls(score)}`} style={style} title={`Condition ${score}/10 — ${rrTxt(score)}`}>{score}</span>
}

// ─── MediaCell (row) ──────────────────────────────────────────────────────────

export function MediaCell({ media, onOpen }) {
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

export function DrawerGallery({ item, media, onAddMedia, onDeleteMedia, onReplaceMedia, onSetPrimary, onOpenLightbox }) {
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

export function DrawerMatPicker({ description, fxin, onApply }) {
  const [search, setSearch]   = useState('')
  const [results, setResults] = useState([])
  const [picking, setPicking] = useState(false)
  const wrapRef = useRef(null)

  // The effect only fetches. Whether results are SHOWN is derived below, so
  // there is no synchronous setState here to cascade a re-render.
  useEffect(() => {
    if (!picking || search.trim().length < 1) return
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

  const shown = picking && search.trim().length >= 1 ? results : []

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
      {shown.length > 0 && (
        <div className="mat-results">
          {shown.map(r => (
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
export function ProofVideoInput({ onAddProofVideo }) {
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

// ─── FilterSelect ─────────────────────────────────────────────────────────────

// A native select, styled down. Native because it is the one control that
// already works on a phone, with a keyboard, and with a screen reader without
// being rebuilt — and a workbench filter is not worth a custom listbox.
export function FilterSelect({ label, value, onChange, options, allLabel }) {
  const on = value !== 'all'
  return (
    <label className={`fsel${on ? ' on' : ''}`}>
      <span className="fsel-l">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
        <option value="all">{allLabel}</option>
        {options.map(o => (
          <option key={o.key} value={o.key}>
            {o.label}{o.n != null ? ` (${o.n})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
