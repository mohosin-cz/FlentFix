import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// The vendor's own advances, in their Payroll tab: what they were paid ahead of
// payday and which month's pay it comes off. Said plainly, so payday holds no
// surprises and nobody has to ask why this month is lower.

const MONO = 'var(--font-mono, monospace)'
const inr = (n) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const month = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const day = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const WORD = { recovered: 'taken from', draft: 'comes off', upcoming: 'comes off', missed: 'comes off a later month than' }

export default function PortalAdvances({ token }) {
  const [list, setList] = useState(null)
  useEffect(() => {
    let alive = true
    supabase.rpc('attend_advances', { p_token: token }).then(({ data, error }) => { if (alive) setList(error ? [] : (data || [])) })
    return () => { alive = false }
  }, [token])
  if (!list || list.length === 0) return null
  const open = list.filter(a => (a.schedule || []).some(s => s.state !== 'recovered'))
  const shown = open.length ? open : list.slice(0, 2)
  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Advances</div>
      {shown.map((a, i) => {
        const left = (a.schedule || []).filter(s => s.state !== 'recovered').reduce((t, s) => t + Number(s.amount), 0)
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: i ? 10 : 0, borderTop: i ? '1px solid var(--border, #2e3040)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
              <span>{inr(a.amount)} paid {day(a.given_on)}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: left ? '#a8895a' : '#6f9a7e' }}>{left ? `${inr(left)} to go` : '✓ settled'}</span>
            </div>
            {(a.schedule || []).map(s => (
              <div key={s.month} style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                {s.state === 'recovered' ? '✓ ' : '· '}{inr(s.amount)} {WORD[s.state] || 'comes off'} your {month(s.month)} pay
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
