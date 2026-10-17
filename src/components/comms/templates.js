import { COMPANY } from '../../utils/company'

// The messages Pulse drafts when the next action is "talk to someone".
//
// Pure functions. Each template takes the comms_context() object, the engine
// thread it is answering, and a few options, and returns
//   { audience, to: { name, phone, email }, subject, text, key, basedOn, missing }
// Nothing here sends. A person reads the text, edits it, copies it, and sends
// it from their own WhatsApp.
//
// Two audiences, two truths (brief §3). A vendor template reads ONLY
// ctx.work_orders[] and ctx.property.{name,address,pid}; it never touches
// ctx.property.landlord_* or ctx.estimate. A landlord template never reads a
// vendor's phone. Keep it that way: the context is split into those sections
// precisely so a mistake here is visible in the diff.
//
// Voice: landlords get a brief, factual note that leads with the fact and
// signs with a name; vendors get a working note from one professional to
// another. No "kindly", no "do the needful", no "rest assured", no emoji.
// Short enough to read at a glance on a phone.

export const BRAND = COMPANY.brand || 'Flent'
export const DEFAULT_ORIGIN = 'https://flent-fix.vercel.app'

// ─── thread code → template ───────────────────────────────────────────────────
// Only threads whose next action involves a person outside the office. Codes
// that are ours to do (estimate_draft, work_order_pending, qc_pending …) are
// absent on purpose: templateFor() returns null and the button renders nothing.
const THREAD_TEMPLATE = {
  estimate_sent:              ['chase_unopened_estimate', 'landlord'],
  estimate_viewed:            ['chase_silent_landlord',   'landlord'],
  landlord_partially_decided: ['chase_silent_landlord',   'landlord'],
  landlord_queried:           ['answer_query',            'landlord'],
  wo_scheduled:               ['tell_vendor_scheduled',   'vendor'],
  execution_day:              ['tell_vendor_scheduled',   'vendor'],
  wo_unscheduled:             ['tell_vendor_scheduled',   'vendor'],
  in_progress:                ['chase_vendor_open_items', 'vendor'],
  disputed:                   ['chase_vendor_open_items', 'vendor'],
  handover_unknown:           ['tell_landlord_complete',  'landlord'],
  handover_scheduled:         ['tell_landlord_complete',  'landlord'],
  handover_today:             ['tell_landlord_complete',  'landlord'],
  verified:                   ['tell_landlord_complete',  'landlord'],
  // journey engine v2 (pulse-journey-prompt.md)
  landlord_deciding:          ['chase_silent_landlord',   'landlord'],
  wo_awaiting_day:            ['tell_vendor_scheduled',   'vendor'],
  setup_day:                  ['tell_vendor_scheduled',   'vendor'],
  wo_undated:                 ['tell_vendor_scheduled',   'vendor'],
  vendors_on_site:            ['chase_vendor_open_items', 'vendor'],
  setup_in_progress:          ['chase_vendor_open_items', 'vendor'],
  wo_overdue:                 ['chase_vendor_open_items', 'vendor'],
  handover_pending:           ['tell_landlord_complete',  'landlord'],
}

/** → { key, audience } for a thread code, or null when nobody needs a message. */
export function templateFor(code) {
  const m = THREAD_TEMPLATE[code]
  return m ? { key: m[0], audience: m[1] } : null
}

// ─── small helpers ────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "5 Oct" — en-IN short form. */
export function shortDate(d) {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** "Sat 18 Oct" — for a day someone has to turn up on. */
export function dayDate(d) {
  if (!d) return ''
  const dt = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "today" · "yesterday" · "since Tuesday" · "9 days ago" · "over a month ago". Same ladder as Home2's ago(). */
export function waited(since, ageDays) {
  let days = ageDays
  if (days == null && since) days = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86400000))
  if (days == null) return ''
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7 && since) return `since ${WEEKDAYS[new Date(since).getDay()]}`
  if (days < 30) return `${days} days ago`
  if (days < 60) return 'over a month ago'
  return `${Math.round(days / 30)} months ago`
}

/** "98765 43210" — shown as text, never as a link. */
export function prettyPhone(p) {
  const d = String(p || '').replace(/\D/g, '').slice(-10)
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : (p || '')
}

