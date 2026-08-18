// Extracted from Estimate.jsx — the workbench page had grown past 2,000 lines
// and these pieces have no dependency on its state.

import { useState } from 'react'
import { uiType, dbType, rrTxt, barCol, fmt, itemTot, getScore, getNotes, getAvail, invPrice, needsPricing } from '../../utils/estimateHelpers'
import { HIGH_VALUE_VIDEO_THRESHOLD } from '../../utils/proofVideo'
import DisputeThread from '../DisputeThread'
import QueryThread from '../QueryThread'
import { TypeSeg, ScoreChip, DrawerGallery, DrawerMatPicker, ProofVideoInput } from './parts'

// ─── ItemDrawer (dossier) ─────────────────────────────────────────────────────

export default function ItemDrawer({
  item, media, allItems, itemIndex,
  onClose, onNavigate, onUpdate,
  onAddMedia, onAddProofVideo, onDeleteMedia, onReplaceMedia, onSetPrimary,
  onOpenLightbox, userEmail, estimateId, readOnly,
  initTab = 'details', disputes = [],
}) {
  const [drafts, setDrafts] = useState({})
  const [drawerTab, setDrawerTab] = useState(initTab)
  // Drafts used to be cleared by an effect on item.id; the drawer is keyed by
  // item id at the call site now, so a different item is a fresh component and
  // there is no stale-draft window between render and effect.

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
          return (
            <div className="sec">
              <span className="ey">Proof Video</span>
              {proofVid ? (
                <div style={{ display:'flex',alignItems:'center',gap:10 }}>
                  {/* playsInline: without it Android takes an 80×60 thumbnail
                      fullscreen the moment it is touched. */}
                  <video src={proofVid.url} poster={proofVid.url.replace(/(\.[^.]+)$/, '_thumb.webp')} preload="none" muted playsInline style={{ width:80,height:60,objectFit:'cover',borderRadius:6 }} />
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
