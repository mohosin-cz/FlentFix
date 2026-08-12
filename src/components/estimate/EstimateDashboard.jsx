import { useMemo } from 'react'
import { fmt, itemTot, getScore, barCol, ago } from '../../utils/estimateHelpers'
import { HIGH_VALUE_VIDEO_THRESHOLD } from '../../utils/proofVideo'

// Four cards, one question each:
//   Totals     — what does it cost?
//   Condition  — what state is the property in?
//   Readiness  — can this go out?
//   Owner      — what have they done with it?
//
// It was six, and two of them showed competing percentages side by side: "Send
// readiness 93%" (priced) next to "Owner decisions 100%" (approved) read as a
// contradiction at a glance. Pricing coverage and readiness were the same
// question asked twice, and the owner's decisions and their attention are one
// story, so each pair is now one card.

export default function EstimateDashboard({ items, mediaMap, openQueryCount = 0, estimate, views = [] }) {
  const g = useMemo(() => {
    let firm=0, mat=0, lab=0, p=0, a=0, n=0, nd=0, rep=0, rpr=0, ok=0, dp=0, ng=0, np=0, ss=0, scoredCount=0
    items.forEach(it => {
      const score = getScore(it)
      if (score != null) { ss += score; scoredCount++ }
      if (score != null && score <= 3) rep++; else if (score != null && score <= 6) rpr++; else if (score != null) ok++
      if (it.status === 'disputed') dp++
      const itMedia = mediaMap[it.line_item_id] || []
      const photos = itMedia.filter(m => m.type !== 'video' && !/\.(mp4|mov|webm)$/i.test(m.url)).length
      if (!photos && it.status !== 'excluded' && it.status !== 'removed') ng++
      if (it.status !== 'excluded' && it.status !== 'removed') {
        const t = ((parseFloat(it.material_cost)||0) + (parseFloat(it.labour_cost)||0)) * (it.qty||1)
        if (t >= HIGH_VALUE_VIDEO_THRESHOLD && !itMedia.some(m => m.is_proof_video)) np++
      }
      if (it.status === 'excluded' || it.status === 'removed') return
      if (it.cost_type === 'actuals') { a++ }
      else if (it.cost_type === 'nil') { n++ }
      else {
        const tot = itemTot(it)
        if (tot > 0) {
          p++; firm += tot
          mat += (it.material_cost||0) * (it.qty||1)
          lab += (it.labour_cost||0)  * (it.qty||1)
        } else { nd++ }
      }
    })
    const total  = items.filter(i => i.status !== 'removed').length
    const cond   = scoredCount > 0 ? (ss / scoredCount).toFixed(1) : null
    const matPct = mat+lab ? Math.round(mat/(mat+lab)*100) : 0
    const ready  = p+a+n
    const rpct   = total > 0 ? Math.round(ready/total*100) : 0
    return { firm, mat, lab, p, a, n, nd, rep, rpr, ok, dp, ng, np, cond, total, matPct, ready, rpct }
  }, [items, mediaMap])

  const stack = (c, col) => c && g.total
    ? <i key={col} style={{ width:`${Math.round(c/g.total*100)}%`,background:col }} />
    : null

  // Live items only: removed rows are gone, and an excluded row was never put
  // to the owner, so counting either would flatter or punish the percentage.
  const v = useMemo(() => {
    const live = items.filter(i => !['removed', 'excluded'].includes(i.status))
    const n = live.length
    const approved = live.filter(i => i.status === 'approved').length
    const disputed = live.filter(i => i.status === 'disputed').length
    const pct = (x) => (n > 0 ? Math.round(x / n * 100) : 0)
    return {
      live: n, approved, disputed, pending: n - approved - disputed,
      appPct: pct(approved), disPct: pct(disputed), penPct: pct(n - approved - disputed),
      firstViewed: estimate?.first_viewed_at || null,
      sinceFirst: ago(estimate?.first_viewed_at),
      lastViewed: views[0]?.created_at || null,
      sinceLast: ago(views[0]?.created_at),
      viewCount: views.length,
      ownerName: estimate?.approved_by_name || null,
      sent: !!estimate?.sent_at || estimate?.status !== 'draft',
    }
  }, [items, estimate, views])

  const blocked = openQueryCount > 0
  const displayRpct = blocked ? Math.min(g.rpct, 99) : g.rpct

  return (
    <div className="dash">
      {/* What does it cost? */}
      <div className="card">
        <div className="ct">Totals</div>
        <div className="big">₹{fmt(g.firm)}</div>
        <div className="splitbar">
          <i style={{ width:`${g.matPct}%`,background:'var(--blue)' }} />
          <i style={{ width:`${100-g.matPct}%`,background:'var(--gold)' }} />
        </div>
        <div className="mlrow"><span className="lbl"><span className="dot" style={{ background:'var(--blue)' }}/>Materials</span><span>₹{fmt(g.mat)}</span></div>
        <div className="mlrow"><span className="lbl"><span className="dot" style={{ background:'var(--gold)' }}/>Labour</span><span>₹{fmt(g.lab)}</span></div>
      </div>

      {/* What state is the property in? */}
      <div className="card">
        <div className="ct">Overall condition</div>
        <div className="condrow">
          <span className="condnum" style={{ color: g.cond ? barCol(parseFloat(g.cond)) : 'var(--faint)' }}>{g.cond ?? '—'}</span>
          <span className="dist">/ 10</span>
        </div>
        <div className="meter">
          {g.cond && <i style={{ width:`${parseFloat(g.cond)*10}%`,background:barCol(parseFloat(g.cond)) }} />}
        </div>
        <div className="dist">{g.rep} replace · {g.rpr} repair · {g.ok} ok</div>
      </div>

      {/* Can this go out? Coverage and readiness were the same question. */}
      <div className="card">
        <div className="ct">Readiness to send</div>
        <div className="condrow">
          <span className="condnum" style={{ color: blocked ? 'var(--amber)' : g.rpct === 100 ? 'var(--good)' : 'var(--ink)', fontSize:18 }}>{displayRpct}%</span>
          <span className="dist">{g.ready}/{g.total} costed</span>
        </div>
        <div className="stackbar" title={`${g.p} priced · ${g.a} on actuals · ${g.n} nil · ${g.nd} needs a cost`}>
          {stack(g.p, 'var(--gold)')}
          {stack(g.a, 'var(--teal)')}
          {stack(g.n, '#3a3f4b')}
          {stack(g.nd,'var(--amber)')}
        </div>
        <div className="legend">
          <span><span className="dot" style={{ background:'var(--gold)' }}/>Priced <b>{g.p}</b></span>
          <span><span className="dot" style={{ background:'var(--teal)' }}/>Actuals <b>{g.a}</b></span>
          <span><span className="dot" style={{ background:'#3a3f4b' }}/>Nil <b>{g.n}</b></span>
          {g.nd > 0 && <span><span className="dot" style={{ background:'var(--amber)' }}/>Needs <b>{g.nd}</b></span>}
        </div>
        {(blocked || g.ng > 0 || g.np > 0) && (
          <div className="flagrow">
            {blocked && <span style={{ color:'var(--amber)' }}>↩ {openQueryCount} quer{openQueryCount > 1 ? 'ies' : 'y'}</span>}
            {g.ng > 0 && <span>▤ No photo {g.ng}</span>}
            {g.np > 0 && <span style={{ color:'var(--amber)' }}>● No proof {g.np}</span>}
          </div>
        )}
      </div>

      {/* What has the owner done with it? Their decisions and their attention
          are one story — a 0% that has never been opened means something very
          different from a 0% opened nine times. */}
      <div className="card">
        <div className="ct">Owner</div>
        {v.firstViewed ? (
          <>
            <div className="condrow">
              <span className="condnum" style={{ color: v.appPct === 100 ? 'var(--good)' : v.disputed > 0 ? 'var(--clay,#e05c6a)' : 'var(--ink)', fontSize:18 }}>{v.appPct}%</span>
              <span className="dist">{v.approved}/{v.live} approved</span>
            </div>
            <div className="sbar" title={`${v.approved} approved · ${v.disputed} disputed · ${v.pending} awaiting`}>
              {v.approved > 0 && <i style={{ width:`${v.appPct}%`, background:'#5fae6e' }} />}
              {v.disputed > 0 && <i style={{ width:`${v.disPct}%`, background:'var(--clay,#e05c6a)' }} />}
              {v.pending  > 0 && <i style={{ width:`${v.penPct}%`, background:'var(--line2)' }} />}
            </div>
            <div className="slegend">
              <span style={{ color:'#6fc47f' }}><b>{v.approved}</b> approved</span>
              {v.disputed > 0 && <span style={{ color:'#e8697a' }}><b>{v.disputed}</b> disputed</span>}
              <span style={{ color:'var(--muted)' }}><b>{v.pending}</b> awaiting</span>
            </div>
            <div className="ownerfoot">
              opened {v.sinceFirst} ago · {v.viewCount} view{v.viewCount === 1 ? '' : 's'}
              {v.ownerName ? <> · <span style={{ color:'var(--ink2)' }}>{v.ownerName}</span></> : ''}
            </div>
          </>
        ) : (
          <>
            <div className="condrow">
              <span className="condnum" style={{ color:'var(--faint)', fontSize:18 }}>—</span>
              <span className="dist">{v.sent ? 'not opened yet' : 'not sent yet'}</span>
            </div>
            <div className="ownerfoot" style={{ marginTop:8 }}>
              {v.sent ? 'Sent, but the owner has not opened it.' : 'Nothing to report until this is sent.'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
