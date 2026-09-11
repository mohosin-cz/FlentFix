import { useState, useMemo } from 'react'
import { copyToClipboard } from '../../utils/vendorHub'

// A message for somebody completing a year, ready to send.
//
// Deliberately a copy button and an editable box rather than a "send" button:
// nothing in the app is the right channel for this. It goes out on WhatsApp,
// or read aloud, or in whatever thread the office already has with them — so
// the app's job is to write it and get out of the way.
//
// The text is editable before copying on purpose. A generated greeting is a
// starting point; whoever sends it knows the person and may want to say
// something specific, and a locked message would just get retyped elsewhere.

const MONO = 'var(--font-mono, monospace)'

const btn = {
  padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: MONO,
  cursor: 'pointer', border: '1px solid var(--border, #2e3040)',
  background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)',
  display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none',
}

// A joining date this old is not a long service record, it is a date of birth
// in the wrong field. One vendor already has January 1996 on their profile.
const EARLIEST_PLAUSIBLE = '2015-01-01'

// Same day-of-month, n years on. A 29 February joining date lands on 1 March
// in a non-leap year, so it gets pulled back to the 28th rather than drifting
// into the next month.
function anniversary(joinStr, n) {
  const [y, m, d] = String(joinStr).slice(0, 10).split('-').map(Number)
  const dt = new Date(y + n, m - 1, d)
  if (dt.getMonth() !== ((m - 1 + 12) % 12)) dt.setDate(0)
  dt.setHours(0, 0, 0, 0)
  return dt
}

const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }
const dayDiff = (a, b) => Math.round((a.getTime() - b.getTime()) / 86400000)
const longDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

// Names are stored however they were typed at onboarding, and several are in
// full capitals. Shouting somebody's name back at them in a congratulations
// message is worse than the inconsistency.
function niceName(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/[a-z]/.test(s)) return s
  return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p, c) => p + c.toUpperCase())
}

// How long after an anniversary it is still a thing you would send a message
// about, and how long before it you would already be getting ready to.
const RECENT_DAYS = 45
const SOON_DAYS = 31

function milestoneOf(joinStr) {
  if (!joinStr) return { kind: 'no-date' }
  if (String(joinStr).slice(0, 10) < EARLIEST_PLAUSIBLE) return { kind: 'implausible' }

  const today = startOfToday()
  let years = 0
  while (years < 60 && anniversary(joinStr, years + 1) <= today) years++

  const next = anniversary(joinStr, years + 1)
  const last = years > 0 ? anniversary(joinStr, years) : null
  const daysToNext = dayDiff(next, today)
  const daysSinceLast = last ? dayDiff(today, last) : null

  // The message is written about the anniversary nearest to now, which may be
  // the one just gone or the one about to arrive. Waiting for the exact day
  // would be useless: somebody due in a fortnight is precisely who you are
  // looking at when you decide to send something.
  const past = last && daysSinceLast <= RECENT_DAYS
  const soon = !past && daysToNext <= SOON_DAYS
  const mark = past ? { n: years, date: last, tense: 'past', away: daysSinceLast }
    : soon ? { n: years + 1, date: next, tense: 'future', away: daysToNext }
    : null

  return {
    kind: mark ? 'celebrate' : years > 0 ? 'between' : 'first-year',
    years, next, last, daysToNext, daysSinceLast, mark,
    thisMonth: !!mark && mark.date.getMonth() === today.getMonth() && mark.date.getFullYear() === today.getFullYear(),
  }
}

function defaultMessage(vendor, m) {
  const name = niceName(vendor.full_name)
  const n = m.mark.n
  const yrs = n === 1 ? 'one year' : `${n} years`
  // "Other" and "Misc" are placeholders for a trade nobody recorded, not
  // trades — "thank you for the work you do as an other" is worse than saying
  // nothing about the role at all.
  const raw = (vendor.trade || '').trim().toLowerCase()
  const trade = ['other', 'others', 'misc', 'miscellaneous', 'n/a', 'na', 'unassigned'].includes(raw) ? '' : raw
  return [
    `Congratulations, ${name}! 🎉`,
    '',
    m.mark.tense === 'past'
      ? `You have completed ${yrs} with Flent.`
      : `On ${longDate(m.mark.date)} you complete ${yrs} with Flent.`,
    // "the plumber work you do" — trade names are nouns for people, so
    // carpenter, cleaner and supervisor all read badly in front of "work".
    // Phrased as a role instead, which is grammatical for every trade
    // including ones nobody has added yet.
    trade
      ? `Thank you for the work you do as ${/^[aeiou]/i.test(trade) ? 'an' : 'a'} ${trade} — it keeps our properties running, and the team is glad to have you.`
      : 'Thank you for the work you put in — the team is glad to have you.',
    '',
    `Here's to the year ahead.`,
    '',
    '— Team Flent',
  ].join('\n')
}