const TITLES = new Set(['mr', 'mrs', 'ms', 'dr', 'shri', 'smt', 'sri'])

/** First name for a greeting. "Mr Rajesh Kumar" → "Rajesh"; "S Mahammad Ali" → "S Mahammad" (an initial alone is not a name). */
export function firstName(full) {
  let s = String(full || '').trim()
  if (!s) return ''
  if (!/[a-z]/.test(s)) s = s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, p, c) => p + c.toUpperCase())
  const parts = s.split(/\s+/).filter(Boolean)
  if (parts.length > 1 && TITLES.has(parts[0].replace(/\./g, '').toLowerCase())) parts.shift()
  if (!parts.length) return ''
  if (parts[0].replace(/\./g, '').length <= 2 && parts.length > 1) return `${parts[0]} ${parts[1]}`
  return parts[0]
}

// Item descriptions are typed on site: "Service of geyser. Tank cleaning and
// debris removal." A list of three of those needs each one on a short leash.
const cleanItem = (s, max = 44) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '')
  return t.length > max ? t.slice(0, max - 1).trimEnd().replace(/[.;,]+$/, '') + '…' : t
}

/** "Deep Cleaning, Pest Control and 16 more" — at most `max` names, each cut at `itemMax` chars. */
export function listNames(names, total, max = 3, itemMax = 44) {
  const arr = (names || []).map(s => cleanItem(s, itemMax)).filter(Boolean).slice(0, max)
  const n = total != null ? total : (names || []).length
  const rest = n - arr.length
  if (!arr.length) return ''
  const head = arr.length === 1 ? arr[0] : `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`
  return rest > 0 ? `${arr.join(', ')} and ${rest} more` : head
}

// "Carpenter" is a person; the thing they come to do is carpentry.
const TRADE_WORK = {
  carpenter: 'carpentry', electrician: 'electrical', plumber: 'plumbing', cleaner: 'cleaning', cleaning: 'cleaning',
  painter: 'painting', painting: 'painting', 'pest control': 'pest control', ac: 'AC', hvac: 'AC',
}
const NOT_A_TRADE = new Set(['misc', 'miscellaneous', 'other', 'others', 'n/a', 'na', 'unassigned', ''])
export function tradeWork(trade) {
  const raw = String(trade || '').trim().toLowerCase()
  if (NOT_A_TRADE.has(raw)) return 'work'
  const w = TRADE_WORK[raw] || raw
  return /\bwork$/.test(w) ? w : `${w} work`
}

const n = (k, one, many) => `${k} ${k === 1 ? one : (many || one + 's')}`
const oneLine = (s, max = 160) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}
const todayISO = () => new Date().toISOString().slice(0, 10)

