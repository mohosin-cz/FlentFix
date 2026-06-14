import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LogoSpinner from '../components/LogoSpinner'

// ─── Hero copy ────────────────────────────────────────────────────────────────
const HERO_TITLE    = 'Your home, cared for'
const HERO_SUBTITLE = 'before anyone moves in.'

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  :root {
    --le-paper:           #F4F0E8;
    --le-desk:            #E7E0D1;
    --le-ink:             #211C44;
    --le-ink-soft:        #5E5872;
    --le-hairline:        #DED6C4;
    --le-hairline-strong: #CCC2AC;
    --le-clay:            #C76B4A;
    --le-apricot:         #E7B07F;
    --le-green:           #3A6642;

    --le-display: 'Newsreader', Georgia, serif;
    --le-sans:    'Hanken Grotesk', system-ui, sans-serif;
    --le-mono:    'IBM Plex Mono', monospace;
  }

  *, *::before, *::after { box-sizing: border-box; }

  .le-wrap {
    min-height: 100dvh;
    background: var(--le-paper);
    font-family: var(--le-sans);
    color: var(--le-ink);
    -webkit-font-smoothing: antialiased;
  }

  @media (min-width: 641px) {
    .le-wrap { background: var(--le-desk); }
  }

  /* ── Top bar ── */
  .le-topbar {
    background: var(--le-paper);
    height: 56px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 26px;
    border-bottom: 1px solid var(--le-hairline);
    position: sticky; top: 0; z-index: 50;
  }

  @media (min-width: 641px) {
    .le-topbar {
      padding: 0 calc(max(26px, (100vw - 788px) / 2 + 68px));
      height: 60px;
    }
  }

  .le-logo-pill {
    background: var(--le-ink);
    border-radius: 100px;
    padding: 6px 18px;
    font-family: var(--le-display);
    font-size: 14px; font-weight: 400; font-style: italic;
    color: var(--le-paper);
    letter-spacing: -0.01em;
    line-height: 1;
  }

  .le-topbar-tag {
    font-family: var(--le-mono);
    font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--le-ink-soft);
  }

  /* ── Document container ── */
  .le-container {
    padding: 0 26px 120px;
  }

  @media (min-width: 641px) {
    .le-container {
      max-width: 788px;
      margin: 44px auto;
      padding: 40px 68px 80px;
      background: var(--le-paper);
      border-radius: 4px;
      box-shadow: 0 2px 20px rgba(33,28,68,0.09), 0 0 0 1px var(--le-hairline);
    }
  }

  /* ── Hero ── */
  .le-hero { padding: 36px 0 24px; }

  .le-hero-eyebrow {
    font-family: var(--le-mono);
    font-size: 9px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--le-clay);
    margin-bottom: 12px; display: block;
  }

  .le-hero-h1 {
    font-family: var(--le-display);
    font-size: clamp(24px, 5vw, 32px);
    font-weight: 400; font-style: italic;
    color: var(--le-ink);
    line-height: 1.25; margin: 0 0 10px;
  }

  .le-hero-em { font-style: italic; display: block; }

  .le-hero-sub {
    font-size: 14px; color: var(--le-ink-soft);
    line-height: 1.65; font-family: var(--le-sans);
    max-width: 480px;
  }

  /* ── Meta card ── */
  .le-meta-card {
    background: #fff;
    border-radius: 10px;
    border: 1px solid var(--le-hairline-strong);
    display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;
    overflow: hidden; margin-bottom: 20px;
  }

  .le-meta-cell {
    padding: 16px 18px;
    border-right: 1px solid var(--le-hairline);
  }
  .le-meta-cell:last-child { border-right: none; }

  .le-meta-lbl {
    font-family: var(--le-mono);
    font-size: 8px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--le-ink-soft); margin-bottom: 6px; display: block;
  }

  .le-meta-val {
    font-family: var(--le-display);
    font-size: 13px; font-weight: 400;
    color: var(--le-ink); line-height: 1.3;
  }

  /* ── Stats row ── */
  .le-stats-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
    gap: 8px; margin-bottom: 24px;
  }

  .le-stat-card {
    background: #fff;
    border-radius: 8px; border: 1px solid var(--le-hairline-strong);
    padding: 12px 14px;
  }

  .le-stat-card-total {
    background: var(--le-ink);
    border-color: var(--le-ink);
  }

  .le-stat-num {
    font-family: var(--le-mono);
    font-size: 20px; font-weight: 500;
    color: var(--le-ink);
    line-height: 1; margin-bottom: 4px;
    font-variant-numeric: tabular-nums;
  }

  .le-stat-card-total .le-stat-num { color: var(--le-paper); font-size: 22px; }

  .le-stat-lbl {
    font-family: var(--le-mono);
    font-size: 8px; font-weight: 400;
    text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--le-ink-soft);
  }

  .le-stat-card-total .le-stat-lbl { color: rgba(244,240,232,0.5); }

  /* ── Banners ── */
  .le-banner {
    background: #fff; border: 1px solid var(--le-hairline-strong);
    border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;
    display: flex; align-items: flex-start; gap: 10px;
  }

  .le-banner-dot {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--le-ink); color: var(--le-paper);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--le-mono); font-size: 9px; flex-shrink: 0; margin-top: 1px;
  }

  .le-banner-text {
    font-size: 13px; color: var(--le-ink-soft);
    line-height: 1.6; font-family: var(--le-sans);
  }

  .le-approved-banner {
    background: rgba(58,102,66,0.07); border: 1px solid rgba(58,102,66,0.2);
    border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: var(--le-green);
    font-family: var(--le-sans);
  }

  /* ── Trade groups ── */
  .le-trade-group { margin-bottom: 32px; }

  .le-trade-head {
    display: flex; align-items: baseline; justify-content: space-between;
    padding-bottom: 10px;
    border-bottom: 1.5px solid var(--le-ink);
    margin-bottom: 14px;
  }

  .le-trade-name {
    font-family: var(--le-display);
    font-size: 18px; font-weight: 400; font-style: italic;
    color: var(--le-ink);
  }

  .le-trade-meta {
    font-family: var(--le-mono);
    font-size: 10px; color: var(--le-ink-soft);
    letter-spacing: 0.04em; white-space: nowrap;
  }

  /* ── Item card (plate layout) ── */
  .le-item {
    background: #fff; border-radius: 10px;
    border: 1px solid var(--le-hairline-strong);
    margin-bottom: 10px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .le-item-plate {
    display: grid;
    grid-template-columns: 96px 1fr;
    min-height: 96px;
  }

  .le-item-thumb-wrap {
    background: var(--le-paper);
    border-right: 1px solid var(--le-hairline);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: opacity 0.15s;
    overflow: hidden; position: relative;
  }

  .le-item-thumb-wrap.no-photo { cursor: default; }
  .le-item-thumb-wrap:not(.no-photo):hover { opacity: 0.82; }

  .le-item-thumb {
    width: 100%; height: 100%;
    object-fit: cover; display: block;
  }

  .le-item-body {
    padding: 12px 14px;
    display: flex; flex-direction: column; gap: 4px;
  }

  .le-item-toprow {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 8px; margin-bottom: 2px;
  }

  .le-item-toprow-right {
    display: flex; flex-direction: column; align-items: flex-end;
    gap: 4px; flex-shrink: 0;
  }

  .le-item-name {
    font-family: var(--le-display);
    font-size: 14px; font-weight: 400;
    color: var(--le-ink); line-height: 1.35;
  }

  .le-item-cost {
    font-family: var(--le-mono);
    font-size: 13px; font-weight: 500;
    color: var(--le-ink);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .le-item-actuals-cost {
    font-family: var(--le-mono);
    font-size: 9px; letter-spacing: 0.08em; font-weight: 500;
    color: var(--le-clay); white-space: nowrap;
  }

  .le-item-area {
    font-family: var(--le-mono);
    font-size: 9px; font-weight: 400;
    color: var(--le-ink-soft); letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .le-item-desc {
    font-size: 12px; color: var(--le-ink-soft);
    line-height: 1.6; font-family: var(--le-sans);
  }

  .le-item-costs {
    font-family: var(--le-mono);
    font-size: 10px; color: var(--le-ink-soft);
    letter-spacing: 0.03em;
  }

  .le-item-actuals-note {
    font-size: 11px; color: var(--le-clay);
    font-style: italic; font-family: var(--le-sans);
  }

  /* ── Status pill ── */
  .le-status-pill {
    font-family: var(--le-mono);
    font-size: 8px; font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 100px;
    flex-shrink: 0; white-space: nowrap;
  }

  .le-pill-pending  { background: rgba(94,88,114,0.08); color: var(--le-ink-soft); }
  .le-pill-approved { background: rgba(58,102,66,0.1);  color: var(--le-green); }
  .le-pill-disputed { background: rgba(199,107,74,0.1); color: var(--le-clay); }

  /* ── Item footer ── */
  .le-item-footer {
    padding: 10px 14px 14px;
    border-top: 1px solid var(--le-hairline);
  }

  /* ── Action buttons ── */
  .le-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  .le-btn-approve {
    display: inline-flex; align-items: center;
    padding: 9px 18px; border-radius: 2px;
    background: var(--le-ink); color: var(--le-paper); border: none;
    font-family: var(--le-sans); font-size: 12px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s; white-space: nowrap;
    min-height: 44px;
  }
  .le-btn-approve:hover { opacity: 0.85; }
  .le-btn-approve:disabled { opacity: 0.4; cursor: default; }

  .le-btn-ask {
    display: inline-flex; align-items: center;
    background: none; border: none; padding: 0;
    color: var(--le-ink-soft); font-family: var(--le-sans); font-size: 12px;
    text-decoration: underline; text-underline-offset: 3px;
    cursor: pointer; transition: color 0.15s;
    min-height: 44px;
  }
  .le-btn-ask:hover { color: var(--le-ink); }

  .le-btn-approved-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 18px; border-radius: 2px;
    background: rgba(58,102,66,0.08); color: var(--le-green);
    border: 1.5px solid rgba(58,102,66,0.22);
    font-family: var(--le-sans); font-size: 12px; font-weight: 600;
    min-height: 44px;
  }

  .le-btn-disputed-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 18px; border-radius: 2px;
    background: rgba(199,107,74,0.08); color: var(--le-clay);
    border: 1.5px solid rgba(199,107,74,0.22);
    font-family: var(--le-sans); font-size: 12px; font-weight: 600;
    min-height: 44px;
  }

  /* ── Dispute form ── */
  .le-dispute-form {
    margin-top: 12px; padding: 14px 16px;
    background: var(--le-paper); border: 1px solid var(--le-hairline-strong);
    border-radius: 8px;
  }

  .le-dispute-title {
    font-family: var(--le-mono);
    font-size: 9px; font-weight: 500;
    color: var(--le-ink); text-transform: uppercase;
    letter-spacing: 0.12em; margin-bottom: 10px;
  }

  .le-reason-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }

  .le-reason-tag {
    padding: 8px 14px; border-radius: 100px;
    border: 1.5px solid var(--le-hairline-strong); background: #fff;
    font-family: var(--le-sans); font-size: 11px; color: var(--le-ink-soft);
    cursor: pointer; transition: all 0.15s;
    min-height: 40px; display: inline-flex; align-items: center;
  }
  .le-reason-tag.selected { background: var(--le-ink); color: var(--le-paper); border-color: var(--le-ink); }

  .le-dispute-textarea {
    width: 100%; resize: vertical;
    border: 1.5px solid var(--le-hairline-strong); border-radius: 8px;
    padding: 10px 12px; font-size: 16px; color: var(--le-ink);
    font-family: var(--le-sans); background: #fff; outline: none;
    margin-bottom: 10px; min-height: 64px;
  }
  .le-dispute-textarea:focus { border-color: var(--le-ink); }

  .le-dispute-actions { display: flex; gap: 8px; }

  .le-btn-submit {
    padding: 9px 20px; border-radius: 2px;
    background: var(--le-ink); color: var(--le-paper); border: none;
    font-family: var(--le-sans); font-size: 12px; font-weight: 600;
    cursor: pointer; min-height: 40px;
  }
  .le-btn-submit:disabled { opacity: 0.4; cursor: default; }

  .le-btn-cancel {
    padding: 9px 16px; border-radius: 2px;
    background: none; color: var(--le-ink-soft);
    border: 1.5px solid var(--le-hairline-strong);
    font-family: var(--le-sans); font-size: 12px; cursor: pointer;
    min-height: 40px;
  }

  /* ── Dispute thread ── */
  .le-thread { margin-top: 12px; border-top: 1px solid var(--le-hairline); padding-top: 12px; }
  .le-thread-msg { margin-bottom: 10px; }
  .le-thread-meta { font-family: var(--le-mono); font-size: 9px; color: var(--le-ink-soft); margin-bottom: 3px; letter-spacing: 0.04em; }
  .le-thread-bubble {
    display: inline-block; padding: 8px 12px; border-radius: 8px;
    font-size: 12px; line-height: 1.6; max-width: 90%;
    font-family: var(--le-sans);
  }
  .le-bubble-landlord { background: rgba(222,214,196,0.45); color: var(--le-ink); }
  .le-bubble-flent    { background: var(--le-ink); color: var(--le-paper); }

  /* ── Notes & terms ── */
  .le-notes-card {
    background: #fff; border-radius: 10px;
    border: 1px solid var(--le-hairline-strong);
    padding: 18px 20px; margin-bottom: 24px;
  }

  .le-notes-label {
    font-family: var(--le-mono);
    font-size: 8px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--le-ink-soft); margin-bottom: 10px; display: block;
  }

  .le-notes-body {
    font-size: 13px; color: var(--le-ink-soft);
    font-style: italic; line-height: 1.7;
    font-family: var(--le-sans);
  }

  /* ── Sticky bottom bar ── */
  .le-bottom-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--le-ink);
    padding: 14px 26px;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
    z-index: 100;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }

  @media (min-width: 641px) {
    .le-bottom-bar {
      padding: 14px calc(max(26px, (100vw - 788px) / 2 + 68px));
    }
  }

  .le-bottom-total-num {
    font-family: var(--le-mono);
    font-size: 20px; font-weight: 500;
    color: var(--le-paper); line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .le-bottom-total-lbl {
    font-family: var(--le-mono);
    font-size: 8px; text-transform: uppercase;
    letter-spacing: 0.1em; color: rgba(244,240,232,0.5);
    margin-top: 3px;
  }

  .le-btn-approve-all {
    padding: 12px 28px; background: var(--le-apricot);
    color: var(--le-ink); border: none; border-radius: 2px;
    font-family: var(--le-sans); font-size: 14px; font-weight: 700;
    cursor: pointer; transition: opacity 0.15s; white-space: nowrap;
    min-height: 44px;
  }
  .le-btn-approve-all:hover { opacity: 0.85; }
  .le-btn-approve-all:disabled { opacity: 0.4; cursor: default; }
  .le-btn-approve-all.done {
    background: rgba(58,102,66,0.18); color: var(--le-green);
    border: 1.5px solid rgba(58,102,66,0.3);
  }

  /* ── Name modal ── */
  .le-name-overlay {
    position: fixed; inset: 0; background: rgba(33,28,68,0.55); z-index: 200;
    display: flex; align-items: center; justify-content: center; padding: 20px;
  }

  .le-name-modal {
    background: #fff; border-radius: 14px;
    padding: 28px; max-width: 360px; width: 100%;
    box-shadow: 0 20px 60px rgba(33,28,68,0.2);
  }

  .le-name-modal-title {
    font-family: var(--le-display);
    font-size: 20px; font-weight: 400; font-style: italic;
    color: var(--le-ink); margin-bottom: 6px;
  }

  .le-name-modal-sub {
    font-family: var(--le-sans);
    font-size: 13px; color: var(--le-ink-soft); margin-bottom: 18px; line-height: 1.5;
  }

  .le-name-input {
    width: 100%; border: 1.5px solid var(--le-hairline-strong); border-radius: 8px;
    padding: 11px 14px; font-size: 16px; color: var(--le-ink);
    font-family: var(--le-sans); outline: none; margin-bottom: 14px;
  }
  .le-name-input:focus { border-color: var(--le-ink); }

  .le-btn-name-confirm {
    width: 100%; padding: 13px; background: var(--le-ink); color: var(--le-paper);
    border: none; border-radius: 2px;
    font-family: var(--le-sans); font-size: 14px; font-weight: 600; cursor: pointer;
    min-height: 44px;
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
    .le-container { padding: 0 26px 120px; }
    .le-hero { padding: 24px 0 18px; }

    .le-meta-card { grid-template-columns: 1fr 1fr; }
    .le-meta-cell:nth-child(2) { border-right: none; }
    .le-meta-cell:nth-child(3) { border-top: 1px solid var(--le-hairline); border-right: 1px solid var(--le-hairline); }
    .le-meta-cell:nth-child(4) { border-top: 1px solid var(--le-hairline); border-right: none; }

    .le-stats-row { grid-template-columns: 1fr 1fr; }
    .le-stat-card-total { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; }
    .le-stat-card-total .le-stat-num { font-size: 24px; }

    .le-trade-name { font-size: 16px; }

    .le-item-plate { grid-template-columns: 72px 1fr; min-height: 72px; }

    .le-actions { flex-direction: column; }
    .le-btn-approve,
    .le-btn-approved-badge,
    .le-btn-disputed-badge { width: 100%; justify-content: center; font-size: 13px; }
    .le-btn-ask { font-size: 13px; }

    .le-reason-tag { font-size: 12px; min-height: 42px; }

    .le-bottom-bar {
      flex-direction: column; align-items: stretch; gap: 10px;
      padding: 14px 16px;
      padding-bottom: calc(14px + env(safe-area-inset-bottom));
    }
    .le-btn-approve-all { width: 100%; text-align: center; padding: 15px; font-size: 15px; }
    .le-bottom-total-num { font-size: 18px; }
  }

  /* ── Focus rings ── */
  .le-btn-approve:focus-visible,
  .le-btn-ask:focus-visible,
  .le-btn-approved-badge:focus-visible,
  .le-btn-submit:focus-visible,
  .le-btn-cancel:focus-visible,
  .le-btn-name-confirm:focus-visible,
  .le-reason-tag:focus-visible,
  .le-item-thumb-wrap:focus-visible {
    outline: 2px solid var(--le-clay);
    outline-offset: 2px;
  }

  .le-bottom-bar .le-btn-approve-all:focus-visible {
    outline: 2px solid var(--le-paper);
    outline-offset: 2px;
  }

  /* ── Reduced motion ── */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
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
  { key: 'not_needed',     label: 'Not needed' },
  { key: 'price_too_high', label: 'Price too high' },
  { key: 'already_fixed',  label: 'Already fixed' },
  { key: 'question',       label: 'Question' },
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function LandlordEstimate() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === '1' || searchParams.get('preview') === 'true'

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

  // Esc key closes lightbox
  useEffect(() => {
    if (!lightbox) return
    const handler = e => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightbox])

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

    // Log first view — skipped when preview=1 (Flent staff self-preview)
    if (!est.first_viewed_at && !isPreview) {
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

  const pid      = inspection?.pid || estimate?.pid || '—'
  const address  = inspection?.config?.address || ''
  const inspector = estimate?.inspector_name || '—'

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return <LogoSpinner full />

  if (notFound) {
    return (
      <div style={{ minHeight: '100dvh', background: '#F4F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40, fontFamily: "'Hanken Grotesk', system-ui, sans-serif" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#211C44', marginBottom: 6 }}>Link not found</div>
          <div style={{ fontSize: 13, color: '#5E5872' }}>This estimate link is invalid or has expired.</div>
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
        <span className="le-logo-pill">flent</span>
        <span className="le-topbar-tag">Estimate Review</span>
      </div>

      <div className="le-container">

        {/* ── Hero ── */}
        <div className="le-hero">
          <span className="le-hero-eyebrow">Property Estimate</span>
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
            <div className="le-stat-num" style={approvedCount > 0 ? { color: 'var(--le-green)' } : {}}>{approvedCount}</div>
            <div className="le-stat-lbl">Approved</div>
          </div>
          <div className="le-stat-card">
            <div className="le-stat-num" style={disputedCount > 0 ? { color: 'var(--le-clay)' } : {}}>{disputedCount}</div>
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
                const total     = itemTotal(item)
                const itemDisps = disputes.filter(d => d.estimate_item_id === item.id)
                const status    = item.status || 'pending'
                const isOpen    = !!disputeOpen[item.id]
                const thumb     = item._photos?.[0] || null

                return (
                  <div key={item.id} className="le-item">

                    {/* Plate: thumb gutter + content */}
                    <div className="le-item-plate">
                      <div
                        className={`le-item-thumb-wrap${thumb ? '' : ' no-photo'}`}
                        onClick={thumb ? () => setLightbox(thumb) : undefined}
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="le-item-thumb" />
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2 }}>
                            <rect x="3" y="3" width="18" height="18" rx="3" stroke="#211C44" strokeWidth="1.5"/>
                            <circle cx="8.5" cy="8.5" r="1.5" fill="#211C44"/>
                            <path d="M3 15l5-5 4 4 3-3 6 6" stroke="#211C44" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>

                      <div className="le-item-body">
                        <div className="le-item-toprow">
                          <span className="le-item-name">{item.item_name || '—'}</span>
                          <div className="le-item-toprow-right">
                            {total != null && total > 0 ? (
                              <span className="le-item-cost">₹{fmt(total)}</span>
                            ) : item.cost_type === 'actuals' ? (
                              <span className="le-item-actuals-cost">ACTUALS</span>
                            ) : null}
                            <span className={`le-status-pill le-pill-${status}`}>
                              {status === 'pending' ? 'Pending' : status === 'approved' ? '✓ Approved' : '⚑ In Review'}
                            </span>
                          </div>
                        </div>

                        {item.area && (
                          <div className="le-item-area">{item.area}</div>
                        )}

                        {item.issue_description && (
                          <div className="le-item-desc">{item.issue_description}</div>
                        )}

                        {item.cost_type === 'actuals' ? (
                          <div className="le-item-actuals-note">
                            Charged on actual costs after work is completed.
                          </div>
                        ) : item.cost_type !== 'nil' && (
                          <div className="le-item-costs">
                            {(item.material_cost || 0) > 0 && `Material · ₹${fmt(item.material_cost)}`}
                            {(item.material_cost || 0) > 0 && (item.labour_cost || 0) > 0 && '   '}
                            {(item.labour_cost || 0) > 0 && `Labour · ₹${fmt(item.labour_cost)}`}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action footer */}
                    <div className="le-item-footer">
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
                              Approve
                            </button>
                            <button
                              className="le-btn-ask"
                              disabled={!!submitting[item.id]}
                              onClick={() => requireName(() => setDisputeOpen(s => ({ ...s, [item.id]: !s[item.id] })))}
                            >
                              {isOpen ? '✕ Cancel' : 'Ask about this'}
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

                  </div>
                )
              })}
            </div>
          )
        })}

        {/* ── Notes & terms ── */}
        <div className="le-notes-card">
          <span className="le-notes-label">Notes &amp; Terms</span>
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
            className={`le-btn-approve-all${pendingCount === 0 && !approving ? ' done' : ''}`}
            disabled={approving || pendingCount === 0}
            onClick={() => requireName(approveAll)}
          >
            {approving ? 'Approving…' : pendingCount === 0 ? 'All reviewed ✓' : 'Approve all'}
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
