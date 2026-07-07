import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../utils/activityUtils'

export const QUERY_REASON_LABELS = {
  why_needed:     'What is this repair for?',
  more_photos:    'Can I see more photos?',
  cost_breakdown: 'Can you explain the cost?',
  self_arrange:   'I can arrange this myself',
  // DisputeThread legacy labels
  not_needed:    'Not needed',
  price_too_high: 'Price too high',
  already_fixed:  'Already fixed',
  question:       'Question',
}

function relTime(str) {
  if (!str) return ''
  const diff = Date.now() - new Date(str).getTime()
  if (diff < 60000)    return 'just now'
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function QueryThread({ itemId, estimateId, item, userEmail }) {
  const [messages, setMessages]  = useState([])
  const [reply, setReply]        = useState('')
  const [sending, setSending]    = useState(false)
  const endRef = useRef(null)

  async function fetchMessages() {
    const { data } = await supabase
      .from('estimate_disputes')
      .select('*')
      .eq('estimate_item_id', itemId)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  useEffect(() => { fetchMessages() }, [itemId])

  useEffect(() => {
    const ch = supabase.channel(`qt-${itemId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'estimate_disputes',
        filter: `estimate_item_id=eq.${itemId}`,
      }, fetchMessages)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [itemId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const itCost = ((parseFloat(item?.material_cost) || 0) + (parseFloat(item?.labour_cost) || 0)) * (item?.qty || 1)
  const firstReason = messages.find(m => m.reason_tag)?.reason_tag

  async function handleSend() {
    if (!reply.trim() || sending) return
    const txt = reply.trim()
    const optimistic = {
      id: '__opt__', author_type: 'flent',
      author_name: userEmail?.split('@')[0] || 'Flent',
      message: txt, created_at: new Date().toISOString(),
    }
    setMessages(m => [...m, optimistic])
    setReply('')
    setSending(true)
    await supabase.from('estimate_disputes').insert({
      estimate_item_id: itemId,
      estimate_id:      estimateId,
      author_type:      'flent',
      author_name:      userEmail?.split('@')[0] || 'Flent',
      message:          txt,
    })
    await logActivity(supabase, estimateId, {
      action:     'query_reply',
      item_id:    itemId,
      item_name:  item?.item_name,
      changed_by: userEmail,
    })
    setSending(false)
    fetchMessages()
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Context header */}
      <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{item?.item_name || '—'}</span>
        {item?.area && (
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'var(--bg-input, #252731)', color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
            {item.area}
          </span>
        )}
        {itCost > 0 && (
          <span style={{ fontSize: 11, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>
            ₹{itCost.toLocaleString('en-IN')}
          </span>
        )}
        {firstReason && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'rgba(240,160,80,0.15)', color: '#f0a050', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, letterSpacing: '0.04em' }}>
            {QUERY_REASON_LABELS[firstReason] || firstReason}
          </span>
        )}
      </div>

      {/* Messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, minHeight: 40 }}>
        {messages.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', padding: '8px 0' }}>No messages yet</div>
        ) : messages.map((msg, i) => {
          const isFlent = msg.author_type === 'flent'
          return (
            <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: isFlent ? 'flex-end' : 'flex-start' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginBottom: 3, display: 'flex', gap: 6 }}>
                <span>{msg.author_name || msg.author_type}</span>
                <span style={{ opacity: 0.6 }}>{relTime(msg.created_at)}</span>
              </div>
              <div style={{
                maxWidth: '85%', padding: '8px 12px', borderRadius: 10,
                fontSize: 12, lineHeight: 1.6,
                ...(isFlent
                  ? { background: 'var(--bg-input, #252731)', color: 'var(--text, #e8e8f0)', border: '1px solid var(--border, #2e3040)' }
                  : { background: '#ede8dc', color: '#22201a', border: '1px solid rgba(0,0,0,0.06)' }
                ),
              }}>
                {msg.message || `[${QUERY_REASON_LABELS[msg.reason_tag] || msg.reason_tag}]`}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Composer — only for authenticated flent users */}
      {userEmail && (
        <div>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Reply… (Enter to send · Shift+Enter for newline)"
            disabled={sending}
            rows={3}
            style={{
              width: '100%', resize: 'none', boxSizing: 'border-box',
              background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
              borderRadius: 8, padding: '10px 12px', fontSize: 14,
              color: 'var(--text, #e8e8f0)', outline: 'none',
              fontFamily: 'var(--font-sans, Poppins, sans-serif)',
              opacity: sending ? 0.6 : 1,
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent, #c8963e)' }}
            onBlur={e  => { e.target.style.borderColor = 'var(--border, #2e3040)'  }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6, gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)' }}>Shift+↵ newline</span>
            <button
              onClick={handleSend}
              disabled={sending || !reply.trim()}
              style={{
                padding: '7px 18px', background: 'var(--accent, #c8963e)', border: 'none',
                borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#000',
                cursor: sending || !reply.trim() ? 'default' : 'pointer',
                opacity: !reply.trim() ? 0.4 : 1,
              }}
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
