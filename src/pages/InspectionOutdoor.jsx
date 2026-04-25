import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import QuickNotes from '../components/QuickNotes'
import {
  NavBar, TabBar, Field, Input, Textarea, PillGroup,
  HealthSlider, Banner, AccordionCard, StickyFooter, BtnPrimary,
} from '../components/ui'
import { supabase } from '../lib/supabase'

// ─── Upload helper ────────────────────────────────────────────────────────────
export async function uploadMediaFiles(inspectionId, lineItemId, files) {
  const uploads = []
  for (const file of files) {
    const ext = file.name.split('.').pop()
    const path = `inspections/${lineItemId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage
      .from('inspection-media')
      .upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage
        .from('inspection-media')
        .getPublicUrl(data.path)
      uploads.push({ url: publicUrl, type: file.type.startsWith('video') ? 'video' : 'image' })
    }
  }
  if (uploads.length) {
    await supabase.from('line_item_media').insert(
      uploads.map(m => ({ line_item_id: lineItemId, url: m.url, type: m.type, caption: '' }))
    )
  }
  return uploads.map(u => u.url)
}

// ─── Issue presets ────────────────────────────────────────────────────────────
export const ISSUE_PRESETS = {
  waterPump: [
    'Functional',
    'Not functioning / No water output',
    'Low water pressure',
    'Making unusual noise',
    'Visible leakage from pump body',
    'Tripping / electrical fault',
    'Needs replacement',
  ],
  sumpTank: [
    'Functional',
    'Requires general cleaning',
    'Requires extensive cleaning — heavy sludge',
    'Visible crack / leakage',
    'Inlet/outlet valve issue',
    'Overflow issue',
  ],
  overheadTank: [
    'Functional',
    'Requires general cleaning',
    'Requires extensive cleaning',
    'Visible crack / leakage',
    'Float valve not functioning',
    'Overflow pipe blocked',
  ],
  borewellMotor: [
    'Functional',
    'Not functioning / No water output',
    'Low yield / reduced flow',
    'Making unusual noise',
    'Electrical fault / tripping',
    'Needs replacement',
  ],
  waterAutomation: [
    'Functional',
    'Sensor not functioning',
    'Auto switch not working',
    'Panel/controller issue',
    'Needs installation',
  ],
  outdoorLights: [
    'Functional',
    'Not working / fused',
    'Flickering',
    'Fixture damaged',
    'Wiring exposed',
    'Needs new fitting',
  ],
  mainDB: [
    'Functional',
    'MCB tripping frequently',
    'Loose wiring / connections',
    'DB box damaged',
    'Requires inspection',
  ],
  cctvCamera: [
    'Functional',
    'Not recording',
    'Damaged camera body',
    'No live feed',
    'DVR/NVR issue',
    'Needs installation',
  ],
  gateLock: [
    'Functional',
    'Lock not functioning',
    'Hinge broken / loose',
    'Gate misaligned',
    'Rust / corrosion',
    'Needs replacement',
  ],
}

// ─── State helpers ────────────────────────────────────────────────────────────
const blankCostRow  = () => ({ action: '', labourRateId: '', labourCost: '', materialCost: '' })
const blankIssueRow = () => ({ id: `ir_${Date.now()}_${Math.random().toString(36).slice(2)}`, issueDescription: '', action: '', labourRateId: '', labourCost: '', materialCost: '' })
const blankCard     = () => ({ health: null, notes: '', media: [], notAvailable: false, notAvailableNote: '', selectedIssues: [], otherIssue: '', costRows: {} })

function isDone(item) {
  if (!item) return false
  return item.notAvailable || (item.selectedIssues || []).length > 0
}

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

// ─── Thumbnail ────────────────────────────────────────────────────────────────
function Thumb({ file }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u) }, [file])
  if (!url) return null
  if (file.type.startsWith('video')) return <video src={url} muted playsInline style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />
  return <img src={url} alt="" style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />
}

// ─── Media upload ─────────────────────────────────────────────────────────────
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
        {files.length > 0 && <span style={{ marginLeft: 'auto', background: 'var(--accent, #c8963e)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--font-mono, monospace)' }}>{files.length}</span>}
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
            <button type="button" onClick={() => cameraRef.current?.click()} style={SHEET_BTN}><span style={{ fontSize: 18 }}>📷</span> take photo / video</button>
            <button type="button" onClick={() => galleryRef.current?.click()} style={{ ...SHEET_BTN, marginTop: 8 }}><span style={{ fontSize: 18 }}>🖼</span> choose from gallery</button>
            <button type="button" onClick={() => setSheet(false)} style={{ ...SHEET_BTN, marginTop: 14, color: 'var(--text-muted, #6b6d82)' }}>cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Issue checkbox grid ──────────────────────────────────────────────────────
function IssueCheckboxGrid({ presets, selectedIssues, otherIssue, onSetIssues, onOtherChange }) {
  const regularPresets = (presets || []).filter(p => p !== 'Functional' && p !== 'Other')
  const hasOtherPreset = (presets || []).includes('Other')
  const hasFunctional  = (presets || []).includes('Functional')
  const isFunctional   = selectedIssues.includes('Functional')

  function toggle(issue) {
    if (issue === 'Functional') {
      onSetIssues(isFunctional ? [] : ['Functional'])
    } else {
      const next = selectedIssues.filter(x => x !== 'Functional')
      onSetIssues(next.includes(issue) ? next.filter(x => x !== issue) : [...next, issue])
    }
  }

  const allOptions = [...regularPresets, ...(hasOtherPreset ? ['Other'] : [])]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {allOptions.map(p => {
          const checked = !isFunctional && selectedIssues.includes(p)
          return (
            <button key={p} type="button" onClick={() => toggle(p)} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', border: `1px solid ${checked ? 'rgba(200,150,62,0.5)' : 'var(--border, #2e3040)'}`, borderRadius: 6, background: checked ? 'rgba(200,150,62,0.08)' : 'var(--bg-input, #252731)', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ width: 14, height: 14, minWidth: 14, borderRadius: 3, border: `1.5px solid ${checked ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, background: checked ? 'var(--accent, #c8963e)' : 'transparent', marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {checked && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2.5 2.5L7 1.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: checked ? 'var(--accent, #c8963e)' : 'var(--text-dim, #9394a8)', lineHeight: 1.4 }}>{p}</span>
            </button>
          )
        })}
      </div>
      {!isFunctional && selectedIssues.includes('Other') && (
        <Textarea value={otherIssue || ''} onChange={onOtherChange} placeholder="Describe the issue…" rows={2} />
      )}
      {hasFunctional && (
        <button type="button" onClick={() => toggle('Functional')} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', border: `1px solid ${isFunctional ? 'rgba(61,186,122,0.4)' : 'var(--border-dash, #3a3d52)'}`, borderRadius: 6, background: isFunctional ? 'rgba(61,186,122,0.08)' : 'var(--bg-input, #252731)', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ width: 14, height: 14, minWidth: 14, borderRadius: 3, border: `1.5px solid ${isFunctional ? 'var(--green, #3dba7a)' : 'var(--border, #2e3040)'}`, background: isFunctional ? 'var(--green, #3dba7a)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isFunctional && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1 4l2.5 2.5L7 1.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: isFunctional ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Functional — no issues</span>
        </button>
      )}
    </div>
  )
}

