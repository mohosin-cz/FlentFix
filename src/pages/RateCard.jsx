import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import LogoSpinner from '../components/LogoSpinner'

// ─── Trade order & colors ──────────────────────────────────────────────────────
const TRADE_ORDER = ['electrical', 'plumbing', 'woodwork', 'cleaning', 'misc', 'appliances', 'lights']

const TRADE_COLORS = {
  electrical: '#b45309',
  plumbing:   '#1d4ed8',
  woodwork:   '#92400e',
  cleaning:   '#065f46',
  misc:       '#374151',
  appliances: '#1e40af',
  lights:     '#d97706',
}

// Soft background tints for the left border accent
const TRADE_BG = {
  electrical: 'rgba(180,83,9,0.08)',
  plumbing:   'rgba(29,78,216,0.08)',
  woodwork:   'rgba(146,64,14,0.08)',
  cleaning:   'rgba(6,95,70,0.08)',
  misc:       'rgba(55,65,81,0.08)',
  appliances: 'rgba(30,64,175,0.08)',
  lights:     'rgba(217,119,6,0.08)',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 640)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth <= 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return isMobile
}

function fmt(n) {
  return (n || 0).toLocaleString('en-IN')
}

function titleCase(str) {
  return (str || '').replace(/\b\w/g, c => c.toUpperCase())
}

