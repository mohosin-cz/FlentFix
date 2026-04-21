import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { uploadMediaFiles } from './InspectionOutdoor'
import {
  NavBar, TabBar, Field, Input, Textarea, PillGroup,
  HealthSlider, AccordionCard, StickyFooter, BtnPrimary,
} from '../components/ui'
import QuickNotes from '../components/QuickNotes'

// ── Issue presets ─────────────────────────────────────────────────────────────
const I = {
  switchboard:    ['Functional','Switch not working','Socket dead','Partial failure','Burning smell','Needs replacement','Other'],
  ceilingLight:   ['Functional','Not working','Flickering','Fitting loose','Needs replacement','Other'],
  doorBell:       ['Functional','Not working','No sound','Needs replacement','Other'],
  mainDoor:       ['Functional','Misaligned','Lock not working','Hinge loose','Door bush worn','Towerbolt issue','Needs replacement','Other'],
  window:         ['Functional','Latch broken','Glass cracked','Mosquito net torn','Misaligned','Towerbolt issue','Other'],
  flooring:       ['Functional','Crack','Loose tile','Stain','Needs replacement','Other'],
  walls:          ['Functional','Peeling paint','Damp patch','Crack','Scuff marks','Other'],
  ceilingFan:     ['Functional','Not working','Wobbling','Noise','Speed issue','Needs replacement','Other'],
  exhaustFan:     ['Functional','Not working','Noise','Needs replacement','Other'],
  acPoint:        ['Functional','Socket dead','Not earthed','Other'],
  ceiling:        ['Functional','Crack','Seepage stain','Peeling','Other'],
  balconyDoor:    ['Functional','Misaligned','Lock not working','Glass damaged','Other'],
  tvUnit:         ['Functional','Hinge loose','Shutter damaged','Handle missing','Other'],
  grille:         ['Functional','Loose','Rust','Damaged','Other'],
  drain:          ['Functional','Blocked','Slow drain','Other'],
  wardrobe:       ['Functional','Hinge loose','Shutter misaligned','Drawer channel worn','Lock issue','Handle missing','Other'],
  curtainRod:     ['Functional','Loose','Bent','Bracket broken','Other'],
  geyser:         ['Functional','Not heating','Leaking','Tripping','Needs replacement','Other'],
  mirrorLight:    ['Functional','Not working','Flickering','Fitting loose','Other'],
  tap:            ['Functional','Dripping','Low pressure','No hot water','Needs replacement','Other'],
  shower:         ['Functional','Not working','Low pressure','Leaking','Needs replacement','Other'],
  flush:          ['Functional','Not flushing fully','Running continuously','Handle broken','Needs replacement','Other'],
  jetSpray:       ['Functional','Not working','Leaking','Needs replacement','Other'],
  hotCold:        ['Functional','Not working','Dripping','Cartridge issue','Needs replacement','Other'],
  tileCrack:      ['Functional','Crack','Loose tile','Grout damaged','Other'],
  mirror:         ['Functional','Cracked','Missing','Loose','Other'],
  towelRod:       ['Functional','Loose','Missing','Rusted','Other'],
  soapDish:       ['Functional','Loose','Missing','Broken','Other'],
  chimney:        ['Functional','Not working','Service due','Suction weak','Needs replacement','Other'],
  sinkTap:        ['Functional','Dripping','Low pressure','Blocked drain','Needs replacement','Other'],
  ro:             ['Functional','Not dispensing','Filter change due','Leaking','Other'],
  cabinetHinge:   ['Functional','Loose','Broken','Needs replacement','Other'],
  cabinetShutter: ['Functional','Misaligned','Damaged','Handle missing','Other'],
  drawerChannel:  ['Functional','Stiff','Broken','Needs replacement','Other'],
  counter:        ['Functional','Crack','Stain','Chipped edge','Other'],
  wmPoint:        ['Functional','Socket dead','No earthing','Other'],
  wmInlet:        ['Functional','Blocked','Leaking','Other'],
}

// ── Section definitions ───────────────────────────────────────────────────────
const ENTRANCE_SECTIONS = [
  { id: 'electrical', label: 'Electrical', items: [
    { key: 'switchboard',  label: 'Switchboard',  trade: 'electrical', issues: I.switchboard  },
    { key: 'ceilingLight', label: 'Ceiling Light', trade: 'electrical', issues: I.ceilingLight },
    { key: 'doorBell',     label: 'Door Bell',     trade: 'electrical', issues: I.doorBell     },
  ]},
  { id: 'woodwork', label: 'Woodwork', items: [
    { key: 'mainDoor', label: 'Main Door', trade: 'woodwork', issues: I.mainDoor },
    { key: 'window',   label: 'Window',   trade: 'woodwork', issues: I.window   },
  ]},
  { id: 'misc', label: 'Misc', items: [
    { key: 'flooring', label: 'Flooring', trade: 'misc', issues: I.flooring },
    { key: 'walls',    label: 'Walls',    trade: 'misc', issues: I.walls    },
  ]},
]

