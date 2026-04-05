import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { StickyFooter, BtnPrimary } from '../components/ui'
import { supabase } from '../lib/supabase'

const CONDITION_COLOR = { Good: '#3dba7a', Fair: '#c8963e', Poor: '#e05c6a' }

export default function InspectionSummary() {
  const navigate = useNavigate()
  const { state } = useLocation()

  if (!state?.rooms) {
    navigate('/inspections/new', { replace: true })
    return null
  }

  const { pid, inspectionType, propertyType, layout, rooms } = state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const counts = rooms.reduce((acc, r) => {
    acc[r.condition] = (acc[r.condition] || 0) + 1
    return acc
  }, {})

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError('')

    // Insert inspection record
    const { data: ins, error: insErr } = await supabase
      .from('inspections')
      .insert({
        pid,
        house_type: inspectionType,
        property_type: propertyType,
        layout,
        inspection_date: new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single()

    if (insErr) {
      setSubmitError(insErr.message)
      setSubmitting(false)
      return
    }

    // Insert line items from rooms
    if (rooms.length) {
      const lineItems = rooms.map(r => ({
        inspection_id: ins.id,
        section_name: r.section || 'General',
        area: r.name,
        issue_description: r.notes || '',
        item_score: r.condition === 'Good' ? 8 : r.condition === 'Fair' ? 5 : 2,
        material_cost: 0,
        labour_cost: 0,
      }))

      const { error: liErr } = await supabase
        .from('inspection_line_items')
        .insert(lineItems)

      if (liErr) {
        setSubmitError(liErr.message)
        setSubmitting(false)
        return
      }
    }

    navigate(`/estimate/${ins.id}`, { replace: true })
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Review</span>
          <span style={s.headerSub}>Inspection Summary</span>
        </div>
        <div style={{ width: 36 }} />
      </header>

      <main style={s.main}>

        {/* meta */}
        <div style={s.metaCard}>
          {[
            ['PID',             pid],
            ['Inspection Type', inspectionType],
            ['Property Type',   propertyType.replace('_', ' ')],
            ['Layout',          layout],
          ].map(([k, v]) => (
            <div key={k} style={s.metaRow}>
              <span style={s.metaKey}>{k}</span>
              <span style={s.metaVal}>{v}</span>
            </div>
          ))}
        </div>

        {/* score pills */}
        <div style={s.scorePills}>
          {Object.entries(counts).map(([cond, count]) => (
            <div key={cond} style={{ ...s.scorePill, borderColor: CONDITION_COLOR[cond] }}>
              <span style={{ ...s.scoreDot, background: CONDITION_COLOR[cond] }} />
              <span style={s.scoreText}>{count} {cond}</span>
            </div>
          ))}
        </div>

        {/* room list */}
        <div style={s.roomList}>
          {rooms.map((r, i) => (
            <div key={i} style={s.roomRow}>
              <span style={s.roomRowName}>{r.name}</span>
              <div style={s.roomRowRight}>
                {r.notes && <span style={s.notesFlag}>has notes</span>}
                <span style={{ ...s.condBadge, background: CONDITION_COLOR[r.condition] + '22', color: CONDITION_COLOR[r.condition] }}>
                  {r.condition}
                </span>
              </div>
            </div>
          ))}
        </div>

      </main>

      <StickyFooter left={
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{rooms.length} areas inspected</div>
          <div style={{ fontSize: 11, color: submitError ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{submitError || pid}</div>
        </div>
      }>
        <BtnPrimary onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : 'Submit →'}
        </BtnPrimary>
      </StickyFooter>
    </div>
  )
}

const s = {
  page: { minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56, background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 },
  backBtn: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' },
  headerCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 },
  headerTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  headerSub: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  main: { flex: 1, padding: '20px 20px 48px', maxWidth: 560, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.3s ease' },
  metaCard: { background: 'var(--bg-panel, #1e2028)', borderRadius: 10, padding: '0 18px', border: '1px solid var(--border, #2e3040)' },
  metaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid var(--border, #2e3040)' },
  metaKey: { fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' },
  metaVal: { fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', textTransform: 'capitalize', fontFamily: 'var(--font-mono, monospace)' },
  scorePills: { display: 'flex', gap: 8 },
  scorePill: { display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px', background: 'var(--bg-panel, #1e2028)', border: '1px solid', borderRadius: 4 },
  scoreDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  scoreText: { fontSize: 12, fontWeight: 600, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' },
  roomList: { background: 'var(--bg-panel, #1e2028)', borderRadius: 10, padding: '0 18px', border: '1px solid var(--border, #2e3040)' },
  roomRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid var(--border, #2e3040)' },
  roomRowName: { fontSize: 13, fontWeight: 500, color: 'var(--text, #e8e8f0)' },
  roomRowRight: { display: 'flex', alignItems: 'center', gap: 8 },
  notesFlag: { fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontStyle: 'italic', fontFamily: 'var(--font-mono, monospace)' },
  condBadge: { fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 3, fontFamily: 'var(--font-mono, monospace)' },
  submitBtn: { fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 600, padding: '12px 20px', background: 'var(--accent, #c8963e)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.02em' },
}
