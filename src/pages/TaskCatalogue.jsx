import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { isAdmin } from '../utils/vendorHub'

// The one screen where a duration is set by a person.
//
// Everything downstream adds these up — the designer's brief, the inspection's
// fixes — so this is the number the whole plan rests on. Nothing else in the
// system is allowed to invent one, which is what makes this worth its own page
// rather than a settings tab somebody stumbles into.
//
// Admin only, and not linked from anywhere: reachable at /admin/tasks if you
// know it exists. The real gate is the RLS policy on the table; this just keeps
// the page from being a thing other staff have to wonder about.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

// Closed list, matching the check constraint on the table. If these two ever
// disagree the save fails loudly, which is the right way round.
const REQUIREMENT_TYPES = [
  'installation', 'assembly', 'repair', 'replacement',
  'removal', 'supply_only', 'finishing', 'other',
]
const TRADES = ['Electrician', 'Carpenter', 'Plumber', 'Painter', 'Cleaner', 'Civil / masonry', 'Other']
const CATEGORIES = ['Electrical', 'Lighting', 'Furniture', 'Carpentry', 'Soft furnishing', 'Plumbing', 'Painting', 'Cleaning', 'Other']
const UNITS = ['each', 'metre', 'sqft', 'window', 'room', 'hour']

const BLANK = {
  name: '', trade: 'Electrician', category: 'Electrical',
  requirement_type: 'installation', minutes: 30, unit: 'each',
  aliases: '', notes: '', active: true,
}

const inp = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 14,
  color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)',
  border: '1px solid var(--border, #2e3040)', borderRadius: 8, outline: 'none', fontFamily: 'inherit',
}
const lbl = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }

// minutes → "20m" / "4h" / "1h 30m". A catalogue read at a glance is a
// catalogue people keep tidy.
function hhmm(m) {
  const n = Math.max(0, Math.round(Number(m) || 0))
  if (n < 60) return `${n}m`
  const h = Math.floor(n / 60), r = n % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

function Field({ label, children, span }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, gridColumn: span ? '1 / -1' : 'auto' }}>
      <span style={lbl}>{label}</span>
      {children}
    </label>
  )
}

