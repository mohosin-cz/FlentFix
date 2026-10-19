// One record, read whole.
//
// This is the centre of a record-keeping system — not a dashboard. Every field
// the table holds, what is missing from it, what it replaced and at what price,
// the other connections at the same property, and where the record came from.
//
// What is deliberately NOT here: a field-level history. Nothing in the database
// records who changed what, so a timeline would be invented, and an invented
// timeline is worse than none — people believe it.
import { useEffect, useState } from 'react'
import { typeLabel, typeColor, fmtDate, CYCLE_MONTHS, dueInfo } from '../../utils/propertyUtils'
import { money, monthlyOf, annualOf, completeness, missingOf, CORE_FIELDS, canonPlan, chainFor, daysSince } from '../../utils/utilitiesModel'
import UtilityIcon from '../UtilityIcon'
import { Pill, Meter } from './ui'
import { MONO, SANS, hint } from './uiStyles'

function Field({ label, children, missing }) {
  return (
    <>
      <dt style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', padding: '6px 0' }}>{label}</dt>
      <dd style={{ margin: 0, padding: '6px 0', fontSize: 12.5, borderBottom: '1px solid var(--border, #2e3040)', minWidth: 0, wordBreak: 'break-word',
        color: missing ? 'var(--red, #b0645b)' : 'var(--text, #e8e8f0)', fontStyle: missing ? 'italic' : 'normal' }}>
        {missing ? 'not recorded' : children}
      </dd>
    </>
  )
}

function SecTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 6px', fontSize: 9.5, letterSpacing: '0.09em',
      textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
      {children}{right}<span style={{ flex: 1, height: 1, background: 'var(--border, #2e3040)' }} />
    </div>
  )
}

const Stat = ({ k, v, s }) => (
  <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '9px 11px', minWidth: 0 }}>
    <div style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{k}</div>
    <div style={{ fontSize: 17, fontWeight: 800, marginTop: 3, fontFamily: MONO, color: 'var(--text, #e8e8f0)' }}>{v}</div>
    <div style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', marginTop: 2 }}>{s}</div>
  </div>
)