// ─── Searchable dropdown ──────────────────────────────────────────────────────
function SearchableDropdown({ options, value, onChange, placeholder }) {
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') }
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const selected = options.find(o => o.value === value)
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => { setOpen(p => !p); setSearch('') }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: `1px solid ${value ? 'rgba(200,150,62,0.5)' : 'var(--border, #2e3040)'}`, borderRadius: 6, background: 'var(--bg-input, #252731)', fontSize: 12, color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'inherit', gap: 6 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
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

// ─── Labour dropdown (from labour_rates) ─────────────────────────────────────
function LabourRateDropdown({ rates, value, labourCost, onSelect }) {
  if (!rates.length) return null
  const options = rates.map(r => ({ value: r.id, label: r.work_type, cost: r.cost_per_unit, unit: r.unit }))
  return (
    <Field label="Labour Rate" hint={value ? `₹${parseFloat(labourCost || 0).toLocaleString('en-IN')} auto-filled` : undefined}>
      <SearchableDropdown
        options={options}
        value={value}
        onChange={id => { const r = rates.find(x => x.id === id); onSelect(id, r ? String(r.cost_per_unit) : '') }}
        placeholder="Select service…"
      />
    </Field>
  )
}

// ─── Not-available note ───────────────────────────────────────────────────────
function NotAvailableNote({ value, onChange }) {
  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 8, border: '1px dashed rgba(224,92,106,0.3)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', marginBottom: 10, fontFamily: 'var(--font-mono, monospace)' }}>// marked as not_available in this property</div>
      <Field label="Note" optional>
        <Textarea value={value || ''} onChange={onChange} placeholder="e.g. No pressure pump in this property" rows={2} />
      </Field>
    </div>
  )
}

