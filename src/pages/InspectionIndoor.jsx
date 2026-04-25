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
  const n = parseInt((layout || '').replace(/BHK/i, '').trim())
  return (n >= 1 && n <= 10) ? n : 1
}

function isIndependentHome(houseType) {
  const v = (houseType || '').toLowerCase().replace(/[\s_-]+/g, '_')
  return v === 'independent_home' || v === 'independenthome'
}

function buildTabs(houseType, bhk) {
  const tabs = [{ id: 'basics', label: 'Basics', sections: null }]
  if (isIndependentHome(houseType)) tabs.push({ id: 'entrance', label: 'Entrance', sections: ENTRANCE_SECTIONS })
  tabs.push({ id: 'living_room', label: 'Living Room', sections: LIVING_ROOM_SECTIONS })
  for (let i = 1; i <= bhk; i++) {
    tabs.push({ id: `bedroom_${i}`, label: `Bedroom ${i}`, sections: bedroomSections(i, bhk) })
  }
  tabs.push({ id: 'kitchen', label: 'Kitchen', sections: KITCHEN_SECTIONS })
  return tabs
}

// ── State helpers ─────────────────────────────────────────────────────────────
const blankCostRow  = () => ({ action: '', labourRateId: '', labourCost: '', materialCost: '' })
const blankIssueRow = () => ({ id: `ir_${Date.now()}_${Math.random().toString(36).slice(2)}`, issueDescription: '', action: '', labourRateId: '', labourCost: '', materialCost: '' })
const blankCard = () => ({ health: null, notes: '', media: [], notAvailable: false, notAvailableNote: '', selectedIssues: [], otherIssue: '', costRows: {} })
const blankGeneral = () => ({ enabled: false, areas: [], partialRooms: '', labourCost: '', rateId: '', notes: '', media: [], description: '', fullHome: true, specificAreas: [] })
const BLANK_SPEC_AREA = () => ({ id: `sa_${Date.now()}_${Math.random().toString(36).slice(2)}`, area: '', type: '', notes: '', rateId: '', cost: '' })