export default function MilestoneCard({ vendor }) {
  const m = useMemo(() => milestoneOf(vendor.date_of_joining), [vendor.date_of_joining])
  const [draft, setDraft] = useState(() => (m.kind === 'celebrate' ? defaultMessage(vendor, m) : ''))
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  async function copy() {
    setFailed(false)
    const ok = await copyToClipboard(draft)
    if (!ok) { setFailed(true); return }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  if (m.kind === 'no-date') {
    return <Note>No joining date on record, so there is no anniversary to work from. Add one and this fills in.</Note>
  }

  if (m.kind === 'implausible') {
    return (
      <Note tone="amber">
        The joining date reads {longDate(anniversary(vendor.date_of_joining, 0))}, which would make this{' '}
        {new Date().getFullYear() - Number(String(vendor.date_of_joining).slice(0, 4))} years of service — almost certainly a
        date of birth typed into the joining field. Correct it before sending anybody a milestone message.
      </Note>
    )
  }

  // Nothing near enough to congratulate: say when it is rather than offering
  // a greeting that would be odd to send today.
  if (m.kind === 'first-year' || m.kind === 'between') {
    return (
      <Note>
        {m.kind === 'first-year' ? 'Still in their first year. One year on ' : `${m.years} year${m.years === 1 ? '' : 's'} in so far. Next is `}
        <strong style={{ color: 'var(--text-dim, #9394a8)' }}>{longDate(m.next)}</strong>
        {' '}— {m.daysToNext} day{m.daysToNext === 1 ? '' : 's'} away. The message appears here within a month of the date.
      </Note>
    )
  }

  const when = m.mark.away === 0 ? 'today'
    : m.mark.tense === 'past' ? `${m.mark.away} day${m.mark.away === 1 ? '' : 's'} ago`
    : `in ${m.mark.away} day${m.mark.away === 1 ? '' : 's'}`
  const wa = String(vendor.phone || '').replace(/\D/g, '').slice(-10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: m.thisMonth ? 'rgba(61,186,122,0.10)' : 'var(--bg-input, #252731)', border: `1px solid ${m.thisMonth ? 'rgba(61,186,122,0.35)' : 'var(--border, #2e3040)'}`, borderRadius: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 21, fontWeight: 800, fontFamily: MONO, color: m.thisMonth ? 'var(--green, #3dba7a)' : 'var(--text, #e8e8f0)', flexShrink: 0 }}>
          {m.mark.n}
        </span>
        <div style={{ flex: 1, minWidth: 120 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text, #e8e8f0)' }}>
            {m.mark.n === 1 ? 'One year' : `${m.mark.n} years`} with Flent
            {m.mark.tense === 'future' && <span style={{ color: 'var(--text-muted, #6b6d82)' }}> · coming up</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 2 }}>
            {longDate(m.mark.date)} · {when}
          </div>
        </div>
      </div>

      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={9}
        aria-label="Celebratory message"
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '11px 12px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text, #e8e8f0)', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />

      {failed && (
        <div style={{ fontSize: 11.5, color: 'var(--red, #e05c6a)', fontFamily: MONO }}>
          ⚠ Could not reach the clipboard. Select the text above and copy it manually.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={copy} disabled={!draft.trim()}
          style={{ ...btn, background: 'rgba(200,150,62,0.12)', borderColor: 'var(--accent, #c8963e)', color: copied ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)', opacity: draft.trim() ? 1 : 0.5 }}>
          {copied ? '✓ Copied' : 'Copy message'}
        </button>
        {wa.length === 10 && (
          <a href={`https://wa.me/91${wa}?text=${encodeURIComponent(draft)}`} target="_blank" rel="noreferrer"
            style={{ ...btn, background: 'rgba(37,211,102,0.10)', borderColor: 'rgba(37,211,102,0.42)', color: '#25d366' }}>
            WhatsApp it
          </a>
        )}
        <button type="button" onClick={() => setDraft(defaultMessage(vendor, m))} style={btn}>Reset text</button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
        Nothing is sent from here and nothing is recorded — edit it if you want, then copy it wherever you are sending it.
      </div>
    </div>
  )
}

function Note({ children, tone }) {
  const amber = tone === 'amber'
  return (
    <div style={{ padding: '11px 13px', background: amber ? 'rgba(200,150,62,0.10)' : 'var(--bg-input, #252731)', border: `1px ${amber ? 'solid rgba(200,150,62,0.30)' : 'dashed var(--border-dash, #3a3d52)'}`, borderRadius: 10, fontSize: 12, color: amber ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.6 }}>
      {children}
    </div>
  )
}