const LIVING_ROOM_SECTIONS = [
  { id: 'electrical', label: 'Electrical', items: [
    { key: 'switchboard',  label: 'Switchboard',  trade: 'electrical', issues: I.switchboard  },
    { key: 'ceilingLight', label: 'Ceiling Light', trade: 'electrical', issues: I.ceilingLight },
    { key: 'ceilingFan',   label: 'Ceiling Fan',   trade: 'electrical', issues: I.ceilingFan   },
    { key: 'exhaustFan',   label: 'Exhaust Fan',   trade: 'electrical', issues: I.exhaustFan   },
    { key: 'acPoint',      label: 'AC Point',      trade: 'electrical', issues: I.acPoint      },
  ]},
  { id: 'woodwork', label: 'Woodwork', items: [
    { key: 'mainDoor',    label: 'Main Door',    trade: 'woodwork', issues: I.mainDoor    },
    { key: 'balconyDoor', label: 'Balcony Door', trade: 'woodwork', issues: I.balconyDoor },
    { key: 'window',      label: 'Window',       trade: 'woodwork', issues: I.window      },
    { key: 'tvUnit',      label: 'TV Unit',      trade: 'woodwork', issues: I.tvUnit      },
  ]},
  { id: 'misc', label: 'Misc', items: [
    { key: 'flooring', label: 'Flooring', trade: 'misc', issues: I.flooring },
    { key: 'walls',    label: 'Walls',    trade: 'misc', issues: I.walls    },
    { key: 'ceiling',  label: 'Ceiling',  trade: 'misc', issues: I.ceiling  },
  ]},
  { id: 'balcony', label: 'Balcony', divider: '— Balcony —', items: [
    { key: 'balconyFlooring', label: 'Flooring',         trade: 'misc',       issues: I.flooring    },
    { key: 'grille',          label: 'Grille / Railing', trade: 'woodwork',   issues: I.grille      },
    { key: 'balconyLight',    label: 'Light',            trade: 'electrical', issues: I.ceilingLight },
    { key: 'drain',           label: 'Drain',            trade: 'plumbing',   issues: I.drain       },
  ]},
]

function bedroomSections(idx, total) {
  const secs = [
    { id: 'electrical', label: 'Electrical', items: [
      { key: 'switchboard',  label: 'Switchboard',  trade: 'electrical', issues: I.switchboard  },
      { key: 'ceilingLight', label: 'Ceiling Light', trade: 'electrical', issues: I.ceilingLight },
      { key: 'ceilingFan',   label: 'Ceiling Fan',   trade: 'electrical', issues: I.ceilingFan   },
      { key: 'acPoint',      label: 'AC Point',      trade: 'electrical', issues: I.acPoint      },
    ]},
    { id: 'woodwork', label: 'Woodwork', items: [
      { key: 'mainDoor',   label: 'Main Door',   trade: 'woodwork', issues: I.mainDoor   },
      { key: 'window',     label: 'Window',      trade: 'woodwork', issues: I.window     },
      { key: 'wardrobe',   label: 'Wardrobe',    trade: 'woodwork', issues: I.wardrobe   },
      { key: 'curtainRod', label: 'Curtain Rod', trade: 'woodwork', issues: I.curtainRod },
    ]},
    { id: 'misc', label: 'Misc', items: [
      { key: 'flooring', label: 'Flooring', trade: 'misc', issues: I.flooring },
      { key: 'walls',    label: 'Walls',    trade: 'misc', issues: I.walls    },
      { key: 'ceiling',  label: 'Ceiling',  trade: 'misc', issues: I.ceiling  },
    ]},
    { id: 'bathroom', label: 'Attached Bathroom', divider: '— Attached Bathroom —', items: [
      { key: 'bSwitchboard', label: 'Switchboard',      trade: 'electrical', issues: I.switchboard  },
      { key: 'geyser',       label: 'Geyser',           trade: 'electrical', issues: I.geyser       },
      { key: 'exhaustFan',   label: 'Exhaust Fan',      trade: 'electrical', issues: I.exhaustFan   },
      { key: 'mirrorLight',  label: 'Mirror Light',     trade: 'electrical', issues: I.mirrorLight  },
      { key: 'tap',          label: 'Tap / Basin Mixer',trade: 'plumbing',   issues: I.tap          },
      { key: 'shower',       label: 'Shower',           trade: 'plumbing',   issues: I.shower       },
      { key: 'flush',        label: 'Flush Mechanism',  trade: 'plumbing',   issues: I.flush        },
      { key: 'jetSpray',     label: 'Jet Spray',        trade: 'plumbing',   issues: I.jetSpray     },
      { key: 'hotCold',      label: 'Hot/Cold Mixer',   trade: 'plumbing',   issues: I.hotCold      },
      { key: 'bDoor',        label: 'Door',             trade: 'woodwork',   issues: I.mainDoor     },
      { key: 'floorTiles',   label: 'Floor Tiles',      trade: 'misc',       issues: I.tileCrack    },
      { key: 'wallTiles',    label: 'Wall Tiles',       trade: 'misc',       issues: I.tileCrack    },
      { key: 'mirror',       label: 'Mirror',           trade: 'misc',       issues: I.mirror       },
      { key: 'towelRod',     label: 'Towel Rod',        trade: 'misc',       issues: I.towelRod     },
      { key: 'soapDish',     label: 'Soap Dish',        trade: 'misc',       issues: I.soapDish     },
    ]},
  ]
  if (idx === total && total >= 2) {
    secs.push({ id: 'commonBath', label: 'Common Bathroom', divider: '— Common Bathroom —', items: [
      { key: 'cbSw',    label: 'Switchboard',      trade: 'electrical', issues: I.switchboard  },
      { key: 'cbGey',   label: 'Geyser',           trade: 'electrical', issues: I.geyser       },
      { key: 'cbExh',   label: 'Exhaust Fan',      trade: 'electrical', issues: I.exhaustFan   },
      { key: 'cbMl',    label: 'Mirror Light',     trade: 'electrical', issues: I.mirrorLight  },
      { key: 'cbTap',   label: 'Tap / Basin Mixer',trade: 'plumbing',   issues: I.tap          },
      { key: 'cbSh',    label: 'Shower',           trade: 'plumbing',   issues: I.shower       },
      { key: 'cbFl',    label: 'Flush Mechanism',  trade: 'plumbing',   issues: I.flush        },
      { key: 'cbJs',    label: 'Jet Spray',        trade: 'plumbing',   issues: I.jetSpray     },
      { key: 'cbHc',    label: 'Hot/Cold Mixer',   trade: 'plumbing',   issues: I.hotCold      },
      { key: 'cbDr',    label: 'Door',             trade: 'woodwork',   issues: I.mainDoor     },
      { key: 'cbFt',    label: 'Floor Tiles',      trade: 'misc',       issues: I.tileCrack    },
      { key: 'cbWt',    label: 'Wall Tiles',       trade: 'misc',       issues: I.tileCrack    },
      { key: 'cbMi',    label: 'Mirror',           trade: 'misc',       issues: I.mirror       },
      { key: 'cbTr',    label: 'Towel Rod',        trade: 'misc',       issues: I.towelRod     },
      { key: 'cbSd',    label: 'Soap Dish',        trade: 'misc',       issues: I.soapDish     },
    ]})
  }
  return secs
}

