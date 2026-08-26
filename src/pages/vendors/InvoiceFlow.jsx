import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { initials, avatarColor } from '../../utils/vendorHub'
import { inr, sumLines, sendBlockers, monthLabel } from '../../utils/vendorInvoice'

// Setting PIDs, one vendor at a time.
//
// Same card-at-a-time shape as the payout review, and for the same reason:
// assigning work to properties is a judgement call per person, and a sixteen-row
// table invites skimming. One card, one decision, then the next.
//
// Deliberately different from that flow in one way — each split is saved when
// you approve it rather than batched to the end. The payout review holds edits
// because they all land on one table in one go; here every card writes its own
// line items, and losing twelve approved splits to a failure on the thirteenth
// would be its own kind of cruelty.

const MONO = 'var(--font-mono, monospace)'

const inp = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 15, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit' }

function Ava({ name, size = 44 }) {
  const c = avatarColor(name || '?')
  return <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, fontFamily: MONO, background: c + '22', color: c, border: `1px solid ${c}55` }}>{initials(name || '?')}</span>
}

const isReady = (card) => card.invoice && sendBlockers(card.invoice, card.lines).length === 0

export default function InvoiceFlow({ period, rows, properties, onSend, onClose }) {
  // Unallocated first: the flow should open on work, not on things already done.
  const [cards, setCards] = useState(() =>
    [...rows]
      .filter(r => r.invoice)
      .map(r => ({ invoice: r.invoice, name: r.name, trade: r.payout?.team || '', lines: (r.lines || []).map((l, i) => ({ ...l, sort: i })) }))
      .sort((a, b) => (isReady(a) ? 1 : 0) - (isReady(b) ? 1 : 0)))
  const [idx, setIdx] = useState(0)
  const [approved, setApproved] = useState(() => new Set(cards.filter(isReady).map(c => c.invoice.id)))
  const [phase, setPhase] = useState('review')   // review | done | sent
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sendResult, setSendResult] = useState(null)
  const touchX = useRef(null)

  const total = cards.length
  const cur = cards[idx]
  const locked = cur && cur.invoice.status !== 'draft'

  const go = useCallback((d) => setIdx(i => Math.max(0, Math.min(total - 1, i + d))), [total])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  const updLines = (fn) => setCards(cs => cs.map((c, i) => i === idx ? { ...c, lines: fn(c.lines) } : c))
  const upd = (li, patch) => updLines(ls => ls.map((l, k) => k === li ? { ...l, ...patch } : l))
  const addLine = () => updLines(ls => [...ls, { id: 'new-' + Date.now(), pid: '', description: ls[0]?.description || '', amount: Math.max(0, remaining), sort: ls.length }])
  const delLine = (li) => updLines(ls => ls.filter((_, k) => k !== li))

  const allocated = cur ? sumLines(cur.lines) : 0
  const gross = cur ? Number(cur.invoice.subtotal || 0) : 0
  const remaining = Math.round(gross - allocated)

  // Rounding remainder onto the first line, so an even split still reconciles
  // to the rupee rather than landing a rupee or two short.
  function splitEven() {
    const n = cur.lines.length
    if (!n) return
    const each = Math.floor(Math.round(gross) / n)
    updLines(ls => ls.map((l, i) => ({ ...l, amount: i === 0 ? Math.round(gross) - each * (n - 1) : each })))
  }

  async function approveCurrent() {
    if (!cur) return
    setErr('')
    if (!locked) {
      const blockers = sendBlockers(cur.invoice, cur.lines)
      if (blockers.length) { setErr(blockers.join(' · ')); return }
      setBusy(true)
      try {
        const { error: dErr } = await supabase.from('vendor_invoice_lines').delete().eq('invoice_id', cur.invoice.id)
        if (dErr) throw dErr
        const { error: iErr } = await supabase.from('vendor_invoice_lines').insert(
          cur.lines.map((l, i) => ({
            invoice_id: cur.invoice.id, pid: (l.pid || '').trim() || null,
            description: (l.description || '').trim() || null,
            amount: Number(l.amount || 0), sort: i,
          })))
        if (iErr) throw iErr
      } catch (e) { setErr(e.message || String(e)); setBusy(false); return }
      setBusy(false)
    }

    const next = new Set(approved); next.add(cur.invoice.id); setApproved(next)
    if (next.size >= total) { setPhase('done'); return }
    for (let k = 1; k <= total; k++) {
      const cand = (idx + k) % total
      if (!next.has(cards[cand].invoice.id)) { setIdx(cand); break }
    }
  }

  async function sendAll() {
    const ids = cards.filter(c => c.invoice.status === 'draft' && isReady(c)).map(c => c.invoice.id)
    if (!ids.length) { setErr('Nothing ready to send.'); return }
    setBusy(true); setErr('')
    const res = await onSend(ids)
    setBusy(false)
    setSendResult(res)
    if (res?.error) { setErr(res.error); return }
    setPhase('sent')
  }

  const muted = 'var(--text-muted, #6b6d82)'
  const overlay = { position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(8,9,13,0.55)', backdropFilter: 'blur(7px)', WebkitBackdropFilter: 'blur(7px)', overflowY: 'auto', padding: '20px 16px' }
  const cardStyle = { animation: 'cardIn .25s ease', width: '100%', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 11, boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }
  const navBtn = { padding: '11px 14px', fontSize: 14, fontWeight: 600, borderRadius: 9, cursor: 'pointer', fontFamily: MONO, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)' }
  const approveBtn = { flex: 1, padding: '11px 14px', fontSize: 14, fontWeight: 700, borderRadius: 9, cursor: 'pointer', fontFamily: MONO, border: 'none', background: 'var(--green, #3dba7a)', color: '#fff' }
  const closeBtn = { width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', fontSize: 13 }
  const smallBtn = { padding: '7px 11px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: MONO, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)' }

  if (!total) {
    return (
      <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div style={{ maxWidth: 480, margin: '20vh auto 0', ...cardStyle }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>No invoices raised yet</div>
          <div style={{ fontSize: 13, color: muted, lineHeight: 1.5 }}>Raise them from the list first, then come back here to set the PIDs.</div>
          <button type="button" onClick={onClose} style={navBtn}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <style>{`@keyframes cardIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}`}</style>
      <div style={{ width: '100%', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: MONO }}>PIDs · {monthLabel(period.period_month)}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', fontFamily: MONO }}>{approved.size} / {total} set</div>
          <button type="button" onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${total ? Math.round(approved.size / total * 100) : 0}%`, background: 'var(--green, #3dba7a)', transition: 'width .2s' }} />
        </div>

        {phase === 'review' && cur && (
          <div key={idx} style={cardStyle}
            onTouchStart={e => { touchX.current = e.touches[0].clientX }}
            onTouchEnd={e => { const dx = e.changedTouches[0].clientX - (touchX.current ?? 0); if (dx < -50) go(1); else if (dx > 50) go(-1) }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Ava name={cur.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{cur.name}</div>
                <div style={{ fontSize: 11, color: muted, fontFamily: MONO, marginTop: 2 }}>
                  {cur.invoice.invoice_no} · gross {inr(gross)}
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, whiteSpace: 'nowrap', color: approved.has(cur.invoice.id) ? 'var(--green, #3dba7a)' : muted }}>
                {approved.has(cur.invoice.id) ? '✓ ' : ''}{idx + 1}/{total}
              </div>
            </div>

            {locked && (
              <div style={{ padding: '9px 11px', background: 'rgba(200,150,62,0.10)', border: '1px solid rgba(200,150,62,0.30)', borderRadius: 8, fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
                Already {cur.invoice.status} — locked. Void it to change anything.
              </div>
            )}

            <datalist id="flow-pids">
              {properties.map(p => <option key={p.pid} value={p.pid}>{p.name || ''}</option>)}
            </datalist>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {cur.lines.map((l, li) => (
                <div key={l.id ?? li} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 104px 30px', gap: 7, alignItems: 'center' }}>
                  <input style={inp} list="flow-pids" value={l.pid || ''} readOnly={locked} placeholder="PID"
                    onChange={e => upd(li, { pid: e.target.value })} />
                  <input style={inp} value={l.description || ''} readOnly={locked} placeholder="Work done"
                    onChange={e => upd(li, { description: e.target.value })} />
                  <input style={{ ...inp, textAlign: 'right', fontFamily: MONO }} inputMode="decimal" readOnly={locked}
                    value={l.amount ?? ''} onChange={e => upd(li, { amount: e.target.value.replace(/[^\d.]/g, '') })} />
                  {!locked && cur.lines.length > 1
                    ? <button type="button" onClick={() => delLine(li)} title="Remove"
                        style={{ background: 'none', border: 'none', color: 'var(--red, #e05c6a)', cursor: 'pointer', fontSize: 14, padding: 4 }}>✕</button>
                    : <span />}
                </div>
              ))}
            </div>

            {!locked && (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={addLine} style={smallBtn}>+ Add PID</button>
                <button type="button" onClick={splitEven} style={smallBtn}>Split evenly</button>
                <span style={{ marginInlineStart: 'auto', fontSize: 11.5, fontFamily: MONO, color: remaining === 0 ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)' }}>
                  {remaining === 0 ? '✓ Fully allocated' : remaining > 0 ? `${inr(remaining)} left` : `${inr(-remaining)} over`}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '11px 13px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, fontFamily: MONO, fontSize: 12, color: muted }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Allocated</span><span style={{ color: 'var(--text, #e8e8f0)' }}>{inr(allocated)} / {inr(gross)}</span></div>
              {Number(cur.invoice.advance_recovered) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Less: advance</span><span style={{ color: 'var(--red, #e05c6a)' }}>− {inr(cur.invoice.advance_recovered)}</span></div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border, #2e3040)', paddingTop: 6 }}>
                <span style={{ color: 'var(--text, #e8e8f0)', fontWeight: 700 }}>Net payable</span>
                <span style={{ color: 'var(--accent, #c8963e)', fontWeight: 700, fontSize: 14 }}>{inr(cur.invoice.net_payable)}</span>
              </div>
            </div>

            {err && (
              <div style={{ padding: '9px 11px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word' }}>⚠ {err}</div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => go(-1)} disabled={idx === 0} style={{ ...navBtn, opacity: idx === 0 ? 0.4 : 1 }}>‹</button>
              <button type="button" onClick={approveCurrent} disabled={busy} style={{ ...approveBtn, opacity: busy ? 0.7 : 1 }}>
                {busy ? 'Saving…' : locked ? 'Next ›' : approved.has(cur.invoice.id) ? '✓ Saved · next' : '✓ Approve'}
              </button>
              <button type="button" onClick={() => go(1)} disabled={idx === total - 1} style={{ ...navBtn, opacity: idx === total - 1 ? 0.4 : 1 }}>›</button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div style={cardStyle}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>✓ All {total} have PIDs</div>
            <div style={{ fontSize: 13, color: muted, lineHeight: 1.55 }}>
              {cards.filter(c => c.invoice.status === 'draft' && isReady(c)).length} ready to email for signing.
              Each vendor gets a private link to their own invoice — nobody sees anyone else&rsquo;s.
            </div>
            {err && (
              <div style={{ padding: '9px 11px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.30)', borderRadius: 8, fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word' }}>⚠ {err}</div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setPhase('review'); setIdx(0); setErr('') }} style={navBtn}>‹ Back</button>
              <button type="button" onClick={sendAll} disabled={busy} style={{ ...approveBtn, background: 'var(--accent, #c8963e)', color: '#1a1408' }}>
                {busy ? 'Sending…' : '✉ Send for signing →'}
              </button>
            </div>
          </div>
        )}

        {phase === 'sent' && (
          <div style={cardStyle}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--green, #3dba7a)', fontFamily: MONO }}>✓ Sent</div>
            <div style={{ fontSize: 13, color: muted, lineHeight: 1.55 }}>
              {sendResult?.sent ?? 0} invoice{(sendResult?.sent ?? 0) === 1 ? '' : 's'} emailed.
              {sendResult?.failed?.length ? ` ${sendResult.failed.length} didn't send — they're back as drafts in the list.` : ''}
              <br />Signatures will appear on the list as they come in.
            </div>
            <button type="button" onClick={onClose} style={{ ...approveBtn, background: 'var(--accent, #c8963e)', color: '#1a1408' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}
