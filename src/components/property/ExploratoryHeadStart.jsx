import { FACTS } from '../../utils/explore'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// The inspection's head start: what the exploratory visit already found here.
// Every check marked Fix or Poor at exploratory is listed as something to
// confirm now — so the inspection starts from what the team already knows.
// Shows nothing when the property did not come from an exploratory.

const MONO = 'var(--font-mono, monospace)'
const RATING = { fix: ['Needs work', 'var(--accent, #c8963e)'], poor: ['Poor', 'var(--red, #e05c6a)'] }
const VERDICT = { go: 'Accept', no_go: 'Reject', unsure: 'Under review' }
const first = (e) => { const s = (e || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '' }

export default function ExploratoryHeadStart({ pid, compact = false }) {
  const [r, setR] = useState(null)
  const [open, setOpen] = useState(!compact)
  useEffect(() => {
    let alive = true
    supabase.rpc('exploratory_for_property', { p_pid: pid }).then(({ data }) => { if (alive && data?.linked) setR(data.request) })
    return () => { alive = false }
  }, [pid])
  if (!r) return null

  const log = r.log, sv = r.last_visit
  const flagged = (log?.checks || []).filter(c => c.rating === 'fix' || c.rating === 'poor')
  const stageText = !log && (sv?.observations || sv?.notes)
  const keep = (log?.retain || []).filter(x => x.item)
  const by = log?.author || r.assignee || r.stage_inspector || sv?.by
  if (!log && !stageText && !r.notes) return null

  return (
    <section style={{ border: '1px solid rgba(224,123,168,0.45)', background: 'rgba(224,123,168,0.07)', borderRadius: 12, padding: 14, display: 'grid', gap: 8, marginBottom: 20 }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'baseline', gap: 8, background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: '#e07ba8', fontWeight: 700 }}>FROM THE EXPLORATORY VISIT</span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: 'var(--text-muted, #6b6d82)' }}>
          {by ? `${first(by)}` : ''}{r.visit_date ? ` · ${new Date(r.visit_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
          {log?.verdict ? ` · ${VERDICT[log.verdict]}` : sv?.outcome ? ` · ${sv.outcome}` : ''}{log?.capex_band ? ` · capex ${log.capex_band}` : sv?.capex ? ` · capex ₹${Math.round(sv.capex).toLocaleString('en-IN')}` : ''}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 11, color: '#e07ba8' }}>{open ? 'hide' : `${flagged.length ? `${flagged.length} to confirm` : 'show'}`}</span>
      </button>
      {open && <>
        {r.notes && <div style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)' }}><b style={{ color: 'var(--text, #e8e8f0)' }}>Supply asked:</b> {r.notes}</div>}
        {flagged.length > 0 && (
          <div style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', letterSpacing: '0.06em' }}>SEEN AT EXPLORATORY — CONFIRM DURING THIS INSPECTION</span>
            {flagged.map(c => (
              <div key={c.key} style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: RATING[c.rating][1], minWidth: 74 }}>{c.score != null ? `${c.score}/10` : RATING[c.rating][0]}</span>
                <b>{c.label}</b>{c.note && <span style={{ color: 'var(--text-dim, #9394a8)' }}>— {c.note}</span>}
                {(c.photos || []).map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent, #c8963e)' }}>photo {i + 1}</a>)}
              </div>
            ))}
          </div>
        )}
        {log?.detail?.facts && Object.keys(log.detail.facts).length > 0 && (
          <div style={{ fontSize: 12.5 }}><b>Site checks:</b> <span style={{ color: 'var(--text-dim, #9394a8)' }}>
            {FACTS.filter(([k]) => log.detail.facts[k]?.v).map(([k, label, opts]) => `${label}: ${(opts.find(o => o[0] === log.detail.facts[k].v) || [])[1]}${log.detail.facts[k].note ? ` (${log.detail.facts[k].note})` : ''}`).join(' · ')}
            {log.detail.facts.other ? ` · ${log.detail.facts.other}` : ''}
          </span></div>
        )}
        {keep.length > 0 && <div style={{ fontSize: 12.5 }}><b>Furniture:</b> <span style={{ color: 'var(--text-dim, #9394a8)' }}>{keep.map(x => `${x.item} (${x.keep ? 'keep' : 'replace'})`).join(', ')}</span></div>}
        {log?.landlord_note && <div style={{ fontSize: 12.5 }}><b>Landlord:</b> <span style={{ color: 'var(--text-dim, #9394a8)' }}>{log.landlord_note}</span></div>}
        {stageText && <div style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)', whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{stageText}</div>}
      </>}
    </section>
  )
}
