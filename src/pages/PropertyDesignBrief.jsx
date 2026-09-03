import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ShareSheet from '../components/vendor/ShareSheet'
import BriefTranscript from '../components/property/BriefTranscript'
import DesignScopeSection from '../components/property/DesignScopeSection'
import { briefProgress } from '../utils/designerBrief'

// The staff side of the designer's brief.
//
// The tile used to hand over a link and nothing else, which meant the only way
// to read what she had written was to open her form as if you were her. This is
// the other half: her answers, and the controls over which of them become work.
//
// The two live on one screen deliberately. Deciding whether a shelf goes to the
// carpenter is a judgement about the sentence she wrote and the photo she took;
// making it from memory on a different page is how the wrong things get sent.

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

const fmtWhen = (s) => (s ? new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—')

export default function PropertyDesignBrief() {
  const navigate = useNavigate()
  const { pid } = useParams()

  const [brief, setBrief] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [share, setShare] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey(k => k + 1), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data, error } = await supabase.from('designer_brief')
        .select('*').eq('pid', pid).order('created_at', { ascending: false }).limit(1)
      if (!alive) return
      setBrief((data || [])[0] || null)
      setErr(error?.message || '')
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [pid, reloadKey])

  // Raising and re-sharing are the same call: the RPC hands back the existing
  // draft's token rather than minting a second one, so pressing this twice
  // cannot leave two live links for one property.
  async function raiseOrShare() {
    setBusy('link'); setErr('')
    const { data, error } = await supabase.rpc('designer_brief_start', { p_pid: pid })
    setBusy('')
    if (error) { setErr(error.message); return }
    setShare(`${window.location.origin}/db/${data.token}`)
    if (!brief) reload()
  }

  const prog = briefProgress(brief)
  const submitted = brief?.status === 'submitted'

  const card = { background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, padding: 14 }
  const btn = (primary) => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '0 15px', borderRadius: 9,
    border: primary ? 'none' : '1px solid var(--border, #2e3040)',
    background: primary ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)',
    color: primary ? '#16171f' : 'var(--text-dim, #9394a8)',
    fontSize: 13, fontWeight: primary ? 700 : 600, cursor: 'pointer', fontFamily: MONO,
  })

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: SANS, color: 'var(--text, #e8e8f0)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', minHeight: 56,
        paddingTop: 'env(safe-area-inset-top)', background: 'var(--bg-panel, #1e2028)',
        borderBottom: '1px solid var(--border, #2e3040)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate(`/properties/${pid}`)} aria-label="Back to property"
          style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pulse-title" style={{ fontSize: 15.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Design brief</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 1 }}>PID {pid}</div>
        </div>
        <button onClick={() => navigate(`/properties/${pid}/work-orders`)}
          title="The work orders these lines feed"
          style={{ minHeight: 38, padding: '0 13px', borderRadius: 9, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO, flexShrink: 0 }}>
          Work orders
        </button>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 860, margin: '0 auto', padding: '14px 16px calc(90px + env(safe-area-inset-bottom))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {err && (
          <div style={{ padding: '10px 12px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontSize: 12, color: 'var(--red, #e05c6a)', fontFamily: MONO, wordBreak: 'break-word' }}>⚠ {err}</div>
        )}

        {!loaded ? null : !brief ? (
          <div style={{ ...card, textAlign: 'center', padding: '32px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>No brief on this property yet</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.7, marginTop: 8, maxWidth: 420, marginInline: 'auto' }}>
              Raising one builds the form from this property’s inspection, so her rooms are spelled the same as the ops person’s. Then send her the link.
            </div>
            <button onClick={raiseOrShare} disabled={busy === 'link'} style={{ ...btn(true), marginTop: 16 }}>
              {busy === 'link' ? 'Raising…' : 'Raise the brief'}
            </button>
          </div>
        ) : (
          <>
            {/* ── status ─────────────────────────────────────────────── */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: MONO,
                  padding: '4px 9px', borderRadius: 6,
                  color: submitted ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)',
                  background: submitted ? 'rgba(61,186,122,0.12)' : 'rgba(200,150,62,0.12)',
                }}>{submitted ? 'Submitted' : 'Open with her'}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-dim, #9394a8)' }}>
                  {brief.designer_name || 'No name given'}{brief.designer_phone ? ` · ${brief.designer_phone}` : ''}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginTop: 13 }}>
                {[
                  ['Areas answered', `${prog.filled} of ${prog.areas}`],
                  ['Photos', String(prog.photos)],
                  ['Layout', brief.layout || '—'],
                  [submitted ? 'Submitted' : 'Last saved', fmtWhen(submitted ? brief.submitted_at : brief.updated_at)],
                ].map(([label, value]) => (
                  <div key={label} style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button onClick={raiseOrShare} disabled={busy === 'link'} style={btn(!submitted)}>
                  {busy === 'link' ? 'Fetching…' : submitted ? 'Get the link again' : 'Send her the link'}
                </button>
                <button onClick={reload} style={btn(false)}>Refresh</button>
              </div>
              {!submitted && (
                <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.55, marginTop: 10 }}>
                  She can still be typing — the form saves as she goes, so what is below is whatever she had written when this page loaded.
                </div>
              )}
            </div>

            {/* ── what she was asked, and what she said ───────────────── */}
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 11 }}>Her answers</div>
              <BriefTranscript brief={brief} />
            </div>
          </>
        )}

        {/* The scope lives below her words on the same screen, and carries its
            own per-line ticks — nothing goes to a vendor by being asked for. */}
        <DesignScopeSection pid={pid} showBrief={false} />
      </main>

      {share && (
        <ShareSheet
          title="Design brief"
          subtitle={`Send this to the designer for PID ${pid}. It saves as she fills it.`}
          url={share}
          onClose={() => setShare(null)} />
      )}
    </div>
  )
}