// ─── Issue cost row (one per selected non-Functional issue) ───────────────────
function IssueCostRow({ issueLabel, costRow = {}, tradeRates, onUpdate }) {
  const rowTotal = (parseFloat(costRow.materialCost) || 0) + (parseFloat(costRow.labourCost) || 0)
  return (
    <div style={{ background: 'var(--bg, #16171f)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>— {issueLabel}</span>

      <Field label="Action">
        <PillGroup options={['Repair', 'Replace', 'Install']} value={costRow.action} onChange={v => onUpdate('action', v)} />
      </Field>

      {costRow.action === 'Repair' && (
        <>
          <LabourRateDropdown rates={tradeRates} value={costRow.labourRateId} labourCost={costRow.labourCost} onSelect={(id, cost) => { onUpdate('labourRateId', id); onUpdate('labourCost', cost) }} />
          <Field label="Labour ₹">
            <Input value={costRow.labourCost} onChange={v => onUpdate('labourCost', v)} placeholder="0" type="number" />
          </Field>
        </>
      )}

      {(costRow.action === 'Replace' || costRow.action === 'Install') && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Material ₹"><Input value={costRow.materialCost} onChange={v => onUpdate('materialCost', v)} placeholder="0" type="number" /></Field>
            <Field label="Labour ₹"><Input value={costRow.labourCost} onChange={v => onUpdate('labourCost', v)} placeholder="0" type="number" /></Field>
          </div>
          <LabourRateDropdown rates={tradeRates} value={costRow.labourRateId} labourCost={costRow.labourCost} onSelect={(id, cost) => { onUpdate('labourRateId', id); onUpdate('labourCost', cost) }} />
        </>
      )}

      {rowTotal > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.2)', borderRadius: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Issue Total</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent, #c8963e)' }}>₹{rowTotal.toLocaleString('en-IN')}</span>
        </div>
      )}
    </div>
  )
}

// ─── Outdoor item card ────────────────────────────────────────────────────────
function OutdoorItemCard({ config, item, isOpen, onToggle, onUpdate, labourRates }) {
  const { title, badge, trade, presets } = config
  const tradeRates     = (labourRates || []).filter(r => r.trade === trade)
  const selectedIssues = item.selectedIssues || []
  const costRows       = item.costRows || {}
  const done           = isDone(item)
  const nonFunctional  = selectedIssues.filter(i => i !== 'Functional')
  const itemTotal      = nonFunctional.reduce((sum, issue) => {
    const cr = costRows[issue] || {}
    return sum + (parseFloat(cr.materialCost) || 0) + (parseFloat(cr.labourCost) || 0)
  }, 0)

  function toggleIssue(nextIssues) {
    const newCostRows = { ...costRows }
    nextIssues.forEach(issue => {
      if (issue !== 'Functional' && !newCostRows[issue]) newCostRows[issue] = blankCostRow()
    })
    onUpdate('selectedIssues', nextIssues)
    onUpdate('costRows', newCostRows)
  }

  function updateCostRow(issue, field, value) {
    onUpdate('costRows', { ...costRows, [issue]: { ...(costRows[issue] || {}), [field]: value } })
  }

  const naToggle = (
    <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, background: item.notAvailable ? 'rgba(224,92,106,0.1)' : 'var(--bg-input, #252731)', border: `1px solid ${item.notAvailable ? 'rgba(224,92,106,0.3)' : 'var(--border, #2e3040)'}`, transition: 'background 0.15s' }}>
      <input type="checkbox" checked={item.notAvailable || false} onChange={e => onUpdate('notAvailable', e.target.checked)} style={{ width: 12, height: 12, accentColor: 'var(--red, #e05c6a)', cursor: 'pointer', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: item.notAvailable ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>{item.notAvailable ? 'n/a' : 'not avail'}</span>
    </label>
  )

  return (
    <AccordionCard title={title} badge={badge} status={done ? 'done' : isOpen ? 'partial' : null} isOpen={isOpen} onToggle={onToggle} headerAction={naToggle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {item.notAvailable ? (
          <NotAvailableNote value={item.notAvailableNote} onChange={v => onUpdate('notAvailableNote', v)} />
        ) : (
          <>
            {/* 1. Issue checkboxes */}
            <Field label="Issues">
              <IssueCheckboxGrid
                presets={presets}
                selectedIssues={selectedIssues}
                otherIssue={item.otherIssue}
                onSetIssues={toggleIssue}
                onOtherChange={v => onUpdate('otherIssue', v)}
              />
            </Field>

            {/* 2. Health Score */}
            <Field label="Health Score">
              <HealthSlider value={item.health} onChange={v => onUpdate('health', v)} />
            </Field>

            {/* 3. Media */}
            <MediaUpload files={item.media} onChange={v => onUpdate('media', v)} />

            {/* 4. Notes */}
            <Field label="Notes" optional>
              <Textarea value={item.notes} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Any observations…" />
            </Field>

            {/* 5. Cost rows */}
            {nonFunctional.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>Cost Breakdown</span>
                {nonFunctional.map(issue => (
                  <IssueCostRow
                    key={issue}
                    issueLabel={issue === 'Other' ? (item.otherIssue || 'Other') : issue}
                    costRow={costRows[issue] || {}}
                    tradeRates={tradeRates}
                    onUpdate={(field, value) => updateCostRow(issue, field, value)}
                  />
                ))}
              </div>
            )}

            {itemTotal > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Item Total</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent, #c8963e)' }}>₹{itemTotal.toLocaleString('en-IN')}</span>
              </div>
            )}
          </>
        )}
      </div>
    </AccordionCard>
  )
}