const KITCHEN_SECTIONS = [
  { id: 'electrical', label: 'Electrical', items: [
    { key: 'switchboard',  label: 'Switchboard',       trade: 'electrical', issues: I.switchboard  },
    { key: 'ceilingLight', label: 'Ceiling Light',      trade: 'electrical', issues: I.ceilingLight },
    { key: 'chimney',      label: 'Chimney / Exhaust',  trade: 'electrical', issues: I.chimney      },
  ]},
  { id: 'plumbing', label: 'Plumbing', items: [
    { key: 'sinkTap', label: 'Sink Tap',            trade: 'plumbing', issues: I.sinkTap },
    { key: 'ro',      label: 'RO / Water Purifier', trade: 'plumbing', issues: I.ro      },
  ]},
  { id: 'woodwork', label: 'Woodwork', items: [
    { key: 'cabinetHinge',   label: 'Cabinet Hinges',   trade: 'woodwork', issues: I.cabinetHinge   },
    { key: 'cabinetShutter', label: 'Cabinet Shutters', trade: 'woodwork', issues: I.cabinetShutter },
    { key: 'drawerChannel',  label: 'Drawer Channels',  trade: 'woodwork', issues: I.drawerChannel  },
  ]},
  { id: 'misc', label: 'Misc', items: [
    { key: 'flooring',  label: 'Flooring',        trade: 'misc', issues: I.flooring  },
    { key: 'wallTiles', label: 'Wall Tiles',       trade: 'misc', issues: I.tileCrack },
    { key: 'counter',   label: 'Counter Surface',  trade: 'misc', issues: I.counter   },
  ]},
  { id: 'utility', label: 'Utility', divider: '— Utility —', items: [
    { key: 'wmPoint',      label: 'Washing Machine Point', trade: 'electrical', issues: I.wmPoint      },
    { key: 'wmInlet',      label: 'Washing Machine Inlet', trade: 'plumbing',   issues: I.wmInlet      },
    { key: 'utilityLight', label: 'Utility Light',         trade: 'electrical', issues: I.ceilingLight },
  ]},
]

const GENERAL_ITEMS = [
  { key: 'deepCleaning',  label: 'Deep Cleaning',     trade: 'cleaning', areaOptions: ['All Rooms','Living Room','Kitchen','Bedroom(s)','Bathrooms'], multiSelect: true },
  { key: 'pestControl',   label: 'Pest Control',       trade: 'cleaning', areaOptions: ['Kitchen','Full Home','Specific rooms'], multiSelect: false },
  { key: 'painting',      label: 'Full Home Painting', trade: 'misc',     areaOptions: ['Full','Partial'], multiSelect: false, hasPartialRooms: true },
  { key: 'floorBuffing',  label: 'Floor Buffing',      trade: 'misc',     areaOptions: ['All','Specific rooms'], multiSelect: false },
  { key: 'waterproofing', label: 'Waterproofing',      trade: 'plumbing', areaOptions: ['Bathroom(s)','Balcony','Terrace'], multiSelect: true },
  { key: 'carpentry',     label: 'Carpentry Touch-up', trade: 'woodwork', freeText: true },
]

// ── Tab builder ───────────────────────────────────────────────────────────────
function parseBHK(layout) {
  const m = (layout || '').match(/(\d)BHK/i)
  return m ? parseInt(m[1]) : 1
}

function isIndependentHome(houseType) {
  const v = (houseType || '').toLowerCase().replace(/[\s_-]+/g, '_')
  return v === 'independent_home' || v === 'independenthome'
}

function buildTabs(houseType, bhk) {
  const tabs = []
  if (isIndependentHome(houseType)) tabs.push({ id: 'entrance', label: 'Entrance', sections: ENTRANCE_SECTIONS })
  tabs.push({ id: 'living_room', label: 'Living Room', sections: LIVING_ROOM_SECTIONS })
  for (let i = 1; i <= bhk; i++) {
    tabs.push({ id: `bedroom_${i}`, label: `Bedroom ${i}`, sections: bedroomSections(i, bhk) })
  }
  tabs.push({ id: 'kitchen', label: 'Kitchen', sections: KITCHEN_SECTIONS })
  tabs.push({ id: 'general', label: 'General', sections: null })
  return tabs
}