export default function UtilityRecordSheet({ row, allRows, phone, onClose, onOpen, onGoToProperty }) {
  // Keyed on the record id by the parent, so opening another record remounts
  // this and the credentials go back behind their dots on their own.
  const [reveal, setReveal] = useState(false)
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  if (!row) return null
  const miss = missingOf(row)
  const c = completeness(row)
  const chain = chainFor(row, allRows)
  const siblings = allRows.filter((r) => String(r.pid) === String(row.pid) && r.id !== row.id && r.utility_type !== row.utility_type)
  const canon = canonPlan(row.plan_type)
  const due = dueInfo(row)
  const age = daysSince(row.start_date)
  const touched = daysSince(row.updated_at)
  const secret = (v) => (reveal ? v : '•'.repeat(Math.min(10, String(v || '').length || 4)))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 320, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(8,9,13,0.55)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }} />
      <aside role="dialog" aria-label="Utility record" style={{ position: 'relative', width: phone ? '100%' : 'min(760px, 100%)', background: 'var(--bg, #16171f)',
        borderLeft: '1px solid var(--border, #2e3040)', boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,.5))', display: 'flex', flexDirection: 'column', fontFamily: SANS }}>
        <header style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '13px 16px', borderBottom: '1px solid var(--border, #2e3040)', background: 'var(--bg-panel, #1e2028)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <Pill><i style={{ display: 'inline-flex', color: typeColor(row) }}><UtilityIcon type={row.utility_type} size={11} /></i>{typeLabel(row)}</Pill>
              <Pill tone={row.status === 'active' ? 'ok' : row.status === 'unknown' ? 'warn' : row.status === 'cancelled' ? 'bad' : undefined}>{row.status || 'unknown'}</Pill>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '7px 0 0', letterSpacing: '-0.01em', color: 'var(--text, #e8e8f0)' }}>
              {row.provider || 'Provider not recorded'}{row.plan_type ? ` · ${row.plan_type}` : ''}
            </h2>
            <div style={{ ...hint, marginTop: 3 }}>
              PID <b style={{ fontFamily: MONO, color: 'var(--accent, #c8963e)' }}>{row.pid}</b>
              {row.prop?.name ? ` · ${row.prop.name}` : ' · no property record for this PID'}
              {row.prop?.address ? ` · ${row.prop.address}` : ''}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: '1px solid var(--border, #2e3040)',
            background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontSize: 15 }}>×</button>
        </header>

        <div style={{ overflowY: 'auto', padding: '14px 16px 44px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : 'repeat(auto-fit, minmax(126px, 1fr))', gap: 9 }}>
            <Stat k="Bill" v={Number(row.billing_amount) > 0 ? money(row.billing_amount) : '—'} s={row.billing_cycle || 'cycle not recorded'} />
            <Stat k="Per month" v={monthlyOf(row) ? money(monthlyOf(row)) : '—'} s={annualOf(row) ? `${money(annualOf(row))} a year` : 'cannot be derived'} />
            <Stat k="Completeness" v={<>{c}<span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)' }}>/{CORE_FIELDS.length}</span></>}
              s={miss.length ? `${miss.length} field${miss.length > 1 ? 's' : ''} missing` : 'nothing missing'} />
          </div>

          {miss.length > 0 && (
            <div style={{ marginTop: 12, background: 'var(--bg-panel, #1e2028)', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 10, padding: '11px 13px' }}>
              <div style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginBottom: 7 }}>
                What this record does not say
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {miss.map((m) => <Pill key={m.k} tone="bad">{m.label}</Pill>)}
              </div>
            </div>
          )}

          <SecTitle>Service</SecTitle>
          <dl style={dl(phone)}>
            <Field label="Provider" missing={!row.provider}>{row.provider}</Field>
            <Field label="Plan as typed" missing={!row.plan_type}><span style={{ fontFamily: MONO }}>{row.plan_type}</span></Field>
            <Field label="Plan normalised" missing={!canon}>
              {canon}{canon && row.plan_type !== canon && <span style={hint}> · differs from what was typed</span>}
            </Field>
            <Field label="Account number" missing={!row.account_number}><span style={{ fontFamily: MONO }}>{row.account_number}</span></Field>
            <Field label="Started" missing={!row.start_date}>
              <span style={{ fontFamily: MONO }}>{fmtDate(row.start_date)}</span>
              {age != null && <span style={hint}> · {Math.round(age / 30.4)} months ago</span>}
            </Field>
            {row.duration_raw && <Field label="Duration as recorded">{row.duration_raw}</Field>}
            {row.period_label && <Field label="Period label">{row.period_label}</Field>}
          </dl>

          <SecTitle>Billing</SecTitle>
          <dl style={dl(phone)}>
            <Field label="Amount" missing={!(Number(row.billing_amount) > 0)}><span style={{ fontFamily: MONO }}>{money(row.billing_amount)}</span></Field>
            <Field label="Cycle" missing={!row.billing_cycle}>
              {row.billing_cycle}
              {CYCLE_MONTHS[row.billing_cycle] && <span style={hint}> · every {CYCLE_MONTHS[row.billing_cycle]} month{CYCLE_MONTHS[row.billing_cycle] > 1 ? 's' : ''}</span>}
            </Field>
            <Field label="One-off cost">{Number(row.added_cost) ? <span style={{ fontFamily: MONO }}>{money(row.added_cost)}</span> : <span style={{ color: 'var(--text-muted, #6b6d82)' }}>none recorded</span>}</Field>
            <Field label="Payment mode">{row.payment_mode || <span style={{ color: 'var(--text-muted, #6b6d82)' }}>not recorded</span>}</Field>
            <Field label="Last recharge">
              {row.last_recharged_on
                ? <span style={{ fontFamily: MONO }}>{fmtDate(row.last_recharged_on)}</span>
                : <span style={{ color: 'var(--text-muted, #6b6d82)' }}>never logged — the countdown runs from the start date instead</span>}
            </Field>
            <Field label="Next recharge due">
              {due
                ? <>
                    <span style={{ fontFamily: MONO }}>{fmtDate(due.date)}</span>
                    <span style={{ color: due.color, marginLeft: 8 }}>
                      {due.overdue
                        ? (due.periodsLapsed > 1 ? `${due.periodsLapsed} periods overdue` : `overdue by ${-due.days} days`)
                        : due.days === 0 ? 'today' : `in ${due.days} days`}
                    </span>
                    {due.note && <div style={{ ...hint, marginTop: 3 }}>{due.note}</div>}
                  </>
                : <span style={{ color: 'var(--text-muted, #6b6d82)' }}>nothing to schedule — no start date or no cycle</span>}
            </Field>
            <Field label="Invoice" missing={!row.invoice_link}>
              {row.invoice_link && <a href={row.invoice_link} target="_blank" rel="noreferrer" style={{ color: 'var(--accent, #c8963e)' }}>Open the invoice ↗</a>}
            </Field>
          </dl>

          {row.utility_type === 'wifi' && (
            <>
              <SecTitle right={
                <button onClick={() => setReveal((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--accent, #c8963e)', cursor: 'pointer',
                  fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: MONO, padding: 0 }}>{reveal ? 'hide' : 'reveal'}</button>
              }>Access</SecTitle>
              <dl style={dl(phone)}>
                <Field label="SSID" missing={!row.ssid}><span style={{ fontFamily: MONO }}>{row.ssid}</span></Field>
                <Field label="WiFi password" missing={!row.wifi_password}><span style={{ fontFamily: MONO }}>{secret(row.wifi_password)}</span></Field>
                <Field label="Account password" missing={!row.password}><span style={{ fontFamily: MONO }}>{secret(row.password)}</span></Field>
                <Field label="Lockbox code" missing={!row.lockbox_code}><span style={{ fontFamily: MONO }}>{secret(row.lockbox_code)}</span></Field>
              </dl>
            </>
          )}

          {chain.length > 0 && (
            <>
              <SecTitle>The {typeLabel(row).toLowerCase()} record at this property over time</SecTitle>
              <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>
                {chain.map((x) => (
                  <button key={x.id} onClick={() => onOpen(x)} style={{ display: 'flex', gap: 10, alignItems: 'baseline', width: '100%', textAlign: 'left',
                    padding: '9px 13px', borderBottom: '1px solid var(--border, #2e3040)', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12.5, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>
                    <span style={{ fontFamily: MONO, color: 'var(--text-muted, #6b6d82)', flexShrink: 0 }}>{x.start_date ? x.start_date.slice(0, 7) : '—'}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{x.provider || '—'}{x.plan_type ? ` · ${x.plan_type}` : ''}</span>
                    <Pill tone={x.status === 'active' ? 'ok' : undefined}>{x.status}</Pill>
                    <span style={{ fontFamily: MONO, color: 'var(--text-dim, #9394a8)' }}>{Number(x.billing_amount) > 0 ? money(x.billing_amount) : '—'}</span>
                  </button>
                ))}
              </div>
              <div style={{ ...hint, marginTop: 6 }}>
                A superseded record is the only thing that remembers this property used to be on something else, at a different price.
              </div>
            </>
          )}

          {siblings.length > 0 && (
            <>
              <SecTitle>Everything else at PID {row.pid}</SecTitle>
              <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>
                {siblings.map((x) => (
                  <button key={x.id} onClick={() => onOpen(x)} style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left',
                    padding: '9px 13px', borderBottom: '1px solid var(--border, #2e3040)', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12.5, color: 'var(--text, #e8e8f0)', fontFamily: SANS }}>
                    <Pill><i style={{ display: 'inline-flex', color: typeColor(x) }}><UtilityIcon type={x.utility_type} size={11} /></i>{typeLabel(x)}</Pill>
                    <span style={{ flex: 1, minWidth: 0 }}>{x.provider || '—'}{x.plan_type ? ` · ${x.plan_type}` : ''}</span>
                    <span style={{ fontFamily: MONO, color: 'var(--text-dim, #9394a8)' }}>{Number(x.billing_amount) > 0 ? money(x.billing_amount) : '—'}</span>
                    <Meter row={x} />
                  </button>
                ))}
              </div>
            </>
          )}

          <SecTitle>Provenance</SecTitle>
          <dl style={dl(phone)}>
            <Field label="How it got here">{row.source || <span style={{ color: 'var(--text-muted, #6b6d82)' }}>not recorded</span>}</Field>
            <Field label="Entered by">{row.created_by || '—'}<span style={hint}> · {fmtDate(row.created_at)}</span></Field>
            <Field label="Last edited">
              <span style={{ fontFamily: MONO }}>{fmtDate(row.updated_at)}</span>
              {touched != null && <span style={hint}> · {touched} days ago</span>}
            </Field>
            <Field label="Notes">{row.notes || <span style={{ color: 'var(--text-muted, #6b6d82)' }}>none</span>}</Field>
          </dl>
          <div style={{ ...hint, marginTop: 8, lineHeight: 1.6 }}>
            Nothing records which field was changed, or by whom — only that the row was touched. Until that exists, &ldquo;last edited&rdquo; is
            the whole of this record&rsquo;s history.
          </div>

          {row.prop && (
            <button onClick={() => onGoToProperty(row.pid)} style={{ marginTop: 18, width: '100%', padding: '11px 0', borderRadius: 10,
              border: '1px solid rgba(200,150,62,0.35)', background: 'rgba(200,150,62,0.1)', color: 'var(--accent, #c8963e)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SANS }}>
              Open PID {row.pid} to edit this
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}

const dl = (phone) => ({
  display: 'grid',
  gridTemplateColumns: phone ? 'minmax(0, 1fr)' : '136px minmax(0, 1fr)',
  gap: phone ? 0 : '1px 12px',
  margin: 0,
})
