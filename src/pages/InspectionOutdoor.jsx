import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import QuickNotes from '../components/QuickNotes'
import {
  NavBar, TabBar, Field, Input, Textarea, PillGroup,
  HealthSlider, Banner, AccordionCard, StickyFooter, BtnPrimary,
} from '../components/ui'
import { supabase } from '../lib/supabase'

// ─── Upload helper (called after inspection record is created) ────────────────
export async function uploadMediaFiles(inspectionId, lineItemId, files) {
  const results = []
  for (const file of files) {
    const filename = `${Date.now()}-${file.name}`
    const path = `${inspectionId}/${filename}`

    const { error: uploadErr } = await supabase.storage
      .from('inspection-media')
      .upload(path, file)
    if (uploadErr) continue

    const { data: { publicUrl } } = supabase.storage
      .from('inspection-media')
      .getPublicUrl(path)

    const { error: dbErr } = await supabase.from('line_item_media').insert({
      line_item_id: lineItemId,
      url: publicUrl,
      type: file.type.startsWith('video') ? 'video' : 'image',
    })
    if (!dbErr) results.push(publicUrl)
  }
  return results
}

// ─── Item completeness check ──────────────────────────────────────────────────
function isDone(item) {
  if (!item) return false
  if (item.notAvailable) return true
  // issueDescription required when the field is present (all items except meterInfo)
  if ('issueDescription' in item && !item.issueDescription) return false
  // Functional selected → item is complete, no further fields required
  if (item.issueDescription === 'Functional') return true
  if ('health' in item) return item.health !== null
  if ('type'   in item) return item.type !== ''
  if ('status' in item) return item.status !== ''
  const { lightItems = [], switchboardItems = [], lightCustomItems = [], misc = '' } = item
  return lightItems.length > 0 || switchboardItems.length > 0 || lightCustomItems.length > 0 || misc !== ''
}

// ─── Shared form wrappers ─────────────────────────────────────────────────────
const FF = { display: 'flex', flexDirection: 'column', gap: 20 }

// ─── Thumbnail preview ────────────────────────────────────────────────────────
function Thumb({ file }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  if (!url) return null
  if (file.type.startsWith('video')) {
    return <video src={url} muted playsInline style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
  }
  return <img src={url} alt="" style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
}

// ─── Media upload button + action sheet + thumbnails ─────────────────────────
const SHEET_BTN = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
  width: '100%', padding: '12px 18px', border: '1px solid var(--border, #2e3040)', borderRadius: 8,
  background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
}

function MediaUpload({ files = [], onChange, label = 'Attach Photos / Videos' }) {
  const cameraRef  = useRef(null)
  const galleryRef = useRef(null)
  const [sheet, setSheet] = useState(false)

  function handleFiles(e) {
    const added = Array.from(e.target.files || [])
    if (added.length) onChange([...files, ...added])
    e.target.value = ''
    setSheet(false)
  }

  function remove(idx) { onChange(files.filter((_, i) => i !== idx)) }

  return (
    <div>
      {/* ── hidden inputs ── */}
      <input ref={cameraRef}  type="file" accept="image/*,video/*" capture="environment" style={{ display: 'none' }} onChange={handleFiles} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" multiple            style={{ display: 'none' }} onChange={handleFiles} />

      {/* ── trigger button ── */}
      <button
        type="button"
        onClick={() => setSheet(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '10px 14px',
          border: `1px dashed ${files.length ? 'var(--green, #3dba7a)' : 'var(--border-dash, #3a3d52)'}`,
          borderRadius: 6,
          background: files.length ? 'rgba(61,186,122,0.08)' : 'var(--bg-input, #252731)',
          fontSize: 13, fontWeight: 500,
          color: files.length ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M1 11v2a1 1 0 001 1h12a1 1 0 001-1v-2M8 1v9M5 4l3-3 3 3"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {label}
        {files.length > 0 && (
          <span style={{ marginLeft: 'auto', background: 'var(--accent, #c8963e)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--font-mono, monospace)' }}>
            {files.length}
          </span>
        )}
      </button>

      {/* ── thumbnails ── */}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {files.map((file, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <Thumb file={file} />
              <button
                type="button"
                onClick={() => remove(i)}
                style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'var(--red, #e05c6a)', border: '2px solid var(--bg-panel, #1e2028)',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', lineHeight: 1, padding: 0,
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* ── action sheet ── */}
      {sheet && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setSheet(false)}
        >
          <div
            style={{ width: '100%', background: 'var(--bg-panel, #1e2028)', borderRadius: '12px 12px 0 0', padding: '8px 16px 36px' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '10px auto 18px' }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', marginBottom: 14, textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>{label}</div>
            <button type="button" onClick={() => cameraRef.current?.click()} style={SHEET_BTN}>
              <span style={{ fontSize: 18 }}>📷</span> take photo / video
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} style={{ ...SHEET_BTN, marginTop: 8 }}>
              <span style={{ fontSize: 18 }}>🖼</span> choose from gallery
            </button>
            <button type="button" onClick={() => setSheet(false)} style={{ ...SHEET_BTN, marginTop: 14, color: 'var(--text-muted, #6b6d82)' }}>
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Preset issue descriptions ───────────────────────────────────────────────
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

// ─── Issue Description Field (preset dropdown + optional free text) ───────────
function IssueDescriptionField({ presets, value, onChange }) {
  const inPreset = presets.includes(value)
  const [otherMode, setOtherMode] = useState(!inPreset && value !== '')

  const selectVal = otherMode ? 'Other' : value

  function handleSelect(e) {
    if (e.target.value === 'Other') {
      setOtherMode(true)
      onChange('')
    } else {
      setOtherMode(false)
      onChange(e.target.value)
    }
  }

  return (
    <Field label="Issue Description">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <select
            value={selectVal}
            onChange={handleSelect}
            style={{
              fontFamily: 'inherit', width: '100%',
              padding: '10px 36px 10px 14px',
              fontSize: 13, color: selectVal ? (selectVal === 'Functional' ? 'var(--green, #3dba7a)' : 'var(--text, #e8e8f0)') : 'var(--text-muted, #6b6d82)',
              border: `1px solid ${selectVal === 'Functional' ? 'rgba(61,186,122,0.4)' : 'var(--border, #2e3040)'}`,
              borderRadius: 6,
              background: selectVal === 'Functional' ? 'rgba(61,186,122,0.07)' : 'var(--bg-input, #252731)',
              outline: 'none', appearance: 'none', cursor: 'pointer',
            }}
          >
            <option value="">Select issue…</option>
            {presets.map(o => <option key={o} value={o}>{o}</option>)}
            <option value="Other">Other (describe below)</option>
          </select>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <path d="M2.5 5l4.5 4 4.5-4" stroke="#B0B0B0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        {otherMode && (
          <Textarea
            value={value}
            onChange={onChange}
            placeholder="Describe the issue…"
            rows={2}
          />
        )}
      </div>
    </Field>
  )
}

// ─── Labour Dropdown ──────────────────────────────────────────────────────────
function LabourDropdown({ rateCardRows, areaFilter, itemNameContains, value, labourCost, onChange, label = 'Labour Cost' }) {
  const areas = Array.isArray(areaFilter) ? areaFilter : areaFilter ? [areaFilter] : null
  const filtered = rateCardRows.filter(row => {
    const areaMatch = !areas || areas.some(a => row.area?.toLowerCase().includes(a.toLowerCase()))
    const nameMatch = !itemNameContains || row.item_name?.toLowerCase().includes(itemNameContains.toLowerCase())
    return areaMatch && nameMatch
  })

  return (
    <Field label={label} hint={value ? `₹${parseFloat(labourCost || 0).toLocaleString('en-IN')} auto-filled` : 'Select from rate card'}>
      <div style={{ position: 'relative' }}>
        <select
          value={value || ''}
          onChange={e => {
            const row = filtered.find(r => r.item_name === e.target.value)
            if (row) onChange({ itemName: row.item_name, labourCost: String(row.labour_cost ?? '') })
            else onChange({ itemName: '', labourCost: '' })
          }}
          style={{
            fontFamily: 'inherit', width: '100%',
            padding: '10px 36px 10px 14px',
            fontSize: 13, color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)',
            border: '1px solid var(--border, #2e3040)', borderRadius: 6,
            background: 'var(--bg-input, #252731)', outline: 'none', appearance: 'none', cursor: 'pointer',
          }}
        >
          <option value="">Select labour item…</option>
          {filtered.map(row => (
            <option key={row.id ?? row.item_name} value={row.item_name}>
              {row.item_name} — ₹{(row.labour_cost ?? 0).toLocaleString('en-IN')}
            </option>
          ))}
        </select>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <path d="M2.5 5l4.5 4 4.5-4" stroke="#B0B0B0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </Field>
  )
}

// ─── Not-available note field ─────────────────────────────────────────────────
function NotAvailableNote({ value, onChange }) {
  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 8, border: '1px dashed rgba(224,92,106,0.3)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono, monospace)' }}>
        // marked as not_available in this property
      </div>
      <Field label="Note" optional>
        <Textarea value={value || ''} onChange={onChange} placeholder="e.g. No pressure pump in this property" rows={2} />
      </Field>
    </div>
  )
}

