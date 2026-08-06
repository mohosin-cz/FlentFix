import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { CATEGORIES, inr, cleanAmount, parseCSV, parseDateLoose, guessMapping, fmtDate } from '../utils/payments'

// Bringing years of spend out of a spreadsheet. The rule throughout: never
// write anything the person has not seen parsed back to them first. Every row
// is shown as it will be stored, and rows that cannot be read say why.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const FIELDS = [
  { key: 'paid_on', label: 'Date', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'category', label: 'Category' },
  { key: 'payee_name', label: 'Paid to' },
  { key: 'material_cost', label: 'Material ₹' },
  { key: 'labour_cost', label: 'Labour ₹' },
  { key: 'method', label: 'Method' },
  { key: 'reference', label: 'Reference' },
  { key: 'note', label: 'Note' },
]

const box = {
  width: '100%', boxSizing: 'border-box', padding: '10px 11px', fontSize: 13,
  color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)',
  border: '1px solid var(--border, #2e3040)', borderRadius: 9, outline: 'none', fontFamily: 'inherit',
}
const cell = { padding: '7px 9px', fontSize: 11.5, textAlign: 'left', verticalAlign: 'top', whiteSpace: 'nowrap' }
const head = { ...cell, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }

export default function PaymentsImport() {
  const navigate = useNavigate()
  const { pid } = useParams()
  const phone = useIsMobile(720)

  const [raw, setRaw] = useState('')
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState({})
  const [defaultCategory, setDefaultCategory] = useState('Materials')
  const [touched, setTouched] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')

  const grid = useMemo(() => parseCSV(raw), [raw])
  const headers = useMemo(() => (hasHeader && grid.length ? grid[0].map(h => h.trim()) : (grid[0] || []).map((_, i) => `Column ${i + 1}`)), [grid, hasHeader])
  const body = useMemo(() => (hasHeader ? grid.slice(1) : grid), [grid, hasHeader])

  // Guess once, when a file first arrives. After that the mapping is the
  // person's — re-guessing would fight every correction they make.
  useEffect(() => {
    if (!grid.length || touched) return
    setMapping(guessMapping(headers))
  }, [grid, headers, touched])

  const parsed = useMemo(() => {
    return body.map((cols, i) => {
      const get = (f) => (mapping[f] != null ? (cols[mapping[f]] ?? '').trim() : '')
      const dateRaw = get('paid_on')
      const amountRaw = get('amount')
      const paid_on = parseDateLoose(dateRaw)
      const amount = cleanAmount(amountRaw)
      const problems = []
      if (!dateRaw) problems.push('no date')
      else if (!paid_on) problems.push(`date “${dateRaw}” not understood`)
      if (!amountRaw) problems.push('no amount')
      else if (amount == null || amount <= 0) problems.push(`amount “${amountRaw}” not a number`)
      return {
        line: i + (hasHeader ? 2 : 1),
        paid_on,
        amount,
        category: get('category') || defaultCategory,
        payee_name: get('payee_name') || null,
        material_cost: cleanAmount(get('material_cost')),
        labour_cost: cleanAmount(get('labour_cost')),
        method: get('method') || null,
        reference: get('reference') || null,
        note: get('note') || null,
        problems,
      }
    })
  }, [body, mapping, hasHeader, defaultCategory])

  const good = parsed.filter(r => !r.problems.length)
  const bad = parsed.filter(r => r.problems.length)
  const goodTotal = good.reduce((n, r) => n + r.amount, 0)
  const newPayees = useMemo(
    () => [...new Set(good.map(r => (r.payee_name || '').trim()).filter(Boolean).map(n => n.toLowerCase()))],
    [good],
  )

  function onFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => { setRaw(String(reader.result || '')); setTouched(false); setResult(null) }
    reader.readAsText(f)
  }

  async function runImport() {
    if (!good.length || importing) return
    setImporting(true); setErr('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const email = user?.email || null

      // Payees first, so every imported row can point at a real directory
      // entry rather than only carrying a name string.
      const { data: existing } = await supabase.from('payment_payees').select('id, name')
      const byName = new Map((existing || []).map(p => [p.name.trim().toLowerCase(), p.id]))
      const missing = [...new Set(good.map(r => (r.payee_name || '').trim()).filter(Boolean))]
        .filter(n => !byName.has(n.toLowerCase()))
      if (missing.length) {
        const { data: made, error: mErr } = await supabase.from('payment_payees')
          .insert(missing.map(name => ({ name, created_by: email })))
          .select('id, name')
        if (mErr) throw mErr
        for (const p of made || []) byName.set(p.name.trim().toLowerCase(), p.id)
      }

      const payload = good.map(r => ({
        pid,
        paid_on: r.paid_on,
        category: r.category,
        payee_id: r.payee_name ? byName.get(r.payee_name.trim().toLowerCase()) || null : null,
        payee_name: r.payee_name,
        amount: r.amount,
        material_cost: r.material_cost,
        labour_cost: r.labour_cost,
        method: r.method,
        reference: r.reference,
        note: r.note,
        source: 'import',
        created_by: email,
      }))

      // Batched, so a large sheet does not ride on one enormous request.
      let done = 0
      for (let i = 0; i < payload.length; i += 200) {
        const { error } = await supabase.from('property_payments').insert(payload.slice(i, i + 200))
        if (error) throw error
        done += Math.min(200, payload.length - i)
      }
      setResult({ imported: done, payees: missing.length, skipped: bad.length })
    } catch (e) {
      setErr(e.message || String(e))
    }
    setImporting(false)
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56, paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)', borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => navigate(`/properties/${pid}/payments`)} aria-label="Back to payments"
          style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pulse-title" style={{ fontSize: 15.5 }}>Import payments</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>PID {pid}</div>
        </div>
      </header>

      <main style={{ width: '100%', maxWidth: 900, margin: '0 auto', padding: phone ? '14px 16px 60px' : '18px 20px 60px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {result ? (
          <div style={{ padding: '20px 18px', background: 'rgba(61,186,122,0.09)', border: '1px solid rgba(61,186,122,0.32)', borderRadius: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green, #3dba7a)' }}>
              {result.imported} payment{result.imported === 1 ? '' : 's'} imported
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)', marginTop: 7, lineHeight: 1.65, fontFamily: MONO }}>
              {result.payees > 0 && <>{result.payees} new payee{result.payees === 1 ? '' : 's'} added to the directory.<br /></>}
              {result.skipped > 0
                ? <>{result.skipped} row{result.skipped === 1 ? '' : 's'} could not be read and {result.skipped === 1 ? 'was' : 'were'} not imported. They are listed below — fix them in your sheet and import just those.</>
                : <>Every row in the file was imported.</>}
            </div>

            {/* The skipped rows have to survive the success screen. Reporting a
                count and then hiding which ones is how data quietly goes missing. */}
            {bad.length > 0 && (
              <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginBottom: 8 }}>
                  Not imported
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 220, overflowY: 'auto' }}>
                  {bad.map(r => (
                    <div key={r.line} style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
                      line {r.line} — {r.problems.join(', ')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 14 }}>
              <button onClick={() => navigate(`/properties/${pid}/payments`)}
                style={{ minHeight: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
                See the payments
              </button>
              <button onClick={() => { setResult(null); setRaw(''); setTouched(false) }}
                style={{ minHeight: 42, padding: '0 16px', borderRadius: 10, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, cursor: 'pointer', fontFamily: MONO }}>
                Import another file
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)', lineHeight: 1.6 }}>
                Export your sheet as CSV and drop it in, or paste the rows straight from the spreadsheet.
                Nothing is written until you have seen every row parsed.
              </div>
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile}
                style={{ ...box, padding: '9px 11px', fontSize: 12, cursor: 'pointer' }} />
              <textarea value={raw} onChange={e => { setRaw(e.target.value); setTouched(false); setResult(null) }} rows={5}
                placeholder={'Date,Amount,Category,Vendor\n12/07/2026,12400,Materials,Sharma Hardware'}
                style={{ ...box, fontFamily: MONO, fontSize: 12, resize: 'vertical' }} />
              {grid.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-dim, #9394a8)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={hasHeader} onChange={e => { setHasHeader(e.target.checked); setTouched(false) }}
                    style={{ width: 15, height: 15, accentColor: 'var(--accent, #c8963e)', cursor: 'pointer' }} />
                  First row is a header
                </label>
              )}
            </div>

            {grid.length > 0 && (
              <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                  Which column is what
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                  {FIELDS.map(f => (
                    <div key={f.key}>
                      <span style={{ fontSize: 10.5, color: f.required ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO, display: 'block', marginBottom: 5 }}>
                        {f.label}{f.required ? ' *' : ''}
                      </span>
                      <select value={mapping[f.key] ?? ''}
                        onChange={e => { setTouched(true); setMapping(m => ({ ...m, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) })) }}
                        style={{ ...box, padding: '8px 9px', fontSize: 12.5, cursor: 'pointer' }}>
                        <option value="">— not in file —</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                      </select>
                    </div>
                  ))}
                  <div>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, display: 'block', marginBottom: 5 }}>
                      Category if blank
                    </span>
                    <select value={defaultCategory} onChange={e => setDefaultCategory(e.target.value)}
                      style={{ ...box, padding: '8px 9px', fontSize: 12.5, cursor: 'pointer' }}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {parsed.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                  <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 11, padding: '12px 14px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Ready</div>
                    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{good.length}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{inr(goodTotal)}</div>
                  </div>
                  <div style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${bad.length ? 'var(--red, #e05c6a)' : 'var(--border, #2e3040)'}`, borderRadius: 11, padding: '12px 14px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Can’t read</div>
                    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: bad.length ? 'var(--red, #e05c6a)' : 'var(--text, #e8e8f0)' }}>{bad.length}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{bad.length ? 'will be skipped' : 'none'}</div>
                  </div>
                  <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 11, padding: '12px 14px' }}>
                    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Payees</div>
                    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{newPayees.length}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>added if new</div>
                  </div>
                </div>

                {bad.length > 0 && (
                  <div style={{ background: 'rgba(224,92,106,0.07)', border: '1px solid rgba(224,92,106,0.28)', borderRadius: 11, padding: 13 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--red, #e05c6a)', fontFamily: MONO, marginBottom: 8 }}>
                      These rows will be skipped
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
                      {bad.slice(0, 40).map(r => (
                        <div key={r.line} style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
                          line {r.line} — {r.problems.join(', ')}
                        </div>
                      ))}
                      {bad.length > 40 && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>…and {bad.length - 40} more</div>}
                    </div>
                  </div>
                )}

                <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px 0', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                    Preview — exactly as it will be stored
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 380 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                      <thead>
                        <tr>
                          <th style={head}>Line</th><th style={head}>Date</th>
                          <th style={{ ...head, textAlign: 'right' }}>Amount</th>
                          <th style={head}>Category</th><th style={head}>Paid to</th><th style={head}>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 100).map(r => (
                          <tr key={r.line} style={{ borderTop: '1px solid var(--border, #2e3040)', opacity: r.problems.length ? 0.45 : 1 }}>
                            <td style={{ ...cell, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{r.line}</td>
                            <td style={{ ...cell, fontFamily: MONO, color: r.paid_on ? 'var(--text, #e8e8f0)' : 'var(--red, #e05c6a)' }}>{r.paid_on ? fmtDate(r.paid_on) : '—'}</td>
                            <td style={{ ...cell, textAlign: 'right', fontFamily: MONO, color: r.amount ? 'var(--text, #e8e8f0)' : 'var(--red, #e05c6a)' }}>{r.amount ? inr(r.amount) : '—'}</td>
                            <td style={cell}>{r.category}</td>
                            <td style={cell}>{r.payee_name || <span style={{ color: 'var(--text-muted, #6b6d82)' }}>—</span>}</td>
                            <td style={{ ...cell, whiteSpace: 'normal', maxWidth: 220, color: 'var(--text-muted, #6b6d82)' }}>{r.note || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsed.length > 100 && (
                    <div style={{ padding: '9px 14px', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, borderTop: '1px solid var(--border, #2e3040)' }}>
                      Showing the first 100 of {parsed.length}. All {good.length} readable rows will be imported.
                    </div>
                  )}
                </div>

                {err && (
                  <div style={{ padding: '11px 13px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO, lineHeight: 1.5 }}>
                    Import failed: {err}
                  </div>
                )}

                <button onClick={runImport} disabled={!good.length || importing}
                  style={{
                    alignSelf: 'flex-start', minHeight: 46, padding: '0 20px', borderRadius: 10, border: 'none',
                    fontSize: 14, fontWeight: 700, fontFamily: SANS,
                    background: good.length ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
                    color: good.length ? '#1a1408' : 'var(--text-muted, #6b6d82)',
                    cursor: importing ? 'wait' : good.length ? 'pointer' : 'not-allowed',
                  }}>
                  {importing ? 'Importing…' : `Import ${good.length} payment${good.length === 1 ? '' : 's'} · ${inr(goodTotal)}`}
                </button>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