// ─── picking the right work order for a vendor thread ─────────────────────────
// The engine's thread is per property; a property can have five work orders.
// Choose the one the thread is actually about. opts.workOrderId overrides.
export function pickWorkOrder(ctx, code, opts = {}) {
  const wos = (ctx?.work_orders || []).filter(w => w && w.vendor_name)
  if (!wos.length) return null
  if (opts.workOrderId) return wos.find(w => w.id === opts.workOrderId) || null
  const today = todayISO()
  const open = w => (w.open_count || 0) > 0 || (w.sent_back_count || 0) > 0
  const notDone = w => !['verified', 'vendor_completed'].includes(w.status)
  const by = (pred, sort) => { const c = wos.filter(pred); if (sort) c.sort(sort); return c[0] || null }
  switch (code) {
    case 'disputed':
      return by(w => (w.sent_back_count || 0) > 0, (a, b) => b.sent_back_count - a.sent_back_count)
    case 'in_progress':
    case 'vendors_on_site':
    case 'setup_in_progress':
    case 'wo_overdue':
      return by(w => open(w) && (w.status === 'in_progress' || (w.status === 'assigned' && w.scheduled_start && w.scheduled_start < today)),
                (a, b) => (b.open_count || 0) - (a.open_count || 0))
        || by(w => open(w) && notDone(w))
    case 'execution_day':
    case 'setup_day':
      return by(w => w.scheduled_start === today && notDone(w))
    case 'wo_scheduled':
    case 'wo_awaiting_day':
      return by(w => w.scheduled_start && w.scheduled_start >= today && notDone(w), (a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
    case 'wo_unscheduled':
    case 'wo_undated':
      return by(w => !w.scheduled_start && notDone(w))
    default:
      return by(w => open(w) && notDone(w)) || wos[0]
  }
}

// ─── the view-model every template starts from ────────────────────────────────
function base(ctx, thread, opts) {
  const pid = ctx?.pid || ctx?.property?.pid || ''
  const name = ctx?.property?.name || ''
  const origin = opts.origin || (typeof window !== 'undefined' && window.location && window.location.origin) || DEFAULT_ORIGIN
  const sender = String(opts.sender || '').trim()
  return {
    pid,
    home: name ? `${name} (${pid})` : `PID ${pid}`,
    address: ctx?.property?.address || '',
    origin,
    signoff: sender ? `— ${sender} from ${BRAND}` : `— ${BRAND}`,
    basedOn: thread ? { code: thread.code, label: thread.label, since: thread.since, age_days: thread.age_days, waited: waited(thread.since, thread.age_days) } : null,
  }
}

function landlordTo(ctx) {
  const p = ctx?.property || {}
  const missing = []
  if (!p.landlord_name) missing.push('name')
  if (!p.landlord_phone) missing.push('phone')
  return {
    to: { name: p.landlord_name || '', phone: p.landlord_phone || '', email: p.landlord_email || '', route: p.contact_route || `/properties/${p.pid || ''}`, source: p.contact_source || null },
    missing,
  }
}

function vendorTo(wo) {
  const missing = []
  if (!wo.vendor_phone) missing.push('phone')
  return { to: { name: wo.vendor_name || '', phone: wo.vendor_phone || '', route: null, source: 'vendor' }, missing }
}

const greetL = name => (name ? `Hi ${name},` : 'Hi,')   // landlord: newer relationship, a shade more formal
const greetV = name => (name ? `Hey ${name},` : 'Hey,')  // vendor: a working note between colleagues

// ─── LANGUAGES ────────────────────────────────────────────────────────────────
// Every string a reader sees lives here, keyed by language code. Templates
// below compute the facts (names, dates, counts, links) and hand them to
// LANG[lang][key](v). Only 'en' is filled.
//
// To add Hindi or Kannada: copy the 'en' block to 'hi' / 'kn', translate the
// strings, keep the v.* placeholders, and pass { lang: 'hi' } in opts (the
// sheet can grow a language toggle later). Dates come in already formatted
// (en-IN short form); greeting names are first names.
//
//   hi: {
//     chase_unopened_estimate: v => ({
//       subject: `${v.home} का एस्टिमेट`,
//       text: [`${v.greet} ${v.home} के बारे में एक छोटी बात।`, '', …].join('\n'),
//     }),
//     …
//   },
export const LANG = {
  en: {
    chase_unopened_estimate: v => ({
      subject: `Your estimate for ${v.home}`,
      text: [
        `${v.greet} quick one from ${BRAND} about your home at ${v.home}.`,
        '',
        `We sent the estimate on ${v.sentOn} (${v.waited}) and it hasn't been opened yet. ${n(v.nItems, 'item is', 'items are')} on it for you to look at.`
          + (v.validTill ? ` It's valid till ${v.validTill}.` : ''),
        '',
        `Here's the link: ${v.link}`,
        `Nothing gets scheduled until you approve, so a look when you have ten minutes keeps the dates on track.`,
        '',
        v.signoff,
      ].join('\n'),
    }),

    chase_silent_landlord: v => ({
      subject: `Your estimate for ${v.home}: ${n(v.nPending, 'item', 'items')} open`,
      text: [
        `${v.greet} quick one on your home at ${v.home}.`,
        '',
        v.nApproved > 0
          ? `You've approved ${v.nApproved} of ${v.nTotal} items so far; ${n(v.nPending, 'item is', 'items are')} still open${v.openSince ? ` since ${v.openSince}` : ''}`
            + (v.pendingList ? `: ${v.pendingList}.` : '.')
          : `You opened the estimate${v.openedOn ? ` on ${v.openedOn}` : ''}; ${n(v.nPending, 'item is', 'items are')} still waiting on a decision`
            + (v.pendingList ? `: ${v.pendingList}.` : '.'),
        '',
        `Link: ${v.link}`,
        `Anything on it that needs explaining, reply here and we'll clear it up. Once you approve, we schedule the work.`,
        '',
        v.signoff,
      ].join('\n'),
    }),

    answer_query: v => ({
      subject: `Your questions on the estimate for ${v.home}`,
      text: [
        `${v.greet} thanks for the ${v.nQ === 1 ? 'question' : 'questions'} on the estimate for ${v.home}. ${v.nQ === 1 ? 'Answer' : 'Answers'} below.`,
        '',
        ...v.questions.flatMap(q => [
          q.text ? `On ${q.item}, you asked: "${q.text}"` : `On ${q.item}:`,
          '[your answer]',
          '',
        ]),
        ...(v.nMore > 0 ? [`The other ${n(v.nMore, 'note', 'notes')} I'll answer on the estimate page itself.`, ''] : []),
        `The estimate is updated here: ${v.link}`,
        '',
        v.signoff,
      ].join('\n'),
    }),

    tell_vendor_scheduled: v => ({
      subject: v.when ? `${capitalise(v.work)} at ${v.home}: ${v.when}` : `${capitalise(v.work)} at ${v.home}: need a date`,
      text: [
        v.when
          ? `${v.greet} you're on for the ${v.work} at ${v.home} ${v.isToday ? `today, ${v.when}` : `on ${v.when}`}.`
          : `${v.greet} we've got you down for the ${v.work} at ${v.home} and need a date.`,
        ...(v.address ? [`Address: ${v.address}`] : []),
        '',
        v.nItems > 0
          ? `${n(v.nItems, 'item', 'items')} on the job sheet${v.itemList ? `: ${v.itemList}` : ''}.`
          : `The job sheet has the details.`,
        `Job sheet (open it on site and close each item as you finish): ${v.link}`,
        '',
        v.when
          ? (v.isToday ? `Message me if anything on site isn't as expected.` : `If the date doesn't work, tell me today.`)
          : `Which day this week works for you?`,
        '',
        v.signoff,
      ].join('\n'),
    }),

    chase_vendor_open_items: v => ({
      subject: `${capitalise(v.work)} at ${v.home}: ${n(v.nOpen + v.nSentBack, 'item', 'items')} open`,
      text: [
        v.nSentBack > 0
          ? `${v.greet} ${n(v.nSentBack, 'item', 'items')} from the ${v.work} at ${v.home} came back after checking and ${v.nSentBack === 1 ? 'needs' : 'need'} another go: ${v.sentBackList}.`
            + (v.nOpen > 0 ? ` ${n(v.nOpen, 'item is', 'items are')} also still open${v.openList ? `: ${v.openList}` : ''}.` : '')
          : `${v.greet} the ${v.work} at ${v.home} ${v.startedOn ? `started on ${v.startedOn}` : `has been running ${v.waited}`} and ${n(v.nOpen, 'item is', 'items are')} still open${v.openList ? `: ${v.openList}` : ''}.`,
        '',
        `Where does this stand? Close each item on the job sheet once it's done so we can check it the same day: ${v.link}`,
        '',
        v.signoff,
      ].join('\n'),
    }),

    tell_landlord_complete: v => ({
      subject: `${v.home}: work done and checked`,
      text: [
        `${v.greet} good news on your home at ${v.home}: the work is done and checked.`,
        '',
        v.tradeList
          ? `${v.tradeList}, all verified by our team${v.verifiedOn ? ` on ${v.verifiedOn}` : ''}.`
          : `Every item has been verified by our team${v.verifiedOn ? ` on ${v.verifiedOn}` : ''}.`,
        v.handoverToday ? `Handover is today.`
          : v.handoverOn ? `Handover is set for ${v.handoverOn}.`
          : `We'll confirm a handover date with you next.`,
        '',
        `Anything you'd like to see before then, say the word.`,
        '',
        v.signoff,
      ].join('\n'),
    }),
  },
  // hi: { … }   ← see the comment above
  // kn: { … }
}

const strings = (opts) => LANG[opts?.lang] || LANG.en

// ─── templates ────────────────────────────────────────────────────────────────
// (ctx, thread, opts) → { audience, to, subject, text, key, basedOn, missing }
// opts: { sender, origin, lang, workOrderId }

export function chase_unopened_estimate(ctx, thread, opts = {}) {
  const b = base(ctx, thread, opts)
  const { to, missing } = landlordTo(ctx)
  const e = ctx?.estimate
  if (!e || !e.share_token) return empty('landlord', 'chase_unopened_estimate', b, 'No estimate on this property yet.', to)
  const v = {
    ...b, greet: greetL(firstName(to.name)),
    sentOn: shortDate(e.sent_at) || shortDate(thread?.since),
    waited: waited(e.sent_at || thread?.since, e.age_since_sent_days ?? thread?.age_days),
    nItems: e.counts?.total ?? 0,
    validTill: e.valid_till ? shortDate(e.valid_till) : '',
    link: `${b.origin}/e/${e.share_token}`,
  }
  return out('landlord', 'chase_unopened_estimate', b, to, missing, strings(opts).chase_unopened_estimate(v))
}

export function chase_silent_landlord(ctx, thread, opts = {}) {
  const b = base(ctx, thread, opts)
  const { to, missing } = landlordTo(ctx)
  const e = ctx?.estimate
  if (!e || !e.share_token) return empty('landlord', 'chase_silent_landlord', b, 'No estimate on this property yet.', to)
  const c = e.counts || {}
  const v = {
    ...b, greet: greetL(firstName(to.name)),
    nPending: c.pending ?? 0, nApproved: c.approved ?? 0, nTotal: c.total ?? 0,
    pendingList: listNames(e.pending_names, c.pending ?? 0, 3),
    openedOn: shortDate(e.first_viewed_at),
    openSince: shortDate(thread?.since || e.approved_at || e.first_viewed_at),
    link: `${b.origin}/e/${e.share_token}`,
  }
  return out('landlord', 'chase_silent_landlord', b, to, missing, strings(opts).chase_silent_landlord(v))
}

export function answer_query(ctx, thread, opts = {}) {
  const b = base(ctx, thread, opts)
  const { to, missing } = landlordTo(ctx)
  const e = ctx?.estimate
  if (!e || !e.share_token) return empty('landlord', 'answer_query', b, 'No estimate on this property yet.', to)
  const looksLikeQuestion = q => !!q.reason_tag || /\?/.test(q.message || '')
  const open = (e.queried || []).filter(q => !q.answered)
  // real questions first, then the newest; "Ok" is a note, not a question
  open.sort((a, c) => (looksLikeQuestion(c) - looksLikeQuestion(a)) || String(c.asked_at).localeCompare(String(a.asked_at)))
  const picked = open.slice(0, 3)
  if (!picked.length) return empty('landlord', 'answer_query', b, 'Nothing from the landlord is waiting for an answer.', to)
  const v = {
    ...b, greet: greetL(firstName(to.name)),
    nQ: picked.length,
    questions: picked.map(q => ({ item: q.item_name || 'An item', text: oneLine(q.message) })),
    nMore: Math.max(0, (e.unanswered ?? open.length) - picked.length),
    link: `${b.origin}/e/${e.share_token}`,
  }
  return out('landlord', 'answer_query', b, to, missing, strings(opts).answer_query(v))
}

export function tell_vendor_scheduled(ctx, thread, opts = {}) {
  const b = base(ctx, thread, opts)
  const wo = pickWorkOrder(ctx, thread?.code || 'wo_scheduled', opts)
  if (!wo) return empty('vendor', 'tell_vendor_scheduled', b, 'No work order with a vendor on it yet.', null)
  const { to, missing } = vendorTo(wo)
  const isToday = !!wo.scheduled_start && wo.scheduled_start === todayISO()
  const v = {
    ...b, greet: greetV(firstName(wo.vendor_name)),
    work: tradeWork(wo.trade),
    when: wo.scheduled_start ? dayDate(wo.scheduled_start) : '',
    isToday,
    nItems: wo.open_count ?? (wo.open_items || []).length,
    itemList: listNames(wo.open_items, wo.open_count, 3),
    link: `${b.origin}/wo/${wo.token}`,
  }
  return out('vendor', 'tell_vendor_scheduled', b, to, missing, strings(opts).tell_vendor_scheduled(v), wo.id)
}

export function chase_vendor_open_items(ctx, thread, opts = {}) {
  const b = base(ctx, thread, opts)
  const wo = pickWorkOrder(ctx, thread?.code || 'in_progress', opts)
  if (!wo) return empty('vendor', 'chase_vendor_open_items', b, 'No work order with a vendor on it yet.', null)
  const { to, missing } = vendorTo(wo)
  const nOpen = wo.open_count ?? (wo.open_items || []).length
  const nSentBack = wo.sent_back_count ?? (wo.sent_back || []).length
  if (nOpen + nSentBack === 0) return empty('vendor', 'chase_vendor_open_items', b, `${wo.vendor_name} has nothing open on this job.`, to)
  const started = wo.scheduled_start && wo.scheduled_start <= todayISO() ? wo.scheduled_start : null
  const v = {
    ...b, greet: greetV(firstName(wo.vendor_name)),
    work: tradeWork(wo.trade),
    nOpen, nSentBack,
    openList: listNames(wo.open_items, nOpen, 3),
    sentBackList: listNames((wo.sent_back || []).map(s => s.reason ? `${cleanItem(s.description)} (${oneLine(s.reason, 60)})` : s.description), nSentBack, 3, 110),
    startedOn: shortDate(started),
    waited: waited(thread?.since, thread?.age_days),
    link: `${b.origin}/wo/${wo.token}`,
  }
  return out('vendor', 'chase_vendor_open_items', b, to, missing, strings(opts).chase_vendor_open_items(v), wo.id)
}

export function tell_landlord_complete(ctx, thread, opts = {}) {
  const b = base(ctx, thread, opts)
  const { to, missing } = landlordTo(ctx)
  const d = ctx?.done || {}
  const p = ctx?.property || {}
  // "Electrical, plumbing and cleaning work" — the noun once, at the end
  const trades = (d.verified_trades || []).map(t => tradeWork(t).replace(/ work$/, '')).filter(t => t && t !== 'work')
    .filter((t, i, a) => a.indexOf(t) === i)
  const tradeList = trades.length ? `${capitalise(listNames(trades, trades.length, 4))} work` : ''
  const v = {
    ...b, greet: greetL(firstName(to.name)),
    tradeList,
    verifiedOn: shortDate(d.last_verified_at),
    handoverToday: !!p.handover_date && p.handover_date === todayISO(),
    handoverOn: p.handover_date ? dayDate(p.handover_date) : '',
  }
  return out('landlord', 'tell_landlord_complete', b, to, missing, strings(opts).tell_landlord_complete(v))
}

const capitalise = s => (s ? s[0].toUpperCase() + s.slice(1) : s)

function out(audience, key, b, to, missing, { subject, text }, workOrderId) {
  return { audience, key, to, subject, text, missing, basedOn: b.basedOn, workOrderId: workOrderId || null, empty: null }
}
function empty(audience, key, b, reason, to) {
  return { audience, key, to, subject: '', text: '', missing: [], basedOn: b.basedOn, workOrderId: null, empty: reason }
}

export const TEMPLATES = {
  chase_unopened_estimate, chase_silent_landlord, answer_query,
  tell_vendor_scheduled, chase_vendor_open_items, tell_landlord_complete,
}

/**
 * The one call the hook makes: pick the template for a thread code and
 * render it from the context. Returns null when the code needs no message.
 */
export function buildDraft(ctx, code, opts = {}) {
  const t = templateFor(code)
  if (!t) return null
  // The engine's own thread when it is reporting one; otherwise the property's
  // headline stands in, so "based on" still says something true.
  const threads = ctx?.journey?.threads || []
  const thread = threads.find(x => x.code === code)
    || (ctx?.journey?.stage_code ? { code, label: ctx.journey.stage_label, since: ctx.journey.since, age_days: ctx.journey.age_days } : { code })
  return TEMPLATES[t.key](ctx, thread, opts)
}