// ─── Water Pump form (Primary / Borewell Motor / Pressure Pump) ───────────────
function WaterPumpForm({ data, set, rateCardRows, areaFilter, setRc, issuePresets = [] }) {
  const materialCost =
    data.action === 'Replace' && data.replaceMode === 'Replace Part' ? parseFloat(data.partCost) || 0 :
    data.action === 'Replace' && data.replaceMode === 'Replace Unit' ? parseFloat(data.productCost) || 0 :
    data.action === 'Install' ? parseFloat(data.productInstallCost) || 0 : 0

  const total = materialCost + (parseFloat(data.labourCost) || 0)

  function setAction(v) {
    set('action', v)
    set('replaceMode', '')
    set('labourCost', '')
    set('labourItem', '')
    if (v === 'Install') set('health', 10)
  }

  function setReplaceMode(v) {
    set('replaceMode', v)
    set('labourCost', '')
    set('labourItem', '')
  }

  function setLabour({ itemName, labourCost }) {
    set('labourItem', itemName)
    set('labourCost', labourCost)
  }

  return (
    <div style={FF}>
      {data.notAvailable ? (
        <NotAvailableNote value={data.notAvailableNote} onChange={v => set('notAvailableNote', v)} />
      ) : (
      <>
      {issuePresets.length > 0 && (
        <IssueDescriptionField presets={issuePresets} value={data.issueDescription || ''} onChange={v => set('issueDescription', v)} />
      )}
      {data.action === 'Install' ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 4, background: 'rgba(61,186,122,0.1)', border: '1px solid rgba(61,186,122,0.3)', color: 'var(--green, #3dba7a)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
          <span style={{ width: 6, height: 6, borderRadius: 2, background: 'var(--green, #3dba7a)', display: 'inline-block' }} />
          score: 10 — new_install
        </div>
      ) : (
        <Field label="Health Score">
          <HealthSlider value={data.health} onChange={v => set('health', v)} />
        </Field>
      )}
      <Field label="Attach Media">
        <MediaUpload files={data.media} onChange={v => set('media', v)} />
      </Field>
      <Field label="Action Required">
        <PillGroup
          options={['Functional', 'Repair', 'Replace', 'Install']}
          value={data.action}
          onChange={setAction}
        />
      </Field>

      {/* ── Repair ── */}
      {data.action === 'Repair' && (
        <LabourDropdown
          rateCardRows={rateCardRows}
          areaFilter={areaFilter}
          itemNameContains="Repair"
          value={data.labourItem}
          labourCost={data.labourCost}
          onChange={setLabour}
        />
      )}

      {/* ── Replace ── */}
      {data.action === 'Replace' && (
        <>
          <Field label="Replace Mode">
            <PillGroup
              options={['Replace Part', 'Replace Unit']}
              value={data.replaceMode}
              onChange={setReplaceMode}
            />
          </Field>

          {data.replaceMode === 'Replace Part' && (
            <>
              <Field label="Part Name / Description">
                <Input value={data.partName} onChange={v => set('partName', v)} placeholder="e.g. Impeller, Capacitor…" />
              </Field>
              <Field label="Part Cost (₹)">
                <Input value={data.partCost} onChange={v => set('partCost', v)} placeholder="0" type="number" />
              </Field>
              <LabourDropdown
                rateCardRows={rateCardRows}
                areaFilter={areaFilter}
                itemNameContains="Part Replacement Labour"
                value={data.labourItem}
                labourCost={data.labourCost}
                onChange={setLabour}
              />
            </>
          )}

          {data.replaceMode === 'Replace Unit' && (
            <>
              <Field label="Product Name / Model">
                <Input value={data.productName} onChange={v => set('productName', v)} placeholder="e.g. Grundfos CM3-5…" />
              </Field>
              <Field label="Product Cost (₹)">
                <Input value={data.productCost} onChange={v => set('productCost', v)} placeholder="0" type="number" />
              </Field>
              <LabourDropdown
                rateCardRows={rateCardRows}
                areaFilter={areaFilter}
                itemNameContains="Unit Replacement Labour"
                value={data.labourItem}
                labourCost={data.labourCost}
                onChange={setLabour}
              />
            </>
          )}
        </>
      )}

      {/* ── Install ── */}
      {data.action === 'Install' && (
        <>
          <Field label="Product Details">
            <Input value={data.pumpDetails} onChange={v => set('pumpDetails', v)} placeholder="Pump specifications / model" />
          </Field>
          <Field label="Product Cost (₹)">
            <Input value={data.productInstallCost} onChange={v => set('productInstallCost', v)} placeholder="0" type="number" />
          </Field>
          <LabourDropdown
            rateCardRows={rateCardRows}
            areaFilter={areaFilter}
            itemNameContains="New Installation Labour"
            value={data.labourItem}
            labourCost={data.labourCost}
            onChange={setLabour}
          />
        </>
      )}

      {/* ── Total cost ── */}
      {data.action && data.action !== 'Functional' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 6,
          border: '1px solid var(--border, #2e3040)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Total Cost</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text, #e8e8f0)' }}>
            ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}

      <Field label="Location">
        <Input value={data.location} onChange={v => set('location', v)} placeholder="e.g. Ground floor, north side" />
        <div style={{ marginTop: 8 }}>
          <MediaUpload label="Image / Video of Location" files={data.locationMedia} onChange={v => set('locationMedia', v)} />
        </div>
      </Field>
      <Field label="Capacity" optional>
        <Input value={data.capacity} onChange={v => set('capacity', v)} placeholder="Pump spec — not mandatory" />
      </Field>
      </>
      )}
    </div>
  )
}