const SPECIFIC_AREA_OPTIONS = ['Living Room', 'Kitchen', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Bathroom', 'Master Bathroom', 'Balcony', 'Utility']
const CLEAN_TYPES = ['Deep Clean', 'Basic Clean', 'Specialised Clean']

function buildInitialState(tabs) {
  const s = {}
  tabs.forEach(tab => {
    if (tab.id === 'basics') {
      s.basics = {}
      GENERAL_ITEMS.forEach(g => { s.basics[g.key] = blankGeneral() })
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
    if (tab.id === 'basics') {
      GENERAL_ITEMS.forEach(g => {
        total++
        const d = data.basics?.[g.key]
        if (d && (!d.enabled || d.labourCost || d.description || d.areas?.length)) done++
      })
      return
    }
    tab.sections?.forEach(sec => {
      sec.items.forEach(item => {
        const cards = data[tab.id]?.[sec.id]?.[item.key] || []
        cards.forEach(card => {
          total++
          if (card.notAvailable || (card.selectedIssues || []).length > 0 || card.acProvision === 'not_present') done++
        })
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

// ── Issue checkbox grid ───────────────────────────────────────────────────────
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

// ── Searchable dropdown ───────────────────────────────────────────────────────
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

// ── Labour dropdown (from labour_rates) ───────────────────────────────────────
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

// ── Not-available note ────────────────────────────────────────────────────────
function NotAvailableNote({ value, onChange }) {
  return (
    <div style={{ padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 8, border: '1px dashed rgba(224,92,106,0.3)' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', marginBottom: 10, fontFamily: 'var(--font-mono, monospace)' }}>
        // marked as not_available
      </div>
      <Field label="Note" optional>
        <Textarea value={value || ''} onChange={onChange} placeholder="e.g. No geyser in this room" rows={2} />
      </Field>
    </div>
  )
}

// ── Issue cost row (one per selected non-Functional issue) ────────────────────
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

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ itemConfig, card, cardIdx, totalCards, isOpen, onToggle, onUpdate, onDuplicate, onRemove, labourRates }) {
  const { label, trade, issues: presets } = itemConfig
  const isAcPoint      = itemConfig.key === 'acPoint'
  const acProvision    = card.acProvision || 'present'
  const tradeRates     = (labourRates || []).filter(r => r.trade === trade)
  const baseLabel      = isAcPoint ? 'AC Point · Provision check' : label
  const cardLabel      = totalCards > 1 ? `${baseLabel} (${cardIdx + 1})` : baseLabel
  const selectedIssues = card.selectedIssues || []
  const costRows       = card.costRows || {}
  const done           = card.notAvailable || selectedIssues.length > 0 || (isAcPoint && acProvision === 'not_present')
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
    <label onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 8px', borderRadius: 4, background: card.notAvailable ? 'rgba(224,92,106,0.1)' : 'var(--bg-input, #252731)', border: `1px solid ${card.notAvailable ? 'rgba(224,92,106,0.3)' : 'var(--border, #2e3040)'}` }}>
      <input type="checkbox" checked={card.notAvailable || false} onChange={e => onUpdate('notAvailable', e.target.checked)} style={{ width: 12, height: 12, accentColor: 'var(--red, #e05c6a)', cursor: 'pointer', flexShrink: 0 }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: card.notAvailable ? 'var(--red, #e05c6a)' : 'var(--text-muted, #6b6d82)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono, monospace)' }}>{card.notAvailable ? 'n/a' : 'not avail'}</span>
    </label>
  )

  const headerActions = (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {!isAcPoint && naToggle}
      <button type="button" onClick={e => { e.stopPropagation(); onDuplicate() }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: '1px solid rgba(200,150,62,0.4)', background: 'rgba(200,150,62,0.08)', color: 'var(--accent, #c8963e)', fontSize: 14, cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}>⊕</button>
      {totalCards > 1 && (
        <button type="button" onClick={e => { e.stopPropagation(); onRemove() }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: '1px solid rgba(224,92,106,0.35)', background: 'rgba(224,92,106,0.08)', color: 'var(--red, #e05c6a)', fontSize: 14, cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}>×</button>
      )}
    </div>
  )

  return (
    <AccordionCard title={cardLabel} status={done ? 'done' : isOpen ? 'partial' : null} isOpen={isOpen} onToggle={onToggle} headerAction={headerActions}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* AC Point — provision toggle at the top */}
        {isAcPoint && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', flex: 1 }}>AC Provision</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['present', 'Present'], ['not_present', 'Not Present']].map(([val, lbl]) => {
                const active = acProvision === val
                return (
                  <button key={val} type="button" onClick={() => onUpdate('acProvision', val)} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', border: `1px solid ${active ? (val === 'present' ? 'rgba(61,186,122,0.4)' : 'rgba(224,92,106,0.4)') : 'var(--border, #2e3040)'}`, background: active ? (val === 'present' ? 'rgba(61,186,122,0.1)' : 'rgba(224,92,106,0.1)') : 'transparent', color: active ? (val === 'present' ? 'var(--green, #3dba7a)' : 'var(--red, #e05c6a)') : 'var(--text-muted, #6b6d82)' }}>
                    {lbl}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* AC Point not present — no further fields */}
        {isAcPoint && acProvision === 'not_present' ? (
          <div style={{ padding: '12px 16px', background: 'var(--bg-input, #252731)', borderRadius: 8, border: '1px dashed rgba(224,92,106,0.3)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>// saved as no_provision</div>
          </div>
        ) : card.notAvailable ? (
          <NotAvailableNote value={card.notAvailableNote} onChange={v => onUpdate('notAvailableNote', v)} />
        ) : (
          <>
            <Field label="Issues">
              <IssueCheckboxGrid
                presets={presets}
                selectedIssues={selectedIssues}
                otherIssue={card.otherIssue}
                onSetIssues={toggleIssue}
                onOtherChange={v => onUpdate('otherIssue', v)}
              />
            </Field>

            <Field label="Health Score">
              <HealthSlider value={card.health} onChange={v => onUpdate('health', v)} />
            </Field>

            <MediaUpload files={card.media} onChange={v => onUpdate('media', v)} />

            <Field label="Notes" optional>
              <Textarea value={card.notes} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Any observations…" />
            </Field>

            {nonFunctional.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>Cost Breakdown</span>
                {nonFunctional.map(issue => (
                  <IssueCostRow
                    key={issue}
                    issueLabel={issue === 'Other' ? (card.otherIssue || 'Other') : issue}
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

// ── Basics toggle item ────────────────────────────────────────────────────────
function GeneralToggleItem({ config, data, onUpdate, cleaningRates }) {
  const { key, label, areaOptions, multiSelect, freeText, hasPartialRooms, trade } = config
  const isCleaning    = trade === 'cleaning'
  const isDeepCleaning = key === 'deepCleaning'
  const cleanOptions  = cleaningRates.map(r => ({ value: r.id, label: r.work_type, cost: r.cost_per_unit, unit: r.unit }))

  function toggleArea(a) {
    if (multiSelect) {
      onUpdate('areas', data.areas.includes(a) ? data.areas.filter(x => x !== a) : [...data.areas, a])
    } else {
      onUpdate('areas', data.areas[0] === a ? [] : [a])
    }
  }

  function addSpecificArea() { onUpdate('specificAreas', [...(data.specificAreas || []), BLANK_SPEC_AREA()]) }
  function removeSpecificArea(idx) { onUpdate('specificAreas', (data.specificAreas || []).filter((_, i) => i !== idx)) }
  function updateSpecificArea(idx, field, value) {
    const next = [...(data.specificAreas || [])]; next[idx] = { ...next[idx], [field]: value }; onUpdate('specificAreas', next)
  }

  const toggle = (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <span style={{ fontSize: 11, color: data.enabled ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>{data.enabled ? 'on' : 'off'}</span>
      <div style={{ position: 'relative', width: 36, height: 20 }}>
        <input type="checkbox" checked={data.enabled} onChange={e => onUpdate('enabled', e.target.checked)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
        <div style={{ position: 'absolute', inset: 0, background: data.enabled ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)', border: `1px solid ${data.enabled ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, borderRadius: 10, transition: 'background 0.2s' }} />
        <div style={{ position: 'absolute', top: 2, left: data.enabled ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
      </div>
    </label>
  )

  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${data.enabled ? 'rgba(200,150,62,0.3)' : 'var(--border, #2e3040)'}`, borderRadius: 10, padding: '14px 16px', transition: 'border-color 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: data.enabled ? 16 : 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{label}</span>
        {toggle}
      </div>

      {data.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {isDeepCleaning ? (
            <>
              {/* Full Home toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: data.fullHome !== false ? 'rgba(61,186,122,0.08)' : 'var(--bg-input, #252731)', border: `1px solid ${data.fullHome !== false ? 'rgba(61,186,122,0.35)' : 'var(--border, #2e3040)'}`, borderRadius: 8, cursor: 'pointer' }}>
                <div style={{ position: 'relative', width: 36, height: 20, flexShrink: 0 }}>
                  <input type="checkbox" checked={data.fullHome !== false} onChange={e => onUpdate('fullHome', e.target.checked)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                  <div style={{ position: 'absolute', inset: 0, background: data.fullHome !== false ? 'var(--green, #3dba7a)' : 'var(--bg-input, #252731)', border: `1px solid ${data.fullHome !== false ? 'var(--green, #3dba7a)' : 'var(--border, #2e3040)'}`, borderRadius: 10, transition: 'background 0.2s' }} />
                  <div style={{ position: 'absolute', top: 2, left: data.fullHome !== false ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: data.fullHome !== false ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)' }}>Full Home Deep Cleaning</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>Covers all rooms and areas</div>
                </div>
              </label>

              {data.fullHome !== false && (
                <>
                  {cleanOptions.length > 0 && (
                    <Field label="Rate">
                      <SearchableDropdown options={cleanOptions} value={data.rateId} onChange={id => { const r = cleaningRates.find(x => x.id === id); onUpdate('rateId', id); onUpdate('labourCost', r ? String(r.cost_per_unit) : '') }} placeholder="Select cleaning service…" />
                    </Field>
                  )}
                  <Field label="Cost (₹)" hint={data.rateId ? 'auto-filled from rate' : undefined}>
                    <Input value={data.labourCost} onChange={v => onUpdate('labourCost', v)} type="number" placeholder="0" />
                  </Field>
                </>
              )}

              {/* Specific area rows */}
              {(data.specificAreas || []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>Specific Areas</span>
                  {(data.specificAreas || []).map((sa, idx) => (
                    <div key={sa.id} style={{ background: 'var(--bg, #16171f)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => removeSpecificArea(idx)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>× remove</button>
                      </div>
                      <Field label="Area">
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {SPECIFIC_AREA_OPTIONS.map(a => (
                            <button key={a} type="button" onClick={() => updateSpecificArea(idx, 'area', sa.area === a ? '' : a)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', border: sa.area === a ? '1px solid rgba(200,150,62,0.5)' : '1px solid var(--border, #2e3040)', background: sa.area === a ? 'rgba(200,150,62,0.1)' : 'var(--bg-input, #252731)', color: sa.area === a ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)' }}>{a}</button>
                          ))}
                        </div>
                      </Field>
                      <Field label="Type">
                        <PillGroup options={CLEAN_TYPES} value={sa.type} onChange={v => updateSpecificArea(idx, 'type', v)} />
                      </Field>
                      <Field label="Notes" optional>
                        <Textarea value={sa.notes || ''} onChange={v => updateSpecificArea(idx, 'notes', v)} rows={2} placeholder="e.g. focus on grease buildup near hob" />
                      </Field>
                      {cleanOptions.length > 0 && (
                        <Field label="Rate">
                          <SearchableDropdown options={cleanOptions} value={sa.rateId} onChange={id => { const r = cleaningRates.find(x => x.id === id); updateSpecificArea(idx, 'rateId', id); updateSpecificArea(idx, 'cost', r ? String(r.cost_per_unit) : '') }} placeholder="Select service…" />
                        </Field>
                      )}
                      <Field label="Cost (₹)" hint={sa.rateId ? 'auto-filled from rate' : undefined}>
                        <Input value={sa.cost || ''} onChange={v => updateSpecificArea(idx, 'cost', v)} type="number" placeholder="0" />
                      </Field>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" onClick={addSpecificArea} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '10px 14px', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 8, background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ Add Specific Area</button>

              <Field label="Notes" optional>
                <Textarea value={data.notes} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Notes…" />
              </Field>
              <MediaUpload files={data.media} onChange={v => onUpdate('media', v)} />
            </>
          ) : freeText ? (
            <>
              <Field label="Description">
                <Textarea value={data.description} onChange={v => onUpdate('description', v)} placeholder="Describe the work needed…" rows={2} />
              </Field>
              <Field label="Labour Cost (₹)">
                <Input value={data.labourCost} onChange={v => onUpdate('labourCost', v)} type="number" placeholder="0" />
              </Field>
              <Field label="Notes" optional>
                <Textarea value={data.notes} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Notes…" />
              </Field>
              <MediaUpload files={data.media} onChange={v => onUpdate('media', v)} />
            </>
          ) : (
            <>
              <Field label={multiSelect ? 'Select Areas' : 'Select Area'}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {areaOptions.map(a => (
                    <button key={a} type="button" onClick={() => toggleArea(a)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', border: data.areas.includes(a) ? '1px solid rgba(200,150,62,0.5)' : '1px solid var(--border, #2e3040)', background: data.areas.includes(a) ? 'rgba(200,150,62,0.1)' : 'var(--bg-input, #252731)', color: data.areas.includes(a) ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)' }}>{a}</button>
                  ))}
                </div>
              </Field>

              {hasPartialRooms && data.areas.includes('Partial') && (
                <Field label="Specify Rooms">
                  <Input value={data.partialRooms} onChange={v => onUpdate('partialRooms', v)} placeholder="e.g. Living Room, Bedroom 1" />
                </Field>
              )}

              {isCleaning && cleanOptions.length > 0 && (
                <Field label="Rate">
                  <SearchableDropdown options={cleanOptions} value={data.rateId} onChange={id => { const r = cleaningRates.find(x => x.id === id); onUpdate('rateId', id); onUpdate('labourCost', r ? String(r.cost_per_unit) : '') }} placeholder="Select service…" />
                </Field>
              )}

              <Field label="Labour Cost (₹)" hint={isCleaning && data.rateId ? 'auto-filled from rate' : undefined}>
                <Input value={data.labourCost} onChange={v => onUpdate('labourCost', v)} type="number" placeholder="0" />
              </Field>

              <Field label="Notes" optional>
                <Textarea value={data.notes} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Notes…" />
              </Field>
              <MediaUpload files={data.media} onChange={v => onUpdate('media', v)} />
            </>
          )}

        </div>
      )}
    </div>
  )
}

// ── Custom item ───────────────────────────────────────────────────────────────
const BLANK_CUSTOM = () => ({ id: `ci_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: '', health: null, notes: '', media: [], issues: [] })

function CustomItemCard({ item, onChange, onRemove }) {
  const issueRows = item.issues || []
  const itemTotal = issueRows.reduce((sum, r) => sum + (parseFloat(r.materialCost) || 0) + (parseFloat(r.labourCost) || 0), 0)

  function addIssue() { onChange('issues', [...issueRows, blankIssueRow()]) }
  function removeIssue(idx) { onChange('issues', issueRows.filter((_, i) => i !== idx)) }
  function updateIssue(idx, field, value) {
    const updated = [...issueRows]; updated[idx] = { ...updated[idx], [field]: value }; onChange('issues', updated)
  }

  return (
    <div style={{ borderRadius: 8, border: '1px dashed var(--accent, #c8963e)', padding: 14, background: 'var(--bg-input, #252731)', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent, #c8963e)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono, monospace)' }}>+ custom item</span>
        <button type="button" onClick={onRemove} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>× remove</button>
      </div>

      <Field label="Item Name">
        <Input value={item.name} onChange={v => onChange('name', v)} placeholder="e.g. Intercom, smoke detector…" />
      </Field>

      <Field label="Health Score">
        <HealthSlider value={item.health} onChange={v => onChange('health', v)} />
      </Field>

      <MediaUpload files={item.media} onChange={v => onChange('media', v)} />

      <Field label="Notes" optional>
        <Textarea value={item.notes} onChange={v => onChange('notes', v)} rows={2} placeholder="Notes…" />
      </Field>

      {/* Issues */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim, #9394a8)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono, monospace)' }}>Issues</span>
          <button type="button" onClick={addIssue} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 5, background: 'rgba(200,150,62,0.08)', fontSize: 11, fontWeight: 700, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ Add Issue</button>
        </div>
        {issueRows.length === 0 && (
          <div style={{ padding: 12, textAlign: 'center', fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', border: '1px dashed var(--border-dash, #3a3d52)', borderRadius: 8 }}>
            No issues logged
          </div>
        )}
        {issueRows.map((row, idx) => {
          const rowTotal = (parseFloat(row.materialCost) || 0) + (parseFloat(row.labourCost) || 0)
          return (
            <div key={row.id || idx} style={{ background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => removeIssue(idx)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', border: '1px solid rgba(224,92,106,0.3)', borderRadius: 4, background: 'rgba(224,92,106,0.08)', fontSize: 11, fontWeight: 600, color: 'var(--red, #e05c6a)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>× remove</button>
              </div>
              <Field label="Issue Description" optional>
                <Textarea value={row.issueDescription} onChange={v => updateIssue(idx, 'issueDescription', v)} rows={2} placeholder="Describe the issue…" />
              </Field>
              <Field label="Action" optional>
                <PillGroup options={['Repair','Replace','Install']} value={row.action} onChange={v => updateIssue(idx, 'action', v)} />
              </Field>
              {row.action && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Material ₹"><Input value={row.materialCost} onChange={v => updateIssue(idx, 'materialCost', v)} placeholder="0" type="number" /></Field>
                  <Field label="Labour ₹"><Input value={row.labourCost} onChange={v => updateIssue(idx, 'labourCost', v)} placeholder="0" type="number" /></Field>
                </div>
              )}
              {rowTotal > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(200,150,62,0.06)', border: '1px solid rgba(200,150,62,0.2)', borderRadius: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim, #9394a8)' }}>Issue Total</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent, #c8963e)' }}>₹{rowTotal.toLocaleString('en-IN')}</span>
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

// ── Main component ────────────────────────────────────────────────────────────
export default function InspectionIndoor() {
  const navigate       = useNavigate()
  const { state }      = useLocation()
  const pid            = state?.pid
  const houseType      = state?.propertyType || state?.inspectionType || 'apartment'
  const bhk            = parseBHK(state?.layout)

  // Debug — remove once confirmed
  console.log('[InspectionIndoor] state:', state)
  console.log('[InspectionIndoor] houseType:', houseType, '| bhk:', bhk)

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
    setData(prev => ({ ...prev, basics: { ...prev.basics, [key]: { ...prev.basics[key], [field]: value } } }))
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

  // ── Cleaning rates (derived from already-fetched labour_rates) ──
  const cleaningRates = labourRates.filter(r => r.trade === 'cleaning')

  // ── Progress ──
  const { done: totalDone, total: totalItems } = countItems(tabs, data)
  const progress = totalItems ? Math.round((totalDone / totalItems) * 100) : 0

  // ── Create estimate ──
  async function handleCreateEstimate() {
    setIsEstimating(true); setEstimateError('')
    const today = new Date().toISOString().split('T')[0]
    const { data: ins, error: insErr } = await supabase
      .from('inspections')
      .insert({ pid, inspection_date: today, house_type: houseType, status: 'draft', config: { layout: state?.layout, inspection_type: state?.inspectionType, property_type: houseType, scope: 'indoor', bhk } })
      .select('id').single()
    if (insErr) { setEstimateError(insErr.message); setIsEstimating(false); return }

    const inspectionId = ins.id
    const lineItemRows = []
    const mediaArrays  = []

    tabs.forEach(tab => {
      if (tab.id === 'basics') {
        GENERAL_ITEMS.forEach(gItem => {
          const d = data.basics?.[gItem.key]
          if (!d?.enabled) return
          const mediaFiles = Array.isArray(d.media) ? d.media.filter(f => f instanceof File) : []

          if (gItem.key === 'deepCleaning') {
            if (d.fullHome !== false) {
              lineItemRows.push({ inspection_id: inspectionId, section_name: 'Basics', area: 'Cleaning', item_name: 'Deep Cleaning - Full Home', trade: 'cleaning', issue_description: 'Full Home', material_cost: 0, labour_cost: parseFloat(d.labourCost) || 0, item_score: null })
              mediaArrays.push(mediaFiles)
            }
            ;(d.specificAreas || []).forEach(sa => {
              if (!sa.area) return
              lineItemRows.push({ inspection_id: inspectionId, section_name: 'Basics', area: 'Cleaning', item_name: `Deep Cleaning - ${sa.area}`, trade: 'cleaning', issue_description: sa.type || '', action: sa.notes || '', material_cost: 0, labour_cost: parseFloat(sa.cost) || 0, item_score: null })
              mediaArrays.push([])
            })
          } else {
            const desc = gItem.freeText ? d.description : d.areas.join(', ')
            lineItemRows.push({ inspection_id: inspectionId, section_name: 'Basics', area: gItem.trade, item_name: gItem.label, trade: gItem.trade, issue_description: desc, material_cost: 0, labour_cost: parseFloat(d.labourCost) || 0, item_score: null })
            mediaArrays.push(mediaFiles)
          }
        })
        return
      }
      tab.sections?.forEach(sec => {
        sec.items.forEach(itemConfig => {
          const cards = data[tab.id]?.[sec.id]?.[itemConfig.key] || []
          cards.forEach((card, ci) => {
            const selIssues  = card.selectedIssues || []
            const suffix     = cards.length > 1 ? ` (${ci + 1})` : ''
            const mediaFiles = Array.isArray(card.media) ? card.media.filter(f => f instanceof File) : []
            const base       = { inspection_id: inspectionId, section_name: tab.label, area: sec.label, item_name: itemConfig.label + suffix, trade: itemConfig.trade }

            if (itemConfig.key === 'acPoint' && (card.acProvision || 'present') === 'not_present') {
              lineItemRows.push({ ...base, issue_description: 'No provision', material_cost: 0, labour_cost: 0, item_score: null, availability_status: 'no_provision' })
              mediaArrays.push(mediaFiles)
              return
            }

            if (!card.notAvailable && selIssues.length === 0) return

            if (card.notAvailable) {
              lineItemRows.push({ ...base, issue_description: card.notAvailableNote || 'Not available', material_cost: 0, labour_cost: 0, item_score: null, availability_status: 'not_available' })
              mediaArrays.push(mediaFiles)
              return
            }

            if (selIssues.includes('Functional')) {
              lineItemRows.push({ ...base, issue_description: 'Functional', action: 'Functional', material_cost: 0, labour_cost: 0, item_score: card.health ?? 10, availability_status: null })
              mediaArrays.push(mediaFiles)
            } else {
              selIssues.forEach((issue, ri) => {
                const cr = (card.costRows || {})[issue] || {}
                const issueLabel = issue === 'Other' ? (card.otherIssue || 'Other') : issue
                lineItemRows.push({ ...base, issue_description: issueLabel, action: cr.action || '', material_cost: parseFloat(cr.materialCost) || 0, labour_cost: parseFloat(cr.labourCost) || 0, item_score: card.health ?? null, availability_status: null })
                mediaArrays.push(ri === 0 ? mediaFiles : [])
              })
            }
          })
        })
      })
      getCI(tab.id).forEach(ci => {
        if (!ci.name) return
        const ciMedia = Array.isArray(ci.media) ? ci.media.filter(f => f instanceof File) : []
        const ciIssues = ci.issues || []
        if (ciIssues.length === 0) {
          lineItemRows.push({ inspection_id: inspectionId, section_name: tab.label, area: 'Custom', item_name: ci.name, trade: 'misc', issue_description: '', material_cost: 0, labour_cost: 0, item_score: ci.health ?? null })
          mediaArrays.push(ciMedia)
        } else {
          ciIssues.forEach((row, ri) => {
            lineItemRows.push({ inspection_id: inspectionId, section_name: tab.label, area: 'Custom', item_name: ci.name, trade: 'misc', issue_description: row.issueDescription || '', action: row.action || '', material_cost: parseFloat(row.materialCost) || 0, labour_cost: parseFloat(row.labourCost) || 0, item_score: ci.health ?? null })
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

      <TabBar tabs={tabLabels} active={tabIdx} onChange={handleTabChange} />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 120 }}>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }} key={currentTab.id}>

          <div style={{ padding: '8px 4px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)' }}>{currentTab.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
              Indoor — {totalDone} of {totalItems} complete
            </span>
          </div>

          {/* ── Basics tab ── */}
          {currentTab.id === 'basics' && (
            <>
              {GENERAL_ITEMS.map(gItem => (
                <GeneralToggleItem
                  key={gItem.key}
                  config={gItem}
                  data={data.basics?.[gItem.key] || blankGeneral()}
                  onUpdate={(field, value) => updateGeneral(gItem.key, field, value)}
                  cleaningRates={cleaningRates}
                />
              ))}
              {getCI('basics').map((ci, idx) => (
                <CustomItemCard key={ci.id} item={ci} onChange={(f, v) => updateCI('basics', idx, f, v)} onRemove={() => removeCI('basics', idx)} />
              ))}
              <button type="button" onClick={() => addCI('basics')} style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '11px 14px', border: '1px dashed var(--accent, #c8963e)', borderRadius: 8, background: 'rgba(200,150,62,0.04)', fontSize: 12, fontWeight: 600, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ Add Custom Item</button>
            </>
          )}

          {/* ── Regular tabs ── */}
          {currentTab.id !== 'basics' && currentTab.sections?.map(sec => (
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
          {currentTab.id !== 'basics' && getCI(currentTab.id).map((ci, idx) => (
            <CustomItemCard key={ci.id} item={ci} onChange={(f, v) => updateCI(currentTab.id, idx, f, v)} onRemove={() => removeCI(currentTab.id, idx)} />
          ))}
          {currentTab.id !== 'basics' && (
            <button type="button" onClick={() => addCI(currentTab.id)} style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '11px 14px', border: '1px dashed var(--accent, #c8963e)', borderRadius: 8, background: 'rgba(200,150,62,0.04)', fontSize: 12, fontWeight: 600, color: 'var(--accent, #c8963e)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}>+ Add Custom Item</button>
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
          <BtnPrimary onClick={() => navigate('/inspections/mode', { state })}>
            Back to Hub →
          </BtnPrimary>
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
