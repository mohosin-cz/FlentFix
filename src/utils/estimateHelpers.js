// Pure helpers shared by the estimate workbench and the pieces split out of it.
// Extracted so a component in components/estimate can use them without importing
// from a 2,000-line page module.

export function uiType(ct) { return ct === 'actuals' ? 'actual' : ct === 'nil' ? 'none' : 'priced' }
export function dbType(t)  { return t === 'actual' ? 'actuals' : t === 'none' ? 'nil' : 'priced' }

export const TRADE_COL = {
  woodwork:'var(--amber)',carpentry:'var(--amber)',
  electrical:'var(--blue)',plumbing:'var(--teal)',
  cleaning:'var(--good)',painting:'#a78bfa',
  civil:'var(--clay)',waterproofing:'var(--blue)',
  flooring:'var(--amber)',hvac:'var(--teal)',masonry:'var(--clay)',
}
export function tc(t) { return TRADE_COL[(t||'').toLowerCase()] || 'var(--muted)' }

export function rrTxt(s) { return s <= 3 ? 'replace' : s <= 6 ? 'repair' : 'ok' }
export function scls(s)  { return s <= 3 ? 'lo' : s <= 6 ? 'mid' : 'hi' }
export function barCol(s){ return s <= 3 ? 'var(--clay)' : s <= 6 ? 'var(--amber)' : 'var(--good)' }

export function fmt(n) { return (n || 0).toLocaleString('en-IN') }

export function itemTot(it) {
  // total_cost wins when present — it is the generated column and already
  // accounts for qty. Recomputing would silently disagree with the database.
  if (it.total_cost != null) return it.total_cost
  return ((it.material_cost || 0) + (it.labour_cost || 0)) * (it.qty || 1)
}

export function getScore(it)  { return it.inspection_line_items?.item_score ?? null }
export function getNotes(it)  { return it.inspection_line_items?.notes ?? '' }
export function getAvail(it)  { return it.inspection_line_items?.availability_status ?? '' }

export function maxSort(items) { return items.length ? Math.max(...items.map(i => i.sort_order || 0)) : 0 }

// "3d", "5h", "just now" — a duration you can read at a glance rather than a
// date you have to subtract in your head.
export function ago(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return mins < 1 ? 'just now' : `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return days < 31 ? `${days}d` : `${Math.floor(days / 30)}mo`
}

// A priced row that nobody has put a number against yet.
export function needsPricing(it) {
  return it.cost_type === 'priced'
    && !['removed', 'excluded'].includes(it.status)
    && (it.material_cost || 0) + (it.labour_cost || 0) === 0
}

// What a rate-card row costs us: an explicit Flent price wins, then market,
// then the inclusive price marked up.
export function invPrice(r) {
  if (r.flent_price) return r.flent_price
  if (r.market_price) return r.market_price
  return Math.round((parseFloat(r.price_inc) || 0) * (1 + (r.margin_percent || 0) / 100))
}
