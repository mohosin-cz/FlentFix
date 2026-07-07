import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LogoSpinner from '../components/LogoSpinner'
import FlentWordmark from '../components/FlentWordmark'

const HERO_TITLE    = 'Your home, cared for'
const HERO_SUBTITLE = 'before anyone moves in.'

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

  @media (min-width: 641px) { .le-wrap { background: var(--le-desk); } }

  /* topbar */
  .le-topbar {
    background: var(--le-paper);
    height: 56px;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 26px;
    border-bottom: 1px solid var(--le-hairline);
    position: sticky; top: 0; z-index: 50;
  }
  @media (min-width: 641px) {
    .le-topbar { padding: 0 calc(max(26px, (100vw - 788px) / 2 + 68px)); height: 60px; }
  }
  .le-logo-pill {
    background: var(--le-ink); border-radius: 100px; padding: 6px 18px;
    font-family: var(--le-display); font-size: 14px; font-weight: 400; font-style: italic;
    color: var(--le-paper); letter-spacing: -0.01em; line-height: 1;
  }
  .le-topbar-tag {
    font-family: var(--le-mono); font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.12em; color: var(--le-ink-soft);
  }

  /* document container */
  .le-container { padding: 0 26px 140px; }
  @media (min-width: 641px) {
    .le-container {
      max-width: 788px; margin: 44px auto; padding: 40px 68px 100px;
      background: var(--le-paper); border-radius: 4px;
      box-shadow: 0 2px 20px rgba(33,28,68,0.09), 0 0 0 1px var(--le-hairline);
    }
  }

  /* hero */
  .le-hero { padding: 36px 0 20px; }
  .le-hero-eyebrow {
    font-family: var(--le-mono); font-size: 9px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--le-clay); margin-bottom: 12px; display: block;
  }
  .le-hero-h1 {
    font-family: var(--le-display); font-size: clamp(24px, 5vw, 32px);
    font-weight: 400; font-style: italic; color: var(--le-ink); line-height: 1.25; margin: 0;
  }

  /* record line — hairline, no card */
  .le-record {
    display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
    padding: 12px 0;
    border-top: 1px solid var(--le-hairline);
    border-bottom: 1px solid var(--le-hairline);
    margin: 20px 0 28px;
  }
  .le-record-item {
    font-family: var(--le-mono); font-size: 10px;
    color: var(--le-ink-soft); letter-spacing: 0.04em;
  }
  .le-record-sep {
    font-family: var(--le-mono); font-size: 10px;
    color: var(--le-hairline-strong); user-select: none;
  }

  /* summary */
  .le-summary { margin-bottom: 36px; }
  .le-summary-sentence {
    font-family: var(--le-display); font-size: clamp(17px, 3vw, 22px);
    font-weight: 400; font-style: italic; color: var(--le-ink);
    line-height: 1.45; margin: 0 0 16px;
  }
  .le-summary-total-row { display: flex; align-items: baseline; gap: 10px; }
  .le-summary-total {
    font-family: var(--le-mono); font-size: 32px; font-weight: 500;
    color: var(--le-ink); font-variant-numeric: tabular-nums; line-height: 1;
  }
  .le-summary-total-lbl {
    font-family: var(--le-mono); font-size: 10px; color: var(--le-ink-soft);
    text-transform: uppercase; letter-spacing: 0.1em;
  }
  .le-gauge-wrap { margin-top: 16px; display: flex; align-items: center; gap: 10px; }
  .le-gauge-track {
    flex: 1; height: 5px; border-radius: 3px;
    background: var(--le-hairline-strong); overflow: hidden;
  }
  .le-gauge-fill { height: 100%; border-radius: 3px; background: var(--le-green); }
  .le-gauge-label {
    font-family: var(--le-mono); font-size: 9px;
    color: var(--le-ink-soft); letter-spacing: 0.06em; white-space: nowrap;
  }

  /* approved banner */
  .le-approved-banner {
    background: rgba(58,102,66,0.07); border: 1px solid rgba(58,102,66,0.2);
    border-radius: 4px; padding: 12px 16px; margin-bottom: 28px;
    display: flex; align-items: center; gap: 10px;
    font-family: var(--le-sans); font-size: 13px; color: var(--le-green);
  }

  /* trade group */
  .le-trade-group { margin-bottom: 40px; }
  .le-trade-head {
    display: flex; align-items: baseline; justify-content: space-between;
    padding-bottom: 10px; border-bottom: 1.5px solid var(--le-ink);
  }
  .le-trade-name {
    font-family: var(--le-display); font-size: 20px;
    font-weight: 400; font-style: italic; color: var(--le-ink);
  }
  .le-trade-meta {
    font-family: var(--le-mono); font-size: 10px;
    color: var(--le-ink-soft); letter-spacing: 0.04em; white-space: nowrap;
  }

  /* plate */
  .le-plate { padding-top: 24px; border-top: 1px solid var(--le-hairline); margin-top: 24px; }
  .le-plate-index {
    font-family: var(--le-mono); font-size: 9px; font-weight: 500;
    color: var(--le-ink-soft); letter-spacing: 0.12em; text-transform: uppercase;
    display: block; margin-bottom: 14px;
  }

  /* plate body: vertical stack — image above, text below */
  .le-plate-body { display: flex; flex-direction: column; gap: 16px; }

  /* media block */
  .le-plate-media { display: flex; flex-direction: column; gap: 8px; }

  /* hero — full-width featured photo, tall enough to read detail */
  .le-plate-hero {
    width: 100%; height: 224px; border-radius: 10px; overflow: hidden;
    background: var(--le-hairline); position: relative; cursor: pointer;
  }
  @media (min-width: 641px) { .le-plate-hero { height: 292px; } }
  .le-plate-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* secondary thumbs — small squares below the hero */
  .le-plate-sec-row { display: flex; gap: 6px; }
  .le-plate-sec-thumb {
    width: 76px; height: 76px; border-radius: 7px; overflow: hidden; flex-shrink: 0;
    background: var(--le-hairline); position: relative; cursor: pointer;
  }
  @media (min-width: 641px) { .le-plate-sec-thumb { width: 88px; height: 88px; } }
  .le-plate-sec-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .le-plate-overflow-pill {
    position: absolute; inset: 0; background: rgba(33,28,68,0.55);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--le-mono); font-size: 12px; font-weight: 600;
    color: var(--le-paper); letter-spacing: 0.04em;
  }

  /* video play chip */
  .le-media-chip {
    position: absolute; bottom: 6px; right: 6px;
    font-family: var(--le-mono); font-size: 8px; font-weight: 500;
    color: var(--le-paper); background: rgba(33,28,68,0.72);
    padding: 2px 5px; border-radius: 2px; letter-spacing: 0.04em; line-height: 1.4;
  }

  /* plate content */
  .le-plate-content { display: flex; flex-direction: column; gap: 7px; }
  .le-plate-title-row {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 14px;
  }
  .le-plate-title {
    font-family: var(--le-display); font-size: 16px; font-weight: 400; font-style: italic;
    color: var(--le-ink); line-height: 1.35;
  }
  .le-plate-cost {
    font-family: var(--le-mono); font-size: 14px; font-weight: 600;
    color: var(--le-ink); white-space: nowrap; flex-shrink: 0;
    font-variant-numeric: tabular-nums; padding-top: 3px;
  }
  .le-plate-actuals {
    font-family: var(--le-mono); font-size: 9px; font-weight: 500;
    color: var(--le-clay); white-space: nowrap; flex-shrink: 0; letter-spacing: 0.08em; padding-top: 2px;
  }
  .le-plate-action-mark {
    font-family: var(--le-mono); font-size: 9px; font-weight: 500;
    color: var(--le-ink-soft); letter-spacing: 0.08em; text-transform: uppercase;
  }
  .le-plate-area {
    font-family: var(--le-mono); font-size: 9px;
    color: var(--le-ink-soft); letter-spacing: 0.06em; text-transform: uppercase;
  }
  .le-plate-issue {
    font-family: var(--le-sans); font-size: 13px;
    color: var(--le-ink-soft); line-height: 1.6; margin: 0;
  }
  .le-plate-remedy {
    border-left: 2px solid var(--le-clay); padding-left: 12px;
    font-family: var(--le-sans); font-size: 13px; color: var(--le-ink); line-height: 1.6;
  }
  .le-plate-costs {
    font-family: var(--le-mono); font-size: 10px;
    color: var(--le-ink-soft); letter-spacing: 0.03em;
  }
  .le-plate-actions {
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 6px;
  }
  .le-plate-state {
    font-family: var(--le-mono); font-size: 10px; font-weight: 500;
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .le-plate-state--approved { color: var(--le-green); }
  .le-plate-state--disputed { color: var(--le-clay); }

  /* action buttons */
  .le-btn-approve {
    display: inline-flex; align-items: center;
    padding: 9px 18px; border-radius: 2px;
    background: var(--le-ink); color: var(--le-paper); border: none;
    font-family: var(--le-sans); font-size: 12px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s; white-space: nowrap; min-height: 44px;
  }
  .le-btn-approve:hover { opacity: 0.85; }
  .le-btn-approve:disabled { opacity: 0.4; cursor: default; }

  .le-btn-ask {
    display: inline-flex; align-items: center;
    background: none; border: none; padding: 0;
    color: var(--le-ink-soft); font-family: var(--le-sans); font-size: 12px;
    text-decoration: underline; text-underline-offset: 3px;
    cursor: pointer; transition: color 0.15s; min-height: 44px;
  }
  .le-btn-ask:hover { color: var(--le-ink); }

  .le-dispute-textarea {
    width: 100%; resize: vertical;
    border: 1.5px solid var(--le-hairline-strong); border-radius: 4px;
    padding: 10px 12px; font-size: 16px; color: var(--le-ink);
    font-family: var(--le-sans); background: var(--le-paper); outline: none;
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
    font-family: var(--le-sans); font-size: 12px; cursor: pointer; min-height: 40px;
  }

  /* dispute thread */
  .le-thread { margin-top: 12px; border-top: 1px solid var(--le-hairline); padding-top: 12px; }
  .le-thread-msg { margin-bottom: 10px; }
  .le-thread-meta { font-family: var(--le-mono); font-size: 9px; color: var(--le-ink-soft); margin-bottom: 3px; letter-spacing: 0.04em; }
  .le-thread-bubble {
    display: inline-block; padding: 8px 12px; border-radius: 4px;
    font-size: 12px; line-height: 1.6; max-width: 90%; font-family: var(--le-sans);
  }
  .le-bubble-landlord { background: rgba(222,214,196,0.45); color: var(--le-ink); }
  .le-bubble-flent    { background: var(--le-ink); color: var(--le-paper); }

  /* notes */
  .le-notes-card {
    border-top: 1px solid var(--le-hairline); padding-top: 24px; margin-top: 40px;
  }
  .le-notes-label {
    font-family: var(--le-mono); font-size: 8px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: var(--le-ink-soft); margin-bottom: 10px; display: block;
  }
  .le-notes-body {
    font-size: 13px; color: var(--le-ink-soft); font-style: italic;
    line-height: 1.7; font-family: var(--le-sans);
  }

  /* sticky bottom bar */
  .le-bottom-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--le-ink);
    padding: 14px 26px;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
    z-index: 100;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  @media (min-width: 641px) {
    .le-bottom-bar { padding: 14px calc(max(26px, (100vw - 788px) / 2 + 68px)); }
  }
  .le-bottom-total-num {
    font-family: var(--le-mono); font-size: 20px; font-weight: 500;
    color: var(--le-paper); line-height: 1; font-variant-numeric: tabular-nums;
  }
  .le-bottom-total-lbl {
    font-family: var(--le-mono); font-size: 8px; text-transform: uppercase;
    letter-spacing: 0.1em; color: rgba(244,240,232,0.5); margin-top: 3px;
  }
  .le-btn-approve-all {
    padding: 12px 28px; background: var(--le-apricot);
    color: var(--le-ink); border: none; border-radius: 2px;
    font-family: var(--le-sans); font-size: 14px; font-weight: 700;
    cursor: pointer; transition: opacity 0.15s; white-space: nowrap; min-height: 44px;
  }
  .le-btn-approve-all:hover { opacity: 0.85; }
  .le-btn-approve-all:disabled { opacity: 0.4; cursor: default; }
  .le-btn-approve-all.done {
    background: rgba(58,102,66,0.18); color: var(--le-green);
    border: 1.5px solid rgba(58,102,66,0.3);
  }

  /* ask panel — question flow */
  .le-ask-panel {
    margin-top: 14px;
    border: 1.5px solid var(--le-hairline-strong);
    border-radius: 8px;
    overflow: hidden;
    background: var(--le-paper);
  }
  .le-ask-header {
    padding: 10px 16px;
    border-bottom: 1px solid var(--le-hairline);
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
  }
  .le-ask-header-label {
    font-family: var(--le-mono); font-size: 8.5px; font-weight: 500;
    color: var(--le-ink-soft); text-transform: uppercase; letter-spacing: 0.12em;
  }
  .le-ask-back {
    background: none; border: none; padding: 0; cursor: pointer;
    font-family: var(--le-mono); font-size: 8.5px; color: var(--le-ink-soft);
    letter-spacing: 0.08em; text-transform: uppercase; line-height: 1; min-height: 0;
  }
  .le-ask-back:hover { color: var(--le-ink); }
  .le-ask-option {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 14px 16px;
    background: none; border: none; border-bottom: 1px solid var(--le-hairline);
    text-align: left; cursor: pointer; transition: background 0.12s;
  }
  .le-ask-option:last-child { border-bottom: none; }
  .le-ask-option:hover { background: rgba(222,214,196,0.22); }
  .le-ask-option-text {
    font-family: var(--le-sans); font-size: 13px; color: var(--le-ink); line-height: 1.35;
  }
  .le-ask-option-arr {
    font-size: 11px; color: var(--le-ink-soft); flex-shrink: 0; line-height: 1;
  }
  .le-ask-option--dispute { border-top: 1px solid var(--le-hairline); }
  .le-ask-option--dispute .le-ask-option-text { color: var(--le-clay); }
  .le-ask-option--dispute .le-ask-option-arr  { color: var(--le-clay); opacity: 0.7; }
  .le-ask-note-body {
    padding: 14px 16px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .le-ask-selected-label {
    font-family: var(--le-display); font-size: 14px; font-style: italic;
    color: var(--le-ink); line-height: 1.4;
  }
  .le-ask-note-body .le-dispute-textarea { margin-bottom: 0; }

  /* name modal */
  .le-name-overlay {
    position: fixed; inset: 0; background: rgba(33,28,68,0.55); z-index: 200;
    display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .le-name-modal {
    background: var(--le-paper); border-radius: 4px; padding: 28px;
    max-width: 360px; width: 100%; box-shadow: 0 20px 60px rgba(33,28,68,0.25);
  }
  .le-name-modal-title {
    font-family: var(--le-display); font-size: 20px; font-weight: 400; font-style: italic;
    color: var(--le-ink); margin-bottom: 6px;
  }
  .le-name-modal-sub {
    font-family: var(--le-sans); font-size: 13px; color: var(--le-ink-soft);
    margin-bottom: 18px; line-height: 1.5;
  }
  .le-name-input {
    width: 100%; border: 1.5px solid var(--le-hairline-strong); border-radius: 4px;
    padding: 11px 14px; font-size: 16px; color: var(--le-ink);
    font-family: var(--le-sans); outline: none; margin-bottom: 14px; background: #fff;
  }
  .le-name-input:focus { border-color: var(--le-ink); }
  .le-btn-name-confirm {
    width: 100%; padding: 13px; background: var(--le-ink); color: var(--le-paper);
    border: none; border-radius: 2px;
    font-family: var(--le-sans); font-size: 14px; font-weight: 600; cursor: pointer; min-height: 44px;
  }
  .le-btn-name-confirm:disabled { opacity: 0.4; cursor: default; }

  /* lightbox */
  .le-lightbox {
    position: fixed; inset: 0; z-index: 300; background: rgba(0,0,0,0.92);
    display: flex; align-items: center; justify-content: center; padding: 20px;
  }
  .le-lightbox-img {
    max-width: calc(100% - 80px); max-height: 90vh;
    border-radius: 4px; object-fit: contain; cursor: zoom-out;
  }
  .le-lightbox-nav {
    position: absolute; top: 50%; transform: translateY(-50%);
    background: rgba(255,255,255,0.14); border: none;
    width: 40px; height: 40px; border-radius: 50%;
    color: #fff; font-size: 20px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .le-lightbox-nav:hover { background: rgba(255,255,255,0.24); }
  .le-lightbox-prev { left: 16px; }
  .le-lightbox-next { right: 16px; }
  .le-lightbox-close {
    position: absolute; top: 16px; right: 16px;
    background: rgba(255,255,255,0.12); border: none;
    width: 36px; height: 36px; border-radius: 50%;
    color: #fff; font-size: 16px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .le-lightbox-counter {
    position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    font-family: var(--le-mono); font-size: 11px;
    color: rgba(255,255,255,0.5); letter-spacing: 0.1em;
  }
  .le-lightbox-video {
    max-width: calc(100% - 80px); max-height: 90vh; border-radius: 4px; display: block;
  }
  .le-lb-spinner {
    width: 36px; height: 36px;
    border: 3px solid rgba(255,255,255,0.2); border-top-color: #fff;
    border-radius: 50%; position: absolute; top: 50%; left: 50%;
    margin: -18px 0 0 -18px; z-index: 2; pointer-events: none;
    animation: le-spin 0.65s linear infinite;
  }
  @keyframes le-spin { to { transform: rotate(360deg); } }

  /* focus rings */
  .le-btn-approve:focus-visible,
  .le-btn-ask:focus-visible,
  .le-btn-submit:focus-visible,
  .le-btn-cancel:focus-visible,
  .le-btn-name-confirm:focus-visible,
  .le-reason-tag:focus-visible,
  .le-plate-thumb:focus-visible {
    outline: 2px solid var(--le-clay); outline-offset: 2px;
  }
  .le-bottom-bar .le-btn-approve-all:focus-visible {
    outline: 2px solid var(--le-paper); outline-offset: 2px;
  }

  /* mobile */
  @media (max-width: 640px) {
    .le-container { padding: 0 26px 140px; }
    .le-hero { padding: 24px 0 16px; }
    .le-trade-name { font-size: 17px; }
    .le-btn-approve { font-size: 13px; }
    .le-bottom-bar {
      flex-direction: column; align-items: stretch; gap: 10px;
      padding: 14px 16px; padding-bottom: calc(14px + env(safe-area-inset-bottom));
    }
    .le-btn-approve-all { width: 100%; text-align: center; padding: 15px; font-size: 15px; }
    .le-bottom-total-num { font-size: 18px; }
  }

  /* reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
  }
`

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function addDays(str, days) {
  if (!str) return '—'
  const d = new Date(str); d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmt(n) { return (n || 0).toLocaleString('en-IN') }
function titleCase(str) { return (str || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
function itemTotal(item) {
  if (item.cost_type === 'actuals' || item.cost_type === 'nil') return null
  return ((parseFloat(item.material_cost) || 0) + (parseFloat(item.labour_cost) || 0)) * (item.qty || 1)
}

// Quick questions — do NOT change item status; they open a conversation thread
const QUERY_OPTIONS = [
  { key: 'why_needed',     label: 'What is this repair for?'  },
  { key: 'more_photos',    label: 'Can I see more photos?'    },
  { key: 'cost_breakdown', label: 'Can you explain the cost?' },
  { key: 'self_arrange',   label: 'I can arrange this myself' },
]

// Label lookup for thread display
const ALL_TAG_LABELS = Object.fromEntries(QUERY_OPTIONS.map(t => [t.key, t.label]))

// ─── Component ────────────────────────────────────────────────────────────────
export default function LandlordEstimate() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === '1' || searchParams.get('preview') === 'true'

  const [estimate, setEstimate]         = useState(null)
  const [items, setItems]               = useState([])
  const [disputes, setDisputes]         = useState([])
  const [inspection, setInspection]     = useState(null)
  const [notFound, setNotFound]         = useState(false)
  const [loading, setLoading]           = useState(true)
  const [snapshotTotal, setSnapshotTotal]           = useState(null)
  const [versionSnapshotMissing, setVersionSnapshotMissing] = useState(false)
  const [isFlentSession, setIsFlentSession]         = useState(false)

  const [landlordName, setLandlordName] = useState(() => localStorage.getItem('le_landlord_name') || '')
  const [showNameModal, setShowNameModal] = useState(false)
  const [nameInput, setNameInput]   = useState('')
  const pendingAction = useRef(null)

  const [disputeOpen, setDisputeOpen]     = useState({})
  const [disputeMsg, setDisputeMsg]       = useState({})
  const [askStep, setAskStep]             = useState({}) // 'options' | 'note' | 'dispute'
  const [askSelected, setAskSelected]     = useState({}) // selected QUERY_OPTIONS key
  const [submitting, setSubmitting]       = useState({})
  const [approving, setApproving]         = useState(false)

  // lightbox: { urls: string[], idx: number } | null
  const [lightbox, setLightbox] = useState(null)
  const [vidLoading, setVidLoading] = useState(false)
  const lbVideoRef = useRef(null)

  // Reset spinner whenever the lightbox navigates to a video URL
  const lbUrl = lightbox?.urls[lightbox.idx]
  useEffect(() => {
    if (lbUrl && /\.(mp4|mov|webm|m4v)$/i.test(lbUrl)) setVidLoading(true)
  }, [lbUrl])

  useEffect(() => {
    if (!lightbox) return
    const h = e => {
      if (e.key === 'Escape') { lbVideoRef.current?.pause(); setLightbox(null) }
      if (e.key === 'ArrowRight') setLightbox(lb => lb ? { ...lb, idx: Math.min(lb.idx + 1, lb.urls.length - 1) } : null)
      if (e.key === 'ArrowLeft')  setLightbox(lb => lb ? { ...lb, idx: Math.max(lb.idx - 1, 0) } : null)
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [lightbox])

  const load = useCallback(async () => {
    // 0. Check if this is a flent.in internal session (for admin banners)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const flentSession = authUser?.email?.endsWith('@flent.in') ?? false
    setIsFlentSession(flentSession)

    // 1. Resolve share_token → estimate (no embedded joins — avoids RLS silent-empty issues)
    const { data: est } = await supabase
      .from('estimates')
      .select('*')
      .eq('share_token', token)
      .maybeSingle()

    if (!est) { setNotFound(true); setLoading(false); return }

    // 2. Fetch items: if a version has been sent, load the snapshot; otherwise load live items.
    let estItems = null
    let versionTotal = null
    if (est.current_version) {
      // Load the current sent version
      const { data: ver } = await supabase
        .from('estimate_versions')
        .select('id, total')
        .eq('estimate_id', est.id)
        .eq('version_number', est.current_version)
        .maybeSingle()
      if (ver) {
        versionTotal = ver.total
        const { data: verItems } = await supabase
          .from('estimate_version_items')
          .select('*')
          .eq('version_id', ver.id)
          .order('sort_order')
        if (verItems && verItems.length > 0) {
          estItems = verItems
        } else {
          // Version row exists but has no items — snapshot is corrupt; fall back to live
          console.warn('[LandlordEstimate] version snapshot empty, falling back to live items',
            { estimate_id: est.id, version_number: est.current_version, version_id: ver.id })
          setVersionSnapshotMissing(true)
        }
      } else {
        // current_version set but no matching version row — same corruption pattern
        console.warn('[LandlordEstimate] current_version set but no version row found',
          { estimate_id: est.id, current_version: est.current_version })
        setVersionSnapshotMissing(true)
      }
    }
    // Fallback: live estimate_items (draft not yet sent, or snapshot was missing)
    if (!estItems) {
      const { data: liveItems } = await supabase
        .from('estimate_items')
        .select('*, inspection_line_items(section_name, item_score, notes, availability_status)')
        .eq('estimate_id', est.id)
        .order('sort_order')
      estItems = liveItems
    }

    // 3. Fetch disputes
    const { data: estDisputes } = await supabase
      .from('estimate_disputes')
      .select('*')
      .eq('estimate_id', est.id)

    // 4. Fetch inspection metadata (date, address — display only)
    let insp = null
    if (est.inspection_id) {
      const { data } = await supabase
        .from('inspections')
        .select('id, pid, house_type, inspection_date, config, owner_email')
        .eq('id', est.inspection_id)
        .maybeSingle()
      insp = data
    }

    // 5. Fetch media keyed on line_item_id
    const lineItemIds = (estItems || []).map(i => i.line_item_id).filter(Boolean)
    const mediaMap = {}
    if (lineItemIds.length > 0) {
      const { data: media } = await supabase
        .from('line_item_media').select('line_item_id, url').in('line_item_id', lineItemIds)
      if (media) media.forEach(m => {
        if (!mediaMap[m.line_item_id]) mediaMap[m.line_item_id] = []
        mediaMap[m.line_item_id].push(m.url)
      })
    }

    setEstimate(est)
    setSnapshotTotal(versionTotal)
    setItems((estItems || []).map(item => ({ ...item, _photos: mediaMap[item.line_item_id] || [] })))
    setDisputes(estDisputes || [])
    setInspection(insp)

    if (!est.first_viewed_at && !isPreview) {
      await supabase.from('estimates').update({ first_viewed_at: new Date().toISOString(), status: 'viewed' }).eq('id', est.id)
      await supabase.from('estimate_events').insert({ estimate_id: est.id, event_type: 'viewed', actor: 'landlord' })
    }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!estimate?.id) return
    const refresh = async () => {
      const { data: fresh } = await supabase
        .from('estimate_items')
        .select('*, inspection_line_items(section_name, item_score, notes, availability_status)')
        .eq('estimate_id', estimate.id)
        .order('sort_order')
      if (fresh) setItems(prev => fresh.map(item => ({ ...item, _photos: prev.find(p => p.id === item.id)?._photos || [] })))
      const { data: freshD } = await supabase.from('estimate_disputes').select('*').eq('estimate_id', estimate.id)
      if (freshD) setDisputes(freshD)
    }
    const ch = supabase.channel(`le-${estimate.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimate_items',    filter: `estimate_id=eq.${estimate.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'estimate_disputes', filter: `estimate_id=eq.${estimate.id}` }, refresh)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [estimate?.id])

  function requireName(action) {
    if (landlordName.trim()) { action(); return }
    pendingAction.current = action; setNameInput(''); setShowNameModal(true)
  }
  function confirmName() {
    const n = nameInput.trim(); if (!n) return
    setLandlordName(n); localStorage.setItem('le_landlord_name', n); setShowNameModal(false)
    if (pendingAction.current) { pendingAction.current(); pendingAction.current = null }
  }

  async function approveItem(itemId) {
    setSubmitting(s => ({ ...s, [itemId]: true }))
    await supabase.from('estimate_items').update({ status: 'approved' }).eq('id', itemId)
    await supabase.from('estimate_events').insert({ estimate_id: estimate.id, event_type: 'item_approved', actor: 'landlord', meta: { item_id: itemId, name: landlordName } })
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: 'approved' } : i))
    setSubmitting(s => ({ ...s, [itemId]: false }))
  }

  async function sendQuery(itemId) {
    const opt = QUERY_OPTIONS.find(o => o.key === askSelected[itemId])
    if (!opt) return
    setSubmitting(s => ({ ...s, [itemId]: true }))
    const note = disputeMsg[itemId]?.trim()
    const message = note ? `${opt.label}\n\n${note}` : opt.label
    await supabase.from('estimate_disputes').insert({
      estimate_item_id: itemId, estimate_id: estimate.id,
      author_type: 'landlord', author_name: landlordName || 'Landlord',
      reason_tag: opt.key, message,
    })
    await supabase.from('estimate_events').insert({
      estimate_id: estimate.id, event_type: 'queried', actor: 'landlord',
      meta: { item_id: itemId, query: opt.key, name: landlordName },
    })
    const { data: freshD } = await supabase.from('estimate_disputes').select('*').eq('estimate_id', estimate.id)
    if (freshD) setDisputes(freshD)
    setDisputeOpen(s => ({ ...s, [itemId]: false }))
    setAskStep(s => ({ ...s, [itemId]: 'options' }))
    setAskSelected(s => ({ ...s, [itemId]: '' }))
    setDisputeMsg(s => ({ ...s, [itemId]: '' }))
    setSubmitting(s => ({ ...s, [itemId]: false }))
  }

  async function approveAll() {
    const disputed = items.filter(i => i.status === 'disputed').length
    if (disputed > 0) {
      const ok = window.confirm(`You have ${disputed} item${disputed > 1 ? 's' : ''} under review. Approve the remaining items?`)
      if (!ok) return
    }
    setApproving(true)
    await supabase.from('estimate_items').update({ status: 'approved' }).eq('estimate_id', estimate.id).eq('status', 'pending')
    const refreshed = items.map(i => (!i.status || i.status === 'pending') ? { ...i, status: 'approved' } : i)
    setItems(refreshed)
    const allApproved = refreshed.every(i => i.status === 'approved' || i.status === 'removed')
    await supabase.from('estimates').update({
      status: allApproved ? 'approved' : 'partially_approved',
      approved_at: allApproved ? new Date().toISOString() : null,
      approved_by_name: landlordName || 'Landlord',
    }).eq('id', estimate.id)
    await supabase.from('estimate_events').insert({ estimate_id: estimate.id, event_type: allApproved ? 'approved' : 'partially_approved', actor: 'landlord', meta: { name: landlordName } })
    setEstimate(prev => ({ ...prev, status: allApproved ? 'approved' : 'partially_approved' }))
    setApproving(false)
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  // Hide removed, excluded, and nil-cost items from the landlord view
  const visibleItems   = items.filter(i => i.status !== 'removed' && i.status !== 'excluded' && i.cost_type !== 'nil')
  const pendingCount   = visibleItems.filter(i => !i.status || i.status === 'pending').length
  // Use snapshot total (version), then stored estimate total, then client-side compute
  const grandTotal     = snapshotTotal != null ? snapshotTotal : estimate?.total != null
    ? estimate.total
    : visibleItems.reduce((s, i) => s + (itemTotal(i) || 0), 0)
  const attentionCount = visibleItems.filter(i => { const t = itemTotal(i); return (t != null && t > 0) || i.cost_type === 'actuals' }).length

  // Group by section_name (room the inspector captured items in).
  // Items without section_name → "Whole Home" bucket appended last.
  // Section order = minimum sort_order across each section's items (mirrors inspector walk).
  function groupBySection(srcItems) {
    const map = new Map()
    const minSort = new Map()
    for (const item of srcItems) {
      const key = item.section_name || '__whole_home__'
      if (!map.has(key)) { map.set(key, []); minSort.set(key, item.sort_order ?? 9999) }
      map.get(key).push(item)
      if ((item.sort_order ?? 9999) < minSort.get(key)) minSort.set(key, item.sort_order ?? 9999)
    }
    const sections = []
    for (const [key, gi] of map.entries()) {
      if (key === '__whole_home__') continue
      sections.push({ key, label: key, items: gi, minSort: minSort.get(key) })
    }
    sections.sort((a, b) => a.minSort - b.minSort)
    if (map.has('__whole_home__')) {
      sections.push({ key: '__whole_home__', label: 'Whole Home', items: map.get('__whole_home__'), minSort: Infinity })
    }
    return sections
  }
  const groups = groupBySection(visibleItems)

  // Sequential plate counter in render order (across all sections, top to bottom)
  const plateOrder = new Map()
  let _plate = 0
  groups.forEach(({ items: gi }) => gi.forEach(item => plateOrder.set(item.id, ++_plate)))

  const pid      = inspection?.pid || estimate?.pid || '—'
  const address  = inspection?.config?.address || ''
  const inspector = estimate?.inspector_name || '—'

  if (loading) return <LogoSpinner full />

  if (notFound) return (
    <div style={{ minHeight: '100dvh', background: '#F4F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: 40, fontFamily: "'Hanken Grotesk', system-ui, sans-serif" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔗</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#211C44', marginBottom: 6 }}>Link not found</div>
        <div style={{ fontSize: 13, color: '#5E5872' }}>This estimate link is invalid or has expired.</div>
      </div>
    </div>
  )

  const alreadyApproved = estimate?.status === 'approved' || estimate?.status === 'partially_approved'
  const isLocked = !!estimate?.locked

  return (
    <div className="le-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* topbar */}
      <div className="le-topbar">
        <FlentWordmark height={22} variant="dark" />
        <span className="le-topbar-tag">Estimate Review</span>
      </div>

      <div className="le-container">

        {/* hero */}
        <div className="le-hero">
          <span className="le-hero-eyebrow">Property Estimate</span>
          <h1 className="le-hero-h1">{HERO_TITLE}<br /><em>{HERO_SUBTITLE}</em></h1>
        </div>

        {/* record line — hairline, no card */}
        <div className="le-record">
          <span className="le-record-item">{address || `PID ${pid}`}</span>
          {inspection?.inspection_date && <>
            <span className="le-record-sep">·</span>
            <span className="le-record-item">Inspected {fmtDate(inspection.inspection_date)}</span>
          </>}
          {estimate?.created_at && <>
            <span className="le-record-sep">·</span>
            <span className="le-record-item">Valid to {addDays(estimate.created_at, 30)}</span>
          </>}
        </div>

        {/* summary */}
        <div className="le-summary">
          <p className="le-summary-sentence">
            We assessed {visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''} across your home.{' '}
            {attentionCount > 0
              ? `${attentionCount} need${attentionCount === 1 ? 's' : ''} attention before move-in.`
              : 'All items reviewed.'}
          </p>
          <div className="le-summary-total-row">
            <span className="le-summary-total">₹{fmt(grandTotal)}</span>
            <span className="le-summary-total-lbl">Total estimate</span>
          </div>
          {typeof estimate?.overall_score === 'number' && (
            <div className="le-gauge-wrap">
              <div className="le-gauge-track">
                <div className="le-gauge-fill" style={{ width: `${(estimate.overall_score / 10) * 100}%` }} />
              </div>
              <span className="le-gauge-label">Overall condition {estimate.overall_score}/10</span>
            </div>
          )}
        </div>

        {/* version snapshot missing — internal only */}
        {versionSnapshotMissing && isFlentSession && (
          <div style={{
            margin: '12px 0', padding: '10px 16px',
            background: 'rgba(208,112,80,0.12)', border: '1px solid rgba(208,112,80,0.4)',
            borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: 'var(--le-mono, monospace)', fontSize: 12, color: '#d07050',
          }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <span><strong>Version snapshot missing</strong> — Resend required. Showing live items as fallback. (Visible to flent.in sessions only.)</span>
          </div>
        )}

        {/* approved banner */}
        {alreadyApproved && (
          <div className="le-approved-banner">
            <span>✓</span>
            <span>
              Estimate {estimate.status === 'partially_approved' ? 'partially approved' : 'approved'}
              {estimate.approved_by_name ? ` — confirmed by ${estimate.approved_by_name}` : ''}
              {estimate.approved_at ? ` on ${fmtDate(estimate.approved_at)}` : ''}
            </span>
          </div>
        )}

        {/* section groups → plates (grouped by inspection room/section) */}
        {groups.map(({ key, label, items: secItems }) => {
          const secTotal = secItems.reduce((s, i) => s + (itemTotal(i) || 0), 0)
          return (
            <div key={key} className="le-trade-group">
              <div className="le-trade-head">
                <span className="le-trade-name">{label}</span>
                <span className="le-trade-meta">
                  {secItems.length} item{secItems.length !== 1 ? 's' : ''}{secTotal > 0 ? ` · ₹${fmt(secTotal)}` : ''}
                </span>
              </div>

              {secItems.map(item => {
                const plateIdx  = String(plateOrder.get(item.id)).padStart(2, '0')
                const total     = itemTotal(item)
                // Show area when it differs from the section label (e.g. BATHROOM under Bedroom 2).
                // Otherwise fall back to trade name so each plate has a useful eyebrow.
                const areaEyebrow = (item.area && item.area.toLowerCase() !== label.toLowerCase())
                  ? item.area
                  : (item.trade ? titleCase(item.trade) : null)
                const itemDisps = disputes.filter(d => d.estimate_item_id === item.id)
                const status    = item.status || 'pending'
                const isOpen    = !!disputeOpen[item.id]
                const allUrls = item._photos || []

                return (
                  <div key={item.id} className="le-plate">
                    <span className="le-plate-index">{plateIdx}</span>

                    <div className="le-plate-body">
                      {allUrls.length > 0 && (() => {
                        const mainUrl    = allUrls[0]
                        const mainIsVid  = /\.(mp4|mov|webm|m4v)$/i.test(mainUrl)
                        const mainSrc    = mainUrl.replace(/(\.[^.]+)$/, '_thumb.webp')
                        const secVisible = allUrls.slice(1, 4)
                        const overflow   = allUrls.length > 4 ? allUrls.length - 4 : 0
                        return (
                          <div className="le-plate-media">
                            {/* Hero — large full-width photo */}
                            <div
                              className="le-plate-hero"
                              tabIndex={0}
                              role="button"
                              onClick={() => setLightbox({ urls: allUrls, idx: 0 })}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setLightbox({ urls: allUrls, idx: 0 }) }}
                            >
                              <img
                                src={mainSrc}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                onError={e => {
                                  if (!mainIsVid) { e.currentTarget.src = mainUrl; e.currentTarget.onerror = null }
                                  else e.currentTarget.style.display = 'none'
                                }}
                              />
                              {mainIsVid && <span className="le-media-chip">▶</span>}
                            </div>
                            {/* Secondary thumbs strip */}
                            {(secVisible.length > 0 || overflow > 0) && (
                              <div className="le-plate-sec-row">
                                {secVisible.map((mUrl, si) => {
                                  const isVid = /\.(mp4|mov|webm|m4v)$/i.test(mUrl)
                                  const src = mUrl.replace(/(\.[^.]+)$/, '_thumb.webp')
                                  return (
                                    <div
                                      key={si}
                                      className="le-plate-sec-thumb"
                                      tabIndex={0}
                                      role="button"
                                      onClick={() => setLightbox({ urls: allUrls, idx: si + 1 })}
                                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setLightbox({ urls: allUrls, idx: si + 1 }) }}
                                    >
                                      <img
                                        src={src}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        onError={e => {
                                          if (!isVid) { e.currentTarget.src = mUrl; e.currentTarget.onerror = null }
                                          else e.currentTarget.style.display = 'none'
                                        }}
                                      />
                                      {isVid && <span className="le-media-chip">▶</span>}
                                    </div>
                                  )
                                })}
                                {overflow > 0 && (
                                  <div
                                    className="le-plate-sec-thumb"
                                    tabIndex={0}
                                    role="button"
                                    onClick={() => setLightbox({ urls: allUrls, idx: 4 })}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setLightbox({ urls: allUrls, idx: 4 }) }}
                                  >
                                    <div className="le-plate-overflow-pill">+{overflow}</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* content */}
                      <div className="le-plate-content">
                        {/* title + total — item name italic serif left, price mono right */}
                        <div className="le-plate-title-row">
                          <span className="le-plate-title">{item.item_name || '—'}</span>
                          {total != null && total > 0 ? (
                            <span className="le-plate-cost">₹{fmt(total)}</span>
                          ) : item.cost_type === 'actuals' ? (
                            <span className="le-plate-actuals">Actuals</span>
                          ) : null}
                        </div>

                        {/* action mark: action_type · warranty */}
                        {(item.action_type || item.warranty_months) && (
                          <div className="le-plate-action-mark">
                            {[
                              item.action_type && `Action · ${item.action_type}`,
                              item.warranty_months && `${item.warranty_months}m warranty`,
                            ].filter(Boolean).join(' · ')}
                          </div>
                        )}

                        {/* area eyebrow — shows room, not trade */}
                        {areaEyebrow && <div className="le-plate-area">{areaEyebrow}</div>}

                        {/* issue line */}
                        {item.issue_description && (
                          <p className="le-plate-issue">{item.issue_description}</p>
                        )}

                        {/* what we'll do — clay left-border; hide if empty */}
                        {item.action && (
                          <div className="le-plate-remedy">{item.action}</div>
                        )}

                        {/* material / labour breakdown */}
                        {item.cost_type !== 'actuals' && item.cost_type !== 'nil' &&
                          ((item.material_cost || 0) > 0 || (item.labour_cost || 0) > 0) && (() => {
                            const qty = item.qty || 1
                            const parts = []
                            if ((item.material_cost || 0) > 0) parts.push(`Material ₹${fmt(item.material_cost)}`)
                            if ((item.labour_cost || 0) > 0) parts.push(`Labour ₹${fmt(item.labour_cost)}`)
                            return (
                              <div className="le-plate-costs">
                                {parts.join('  ·  ')}
                                {qty > 1 && <span style={{ marginLeft: 6, fontWeight: 600, color: 'var(--le-ink)' }}>× {qty}</span>}
                              </div>
                            )
                          })()
                        }

                        {/* approve / ask — hidden when estimate is locked */}
                        {!isLocked && (
                        <div className="le-plate-actions">
                          {status === 'approved' ? (
                            <span className="le-plate-state le-plate-state--approved">Approved</span>
                          ) : status === 'disputed' ? (
                            <span className="le-plate-state le-plate-state--disputed">In Review</span>
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
                                onClick={() => requireName(() => {
                                  if (isOpen) {
                                    setDisputeOpen(s => ({ ...s, [item.id]: false }))
                                  } else {
                                    setDisputeOpen(s => ({ ...s, [item.id]: true }))
                                    setAskStep(s => ({ ...s, [item.id]: 'options' }))
                                    setAskSelected(s => ({ ...s, [item.id]: '' }))
                                    setDisputeMsg(s => ({ ...s, [item.id]: '' }))
                                  }
                                })}
                              >
                                {isOpen ? 'Cancel' : 'Ask about this'}
                              </button>
                            </>
                          )}
                        </div>
                        )}

                        {/* ask panel — three-step: options → note → dispute */}
                        {isOpen && (() => {
                          const step     = askStep[item.id] || 'options'
                          const selKey   = askSelected[item.id] || ''
                          const selOpt   = QUERY_OPTIONS.find(o => o.key === selKey)
                          function closePanel() { setDisputeOpen(s => ({ ...s, [item.id]: false })) }
                          function backToOptions() {
                            setAskStep(s => ({ ...s, [item.id]: 'options' }))
                            setAskSelected(s => ({ ...s, [item.id]: '' }))
                            setDisputeMsg(s => ({ ...s, [item.id]: '' }))
                            setDisputeReason(s => ({ ...s, [item.id]: '' }))
                          }
                          return (
                            <div className="le-ask-panel">
                              {step === 'options' && (
                                <>
                                  <div className="le-ask-header">
                                    <span className="le-ask-header-label">Ask about this item</span>
                                  </div>
                                  {QUERY_OPTIONS.map(opt => (
                                    <button
                                      key={opt.key}
                                      className="le-ask-option"
                                      onClick={() => {
                                        setAskSelected(s => ({ ...s, [item.id]: opt.key }))
                                        setAskStep(s => ({ ...s, [item.id]: 'note' }))
                                      }}
                                    >
                                      <span className="le-ask-option-text">{opt.label}</span>
                                      <span className="le-ask-option-arr">→</span>
                                    </button>
                                  ))}
                                </>
                              )}

                              {step === 'note' && (
                                <>
                                  <div className="le-ask-header">
                                    <button className="le-ask-back" onClick={backToOptions}>← Back</button>
                                  </div>
                                  <div className="le-ask-note-body">
                                    <div className="le-ask-selected-label">"{selOpt?.label}"</div>
                                    <textarea
                                      className="le-dispute-textarea"
                                      placeholder="Add a note (optional)"
                                      value={disputeMsg[item.id] || ''}
                                      onChange={e => setDisputeMsg(s => ({ ...s, [item.id]: e.target.value }))}
                                    />
                                    <div className="le-dispute-actions">
                                      <button
                                        className="le-btn-submit"
                                        disabled={!!submitting[item.id]}
                                        onClick={() => sendQuery(item.id)}
                                      >
                                        {submitting[item.id] ? 'Sending…' : 'Send question'}
                                      </button>
                                      <button className="le-btn-cancel" onClick={closePanel}>Cancel</button>
                                    </div>
                                  </div>
                                </>
                              )}

                            </div>
                          )
                        })()}

                        {/* dispute thread */}
                        {itemDisps.length > 0 && (
                          <div className="le-thread">
                            {[...itemDisps].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((d, di) => (
                              <div key={di} className="le-thread-msg">
                                <div className="le-thread-meta">
                                  {d.author_name || d.author_type} · {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  {d.reason_tag ? ` · ${ALL_TAG_LABELS[d.reason_tag] || d.reason_tag}` : ''}
                                </div>
                                <div className={`le-thread-bubble ${d.author_type === 'landlord' ? 'le-bubble-landlord' : 'le-bubble-flent'}`}>
                                  {d.message || `[${ALL_TAG_LABELS[d.reason_tag] || d.reason_tag}]`}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* notes & terms */}
        <div className="le-notes-card">
          <span className="le-notes-label">Notes &amp; Terms</span>
          <div className="le-notes-body">
            {estimate?.notes || '[ Notes and terms will appear here ]'}
          </div>
        </div>

      </div>

      {/* sticky bottom bar */}
      {isLocked ? (
        <div className="le-bottom-bar">
          <div>
            <div className="le-bottom-total-num">₹{fmt(grandTotal)}</div>
            <div className="le-bottom-total-lbl">Total Estimate · Final</div>
          </div>
        </div>
      ) : !alreadyApproved && (
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

      {/* name modal */}
      {showNameModal && (
        <div className="le-name-overlay" onClick={() => setShowNameModal(false)}>
          <div className="le-name-modal" onClick={e => e.stopPropagation()}>
            <div className="le-name-modal-title">Before you continue</div>
            <div className="le-name-modal-sub">
              Please enter your name so we can attribute your approvals and comments.
            </div>
            <input
              className="le-name-input" type="text" placeholder="Your name"
              value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmName()} autoFocus
            />
            <button className="le-btn-name-confirm" onClick={confirmName} disabled={!nameInput.trim()}>
              Continue
            </button>
          </div>
        </div>
      )}

      {/* lightbox with prev/next */}
      {lightbox && (() => {
        const curUrl   = lightbox.urls[lightbox.idx]
        const curIsVid = /\.(mp4|mov|webm|m4v)$/i.test(curUrl)
        const curPost  = curIsVid ? curUrl.replace(/(\.[^.]+)$/, '_thumb.webp') : undefined
        const closeLb  = () => { lbVideoRef.current?.pause(); setLightbox(null) }
        return (
          <div className="le-lightbox" onClick={closeLb}>
            {curIsVid ? (
              <div style={{ position:'relative',display:'inline-flex',alignItems:'center',justifyContent:'center' }} onClick={e => e.stopPropagation()}>
                {vidLoading && <div className="le-lb-spinner" />}
                <video
                  ref={lbVideoRef}
                  key={curUrl}
                  src={curUrl}
                  poster={curPost}
                  controls
                  playsInline
                  autoPlay
                  preload="metadata"
                  onCanPlay={() => setVidLoading(false)}
                  className="le-lightbox-video"
                />
              </div>
            ) : (
              <img src={curUrl} alt="" className="le-lightbox-img" loading="lazy" decoding="async" onClick={e => e.stopPropagation()} />
            )}
            {lightbox.urls.length > 1 && (
              <>
                <button className="le-lightbox-nav le-lightbox-prev" aria-label="Previous"
                  onClick={e => { e.stopPropagation(); lbVideoRef.current?.pause(); setLightbox(lb => ({ ...lb, idx: Math.max(lb.idx - 1, 0) })) }}>‹</button>
                <button className="le-lightbox-nav le-lightbox-next" aria-label="Next"
                  onClick={e => { e.stopPropagation(); lbVideoRef.current?.pause(); setLightbox(lb => ({ ...lb, idx: Math.min(lb.idx + 1, lb.urls.length - 1) })) }}>›</button>
                <span className="le-lightbox-counter">{lightbox.idx + 1} / {lightbox.urls.length}</span>
              </>
            )}
            <button className="le-lightbox-close" aria-label="Close" onClick={closeLb}>✕</button>
          </div>
        )
      })()}
    </div>
  )
}