// ── State helpers ─────────────────────────────────────────────────────────────
const blankCard = () => ({ issueDescription: '', health: null, action: '', labourRateId: '', labourCost: '', materialCost: '', notes: '', media: [], notAvailable: false, notAvailableNote: '' })
const blankGeneral = () => ({ enabled: false, areas: [], partialRooms: '', labourCost: '', notes: '', media: [], description: '' })

function buildInitialState(tabs) {
  const s = {}
  tabs.forEach(tab => {
    if (tab.id === 'general') {
      s.general = {}
      GENERAL_ITEMS.forEach(g => { s.general[g.key] = blankGeneral() })
      return
    }
    s[tab.id] = {}
    tab.sections.forEach(sec => {
      s[tab.id][sec.id] = {}
      sec.items.forEach(item => { s[tab.id][sec.id][item.key] = [blankCard()] })
    })
  })
  return s
}

function stripFiles(obj) {
  if (obj instanceof File) return null
  if (Array.isArray(obj)) {
    if (obj.length && obj[0] instanceof File) return []
    return obj.map(stripFiles)
  }
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

function countItems(tabs, data) {
  let done = 0, total = 0
  tabs.forEach(tab => {
    if (tab.id === 'general') {
      GENERAL_ITEMS.forEach(g => {
        total++
        const d = data.general?.[g.key]
        if (d && (!d.enabled || d.labourCost || d.description || d.areas?.length)) done++
      })
      return
    }
    tab.sections?.forEach(sec => {
      sec.items.forEach(item => {
        const cards = data[tab.id]?.[sec.id]?.[item.key] || []
        cards.forEach(card => { total++; if (card.issueDescription || card.notAvailable) done++ })
      })
    })
  })
  return { done, total }
}

// ── MediaUpload (mirrored from outdoor) ───────────────────────────────────────
const SHEET_BTN = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%', padding: '12px 18px', border: '1px solid var(--border, #2e3040)', borderRadius: 8, background: 'var(--bg-input, #252731)', color: 'var(--text-dim, #9394a8)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }

function Thumb({ file }) {
  const [url, setUrl] = useState(null)
  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u) }, [file])
  if (!url) return null
  if (file.type.startsWith('video')) return <video src={url} muted playsInline style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />
  return <img src={url} alt="" style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />
}

