import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtDate, initials, avatarColor } from '../../utils/vendorHub'
import { CATEGORIES, CONDITIONS } from '../../utils/assetMeta'
import CaptureUpload from '../../components/vendor/CaptureUpload'
import { assetFolder, IMAGE_ONLY } from '../../utils/assetFiles'
import AssetStatusChip from './AssetStatusChip'

// Log an asset, and hand it to a vendor by their email.
//
// The email is the join: staff type the address the vendor gave at onboarding
// and it is matched against vendors.email. The match is resolved and shown
// before saving — an asset silently assigned to nobody, or to the wrong
// person because of a typo, is worse than one not assigned at all.

const MONO = 'var(--font-mono, monospace)'
const norm = v => (v || '').trim().toLowerCase()

function Row({ label, children, hint }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, lineHeight: 1.45 }}>{hint}</span>}
    </label>
  )
}

const inputStyle = {
  width: '100%', minHeight: 44, padding: '10px 12px', boxSizing: 'border-box',
  background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)',
  borderRadius: 9, color: 'var(--text, #e8e8f0)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
}

export default function AssetFormSheet({ mode, asset, vendors, actor, onClose, onSaved }) {
  const editing = mode === 'edit'
  const [f, setF] = useState(() => ({
    name: asset?.name || '', category: asset?.category || 'Tool',
    asset_tag: asset?.asset_tag || '', serial_no: asset?.serial_no || '',
    make: asset?.make || '', model: asset?.model || '',
    condition: asset?.condition || 'good',
    purchase_date: asset?.purchase_date || '', value: asset?.value ?? '',
    invoice_no: asset?.invoice_no || '',
    notes: asset?.notes || '',
  }))
  const [invoicePath, setInvoicePath] = useState(asset?.invoice_doc_path || null)
  const [photoPath, setPhotoPath] = useState(asset?.photo_path || null)
  const [email, setEmail] = useState(asset?.assigned_email || '')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [events, setEvents] = useState([])
  const [pickedId, setPickedId] = useState(asset?.vendor_id || null)

  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  // Resolve the email against the roster as it is typed, so the person is
  // confirmed on screen before anything is saved.
  //
  // Only on-roll vendors are eligible: an address can also belong to a
  // rejected or removed application, and company kit should not be issued to
  // one. Emails are not unique in this table either — find() would silently
  // pick whichever row came back first — so more than one live match asks
  // rather than guesses.
  const emailEntered = !!email.trim()
  const candidates = emailEntered ? vendors.filter(v => norm(v.email) === norm(email)) : []
  const eligible = candidates.filter(v => v.status === 'approved')
  const match = pickedId
    ? eligible.find(v => v.id === pickedId) || null
    : (eligible.length === 1 ? eligible[0] : null)
  const ambiguous = eligible.length > 1 && !match
  const onlyIneligible = candidates.length > 0 && eligible.length === 0
  const holder = asset?.vendor_id ? vendors.find(v => v.id === asset.vendor_id) : null

  useEffect(() => {
    if (!editing || !asset?.id) return
    supabase.from('vendor_asset_events').select('*').eq('asset_id', asset.id)
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setEvents(data || []))
  }, [editing, asset?.id])

  async function logEvent(assetId, action, note, vendorId) {
    // Best effort: the history is valuable but must never block the change
    // itself, and the table may not exist on an older database.
    await supabase.from('vendor_asset_events')
      .insert({ asset_id: assetId, vendor_id: vendorId || null, action, note: note || null, actor })
      .then(({ error }) => { if (error) console.warn('[asset event]', error.message) })
  }

  async function save() {
    setErr('')
    if (!f.name.trim()) { setErr('Give the asset a name.'); return }
    if (emailEntered && !match) {
      setErr(ambiguous ? 'More than one on-roll vendor uses that email — choose which one.'
        : onlyIneligible ? `That email belongs to ${candidates[0].full_name}, who is ${candidates[0].status} — not on the roster.`
        : `No vendor on the roster has the email ${email.trim()}. Check it, or clear the field to leave the asset in stores.`)
      return
    }

    setBusy('save')
    const base = {
      name: f.name.trim(),
      category: f.category,
      asset_tag: f.asset_tag.trim() || null,
      serial_no: f.serial_no.trim() || null,
      make: f.make.trim() || null,
      model: f.model.trim() || null,
      condition: f.condition,
      purchase_date: f.purchase_date || null,
      value: f.value === '' ? null : Number(f.value),
      invoice_no: f.invoice_no.trim() || null,
      invoice_doc_path: invoicePath,
      photo_path: photoPath,
      notes: f.notes.trim() || null,
    }

    // Assignment only changes when the resolved vendor actually changes, so
    // editing a serial number does not silently restamp assigned_at.
    const nextVendor = match ? match.id : null
    const changedHolder = (asset?.vendor_id || null) !== nextVendor
    const assignment = changedHolder
      ? nextVendor
        ? { vendor_id: nextVendor, assigned_email: email.trim(), assigned_at: new Date().toISOString(), assigned_by: actor, status: 'assigned', returned_at: null, return_note: null }
        : { vendor_id: null, assigned_email: null, assigned_at: null, status: 'in_stores' }
      : {}

    if (editing) {
      const { error } = await supabase.from('vendor_assets').update({ ...base, ...assignment }).eq('id', asset.id)
      setBusy('')
      if (error) { setErr(friendly(error.message)); return }
      if (changedHolder) await logEvent(asset.id, nextVendor ? 'assigned' : 'returned', nextVendor ? `Assigned to ${match.full_name}` : 'Returned to stores', nextVendor)
      else await logEvent(asset.id, 'updated', 'Details updated', asset.vendor_id)
      onSaved()
    } else {
      const { data, error } = await supabase.from('vendor_assets')
        .insert({ ...base, ...assignment, created_by: actor }).select().maybeSingle()
      setBusy('')
      if (error) { setErr(friendly(error.message)); return }
      if (data?.id) {
        await logEvent(data.id, 'logged', 'Asset logged', null)
        if (nextVendor) await logEvent(data.id, 'assigned', `Assigned to ${match.full_name}`, nextVendor)
      }
      onSaved()
    }
  }

  async function mark(status, note) {
    setBusy(status); setErr('')
    const patch = { status }
    if (status === 'returned') { patch.returned_at = new Date().toISOString(); patch.return_note = note || null; patch.vendor_id = null; patch.assigned_email = null }
    const { error } = await supabase.from('vendor_assets').update(patch).eq('id', asset.id)
    setBusy('')
    if (error) { setErr(error.message); return }
    await logEvent(asset.id, status === 'returned' ? 'returned' : status, note || null, asset.vendor_id)
    onSaved()
  }

  async function remove() {
    setBusy('delete'); setErr('')
    const { error } = await supabase.from('vendor_assets').delete().eq('id', asset.id)
    setBusy('')
    if (error) { setErr('Could not delete: ' + error.message); return }
    onSaved()
  }

  function friendly(msg) {
    if (/vendor_assets_serial_uniq/.test(msg)) return `Serial number ${f.serial_no.trim()} is already logged against another asset.`
    if (/vendor_assets_tag_uniq/.test(msg)) return `Tag ${f.asset_tag.trim()} is already in use.`
    if (/relation|does not exist|schema cache/i.test(msg)) return 'The assets table does not exist yet — run supabase/migrations/vendor_assets.sql.'
    return msg
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: 'var(--bg-panel, #1e2028)', borderRadius: '16px 16px 0 0', maxHeight: '93vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.22s ease-out' }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 4px', flexShrink: 0 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px 14px', borderBottom: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>{editing ? 'Asset' : 'Log an asset'}</div>
            {editing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <AssetStatusChip status={asset.status} />
                {holder && <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>with {holder.full_name}</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontSize: 15 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 18px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row label="What is it"><input value={f.name} onChange={set('name')} placeholder="e.g. Cordless drill" style={inputStyle} /></Row>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}>
              <Row label="Category">
                <select value={f.category} onChange={set('category')} style={{ ...inputStyle, appearance: 'none' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Row>
            </div>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}>
              <Row label="Condition">
                <select value={f.condition} onChange={set('condition')} style={{ ...inputStyle, appearance: 'none' }}>
                  {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Row>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}>
              <Row label="Serial number" hint="Logged once — a repeat is refused">
                <input value={f.serial_no} onChange={set('serial_no')} placeholder="SL / IMEI" style={{ ...inputStyle, fontFamily: MONO }} autoCapitalize="characters" />
              </Row>
            </div>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}>
              <Row label="Asset tag"><input value={f.asset_tag} onChange={set('asset_tag')} placeholder="Internal tag" style={{ ...inputStyle, fontFamily: MONO }} autoCapitalize="characters" /></Row>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}><Row label="Make"><input value={f.make} onChange={set('make')} placeholder="e.g. Bosch" style={inputStyle} /></Row></div>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}><Row label="Model"><input value={f.model} onChange={set('model')} placeholder="e.g. GSB 550" style={inputStyle} /></Row></div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}><Row label="Purchased"><input type="date" value={f.purchase_date} onChange={set('purchase_date')} style={inputStyle} /></Row></div>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}><Row label="Value (₹)"><input value={f.value} onChange={set('value')} inputMode="decimal" placeholder="0" style={{ ...inputStyle, fontFamily: MONO }} /></Row></div>
          </div>

          {/* The bill behind the value. An asset carrying an amount with
              nothing backing it is the wrong way round for a warranty claim. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px', minWidth: 0 }}>
              <Row label="Invoice no."><input value={f.invoice_no} onChange={set('invoice_no')} placeholder="Bill number" style={{ ...inputStyle, fontFamily: MONO }} /></Row>
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <Row label="Invoice copy">
                <CaptureUpload supabase={supabase} folder={assetFolder(`staff/${asset?.id || 'new'}`)} name="invoice"
                  hint="Photo of the bill, or a PDF" camTitle="Photograph the invoice"
                  doneLabel="Invoice attached"
                  value={invoicePath} onChange={setInvoicePath} />
              </Row>
            </div>
          </div>

          {/* What it looks like. Worth more than a condition dropdown when
              something comes back scratched and nobody can say whether it
              went out that way. */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <Row label="Photo of the item">
                <CaptureUpload supabase={supabase} folder={assetFolder(`staff/${asset?.id || 'new'}`)} name="item"
                  accept={IMAGE_ONLY} hint="A clear photo of the item"
                  camTitle="Photograph the item" doneLabel="Photo attached"
                  value={photoPath} onChange={setPhotoPath} />
              </Row>
            </div>
          </div>

          {/* the join */}
          <div style={{ padding: '12px 13px', borderRadius: 10, background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Row label="Assign to vendor — by email" hint="The address they gave at onboarding. Leave blank to keep it in stores.">
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" inputMode="email"
                autoCapitalize="none" autoCorrect="off" placeholder="name@example.com"
                style={{ ...inputStyle, background: 'var(--bg, #16171f)' }} />
            </Row>
            {emailEntered && (match ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, background: 'rgba(61,186,122,0.10)', border: '1px solid rgba(61,186,122,0.32)' }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: MONO, background: avatarColor(match.full_name) + '22', color: avatarColor(match.full_name) }}>{initials(match.full_name)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green, #3dba7a)' }}>{match.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{[match.vendor_code, match.trade, match.status].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
            ) : ambiguous ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11.5, color: 'var(--accent, #c8963e)', fontFamily: MONO, lineHeight: 1.5 }}>
                  {eligible.length} on-roll vendors share this email — pick the one holding it.
                </div>
                {eligible.map(v => (
                  <button key={v.id} type="button" onClick={() => setPickedId(v.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', minHeight: 44, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', background: 'var(--bg, #16171f)', border: '1px solid var(--border, #2e3040)' }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, fontFamily: MONO, background: avatarColor(v.full_name) + '22', color: avatarColor(v.full_name) }}>{initials(v.full_name)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{v.full_name}</span>
                      <span style={{ display: 'block', fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>{[v.vendor_code, v.trade].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : onlyIneligible ? (
              <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', fontSize: 11.5, color: '#e8697a', fontFamily: MONO, lineHeight: 1.5 }}>
                That email belongs to {candidates[0].full_name}, who is {candidates[0].status} — not on the roster. Assets can only be issued to on-roll vendors.
              </div>
            ) : (
              <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', fontSize: 11.5, color: '#e8697a', fontFamily: MONO, lineHeight: 1.5 }}>
                No vendor on the roster has this email. Check the spelling — assignment is refused until it matches.
              </div>
            ))}
          </div>

          <Row label="Notes"><textarea value={f.notes} onChange={set('notes')} rows={2} placeholder="Anything worth recording" style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }} /></Row>

          {editing && events.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>History</span>
              {events.map(ev => (
                <div key={ev.id} style={{ display: 'flex', gap: 8, fontSize: 11, fontFamily: MONO, color: 'var(--text-muted, #6b6d82)' }}>
                  <span style={{ color: 'var(--text-dim, #9394a8)', minWidth: 74 }}>{fmtDate(ev.created_at)}</span>
                  <span style={{ color: 'var(--accent, #c8963e)', minWidth: 62 }}>{ev.action}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{ev.note || ''}{ev.actor ? ` · ${ev.actor}` : ''}</span>
                </div>
              ))}
            </div>
          )}

          {editing && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {asset.status === 'assigned' && (
                <button type="button" onClick={() => mark('returned')} disabled={!!busy} className="tct tct-raised"
                  style={{ minHeight: 40, padding: '0 13px', fontSize: 12.5, cursor: 'pointer' }}>↩ Mark returned</button>
              )}
              <button type="button" onClick={() => mark('damaged')} disabled={!!busy} className="tct tct-raised"
                style={{ minHeight: 40, padding: '0 13px', fontSize: 12.5, cursor: 'pointer', color: 'var(--accent, #c8963e)' }}>Damaged</button>
              <button type="button" onClick={() => mark('lost')} disabled={!!busy} className="tct tct-raised"
                style={{ minHeight: 40, padding: '0 13px', fontSize: 12.5, cursor: 'pointer', color: 'var(--red, #e05c6a)' }}>Lost</button>
            </div>
          )}

          {err && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', fontSize: 12, color: '#e8697a', fontFamily: MONO, lineHeight: 1.5, wordBreak: 'break-word' }}>{err}</div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border, #2e3040)', padding: '12px 18px', paddingBottom: 'max(14px, env(safe-area-inset-bottom))', flexShrink: 0, display: 'flex', gap: 8, background: 'var(--bg-panel, #1e2028)' }}>
          {editing && (
            <button type="button" onClick={remove} disabled={!!busy}
              style={{ minHeight: 46, padding: '0 14px', borderRadius: 10, background: 'none', border: '1px solid var(--border, #2e3040)', color: 'var(--red, #e05c6a)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: MONO }}>
              {busy === 'delete' ? '…' : 'Delete'}
            </button>
          )}
          <button type="button" onClick={save} disabled={!!busy}
            style={{ flex: 1, minHeight: 46, borderRadius: 10, border: 'none', background: 'var(--accent, #c8963e)', color: '#1a1408', fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
            {busy === 'save' ? 'Saving…' : editing ? 'Save changes' : 'Log asset'}
          </button>
        </div>
      </div>
    </div>
  )
}