// ─── Tank form (Sump Primary / Sump Secondary / Overhead Tank) ───────────────
// areaFilter drives exact rate card lookup:
//   'Sump Tank - Primary'   → 'General Sump Cleaning' / 'Extensive Sump Cleaning'
//   'Sump Tank - Secondary' → same item names, different area filter
//   'Overhead Tank'         → 'General Tank Cleaning'  / 'Extensive Tank Cleaning'
function TankForm({ data, set, rateCardRows, areaFilter, setRc, issuePresets = [] }) {
  const isOverhead = areaFilter.toLowerCase().includes('overhead')
  const generalName   = isOverhead ? 'General Tank Cleaning'   : 'General Sump Cleaning'
  const extensiveName = isOverhead ? 'Extensive Tank Cleaning'  : 'Extensive Sump Cleaning'

  // Exact rate card lookup (case-insensitive)
  function findRow(itemName) {
    return rateCardRows.find(
      r => r.area?.toLowerCase() === areaFilter.toLowerCase()
        && r.item_name?.toLowerCase() === itemName.toLowerCase()
    )
  }

  function setCondition(v) {
    set('cleanliness', v)
    set('cleaningType', '')
    set('labourItem', '')
    set('labourCost', '')
    set('issueReport', '')
    set('issueMedia', [])
    set('repairItem', '')
    set('repairCost', '')
  }

  function setCleaningType(type) {
    set('cleaningType', type)
    const itemName = type === 'General Cleaning' ? generalName : extensiveName
    const row = findRow(itemName)
    set('labourItem', row ? row.item_name : itemName)
    set('labourCost', row ? String(row.labour_cost ?? '') : '')
  }

  const cleaningTotal = parseFloat(data.labourCost) || 0
  const repairTotal   = parseFloat(data.repairCost)  || 0

  return (
    <div style={FF}>
      {data.notAvailable ? (
        <NotAvailableNote value={data.notAvailableNote} onChange={v => set('notAvailableNote', v)} />
      ) : (<>
      {issuePresets.length > 0 && (
        <IssueDescriptionField presets={issuePresets} value={data.issueDescription || ''} onChange={v => set('issueDescription', v)} />
      )}
      <Field label="Health Score">
        <HealthSlider value={data.health} onChange={v => set('health', v)} />
      </Field>
      <Field label="Attach Media">
        <MediaUpload files={data.media} onChange={v => set('media', v)} />
      </Field>
      <Field label="Condition">
        <PillGroup
          options={['Functional', 'Need Cleaning', 'Leakage / Damage']}
          value={data.cleanliness}
          onChange={setCondition}
        />
      </Field>

      {/* ── Need Cleaning ── */}
      {data.cleanliness === 'Need Cleaning' && (
        <>
          <Field label="Cleaning Type">
            <PillGroup
              options={['General Cleaning', 'Extensive Cleaning']}
              value={data.cleaningType}
              onChange={setCleaningType}
            />
          </Field>

          {data.cleaningType && (
            <>
              <Field
                label="Labour Cost"
                hint={data.labourItem ? 'Auto-filled from rate card' : 'Item not found in rate card'}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 6,
                  border: '1px solid var(--border, #2e3040)', background: 'var(--bg-input, #252731)',
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{data.labourItem || '—'}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>
                    ₹{data.labourCost ? parseFloat(data.labourCost).toLocaleString('en-IN') : '—'}
                  </span>
                </div>
              </Field>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 6, border: '1px solid var(--border, #2e3040)' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Total Cost</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text, #e8e8f0)' }}>
                  ₹{cleaningTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                </span>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Leakage / Damage ── */}
      {data.cleanliness === 'Leakage / Damage' && (
        <>
          <Field label="Report Issue">
            <Textarea
              value={data.issueReport}
              onChange={v => set('issueReport', v)}
              placeholder="Describe the leakage or damage in detail…"
              rows={3}
            />
          </Field>
          <Field label="Attach Image / Video">
            <MediaUpload
              label="Add Image / Video of Issue"
              files={data.issueMedia}
              onChange={v => set('issueMedia', v)}
            />
          </Field>
          <LabourDropdown
            rateCardRows={rateCardRows}
            areaFilter={areaFilter}
            itemNameContains="Leakage Repair"
            value={data.repairItem}
            labourCost={data.repairCost}
            onChange={({ itemName, labourCost }) => { set('repairItem', itemName); set('repairCost', labourCost) }}
            label="Repair Cost"
          />
          {data.repairItem && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 6, border: '1px solid var(--border, #2e3040)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Total Cost</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text, #e8e8f0)' }}>
                ₹{repairTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </>
      )}
      </>)}
    </div>
  )
}

// ─── Water Automation ─────────────────────────────────────────────────────────
function WaterAutoForm({ data, set, rateCardRows, areaFilter, setRc, issuePresets = [] }) {
  return (
    <div style={FF}>
      {data.notAvailable ? (
        <NotAvailableNote value={data.notAvailableNote} onChange={v => set('notAvailableNote', v)} />
      ) : (<>
      {issuePresets.length > 0 && (
        <IssueDescriptionField presets={issuePresets} value={data.issueDescription || ''} onChange={v => set('issueDescription', v)} />
      )}
      <Field label="Health Score">
        <HealthSlider value={data.health} onChange={v => set('health', v)} />
      </Field>
      <Field label="Attach Media">
        <MediaUpload files={data.media} onChange={v => set('media', v)} />
      </Field>
      <Field label="Action Required">
        <PillGroup
          options={['Repair', 'Install']}
          value={data.action}
          onChange={v => set('action', v)}
        />
      </Field>
      {data.action === 'Repair' && (
        <Field label="Cost — Based on Actual">
          <Input value={data.cost} onChange={v => set('cost', v)} placeholder="₹ Amount" />
        </Field>
      )}
      {data.action === 'Install' && (
        <Field label="Cost — Approx">
          <Input value={data.cost} onChange={v => set('cost', v)} placeholder="₹ Amount" />
        </Field>
      )}
      </>)}
    </div>
  )
}

// ─── Outdoor Lights — entry sub-cards ────────────────────────────────────────
function LightEntry({ entry, index, onUpdate, onRemove }) {
  const total = (parseFloat(entry.materialCost) || 0) + (parseFloat(entry.labourCost) || 0)
  return (
    <div style={{ marginTop: 10, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{entry.type}</span>
        <button type="button" onClick={() => onRemove(index)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>× remove</button>
      </div>
      <Field label="Material / Description">
        <Input value={entry.material} onChange={v => onUpdate(index, 'material', v)} placeholder={entry.type === 'Outdoor Light' ? 'e.g. LED Flood Light 30W' : 'e.g. CFL Bulb 15W'} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Material Cost (₹)">
          <Input value={entry.materialCost} onChange={v => onUpdate(index, 'materialCost', v)} placeholder="0" type="number" />
        </Field>
        <Field label="Labour Cost (₹)">
          <Input value={entry.labourCost} onChange={v => onUpdate(index, 'labourCost', v)} placeholder="0" type="number" />
        </Field>
      </div>
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-input, #252731)', borderRadius: 6, border: '1px solid var(--border, #2e3040)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>Item Total</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>₹{total.toLocaleString('en-IN')}</span>
        </div>
      )}
    </div>
  )
}

function SwitchboardEntry({ entry, index, onUpdate, onRemove }) {
  const total = (parseFloat(entry.materialCost) || 0) + (parseFloat(entry.labourCost) || 0)
  return (
    <div style={{ marginTop: 10, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{entry.type} Switchboard</span>
        <button type="button" onClick={() => onRemove(index)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>× remove</button>
      </div>
      <Field label="Material / Board Name">
        <Input value={entry.material} onChange={v => onUpdate(index, 'material', v)} placeholder={`e.g. ${entry.type} 4-way switchboard`} />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Material Cost (₹)">
          <Input value={entry.materialCost} onChange={v => onUpdate(index, 'materialCost', v)} placeholder="0" type="number" />
        </Field>
        <Field label="Labour Cost (₹)">
          <Input value={entry.labourCost} onChange={v => onUpdate(index, 'labourCost', v)} placeholder="0" type="number" />
        </Field>
      </div>
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-input, #252731)', borderRadius: 6, border: '1px solid var(--border, #2e3040)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>Item Total</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>₹{total.toLocaleString('en-IN')}</span>
        </div>
      )}
    </div>
  )
}

// ─── Outdoor Lights ───────────────────────────────────────────────────────────
function OutdoorLightsForm({ data, set }) {
  const lightItems      = data.lightItems      || []
  const switchboardItems = data.switchboardItems || []
  const lightCustomItems = data.lightCustomItems || []

  function addLight(type) { set('lightItems', [...lightItems, { type, material: '', materialCost: '', labourCost: '' }]) }
  function updateLight(i, f, v) { const arr = [...lightItems]; arr[i] = { ...arr[i], [f]: v }; set('lightItems', arr) }
  function removeLight(i) { set('lightItems', lightItems.filter((_, idx) => idx !== i)) }

  function addSwitchboard(type) { set('switchboardItems', [...switchboardItems, { type, material: '', materialCost: '', labourCost: '' }]) }
  function updateSwitchboard(i, f, v) { const arr = [...switchboardItems]; arr[i] = { ...arr[i], [f]: v }; set('switchboardItems', arr) }
  function removeSwitchboard(i) { set('switchboardItems', switchboardItems.filter((_, idx) => idx !== i)) }

  function addCustom() { set('lightCustomItems', [...lightCustomItems, { description: '', materialCost: '', labourCost: '' }]) }
  function updateCustom(i, f, v) { const arr = [...lightCustomItems]; arr[i] = { ...arr[i], [f]: v }; set('lightCustomItems', arr) }
  function removeCustom(i) { set('lightCustomItems', lightCustomItems.filter((_, idx) => idx !== i)) }

  const grandTotal = [...lightItems, ...switchboardItems, ...lightCustomItems]
    .reduce((sum, e) => sum + (parseFloat(e.materialCost) || 0) + (parseFloat(e.labourCost) || 0), 0)

  const addBtnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', border: '1px dashed var(--border-dash, #3a3d52)',
    borderRadius: 6, background: 'var(--bg-input, #252731)',
    color: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)',
  }

  return (
    <div style={FF}>
      {data.notAvailable ? (
        <NotAvailableNote value={data.notAvailableNote} onChange={v => set('notAvailableNote', v)} />
      ) : (<>

      {/* Add Lights */}
      <Field label="Add Lights">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={addBtnStyle} onClick={() => addLight('Outdoor Light')}>+ Outdoor Light</button>
          <button type="button" style={addBtnStyle} onClick={() => addLight('General Light')}>+ General Light</button>
        </div>
        {lightItems.map((entry, i) => (
          <LightEntry key={i} entry={entry} index={i} onUpdate={updateLight} onRemove={removeLight} />
        ))}
      </Field>

      {/* Add Switchboard */}
      <Field label="Add Switchboard">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={addBtnStyle} onClick={() => addSwitchboard('5 Amps')}>+ 5 Amps</button>
          <button type="button" style={addBtnStyle} onClick={() => addSwitchboard('15 Amps')}>+ 15 Amps</button>
        </div>
        {switchboardItems.map((entry, i) => (
          <SwitchboardEntry key={i} entry={entry} index={i} onUpdate={updateSwitchboard} onRemove={removeSwitchboard} />
        ))}
      </Field>

      {/* Custom Item */}
      <Field label="Custom Item" optional>
        <button type="button" style={addBtnStyle} onClick={addCustom}>+ Add Custom Item</button>
        {lightCustomItems.map((item, i) => {
          const rowTotal = (parseFloat(item.materialCost) || 0) + (parseFloat(item.labourCost) || 0)
          return (
            <div key={i} style={{ marginTop: 10, background: 'var(--bg-panel, #1e2028)', border: '1px dashed var(--accent, #c8963e)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>custom item</span>
                <button type="button" onClick={() => removeCustom(i)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>× remove</button>
              </div>
              <Field label="Description">
                <Input value={item.description} onChange={v => updateCustom(i, 'description', v)} placeholder="e.g. Wiring fix, fitting replacement…" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Material Cost (₹)">
                  <Input value={item.materialCost} onChange={v => updateCustom(i, 'materialCost', v)} placeholder="0" type="number" />
                </Field>
                <Field label="Labour Cost (₹)">
                  <Input value={item.labourCost} onChange={v => updateCustom(i, 'labourCost', v)} placeholder="0" type="number" />
                </Field>
              </div>
              {rowTotal > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-input, #252731)', borderRadius: 6, border: '1px solid var(--border, #2e3040)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)', fontFamily: 'var(--font-mono, monospace)' }}>Item Total</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)' }}>₹{rowTotal.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          )
        })}
      </Field>

      {grandTotal > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 6, border: '1px solid var(--border, #2e3040)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Total Cost</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text, #e8e8f0)' }}>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
        </div>
      )}

      <Field label="Attach Photos / Videos" optional>
        <MediaUpload files={data.media} onChange={v => set('media', v)} />
      </Field>
      <Field label="Miscellaneous" optional>
        <Textarea value={data.misc} onChange={v => set('misc', v)} placeholder="Any other notes about outdoor lighting…" rows={2} />
      </Field>
      </>)}
    </div>
  )
}

// ─── Main DB ──────────────────────────────────────────────────────────────────
function MainDBForm({ data, set, rateCardRows, areaFilter, setRc, issuePresets = [] }) {
  return (
    <div style={FF}>
      {data.notAvailable ? (
        <NotAvailableNote value={data.notAvailableNote} onChange={v => set('notAvailableNote', v)} />
      ) : (<>
      {issuePresets.length > 0 && (
        <IssueDescriptionField presets={issuePresets} value={data.issueDescription || ''} onChange={v => set('issueDescription', v)} />
      )}
      <Field label="Status">
        <PillGroup
          options={['Functional', 'Report Issue']}
          value={data.status}
          onChange={v => set('status', v)}
        />
      </Field>
      {data.status === 'Functional' && (
        <Field label="Attach Image">
          <MediaUpload files={data.media} onChange={v => set('media', v)} />
        </Field>
      )}
      {data.status === 'Report Issue' && (
        <>
          <Field label="Comments">
            <Textarea value={data.comments} onChange={v => set('comments', v)} placeholder="Describe the issue in detail…" />
          </Field>
          <Field label="Attach Image / Video">
            <MediaUpload files={data.media} onChange={v => set('media', v)} />
          </Field>
        </>
      )}
      </>)}
    </div>
  )
}

// ─── Meter Info ───────────────────────────────────────────────────────────────
function MeterInfoForm({ data, set, rateCardRows, areaFilter, setRc }) {
  return (
    <div style={FF}>
      <Field label="Meter Type">
        <PillGroup
          options={['Single Phase', 'Three Phase']}
          value={data.type}
          onChange={v => set('type', v)}
        />
      </Field>
    </div>
  )
}

// ─── CCTV Camera ──────────────────────────────────────────────────────────────
function CCTVForm({ data, set, rateCardRows, areaFilter, setRc, issuePresets = [] }) {
  return (
    <div style={FF}>
      {data.notAvailable ? (
        <NotAvailableNote value={data.notAvailableNote} onChange={v => set('notAvailableNote', v)} />
      ) : (<>
      {issuePresets.length > 0 && (
        <IssueDescriptionField presets={issuePresets} value={data.issueDescription || ''} onChange={v => set('issueDescription', v)} />
      )}
      <Field label="Availability">
        <PillGroup
          options={['Available', 'N/A']}
          value={data.status}
          onChange={v => set('status', v)}
        />
      </Field>
      {data.status === 'Available' && (
        <>
          <Field label="Attach Image / Video">
            <MediaUpload files={data.media} onChange={v => set('media', v)} />
          </Field>
          <Field label="Condition">
            <PillGroup
              options={['Functional', 'Non-Functional']}
              value={data.functional}
              onChange={v => set('functional', v)}
            />
          </Field>
          {data.functional === 'Functional' && (
            <Field label="Comments" optional>
              <Textarea value={data.comments} onChange={v => set('comments', v)} placeholder="Any observations…" rows={2} />
            </Field>
          )}
          {data.functional === 'Non-Functional' && (
            <Banner type="warning">Checkup required — maintenance to be scheduled.</Banner>
          )}
        </>
      )}
      </>)}
    </div>
  )
}

// ─── Gate / Lock ──────────────────────────────────────────────────────────────
function GateLockForm({ data, set, rateCardRows, areaFilter, setRc, issuePresets = [] }) {
  return (
    <div style={FF}>
      {data.notAvailable ? (
        <NotAvailableNote value={data.notAvailableNote} onChange={v => set('notAvailableNote', v)} />
      ) : (<>
      {issuePresets.length > 0 && (
        <IssueDescriptionField presets={issuePresets} value={data.issueDescription || ''} onChange={v => set('issueDescription', v)} />
      )}
      <Field label="Availability">
        <PillGroup
          options={['Available', 'N/A']}
          value={data.status}
          onChange={v => set('status', v)}
        />
      </Field>
      {data.status === 'Available' && (
        <>
          <Field label="Attach Image">
            <MediaUpload files={data.media} onChange={v => set('media', v)} />
          </Field>
          <Field label="Condition">
            <PillGroup
              options={['Functional', 'Non-Functional']}
              value={data.functional}
              onChange={v => set('functional', v)}
            />
          </Field>
          {data.functional === 'Functional' && (
            <Field label="Comments" optional>
              <Textarea value={data.comments} onChange={v => set('comments', v)} placeholder="Any observations…" rows={2} />
            </Field>
          )}
          {data.functional === 'Non-Functional' && (
            <Banner type="danger">Gate / lock requires immediate attention.</Banner>
          )}
        </>
      )}
      </>)}
    </div>
  )
}

// ─── Custom item form ─────────────────────────────────────────────────────────
function CustomItemForm({ item, onChange, onRemove }) {
  const total = (parseFloat(item.materialCost) || 0) + (parseFloat(item.labourCost) || 0)

  return (
    <div style={{ borderRadius: 8, border: '1px dashed var(--accent, #c8963e)', padding: 14, background: 'var(--bg-input, #252731)', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }}>+ custom item</span>
        <button
          type="button"
          onClick={onRemove}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
        >
          × remove
        </button>
      </div>
      <Field label="Item Name">
        <Input value={item.name} onChange={v => onChange('name', v)} placeholder="e.g. Pressure gauge replacement" />
      </Field>
      <Field label="Issue Description" optional>
        <Textarea value={item.description} onChange={v => onChange('description', v)} placeholder="Describe the issue…" rows={2} />
      </Field>
      <Field label="Action Required" optional>
        <PillGroup
          options={['Repair', 'Replace', 'Install']}
          value={item.action || ''}
          onChange={v => onChange('action', v)}
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Material Cost (₹)">
          <Input value={item.materialCost} onChange={v => onChange('materialCost', v)} placeholder="0" type="number" />
        </Field>
        <Field label="Labour Cost (₹)">
          <Input value={item.labourCost} onChange={v => onChange('labourCost', v)} placeholder="0" type="number" />
        </Field>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Total</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text, #e8e8f0)' }}>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
      </div>
      <Field label="Item Score (1–10)" optional>
        <Input value={item.itemScore} onChange={v => onChange('itemScore', v)} placeholder="1–10" type="number" />
      </Field>
      <Field label="Attach Photos / Videos" optional>
        <MediaUpload files={item.media} onChange={v => onChange('media', v)} />
      </Field>
    </div>
  )
}

// ─── Helpers: localStorage serialisation ─────────────────────────────────────
function stripFiles(obj) {
  if (obj instanceof File) return null
  if (Array.isArray(obj)) {
    if (obj.length && obj[0] instanceof File) return []
    return obj.map(stripFiles)
  }
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, stripFiles(v)]))
  }
  return obj
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return override ?? base
  const result = { ...base }
  Object.keys(base).forEach(k => {
    if (!(k in override)) return
    if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k])) {
      result[k] = deepMerge(base[k] ?? {}, override[k])
    } else {
      result[k] = override[k]
    }
  })
  return result
}