function MediaUpload({ files = [], onChange, label = 'Attach Photos / Videos' }) {
  const cameraRef = useRef(null)
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

// ── Issue description field ───────────────────────────────────────────────────
function IssueField({ presets, value, onChange }) {
  const inPreset = presets.includes(value)
  const [otherMode, setOtherMode] = useState(!inPreset && value !== '')
  const selectVal = otherMode ? 'Other' : value
  function handleSelect(e) {
    if (e.target.value === 'Other') { setOtherMode(true); onChange('') }
    else { setOtherMode(false); onChange(e.target.value) }
  }
  return (
    <Field label="Issue Description">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <select value={selectVal} onChange={handleSelect} style={{ fontFamily: 'inherit', width: '100%', padding: '10px 36px 10px 14px', fontSize: 13, color: selectVal ? (selectVal === 'Functional' ? 'var(--green, #3dba7a)' : 'var(--text, #e8e8f0)') : 'var(--text-muted, #6b6d82)', border: `1px solid ${selectVal === 'Functional' ? 'rgba(61,186,122,0.4)' : 'var(--border, #2e3040)'}`, borderRadius: 6, background: selectVal === 'Functional' ? 'rgba(61,186,122,0.07)' : 'var(--bg-input, #252731)', outline: 'none', appearance: 'none', cursor: 'pointer' }}>
            <option value="">Select issue…</option>
            {presets.map(o => <option key={o} value={o}>{o}</option>)}
            <option value="Other">Other (describe below)</option>
          </select>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><path d="M2.5 5l4.5 4 4.5-4" stroke="#B0B0B0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        {otherMode && <Textarea value={value} onChange={onChange} placeholder="Describe the issue…" rows={2} />}
      </div>
    </Field>
  )
}

// ── Labour dropdown (from labour_rates) ───────────────────────────────────────
function LabourRateDropdown({ rates, value, labourCost, onSelect }) {
  if (!rates.length) return null
  return (
    <Field label="Labour Rate" hint={value ? `₹${parseFloat(labourCost || 0).toLocaleString('en-IN')} auto-filled` : 'Select to auto-fill cost'}>
      <div style={{ position: 'relative' }}>
        <select value={value || ''} onChange={e => {
          const r = rates.find(x => x.id === e.target.value)
          onSelect(e.target.value, r ? String(r.cost_per_unit) : '')
        }} style={{ fontFamily: 'inherit', width: '100%', padding: '10px 36px 10px 14px', fontSize: 13, color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, background: 'var(--bg-input, #252731)', outline: 'none', appearance: 'none', cursor: 'pointer' }}>
          <option value="">Select service…</option>
          {rates.map(r => <option key={r.id} value={r.id}>{r.work_type} — ₹{r.cost_per_unit} / {r.unit}</option>)}
        </select>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><path d="M2.5 5l4.5 4 4.5-4" stroke="#B0B0B0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
    </Field>
  )
}

// ── Not-available note ────────────────────────────────────────────────────────
function NotAvailableNote({ value, onChange }) {
  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 8, border: '1px dashed rgba(224,92,106,0.3)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono, monospace)' }}>
        // marked as not_available
      </div>
      <Field label="Note" optional>
        <Textarea value={value || ''} onChange={onChange} placeholder="e.g. No geyser in this room" rows={2} />
      </Field>
    </div>
  )
}

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ itemConfig, card, cardIdx, totalCards, isOpen, onToggle, onUpdate, onDuplicate, onRemove, labourRates }) {
  const { label, trade, issues } = itemConfig
  const tradeRates = (labourRates || []).filter(r => r.trade === trade)
  const cardLabel = totalCards > 1 ? `${label} (${cardIdx + 1})` : label
  const done = card.notAvailable || !!card.issueDescription
  const notFunctional = !card.notAvailable && card.issueDescription && card.issueDescription !== 'Functional'
  const total = (parseFloat(card.materialCost) || 0) + (parseFloat(card.labourCost) || 0)

  const naToggle = (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, background: card.notAvailable ? 'rgba(224,92,106,0.1)' : 'var(--bg-input, #252731)', border: `1px solid ${card.notAvailable ? 'rgba(224,92,106,0.3)' : 'var(--border, #2e3040)'}`, transition: 'background 0.15s' }}
      onClick={e => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={card.notAvailable || false}
        onChange={e => onUpdate('notAvailable', e.target.checked)}
        style={{ width: 12, height: 12, accentColor: 'var(--red, #e05c6a)', cursor: 'pointer', flexShrink: 0 }}
      />
      <span style={{ fontSize: 10, fontWeight: 600, color: card.notAvailable ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>
        {card.notAvailable ? 'n/a' : 'not avail'}
      </span>
    </label>
  )

  const headerActions = (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {naToggle}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onDuplicate() }}
        title="Duplicate card"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: '1px solid rgba(200,150,62,0.4)', background: 'rgba(200,150,62,0.08)', color: 'var(--accent, #c8963e)', fontSize: 14, cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}
      >⊕</button>
      {totalCards > 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onRemove() }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: '1px solid rgba(224,92,106,0.35)', background: 'rgba(224,92,106,0.08)', color: 'var(--red, #e05c6a)', fontSize: 14, cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}
        >×</button>
      )}
    </div>
  )

  return (
    <AccordionCard
      title={cardLabel}
      status={done ? 'done' : isOpen ? 'partial' : null}
      isOpen={isOpen}
      onToggle={onToggle}
      headerAction={headerActions}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {card.notAvailable ? (
          <NotAvailableNote value={card.notAvailableNote} onChange={v => onUpdate('notAvailableNote', v)} />
        ) : (
          <>
            <IssueField presets={issues} value={card.issueDescription} onChange={v => onUpdate('issueDescription', v)} />

            {card.issueDescription && (
              <Field label="Health Score">
                <HealthSlider value={card.health} onChange={v => onUpdate('health', v)} />
              </Field>
            )}

            <Field label="Attach Media">
              <MediaUpload files={card.media} onChange={v => onUpdate('media', v)} />
            </Field>

            {notFunctional && (
              <>
                <Field label="Action Required">
                  <PillGroup
                    options={['Repair', 'Replace', 'Install']}
                    value={card.action}
                    onChange={v => onUpdate('action', v)}
                  />
                </Field>

                {card.action && (
                  <LabourRateDropdown
                    rates={tradeRates}
                    value={card.labourRateId}
                    labourCost={card.labourCost}
                    onSelect={(id, cost) => { onUpdate('labourRateId', id); onUpdate('labourCost', cost) }}
                  />
                )}

                {card.action && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Material Cost (₹)">
                      <Input value={card.materialCost} onChange={v => onUpdate('materialCost', v)} placeholder="0" type="number" />
                    </Field>
                    <Field label="Labour Cost (₹)">
                      <Input value={card.labourCost} onChange={v => onUpdate('labourCost', v)} placeholder="0" type="number" />
                    </Field>
                  </div>
                )}

                {total > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-input, #252731)', borderRadius: 6, border: '1px solid var(--border, #2e3040)' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Total</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text, #e8e8f0)' }}>₹{total.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </>
            )}

            <Field label="Notes" optional>
              <Textarea value={card.notes} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Any observations…" />
            </Field>
          </>
        )}

      </div>
    </AccordionCard>
  )
}

