import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LogoSpinner from '../components/LogoSpinner'

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Source+Sans+3:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; }

  .le-wrap {
    min-height: 100dvh;
    background: #EDEAE4;
    padding: 0 0 140px;
    font-family: 'Source Sans 3', sans-serif;
    color: #1E1E1E;
    -webkit-font-smoothing: antialiased;
  }

  .le-topbar {
    background: #111;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
  }
  .le-topbar-brand {
    display: flex; align-items: center; gap: 8px;
  }
  .le-topbar-logo {
    width: 24px; height: 24px;
    background: #fff; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; padding: 2px;
  }
  .le-topbar-logo img { width: 100%; height: 100%; object-fit: contain; }
  .le-topbar-name {
    font-size: 13px; font-weight: 700; color: #fff;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-topbar-right {
    font-size: 11px; color: rgba(255,255,255,0.35);
    font-family: 'Source Sans 3', sans-serif;
  }

  .le-doc {
    max-width: 760px;
    margin: 16px auto 0;
    background: #fff;
    border: 1px solid #D4CFC6;
    border-radius: 2px;
  }

  /* ── Header ── */
  .le-header {
    background: #1C1C1C;
    padding: 24px 48px 20px;
  }
  .le-header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 16px;
  }
  .le-brand { display: flex; align-items: center; gap: 12px; }
  .le-logo-box {
    width: 38px; height: 38px;
    background: #fff; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; overflow: hidden; padding: 3px;
  }
  .le-logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .le-brand-name {
    font-size: 15px; font-weight: 700; color: #fff;
    font-family: 'Source Sans 3', sans-serif; line-height: 1.1;
  }
  .le-brand-tag {
    font-size: 12px; color: rgba(255,255,255,0.4);
    font-style: italic; margin-top: 3px;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-doc-right { text-align: right; }
  .le-doc-title {
    font-family: 'Poppins', sans-serif;
    font-size: 20px; font-weight: 600; color: #fff;
    line-height: 1.2;
  }
  .le-doc-pid {
    font-size: 13px; font-weight: 700;
    color: rgba(255,255,255,0.55);
    margin-top: 4px; letter-spacing: 0.04em;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-meta-strip {
    border-top: 1px solid rgba(255,255,255,0.1);
    padding: 12px 0 0;
    display: flex; flex-wrap: wrap; gap: 0;
  }
  .le-meta-item {
    display: flex; flex-direction: column; gap: 3px;
    padding: 0 20px 0 0; margin-right: 20px;
    border-right: 1px solid rgba(255,255,255,0.1);
  }
  .le-meta-item:last-child { border-right: none; margin-right: 0; padding-right: 0; }
  .le-meta-label {
    font-size: 8px; font-weight: 600;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: rgba(255,255,255,0.28);
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-meta-val {
    font-size: 11px; color: rgba(255,255,255,0.65);
    font-family: 'Source Sans 3', sans-serif;
  }

  /* ── Summary strip ── */
  .le-summary {
    background: #F8F6F1;
    border-bottom: 1px solid #D4CFC6;
    padding: 16px 48px;
    display: flex; gap: 32px; align-items: center; flex-wrap: wrap;
  }
  .le-sum-item {}
  .le-sum-num {
    font-size: 22px; font-weight: 500; color: #1E1E1E;
    font-family: 'Source Sans 3', sans-serif;
    font-variant-numeric: tabular-nums; line-height: 1;
  }
  .le-sum-lbl {
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.1em; color: #888; margin-top: 4px;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-sum-sep { width: 1px; background: #D4CFC6; align-self: stretch; flex-shrink: 0; }

  /* ── Instruction banner ── */
  .le-banner {
    padding: 14px 48px;
    background: #FDFCFA;
    border-bottom: 1px solid #D4CFC6;
    display: flex; align-items: flex-start; gap: 12px;
  }
  .le-banner-icon {
    width: 20px; height: 20px; border-radius: '50%';
    background: #1C1C1C; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; flex-shrink: 0; margin-top: 1px;
    border-radius: 50%;
  }
  .le-banner-text {
    font-size: 13px; color: #444; line-height: 1.6;
    font-family: 'Source Sans 3', sans-serif;
  }

  /* ── Area groups ── */
  .le-area-group {
    border-top: 1px solid #D4CFC6;
  }
  .le-area-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 48px 12px;
    background: #F8F6F1;
    border-bottom: 1px solid #D4CFC6;
  }
  .le-area-name {
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: #1E1E1E;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-area-count {
    font-size: 10px; color: #888;
    font-family: 'Source Sans 3', sans-serif;
  }

  /* ── Item card ── */
  .le-item {
    padding: 20px 48px;
    border-bottom: 1px solid #D4CFC6;
    transition: background 0.15s;
  }
  .le-item:last-of-type { border-bottom: none; }
  .le-item-row1 {
    display: flex; align-items: flex-start; gap: 10px; margin-bottom: 6px;
  }
  .le-item-name {
    font-size: 14px; font-weight: 600; color: #1E1E1E; flex: 1;
    font-family: 'Source Sans 3', sans-serif; line-height: 1.4;
  }
  .le-item-total {
    font-size: 16px; font-weight: 600; color: #1C1C1C;
    font-family: 'Source Sans 3', sans-serif;
    white-space: nowrap; flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .le-item-desc {
    font-size: 13px; color: #444; line-height: 1.65; margin-bottom: 10px;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-tags {
    display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;
  }
  .le-tag {
    font-size: 9px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 2px 7px; border-radius: 2px;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-tag-trade { background: #EEECE8; color: #5C5C5C; }
  .le-tag-area  { background: #E8EEF0; color: #4A6070; }

  .le-status-pill {
    font-size: 9px; font-weight: 700;
    letter-spacing: 0.08em; text-transform: uppercase;
    padding: 3px 9px; border-radius: 100px;
    font-family: 'Source Sans 3', sans-serif;
    flex-shrink: 0;
  }
  .le-pill-pending  { background: #F0EDE8; color: #888; }
  .le-pill-approved { background: #E8F5EE; color: #2A7A50; }
  .le-pill-disputed { background: #FEF3E8; color: #B06020; }

  /* ── Cost breakdown ── */
  .le-cost-row {
    display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap;
  }
  .le-cost-cell {
    background: #F8F6F1; border: 1px solid #E8E4DC;
    border-radius: 4px; padding: 8px 12px;
    flex: 1; min-width: 140px;
  }
  .le-cost-label {
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.1em; color: #888; margin-bottom: 3px;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-cost-desc {
    font-size: 12px; color: #444; margin-bottom: 2px;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-cost-val {
    font-size: 13px; font-weight: 600; color: #1E1E1E;
    font-family: 'Source Sans 3', sans-serif;
    font-variant-numeric: tabular-nums;
  }
  .le-actuals-note {
    font-size: 12px; color: #888; font-style: italic;
    font-family: 'Source Sans 3', sans-serif;
    padding: 8px 0; margin-bottom: 10px;
  }

  /* ── Photos ── */
  .le-photos {
    display: flex; gap: 8px; overflow-x: auto; margin-bottom: 14px;
    padding-bottom: 2px; scrollbar-width: thin;
  }
  .le-photo {
    width: 80px; height: 60px; border-radius: 4px;
    object-fit: cover; flex-shrink: 0;
    border: 1px solid #D4CFC6; cursor: pointer;
    transition: opacity 0.15s;
  }
  .le-photo:hover { opacity: 0.85; }

  /* ── Action buttons ── */
  .le-actions {
    display: flex; gap: 8px; flex-wrap: wrap;
  }
  .le-btn-approve {
    padding: 7px 16px; border-radius: 4px;
    background: #1C1C1C; color: #fff; border: none;
    font-size: 12px; font-weight: 600; cursor: pointer;
    font-family: 'Source Sans 3', sans-serif;
    transition: opacity 0.15s;
  }
  .le-btn-approve:hover { opacity: 0.8; }
  .le-btn-approve:disabled { opacity: 0.4; cursor: default; }
  .le-btn-dispute {
    padding: 7px 16px; border-radius: 4px;
    background: none; color: #888;
    border: 1px solid #D4CFC6;
    font-size: 12px; cursor: pointer;
    font-family: 'Source Sans 3', sans-serif;
    transition: border-color 0.15s, color 0.15s;
  }
  .le-btn-dispute:hover { border-color: #c8963e; color: #c8963e; }
  .le-btn-approved-badge {
    padding: 7px 16px; border-radius: 4px;
    background: #E8F5EE; color: #2A7A50;
    border: 1px solid #A8D8BB;
    font-size: 12px; font-weight: 600;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-btn-disputed-badge {
    padding: 7px 16px; border-radius: 4px;
    background: #FEF3E8; color: #B06020;
    border: 1px solid #F0C898;
    font-size: 12px; font-weight: 600;
    font-family: 'Source Sans 3', sans-serif;
  }

  /* ── Dispute form ── */
  .le-dispute-form {
    margin-top: 14px; padding: 16px;
    background: #FDFCFA; border: 1px solid #E8E0D0;
    border-radius: 6px;
  }
  .le-dispute-title {
    font-size: 11px; font-weight: 700; color: #1E1E1E;
    text-transform: uppercase; letter-spacing: 0.1em;
    margin-bottom: 10px;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-reason-tags {
    display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;
  }
  .le-reason-tag {
    padding: 5px 12px; border-radius: 100px;
    border: 1px solid #D4CFC6; background: #fff;
    font-size: 11px; color: #444; cursor: pointer;
    font-family: 'Source Sans 3', sans-serif;
    transition: all 0.15s;
  }
  .le-reason-tag.selected {
    background: #1C1C1C; color: #fff; border-color: #1C1C1C;
  }
  .le-dispute-textarea {
    width: 100%; resize: vertical;
    border: 1px solid #D4CFC6; border-radius: 4px;
    padding: 8px 10px; font-size: 16px; color: #1E1E1E;
    font-family: 'Source Sans 3', sans-serif;
    background: #fff; outline: none; margin-bottom: 10px;
    min-height: 64px;
  }
  .le-dispute-textarea:focus { border-color: #1C1C1C; }
  .le-dispute-actions { display: flex; gap: 8px; }
  .le-btn-submit {
    padding: 7px 18px; border-radius: 4px;
    background: #c8963e; color: #fff; border: none;
    font-size: 12px; font-weight: 600; cursor: pointer;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-btn-cancel {
    padding: 7px 14px; border-radius: 4px;
    background: none; color: #888;
    border: 1px solid #D4CFC6;
    font-size: 12px; cursor: pointer;
    font-family: 'Source Sans 3', sans-serif;
  }

  /* ── Dispute thread ── */
  .le-thread {
    margin-top: 14px;
    border-top: 1px solid #EEECE8;
    padding-top: 12px;
  }
  .le-thread-msg {
    margin-bottom: 10px;
  }
  .le-thread-meta {
    font-size: 10px; color: #888; margin-bottom: 3px;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-thread-bubble {
    display: inline-block;
    padding: 8px 12px; border-radius: 6px;
    font-size: 12px; line-height: 1.6; max-width: 90%;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-bubble-landlord { background: #F0EDE8; color: #1E1E1E; }
  .le-bubble-flent { background: #1C1C1C; color: #fff; }

  /* ── Sticky bottom bar ── */
  .le-bottom-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #fff; border-top: 1px solid #D4CFC6;
    padding: 14px 24px; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.08);
  }
  .le-bottom-total {
    display: flex; flex-direction: column; gap: 2px;
  }
  .le-bottom-total-num {
    font-size: 20px; font-weight: 600; color: #1E1E1E;
    font-family: 'Source Sans 3', sans-serif;
    font-variant-numeric: tabular-nums;
  }
  .le-bottom-total-lbl {
    font-size: 10px; color: #888; text-transform: uppercase;
    letter-spacing: 0.08em;
    font-family: 'Source Sans 3', sans-serif;
  }
  .le-btn-approve-all {
    padding: 12px 28px; background: #1C1C1C; color: #fff;
    border: none; border-radius: 6px;
    font-size: 14px; font-weight: 600; cursor: pointer;
    font-family: 'Source Sans 3', sans-serif;
    transition: opacity 0.15s; white-space: nowrap;
  }
  .le-btn-approve-all:hover { opacity: 0.85; }
  .le-btn-approve-all:disabled { opacity: 0.4; cursor: default; }

  /* ── Name modal ── */
  .le-name-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.5); z-index: 200;
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .le-name-modal {
    background: #fff; border-radius: 10px;
    padding: 28px 32px; max-width: 380px; width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  }
  .le-name-modal-title {
    font-family: 'Poppins', sans-serif;
    font-size: 16px; font-weight: 600; color: #1E1E1E;
    margin-bottom: 6px;
  }
  .le-name-modal-sub {
    font-size: 13px; color: #666; margin-bottom: 18px;
    font-family: 'Source Sans 3', sans-serif; line-height: 1.5;
  }
  .le-name-input {
    width: 100%; border: 1px solid #D4CFC6; border-radius: 6px;
    padding: 10px 14px; font-size: 16px; color: #1E1E1E;
    font-family: 'Source Sans 3', sans-serif; outline: none;
    margin-bottom: 14px;
  }
  .le-name-input:focus { border-color: #1C1C1C; }
  .le-btn-name-confirm {
    width: 100%; padding: 11px; background: #1C1C1C; color: #fff;
    border: none; border-radius: 6px;
    font-size: 14px; font-weight: 600; cursor: pointer;
    font-family: 'Source Sans 3', sans-serif;
  }

  /* ── Photo lightbox ── */
  .le-lightbox {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.92);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
    cursor: zoom-out;
  }
  .le-lightbox img {
    max-width: 100%; max-height: 90vh;
    border-radius: 4px; object-fit: contain;
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .le-header { padding: 16px 16px 14px; }
    .le-doc-title { font-size: 17px; }

    /* Meta strip: 2-column grid */
    .le-meta-strip {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
    }
    .le-meta-item { border-right: none; margin-right: 0; padding-right: 0; }

    /* Summary strip: hide separators, 2-column grid, total full-width */
    .le-summary {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 20px;
      padding: 14px 16px;
    }
    .le-sum-sep { display: none; }
    .le-sum-total { grid-column: 1 / -1; }
    .le-sum-num { font-size: 20px; }

    .le-banner  { padding: 12px 16px; }
    .le-area-head { padding: 12px 16px 10px; }

    /* Item card */
    .le-item { padding: 16px 16px; }

    /* Cost boxes stack vertically */
    .le-cost-row { flex-direction: column; }
    .le-cost-cell { min-width: unset; }

    /* Photos */
    .le-photos { gap: 6px; }
    .le-photo { width: 72px; height: 54px; }

    /* Action buttons: full-width, 44px min height */
    .le-actions { flex-direction: column; }
    .le-btn-approve,
    .le-btn-dispute,
    .le-btn-approved-badge,
    .le-btn-disputed-badge {
      width: 100%;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    }

    /* Dispute form reason tags: easy tap */
    .le-reason-tags { gap: 8px; }
    .le-reason-tag {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      font-size: 12px;
    }

    /* Dispute textarea font ≥16px (prevents iOS zoom) */
    .le-dispute-textarea { font-size: 16px; }

    /* Bottom bar: stack total above full-width button */
    .le-bottom-bar {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      padding: 12px 16px;
      padding-bottom: calc(12px + env(safe-area-inset-bottom));
    }
    .le-btn-approve-all {
      width: 100%;
      padding: 14px;
      font-size: 15px;
    }

    /* Name modal input ≥16px */
    .le-name-input { font-size: 16px; }
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
  const [disputeOpen, setDisputeOpen]   = useState({}) // itemId → bool
  const [disputeReason, setDisputeReason] = useState({}) // itemId → reasonKey
  const [disputeMsg, setDisputeMsg]     = useState({}) // itemId → string
  const [submitting, setSubmitting]     = useState({}) // itemId → bool

  // Approve-all state
  const [approving, setApproving]   = useState(false)

  // Photo lightbox
  const [lightbox, setLightbox]     = useState(null)

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimate_items', filter: `estimate_id=eq.${estimate.id}` }, refreshItems)
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

    // Refresh disputes from DB
    const { data: freshD } = await supabase.from('estimate_disputes').select('*').eq('estimate_id', estimate.id)
    if (freshD) setDisputes(freshD)

    setSubmitting(s => ({ ...s, [itemId]: false }))
  }

  async function approveAll() {
    const pendingItems  = items.filter(i => !i.status || i.status === 'pending')
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

  // Group by area
  const groups = []
  const seen   = {}
  visibleItems.forEach(item => {
    const area = item.area || 'General'
    if (!seen[area]) { seen[area] = []; groups.push({ area, items: seen[area] }) }
    seen[area].push(item)
  })

  const pid       = inspection?.pid || estimate?.pid || '—'
  const address   = inspection?.config?.address || ''
  const inspector = estimate?.inspector_name || '—'

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <LogoSpinner full />

  if (notFound) {
    return (
      <div style={{ minHeight: '100dvh', background: '#EDEAE4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', fontFamily: 'sans-serif', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1E1E1E', marginBottom: 6 }}>Link not found</div>
          <div style={{ fontSize: 13, color: '#888' }}>This estimate link is invalid or has expired.</div>
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
        <div className="le-topbar-brand">
          <div className="le-topbar-logo">
            <img src="/logo.svg" alt="Flent" />
          </div>
          <span className="le-topbar-name">Flent</span>
        </div>
        <span className="le-topbar-right">Estimate review portal</span>
      </div>

      <div className="le-doc">

        {/* ── Header ── */}
        <div className="le-header">
          <div className="le-header-top">
            <div className="le-brand">
              <div className="le-logo-box">
                <img src="/logo.svg" alt="Flent" />
              </div>
              <div>
                <div className="le-brand-name">Flent</div>
                <div className="le-brand-tag">why rent, when you can flent?</div>
              </div>
            </div>
            <div className="le-doc-right">
              <div className="le-doc-title">Repair Estimate</div>
              <div className="le-doc-pid">PID {pid}</div>
            </div>
          </div>
          <div className="le-meta-strip">
            {[
              { label: 'Property', val: address || `PID ${pid}` },
              { label: 'Inspection Date', val: fmtDate(inspection?.inspection_date) },
              { label: 'Inspector', val: inspector },
              { label: 'Valid Until', val: addDays(estimate?.created_at, 30) },
            ].map(m => (
              <div key={m.label} className="le-meta-item">
                <span className="le-meta-label">{m.label}</span>
                <span className="le-meta-val">{m.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Summary strip ── */}
        <div className="le-summary">
          {[
            { num: `₹${fmt(grandTotal)}`, lbl: 'Total Estimate' },
            null,
            { num: visibleItems.length, lbl: 'Items' },
            null,
            { num: approvedCount, lbl: 'Approved', color: approvedCount > 0 ? '#2A7A50' : undefined },
            null,
            { num: disputedCount, lbl: 'In Review', color: disputedCount > 0 ? '#B06020' : undefined },
            null,
            { num: pendingCount, lbl: 'Pending' },
          ].map((s, i) =>
            s === null
              ? <div key={i} className="le-sum-sep" />
              : <div key={s.lbl} className={`le-sum-item${s.lbl === 'Total Estimate' ? ' le-sum-total' : ''}`}>
                  <div className="le-sum-num" style={s.color ? { color: s.color } : {}}>{s.num}</div>
                  <div className="le-sum-lbl">{s.lbl}</div>
                </div>
          )}
        </div>

        {/* ── Instruction banner ── */}
        {!alreadyApproved && (
          <div className="le-banner">
            <div className="le-banner-icon">i</div>
            <div className="le-banner-text">
              <strong>Review each item below.</strong> Approve items you agree with, or raise a concern on any item that needs discussion. Once you're satisfied, use the button at the bottom to confirm the full estimate.
            </div>
          </div>
        )}

        {alreadyApproved && (
          <div style={{ padding: '14px 48px', background: '#E8F5EE', borderBottom: '1px solid #A8D8BB', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>✓</span>
            <div style={{ fontSize: 13, color: '#2A7A50', fontFamily: 'Source Sans 3, sans-serif' }}>
              <strong>Estimate {estimate.status === 'partially_approved' ? 'partially approved' : 'approved'}</strong>
              {estimate.approved_by_name ? ` — confirmed by ${estimate.approved_by_name}` : ''}
              {estimate.approved_at ? ` on ${fmtDate(estimate.approved_at)}` : ''}
            </div>
          </div>
        )}

        {/* ── Grouped items ── */}
        {groups.map(({ area, items: areaItems }) => (
          <div key={area} className="le-area-group">
            <div className="le-area-head">
              <span className="le-area-name">{area}</span>
              <span className="le-area-count">{areaItems.length} item{areaItems.length !== 1 ? 's' : ''}</span>
            </div>

            {areaItems.map(item => {
              const total     = itemTotal(item)
              const itemDisps = disputes.filter(d => d.estimate_item_id === item.id)
              const status    = item.status || 'pending'
              const isOpen    = !!disputeOpen[item.id]

              return (
                <div key={item.id} className="le-item">
                  {/* Row 1: name + status + total */}
                  <div className="le-item-row1">
                    <div className="le-item-name">{item.item_name || '—'}</div>
                    <span className={`le-status-pill le-pill-${status}`}>
                      {status === 'pending' ? 'Pending' : status === 'approved' ? '✓ Approved' : '⚑ In Review'}
                    </span>
                    {total != null && total > 0 && (
                      <div className="le-item-total">₹{fmt(total)}</div>
                    )}
                    {item.cost_type === 'actuals' && (
                      <div className="le-item-total" style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>Actuals</div>
                    )}
                  </div>

                  {/* Tags */}
                  <div className="le-tags">
                    {item.trade && <span className="le-tag le-tag-trade">{item.trade}</span>}
                    {item.area  && <span className="le-tag le-tag-area">{item.area}</span>}
                  </div>

                  {/* Issue description */}
                  {item.issue_description && (
                    <div className="le-item-desc">{item.issue_description}</div>
                  )}

                  {/* Cost breakdown */}
                  {item.cost_type === 'actuals' ? (
                    <div className="le-actuals-note">This item will be charged based on actual costs after the work is completed.</div>
                  ) : item.cost_type !== 'nil' && (
                    <div className="le-cost-row">
                      {((item.material_cost || 0) > 0 || item.material_description) && (
                        <div className="le-cost-cell">
                          <div className="le-cost-label">Material</div>
                          {item.material_description && <div className="le-cost-desc">{item.material_description}</div>}
                          <div className="le-cost-val">₹{fmt(item.material_cost)}</div>
                        </div>
                      )}
                      {((item.labour_cost || 0) > 0 || item.labour_description) && (
                        <div className="le-cost-cell">
                          <div className="le-cost-label">Labour</div>
                          {item.labour_description && <div className="le-cost-desc">{item.labour_description}</div>}
                          <div className="le-cost-val">₹{fmt(item.labour_cost)}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Photos */}
                  {item._photos?.length > 0 && (
                    <div className="le-photos">
                      {item._photos.map((url, pi) => (
                        <img
                          key={pi}
                          src={url}
                          alt={`Photo ${pi + 1}`}
                          className="le-photo"
                          onClick={() => setLightbox(url)}
                        />
                      ))}
                    </div>
                  )}

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
        ))}

      </div>

      {/* ── Sticky bottom bar ── */}
      {!alreadyApproved && (
        <div className="le-bottom-bar">
          <div className="le-bottom-total">
            <div className="le-bottom-total-num">₹{fmt(grandTotal)}</div>
            <div className="le-bottom-total-lbl">Total Estimate</div>
          </div>
          <button
            className="le-btn-approve-all"
            disabled={approving || pendingCount === 0}
            onClick={() => requireName(approveAll)}
          >
            {approving ? 'Approving…' : pendingCount === 0 ? 'All reviewed' : `✓ Approve Estimate`}
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