export default function TaskCatalogue() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const phone = useIsMobile(760)
  const admin = isAdmin(session?.user?.email)

  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState(null)      // the row being added or edited
  const [q, setQ] = useState('')
  const [confirming, setConfirming] = useState(null)

  // The fetch lives inside the effect and a reload is a bumped key, the same
  // shape VendorWorkOrder uses. Calling a loader from the effect would write
  // state synchronously on mount; `rows` starts null and reads as loading, so
  // nothing is set until the await returns.
  const [reloadKey, setReloadKey] = useState(0)
  const load = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error: e } = await supabase.from('task_catalogue')
        .select('*').order('trade').order('category').order('name')
      if (!alive) return
      if (e) { setError(e.message); setRows([]); return }
      setError(''); setRows(data || [])
    })()
    return () => { alive = false }
  }, [reloadKey])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows || []
    return (rows || []).filter(r =>
      [r.name, r.trade, r.category, r.requirement_type, (r.aliases || []).join(' ')]
        .some(v => (v || '').toLowerCase().includes(needle)))
  }, [rows, q])

  async function save() {
    if (!draft.name.trim()) { setError('Give it a name.'); return }
    setBusy(true); setError('')
    const patch = {
      name: draft.name.trim(),
      trade: draft.trade, category: draft.category,
      requirement_type: draft.requirement_type,
      minutes: Math.max(1, Math.round(Number(draft.minutes) || 0)),
      unit: draft.unit,
      // "switchboard, plug point, socket" → three ways in to one task
      aliases: String(draft.aliases || '').split(',').map(s => s.trim()).filter(Boolean),
      notes: draft.notes?.trim() || null,
      active: draft.active !== false,
    }
    const { error: e } = draft.id
      ? await supabase.from('task_catalogue').update(patch).eq('id', draft.id)
      : await supabase.from('task_catalogue').insert(patch)
    setBusy(false)
    if (e) { setError(e.message); return }
    setDraft(null); load()
  }

  async function remove(row) {
    setConfirming(null); setError('')
    const { error: e } = await supabase.from('task_catalogue').delete().eq('id', row.id)
    if (e) { setError(e.message); return }
    load()
  }

  if (!admin) {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Not your page</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', marginTop: 6, fontFamily: MONO }}>The task catalogue is admin only.</div>
          <button onClick={() => navigate('/')} style={{ marginTop: 16, minHeight: 40, padding: '0 16px', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, cursor: 'pointer', fontFamily: MONO }}>Back to Pulse</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS, display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate('/')} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pulse-title" style={{ fontSize: 15.5 }}>Task catalogue</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>
            {rows == null ? '…' : `${rows.length} tasks`} · how long each one takes
          </div>
        </div>
        <button onClick={() => setDraft({ ...BLANK })} className="tct tct-raised" style={{ padding: '8px 13px', fontSize: 12, borderRadius: 8, whiteSpace: 'nowrap' }}>+ Task</button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1080, margin: '0 auto', padding: phone ? '14px 16px 90px' : '18px 20px 60px', display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim, #9394a8)', lineHeight: 1.55 }}>
          Everything that reaches a work order looks its duration up here — the inspection&rsquo;s fixes and the
          designer&rsquo;s scope alike. Minutes are <b>per unit</b>: six switch points is six times the number below.
          Anything a designer asks for that isn&rsquo;t listed arrives with no time, and you add it here.
        </div>

        {error && (
          <div style={{ padding: '11px 13px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontSize: 12.5, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word' }}>⚠ {error}</div>
        )}

        {draft && (
          <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--accent, #c8963e)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{draft.id ? 'Edit task' : 'New task'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10 }}>
              <Field label="Name" span><input style={inp} value={draft.name} placeholder="Switch point" onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} /></Field>
              <Field label="Trade">
                <select style={{ ...inp, cursor: 'pointer' }} value={draft.trade} onChange={e => setDraft(d => ({ ...d, trade: e.target.value }))}>
                  {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <select style={{ ...inp, cursor: 'pointer' }} value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Requirement">
                <select style={{ ...inp, cursor: 'pointer' }} value={draft.requirement_type} onChange={e => setDraft(d => ({ ...d, requirement_type: e.target.value }))}>
                  {REQUIREMENT_TYPES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                </select>
              </Field>
              <Field label="Minutes per unit">
                <input style={inp} inputMode="numeric" value={draft.minutes} onChange={e => setDraft(d => ({ ...d, minutes: e.target.value.replace(/[^0-9]/g, '') }))} />
              </Field>
              <Field label="Unit" span={phone}>
                <select style={{ ...inp, cursor: 'pointer' }} value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Also called (comma separated)" span>
                <input style={inp} value={draft.aliases} placeholder="switchboard, plug point, socket"
                  onChange={e => setDraft(d => ({ ...d, aliases: e.target.value }))} />
              </Field>
              <Field label="Note (optional)" span>
                <input style={inp} value={draft.notes || ''} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
              </Field>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.5 }}>
              The other names matter: a designer writes &ldquo;switchboard&rdquo; and means this. Without them the
              request comes back unrecognised and somebody types it in by hand.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setDraft(null); setError('') }} disabled={busy}
                style={{ minHeight: 42, padding: '0 16px', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'transparent', color: 'var(--text-dim, #9394a8)', fontSize: 13, cursor: 'pointer', fontFamily: MONO }}>Cancel</button>
              <button onClick={save} disabled={busy}
                style={{ minHeight: 42, padding: '0 20px', borderRadius: 9, border: 'none', background: 'var(--accent, #c8963e)', color: '#16171f', fontSize: 13.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
                {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Add task'}
              </button>
            </div>
          </div>
        )}

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search task, trade, other names…" style={inp} />

        {rows == null ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{q ? 'Nothing matches that' : 'No tasks yet'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginTop: 4, fontFamily: MONO }}>
              {q ? 'Try another word.' : 'Add the first one — it only has to cover what comes up.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border, #2e3040)' }}>
            {shown.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: 'var(--bg-input, #252731)', opacity: r.active ? 1 : 0.5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, color: 'var(--text, #e8e8f0)' }}>{r.name}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent, #c8963e)', fontFamily: MONO }}>{r.trade}</span>
                    {!r.active && <span style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>INACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.category} · {String(r.requirement_type).replace('_', ' ')}
                    {(r.aliases || []).length ? ` · also: ${(r.aliases || []).join(', ')}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, width: 78 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>{hhmm(r.minutes)}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>per {r.unit}</div>
                </div>
                {confirming === r.id ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => remove(r)} style={{ minHeight: 34, padding: '0 11px', borderRadius: 8, border: 'none', background: 'var(--red, #e05c6a)', color: '#16171f', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>Delete</button>
                    <button onClick={() => setConfirming(null)} style={{ minHeight: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'transparent', color: 'var(--text-dim, #9394a8)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>No</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => setDraft({ ...r, aliases: (r.aliases || []).join(', ') })} aria-label={`Edit ${r.name}`}
                      style={{ minHeight: 34, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'transparent', color: 'var(--text-dim, #9394a8)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>Edit</button>
                    <button onClick={() => setConfirming(r.id)} aria-label={`Delete ${r.name}`}
                      style={{ minHeight: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'transparent', color: 'var(--red, #e05c6a)', fontSize: 12, cursor: 'pointer', fontFamily: MONO }}>✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
