import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

const SANS = 'var(--font-sans, Poppins, sans-serif)'
const MONO = 'var(--font-mono, monospace)'

// Inspection trades are free text; work orders use a fixed vocabulary. Anything
// not in this map — including the 'misc' value and NULL, which together account
// for the majority of untriaged rows — canonicalises to MISC rather than being
// dropped. A vendor arriving with an incomplete list is the failure to avoid.
const TRADE_MAP = {
  woodwork: 'Carpenter',
  carpentry: 'Carpenter',
  plumbing: 'Plumber',
  electrical: 'Electrician',
  cleaning: 'Cleaner',
  painting: 'Painter',
}
const MISC = 'Misc'
const canonTrade = (raw) => TRADE_MAP[(raw || '').trim().toLowerCase()] || MISC
const tradeLabel = (t) => (t === MISC ? 'Misc / untriaged' : t)
// display order: known trades first, misc last so it reads as the leftovers pile
const TRADE_ORDER = ['Carpenter', 'Electrician', 'Plumber', 'Painter', 'Cleaner', MISC]

const STATUS_TONE = {
  draft: { label: 'Draft', color: 'var(--text-muted, #6b6d82)' },
  assigned: { label: 'Assigned', color: 'var(--accent, #c8963e)' },
  in_progress: { label: 'In progress', color: '#6b8de6' },
  vendor_completed: { label: 'Vendor done', color: '#4dd9c0' },
  verified: { label: 'Verified', color: 'var(--green, #3dba7a)' },
}
const isClosed = (it) => it.status !== 'pending' && it.status !== 'disputed'

const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null)

// ── presentational pieces, hoisted ───────────────────────────────────────────
function ErrStrip({ children, onRetry }) {
  return (
    <div style={{ padding: '11px 13px', background: 'rgba(224,92,106,0.10)', border: '1px solid rgba(224,92,106,0.32)', borderRadius: 9, fontFamily: MONO }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--red, #e05c6a)' }}>⚠ {children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ marginTop: 8, fontSize: 11, color: 'var(--accent, #c8963e)', background: 'none', border: '1px solid var(--border, #2e3040)', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontFamily: MONO }}>Retry</button>
      )}
    </div>
  )
}

function StatusChip({ status }) {
  const s = STATUS_TONE[status] || STATUS_TONE.draft
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: s.color, border: `1px solid ${s.color}`, borderRadius: 10, padding: '2px 8px', fontFamily: MONO, whiteSpace: 'nowrap', flexShrink: 0 }}>{s.label}</span>
  )
}

function ItemRow({ item }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border, #2e3040)' }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, minWidth: 84, flexShrink: 0, paddingTop: 2 }}>{item.area || '—'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text, #e8e8f0)', lineHeight: 1.45, wordBreak: 'break-word' }}>{item.description}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {item.fix_type && <span>{item.fix_type}</span>}
          {item.material && <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{item.material}</span>}
          {item.quantity != null && <span>×{item.quantity}</span>}
        </div>
      </div>
      {item.status && (
        <span style={{ fontSize: 9.5, fontFamily: MONO, flexShrink: 0, color: isClosed(item) ? 'var(--green, #3dba7a)' : item.status === 'disputed' ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)' }}>
          {isClosed(item) ? 'closed' : item.status}
        </span>
      )}
    </div>
  )
}

function VendorPicker({ vendors, trade, value, onChange, disabled }) {
  // Rank by matching trade, never filter — a carpenter occasionally takes a misc job.
  const ranked = useMemo(() => {
    const t = (trade || '').toLowerCase()
    return [...vendors].sort((a, b) => {
      const am = (a.trade || '').toLowerCase() === t ? 0 : 1
      const bm = (b.trade || '').toLowerCase() === t ? 0 : 1
      return am - bm || (a.full_name || '').localeCompare(b.full_name || '')
    })
  }, [vendors, trade])

  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{ width: '100%', padding: '9px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit' }}>
      <option value="">Assign a vendor…</option>
      {ranked.map(v => (
        <option key={v.id} value={v.id}>
          {v.full_name}{v.trade ? ` · ${v.trade}` : ''}{(v.trade || '').toLowerCase() === (trade || '').toLowerCase() ? ' ✓' : ''}
        </option>
      ))}
    </select>
  )
}

