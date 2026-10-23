import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExploreLedger, inspectUrl } from './useExploreLedger'

// Every exploratory visit from Stage, what supply decided, and whether it
// became a property — the tally on top, who visited what, then the list with
// the next thing to do on each (open the request, open the property, or start
// the inspection for an accepted one). Reads explore_ledger(): the outcome is
// Stage's status, the PID comes from Pulse's link, else Stage, else a Pulse
// property with the same building name.

const MONO = 'var(--font-mono, monospace)'
const C = {
  panel: 'var(--bg-panel, #1e2028)', input: 'var(--bg-input, #252731)', bg: 'var(--bg, #16171f)', border: 'var(--border, #2e3040)',
  text: 'var(--text, #e8e8f0)', dim: 'var(--text-dim, #9394a8)', muted: 'var(--text-muted, #6b6d82)', accent: 'var(--accent, #c8963e)',
}
const T = { green: '#6f9a7e', red: '#b0645b', amber: '#a8895a', grey: '#7a7c90', blue: '#6f86a8' }
const OUTCOME = {
  accepted: { label: 'Accepted', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  deciding: { label: 'Supply deciding', tone: 'amber' },
  not_visited: { label: 'Not visited yet', tone: 'grey' },
}
const SOURCE = { pulse: 'linked in Pulse', stage: 'from Stage', name: 'same building in Pulse' }
const first = (e) => { const s = (e || '').split('@')[0]; return s ? s[0].toUpperCase() + s.slice(1) : '—' }
const nice = (d) => d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'
const pct = (a, b) => b ? `${Math.round(100 * a / b)}%` : '—'

export default function ExploreLedger({ from, to, who = 'all', allTime, setAllTime }) {
  const navigate = useNavigate()
  const ledger = useExploreLedger(allTime ? null : from, allTime ? null : to)
  const [outcome, setOutcome] = useState('')
  const [q, setQ] = useState('')

  const rows = useMemo(() => ledger.rows.filter(r => who === 'all' || (who === 'none' ? !r.visitor : r.visitor === who)), [ledger.rows, who])
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return rows.filter(r => (!outcome || r.outcome === outcome || (outcome === 'to_inspect' && r.outcome === 'accepted' && !r.inspected)) &&
      (!n || [r.name, r.configuration, r.pid, r.visitor, r.address].some(v => String(v || '').toLowerCase().includes(n))))
  }, [rows, outcome, q])

  const tally = useMemo(() => {
    const c = (f) => rows.filter(f).length
    const accepted = c(r => r.outcome === 'accepted')
    return {
      raised: rows.length, visited: c(r => r.visited), accepted, rejected: c(r => r.outcome === 'rejected'),
      deciding: c(r => r.outcome === 'deciding'), notVisited: c(r => r.outcome === 'not_visited'),
      withPid: c(r => r.outcome === 'accepted' && r.pid), inspected: c(r => r.outcome === 'accepted' && r.inspected),
      toInspect: c(r => r.outcome === 'accepted' && !r.inspected),
    }
  }, [rows])

  const people = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      if (!r.visited) continue
      const k = r.visitor || ''
      if (!m.has(k)) m.set(k, { who: k, visits: 0, accepted: 0, rejected: 0, deciding: 0, calls: 0, matched: 0 })
      const p = m.get(k); p.visits++
      if (r.outcome === 'accepted') p.accepted++; else if (r.outcome === 'rejected') p.rejected++; else if (r.outcome === 'deciding') p.deciding++
      if (r.verdict && (r.outcome === 'accepted' || r.outcome === 'rejected')) { p.calls++; if ((r.verdict === 'go') === (r.outcome === 'accepted')) p.matched++ }
    }
    return [...m.values()].sort((a, b) => b.visits - a.visits)
  }, [rows])

  const tile = (k, v, sub, tone, key) => (
    <button key={k} type="button" onClick={() => key !== undefined && setOutcome(o => o === key ? '' : key)} aria-pressed={key !== undefined && outcome === key}
      style={{ textAlign: 'left', background: outcome === key && key ? 'rgba(200,150,62,0.08)' : C.bg, border: `1px solid ${outcome === key && key ? C.accent : C.border}`, borderRadius: 9, padding: '10px 12px', display: 'grid', gap: 3, color: C.text, cursor: key !== undefined ? 'pointer' : 'default', fontFamily: MONO, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, color: C.muted }}>{k}</span>
      <span style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.05, color: v && tone ? T[tone] : C.text }}>{v}</span>
      <span style={{ fontSize: 11.5, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
    </button>
  )
  const act = { minHeight: 30, padding: '0 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: C.input, color: C.dim, fontFamily: MONO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }

  if (ledger.error) return <div style={{ padding: 16, fontFamily: MONO, fontSize: 12.5, color: T.red }}>{/explore_ledger|does not exist|schema cache/i.test(ledger.error) ? 'The exploratory view appears once its migration is applied.' : ledger.error}</div>

  return (
    <div style={{ display: 'grid', gap: 12, padding: 12, opacity: ledger.loading ? 0.6 : 1 }}>
      <style>{`.xl-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}@media (max-width:720px){.xl-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
        .xl-row{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:10px 12px;border-top:1px solid ${C.border}}
        @media (max-width:720px){.xl-row{grid-template-columns:minmax(0,1fr)}}`}</style>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {[[false, 'This month'], [true, 'All time']].map(([v, l]) => (
            <button key={l} type="button" aria-pressed={!!allTime === v} onClick={() => setAllTime(v)}
              style={{ border: 0, background: !!allTime === v ? 'rgba(200,150,62,0.12)' : 'transparent', color: !!allTime === v ? C.accent : C.dim, padding: '7px 11px', fontFamily: MONO, fontSize: 11.5, fontWeight: !!allTime === v ? 700 : 500, cursor: 'pointer' }}>{l}</button>
          ))}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>counted by visit date, else the date it was raised · outcome is Stage’s status</span>
      </div>

      <div className="xl-tiles">
        {tile('Requests', tally.raised, `${tally.visited} visited`, null, '')}
        {tile('Accepted', tally.accepted, `${pct(tally.accepted, tally.accepted + tally.rejected)} of decided`, 'green', 'accepted')}
        {tile('Rejected', tally.rejected, `${pct(tally.rejected, tally.accepted + tally.rejected)} of decided`, 'red', 'rejected')}
        {tile('Supply deciding', tally.deciding, 'visited, no decision yet', 'amber', 'deciding')}
        {tile('Not visited yet', tally.notVisited, 'booked or new', null, 'not_visited')}
        {tile('Converted to a PID', tally.withPid, `${pct(tally.withPid, tally.accepted)} of accepted`, null, undefined)}
        {tile('Inspected', tally.inspected, `${pct(tally.inspected, tally.accepted)} of accepted`, null, undefined)}
        {tile('Ready to inspect', tally.toInspect, 'accepted, no inspection yet', tally.toInspect ? 'blue' : null, 'to_inspect')}
      </div>

      {people.length > 0 && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 12.5 }}>
            <thead><tr>{['Visited by', 'Visits', 'Accepted', 'Rejected', 'Deciding', 'Calls that matched supply'].map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, color: C.muted, fontWeight: 700, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>{people.map(p => (
              <tr key={p.who}>
                <td style={{ padding: '8px 12px', fontWeight: 700 }}>{p.who ? first(p.who) : 'Nobody recorded'}</td>
                <td style={{ padding: '8px 12px' }}>{p.visits}</td>
                <td style={{ padding: '8px 12px', color: p.accepted ? T.green : C.muted }}>{p.accepted}</td>
                <td style={{ padding: '8px 12px', color: p.rejected ? T.red : C.muted }}>{p.rejected}</td>
                <td style={{ padding: '8px 12px', color: p.deciding ? T.amber : C.muted }}>{p.deciding}</td>
                <td style={{ padding: '8px 12px', color: C.dim }}>{p.calls ? `${p.matched} of ${p.calls}` : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: 10 }}>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, config, PID, visitor…" aria-label="Search exploratory"
            style={{ flex: '1 1 200px', minHeight: 34, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontFamily: MONO, fontSize: 12.5 }} />
          {outcome && <button type="button" style={act} onClick={() => setOutcome('')}>Showing: {outcome === 'to_inspect' ? 'Ready to inspect' : OUTCOME[outcome]?.label} ✕</button>}
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>{shown.length} of {rows.length}</span>
        </div>
        {shown.length === 0 && <div style={{ padding: '20px 12px', textAlign: 'center', fontFamily: MONO, fontSize: 12.5, color: C.muted, borderTop: `1px solid ${C.border}` }}>{ledger.loading ? 'Loading…' : rows.length ? 'Nothing matches.' : 'No exploratory visits in this window.'}</div>}
        {shown.map(r => {
          const o = OUTCOME[r.outcome] || OUTCOME.not_visited
          const canInspect = r.outcome === 'accepted' && !r.inspected
          return (
            <div key={r.id} className="xl-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{r.name || 'Unnamed'}{r.configuration ? <span style={{ color: C.muted, fontWeight: 500 }}> · {r.configuration}</span> : null}</div>
                <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.muted }}>
                  {r.visited ? `visited ${nice(r.visit_date)}` : r.visit_date ? `visit ${nice(r.visit_date)}` : `raised ${nice(r.raised_at)}`}
                  {r.visitor ? ` · ${first(r.visitor)}` : ''}
                  {r.verdict ? ` · their call: ${r.verdict === 'go' ? 'Go' : 'No-go'}` : ''}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                <span style={{ justifySelf: 'start', padding: '2px 8px', borderRadius: 999, fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: T[o.tone], background: `${T[o.tone]}22` }}>
                  {o.label}{r.decided_at ? ` · ${nice(r.decided_at)}` : ''}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: r.pid ? C.dim : C.muted }}>
                  {r.pid ? <>PID <b style={{ color: C.accent }}>{r.pid}</b> · {SOURCE[r.pid_source] || ''}{r.inspected ? ' · inspected' : ''}</> : r.outcome === 'accepted' ? 'no PID yet' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" style={act} onClick={() => navigate(`/explore/${r.id}`)}>Request ›</button>
                {r.pid && r.inspected && <button type="button" style={act} onClick={() => navigate(`/properties/${encodeURIComponent(r.pid)}`)}>Property ›</button>}
                {canInspect && <button type="button" style={{ ...act, borderColor: C.accent, color: C.accent }}
                  onClick={() => navigate(inspectUrl(r))}>Start inspection ›</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
