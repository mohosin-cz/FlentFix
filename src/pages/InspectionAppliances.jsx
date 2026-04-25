import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { uploadMediaFiles } from './InspectionOutdoor'
import {
  NavBar, Field, Input, Textarea, PillGroup,
  HealthSlider, AccordionCard, StickyFooter,
} from '../components/ui'
import QuickNotes from '../components/QuickNotes'

// ── Appliance definitions ─────────────────────────────────────────────────────
const APPLIANCES = [
  { name: 'Air Conditioner',      trade: 'electrical', components: ['Cooling performance', 'Compressor', 'Filter', 'Remote', 'Gas level', 'Drainage pipe', 'Indoor unit body', 'Outdoor unit body'] },
  { name: 'Refrigerator',         trade: 'electrical', components: ['Cooling performance', 'Door seal/gasket', 'Ice maker', 'Water dispenser', 'Interior light', 'Compressor noise', 'Door alignment', 'Body/exterior'] },
  { name: 'Geyser / Water Heater',trade: 'electrical', components: ['Heating element/coil', 'Thermostat', 'Tank/body', 'Inlet pipe', 'Outlet pipe', 'Safety valve', 'Electrical connections', 'Mounting'] },
  { name: 'Washing Machine',      trade: 'electrical', components: ['Drum/tub', 'Motor', 'Water inlet valve', 'Drain hose', 'Control panel', 'Door seal', 'Spin function', 'Vibration/noise'] },
  { name: 'Microwave / OTG',      trade: 'electrical', components: ['Heating function', 'Turntable', 'Door latch', 'Control panel', 'Interior light', 'Body/exterior'] },
  { name: 'Chimney / Hood',       trade: 'electrical', components: ['Suction performance', 'Motor', 'Filter (baffle/mesh)', 'Lights', 'Auto-clean function', 'Duct/pipe', 'Control panel', 'Body/exterior'] },
  { name: 'Hob / Cooktop',        trade: 'misc',       components: ['Burners (all)', 'Ignition', 'Gas knobs', 'Glass surface', 'Drip tray', 'Gas pipe connection'] },
  { name: 'Dishwasher',           trade: 'plumbing',   components: ['Wash cycle', 'Drain function', 'Door seal', 'Spray arms', 'Detergent dispenser', 'Control panel', 'Inlet hose', 'Body/exterior'] },
  { name: 'Oven (Built-in)',       trade: 'electrical', components: ['Heating element', 'Temperature control', 'Timer/display', 'Door hinge', 'Door seal', 'Interior light', 'Body/exterior'] },
  { name: 'Water Purifier / RO',  trade: 'plumbing',   components: ['Water output', 'Filter condition', 'Membrane', 'Storage tank', 'TDS level', 'Tap/faucet', 'Drainage pipe', 'Mounting'] },
  { name: 'TV',                   trade: 'electrical', components: ['Display/screen', 'Remote', 'HDMI/ports', 'Sound', 'Smart functions', 'Wall mount/stand', 'Power cable'] },
  { name: 'Inverter / UPS',       trade: 'electrical', components: ['Battery backup', 'Charging function', 'Output power', 'Display/indicator', 'Body/wiring', 'Battery condition'] },
]

