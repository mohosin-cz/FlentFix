import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LogoSpinner from '../components/LogoSpinner'

// ─── Hero copy (edit here to update the headline) ─────────────────────────────
const HERO_TITLE    = 'Your home, cared for'
const HERO_SUBTITLE = 'before anyone moves in.'

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  :root {
    --flent-display:    'Fraunces', Georgia, serif;       /* SWAP: real Flent font later */
    --flent-sans:       'Nunito Sans', system-ui, sans-serif; /* SWAP: real Flent font later */
    --flent-cream:      #F5F2EC;
    --flent-indigo:     #2A2456;
    --flent-indigo-ink: #1C1838;
    --flent-muted:      #5A5570;
    --flent-line:       #E4DECF;
    --flent-apricot:    #F0C9A0;
    --flent-olive:      #3C5A3F;
  }

  *, *::before, *::after { box-sizing: border-box; }

  .le-wrap {
    min-height: 100dvh;
    background-color: var(--flent-cream);
    background-image: radial-gradient(circle at 1px 1px, rgba(42,36,86,0.05) 1px, transparent 0);
    background-size: 22px 22px;
    padding-bottom: 120px;
    font-family: var(--flent-sans);
    color: var(--flent-indigo-ink);
    -webkit-font-smoothing: antialiased;
  }

  /* ── Top bar ── */
  .le-topbar {
    background: var(--flent-cream);
    background-image: radial-gradient(circle at 1px 1px, rgba(42,36,86,0.05) 1px, transparent 0);
    background-size: 22px 22px;
    border-bottom: 1.5px solid var(--flent-line);
    height: 56px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 32px;
    position: sticky; top: 0; z-index: 50;
  }
  /* TODO: swap for real Flent logo asset when provided */
  .le-logo-pill {
    background: #fff;
    border: 1.5px solid var(--flent-indigo);
    border-radius: 100px;
    padding: 7px 20px;
    font-family: var(--flent-display);
    font-size: 15px; font-weight: 500;
    color: var(--flent-indigo);
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .le-topbar-tag {
    font-size: 9px; font-family: monospace;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--flent-muted);
  }

  /* ── Max-width container ── */
  .le-container {
    max-width: 760px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* ── Hero ── */
  .le-hero { padding: 40px 0 28px; }
  .le-hero-h1 {
    font-family: var(--flent-sans);
    font-size: clamp(22px, 6vw, 30px);
    font-weight: 500; color: var(--flent-indigo-ink);
    line-height: 1.2; margin: 0;
  }
  .le-hero-em {
    font-family: var(--flent-display);
    font-style: italic; font-weight: 400; display: block;
  }
  .le-hero-sub {
    font-size: 14px; color: var(--flent-muted);
    margin-top: 10px; line-height: 1.6;
  }

  /* ── Meta card ── */
  .le-meta-card {
    background: #fff;
    border-radius: 14px; border: 1.5px solid var(--flent-line);
    display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;
    overflow: hidden; margin-bottom: 14px;
  }
  .le-meta-cell {
    padding: 18px 20px;
    border-right: 1px solid var(--flent-line);
  }
  .le-meta-cell:last-child { border-right: none; }
  .le-meta-lbl {
    font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--flent-muted); margin-bottom: 6px;
    font-family: monospace; display: block;
  }
  .le-meta-val {
    font-size: 13px; font-weight: 600;
    color: var(--flent-indigo-ink); line-height: 1.3;
  }

  /* ── Stats row ── */
  .le-stats-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
    gap: 10px; margin-bottom: 24px;
  }
  .le-stat-card {
    background: #fff;
    border-radius: 12px; border: 1.5px solid var(--flent-line);
    padding: 14px 16px;
  }
  .le-stat-card-total {
    background: var(--flent-indigo);
    border-color: var(--flent-indigo);
  }
  .le-stat-num {
    font-family: var(--flent-display);
    font-size: 22px; font-weight: 400;
    color: var(--flent-indigo-ink);
    line-height: 1; margin-bottom: 4px;
    font-variant-numeric: tabular-nums;
  }
  .le-stat-card-total .le-stat-num { color: var(--flent-cream); }
  .le-stat-lbl {
    font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--flent-muted);
    font-family: monospace;
  }
  .le-stat-card-total .le-stat-lbl { color: rgba(245,242,236,0.55); }

  /* ── Banners ── */
  .le-banner {
    background: #fff; border: 1.5px solid var(--flent-line);
    border-radius: 10px; padding: 14px 18px; margin-bottom: 20px;
    display: flex; align-items: flex-start; gap: 10px;
  }
  .le-banner-dot {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--flent-indigo); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 10px; flex-shrink: 0; margin-top: 1px;
  }
  .le-banner-text {
    font-size: 13px; color: var(--flent-muted);
    line-height: 1.6;
  }
  .le-approved-banner {
    background: rgba(60,90,63,0.07); border: 1.5px solid rgba(60,90,63,0.22);
    border-radius: 10px; padding: 14px 18px; margin-bottom: 20px;
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: var(--flent-olive);
  }

  /* ── Trade groups ── */
  .le-trade-group { margin-bottom: 28px; }
  .le-trade-head {
    display: flex; align-items: baseline; justify-content: space-between;
    padding-bottom: 10px;
    border-bottom: 1.5px solid var(--flent-indigo);
    margin-bottom: 12px;
  }
  .le-trade-name {
    font-family: var(--flent-display);
    font-size: 20px; font-weight: 500;
    color: var(--flent-indigo-ink); letter-spacing: -0.01em;
  }
  .le-trade-meta {
    font-size: 10px; font-family: monospace;
    color: var(--flent-muted); letter-spacing: 0.04em; white-space: nowrap;
  }

  /* ── Item card ── */
  .le-item {
    background: #fff; border-radius: 12px;
    border: 1.5px solid var(--flent-line);
    padding: 16px; margin-bottom: 10px;
    transition: border-color 0.15s;
  }
  .le-item-main { display: flex; gap: 14px; margin-bottom: 10px; }
  .le-item-thumb {
    width: 84px; height: 84px; border-radius: 8px;
    object-fit: cover; flex-shrink: 0;
    border: 1px solid var(--flent-line);
    cursor: pointer; transition: opacity 0.15s;
  }
  .le-item-thumb:hover { opacity: 0.85; }
  .le-item-thumb-placeholder {
    width: 84px; height: 84px; border-radius: 8px; flex-shrink: 0;
    background: var(--flent-cream); border: 1px solid var(--flent-line);
  }
  .le-item-body { flex: 1; min-width: 0; }
  .le-item-toprow {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 8px; margin-bottom: 3px;
  }
  .le-item-name {
    font-size: 14px; font-weight: 600;
    color: var(--flent-indigo-ink); line-height: 1.3;
  }
  .le-item-cost {
    font-family: var(--flent-display);
    font-size: 16px; font-weight: 400;
    color: var(--flent-indigo-ink);
    white-space: nowrap; flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .le-item-actuals-cost {
    font-family: monospace; font-size: 10px; letter-spacing: 0.06em;
    color: #9B7340; white-space: nowrap; flex-shrink: 0;
    padding: 3px 0;
  }
  .le-item-area {
    font-size: 10px; font-family: monospace;
    color: var(--flent-muted); letter-spacing: 0.04em; margin-bottom: 6px;
  }
  .le-item-desc {
    font-size: 13px; color: var(--flent-muted);
    line-height: 1.6; margin-bottom: 7px;
  }
  .le-item-costs {
    font-size: 11px; font-family: monospace;
    color: var(--flent-muted); letter-spacing: 0.03em; margin-bottom: 7px;
  }
  .le-item-actuals-note {
    font-size: 12px; color: #9B7340;
    font-style: italic; margin-bottom: 7px;
  }

  /* ── Status pill ── */
  .le-status-pill {
    font-size: 8px; font-weight: 700;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 100px;
    font-family: monospace; flex-shrink: 0; white-space: nowrap;
    align-self: flex-start; margin-top: 2px;
  }
  .le-pill-pending  { background: rgba(90,85,112,0.09); color: var(--flent-muted); }
  .le-pill-approved { background: rgba(60,90,63,0.10);  color: var(--flent-olive); }
  .le-pill-disputed { background: rgba(240,201,160,0.3); color: #9B7340; }

  /* ── Action buttons ── */
  .le-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .le-btn-approve {
    padding: 8px 20px; border-radius: 100px;
    background: var(--flent-indigo); color: #fff; border: none;
    font-size: 12px; font-weight: 600; cursor: pointer;
    transition: opacity 0.15s; white-space: nowrap;
  }
  .le-btn-approve:hover { opacity: 0.85; }
  .le-btn-approve:disabled { opacity: 0.4; cursor: default; }
  .le-btn-dispute {
    padding: 8px 20px; border-radius: 100px;
    background: none; color: var(--flent-muted);
    border: 1.5px solid var(--flent-line);
    font-size: 12px; cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .le-btn-dispute:hover { border-color: var(--flent-indigo); color: var(--flent-indigo); }
  .le-btn-approved-badge {
    padding: 8px 18px; border-radius: 100px;
    background: rgba(60,90,63,0.08); color: var(--flent-olive);
    border: 1px solid rgba(60,90,63,0.2);
    font-size: 12px; font-weight: 600;
  }
  .le-btn-disputed-badge {
    padding: 8px 18px; border-radius: 100px;
    background: rgba(240,201,160,0.25); color: #9B7340;
    border: 1px solid rgba(240,201,160,0.6);
    font-size: 12px; font-weight: 600;
  }

  /* ── Dispute form ── */
  .le-dispute-form {
    margin-top: 14px; padding: 16px;
    background: var(--flent-cream); border: 1.5px solid var(--flent-line);
    border-radius: 10px;
  }
  .le-dispute-title {
    font-size: 10px; font-weight: 700;
    color: var(--flent-indigo); text-transform: uppercase;
    letter-spacing: 0.1em; margin-bottom: 10px; font-family: monospace;
  }
  .le-reason-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
  .le-reason-tag {
    padding: 6px 14px; border-radius: 100px;
    border: 1.5px solid var(--flent-line); background: #fff;
    font-size: 11px; color: var(--flent-muted); cursor: pointer;
    transition: all 0.15s;
  }
  .le-reason-tag.selected { background: var(--flent-indigo); color: #fff; border-color: var(--flent-indigo); }
  .le-dispute-textarea {
    width: 100%; resize: vertical;
    border: 1.5px solid var(--flent-line); border-radius: 8px;
    padding: 10px 12px; font-size: 16px; color: var(--flent-indigo-ink);
    font-family: var(--flent-sans); background: #fff; outline: none;
    margin-bottom: 10px; min-height: 64px;
  }
  .le-dispute-textarea:focus { border-color: var(--flent-indigo); }
  .le-dispute-actions { display: flex; gap: 8px; }
  .le-btn-submit {
    padding: 8px 20px; border-radius: 100px;
    background: var(--flent-indigo); color: #fff; border: none;
    font-size: 12px; font-weight: 600; cursor: pointer;
  }
  .le-btn-submit:disabled { opacity: 0.4; cursor: default; }
  .le-btn-cancel {
    padding: 8px 16px; border-radius: 100px;
    background: none; color: var(--flent-muted);
    border: 1.5px solid var(--flent-line);
    font-size: 12px; cursor: pointer;
  }

  /* ── Dispute thread ── */
  .le-thread { margin-top: 14px; border-top: 1px solid var(--flent-line); padding-top: 12px; }
  .le-thread-msg { margin-bottom: 10px; }
  .le-thread-meta { font-size: 10px; color: var(--flent-muted); margin-bottom: 3px; font-family: monospace; }
  .le-thread-bubble {
    display: inline-block; padding: 8px 12px; border-radius: 8px;
    font-size: 12px; line-height: 1.6; max-width: 90%;
  }
  .le-bubble-landlord { background: rgba(228,222,207,0.5); color: var(--flent-indigo-ink); }
  .le-bubble-flent    { background: var(--flent-indigo); color: #fff; }

  /* ── Notes & terms ── */
  .le-notes-card {
    background: #fff; border-radius: 14px;
    border: 1.5px solid var(--flent-line);
    padding: 20px 24px; margin-bottom: 24px;
  }
  .le-notes-label {
    font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--flent-muted); font-family: monospace; margin-bottom: 10px;
  }
  .le-notes-body {
    font-size: 13px; color: var(--flent-muted);
    font-style: italic; line-height: 1.7;
  }

  /* ── Sticky bottom bar ── */
  .le-bottom-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--flent-indigo);
    padding: 14px 32px; z-index: 100;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .le-bottom-total-num {
    font-family: var(--flent-display);
    font-size: 22px; font-weight: 400;
    color: var(--flent-cream); line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .le-bottom-total-lbl {
    font-size: 9px; text-transform: uppercase;
    letter-spacing: 0.1em; color: rgba(245,242,236,0.5);
    font-family: monospace; margin-top: 3px;
  }
  .le-btn-approve-all {
    padding: 12px 28px; background: var(--flent-apricot);
    color: var(--flent-indigo-ink); border: none; border-radius: 100px;
    font-size: 14px; font-weight: 700; cursor: pointer;
    transition: opacity 0.15s; white-space: nowrap;
  }
  .le-btn-approve-all:hover { opacity: 0.85; }
  .le-btn-approve-all:disabled { opacity: 0.4; cursor: default; }

  /* ── Name modal ── */
  .le-name-overlay {
    position: fixed; inset: 0; background: rgba(28,24,56,0.55); z-index: 200;
    display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .le-name-modal {
    background: #fff; border-radius: 16px;
    padding: 28px 32px; max-width: 380px; width: 100%;
    box-shadow: 0 20px 60px rgba(42,36,86,0.2);
  }
  .le-name-modal-title {
    font-family: var(--flent-display);
    font-size: 20px; font-weight: 500; color: var(--flent-indigo-ink);
    margin-bottom: 6px;
  }
  .le-name-modal-sub {
    font-size: 13px; color: var(--flent-muted); margin-bottom: 18px; line-height: 1.5;
  }
  .le-name-input {
    width: 100%; border: 1.5px solid var(--flent-line); border-radius: 8px;
    padding: 11px 14px; font-size: 16px; color: var(--flent-indigo-ink);
    font-family: var(--flent-sans); outline: none; margin-bottom: 14px;
  }
  .le-name-input:focus { border-color: var(--flent-indigo); }
  .le-btn-name-confirm {
    width: 100%; padding: 13px; background: var(--flent-indigo); color: #fff;
    border: none; border-radius: 100px;
    font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .le-btn-name-confirm:disabled { opacity: 0.4; cursor: default; }

  /* ── Photo lightbox ── */
  .le-lightbox {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.92);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; cursor: zoom-out;
  }
  .le-lightbox img { max-width: 100%; max-height: 90vh; border-radius: 8px; object-fit: contain; }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .le-topbar { padding: 0 16px; height: 48px; }
    .le-container { padding: 0 16px; }
    .le-hero { padding: 24px 0 20px; }

    /* Meta card: 2×2 */
    .le-meta-card { grid-template-columns: 1fr 1fr; }
    .le-meta-cell:nth-child(2) { border-right: none; }
    .le-meta-cell:nth-child(3) { border-top: 1px solid var(--flent-line); border-right: 1px solid var(--flent-line); }
    .le-meta-cell:nth-child(4) { border-top: 1px solid var(--flent-line); border-right: none; }

    /* Stats: 2×2, total full-width top */
    .le-stats-row { grid-template-columns: 1fr 1fr; }
    .le-stat-card-total { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; }
    .le-stat-card-total .le-stat-num { font-size: 26px; }

    .le-trade-name { font-size: 17px; }

    /* Item thumb smaller on mobile */
    .le-item-thumb,
    .le-item-thumb-placeholder { width: 68px; height: 68px; }

    /* Action buttons: full-width stacked, 44px min */
    .le-actions { flex-direction: column; }
    .le-btn-approve,
    .le-btn-dispute,
    .le-btn-approved-badge,
    .le-btn-disputed-badge {
      width: 100%; min-height: 44px;
      display: flex; align-items: center; justify-content: center; font-size: 13px;
    }

    .le-reason-tags { gap: 8px; }
    .le-reason-tag { min-height: 40px; display: inline-flex; align-items: center; font-size: 12px; }

    /* Bottom bar: stack, safe area */
    .le-bottom-bar {
      flex-direction: column; align-items: stretch; gap: 10px;
      padding: 14px 16px;
      padding-bottom: calc(14px + env(safe-area-inset-bottom));
    }
    .le-btn-approve-all { width: 100%; padding: 15px; font-size: 15px; text-align: center; }
    .le-bottom-total-num { font-size: 20px; }
  }
`

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function addDays(str, days) {
  if (!str) return '—'
  const d = new Date(str)
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

function titleCase(str) {
  return (str || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function itemTotal(item) {
  if (item.cost_type === 'actuals' || item.cost_type === 'nil') return null
  return (parseFloat(item.material_cost) || 0) + (parseFloat(item.labour_cost) || 0)
}

const REASON_TAGS = [
  { key: 'not_needed',    label: 'Not needed' },
  { key: 'price_too_high', label: 'Price too high' },
  { key: 'already_fixed', label: 'Already fixed' },
  { key: 'question',      label: 'Question' },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function LandlordEstimate() {
  const { token } = useParams()

  const [estimate, setEstimate]     = useState(null)
  const [items, setItems]           = useState([])
  const [disputes, setDisputes]     = useState([])
  const [inspection, setInspection] = useState(null)
  const [notFound, setNotFound]     = useState(false)
  const [loading, setLoading]       = useState(true)

  // Landlord name — ask once, persist in localStorage
  const [landlordName, setLandlordName] = useState(() => localStorage.getItem('le_landlord_name') || '')
  const [showNameModal, setShowNameModal] = useState(false)
  const [nameInput, setNameInput]   = useState('')
  const pendingAction = useRef(null)

  // Per-item UI state
  const [disputeOpen, setDisputeOpen]     = useState({})
  const [disputeReason, setDisputeReason] = useState({})
  const [disputeMsg, setDisputeMsg]       = useState({})
  const [submitting, setSubmitting]       = useState({})

  // Approve-all state
  const [approving, setApproving] = useState(false)

  // Photo lightbox
  const [lightbox, setLightbox] = useState(null)

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const { data: est } = await supabase
      .from('estimates')
      .select('*, estimate_items(*), estimate_disputes(*)')
      .eq('share_token', token)
      .single()

    if (!est) { setNotFound(true); setLoading(false); return }

    // Fetch photos for all line_item_ids
    const lineItemIds = (est.estimate_items || []).map(i => i.line_item_id).filter(Boolean)
    let mediaMap = {}
    if (lineItemIds.length > 0) {
      const { data: media } = await supabase
        .from('line_item_media')
        .select('line_item_id, url')
        .in('line_item_id', lineItemIds)
      if (media) {
        media.forEach(m => {
          if (!mediaMap[m.line_item_id]) mediaMap[m.line_item_id] = []
          mediaMap[m.line_item_id].push(m.url)
        })
      }
    }

    // Fetch inspection info
    if (est.inspection_id) {
      const { data: insp } = await supabase
        .from('inspections')
        .select('id, pid, house_type, inspection_date, config, owner_email')
        .eq('id', est.inspection_id)
        .maybeSingle()
      setInspection(insp)
    }

    setEstimate(est)
    setItems((est.estimate_items || []).map(item => ({
      ...item,
      _photos: mediaMap[item.line_item_id] || [],
    })))
    setDisputes(est.estimate_disputes || [])

    // Log first view
    if (!est.first_viewed_at) {
      await supabase.from('estimates')
        .update({ first_viewed_at: new Date().toISOString(), status: 'viewed' })
        .eq('id', est.id)
      await supabase.from('estimate_events').insert({
        estimate_id: est.id, event_type: 'viewed', actor: 'landlord',
      })
    }

    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  // ── Realtime ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!estimate?.id) return
    const refreshItems = async () => {
      const { data: fresh } = await supabase
        .from('estimate_items')
        .select('*')
        .eq('estimate_id', estimate.id)
        .order('sort_order')
      if (fresh) {
        setItems(prev => fresh.map(item => ({
          ...item,
          _photos: prev.find(p => p.id === item.id)?._photos || [],
        })))
      }
      const { data: freshD } = await supabase
        .from('estimate_disputes')
        .select('*')
        .eq('estimate_id', estimate.id)
      if (freshD) setDisputes(freshD)
    }

    const channel = supabase.channel(`le-${estimate.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimate_items',    filter: `estimate_id=eq.${estimate.id}` }, refreshItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimate_disputes', filter: `estimate_id=eq.${estimate.id}` }, refreshItems)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [estimate?.id])

  // ── Name gate ───────────────────────────────────────────────────────────────
  function requireName(action) {
    if (landlordName.trim()) { action(); return }
    pendingAction.current = action
    setNameInput('')
    setShowNameModal(true)
  }

  function confirmName() {
    const n = nameInput.trim()
    if (!n) return
    setLandlordName(n)
    localStorage.setItem('le_landlord_name', n)
    setShowNameModal(false)
    if (pendingAction.current) { pendingAction.current(); pendingAction.current = null }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function approveItem(itemId) {
    setSubmitting(s => ({ ...s, [itemId]: true }))
    await supabase.from('estimate_items').update({ status: 'approved' }).eq('id', itemId)
    await supabase.from('estimate_events').insert({
      estimate_id: estimate.id, event_type: 'item_approved', actor: 'landlord',
      meta: { item_id: itemId, name: landlordName },
    })
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: 'approved' } : i))
    setSubmitting(s => ({ ...s, [itemId]: false }))
  }

  async function submitDispute(itemId) {
    const reasonTag = disputeReason[itemId]
    if (!reasonTag) { alert('Please select a reason.'); return }
    const message = disputeMsg[itemId] || ''
    setSubmitting(s => ({ ...s, [itemId]: true }))

    await supabase.from('estimate_items').update({ status: 'disputed' }).eq('id', itemId)
    await supabase.from('estimate_disputes').insert({
      estimate_item_id: itemId,
      estimate_id: estimate.id,
      author_type: 'landlord',
      author_name: landlordName || 'Landlord',
      reason_tag: reasonTag,
      message,
    })
    await supabase.from('estimate_events').insert({
      estimate_id: estimate.id, event_type: 'disputed', actor: 'landlord',
      meta: { item_id: itemId, reason: reasonTag, name: landlordName },
    })

    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: 'disputed' } : i))
    setDisputeOpen(s => ({ ...s, [itemId]: false }))
    setDisputeReason(s => ({ ...s, [itemId]: '' }))
    setDisputeMsg(s => ({ ...s, [itemId]: '' }))

    const { data: freshD } = await supabase.from('estimate_disputes').select('*').eq('estimate_id', estimate.id)
    if (freshD) setDisputes(freshD)

    setSubmitting(s => ({ ...s, [itemId]: false }))
  }

  async function approveAll() {
    const disputedCount = items.filter(i => i.status === 'disputed').length

    if (disputedCount > 0) {
      const ok = window.confirm(`You have ${disputedCount} item${disputedCount > 1 ? 's' : ''} under review. Approve the remaining items?`)
      if (!ok) return
    }

    setApproving(true)
    await supabase.from('estimate_items')
      .update({ status: 'approved' })
      .eq('estimate_id', estimate.id)
      .eq('status', 'pending')

    const refreshedItems = items.map(i => (!i.status || i.status === 'pending') ? { ...i, status: 'approved' } : i)
    setItems(refreshedItems)

    const allApproved = refreshedItems.every(i => i.status === 'approved' || i.status === 'removed')
    await supabase.from('estimates').update({
      status: allApproved ? 'approved' : 'partially_approved',
      approved_at: allApproved ? new Date().toISOString() : null,
      approved_by_name: landlordName || 'Landlord',
    }).eq('id', estimate.id)

    await supabase.from('estimate_events').insert({
      estimate_id: estimate.id,
      event_type: allApproved ? 'approved' : 'partially_approved',
      actor: 'landlord',
      meta: { name: landlordName },
    })

    setEstimate(prev => ({ ...prev, status: allApproved ? 'approved' : 'partially_approved' }))
    setApproving(false)
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const visibleItems  = items.filter(i => i.status !== 'removed')
  const approvedCount = visibleItems.filter(i => i.status === 'approved').length
  const disputedCount = visibleItems.filter(i => i.status === 'disputed').length
  const pendingCount  = visibleItems.filter(i => !i.status || i.status === 'pending').length
  const grandTotal    = visibleItems.reduce((s, i) => s + (itemTotal(i) || 0), 0)

  // Group by trade
  const groups = []
  const seen   = {}
  visibleItems.forEach(item => {
    const trade = item.trade || 'General'
    if (!seen[trade]) { seen[trade] = []; groups.push({ trade, items: seen[trade] }) }
    seen[trade].push(item)
  })

  const pid       = inspection?.pid || estimate?.pid || '—'
  const address   = inspection?.config?.address || ''
  const inspector = estimate?.inspector_name || '—'

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <LogoSpinner full />

  if (notFound) {
    return (
      <div style={{ minHeight: '100dvh', background: '#F5F2EC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40, fontFamily: "'Nunito Sans', sans-serif" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1C1838', marginBottom: 6 }}>Link not found</div>
          <div style={{ fontSize: 13, color: '#5A5570' }}>This estimate link is invalid or has expired.</div>
        </div>
      </div>
    )
  }

  const alreadyApproved = estimate?.status === 'approved' || estimate?.status === 'partially_approved'

  return (
    <div className="le-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Top bar ── */}
      <div className="le-topbar">
        {/* TODO: swap for real Flent logo asset when provided */}
        <span className="le-logo-pill">flent</span>
        <span className="le-topbar-tag">Estimate Review Portal</span>
      </div>

      <div className="le-container">

        {/* ── Hero ── */}
        <div className="le-hero">
          <h1 className="le-hero-h1">
            {HERO_TITLE}
            <em className="le-hero-em">{HERO_SUBTITLE}</em>
          </h1>
          <p className="le-hero-sub">
            Review each repair item, approve what looks right, and raise a concern on anything you'd like to discuss.
          </p>
        </div>

        {/* ── Meta card ── */}
        <div className="le-meta-card">
          {[
            { label: 'Property',        val: address || `PID ${pid}` },
            { label: 'Inspection Date', val: fmtDate(inspection?.inspection_date) },
            { label: 'Prepared by',     val: inspector },
            { label: 'Valid Until',     val: addDays(estimate?.created_at, 30) },
          ].map(m => (
            <div key={m.label} className="le-meta-cell">
              <span className="le-meta-lbl">{m.label}</span>
              <span className="le-meta-val">{m.val}</span>
            </div>
          ))}
        </div>

        {/* ── Summary stats ── */}
        <div className="le-stats-row">
          <div className="le-stat-card le-stat-card-total">
            <div className="le-stat-num">₹{fmt(grandTotal)}</div>
            <div className="le-stat-lbl">Total Estimate</div>
          </div>
          <div className="le-stat-card">
            <div className="le-stat-num">{visibleItems.length}</div>
            <div className="le-stat-lbl">Items</div>
          </div>
          <div className="le-stat-card">
            <div className="le-stat-num" style={approvedCount > 0 ? { color: 'var(--flent-olive)' } : {}}>{approvedCount}</div>
            <div className="le-stat-lbl">Approved</div>
          </div>
          <div className="le-stat-card">
            <div className="le-stat-num" style={disputedCount > 0 ? { color: '#9B7340' } : {}}>{disputedCount}</div>
            <div className="le-stat-lbl">In Review</div>
          </div>
          <div className="le-stat-card">
            <div className="le-stat-num">{pendingCount}</div>
            <div className="le-stat-lbl">Pending</div>
          </div>
        </div>

        {/* ── Instruction banner ── */}
        {!alreadyApproved && (
          <div className="le-banner">
            <div className="le-banner-dot">i</div>
            <div className="le-banner-text">
              <strong>Review each item below.</strong> Approve items you agree with, or raise a concern on any that needs discussion. Use the button at the bottom to confirm the full estimate.
            </div>
          </div>
        )}

        {alreadyApproved && (
          <div className="le-approved-banner">
            <span style={{ fontSize: 16 }}>✓</span>
            <div>
              <strong>Estimate {estimate.status === 'partially_approved' ? 'partially approved' : 'approved'}</strong>
              {estimate.approved_by_name ? ` — confirmed by ${estimate.approved_by_name}` : ''}
              {estimate.approved_at ? ` on ${fmtDate(estimate.approved_at)}` : ''}
            </div>
          </div>
        )}

        {/* ── Trade-grouped items ── */}
        {groups.map(({ trade, items: tradeItems }) => {
          const tradeTotal = tradeItems.reduce((s, i) => s + (itemTotal(i) || 0), 0)
          return (
            <div key={trade} className="le-trade-group">
              <div className="le-trade-head">
                <span className="le-trade-name">{titleCase(trade)}</span>
                <span className="le-trade-meta">
                  {tradeItems.length} item{tradeItems.length !== 1 ? 's' : ''}{tradeTotal > 0 ? ` · ₹${fmt(tradeTotal)}` : ''}
                </span>
              </div>

              {tradeItems.map(item => {
                const total    = itemTotal(item)
                const itemDisps = disputes.filter(d => d.estimate_item_id === item.id)
                const status   = item.status || 'pending'
                const isOpen   = !!disputeOpen[item.id]
                const thumb    = item._photos?.[0] || null

                return (
                  <div key={item.id} className="le-item">

                    {/* Main row: thumb + content */}
                    <div className="le-item-main">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt="Item photo"
                          className="le-item-thumb"
                          onClick={() => setLightbox(thumb)}
                        />
                      ) : (
                        <div className="le-item-thumb-placeholder" />
                      )}

                      <div className="le-item-body">
                        <div className="le-item-toprow">
                          <span className="le-item-name">{item.item_name || '—'}</span>
                          {total != null && total > 0 ? (
                            <span className="le-item-cost">₹{fmt(total)}</span>
                          ) : item.cost_type === 'actuals' ? (
                            <span className="le-item-actuals-cost">ON ACTUALS</span>
                          ) : null}
                        </div>

                        {item.area && (
                          <div className="le-item-area">{item.area}</div>
                        )}

                        {item.issue_description && (
                          <div className="le-item-desc">{item.issue_description}</div>
                        )}

                        {/* Cost breakdown — quiet mono text, no boxes */}
                        {item.cost_type === 'actuals' ? (
                          <div className="le-item-actuals-note">
                            This item will be charged based on actual costs once work is completed.
                          </div>
                        ) : item.cost_type !== 'nil' && (
                          <div className="le-item-costs">
                            {(item.material_cost || 0) > 0 && `Material · ₹${fmt(item.material_cost)}`}
                            {(item.material_cost || 0) > 0 && (item.labour_cost || 0) > 0 && '   '}
                            {(item.labour_cost || 0) > 0 && `Labour · ₹${fmt(item.labour_cost)}`}
                          </div>
                        )}
                      </div>

                      {/* Status pill — right of body on desktop */}
                      <span className={`le-status-pill le-pill-${status}`}>
                        {status === 'pending' ? 'Pending' : status === 'approved' ? '✓ Approved' : '⚑ In Review'}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="le-actions">
                      {status === 'approved' ? (
                        <span className="le-btn-approved-badge">✓ Approved</span>
                      ) : status === 'disputed' ? (
                        <span className="le-btn-disputed-badge">⚑ In Review</span>
                      ) : (
                        <>
                          <button
                            className="le-btn-approve"
                            disabled={!!submitting[item.id]}
                            onClick={() => requireName(() => approveItem(item.id))}
                          >
                            ✓ Approve
                          </button>
                          <button
                            className="le-btn-dispute"
                            disabled={!!submitting[item.id]}
                            onClick={() => requireName(() => setDisputeOpen(s => ({ ...s, [item.id]: !s[item.id] })))}
                          >
                            {isOpen ? '✕ Cancel' : '⚑ Raise concern'}
                          </button>
                        </>
                      )}
                    </div>

                    {/* Dispute form */}
                    {isOpen && (
                      <div className="le-dispute-form">
                        <div className="le-dispute-title">Raise a concern</div>
                        <div className="le-reason-tags">
                          {REASON_TAGS.map(r => (
                            <button
                              key={r.key}
                              className={`le-reason-tag${disputeReason[item.id] === r.key ? ' selected' : ''}`}
                              onClick={() => setDisputeReason(s => ({ ...s, [item.id]: r.key }))}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="le-dispute-textarea"
                          placeholder="Add a comment (optional)"
                          value={disputeMsg[item.id] || ''}
                          onChange={e => setDisputeMsg(s => ({ ...s, [item.id]: e.target.value }))}
                        />
                        <div className="le-dispute-actions">
                          <button
                            className="le-btn-submit"
                            disabled={!!submitting[item.id] || !disputeReason[item.id]}
                            onClick={() => submitDispute(item.id)}
                          >
                            {submitting[item.id] ? 'Submitting…' : 'Submit concern'}
                          </button>
                          <button
                            className="le-btn-cancel"
                            onClick={() => setDisputeOpen(s => ({ ...s, [item.id]: false }))}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Dispute thread */}
                    {itemDisps.length > 0 && (
                      <div className="le-thread">
                        {[...itemDisps].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((d, di) => (
                          <div key={di} className="le-thread-msg">
                            <div className="le-thread-meta">
                              {d.author_name || d.author_type} · {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              {d.reason_tag ? ` · ${REASON_TAGS.find(r => r.key === d.reason_tag)?.label || d.reason_tag}` : ''}
                            </div>
                            <div className={`le-thread-bubble ${d.author_type === 'landlord' ? 'le-bubble-landlord' : 'le-bubble-flent'}`}>
                              {d.message || `[${REASON_TAGS.find(r => r.key === d.reason_tag)?.label || d.reason_tag}]`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* ── Notes & terms ── */}
        <div className="le-notes-card">
          <div className="le-notes-label">Notes &amp; Terms</div>
          <div className="le-notes-body">
            {estimate?.notes || '[ Generic notes / terms will appear here ]'}
          </div>
        </div>

      </div>{/* /le-container */}

      {/* ── Sticky bottom bar ── */}
      {!alreadyApproved && (
        <div className="le-bottom-bar">
          <div>
            <div className="le-bottom-total-num">₹{fmt(grandTotal)}</div>
            <div className="le-bottom-total-lbl">Total Estimate</div>
          </div>
          <button
            className="le-btn-approve-all"
            disabled={approving || pendingCount === 0}
            onClick={() => requireName(approveAll)}
          >
            {approving ? 'Approving…' : pendingCount === 0 ? 'All reviewed' : 'Approve full estimate'}
          </button>
        </div>
      )}

      {/* ── Name modal ── */}
      {showNameModal && (
        <div className="le-name-overlay" onClick={() => setShowNameModal(false)}>
          <div className="le-name-modal" onClick={e => e.stopPropagation()}>
            <div className="le-name-modal-title">Before you continue</div>
            <div className="le-name-modal-sub">
              Please enter your name so we can attribute your approvals and comments on this estimate.
            </div>
            <input
              className="le-name-input"
              type="text"
              placeholder="Your name"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmName()}
              autoFocus
            />
            <button className="le-btn-name-confirm" onClick={confirmName} disabled={!nameInput.trim()}>
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Photo lightbox ── */}
      {lightbox && (
        <div className="le-lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Photo" />
        </div>
      )}
    </div>
  )
}