// ─── Helpers: Supabase line-item data ─────────────────────────────────────────
function getItemCosts(item) {
  if ('action' in item) {
    if (item.action === 'Repair')  return { materialCost: 0, labourCost: parseFloat(item.labourCost) || 0 }
    if (item.action === 'Replace') {
      const mat = item.replaceMode === 'Replace Part'
        ? parseFloat(item.partCost)    || 0
        : parseFloat(item.productCost) || 0
      return { materialCost: mat, labourCost: parseFloat(item.labourCost) || 0 }
    }
    if (item.action === 'Install') return { materialCost: parseFloat(item.productInstallCost) || 0, labourCost: parseFloat(item.labourCost) || 0 }
    return { materialCost: 0, labourCost: 0 }
  }
  if ('cleanliness' in item) {
    if (item.cleanliness === 'Need Cleaning')    return { materialCost: 0, labourCost: parseFloat(item.labourCost)  || 0 }
    if (item.cleanliness === 'Leakage / Damage') return { materialCost: 0, labourCost: parseFloat(item.repairCost) || 0 }
    return { materialCost: 0, labourCost: 0 }
  }
  return {
    materialCost: parseFloat(item.rc?.materialCost) || 0,
    labourCost:   parseFloat(item.rc?.labourCost)   || 0,
  }
}