function groupByTrade(items) {
  const map = items.reduce((acc, item) => {
    const key = (item.trade || 'misc').toLowerCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  // Sort by defined trade order, then alpha for unknowns
  const ordered = []
  TRADE_ORDER.forEach(t => { if (map[t]) ordered.push([t, map[t]]) })
  Object.keys(map).sort().forEach(t => {
    if (!TRADE_ORDER.includes(t)) ordered.push([t, map[t]])
  })
  return ordered
}

// ─── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;1,400;1,500&family=Urbanist:wght@400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .rc-root {
    min-height: 100dvh;
    background: #f9f6f1;
    color: #1c1c2e;
    font-family: 'Urbanist', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Top bar ── */
  .rc-topbar {
    position: sticky; top: 0; z-index: 50;
    background: #f9f6f1;
    border-bottom: 1.5px solid rgba(28,28,46,0.1);
    height: 56px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 32px;
  }
  .rc-logo-pill {
    background: #fff;
    border: 1.5px solid #3b3fa0;
    border-radius: 100px;
    padding: 7px 20px;
    font-family: 'Fraunces', Georgia, serif;
    font-size: 15px; font-weight: 500;
    color: #3b3fa0;
    letter-spacing: -0.02em;
    line-height: 1;
    text-decoration: none;
  }
  .rc-topbar-tag {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #9ca3af;
    font-family: monospace;
  }

  /* ── Max-width wrapper ── */
  .rc-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 0 24px 100px;
  }

  /* ── Hero ── */
  .rc-hero {
    padding: 40px 0 18px;
  }
  .rc-hero-title {
    font-family: 'Urbanist', system-ui, sans-serif;
    font-size: clamp(22px, 5vw, 30px);
    font-weight: 600;
    color: #1c1c2e;
    line-height: 1.15;
    margin-bottom: 6px;
  }
  .rc-hero-em {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    color: #3b3fa0;
  }
  .rc-gst-note {
    font-size: 13px;
    color: #9ca3af;
    margin-top: 10px;
    padding: 8px 14px;
    background: rgba(59,63,160,0.06);
    border: 1px solid rgba(59,63,160,0.14);
    border-radius: 8px;
    display: inline-block;
    font-style: italic;
  }

  /* ── Tabs ── */
  .rc-tabs {
    display: flex;
    margin: 28px 0 0;
    border-bottom: 1.5px solid rgba(28,28,46,0.1);
  }
  .rc-tab {
    padding: 11px 24px;
    font-size: 13px;
    font-weight: 600;
    background: none;
    border: none;
    border-bottom: 2.5px solid transparent;
    margin-bottom: -1.5px;
    cursor: pointer;
    color: #9ca3af;
    transition: color 0.15s, border-color 0.15s;
    font-family: 'Urbanist', system-ui, sans-serif;
  }
  .rc-tab.active {
    color: #3b3fa0;
    border-bottom-color: #3b3fa0;
  }
  .rc-tab:hover:not(.active) {
    color: #1c1c2e;
  }

  /* ── Trade group ── */
  .rc-trade-group {
    margin-top: 32px;
  }
  .rc-trade-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(28,28,46,0.08);
  }
  .rc-trade-badge {
    display: inline-block;
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .rc-trade-name {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .rc-trade-count {
    margin-left: auto;
    font-size: 10px;
    font-family: monospace;
    color: #9ca3af;
    letter-spacing: 0.04em;
  }

  /* ── Item card ── */
  .rc-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    background: #fff;
    border-radius: 10px;
    border: 1.5px solid rgba(28,28,46,0.08);
    margin-bottom: 8px;
    min-height: 44px;
    border-left: 3px solid transparent;
  }
  .rc-item-left {
    flex: 1;
    min-width: 0;
  }
  .rc-item-name {
    font-size: 14px;
    font-weight: 600;
    color: #1c1c2e;
    line-height: 1.3;
    margin-bottom: 3px;
  }
  .rc-item-spec {
    font-size: 12px;
    color: #9ca3af;
    line-height: 1.4;
  }
  .rc-item-unit {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 2px;
    font-style: italic;
  }
  .rc-item-right {
    flex-shrink: 0;
    text-align: right;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
  }
  .rc-market-price {
    font-size: 11px;
    color: #9ca3af;
    text-decoration: line-through;
    font-family: monospace;
    white-space: nowrap;
  }
  .rc-market-label {
    font-size: 9px;
    color: #c4c9d4;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-family: monospace;
    margin-top: -1px;
  }
  .rc-flent-price {
    font-size: 16px;
    font-weight: 700;
    color: #3b3fa0;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .rc-flent-label {
    font-size: 9px;
    color: rgba(59,63,160,0.6);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-family: monospace;
  }

  /* ── Footer ── */
  .rc-footer {
    border-top: 1.5px solid rgba(28,28,46,0.08);
    padding: 28px 24px;
    text-align: center;
    margin-top: 40px;
  }
  .rc-footer-gst {
    font-size: 12px;
    color: #9ca3af;
    font-style: italic;
    margin-bottom: 8px;
  }
  .rc-footer-brand {
    font-family: 'Fraunces', Georgia, serif;
    font-style: italic;
    font-size: 13px;
    color: #3b3fa0;
    opacity: 0.7;
  }

  /* ── Empty state ── */
  .rc-empty {
    text-align: center;
    padding: 48px 24px;
    color: #9ca3af;
    font-size: 13px;
  }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .rc-topbar { padding: 0 16px; height: 48px; }
    .rc-container { padding: 0 16px 80px; }
    .rc-hero { padding: 28px 0 14px; }
    .rc-tabs { margin: 20px 0 0; }
    .rc-tab { padding: 10px 16px; font-size: 12px; }

    .rc-item {
      padding: 12px 13px;
    }
    .rc-item-right {
      align-items: flex-end;
    }
    .rc-flent-price { font-size: 15px; }
  }

  @media (max-width: 390px) {
    /* Stack price block vertically on very narrow screens */
    .rc-item {
      flex-direction: column;
      align-items: flex-start;
    }
    .rc-item-right {
      align-items: flex-start;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
  }
`

// ─── Component ─────────────────────────────────────────────────────────────────
export default function RateCard() {
  const [tab, setTab]           = useState('materials') // 'materials' | 'labour'
  const [materials, setMaterials] = useState([])
  const [labour, setLabour]     = useState([])
  const [loading, setLoading]   = useState(true)
  // eslint-disable-next-line no-unused-vars
  const isMobile = useIsMobile()

  // ── Data fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase
        .from('inventory_items')
        .select('id, item_name, spec, trade, flent_price, market_price')
        .gt('flent_price', 0)
        .order('trade', { ascending: true })
        .order('item_name', { ascending: true }),
      supabase
        .from('labour_rates')
        .select('id, work_type, unit, cost_per_unit, trade, market_price')
        .eq('is_internal', false)
        .order('trade', { ascending: true })
        .order('work_type', { ascending: true }),
    ]).then(([{ data: matData }, { data: labData }]) => {
      setMaterials(matData || [])
      setLabour(labData || [])
      setLoading(false)
    })
  }, [])

  // ── Grouped data ────────────────────────────────────────────────────────────
  const matGroups = groupByTrade(materials)
  const labGroups = groupByTrade(labour)

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <LogoSpinner full />

  return (
    <div className="rc-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Top bar ── */}
      <div className="rc-topbar">
        <span className="rc-logo-pill">flent</span>
        <span className="rc-topbar-tag">Rate Card</span>
      </div>

      <div className="rc-container">

        {/* ── Hero ── */}
        <div className="rc-hero">
          <h1 className="rc-hero-title">
            Transparent pricing,{' '}
            <span className="rc-hero-em">no surprises.</span>
          </h1>
          <p className="rc-gst-note">All prices exclusive of GST.</p>
        </div>

        {/* ── Tabs ── */}
        <div className="rc-tabs" role="tablist">
          {[
            { key: 'materials', label: 'Materials' },
            { key: 'labour',    label: 'Labour' },
          ].map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`rc-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Materials tab ── */}
        {tab === 'materials' && (
          <div role="tabpanel">
            {matGroups.length === 0 ? (
              <div className="rc-empty">No materials listed yet.</div>
            ) : (
              matGroups.map(([trade, items]) => {
                const color = TRADE_COLORS[trade] || TRADE_COLORS.misc
                const bg    = TRADE_BG[trade]    || TRADE_BG.misc
                return (
                  <div key={trade} className="rc-trade-group">
                    <div className="rc-trade-head">
                      <span
                        className="rc-trade-badge"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                      <span
                        className="rc-trade-name"
                        style={{ color }}
                      >
                        {titleCase(trade)}
                      </span>
                      <span className="rc-trade-count">
                        {items.length} item{items.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {items.map(item => {
                      const hasMarket = parseFloat(item.market_price) > 0
                      return (
                        <div
                          key={item.id}
                          className="rc-item"
                          style={{ borderLeftColor: bg ? color : 'transparent', background: '#fff' }}
                        >
                          <div className="rc-item-left">
                            <div className="rc-item-name">{item.item_name}</div>
                            {item.spec && (
                              <div className="rc-item-spec">{item.spec}</div>
                            )}
                          </div>
                          <div className="rc-item-right">
                            {hasMarket && (
                              <>
                                <span className="rc-market-price">
                                  ₹{fmt(item.market_price)}
                                </span>
                                <span className="rc-market-label">typical market</span>
                              </>
                            )}
                            <span className="rc-flent-price">
                              ₹{fmt(item.flent_price)}
                            </span>
                            <span className="rc-flent-label">Flent price</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── Labour tab ── */}
        {tab === 'labour' && (
          <div role="tabpanel">
            {labGroups.length === 0 ? (
              <div className="rc-empty">No labour rates listed yet.</div>
            ) : (
              labGroups.map(([trade, items]) => {
                const color = TRADE_COLORS[trade] || TRADE_COLORS.misc
                return (
                  <div key={trade} className="rc-trade-group">
                    <div className="rc-trade-head">
                      <span
                        className="rc-trade-badge"
                        style={{ background: color }}
                        aria-hidden="true"
                      />
                      <span
                        className="rc-trade-name"
                        style={{ color }}
                      >
                        {titleCase(trade)}
                      </span>
                      <span className="rc-trade-count">
                        {items.length} item{items.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {items.map(row => {
                      const hasMarket = parseFloat(row.market_price) > 0
                      return (
                        <div
                          key={row.id}
                          className="rc-item"
                          style={{ borderLeftColor: color }}
                        >
                          <div className="rc-item-left">
                            <div className="rc-item-name">{row.work_type}</div>
                            {row.unit && (
                              <div className="rc-item-unit">per {row.unit}</div>
                            )}
                          </div>
                          <div className="rc-item-right">
                            {hasMarket && (
                              <>
                                <span className="rc-market-price">
                                  ₹{fmt(row.market_price)}
                                </span>
                                <span className="rc-market-label">typical market</span>
                              </>
                            )}
                            <span className="rc-flent-price">
                              ₹{fmt(row.cost_per_unit)}
                            </span>
                            <span className="rc-flent-label">Flent rate</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="rc-footer">
          <p className="rc-footer-gst">All prices are exclusive of GST.</p>
          <p className="rc-footer-brand">flent — trusted home care</p>
        </div>

      </div>
    </div>
  )
}