// ── State helpers ─────────────────────────────────────────────────────────────
const blankComp        = () => ({ status: '', issueDescription: '', action: '', labourRateId: '', labourCost: '', materialCost: '' })
const blankAppliance   = () => ({ brand: '', model: '', notPresent: false, notPresentNote: '', health: null, notes: '', media: [], components: {}, customComponents: [] })
const BLANK_CUSTOM_COMP      = () => ({ id: `cc_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: '', ...blankComp() })
const BLANK_CUSTOM_APPLIANCE = () => ({ id: `ca_${Date.now()}_${Math.random().toString(36).slice(2)}`, customName: '', trade: 'electrical', ...blankAppliance() })

function appIsDone(d) { return d?.notPresent === true || d?.health !== null }

function stripFiles(obj) {
  if (obj instanceof File) return null
  if (Array.isArray(obj)) { if (obj.length && obj[0] instanceof File) return []; return obj.map(stripFiles) }
  if (obj && typeof obj === 'object') return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, stripFiles(v)]))
  return obj
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return override ?? base
  const result = { ...base }
  Object.keys(base).forEach(k => {
    if (!(k in override)) return
    if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k])) result[k] = deepMerge(base[k] ?? {}, override[k])
    else result[k] = override[k]
  })
  return result
}

// ── Thumb ─────────────────────────────────────────────────────────────────────
function Thumb({ file }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u) }, [file])
  if (!url) return null
  if (file.type.startsWith('video')) return <video src={url} muted playsInline style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />
  return <img src={url} alt="" style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />
}

// ── MediaUpload ───────────────────────────────────────────────────────────────
const SHEET_BTN = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%', padding: '12px 18px', border: '1px solid var(--border, #2e3040)', borderRadius: 8, background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

function MediaUpload({ files = [], onChange, label = 'Attach Photos / Videos' }) {
  const cameraRef  = useRef(null)
  const galleryRef = useRef(null)
  const [sheet, setSheet] = useState(false)
  function handleFiles(e) { const added = Array.from(e.target.files || []); if (added.length) onChange([...files, ...added]); e.target.value = ''; setSheet(false) }
  function remove(idx) { onChange(files.filter((_, i) => i !== idx)) }
  return (
    <div>
      <input ref={cameraRef}  type="file" accept="image/*,video/*" capture="environment" style={{ display: 'none' }} onChange={handleFiles} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" multiple            style={{ display: 'none' }} onChange={handleFiles} />
      <button type="button" onClick={() => setSheet(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: `1px dashed ${files.length ? 'var(--green, #3dba7a)' : 'var(--border-dash, #3a3d52)'}`, borderRadius: 6, background: files.length ? 'rgba(61,186,122,0.08)' : 'var(--bg-input, #252731)', fontSize: 13, fontWeight: 500, color: files.length ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'inherit' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 11v2a1 1 0 001 1h12a1 1 0 001-1v-2M8 1v9M5 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {label}
        {files.length > 0 && <span style={{ marginLeft: 'auto', background: 'var(--accent, #c8963e)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3 }}>{files.length}</span>}
      </button>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {files.map((file, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <Thumb file={file} />
              <button type="button" onClick={() => remove(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: 'var(--red, #e05c6a)', border: '2px solid var(--bg-panel, #1e2028)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>×</button>
            </div>
          ))}
        </div>
      )}
      {sheet && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }} onClick={() => setSheet(false)}>
          <div style={{ width: '100%', background: 'var(--bg-panel, #1e2028)', borderRadius: '12px 12px 0 0', padding: '8px 16px 36px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 18px' }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', marginBottom: 14, textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>{label}</div>
            <button type="button" onClick={() => cameraRef.current?.click()} style={SHEET_BTN}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M6.5 3h5l1.5 2H15a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1h1.5L6 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="9" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4"/></svg>
              take photo / video
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} style={{ ...SHEET_BTN, marginTop: 8 }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="6.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M2 12l4-4 3 3 2-2 5 5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
              choose from gallery
            </button>
            <button type="button" onClick={() => setSheet(false)} style={{ ...SHEET_BTN, marginTop: 14, color: 'var(--text-muted, #6b6d82)' }}>cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── SearchableDropdown ────────────────────────────────────────────────────────
function SearchableDropdown({ options, value, onChange, placeholder }) {
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function handleOutside(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') } }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])
  const selected = options.find(o => o.value === value)
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => { setOpen(p => !p); setSearch('') }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px', border: `1px solid ${value ? 'rgba(200,150,62,0.5)' : 'var(--border, #2e3040)'}`, borderRadius: 6, background: 'var(--bg-input, #252731)', fontSize: 12, color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'inherit' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.label : placeholder}</span>
        {selected && <span style={{ fontSize: 11, color: 'var(--accent, #c8963e)', whiteSpace: 'nowrap' }}>₹{selected.cost} / {selected.unit}</span>}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><path d="M2 4l4 4 4-4" stroke="#B0B0B0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, zIndex: 200, maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()} placeholder="Search…" style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-input, #252731)', border: 'none', borderBottom: '1px solid var(--border, #2e3040)', color: 'var(--text, #e8e8f0)', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          {filtered.map(o => (
            <div key={o.value} onClick={() => { onChange(o.value); setOpen(false); setSearch('') }}
              style={{ padding: '9px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, color: o.value === value ? 'var(--accent, #c8963e)' : 'var(--text, #e8e8f0)', background: o.value === value ? 'rgba(200,150,62,0.08)' : 'transparent' }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = o.value === value ? 'rgba(200,150,62,0.08)' : 'transparent' }}
            >
              <span>{o.label}</span>
              <span style={{ color: 'var(--text-muted, #6b6d82)', fontSize: 11, whiteSpace: 'nowrap' }}>₹{o.cost} / {o.unit}</span>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 12, color: 'var(--text-muted, #6b6d82)', fontSize: 12, textAlign: 'center' }}>No results</div>}
        </div>
      )}
    </div>
  )
}

// ── LabourRateDropdown ────────────────────────────────────────────────────────
function LabourRateDropdown({ rates, value, labourCost, onSelect }) {
  if (!rates.length) return null
  const options = rates.map(r => ({ value: r.id, label: r.work_type, cost: r.cost_per_unit, unit: r.unit }))
  return (
    <Field label="Labour Rate" hint={value ? `₹${parseFloat(labourCost || 0).toLocaleString('en-IN')} auto-filled` : undefined}>
      <SearchableDropdown options={options} value={value} onChange={id => { const r = rates.find(x => x.id === id); onSelect(id, r ? String(r.cost_per_unit) : '') }} placeholder="Select service…" />
    </Field>
  )
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  Working: { color: 'var(--green, #3dba7a)',      bg: 'rgba(61,186,122,0.1)',  border: 'rgba(61,186,122,0.35)' },
  Faulty:  { color: 'var(--red, #e05c6a)',        bg: 'rgba(224,92,106,0.1)', border: 'rgba(224,92,106,0.35)' },
  'N/A':   { color: 'var(--text-muted, #6b6d82)', bg: 'var(--bg-input, #252731)', border: 'var(--border, #2e3040)' },
}

// ── ComponentRow ──────────────────────────────────────────────────────────────
function ComponentRow({ name, isCustom, data, tradeRates, onUpdate, onUpdateName, onRemove }) {
  const isFaulty = data.status === 'Faulty'
  const rowTotal = (parseFloat(data.materialCost) || 0) + (parseFloat(data.labourCost) || 0)
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--border, #2e3040)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {isCustom ? (
          <input value={name} onChange={e => onUpdateName(e.target.value)} placeholder="Component name…" style={{ flex: 1, minWidth: 90, padding: '4px 8px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 4, color: 'var(--text, #e8e8f0)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
        ) : (
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--text-dim, #9394a8)' }}>{name}</span>
        )}
        {isCustom && onRemove && (
          <button type="button" onClick={onRemove} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 4, border: '1px solid rgba(224,92,106,0.35)', background: 'rgba(224,92,106,0.08)', color: 'var(--red, #e05c6a)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, flexShrink: 0 }}>×</button>
        )}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {['Working', 'Faulty', 'N/A'].map(s => {
            const cfg = STATUS_CFG[s]
            const active = data.status === s
            return (
              <button key={s} type="button" onClick={() => onUpdate('status', active ? '' : s)} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: `1px solid ${active ? cfg.border : 'var(--border, #2e3040)'}`, background: active ? cfg.bg : 'var(--bg-input, #252731)', color: active ? cfg.color : 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', WebkitTapHighlightColor: 'transparent' }}>{s}</button>
            )
          })}
        </div>
      </div>

      {isFaulty && (
        <div style={{ marginTop: 10, paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Textarea value={data.issueDescription || ''} onChange={v => onUpdate('issueDescription', v)} rows={1} placeholder="Describe the fault…" />
          <Field label="Action">
            <PillGroup options={['Repair', 'Replace', 'Service']} value={data.action} onChange={v => onUpdate('action', v)} />
          </Field>
          {(data.action === 'Repair' || data.action === 'Service') && (
            <>
              <LabourRateDropdown rates={tradeRates} value={data.labourRateId} labourCost={data.labourCost} onSelect={(id, cost) => { onUpdate('labourRateId', id); onUpdate('labourCost', cost) }} />
              <Field label="Labour ₹"><Input value={data.labourCost} onChange={v => onUpdate('labourCost', v)} placeholder="0" type="number" /></Field>
            </>
          )}
          {data.action === 'Replace' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Material ₹"><Input value={data.materialCost} onChange={v => onUpdate('materialCost', v)} placeholder="0" type="number" /></Field>
                <Field label="Labour ₹"><Input value={data.labourCost} onChange={v => onUpdate('labourCost', v)} placeholder="0" type="number" /></Field>
              </div>
              <LabourRateDropdown rates={tradeRates} value={data.labourRateId} labourCost={data.labourCost} onSelect={(id, cost) => { onUpdate('labourRateId', id); onUpdate('labourCost', cost) }} />
            </>
          )}
          {rowTotal > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.2)', borderRadius: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)' }}>Component Total</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent, #c8963e)' }}>₹{rowTotal.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ApplianceCard ─────────────────────────────────────────────────────────────
function ApplianceCard({ appliance, appData, isOpen, onToggle, onUpdate, labourRates, isCustom, onRemove }) {
  const tradeRates  = (labourRates || []).filter(r => r.trade === appliance.trade)
  const comps       = appData.components || {}
  const customC     = appData.customComponents || []
  const done        = appIsDone(appData)
  const doneComps   = appliance.components.filter(c => comps[c]?.status).length + customC.filter(c => c.status).length
  const totalComps  = appliance.components.length + customC.length
  const badge       = totalComps > 0 && doneComps > 0 ? `${doneComps}/${totalComps}` : null
  const displayTitle = isCustom ? (appData.customName || 'Custom Appliance') : appliance.name

  function updateComp(compName, field, value) {
    onUpdate('components', { ...comps, [compName]: { ...(comps[compName] || blankComp()), [field]: value } })
  }
  function updateCustomComp(idx, field, value) {
    const arr = [...customC]; arr[idx] = { ...arr[idx], [field]: value }; onUpdate('customComponents', arr)
  }

  const applianceTotal = [...appliance.components.map(c => comps[c] || {}), ...customC]
    .reduce((sum, c) => sum + (parseFloat(c.materialCost) || 0) + (parseFloat(c.labourCost) || 0), 0)

  const headerAction = (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, background: appData.notPresent ? 'rgba(224,92,106,0.1)' : 'var(--bg-input, #252731)', border: `1px solid ${appData.notPresent ? 'rgba(224,92,106,0.3)' : 'var(--border, #2e3040)'}` }}>
        <input type="checkbox" checked={appData.notPresent || false} onChange={e => onUpdate('notPresent', e.target.checked)} style={{ width: 12, height: 12, accentColor: 'var(--red, #e05c6a)', cursor: 'pointer', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: appData.notPresent ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>{appData.notPresent ? 'not present' : 'present'}</span>
      </label>
      {isCustom && onRemove && (
        <button type="button" onClick={e => { e.stopPropagation(); onRemove() }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: '1px solid rgba(224,92,106,0.35)', background: 'rgba(224,92,106,0.08)', color: 'var(--red, #e05c6a)', fontSize: 14, cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}>×</button>
      )}
    </div>
  )

  return (
    <AccordionCard title={displayTitle} badge={badge} status={done ? 'done' : isOpen ? 'partial' : null} isOpen={isOpen} onToggle={onToggle} headerAction={headerAction}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {appData.notPresent ? (
          <div style={{ padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 8, border: '1px dashed rgba(224,92,106,0.3)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', marginBottom: 10, fontFamily: 'var(--font-mono, monospace)' }}>// not present in this property</div>
            <Field label="Note" optional>
              <Textarea value={appData.notPresentNote || ''} onChange={v => onUpdate('notPresentNote', v)} rows={2} placeholder="e.g. No washing machine installed" />
            </Field>
          </div>
        ) : (
          <>
            {isCustom && (
              <Field label="Appliance Name">
                <Input value={appData.customName || ''} onChange={v => onUpdate('customName', v)} placeholder="e.g. Steam Iron, Air Purifier…" />
              </Field>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Brand" optional><Input value={appData.brand || ''} onChange={v => onUpdate('brand', v)} placeholder="e.g. LG" /></Field>
              <Field label="Model" optional><Input value={appData.model || ''} onChange={v => onUpdate('model', v)} placeholder="e.g. WD-5000" /></Field>
            </div>

            <Field label="Overall Health">
              <HealthSlider value={appData.health} onChange={v => onUpdate('health', v)} />
            </Field>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono, monospace)', marginBottom: 6 }}>Components</div>
              <div style={{ background: 'var(--bg-panel, #1e2028)', borderRadius: 8, padding: '0 14px' }}>
                {appliance.components.map(compName => (
                  <ComponentRow key={compName} name={compName} data={comps[compName] || blankComp()} tradeRates={tradeRates} onUpdate={(f, v) => updateComp(compName, f, v)} />
                ))}
                {customC.map((cc, idx) => (
                  <ComponentRow key={cc.id} name={cc.name} isCustom data={cc} tradeRates={tradeRates} onUpdate={(f, v) => updateCustomComp(idx, f, v)} onUpdateName={v => updateCustomComp(idx, 'name', v)} onRemove={() => onUpdate('customComponents', customC.filter((_, i) => i !== idx))} />
                ))}
              </div>
              <button type="button" onClick={() => onUpdate('customComponents', [...customC, BLANK_CUSTOM_COMP()])} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px dashed rgba(200,150,62,0.4)', borderRadius: 6, background: 'rgba(200,150,62,0.04)', fontSize: 11, fontWeight: 600, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ Add Custom Component</button>
            </div>

            <MediaUpload files={appData.media || []} onChange={v => onUpdate('media', v)} />

            <Field label="Notes" optional>
              <Textarea value={appData.notes || ''} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Any observations…" />
            </Field>

            {applianceTotal > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Appliance Total</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent, #c8963e)' }}>₹{applianceTotal.toLocaleString('en-IN')}</span>
              </div>
            )}
          </>
        )}
      </div>
    </AccordionCard>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InspectionAppliances() {
  const navigate       = useNavigate()
  const { state }      = useLocation()
  const pid            = state?.pid

  const INITIAL = () => Object.fromEntries(APPLIANCES.map(a => [a.name, blankAppliance()]))

  const [data, setData] = useState(() => {
    const initial = INITIAL()
    if (!pid) return initial
    try {
      const saved = localStorage.getItem(`flentfix_appliances_draft_${pid}`)
      if (saved) { const p = JSON.parse(saved); if (p.data) return deepMerge(initial, p.data) }
    } catch (_) {}
    return initial
  })

  const [customAppliances, setCustomAppliances] = useState(() => {
    if (!pid) return []
    try {
      const saved = localStorage.getItem(`flentfix_appliances_draft_${pid}`)
      if (saved) { const p = JSON.parse(saved); if (p.customAppliances) return p.customAppliances }
    } catch (_) {}
    return []
  })

  const [openCards, setOpenCards]     = useState(new Set())
  const [labourRates, setLabourRates] = useState([])
  const [isSaving, setIsSaving]       = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [savedFlash, setSavedFlash]   = useState(false)
  const flashTimer = useRef(null)

  useEffect(() => {
    if (!pid) { navigate('/inspections/new', { replace: true }); return }
    supabase.from('labour_rates').select('id, work_type, cost_per_unit, unit, trade').order('work_type')
      .then(({ data: rows }) => { if (rows) setLabourRates(rows) })
  }, [])

  useEffect(() => {
    if (!pid) return
    localStorage.setItem(`flentfix_appliances_draft_${pid}`, JSON.stringify({ data: stripFiles(data), customAppliances: stripFiles(customAppliances) }))
    clearTimeout(flashTimer.current)
    setSavedFlash(true)
    flashTimer.current = setTimeout(() => setSavedFlash(false), 2000)
  }, [data, customAppliances])

  if (!pid) return null

  function updateAppliance(name, field, value) {
    setData(prev => ({ ...prev, [name]: { ...(prev[name] || blankAppliance()), [field]: value } }))
  }
  function updateCA(idx, field, value) {
    setCustomAppliances(prev => { const arr = [...prev]; arr[idx] = { ...arr[idx], [field]: value }; return arr })
  }
  function toggleCard(key) { setOpenCards(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n }) }

  const totalCount = APPLIANCES.length + customAppliances.length
  const doneCount  = APPLIANCES.filter(a => appIsDone(data[a.name])).length + customAppliances.filter(appIsDone).length
  const progress   = totalCount ? Math.round((doneCount / totalCount) * 100) : 0

  async function handleGenerateReport() {
    setIsSaving(true); setSaveError('')
    const today = new Date().toISOString().split('T')[0]
    const { data: ins, error: insErr } = await supabase
      .from('inspections')
      .insert({ pid, inspection_date: today, house_type: state?.propertyType || 'apartment', status: 'draft', config: { scope: 'appliances', inspection_type: state?.inspectionType } })
      .select('id').single()
    if (insErr) { setSaveError(insErr.message); setIsSaving(false); return }

    const inspectionId  = ins.id
    const lineItemRows  = []
    const mediaArrays   = []

    APPLIANCES.forEach(({ name, trade, components }) => {
      const appData  = data[name] || blankAppliance()
      if (appData.notPresent) return
      const mediaFiles = Array.isArray(appData.media) ? appData.media.filter(f => f instanceof File) : []
      const comps    = appData.components || {}
      const customC  = appData.customComponents || []
      let firstMedia = true

      ;[...components.map(c => ({ n: c, d: comps[c] || blankComp() })), ...customC.map(c => ({ n: c.name, d: c }))]
        .forEach(({ n, d }) => {
          if (!d.status || !n) return
          lineItemRows.push({
            inspection_id: inspectionId, section_name: 'Appliances', area: name, item_name: n, trade,
            issue_description: d.status === 'Faulty' ? (d.issueDescription || 'Faulty') : d.status,
            action: d.status === 'Faulty' ? (d.action || '') : '',
            material_cost: parseFloat(d.materialCost) || 0,
            labour_cost:   parseFloat(d.labourCost) || 0,
            item_score:    appData.health ?? null,
            availability_status: d.status === 'N/A' ? 'not_available' : null,
          })
          mediaArrays.push(firstMedia ? mediaFiles : [])
          firstMedia = false
        })
    })

    customAppliances.forEach(ca => {
      const name = ca.customName || 'Custom Appliance'
      if (ca.notPresent) return
      const mediaFiles = Array.isArray(ca.media) ? ca.media.filter(f => f instanceof File) : []
      let firstMedia = true
      ;(ca.customComponents || []).forEach(cc => {
        if (!cc.status || !cc.name) return
        lineItemRows.push({
          inspection_id: inspectionId, section_name: 'Appliances', area: name, item_name: cc.name, trade: ca.trade || 'electrical',
          issue_description: cc.status === 'Faulty' ? (cc.issueDescription || 'Faulty') : cc.status,
          action: cc.status === 'Faulty' ? (cc.action || '') : '',
          material_cost: parseFloat(cc.materialCost) || 0,
          labour_cost:   parseFloat(cc.labourCost) || 0,
          item_score:    ca.health ?? null,
          availability_status: cc.status === 'N/A' ? 'not_available' : null,
        })
        mediaArrays.push(firstMedia ? mediaFiles : [])
        firstMedia = false
      })
    })

    if (lineItemRows.length) {
      const { data: inserted, error: liErr } = await supabase.from('inspection_line_items').insert(lineItemRows).select('id')
      if (liErr) { setSaveError(liErr.message); setIsSaving(false); return }
      for (let i = 0; i < inserted.length; i++) {
        const files = mediaArrays[i] || []
        if (files.length) await uploadMediaFiles(inspectionId, inserted[i].id, files)
      }
    }

    localStorage.removeItem(`flentfix_appliances_draft_${pid}`)
    navigate('/inspections/appliance-report', { state: { ...state, inspectionId } })
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <NavBar
        title="appliances"
        subtitle={`${pid} · ${state?.layout || ''}`}
        onBack={() => navigate('/inspections/mode', { state })}
        right={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: progress === 100 ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>{progress}%</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', opacity: savedFlash ? 1 : 0, transition: 'opacity 0.4s ease' }}>draft saved</div>
          </div>
        }
      />

      <div style={{ height: 2, background: 'var(--border, #2e3040)' }}>
        <div style={{ height: '100%', background: 'var(--accent, #c8963e)', width: `${progress}%`, transition: 'width 0.4s ease' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 16px 0', maxWidth: 600, margin: '0 auto', width: '100%' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green, #3dba7a)', display: 'inline-block', opacity: 0.7 }} />
          auto-saving draft
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: '8px 4px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>Appliances</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{doneCount} of {totalCount} inspected</span>
          </div>

          {APPLIANCES.map(appliance => (
            <ApplianceCard
              key={appliance.name}
              appliance={appliance}
              appData={data[appliance.name] || blankAppliance()}
              isOpen={openCards.has(appliance.name)}
              onToggle={() => toggleCard(appliance.name)}
              onUpdate={(field, value) => updateAppliance(appliance.name, field, value)}
              labourRates={labourRates}
            />
          ))}

          {customAppliances.map((ca, idx) => (
            <ApplianceCard
              key={ca.id}
              appliance={{ name: ca.customName || 'Custom Appliance', trade: ca.trade || 'electrical', components: [] }}
              appData={ca}
              isOpen={openCards.has(ca.id)}
              onToggle={() => toggleCard(ca.id)}
              onUpdate={(field, value) => updateCA(idx, field, value)}
              labourRates={labourRates}
              isCustom
              onRemove={() => setCustomAppliances(prev => prev.filter((_, i) => i !== idx))}
            />
          ))}

          <button type="button" onClick={() => setCustomAppliances(prev => [...prev, BLANK_CUSTOM_APPLIANCE()])} style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '11px 14px', border: '1px dashed var(--accent, #c8963e)', borderRadius: 8, background: 'rgba(200,150,62,0.04)', fontSize: 12, fontWeight: 600, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ Add Custom Appliance</button>
        </div>
      </div>

      <StickyFooter left={
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>appliances</div>
          <div style={{ fontSize: 11, color: saveError ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{saveError || `${doneCount} of ${totalCount} inspected`}</div>
        </div>
      }>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleGenerateReport} disabled={isSaving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 14px', border: '1px solid var(--border-dash, #3a3d52)', borderRadius: 6, background: 'transparent', fontSize: 12, fontWeight: 600, color: isSaving ? 'var(--text-muted, #6b6d82)' : 'var(--text-dim, #9394a8)', cursor: isSaving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>
            {isSaving ? 'Saving…' : 'Save Report'}
          </button>
          <button type="button" onClick={() => navigate('/inspections/mode', { state })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 18px', border: 'none', borderRadius: 6, background: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
            Back to Hub →
          </button>
        </div>
      </StickyFooter>

      <QuickNotes pid={pid} />
    </div>
  )
}