function getIssueDescription(item) {
  // Preset/free-text issue description takes priority
  if (item.issueDescription) return item.issueDescription
  if (item.action) {
    if (item.action === 'Functional') return 'Functional — no action required'
    if (item.action === 'Repair')     return `Repair — ${item.labourItem || 'labour'}`
    if (item.action === 'Replace') {
      if (item.replaceMode === 'Replace Part') return `Replace Part: ${item.partName || 'part'}`
      if (item.replaceMode === 'Replace Unit') return `Replace Unit: ${item.productName || 'unit'}`
      return 'Replace'
    }
    if (item.action === 'Install') return `Install: ${item.pumpDetails || 'new unit'}`
  }
  if (item.cleanliness) {
    if (item.cleanliness === 'Functional')       return 'Functional — no cleaning required'
    if (item.cleanliness === 'Need Cleaning')    return `${item.cleaningType || 'Cleaning'} required`
    if (item.cleanliness === 'Leakage / Damage') return `Leakage / Damage: ${item.issueReport || 'reported'}`
  }
  if (item.status === 'Report Issue') return `Issue reported: ${item.comments || ''}`
  if (item.status === 'Functional')   return 'Functional'
  if (item.status === 'N/A')          return 'N/A'
  if (item.comments) return item.comments
  if (item.rc?.itemName) return item.rc.itemName
  return ''
}