// ─── Custom item card ─────────────────────────────────────────────────────────
const BLANK_CUSTOM = () => ({ id: `ci_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: '', health: null, notes: '', media: [], issues: [] })

function CustomItemCard({ item, onChange, onRemove }) {
  const issueRows = item.issues || []
  const itemTotal = issueRows.reduce((sum, r) => sum + (parseFloat(r.materialCost) || 0) + (parseFloat(r.labourCost) || 0), 0)
  function addIssue() { onChange('issues', [...issueRows, blankIssueRow()]) }
  function removeIssue(idx) { onChange('issues', issueRows.filter((_, i) => i !== idx)) }
  function updateIssue(idx, field, value) { const u = [...issueRows]; u[idx] = { ...u[idx], [field]: value }; onChange('issues', u) }

  return (
    <div style={{ borderRadius: 8, border: '1px dashed var(--accent, #c8963e)', padding: 14, background: 'var(--bg-input, #252731)', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }}>+ custom item</span>
        <button type="button" onClick={onRemove} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>× remove</button>
      </div>
      <Field label="Item Name"><Input value={item.name} onChange={v => onChange('name', v)} placeholder="e.g. Pressure gauge, valve…" /></Field>
      <Field label="Health Score"><HealthSlider value={item.health} onChange={v => onChange('health', v)} /></Field>
      <MediaUpload files={item.media} onChange={v => onChange('media', v)} />
      <Field label="Notes" optional><Textarea value={item.notes} onChange={v => onChange('notes', v)} rows={2} placeholder="Notes…" /></Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>Issues</span>
          <button type="button" onClick={addIssue} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 5, background: 'rgba(200,150,62,0.08)', fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ Add Issue</button>
        </div>
        {issueRows.map((row, idx) => {
          const rt = (parseFloat(row.materialCost) || 0) + (parseFloat(row.labourCost) || 0)
          return (
            <div key={row.id || idx} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => removeIssue(idx)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>× remove</button>
              </div>
              <Field label="Issue Description" optional><Textarea value={row.issueDescription} onChange={v => updateIssue(idx, 'issueDescription', v)} rows={2} placeholder="Describe the issue…" /></Field>
              <Field label="Action" optional><PillGroup options={['Repair','Replace','Install']} value={row.action} onChange={v => updateIssue(idx, 'action', v)} /></Field>
              {row.action && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Material ₹"><Input value={row.materialCost} onChange={v => updateIssue(idx, 'materialCost', v)} placeholder="0" type="number" /></Field>
                  <Field label="Labour ₹"><Input value={row.labourCost} onChange={v => updateIssue(idx, 'labourCost', v)} placeholder="0" type="number" /></Field>
                </div>
              )}
              {rt > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.2)', borderRadius: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)' }}>Issue Total</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent, #c8963e)' }}>₹{rt.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {itemTotal > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Item Total</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent, #c8963e)' }}>₹{itemTotal.toLocaleString('en-IN')}</span>
        </div>
      )}
    </div>
  )
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TABS = ['Utility', 'Electricals', 'Security']

const SECTIONS = {
  utility: [
    { key: 'waterPumpPrimary',  title: 'Water Pump',       badge: 'Primary',              trade: 'plumbing',   presets: ISSUE_PRESETS.waterPump },
    { key: 'sumpTankPrimary',   title: 'Sump Tank',        badge: 'Primary · Kaveri',     trade: 'plumbing',   presets: ISSUE_PRESETS.sumpTank },
    { key: 'overheadTank',      title: 'Overhead Tank',    badge: null,                   trade: 'plumbing',   presets: ISSUE_PRESETS.overheadTank },
    { key: 'sumpTankSecondary', title: 'Sump Tank',        badge: 'Secondary · Borewell', trade: 'plumbing',   presets: ISSUE_PRESETS.sumpTank },
    { key: 'borewellMotor',     title: 'Borewell Motor',   badge: 'Secondary',            trade: 'electrical', presets: ISSUE_PRESETS.borewellMotor },
    { key: 'waterAutomation',   title: 'Water Automation', badge: null,                   trade: 'electrical', presets: ISSUE_PRESETS.waterAutomation },
    { key: 'pressurePump',      title: 'Pressure Pump',    badge: null,                   trade: 'plumbing',   presets: ISSUE_PRESETS.waterPump },
  ],
  electricals: [
    { key: 'outdoorLights', title: 'Outdoor Lights', badge: null, trade: 'electrical', presets: ISSUE_PRESETS.outdoorLights },
    { key: 'mainDB',        title: 'Main DB',         badge: null, trade: 'electrical', presets: ISSUE_PRESETS.mainDB },
    { key: 'meterInfo',     title: 'Meter Info',      badge: null, trade: 'electrical', presets: [] },
  ],
  security: [
    { key: 'cctvCamera', title: 'CCTV Camera', badge: null, trade: 'electrical', presets: ISSUE_PRESETS.cctvCamera },
    { key: 'gateLock',   title: 'Gate / Lock', badge: null, trade: 'woodwork',   presets: ISSUE_PRESETS.gateLock },
  ],
}

const sectionKeys = ['utility', 'electricals', 'security']

const INITIAL = {
  utility:     { waterPumpPrimary: blankCard(), sumpTankPrimary: blankCard(), overheadTank: blankCard(), sumpTankSecondary: blankCard(), borewellMotor: blankCard(), waterAutomation: blankCard(), pressurePump: blankCard() },
  electricals: { outdoorLights: blankCard(), mainDB: blankCard(), meterInfo: blankCard() },
  security:    { cctvCamera: blankCard(), gateLock: blankCard() },
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function InspectionOutdoor() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const pid       = state?.pid

  const [data, setData] = useState(() => {
    if (!pid) return INITIAL
    try {
      const saved = localStorage.getItem(`flentfix_outdoor_draft_${pid}`)
      if (saved) { const p = JSON.parse(saved); if (p.data) return deepMerge(INITIAL, p.data) }
    } catch (_) {}
    return INITIAL
  })

  const [customItems, setCustomItems] = useState(() => {
    if (!pid) return {}
    try {
      const saved = localStorage.getItem(`flentfix_outdoor_draft_${pid}`)
      if (saved) { const p = JSON.parse(saved); if (p.customItems) return p.customItems }
    } catch (_) {}
    return {}
  })

  const [searchParams, setSearchParams] = useSearchParams()
  const section = searchParams.get('section') || 'utility'
  const tab     = Math.max(0, sectionKeys.indexOf(section))
  const [openCard,     setOpenCard]     = useState(null)
  const [labourRates,  setLabourRates]  = useState([])
  const [isEstimating, setIsEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState('')
  const [savedFlash,   setSavedFlash]   = useState(false)
  const flashTimer = useRef(null)

  useEffect(() => {
    if (!pid) { navigate('/inspections/new', { replace: true }); return }
    supabase.from('labour_rates').select('id, work_type, cost_per_unit, unit, trade').order('work_type')
      .then(({ data: rows }) => { if (rows) setLabourRates(rows) })
  }, [])

  useEffect(() => {
    if (!pid) return
    localStorage.setItem(`flentfix_outdoor_draft_${pid}`, JSON.stringify({ data: stripFiles(data), customItems: stripFiles(customItems) }))
    clearTimeout(flashTimer.current)
    setSavedFlash(true)
    flashTimer.current = setTimeout(() => setSavedFlash(false), 2000)
  }, [data, customItems])

  if (!pid) return null

  function update(sectionKey, key, field, value) {
    setData(prev => ({ ...prev, [sectionKey]: { ...prev[sectionKey], [key]: { ...prev[sectionKey][key], [field]: value } } }))
  }

  function getCI(sk) { return customItems[sk] || [] }
  function setCI(sk, items) { setCustomItems(prev => ({ ...prev, [sk]: items })) }
  function addCustomItem(sk) { setCI(sk, [...getCI(sk), BLANK_CUSTOM()]) }
  function removeCustomItem(sk, idx) { setCI(sk, getCI(sk).filter((_, i) => i !== idx)) }
  function updateCustomItem(sk, idx, field, value) { const arr = [...getCI(sk)]; arr[idx] = { ...arr[idx], [field]: value }; setCI(sk, arr) }

  function toggleCard(key)    { setOpenCard(p => p === key ? null : key) }
  function handleTabChange(i) { setOpenCard(null); setSearchParams({ section: sectionKeys[i] }, { replace: true, state }) }

  const counts = sectionKeys.reduce((acc, sk, i) => {
    acc[i]            = SECTIONS[sk].filter(s => isDone(data[sk][s.key])).length
    acc[`${i}_total`] = SECTIONS[sk].length
    return acc
  }, {})

  const totalDone  = sectionKeys.reduce((s, sk) => s + SECTIONS[sk].filter(item => isDone(data[sk][item.key])).length, 0)
  const totalItems = sectionKeys.reduce((s, sk) => s + SECTIONS[sk].length, 0)
  const progress   = Math.round((totalDone / totalItems) * 100)

  const sk     = sectionKeys[tab]
  const items  = SECTIONS[sk]
  const isLast = tab === TABS.length - 1

  async function handleCreateEstimate() {
    setIsEstimating(true); setEstimateError('')
    const today = new Date().toISOString().split('T')[0]
    const { data: ins, error: insErr } = await supabase
      .from('inspections')
      .insert({ pid, inspection_date: today, house_type: state.inspectionType, status: 'draft', config: { layout: state.layout, inspection_type: state.inspectionType, scope: 'outdoor' } })
      .select('id').single()
    if (insErr) { setEstimateError(insErr.message); setIsEstimating(false); return }

    const inspectionId = ins.id
    const lineItemRows = []
    const mediaArrays  = []

    sectionKeys.forEach((sectionKey, tabIdx) => {
      const sectionName = TABS[tabIdx]
      SECTIONS[sectionKey].forEach(({ key, title, trade }) => {
        const item = data[sectionKey][key]
        if (!item) return
        const selIssues = item.selectedIssues || []
        if (!item.notAvailable && selIssues.length === 0) return
        const mediaFiles = Array.isArray(item.media) ? item.media.filter(f => f instanceof File) : []
        const base = { inspection_id: inspectionId, section_name: sectionName, area: title, item_name: title, trade }

        if (item.notAvailable) {
          lineItemRows.push({ ...base, issue_description: item.notAvailableNote || 'Not available in property', material_cost: 0, labour_cost: 0, item_score: null, availability_status: 'not_available' })
          mediaArrays.push(mediaFiles)
          return
        }

        if (selIssues.includes('Functional')) {
          lineItemRows.push({ ...base, issue_description: 'Functional', action: 'Functional', material_cost: 0, labour_cost: 0, item_score: item.health ?? 10, availability_status: null })
          mediaArrays.push(mediaFiles)
        } else {
          selIssues.forEach((issue, ri) => {
            const cr = (item.costRows || {})[issue] || {}
            const issueLabel = issue === 'Other' ? (item.otherIssue || 'Other') : issue
            lineItemRows.push({ ...base, issue_description: issueLabel, action: cr.action || '', material_cost: parseFloat(cr.materialCost) || 0, labour_cost: parseFloat(cr.labourCost) || 0, item_score: item.health ?? null, availability_status: null })
            mediaArrays.push(ri === 0 ? mediaFiles : [])
          })
        }
      })

      getCI(sectionKey).forEach(ci => {
        if (!ci.name) return
        const ciMedia = Array.isArray(ci.media) ? ci.media.filter(f => f instanceof File) : []
        const ciIssues = ci.issues || []
        if (ciIssues.length === 0) {
          lineItemRows.push({ inspection_id: inspectionId, section_name: sectionName, area: 'Custom', item_name: ci.name, trade: 'misc', issue_description: '', material_cost: 0, labour_cost: 0, item_score: ci.health ?? null })
          mediaArrays.push(ciMedia)
        } else {
          ciIssues.forEach((row, ri) => {
            lineItemRows.push({ inspection_id: inspectionId, section_name: sectionName, area: 'Custom', item_name: ci.name, trade: 'misc', issue_description: row.issueDescription || '', action: row.action || '', material_cost: parseFloat(row.materialCost) || 0, labour_cost: parseFloat(row.labourCost) || 0, item_score: ci.health ?? null })
            mediaArrays.push(ri === 0 ? ciMedia : [])
          })
        }
      })
    })

    if (lineItemRows.length) {
      const { data: inserted, error: liErr } = await supabase.from('inspection_line_items').insert(lineItemRows).select('id')
      if (liErr) { setEstimateError(liErr.message); setIsEstimating(false); return }
      for (let i = 0; i < inserted.length; i++) {
        const files = mediaArrays[i] || []
        if (files.length) await uploadMediaFiles(inspectionId, inserted[i].id, files)
      }
    }

    localStorage.removeItem(`flentfix_outdoor_draft_${pid}`)
    navigate(`/estimate/${inspectionId}`)
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>

      <NavBar
        title="outdoor_inspection"
        subtitle={`${pid} · ${state.layout}`}
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

      <TabBar tabs={TABS} active={tab} onChange={handleTabChange} counts={counts} />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }} key={tab}>

          <div style={{ padding: '8px 4px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{TABS[tab]}</span>
            <span style={{ fontSize: 11, color: counts[tab] === counts[`${tab}_total`] ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
              {counts[tab]} / {counts[`${tab}_total`]} complete
            </span>
          </div>

          {items.map(config => (
            <OutdoorItemCard
              key={config.key}
              config={config}
              item={data[sk][config.key]}
              isOpen={openCard === config.key}
              onToggle={() => toggleCard(config.key)}
              onUpdate={(field, value) => update(sk, config.key, field, value)}
              labourRates={labourRates}
            />
          ))}

          {getCI(sk).map((ci, idx) => (
            <CustomItemCard key={ci.id} item={ci} onChange={(f, v) => updateCustomItem(sk, idx, f, v)} onRemove={() => removeCustomItem(sk, idx)} />
          ))}

          <button type="button" onClick={() => addCustomItem(sk)} style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '11px 14px', border: '1px dashed var(--accent, #c8963e)', borderRadius: 8, background: 'rgba(200,150,62,0.04)', fontSize: 12, fontWeight: 600, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
            + Add Custom Item
          </button>
        </div>
      </div>

      <StickyFooter left={
        tab > 0 ? (
          <button onClick={() => handleTabChange(tab - 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid var(--border-dash, #3a3d52)', borderRadius: 6, background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
            ← {TABS[tab - 1]}
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>outdoor</div>
            <div style={{ fontSize: 11, color: estimateError ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{estimateError || `${totalDone} of ${totalItems} complete`}</div>
          </div>
        )
      }>
        {isLast ? (
          <BtnPrimary onClick={() => navigate('/inspections/mode', { state })}>
            Back to Hub →
          </BtnPrimary>
        ) : (
          <BtnPrimary onClick={() => handleTabChange(tab + 1)}>
            {TABS[tab + 1]} →
          </BtnPrimary>
        )}
      </StickyFooter>

      <QuickNotes pid={pid} />
    </div>
  )
}
