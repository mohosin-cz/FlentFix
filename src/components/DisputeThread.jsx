import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'

const REASON_LABELS = {
  not_needed:    'Not needed',
  price_too_high: 'Price too high',
  already_fixed: 'Already fixed',
  question:      'Question',
}

const pill = {
  fontSize: 10, padding: '2px 8px', borderRadius: 100,
  fontFamily: 'var(--font-mono, monospace)', fontWeight: 600,
  letterSpacing: '0.04em', display: 'inline-block',
}

export default function DisputeThread({ itemId, estimateId, item, userEmail, onResolve }) {
  const isMobile = useIsMobile()
  const [messages, setMessages]   = useState([])
  const [reply, setReply]         = useState('')
  const [sending, setSending]     = useState(false)
  const [resolving, setResolving] = useState(false)
  const [reviseMode, setReviseMode] = useState(false)
  const [revisedMat, setRevisedMat] = useState(String(item?.material_cost || 0))
  const [revisedLab, setRevisedLab] = useState(String(item?.labour_cost || 0))

  async function fetchMessages() {
    const { data } = await supabase
      .from('estimate_disputes')
      .select('*')
      .eq('estimate_item_id', itemId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  useEffect(() => { fetchMessages() }, [itemId])

  // Realtime for this item's thread
  useEffect(() => {
    const channel = supabase.channel(`thread-${itemId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'estimate_disputes',
        filter: `estimate_item_id=eq.${itemId}`,
      }, fetchMessages)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [itemId])

  async function handleReply() {
    if (!reply.trim()) return
    setSending(true)
    await supabase.from('estimate_disputes').insert({
      estimate_item_id: itemId,
      estimate_id: estimateId,
      author_type: 'flent',
      author_name: userEmail?.split('@')[0] || 'Flent',
      message: reply.trim(),
    })
    await supabase.from('estimate_events').insert({
      estimate_id: estimateId, event_type: 'replied', actor: userEmail,
      meta: { item_id: itemId },
    })
    setReply('')
    setSending(false)
    fetchMessages()
  }

  async function handleResolve(action) {
    setResolving(true)
    const updates = {}
    if (action === 'revise') {
      updates.material_cost = parseFloat(revisedMat) || 0
      updates.labour_cost   = parseFloat(revisedLab) || 0
    }
    const statusMap = { revise: 'resolved', remove: 'removed', resolve: 'resolved' }
    await supabase.from('estimate_items')
      .update({ status: statusMap[action], ...updates })
      .eq('id', itemId)
    await supabase.from('estimate_events').insert({
      estimate_id: estimateId, event_type: 'dispute_resolved', actor: userEmail,
      meta: { item_id: itemId, action },
    })
    setResolving(false)
    setReviseMode(false)
    onResolve?.()
  }

  const fmtTs = (str) => str ? new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + new Date(str).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''

  return (
    <div style={{ marginTop: 10 }}>

      {/* Chat messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {messages.map((msg, i) => {
          const isFlent = msg.author_type === 'flent'
          const isFirst = i === 0 && msg.author_type === 'landlord'
          return (
            <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: isFlent ? 'flex-end' : 'flex-start' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginBottom: 3, display: 'flex', gap: 6, alignItems: 'center' }}>
                <span>{msg.author_name || msg.author_type}</span>
                {isFirst && msg.reason_tag && (
                  <span style={{ ...pill, background: 'rgba(240,160,80,0.15)', color: '#f0a050' }}>
                    {REASON_LABELS[msg.reason_tag] || msg.reason_tag}
                  </span>
                )}
                <span style={{ opacity: 0.6 }}>{fmtTs(msg.created_at)}</span>
              </div>
              <div style={{
                maxWidth: '85%', padding: '8px 12px', borderRadius: 8,
                fontSize: 12, lineHeight: 1.6,
                background: isFlent ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
                color: isFlent ? '#000' : 'var(--text, #e8e8f0)',
                border: isFlent ? 'none' : '1px solid var(--border, #2e3040)',
              }}>
                {msg.message || `[${REASON_LABELS[msg.reason_tag] || msg.reason_tag}]`}
              </div>
            </div>
          )
        })}
      </div>

      {/* Reply box */}
      {userEmail && (
        <div style={{ marginBottom: 10 }}>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            placeholder="Reply to landlord…"
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply() }}
            style={{
              width: '100%', resize: 'none', minHeight: 64,
              background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
              borderRadius: 6, padding: '8px 10px', fontSize: 16,
              color: 'var(--text, #e8e8f0)', outline: 'none',
              fontFamily: 'var(--font-sans, Poppins, sans-serif)',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent, #c8963e)' }}
            onBlur={e  => { e.target.style.borderColor = 'var(--border, #2e3040)' }}
          />
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 6, marginTop: 6 }}>
            <button
              onClick={handleReply}
              disabled={sending || !reply.trim()}
              style={{ padding: isMobile ? '12px' : '5px 14px', minHeight: isMobile ? 44 : undefined, width: isMobile ? '100%' : undefined, background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 5, fontSize: isMobile ? 14 : 11, fontWeight: 700, color: '#000', cursor: sending ? 'wait' : 'pointer', opacity: !reply.trim() ? 0.4 : 1 }}
            >
              {sending ? 'Sending…' : 'Send reply'}
            </button>
            <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', alignSelf: 'center' }}>⌘↵ to send</span>
          </div>
        </div>
      )}

      {/* Resolution actions */}
      {userEmail && item?.status === 'disputed' && (
        <div style={{ borderTop: '1px solid var(--border, #2e3040)', paddingTop: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Resolution</div>

          {reviseMode ? (
            <div style={{ background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, padding: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginBottom: 8 }}>Revise costs</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 8 }}>
                {[
                  { label: 'Material ₹', val: revisedMat, set: setRevisedMat },
                  { label: 'Labour ₹',   val: revisedLab, set: setRevisedLab },
                ].map(({ label, val, set }) => (
                  <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)' }}>{label}</span>
                    <input
                      type="number" value={val} onChange={e => set(e.target.value)}
                      style={{ padding: '10px 8px', background: 'var(--bg, #16171f)', border: '1px solid var(--border, #2e3040)', borderRadius: 5, fontSize: 16, color: 'var(--text, #e8e8f0)', outline: 'none', width: '100%' }}
                    />
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 6 }}>
                <button onClick={() => handleResolve('revise')} disabled={resolving}
                  style={{ padding: isMobile ? '12px' : '5px 14px', minHeight: isMobile ? 44 : undefined, background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 5, fontSize: isMobile ? 14 : 11, fontWeight: 700, color: '#000', cursor: 'pointer' }}>
                  {resolving ? '…' : 'Save & Resolve'}
                </button>
                <button onClick={() => setReviseMode(false)}
                  style={{ padding: isMobile ? '12px' : '5px 10px', minHeight: isMobile ? 44 : undefined, background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, fontSize: isMobile ? 14 : 11, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setReviseMode(true)}
                style={{ padding: isMobile ? '12px' : '5px 12px', minHeight: isMobile ? 44 : undefined, background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, fontSize: isMobile ? 14 : 11, color: 'var(--text, #e8e8f0)', cursor: 'pointer' }}>
                ✏ Revise price
              </button>
              <button onClick={() => handleResolve('resolve')} disabled={resolving}
                style={{ padding: isMobile ? '12px' : '5px 12px', minHeight: isMobile ? 44 : undefined, background: 'none', border: '1px solid #4dd9c0', borderRadius: 5, fontSize: isMobile ? 14 : 11, color: '#4dd9c0', cursor: 'pointer' }}>
                {resolving ? '…' : '✓ Mark resolved'}
              </button>
              <button onClick={() => { if (window.confirm('Remove this item from the estimate?')) handleResolve('remove') }} disabled={resolving}
                style={{ padding: isMobile ? '12px' : '5px 12px', minHeight: isMobile ? 44 : undefined, background: 'none', border: '1px solid #f87171', borderRadius: 5, fontSize: isMobile ? 14 : 11, color: '#f87171', cursor: 'pointer' }}>
                ✕ Remove item
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
