import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// Where this property came from: the exploratory visit supply raised in
// Flent-Stage — who went, what they found, the rough capex, the landlord's
// contact. A head start for the inspection. When nothing is linked yet, the
// approved requests that look like this property are offered for one-tap linking.

const MONO = 'var(--font-mono, monospace)'
const C = { text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)', accent: 'var(--accent, #c8963e)', red: 'var(--red, #e05c6a)', border: 'var(--border, #2e3040)' }
const first = (email) => { const s = (email || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '' }
const dayTxt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export default function ExploratoryPanel({ pid }) {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('exploratory_for_property', { p_pid: pid })
    setState({ loading: false, error: error ? error.message : null, data })
  }, [pid])
  useEffect(() => { load() }, [load])

  const { loading, error, data } = state
  // nothing to show: not applied yet, or no exploratory and no likely match
  if (loading || error || !data || (!data.linked && !(data.suggestions || []).length)) return null

  const box = { background: 'var(--bg-panel, #1e2028)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, display: 'grid', gap: 8 }
  const title = { fontSize: 11, fontWeight: 600, color: C.muted, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }

  if (!data.linked) {
    return (
      <section style={box}>
        <div style={title}>exploratory visit?</div>
        <div style={{ fontSize: 12.5, color: C.dim }}>This looks like an approved exploratory from supply. Link it to carry the findings, capex and landlord contact here.</div>
        {data.suggestions.map(s => (
          <button key={s.id} type="button" disabled={busy}
            onClick={async () => { setBusy(true); const { error: e } = await supabase.rpc('exploratory_link', { p_id: s.id, p_pid: pid }); setBusy(false); if (!e) load() }}
            style={{ textAlign: 'left', minHeight: 36, padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(200,150,62,0.45)', background: 'rgba(200,150,62,0.10)', color: C.accent, fontFamily: MONO, fontSize: 12, cursor: 'pointer' }}>
            Link {s.name}{s.config ? ` · ${s.config}` : ''}{s.visit_date ? ` · visited ${dayTxt(s.visit_date)}` : ''}{s.who ? ` by ${first(s.who)}` : ''}
          </button>
        ))}
      </section>
    )
  }

  const r = data.request, v = r.last_visit || {}
  const findings = v.observations || v.notes || ''
  const long = findings.length > 260
  return (
    <section style={box}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={title}>from exploratory</div>
        <button type="button" onClick={() => navigate(`/pipeline?r=${r.id}`)} style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, color: C.accent, fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>Pipeline ›</button>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.property_name}{r.configuration ? <span style={{ color: C.muted, fontFamily: MONO, fontSize: 11.5 }}> · {r.configuration}</span> : ''}</div>
      <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>
        {r.visit_date ? `visited ${dayTxt(r.visit_date)}` : 'not visited'}{(r.assignee || r.stage_inspector) ? ` by ${first(r.assignee || r.stage_inspector)}` : ''}
        {v.outcome ? ` · ${v.outcome}` : ''}{v.capex != null ? ` · capex ₹${Math.round(v.capex).toLocaleString('en-IN')}` : ''}
      </div>
      {(r.owner_name || r.owner_phone) && (
        <div style={{ fontSize: 13 }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>LANDLORD </span>{r.owner_name}
          {r.owner_phone && <> · <a href={`tel:${r.owner_phone}`} style={{ color: C.accent, fontFamily: MONO, fontSize: 12, textDecoration: 'none' }}>{r.owner_phone}</a></>}
          {r.owner_email && <span style={{ color: C.dim, fontFamily: MONO, fontSize: 12 }}> · {r.owner_email}</span>}
        </div>
      )}
      {findings && (
        <div style={{ fontSize: 12.5, color: C.dim, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
          {long && !more ? findings.slice(0, 260) + '…' : findings}
          {long && <button type="button" onClick={() => setMore(m => !m)} style={{ background: 'none', border: 'none', padding: 0, marginLeft: 6, color: C.accent, fontFamily: MONO, fontSize: 11.5, cursor: 'pointer' }}>{more ? 'less' : 'more'}</button>}
        </div>
      )}
      {v.report_url && <a href={v.report_url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontFamily: MONO, fontSize: 12 }}>Exploratory report ›</a>}
    </section>
  )
}