// ── General toggle item ───────────────────────────────────────────────────────
function GeneralToggleItem({ config, data, onUpdate, labourRates }) {
  const { label, areaOptions, multiSelect, freeText, hasPartialRooms } = config
  function toggleArea(a) {
    if (multiSelect) {
      const areas = data.areas.includes(a) ? data.areas.filter(x => x !== a) : [...data.areas, a]
      onUpdate('areas', areas)
    } else {
      onUpdate('areas', data.areas[0] === a ? [] : [a])
    }
  }
  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${data.enabled ? 'rgba(200,150,62,0.3)' : 'var(--border, #2e3040)'}`, borderRadius: 10, padding: '14px 16px', transition: 'border-color 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: data.enabled ? 16 : 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{label}</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ fontSize: 11, color: data.enabled ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{data.enabled ? 'on' : 'off'}</span>
          <div style={{ position: 'relative', width: 36, height: 20 }}>
            <input type="checkbox" checked={data.enabled} onChange={e => onUpdate('enabled', e.target.checked)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
            <div style={{ position: 'absolute', inset: 0, background: data.enabled ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)', border: `1px solid ${data.enabled ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, borderRadius: 10, transition: 'background 0.2s' }} />
            <div style={{ position: 'absolute', top: 2, left: data.enabled ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
          </div>
        </label>
      </div>

      {data.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {freeText ? (
            <Field label="Description">
              <Textarea value={data.description} onChange={v => onUpdate('description', v)} placeholder="Describe the work needed…" rows={2} />
            </Field>
          ) : (
            <Field label={multiSelect ? 'Select Areas' : 'Select Area'}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {areaOptions.map(a => (
                  <button key={a} type="button" onClick={() => toggleArea(a)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', border: data.areas.includes(a) ? '1px solid rgba(200,150,62,0.5)' : '1px solid var(--border, #2e3040)', background: data.areas.includes(a) ? 'rgba(200,150,62,0.1)' : 'var(--bg-input, #252731)', color: data.areas.includes(a) ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)' }}>{a}</button>
                ))}
              </div>
            </Field>
          )}

          {hasPartialRooms && data.areas.includes('Partial') && (
            <Field label="Specify Rooms">
              <Input value={data.partialRooms} onChange={v => onUpdate('partialRooms', v)} placeholder="e.g. Living Room, Bedroom 1" />
            </Field>
          )}

          <Field label="Labour Cost (₹)">
            <Input value={data.labourCost} onChange={v => onUpdate('labourCost', v)} type="number" placeholder="0" />
          </Field>

          <Field label="Notes" optional>
            <Textarea value={data.notes} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Notes…" />
          </Field>
          <MediaUpload files={data.media} onChange={v => onUpdate('media', v)} />
        </div>
      )}
    </div>
  )
}

// ── Custom item ───────────────────────────────────────────────────────────────
const BLANK_CUSTOM = () => ({ id: `ci_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: '', issueDescription: '', action: '', materialCost: '', labourCost: '', notes: '', media: [] })

function CustomItemCard({ item, onChange, onRemove }) {
  const total = (parseFloat(item.materialCost) || 0) + (parseFloat(item.labourCost) || 0)
  return (
    <div style={{ borderRadius: 8, border: '1px dashed var(--accent, #c8963e)', padding: 14, background: 'var(--bg-input, #252731)', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }}>+ custom item</span>
        <button type="button" onClick={onRemove} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>× remove</button>
      </div>
      <Field label="Item Name"><Input value={item.name} onChange={v => onChange('name', v)} placeholder="e.g. Intercom, smoke detector…" /></Field>
      <Field label="Issue Description" optional><Textarea value={item.issueDescription} onChange={v => onChange('issueDescription', v)} rows={2} placeholder="Describe the issue…" /></Field>
      <Field label="Action" optional><PillGroup options={['Repair','Replace','Install']} value={item.action} onChange={v => onChange('action', v)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Material Cost (₹)"><Input value={item.materialCost} onChange={v => onChange('materialCost', v)} placeholder="0" type="number" /></Field>
        <Field label="Labour Cost (₹)"><Input value={item.labourCost} onChange={v => onChange('labourCost', v)} placeholder="0" type="number" /></Field>
      </div>
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim, #9394a8)' }}>Total</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text, #e8e8f0)' }}>₹{total.toLocaleString('en-IN')}</span>
        </div>
      )}
      <Field label="Notes" optional><Textarea value={item.notes} onChange={v => onChange('notes', v)} rows={2} placeholder="Notes…" /></Field>
      <MediaUpload files={item.media} onChange={v => onChange('media', v)} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InspectionIndoor() {
  const navigate       = useNavigate()
  const { state }      = useLocation()
  const pid            = state?.pid
  const houseType      = state?.inspectionType || 'apartment'
  const bhk            = parseBHK(state?.layout)

  const tabs = buildTabs(houseType, bhk)
  const tabLabels = tabs.map(t => t.label)

  const [searchParams, setSearchParams] = useSearchParams()
  const tabIdx    = Math.max(0, Math.min(tabs.findIndex(t => t.id === (searchParams.get('tab') || tabs[0].id)), tabs.length - 1))
  const currentTab = tabs[tabIdx]

  const [data, setData] = useState(() => {
    const initial = buildInitialState(tabs)
    if (!pid) return initial
    try {
      const saved = localStorage.getItem(`flentfix_indoor_draft_${pid}`)
      if (saved) { const p = JSON.parse(saved); if (p.data) return deepMerge(initial, p.data) }
    } catch (_) {}
    return initial
  })

  const [customItems, setCustomItems] = useState(() => {
    if (!pid) return {}
    try {
      const saved = localStorage.getItem(`flentfix_indoor_draft_${pid}`)
      if (saved) { const p = JSON.parse(saved); if (p.customItems) return p.customItems }
    } catch (_) {}
    return {}
  })

  const [openCards, setOpenCards]       = useState(new Set())
  const [labourRates, setLabourRates]   = useState([])
  const [isEstimating, setIsEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState('')
  const [savedFlash, setSavedFlash]     = useState(false)
  const flashTimer = useRef(null)

  useEffect(() => {
    if (!pid) { navigate('/inspections/new', { replace: true }); return }
    supabase.from('labour_rates').select('id, work_type, cost_per_unit, unit, trade').order('work_type')
      .then(({ data: rows }) => { if (rows) setLabourRates(rows) })
  }, [])

  useEffect(() => {
    if (!pid) return
    localStorage.setItem(`flentfix_indoor_draft_${pid}`, JSON.stringify({ data: stripFiles(data), customItems: stripFiles(customItems) }))
    clearTimeout(flashTimer.current)
    setSavedFlash(true)
    flashTimer.current = setTimeout(() => setSavedFlash(false), 2000)
  }, [data, customItems])

  if (!pid) return null

  // ── Data updaters ──
  function updateCard(tabId, secId, itemKey, cardIdx, field, value) {
    setData(prev => {
      const tab = { ...prev[tabId] }
      const sec = { ...tab[secId] }
      const cards = [...(sec[itemKey] || [blankCard()])]
      cards[cardIdx] = { ...cards[cardIdx], [field]: value }
      sec[itemKey] = cards; tab[secId] = sec
      return { ...prev, [tabId]: tab }
    })
  }

  function duplicateCard(tabId, secId, itemKey, cardIdx) {
    setData(prev => {
      const tab = { ...prev[tabId] }
      const sec = { ...tab[secId] }
      const cards = [...(sec[itemKey] || [blankCard()])]
      const copy = { ...cards[cardIdx], media: [], labourRateId: cards[cardIdx].labourRateId }
      cards.splice(cardIdx + 1, 0, copy)
      sec[itemKey] = cards; tab[secId] = sec
      return { ...prev, [tabId]: tab }
    })
  }

  function removeCard(tabId, secId, itemKey, cardIdx) {
    setData(prev => {
      const tab = { ...prev[tabId] }
      const sec = { ...tab[secId] }
      const cards = (sec[itemKey] || []).filter((_, i) => i !== cardIdx)
      sec[itemKey] = cards.length ? cards : [blankCard()]
      tab[secId] = sec
      return { ...prev, [tabId]: tab }
    })
  }

  function updateGeneral(key, field, value) {
    setData(prev => ({ ...prev, general: { ...prev.general, [key]: { ...prev.general[key], [field]: value } } }))
  }

  // ── Custom items ──
  function getCI(tabId) { return customItems[tabId] || [] }
  function addCI(tabId)  { setCustomItems(p => ({ ...p, [tabId]: [...getCI(tabId), BLANK_CUSTOM()] })) }
  function removeCI(tabId, idx) { setCustomItems(p => ({ ...p, [tabId]: getCI(tabId).filter((_, i) => i !== idx) })) }
  function updateCI(tabId, idx, field, value) {
    const arr = [...getCI(tabId)]; arr[idx] = { ...arr[idx], [field]: value }
    setCustomItems(p => ({ ...p, [tabId]: arr }))
  }

  // ── Tab navigation ──
  function handleTabChange(i) {
    setOpenCards(new Set())
    setSearchParams({ tab: tabs[i].id }, { replace: true, state })
  }

  function toggleCard(key) { setOpenCards(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n }) }

  // ── Progress ──
  const { done: totalDone, total: totalItems } = countItems(tabs, data)
  const progress = totalItems ? Math.round((totalDone / totalItems) * 100) : 0

  // ── Create estimate ──
  async function handleCreateEstimate() {
    setIsEstimating(true); setEstimateError('')
    const today = new Date().toISOString().split('T')[0]
    const { data: ins, error: insErr } = await supabase
      .from('inspections')
      .insert({ pid, inspection_date: today, house_type: houseType, status: 'draft', config: { layout: state?.layout, inspection_type: houseType, scope: 'indoor', bhk } })
      .select('id').single()
    if (insErr) { setEstimateError(insErr.message); setIsEstimating(false); return }

    const inspectionId = ins.id
    const lineItemRows = []
    const mediaArrays  = []

    tabs.forEach(tab => {
      if (tab.id === 'general') {
        GENERAL_ITEMS.forEach(gItem => {
          const d = data.general?.[gItem.key]
          if (!d?.enabled) return
          const desc = gItem.freeText ? d.description : d.areas.join(', ')
          lineItemRows.push({ inspection_id: inspectionId, section_name: 'General', area: gItem.trade, item_name: gItem.label, trade: gItem.trade, issue_description: desc, material_cost: 0, labour_cost: parseFloat(d.labourCost) || 0, item_score: null })
          mediaArrays.push(Array.isArray(d.media) ? d.media.filter(f => f instanceof File) : [])
        })
        return
      }
      tab.sections?.forEach(sec => {
        sec.items.forEach(itemConfig => {
          const cards = data[tab.id]?.[sec.id]?.[itemConfig.key] || []
          cards.forEach((card, ci) => {
            if (!card.issueDescription && !card.notAvailable) return
            const suffix = cards.length > 1 ? ` (${ci + 1})` : ''
            lineItemRows.push({
              inspection_id:       inspectionId,
              section_name:        tab.label,
              area:                sec.label,
              item_name:           itemConfig.label + suffix,
              trade:               itemConfig.trade,
              issue_description:   card.notAvailable ? (card.notAvailableNote || 'Not available') : card.issueDescription,
              material_cost:       card.notAvailable ? 0 : (parseFloat(card.materialCost) || 0),
              labour_cost:         card.notAvailable ? 0 : (parseFloat(card.labourCost) || 0),
              item_score:          card.notAvailable ? null : (card.health != null ? card.health : (card.issueDescription === 'Functional' ? 10 : null)),
              availability_status: card.notAvailable ? 'not_available' : null,
            })
            mediaArrays.push(Array.isArray(card.media) ? card.media.filter(f => f instanceof File) : [])
          })
        })
      })
      getCI(tab.id).forEach(ci => {
        if (!ci.name) return
        lineItemRows.push({ inspection_id: inspectionId, section_name: tab.label, area: 'Custom', item_name: ci.name, trade: 'misc', issue_description: ci.issueDescription || ci.action || '', material_cost: parseFloat(ci.materialCost) || 0, labour_cost: parseFloat(ci.labourCost) || 0, item_score: null })
        mediaArrays.push(Array.isArray(ci.media) ? ci.media.filter(f => f instanceof File) : [])
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

    localStorage.removeItem(`flentfix_indoor_draft_${pid}`)
    navigate(`/estimate/${inspectionId}`)
  }

  // ── Render ──
  const isLast = tabIdx === tabs.length - 1

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>

      <NavBar
        title="indoor_inspection"
        subtitle={`${pid} · ${state?.layout || ''}`}
        onBack={() => navigate(-1)}
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

      <TabBar tabs={tabLabels} active={tabIdx} onChange={handleTabChange} />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }} key={currentTab.id}>

          <div style={{ padding: '8px 4px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{currentTab.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
              Indoor — {totalDone} of {totalItems} complete
            </span>
          </div>

          {/* ── General tab ── */}
          {currentTab.id === 'general' && (
            <>
              {GENERAL_ITEMS.map(gItem => (
                <GeneralToggleItem
                  key={gItem.key}
                  config={gItem}
                  data={data.general?.[gItem.key] || blankGeneral()}
                  onUpdate={(field, value) => updateGeneral(gItem.key, field, value)}
                  labourRates={labourRates}
                />
              ))}
              {getCI('general').map((ci, idx) => (
                <CustomItemCard key={ci.id} item={ci} onChange={(f, v) => updateCI('general', idx, f, v)} onRemove={() => removeCI('general', idx)} />
              ))}
              <button type="button" onClick={() => addCI('general')} style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '11px 14px', border: '1px dashed var(--accent, #c8963e)', borderRadius: 8, background: 'rgba(200,150,62,0.04)', fontSize: 12, fontWeight: 600, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ add_custom_item</button>
            </>
          )}

          {/* ── Regular tabs ── */}
          {currentTab.id !== 'general' && currentTab.sections?.map(sec => (
            <div key={sec.id}>
              {sec.divider ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 4px' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border, #2e3040)' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>{sec.divider}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border, #2e3040)' }} />
                </div>
              ) : (
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.12em', padding: '10px 4px 4px' }}>{sec.label}</div>
              )}

              {sec.items.map(itemConfig => {
                const cards = data[currentTab.id]?.[sec.id]?.[itemConfig.key] || [blankCard()]
                return cards.map((card, cardIdx) => {
                  const cardKey = `${sec.id}_${itemConfig.key}_${cardIdx}`
                  return (
                    <ItemCard
                      key={cardKey}
                      itemConfig={itemConfig}
                      card={card}
                      cardIdx={cardIdx}
                      totalCards={cards.length}
                      isOpen={openCards.has(cardKey)}
                      onToggle={() => toggleCard(cardKey)}
                      onUpdate={(field, value) => updateCard(currentTab.id, sec.id, itemConfig.key, cardIdx, field, value)}
                      onDuplicate={() => duplicateCard(currentTab.id, sec.id, itemConfig.key, cardIdx)}
                      onRemove={() => removeCard(currentTab.id, sec.id, itemConfig.key, cardIdx)}
                      labourRates={labourRates}
                    />
                  )
                })
              })}
            </div>
          ))}

          {/* Custom items for this tab */}
          {currentTab.id !== 'general' && getCI(currentTab.id).map((ci, idx) => (
            <CustomItemCard key={ci.id} item={ci} onChange={(f, v) => updateCI(currentTab.id, idx, f, v)} onRemove={() => removeCI(currentTab.id, idx)} />
          ))}
          {currentTab.id !== 'general' && (
            <button type="button" onClick={() => addCI(currentTab.id)} style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '11px 14px', border: '1px dashed var(--accent, #c8963e)', borderRadius: 8, background: 'rgba(200,150,62,0.04)', fontSize: 12, fontWeight: 600, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ add_custom_item</button>
          )}
        </div>
      </div>

      <StickyFooter left={
        tabIdx > 0 ? (
          <button onClick={() => handleTabChange(tabIdx - 1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', border: '1px solid var(--border-dash, #3a3d52)', borderRadius: 6, background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
            ← {tabLabels[tabIdx - 1]}
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>indoor</div>
            <div style={{ fontSize: 11, color: estimateError ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{estimateError || `${totalDone} of ${totalItems} complete`}</div>
          </div>
        )
      }>
        {isLast ? (
          <button type="button" onClick={handleCreateEstimate} disabled={isEstimating} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 18px', border: 'none', borderRadius: 6, background: isEstimating ? 'var(--bg-input, #252731)' : 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 700, color: isEstimating ? 'var(--text-muted, #6b6d82)' : '#fff', cursor: isEstimating ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>
            {isEstimating ? 'Saving…' : '📋 Create Estimate from Indoor'}
          </button>
        ) : (
          <BtnPrimary onClick={() => handleTabChange(tabIdx + 1)}>
            {tabLabels[tabIdx + 1]} →
          </BtnPrimary>
        )}
      </StickyFooter>

      <QuickNotes pid={pid} />
    </div>
  )
}