const fieldLabel = { fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' }
const dateInput = { width: '100%', padding: '8px 10px', fontSize: 13, color: 'var(--text, #e8e8f0)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 7, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }

function TradeCard({ group, wo, vendors, busy, err, onCreate, onAssign, onDates, onCopy, copied }) {
  const [open, setOpen] = useState(false)
  const items = wo ? wo.items : group.items
  const closed = wo ? wo.items.filter(isClosed).length : 0

  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: group.trade === MISC ? 'var(--accent, #c8963e)' : 'var(--text, #e8e8f0)' }}>
          {tradeLabel(group.trade)}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
          {group.items.length} item{group.items.length === 1 ? '' : 's'}
        </span>
        {wo && <StatusChip status={wo.status} />}
        {wo && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>
            {closed} of {wo.items.length} closed
          </span>
        )}
      </div>

      {err && <ErrStrip>{err}</ErrStrip>}

      {!wo ? (
        <button type="button" onClick={onCreate} disabled={busy}
          style={{ alignSelf: 'flex-start', padding: '9px 15px', borderRadius: 8, border: '1px solid var(--accent, #c8963e)', background: 'rgba(200,150,62,0.10)', color: 'var(--accent, #c8963e)', fontSize: 12.5, fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: MONO }}>
          {busy ? 'Creating…' : 'Create work order'}
        </button>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <div>
              <label style={fieldLabel} htmlFor={`wo-vendor-${wo.id}`}>Vendor</label>
              <div id={`wo-vendor-${wo.id}`}>
                <VendorPicker vendors={vendors} trade={wo.trade} value={wo.vendor_id} onChange={onAssign} disabled={busy} />
              </div>
            </div>
            <div>
              <label style={fieldLabel} htmlFor={`wo-start-${wo.id}`}>Start</label>
              <input id={`wo-start-${wo.id}`} type="date" value={wo.scheduled_start || ''} disabled={busy}
                onChange={e => onDates({ scheduled_start: e.target.value || null })} style={dateInput} />
            </div>
            <div>
              <label style={fieldLabel} htmlFor={`wo-end-${wo.id}`}>End</label>
              <input id={`wo-end-${wo.id}`} type="date" value={wo.scheduled_end || ''} disabled={busy}
                onChange={e => onDates({ scheduled_end: e.target.value || null })} style={dateInput} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <button type="button" onClick={onCopy}
              style={{ padding: '8px 13px', borderRadius: 8, border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)', color: copied ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO }}>
              {copied ? '✓ Link copied' : 'Copy link'}
            </button>
            {wo.vendor_name && (
              <span style={{ fontSize: 11.5, color: 'var(--text-dim, #9394a8)', fontFamily: MONO }}>{wo.vendor_name}</span>
            )}
            {(wo.scheduled_start || wo.scheduled_end) && (
              <span style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
                {[fmtDate(wo.scheduled_start), fmtDate(wo.scheduled_end)].filter(Boolean).join(' → ')}
              </span>
            )}
            <button type="button" onClick={() => setOpen(o => !o)}
              style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
              {open ? 'Hide items' : `Show ${items.length} items`}
            </button>
          </div>
        </>
      )}

      {!wo && group.items.length > 0 && (
        <button type="button" onClick={() => setOpen(o => !o)}
          style={{ alignSelf: 'flex-start', padding: 0, background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 11.5, cursor: 'pointer', fontFamily: MONO }}>
          {open ? 'Hide items' : `Show ${group.items.length} items`}
        </button>
      )}

      {open && (
        <div>
          {items.map(it => <ItemRow key={it.id} item={it} />)}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function WorkOrdersSection({ pid }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)      // a successful read happened
  const [lineItems, setLineItems] = useState([])
  const [inspectionId, setInspectionId] = useState(null)
  const [orders, setOrders] = useState([])
  const [vendors, setVendors] = useState([])
  const [userEmail, setUserEmail] = useState(null)
  const [busyTrade, setBusyTrade] = useState('')
  const [rowErr, setRowErr] = useState({})
  const [copiedId, setCopiedId] = useState(null)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setUserEmail(user?.email || null)

      // No FK between properties and inspections — fetch separately and join here.
      const { data: insps, error: iErr } = await supabase
        .from('inspections').select('id, created_at').eq('pid', pid).order('created_at', { ascending: false })
      if (iErr) throw iErr

      // the newest inspection that actually carries line items
      let active = null, rows = []
      for (const insp of insps || []) {
        const { data: probe, error: pErr } = await supabase
          .from('inspection_line_items')
          .select('id, area, item_name, trade, issue_description, action, material_description, qty')
          .eq('inspection_id', insp.id)
        if (pErr) throw pErr
        if (probe?.length) { active = insp; rows = probe; break }
      }
      setInspectionId(active?.id || null)

      let media = []
      if (rows.length) {
        const { data: m, error: mErr } = await supabase
          .from('line_item_media').select('line_item_id, url, type, is_proof_video')
          .in('line_item_id', rows.map(r => r.id))
        if (mErr) throw mErr
        media = m || []
      }
      const firstPhoto = {}
      for (const m of media) {
        if (m.is_proof_video || m.type === 'video') continue
        if (!firstPhoto[m.line_item_id]) firstPhoto[m.line_item_id] = m.url
      }
      setLineItems(rows.map(r => ({ ...r, _photo: firstPhoto[r.id] || null })))

      const [{ data: wos, error: wErr }, { data: vends, error: vErr }] = await Promise.all([
        supabase.from('work_orders').select('*, work_order_items(id, area, description, fix_type, material, quantity, status, sort_order)')
          .eq('pid', pid).order('created_at', { ascending: true }),
        supabase.from('vendors').select('id, full_name, trade, vendor_code').eq('status', 'approved').order('full_name'),
      ])
      if (wErr) throw wErr
      if (vErr) throw vErr

      setOrders((wos || []).map(w => ({
        ...w,
        items: [...(w.work_order_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      })))
      setVendors(vends || [])
      setLoaded(true)
    } catch (e) {
      setError(e.message || String(e))
      setLoaded(false)
    }
    setLoading(false)
  }, [pid])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const groups = useMemo(() => {
    const map = new Map()
    for (const r of lineItems) {
      const t = canonTrade(r.trade)
      if (!map.has(t)) map.set(t, [])
      map.get(t).push(r)
    }
    return TRADE_ORDER
      .filter(t => map.has(t))
      .map(t => ({
        trade: t,
        items: map.get(t).map((r, i) => ({
          id: r.id,
          area: r.area,
          description: (r.issue_description || '').trim() || (r.item_name || '').trim() || 'Untitled item',
          fix_type: r.action,
          material: r.material_description,
          quantity: r.qty,
          photo_path: r._photo,
          sort_order: i,
        })),
      }))
  }, [lineItems])

  const orderByTrade = useMemo(() => {
    const m = {}
    for (const w of orders) if (!m[w.trade]) m[w.trade] = w
    return m
  }, [orders])

  const setErrFor = (trade, msg) => setRowErr(p => ({ ...p, [trade]: msg }))

  async function createOrder(group) {
    setBusyTrade(group.trade); setErrFor(group.trade, '')
    try {
      const { data: wo, error: e1 } = await supabase
        .from('work_orders')
        .insert({ pid, inspection_id: inspectionId, trade: group.trade })
        .select()
        .single()
      if (e1) throw e1

      // Snapshot, never read through: an inspection edited later must not change
      // a work order already in a vendor's hands. No cost field is ever copied.
      const payload = group.items.map(it => ({
        work_order_id: wo.id,
        inspection_line_item_id: it.id,
        area: it.area,
        description: it.description,
        fix_type: it.fix_type,
        material: it.material,
        quantity: it.quantity,
        photo_path: it.photo_path,
        sort_order: it.sort_order,
      }))
      if (payload.length) {
        const { error: e2 } = await supabase.from('work_order_items').insert(payload)
        if (e2) {
          // don't leave a headless work order behind
          await supabase.from('work_orders').delete().eq('id', wo.id)
          throw e2
        }
      }
      await load()
      setToast(`${tradeLabel(group.trade)} work order created`)
    } catch (e) {
      setErrFor(group.trade, e.message || String(e))
    }
    setBusyTrade('')
  }

  async function assignVendor(wo, vendorId) {
    setBusyTrade(wo.trade); setErrFor(wo.trade, '')
    try {
      const v = vendors.find(x => x.id === vendorId) || null
      const patch = {
        vendor_id: v ? v.id : null,
        vendor_name: v ? v.full_name : null,
        updated_at: new Date().toISOString(),
      }
      if (v && wo.status === 'draft') {
        patch.status = 'assigned'
        patch.issued_at = new Date().toISOString()
        patch.issued_by = userEmail
      }
      const { error: e } = await supabase.from('work_orders').update(patch).eq('id', wo.id)
      if (e) throw e
      await load()
    } catch (e) {
      setErrFor(wo.trade, e.message || String(e))
    }
    setBusyTrade('')
  }

  async function setDates(wo, patch) {
    setErrFor(wo.trade, '')
    try {
      const { error: e } = await supabase.from('work_orders')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', wo.id)
      if (e) throw e
      setOrders(prev => prev.map(w => (w.id === wo.id ? { ...w, ...patch } : w)))
    } catch (e) {
      setErrFor(wo.trade, e.message || String(e))
    }
  }

  async function copyLink(wo) {
    // Exactly this, no query string — it gets pasted into WhatsApp.
    const url = `${window.location.origin}/wo/${wo.token}`
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url; ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta); ta.focus(); ta.select()
        document.execCommand('copy'); document.body.removeChild(ta)
      }
      setCopiedId(wo.id); setTimeout(() => setCopiedId(null), 1600)
      setToast('Link copied')
    } catch (e) {
      setErrFor(wo.trade, `Couldn’t copy the link: ${e.message || e}`)
    }
  }

  return (
    <section style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 11, fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO, letterSpacing: '0.09em', textTransform: 'uppercase' }}>Work orders</span>
        {loaded && groups.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>
            {groups.length} trade{groups.length === 1 ? '' : 's'} · {lineItems.length} items
          </span>
        )}
      </div>

      {loading && <div style={{ padding: '20px 0', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: MONO }}>Loading…</div>}

      {!loading && error && <ErrStrip onRetry={load}>Couldn’t load work orders: {error}</ErrStrip>}

      {!loading && !error && loaded && groups.length === 0 && (
        <div style={{ padding: '28px 18px', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 11, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', fontWeight: 600 }}>No inspection items to schedule</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted, #6b6d82)', marginTop: 4, fontFamily: MONO }}>
            Work orders are built from this property’s inspection.
          </div>
        </div>
      )}

      {!loading && !error && groups.map(g => (
        <TradeCard
          key={g.trade}
          group={g}
          wo={orderByTrade[g.trade] || null}
          vendors={vendors}
          busy={busyTrade === g.trade}
          err={rowErr[g.trade]}
          copied={copiedId === orderByTrade[g.trade]?.id}
          onCreate={() => createOrder(g)}
          onAssign={(vid) => assignVendor(orderByTrade[g.trade], vid)}
          onDates={(patch) => setDates(orderByTrade[g.trade], patch)}
          onCopy={() => copyLink(orderByTrade[g.trade])}
        />
      ))}

      {toast && (
        <div style={{ position: 'fixed', bottom: 84, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, color: 'var(--text, #e8e8f0)', fontFamily: SANS, zIndex: 300, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>{toast}</div>
      )}
    </section>
  )
}
