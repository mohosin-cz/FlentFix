import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { PillGroup, BtnPrimary, BtnSecondary, Textarea } from '../../components/ui'
import {
  statusMeta, POD_OPTIONS, REJECTION_REASONS,
  signedDocUrl, fmtDate, fmtDateTime, maskAccount,
} from '../../utils/vendorHub'

// ── loud error strip (real messages only) ───────────────────────────────────
function ErrStrip({ children }) {
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 6, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-word' }}>
      ⚠ {children}
    </div>
  )
}

// ── one read-only labelled row ──────────────────────────────────────────────
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border, #2e3040)' }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 104, flexShrink: 0, paddingTop: 2 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', flex: 1, wordBreak: 'break-word' }}>{children ?? '—'}</span>
    </div>
  )
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '18px 0 4px' }}>{children}</div>
}

// ── one document thumbnail (signed URL, opens full on tap) ──────────────────
function DocThumb({ label, url, err, missing }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {missing ? (
        <div style={{ ...thumbBox, color: 'var(--text-muted, #6b6d82)', fontSize: 11 }}>not provided</div>
      ) : err ? (
        <div style={{ ...thumbBox, border: '1px solid rgba(224,92,106,0.4)', color: 'var(--red, #e05c6a)', fontSize: 10, padding: 6, textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>{err}</div>
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" style={{ ...thumbBox, padding: 0, overflow: 'hidden' }}>
          <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </a>
      ) : (
        <div style={{ ...thumbBox, color: 'var(--text-muted, #6b6d82)', fontSize: 11 }}>loading…</div>
      )}
    </div>
  )
}

const thumbBox = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '100%', aspectRatio: '1 / 1', maxWidth: 120,
  background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
  borderRadius: 8, cursor: 'pointer', textDecoration: 'none',
}