// ─── Config ───────────────────────────────────────────────────────────────────
const TABS = ['Utility', 'Electricals', 'Security']

const SECTIONS = {
  utility: [
    { key: 'waterPumpPrimary',  title: 'Water Pump',       badge: 'Primary',              Form: WaterPumpForm,  areaFilter: 'water pump',          issuePresets: ISSUE_PRESETS.waterPump },
    { key: 'sumpTankPrimary',   title: 'Sump Tank',        badge: 'Primary · Kaveri',     Form: TankForm,       areaFilter: 'Sump Tank - Primary', issuePresets: ISSUE_PRESETS.sumpTank },
    { key: 'overheadTank',      title: 'Overhead Tank',    badge: null,                   Form: TankForm,       areaFilter: 'Overhead Tank',       issuePresets: ISSUE_PRESETS.overheadTank },
    { key: 'sumpTankSecondary', title: 'Sump Tank',        badge: 'Secondary · Borewell', Form: TankForm,       areaFilter: 'Sump Tank - Secondary', issuePresets: ISSUE_PRESETS.sumpTank },
    { key: 'borewellMotor',     title: 'Borewell Motor',   badge: 'Secondary',            Form: WaterPumpForm,  areaFilter: 'borewell',            issuePresets: ISSUE_PRESETS.borewellMotor },
    { key: 'waterAutomation',   title: 'Water Automation', badge: null,                   Form: WaterAutoForm,  areaFilter: 'water automation',    issuePresets: ISSUE_PRESETS.waterAutomation },
    { key: 'pressurePump',      title: 'Pressure Pump',    badge: null,                   Form: WaterPumpForm,  areaFilter: 'pressure pump',       issuePresets: ISSUE_PRESETS.waterPump },
  ],
  electricals: [
    { key: 'outdoorLights', title: 'Outdoor Lights', badge: null, Form: OutdoorLightsForm, areaFilter: ['outdoor light', 'lights'], issuePresets: [] },
    { key: 'mainDB',        title: 'Main DB',         badge: null, Form: MainDBForm,        areaFilter: 'main db',                   issuePresets: ISSUE_PRESETS.mainDB },
    { key: 'meterInfo',     title: 'Meter Info',      badge: null, Form: MeterInfoForm,     areaFilter: 'meter',                     issuePresets: [] },
  ],
  security: [
    { key: 'cctvCamera', title: 'CCTV Camera', badge: null, Form: CCTVForm,     areaFilter: 'cctv',           issuePresets: ISSUE_PRESETS.cctvCamera },
    { key: 'gateLock',   title: 'Gate / Lock', badge: null, Form: GateLockForm, areaFilter: ['gate', 'lock'], issuePresets: ISSUE_PRESETS.gateLock },
  ],
}

const sectionKeys = ['utility', 'electricals', 'security']

// ─── Initial data ─────────────────────────────────────────────────────────────
const rc      = () => ({ itemName: '', materialCost: '', labourCost: '' })
const pump    = () => ({ notAvailable: false, notAvailableNote: '', issueDescription: '', health: null, media: [], action: '', replaceMode: '', partName: '', partCost: '', productName: '', productCost: '', pumpDetails: '', productInstallCost: '', labourCost: '', labourItem: '', location: '', locationMedia: [], capacity: '', rc: rc() })
const tank    = () => ({ notAvailable: false, notAvailableNote: '', issueDescription: '', health: null, media: [], cleanliness: '', cleaningType: '', labourItem: '', labourCost: '', issueReport: '', issueMedia: [], repairItem: '', repairCost: '', rc: rc() })
const auto    = () => ({ notAvailable: false, notAvailableNote: '', issueDescription: '', health: null, media: [], action: '', cost: '', rc: rc() })

