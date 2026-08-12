// Extracted from Estimate.jsx — the workbench page had grown past 2,000 lines
// and these pieces have no dependency on its state.

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmt, invPrice, TRADE_COL } from '../../utils/estimateHelpers'

// ─── RateDrawer (add-item flow) ───────────────────────────────────────────────

export default function RateDrawer({ open, onClose, onSelectMaterial, onSelectLabour }) {
  const [tab, setTab]         = useState('materials')
  const [search, setSearch]   = useState('')
  const [tradeF, setTradeF]   = useState('all')
  const [matRows, setMatRows] = useState([])
  const [labRows, setLabRows] = useState([])
  const [loading, setLoading] = useState(false)

  // Reset when the drawer opens. Done during render rather than in an effect so
  // the first painted frame already shows a cleared search, not the last one.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setSearch(''); setTradeF('all'); setTab('materials') }
  }

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