// ── static (non-interactive) capture-location pin card ──────────────────────
// Schematic pin only — we deliberately do NOT pull external map tiles, so the
// vendor's location is never sent to a third party until the reviewer chooses
// to open it in maps.
function LocationCard({ lat, lng, accuracy, at }) {
  if (lat == null || lng == null) return <Row label="Location">—</Row>
  const maps = `https://www.google.com/maps?q=${lat},${lng}`
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', marginTop: 8 }}>
      <div style={{
        width: 96, height: 96, flexShrink: 0, borderRadius: 8,
        border: '1px solid var(--border, #2e3040)', position: 'relative',
        background: 'repeating-linear-gradient(0deg, var(--bg-input,#252731), var(--bg-input,#252731) 15px, var(--bg-panel,#1e2028) 15px, var(--bg-panel,#1e2028) 16px), repeating-linear-gradient(90deg, var(--bg-input,#252731), var(--bg-input,#252731) 15px, var(--bg-panel,#1e2028) 15px, var(--bg-panel,#1e2028) 16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" fill="var(--red, #e05c6a)" stroke="var(--red, #e05c6a)"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>
        <span>{Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</span>
        <span>accuracy ±{accuracy != null ? Math.round(accuracy) : '?'} m</span>
        <span>{fmtDateTime(at)}</span>
        <a href={maps} target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #c8963e)', textDecoration: 'none' }}>View on map ↗</a>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function VendorDetailSheet({ vendor, onClose, onUpdated }) {
  const [row, setRow] = useState(vendor)
  const [docs, setDocs] = useState({})
  const [revealAcct, setRevealAcct] = useState(false)
  const [busy, setBusy] = useState('')          // 'pod' | 'approve' | 'reject' | ''
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  // The parent mounts this with key={vendor.id}, so a different vendor gets a
  // fresh component instance — no reset-on-prop-change effect needed.

  // signed URLs for the document images (short TTL)
  useEffect(() => {
    let alive = true
    const paths = {
      live: vendor.live_photo_path,
      aadhaar: vendor.aadhaar_doc_path,
      pan: vendor.pan_doc_path,
      dl: vendor.dl_doc_path,
    }
    ;(async () => {
      const out = {}
      for (const [k, p] of Object.entries(paths)) {
        if (!p) { out[k] = { missing: true }; continue }
        try { out[k] = { url: await signedDocUrl(supabase, p, 300) } }
        catch (e) { out[k] = { err: e.message } }
      }
      if (alive) setDocs(out)
    })()
    return () => { alive = false }
  }, [vendor.id, vendor.live_photo_path, vendor.aadhaar_doc_path, vendor.pan_doc_path, vendor.dl_doc_path])

  const refreshRow = useCallback(async () => {
    const { data, error } = await supabase.from('vendors').select('*').eq('id', vendor.id).single()
    if (!error && data) setRow(data)
  }, [vendor.id])

  async function assignPod(val) {
    const pod = val === 'Unassigned' ? null : val
    if (pod === (row.pod || null)) return
    setBusy('pod'); setErr(''); setNotice('')
    const { error } = await supabase.from('vendors').update({ pod }).eq('id', row.id)
    if (error) setErr(error.message)
    else { await refreshRow(); onUpdated && onUpdated(); setNotice(`POD set to ${val}`) }
    setBusy('')
  }

  async function approve() {
    setBusy('approve'); setErr(''); setNotice('')
    const { data, error } = await supabase.rpc('approve_vendor', { p_vendor_id: row.id })
    if (error) { setErr(error.message); setBusy(''); return }
    setRow(data)
    setNotice(`Approved · vendor code ${data.vendor_code}`)
    onUpdated && onUpdated()
    setBusy('')
  }

  async function confirmReject() {
    if (!reason) { setErr('Select a rejection reason — rejection cannot be silent.'); return }
    setBusy('reject'); setErr(''); setNotice('')
    const { data, error } = await supabase.rpc('reject_vendor', { p_vendor_id: row.id, p_reason: reason, p_note: note.trim() || null })
    if (error) { setErr(error.message); setBusy(''); return }
    setRow(data); setRejecting(false); setNotice('Application rejected')
    onUpdated && onUpdated()
    setBusy('')
  }

  const meta = statusMeta(row.status)
  const decided = row.status === 'approved' || row.status === 'rejected'
  const hasBank = row.bank_account_no || row.bank_ifsc || row.bank_account_name

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--bg-panel, #1e2028)', borderRadius: '14px 14px 0 0',
          maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.22s ease-out',
        }}
      >
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 6px', flexShrink: 0 }} />

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 18px 12px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.full_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginTop: 1 }}>
              {row.trade}{row.vendor_code ? ` · ${row.vendor_code}` : ''}{row.pod ? ` · ${row.pod}` : ''}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, border: `1px solid ${meta.color}`, borderRadius: 12, padding: '3px 10px', fontFamily: 'var(--font-mono, monospace)', whiteSpace: 'nowrap' }}>{meta.label}</span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* scrollable body */}
        <div style={{ overflowY: 'auto', padding: '0 18px 8px', flex: 1, minHeight: 0 }}>
          <SectionTitle>Basics</SectionTitle>
          <Row label="Phone">{row.phone}</Row>
          <Row label="Alt phone">{row.alt_phone}</Row>
          <Row label="Email">{row.email}</Row>
          <Row label="Address">{[row.address_line, row.city, row.pincode].filter(Boolean).join(', ') || '—'}</Row>
          <Row label="Submitted">{fmtDateTime(row.submitted_at)}</Row>

          <SectionTitle>Live photo &amp; location</SectionTitle>
          <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
            <DocThumb label="Live photo" url={docs.live?.url} err={docs.live?.err} missing={docs.live?.missing} />
          </div>
          <LocationCard lat={row.capture_lat} lng={row.capture_lng} accuracy={row.capture_accuracy} at={row.capture_at} />

          <SectionTitle>Payout</SectionTitle>
          {hasBank && <>
            <Row label="Account name">{row.bank_account_name}</Row>
            <Row label="Account no.">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{revealAcct ? (row.bank_account_no || '—') : maskAccount(row.bank_account_no)}</span>
                {row.bank_account_no && (
                  <button type="button" onClick={() => setRevealAcct(v => !v)} style={{ fontSize: 10, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>{revealAcct ? 'hide' : 'reveal'}</button>
                )}
              </span>
            </Row>
            <Row label="IFSC">{row.bank_ifsc}</Row>
          </>}
          <Row label="UPI ID">{row.upi_id}</Row>

          <SectionTitle>Documents</SectionTitle>
          <Row label="Aadhaar">{row.aadhaar_last4 ? `•••• •••• ${row.aadhaar_last4}` : '—'}</Row>
          <Row label="PAN">{row.pan_number}</Row>
          <Row label="Licence">{row.dl_number ? `${row.dl_number}${row.dl_expiry ? ` · exp ${fmtDate(row.dl_expiry)}` : ''}` : '—'}</Row>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <DocThumb label="Aadhaar" url={docs.aadhaar?.url} err={docs.aadhaar?.err} missing={docs.aadhaar?.missing} />
            <DocThumb label="PAN" url={docs.pan?.url} err={docs.pan?.err} missing={docs.pan?.missing} />
            <DocThumb label="Licence" url={docs.dl?.url} err={docs.dl?.err} missing={docs.dl?.missing} />
          </div>

          {decided && (
            <>
              <SectionTitle>Review</SectionTitle>
              {row.vendor_code && <Row label="Vendor code">{row.vendor_code}</Row>}
              {row.rejection_reason && <Row label="Reason">{row.rejection_reason}</Row>}
              <Row label="Reviewed by">{row.reviewed_by}</Row>
              <Row label="Reviewed at">{fmtDateTime(row.reviewed_at)}</Row>
            </>
          )}

          <div style={{ height: 8 }} />
        </div>

        {/* actions footer */}
        <div style={{ borderTop: '1px solid var(--border, #2e3040)', padding: '12px 18px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-panel, #1e2028)' }}>
          {err && <ErrStrip>{err}</ErrStrip>}
          {notice && <div style={{ padding: '8px 12px', background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>✓ {notice}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assign POD</span>
            <PillGroup options={POD_OPTIONS} value={row.pod || 'Unassigned'} onChange={assignPod} />
          </div>

          {rejecting ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rejection reason (required)</span>
              <PillGroup options={REJECTION_REASONS} value={reason} onChange={setReason} />
              <Textarea value={note} onChange={setNote} placeholder="Optional note (added to the reason)" rows={2} />
              <div style={{ display: 'flex', gap: 10 }}>
                <BtnSecondary onClick={() => { setRejecting(false); setErr('') }}>Cancel</BtnSecondary>
                <div style={{ flex: 1 }} />
                <BtnPrimary onClick={confirmReject} disabled={!reason || busy === 'reject'}>{busy === 'reject' ? 'Rejecting…' : 'Confirm reject'}</BtnPrimary>
              </div>
            </div>
          ) : !decided ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <BtnSecondary onClick={() => { setRejecting(true); setErr('') }}>Reject</BtnSecondary>
              <div style={{ flex: 1 }} />
              <BtnPrimary onClick={approve} disabled={busy === 'approve'}>{busy === 'approve' ? 'Approving…' : 'Approve'}</BtnPrimary>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