const INITIAL = {
  utility:     { waterPumpPrimary: pump(), sumpTankPrimary: tank(), overheadTank: tank(), sumpTankSecondary: tank(), borewellMotor: pump(), waterAutomation: auto(), pressurePump: pump() },
  electricals: { outdoorLights: { notAvailable: false, notAvailableNote: '', lightItems: [], switchboardItems: [], lightCustomItems: [], misc: '', media: [], rc: rc() }, mainDB: { notAvailable: false, notAvailableNote: '', issueDescription: '', status: '', media: [], comments: '', rc: rc() }, meterInfo: { type: '', rc: rc() } },
  security:    { cctvCamera: { notAvailable: false, notAvailableNote: '', issueDescription: '', status: '', media: [], functional: '', comments: '', rc: rc() }, gateLock: { notAvailable: false, notAvailableNote: '', issueDescription: '', status: '', media: [], functional: '', comments: '', rc: rc() } },
}

// ─── Main component ───────────────────────────────────────────────────────────
const BLANK_CUSTOM = () => ({
  id: `ci_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  name: '', description: '', materialCost: '', labourCost: '',
  itemScore: '', media: [], rc: { itemName: '', materialCost: '', labourCost: '' },
})

export default function InspectionOutdoor() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const pid       = state?.pid

  // ── State — lazy-init restores localStorage draft ──
  const [data, setData] = useState(() => {
    if (!pid) return INITIAL
    try {
      const saved = localStorage.getItem(`flentfix_outdoor_draft_${pid}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.data) return deepMerge(INITIAL, parsed.data)
      }
    } catch (_) {}
    return INITIAL
  })

  const [customItems, setCustomItems] = useState(() => {
    if (!pid) return {}
    try {
      const saved = localStorage.getItem(`flentfix_outdoor_draft_${pid}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.customItems) return parsed.customItems
      }
    } catch (_) {}
    return {}
  })

  const [tab,          setTab]          = useState(0)
  const [openCard,     setOpenCard]     = useState(null)
  const [rateCardRows, setRateCardRows] = useState([])
  const [isEstimating, setIsEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState('')

  // ── Fetch rate card ──
  useEffect(() => {
    if (!pid) { navigate('/inspections/new', { replace: true }); return }
    supabase.from('rate_card').select('*').order('area')
      .then(({ data: rows }) => { if (rows) setRateCardRows(rows) })
  }, [])

  // ── Auto-save draft to localStorage (strips File objects) ──
  useEffect(() => {
    if (!pid) return
    localStorage.setItem(
      `flentfix_outdoor_draft_${pid}`,
      JSON.stringify({ data: stripFiles(data), customItems: stripFiles(customItems) })
    )
  }, [data, customItems])

  if (!pid) return null

  // ── Data update helpers ──
  function update(section, key, field, value) {
    setData(prev => ({
      ...prev,
      [section]: { ...prev[section], [key]: { ...prev[section][key], [field]: value } },
    }))
  }

  function updateRc(section, key, patch) {
    setData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: { ...prev[section][key], rc: { ...prev[section][key].rc, ...patch } },
      },
    }))
  }

  // ── Custom item helpers (section-level) ──
  function getCI(sk) { return customItems[sk] || [] }

  function setCI(sk, items) {
    setCustomItems(prev => ({ ...prev, [sk]: items }))
  }

  function addCustomItem(sk) { setCI(sk, [...getCI(sk), BLANK_CUSTOM()]) }

  function removeCustomItem(sk, idx) { setCI(sk, getCI(sk).filter((_, i) => i !== idx)) }

  function updateCustomItem(sk, idx, field, value) {
    const arr = [...getCI(sk)]
    arr[idx] = { ...arr[idx], [field]: value }
    setCI(sk, arr)
  }

  // ── Navigation ──
  function toggleCard(key)   { setOpenCard(p => p === key ? null : key) }
  function handleTabChange(i) { setTab(i); setOpenCard(null) }

  // ── Completion counts (fixed items only — custom items are bonus) ──
  const counts = sectionKeys.reduce((acc, sk, i) => {
    const done  = SECTIONS[sk].filter(s => isDone(data[sk][s.key])).length
    const total = SECTIONS[sk].length
    acc[i]            = done
    acc[`${i}_total`] = total
    return acc
  }, {})

  const totalDone  = sectionKeys.reduce((s, sk) => s + SECTIONS[sk].filter(item => isDone(data[sk][item.key])).length, 0)
  const totalItems = sectionKeys.reduce((s, sk) => s + SECTIONS[sk].length, 0)
  const progress   = Math.round((totalDone / totalItems) * 100)

  const sk     = sectionKeys[tab]
  const items  = SECTIONS[sk]
  const isLast = tab === TABS.length - 1

  // ── Create estimate from outdoor data ──
  async function handleCreateEstimate() {
    setIsEstimating(true)
    setEstimateError('')

    const today = new Date().toISOString().split('T')[0]
    const { data: ins, error: insErr } = await supabase
      .from('inspections')
      .insert({
        pid,
        inspection_date: today,
        house_type: state.inspectionType,
        status: 'draft',
        config: { layout: state.layout, inspection_type: state.inspectionType, scope: 'outdoor' },
      })
      .select('id')
      .single()

    if (insErr) { setEstimateError(insErr.message); setIsEstimating(false); return }

    const inspectionId = ins.id
    const lineItemRows = []
    const mediaArrays  = []

    sectionKeys.forEach((sectionKey, tabIdx) => {
      const sectionName = TABS[tabIdx]

      SECTIONS[sectionKey].forEach(({ key, title }) => {
        const item = data[sectionKey][key]
        if (!item) return
        if (item.notAvailable) {
          lineItemRows.push({
            inspection_id:        inspectionId,
            section_name:         sectionName,
            area:                 title,
            issue_description:    item.notAvailableNote || 'Not available in property',
            material_cost:        0,
            labour_cost:          0,
            item_score:           null,
            availability_status:  'not_available',
          })
          mediaArrays.push([])
          return
        }

        // Expand outdoor lights into per-item line items
        if (Array.isArray(item.lightItems) || Array.isArray(item.switchboardItems) || Array.isArray(item.lightCustomItems)) {
          const sectionMedia = Array.isArray(item.media) ? item.media.filter(f => f instanceof File) : []
          const allEntries = [
            ...(item.lightItems      || []).map(e => ({ area: e.type || 'Light',           desc: e.material || e.type || 'Light',              mat: parseFloat(e.materialCost) || 0, lab: parseFloat(e.labourCost) || 0 })),
            ...(item.switchboardItems || []).map(e => ({ area: `${e.type} Switchboard`,    desc: e.material || `${e.type} Switchboard`,          mat: parseFloat(e.materialCost) || 0, lab: parseFloat(e.labourCost) || 0 })),
            ...(item.lightCustomItems || []).map(e => ({ area: e.description || 'Custom',  desc: e.description || 'Custom Item',                 mat: parseFloat(e.materialCost) || 0, lab: parseFloat(e.labourCost) || 0 })),
          ]
          if (allEntries.length === 0) {
            // nothing added — push a placeholder if misc/media exists
            if (item.misc || sectionMedia.length) {
              lineItemRows.push({ inspection_id: inspectionId, section_name: sectionName, area: title, issue_description: item.misc || 'Outdoor Lights checked', material_cost: 0, labour_cost: 0, item_score: 5 })
              mediaArrays.push(sectionMedia)
            }
          } else {
            allEntries.forEach((e, idx) => {
              lineItemRows.push({ inspection_id: inspectionId, section_name: sectionName, area: e.area, issue_description: e.desc, material_cost: e.mat, labour_cost: e.lab, item_score: 5 })
              mediaArrays.push(idx === 0 ? sectionMedia : [])
            })
          }
          return
        }

        const costs = getItemCosts(item)
        lineItemRows.push({
          inspection_id:     inspectionId,
          section_name:      sectionName,
          area:              item.location || title,
          issue_description: getIssueDescription(item),
          material_cost:     costs.materialCost,
          labour_cost:       costs.labourCost,
          item_score:        item.action === 'Install' ? 10 : (item.health != null ? item.health : 5),
        })
        mediaArrays.push([
          ...(Array.isArray(item.media)         ? item.media.filter(f => f instanceof File)         : []),
          ...(Array.isArray(item.locationMedia) ? item.locationMedia.filter(f => f instanceof File) : []),
          ...(Array.isArray(item.issueMedia)    ? item.issueMedia.filter(f => f instanceof File)    : []),
        ])

      })

      // Section-level custom items
      getCI(sectionKey).forEach(ci => {
        lineItemRows.push({
          inspection_id:     inspectionId,
          section_name:      sectionName,
          area:              ci.name || 'Custom Item',
          issue_description: ci.description || (ci.action ? `Action: ${ci.action}` : ''),
          material_cost:     parseFloat(ci.materialCost) || 0,
          labour_cost:       parseFloat(ci.labourCost)   || 0,
          item_score:        ci.itemScore ? parseFloat(ci.itemScore) : 5,
        })
        mediaArrays.push(Array.isArray(ci.media) ? ci.media.filter(f => f instanceof File) : [])
      })
    })

    if (lineItemRows.length) {
      const { data: inserted, error: liErr } = await supabase
        .from('inspection_line_items')
        .insert(lineItemRows)
        .select('id')

      if (liErr) { setEstimateError(liErr.message); setIsEstimating(false); return }

      for (let i = 0; i < inserted.length; i++) {
        const files = mediaArrays[i] || []
        if (files.length) await uploadMediaFiles(inspectionId, inserted[i].id, files)
      }
    }

    localStorage.removeItem(`flentfix_outdoor_draft_${pid}`)
    navigate(`/estimate/${inspectionId}`)
  }

  // ── Render ──
  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>

      <NavBar
        title="outdoor_inspection"
        subtitle={`${pid} · ${state.layout}`}
        onBack={() => navigate('/inspections/mode', { state })}
        right={
          <div style={{ fontSize: 11, fontWeight: 700, color: progress === 100 ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>
            {progress}%
          </div>
        }
      />

      <div style={{ height: 2, background: 'var(--border, #2e3040)' }}>
        <div style={{ height: '100%', background: 'var(--accent, #c8963e)', width: `${progress}%`, transition: 'width 0.4s ease' }} />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={handleTabChange} counts={counts} />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }} key={tab} className="animate-fadeUp">

          <div style={{ padding: '8px 4px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{TABS[tab]}</span>
            <span style={{ fontSize: 11, color: counts[tab] === counts[`${tab}_total`] ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
              {counts[tab]} / {counts[`${tab}_total`]} complete
            </span>
          </div>

          {items.map(({ key, title, badge, Form, areaFilter, issuePresets = [] }) => {
            const item = data[sk][key]
            const done = isDone(item)

            const naToggle = (
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, background: item.notAvailable ? 'rgba(224,92,106,0.1)' : 'var(--bg-input, #252731)', border: `1px solid ${item.notAvailable ? 'rgba(224,92,106,0.3)' : 'var(--border, #2e3040)'}`, transition: 'background 0.15s' }}>
                <input
                  type="checkbox"
                  checked={item.notAvailable || false}
                  onChange={e => update(sk, key, 'notAvailable', e.target.checked)}
                  style={{ width: 12, height: 12, accentColor: 'var(--red, #e05c6a)', cursor: 'pointer', flexShrink: 0 }}
                />
                <span style={{ fontSize: 10, fontWeight: 600, color: item.notAvailable ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>
                  {item.notAvailable ? 'n/a' : 'not avail'}
                </span>
              </label>
            )

            return (
              <AccordionCard
                key={key}
                title={title}
                badge={badge}
                status={done ? 'done' : openCard === key ? 'partial' : null}
                isOpen={openCard === key}
                onToggle={() => toggleCard(key)}
                headerAction={naToggle}
              >
                <Form
                  data={item}
                  set={(field, value) => update(sk, key, field, value)}
                  rateCardRows={rateCardRows}
                  areaFilter={areaFilter}
                  setRc={patch => updateRc(sk, key, patch)}
                  issuePresets={issuePresets}
                />
              </AccordionCard>
            )
          })}

          {/* ── section-level custom items ── */}
          {getCI(sk).map((ci, idx) => (
            <CustomItemForm
              key={ci.id}
              item={ci}
              onChange={(field, value) => updateCustomItem(sk, idx, field, value)}
              onRemove={() => removeCustomItem(sk, idx)}
            />
          ))}

          {/* ── add custom item (section level) ── */}
          <button
            type="button"
            onClick={() => addCustomItem(sk)}
            style={{
              marginTop: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '11px 14px',
              border: '1px dashed var(--accent, #c8963e)', borderRadius: 8,
              background: 'rgba(200,150,62,0.04)', fontSize: 12, fontWeight: 600,
              color: 'var(--accent, #c8963e)', cursor: 'pointer',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            + add_custom_item
          </button>
        </div>
      </div>

      <StickyFooter left={
        tab > 0 ? (
          <button
            onClick={() => handleTabChange(tab - 1)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid var(--border-dash, #3a3d52)', borderRadius: 6, background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
          >
            ← {TABS[tab - 1]}
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>outdoor</div>
            <div style={{ fontSize: 11, color: estimateError ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
              {estimateError || `${totalDone} of ${totalItems} complete`}
            </div>
          </div>
        )
      }>
        {isLast ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleCreateEstimate}
              disabled={isEstimating}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '11px 14px',
                border: '1px solid var(--border-dash, #3a3d52)',
                borderRadius: 6,
                background: 'transparent',
                fontSize: 12, fontWeight: 600,
                color: isEstimating ? 'var(--text-muted, #6b6d82)' : 'var(--text-dim, #9394a8)',
                cursor: isEstimating ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {isEstimating ? 'Saving…' : '📋 Create Estimate'}
            </button>
            <BtnPrimary onClick={() => navigate('/inspections/indoor', { state: { ...state, outdoor: data, customItems } })}>
              Indoor →
            </BtnPrimary>
          </div>
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
