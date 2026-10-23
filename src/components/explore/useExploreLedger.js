import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// explore_ledger(): every exploratory request from Stage with its outcome and PID.
export function useExploreLedger(from, to) {
  const [state, setState] = useState({ loading: true, error: null, rows: [] })
  useEffect(() => {
    let alive = true
    supabase.rpc('explore_ledger', { p_from: from || null, p_to: to || null }).then(({ data, error }) => {
      if (alive) setState({ loading: false, error: error ? error.message : null, rows: data || [] })
    })
    return () => { alive = false }
  }, [from, to])
  return state
}

// Stage's property type → ours. "Independent Building" could be either, so it
// is left for the inspector to pick.
const STAGE_TYPE = { 'apartment': 'apartment', 'gated society': 'apartment', 'gated building': 'apartment', 'builder floor': 'apartment', 'independent residence': 'independent_home' }
export const typeFrom = (stageType) => STAGE_TYPE[String(stageType || '').toLowerCase()] || ''
export const layoutFrom = (config) => { const n = parseInt(String(config || '').trim()); return n >= 1 && n <= 5 ? `${n} BHK` : '' }

// New inspection for an accepted request, with what Stage already knows.
export function inspectUrl(r) {
  const q = new URLSearchParams({ explore: r.id })
  if (r.pid) q.set('pid', r.pid)
  const t = typeFrom(r.property_type); if (t) q.set('type', t)
  const l = layoutFrom(r.configuration); if (l) q.set('layout', l)
  return `/inspections/new?${q}`
}
