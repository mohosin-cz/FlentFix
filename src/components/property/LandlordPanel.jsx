import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

// Landlord, units and the map pin, from the Flent Holy Grail sheet (synced at
// 9am and 6pm, and filled the moment a PID is created). Read-only here: the
// sheet is the source, so a fix goes in the sheet.

const MONO = 'var(--font-mono, monospace)'

export default function LandlordPanel({ pid }) {
  const [state, setState] = useState({ loading: true, error: null, row: null })

  useEffect(() => {
    let alive = true
    supabase.from('properties').select('landlord_name, units, maps_url, flat_no, floor, address, sheet_synced_at').eq('pid', pid).maybeSingle()
      .then(({ data, error }) => { if (alive) setState({ loading: false, error: error ? error.message : null, row: data }) })
    return () => { alive = false }
  }, [pid])

  const { loading, error, row } = state
  const box = { background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: 16 }
  const title = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.08em' }
  const dt = { fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }
  const dd = { margin: 0, fontSize: 13, wordBreak: 'break-word' }
  const note = { fontFamily: MONO, fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, marginTop: 10 }

  if (loading) return <section style={box} aria-busy="true"><div style={title}>property</div><div style={{ height: 14, width: '60%', background: 'var(--border, #2e3040)', borderRadius: 4, marginTop: 12, opacity: 0.6 }} /></section>
  if (error) {
    const notYet = /column|does not exist|schema cache/i.test(error)
    return <section style={box}><div style={title}>property</div><div style={{ ...note, color: notYet ? note.color : 'var(--red, #e05c6a)' }}>{notYet ? 'Landlord and map details arrive once the Holy Grail sync is switched on.' : `Couldn't load — ${error}`}</div></section>
  }
  if (!row?.landlord_name && !row?.units && !row?.maps_url) {
    return <section style={box}><div style={title}>property</div><div style={note}>No landlord, units or map for PID {pid} yet. If it's in the Holy Grail sheet's Properties tab, it arrives at the next sync (9am or 6pm); if not, add it there.</div></section>
  }

  return (
    <section style={box}>
      <div style={title}>property</div>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 14px', margin: '12px 0 0', alignItems: 'baseline' }}>
        <dt style={dt}>Landlord</dt><dd style={dd}>{row.landlord_name || <span style={{ color: 'var(--amber, #c8963e)' }}>not in the sheet</span>}</dd>
        <dt style={dt}>Flat</dt><dd style={{ ...dd, fontFamily: MONO }}>{row.flat_no ? `${row.flat_no}${row.floor ? ` · floor ${row.floor}` : ''}` : '—'}</dd>
        <dt style={dt}>Units</dt><dd style={{ ...dd, fontFamily: MONO }}>{row.units || '—'}</dd>
        {row.address && <><dt style={dt}>Address</dt><dd style={{ ...dd, fontSize: 12.5, color: 'var(--text-dim, #9394a8)' }}>{row.address}</dd></>}
        <dt style={dt}>Map</dt>
        <dd style={dd}>{row.maps_url
          ? <a href={row.maps_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent, #c8963e)', fontFamily: MONO, fontSize: 12, textDecoration: 'none' }}>Open in Google Maps ↗</a>
          : '—'}</dd>
      </dl>
      <div style={{ ...dt, marginTop: 12 }}>
        From the Holy Grail sheet{row.sheet_synced_at ? ` · synced ${new Date(row.sheet_synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''} · edit it there
      </div>
    </section>
  )
}
