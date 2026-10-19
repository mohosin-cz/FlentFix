import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Shown on a property set aside at the clean slate (or paused by an admin):
// it raises no tasks, alerts or overdue counts until someone brings it back.
// History is untouched; "Resume journey" puts it straight back in the flow.

const MONO = 'var(--font-mono, monospace)'

export default function PausedBanner({ pid, onResumed }) {
  const [p, setP] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true
    supabase.from('properties').select('journey_paused_at, journey_paused_note').eq('pid', pid).maybeSingle()
      .then(({ data }) => { if (alive) setP(data) })
    return () => { alive = false }
  }, [pid])
  if (!p?.journey_paused_at) return null
  async function resume() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('property_resume_journey', { p_pid: pid })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setP({ ...p, journey_paused_at: null })
    onResumed && onResumed()
  }
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 24px', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)' }}>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted, #6b6d82)' }}>PAUSED</span>
      <span style={{ flex: '1 1 300px', fontSize: 13.5 }}>
        Before the clean slate{p.journey_paused_note ? ` (${p.journey_paused_note.replace('clean slate · ', '')})` : ''} — this property raises no tasks or alerts. Its history is all still here.
      </span>
      <button type="button" disabled={busy} onClick={resume}
        style={{ minHeight: 36, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(200,150,62,0.45)', background: 'rgba(200,150,62,0.12)', color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
        {busy ? 'Resuming…' : 'Resume journey'}
      </button>
      {err && <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--red, #b0645b)' }}>{err}</span>}
    </div>
  )
}
