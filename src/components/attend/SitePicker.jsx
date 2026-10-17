import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

// Which property are you at? Tap it, don't type it.
//
// A typed PID with one wrong digit files the day's attendance against the
// wrong home, and on setup day the vendor who turned up looks absent. So the
// vendor sees, as big buttons: properties where they have open work (today's
// and tomorrow's first), then places they punched in at recently. Anything
// else is a search over every Flent property by name or PID. Typing a PID is
// the last resort, and the punch is flagged for staff to check — never
// refused. If the list can't load (one bar of signal), it falls straight
// back to typing rather than showing an empty screen.
//
// Vendor-facing: property name and PID only.

const MONO = 'var(--font-mono, monospace)'

export default function SitePicker({ token, value, onChange }) {
  const [sites, setSites] = useState(null)     // null = loading
  const [failed, setFailed] = useState(false)
  const [mode, setMode] = useState('pick')     // pick · search · type
  const [q, setQ] = useState('')
  const [found, setFound] = useState(null)
  const [searching, setSearching] = useState(false)
  const [chosen, setChosen] = useState(null)   // {pid, name}
  const seq = useRef(0)

  useEffect(() => {
    let alive = true
    supabase.rpc('attend_my_sites', { p_token: token }).then(({ data, error }) => {
      if (!alive) return
      if (error) { setFailed(true); setSites([]); setMode('type'); return }
      setSites(data || [])
      if (!data || data.length === 0) setMode('search')
    })
    return () => { alive = false }
  }, [token])

  useEffect(() => {
    if (mode !== 'search') return
    const term = q.trim()
    if (!term) { setFound(null); return }
    const n = ++seq.current
    setSearching(true)
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('attend_find_site', { p_token: token, p_q: term })
      if (n !== seq.current) return
      setSearching(false)
      if (error) { setFound([]); return }
      setFound(data || [])
    }, 200)
    return () => clearTimeout(t)
  }, [q, mode, token])

  function pick(site) { setChosen(site); onChange(site.pid) }
  function clear() { setChosen(null); onChange('') }

  const big = (on) => ({
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '10px 14px', textAlign: 'left',
    borderRadius: 11, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
    border: `1px solid ${on ? 'var(--green, #3dba7a)' : 'var(--border, #2e3040)'}`,
    background: on ? 'rgba(61,186,122,0.12)' : 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: 'inherit',
  })
  const tag = (txt, tone) => <span style={{ marginInlineStart: 'auto', fontSize: 11, fontWeight: 700, fontFamily: MONO, color: tone || 'var(--text-muted, #6b6d82)', whiteSpace: 'nowrap' }}>{txt}</span>
  const pidChip = (pid) => <span style={{ fontSize: 12, fontWeight: 800, fontFamily: MONO, color: 'var(--accent, #c8963e)', minWidth: 36, flexShrink: 0 }}>{pid}</span>
  const linkBtn = { background: 'none', border: 'none', padding: '6px 2px', color: 'var(--accent, #c8963e)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }

  // Chosen: one confirmed row, easy to change.
  if (chosen) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={big(true)}>
          {pidChip(chosen.pid)}
          <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chosen.name || chosen.pid}</span>
          {tag('✓', 'var(--green, #3dba7a)')}
        </div>
        <button type="button" onClick={clear} style={linkBtn}>Change property</button>
      </div>
    )
  }

  if (sites === null) {
    return <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[0, 1].map(i => <div key={i} style={{ height: 56, borderRadius: 11, background: 'var(--bg-input, #252731)', opacity: 0.6 }} />)}</div>
  }

  const work = sites.filter(s => s.section === 'work')
  const recent = sites.filter(s => s.section === 'recent')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Which property are you at?</div>

      {mode === 'pick' && (
        <>
          {work.length > 0 && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Your work</div>}
          {work.map(s => (
            <button key={'w' + s.pid} type="button" onClick={() => pick(s)} style={big(false)}>
              {pidChip(s.pid)}
              <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              {tag(s.when_label, s.when_label === 'today' ? 'var(--green, #3dba7a)' : s.when_label === 'tomorrow' ? 'var(--accent, #c8963e)' : undefined)}
            </button>
          ))}
          {recent.length > 0 && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 4 }}>Been here recently</div>}
          {recent.map(s => (
            <button key={'r' + s.pid} type="button" onClick={() => pick(s)} style={big(false)}>
              {pidChip(s.pid)}
              <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              {tag(s.when_label)}
            </button>
          ))}
          <button type="button" onClick={() => setMode('search')} style={linkBtn}>Somewhere else? Search all properties</button>
        </>
      )}

      {mode === 'search' && (
        <>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Building name or PID" autoCorrect="off"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 50, padding: '0 14px', fontSize: 16, borderRadius: 11, border: '1px solid var(--border, #2e3040)', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', outline: 'none', fontFamily: 'inherit' }} />
          {searching && <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Searching…</div>}
          {!searching && found && found.length === 0 && q.trim() && (
            <div style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)' }}>No property matches “{q.trim()}”.</div>
          )}
          {(found || []).map(s => (
            <button key={'f' + s.pid} type="button" onClick={() => pick(s)} style={big(false)}>
              {pidChip(s.pid)}
              <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            </button>
          ))}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {sites.length > 0 && <button type="button" onClick={() => { setMode('pick'); setQ('') }} style={linkBtn}>Back to my properties</button>}
            <button type="button" onClick={() => setMode('type')} style={linkBtn}>Not listed? Type the PID</button>
          </div>
        </>
      )}

      {mode === 'type' && (
        <>
          {failed && <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)' }}>Couldn't load your properties. Type the property ID instead.</div>}
          <div style={{ display: 'flex', alignItems: 'stretch', background: 'var(--bg, #16171f)', border: '1px solid var(--border, #2e3040)', borderRadius: 11, overflow: 'hidden' }}>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted, #6b6d82)', borderRight: '1px solid var(--border, #2e3040)', fontFamily: MONO }}>PID</span>
            <input value={value} onChange={e => onChange(e.target.value)} placeholder="which property?" autoCapitalize="characters" autoCorrect="off" autoFocus={!failed}
              style={{ flex: 1, minWidth: 0, padding: '14px 12px', fontSize: 16, color: 'var(--text, #e8e8f0)', background: 'none', border: 'none', outline: 'none', fontFamily: 'inherit' }} />
          </div>
          {!failed && <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5 }}>A typed PID is checked by the office afterwards. Your check-in still goes through.</div>}
          {!failed && <button type="button" onClick={() => setMode(sites.length ? 'pick' : 'search')} style={linkBtn}>Back to the list</button>}
        </>
      )}
    </div>
  )
}
