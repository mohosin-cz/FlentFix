import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { uploadMediaFiles } from './InspectionOutdoor'
import {
  NavBar, TabBar, Field, Input, Textarea, PillGroup,
  HealthSlider, AccordionCard, StickyFooter, BtnPrimary,
} from '../components/ui'
import QuickNotes from '../components/QuickNotes'
import { uploadMedia } from '../utils/mediaUtils'
import { HIGH_VALUE_VIDEO_THRESHOLD, validateProofVideo } from '../utils/proofVideo'
import { classifyItemKind } from '../utils/itemKind'

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
]

// scope 'single': one row total; 'bathroom': one per bedroom (last = Common when bhk>=2);
// 'livable': one per bedroom + Living Room.
const APPLIANCE_FEASIBILITY = [
  { name: 'Washing Machine', scope: 'single'   },
  { name: 'Refrigerator',    scope: 'single'   },
  { name: 'Dryer',           scope: 'single'   },
  { name: 'Exhaust Fan',     scope: 'bathroom' },
  { name: 'Geyser',          scope: 'bathroom' },
  { name: 'Air Conditioner', scope: 'livable'  },
]

// Section IDs that represent a trade grouping (not a room) — area should be the tab (room) label
const TRADE_SEC_IDS = new Set(['electrical', 'woodwork', 'misc', 'plumbing'])

// ── Tab builder ───────────────────────────────────────────────────────────────
// Returns all feasibility keys in order: singletons, then per-bathroom items, then per-livable items.
// bathroom scope: one per bedroom; when bhk>=2 the last bedroom uses "Common Bathroom" label.
// livable scope: one per bedroom + Living Room (fallback: bhk+1 rooms).
function buildScopedInstances(bhk) {
  const keys = []
  APPLIANCE_FEASIBILITY.forEach(({ name, scope }) => {
    if (scope === 'single') {
      keys.push(name)
    } else if (scope === 'bathroom') {
      for (let i = 1; i <= bhk; i++) {
        const loc = (i === bhk && bhk >= 2) ? 'Common Bathroom' : `Bedroom ${i} Bathroom`
        keys.push(`${name} · ${loc}`)
      }
    } else if (scope === 'livable') {
      for (let i = 1; i <= bhk; i++) keys.push(`${name} · Bedroom ${i}`)
      keys.push(`${name} · Living Room`)
    }
  })
  return keys
}

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
  tabs.push({ id: 'entrance', label: 'Entrance', sections: ENTRANCE_SECTIONS })
  tabs.push({ id: 'living_room', label: 'Living Room', sections: LIVING_ROOM_SECTIONS })
  for (let i = 1; i <= bhk; i++) {
    tabs.push({ id: `bedroom_${i}`, label: `Bedroom ${i}`, sections: bedroomSections(i, bhk) })
  }
  tabs.push({ id: 'kitchen', label: 'Kitchen', sections: KITCHEN_SECTIONS })
  return tabs
}

// ── State helpers ─────────────────────────────────────────────────────────────
const blankCostRow  = () => ({ action: '', labourRateId: '', labourCost: '', materialCost: '', materialRateId: '', qty: 1 })
const blankIssueRow = () => ({ id: `ir_${Date.now()}_${Math.random().toString(36).slice(2)}`, issueDescription: '', action: '', labourRateId: '', labourCost: '', materialCost: '' })
const blankCard = () => ({ health: null, notes: '', media: [], proofMedia: [], fixtureStatus: null, notAvailable: false, notAvailableNote: '', selectedIssues: [], otherIssue: '', costRows: {}, action: '', materialItemId: null, materialRateId: null, materialDescription: null, materialCost: '', kindOverride: null })
const blankGeneral = () => ({ enabled: null, areas: [], partialRooms: '', labourCost: '', rateId: '', notes: '', media: [], description: '', fullHome: null, specificAreas: [] })
const BLANK_SPEC_AREA = () => ({ id: `sa_${Date.now()}_${Math.random().toString(36).slice(2)}`, area: '', type: '', notes: '', rateId: '', cost: '' })

const SPECIFIC_AREA_OPTIONS = ['Living Room', 'Kitchen', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Bathroom', 'Master Bathroom', 'Balcony', 'Utility']
const CLEAN_TYPES = ['Deep Clean', 'Basic Clean', 'Specialised Clean']

function buildInitialState(tabs, bhk) {
  const s = {}
  tabs.forEach(tab => {
    if (tab.id === 'basics') {
      s.basics = {}
      GENERAL_ITEMS.forEach(g => { s.basics[g.key] = blankGeneral() })
      s.basics.wasteScrapping = { required: null, labourCost: '', notes: '', media: [] }
      s.basics.applianceFeasibility = Object.fromEntries(
        buildScopedInstances(bhk).map(a => [a, { status: null, notes: '', media: [] }])
      )
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
  Object.keys({ ...base, ...override }).forEach(k => {
    if (!(k in override)) return
    if (override[k] && typeof override[k] === 'object' && !Array.isArray(override[k])) result[k] = deepMerge(base[k] ?? {}, override[k])
    else result[k] = override[k]
  })
  return result
}

function countItems(tabs, bhk, data) {
  let done = 0, total = 0
  tabs.forEach(tab => {
    if (tab.id === 'basics') {
      GENERAL_ITEMS.forEach(g => {
        total++
        const d = data.basics?.[g.key]
        if (d?.enabled !== null && d?.enabled !== undefined) done++
      })
      total++
      if (data.basics?.wasteScrapping?.required !== null && data.basics?.wasteScrapping?.required !== undefined) done++
      buildScopedInstances(bhk).forEach(a => {
        total++
        if (data.basics?.applianceFeasibility?.[a]?.status) done++
      })
      return
    }
    tab.sections?.forEach(sec => {
      sec.items.forEach(item => {
        const cards = data[tab.id]?.[sec.id]?.[item.key] || []
        cards.forEach(card => {
          total++
          const _cfs = card.fixtureStatus ?? (card.notAvailable ? 'not_available' : null)
          if (_cfs !== null || (card.selectedIssues || []).length > 0 || card.acProvision === 'not_present') done++
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
  useEffect(() => {
    if (typeof file === 'string') { setUrl(file); return }
    const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u)
  }, [file])
  if (!url) return null
  const isVideo = typeof file === 'string' ? /\.(mp4|mov|webm)$/i.test(url) : file.type?.startsWith('video')
  if (isVideo) {
    const poster = typeof file === 'string' ? url.replace(/(\.[^.]+)$/, '_thumb.webp') : undefined
    return <video src={url} muted playsInline preload={typeof file === 'string' ? 'none' : 'metadata'} poster={poster} style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} />
  }
  return <img src={url} alt="" style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 8 }} onError={e => { e.target.style.display = 'none' }} />
}

function MediaUpload({ files = [], onChange, pid, itemKey, label = 'Attach Photos / Videos' }) {
  const cameraRef  = useRef(null)
  const galleryRef = useRef(null)
  const [sheet, setSheet]       = useState(false)
  const [uploading, setUploading] = useState(false)

  async function handleFiles(e) {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    e.target.value = ''
    setSheet(false)
    if (!pid) { onChange([...files, ...selected]); return }
    setUploading(true)
    const newUrls = []
    for (const file of selected) {
      const safe = (itemKey || 'item').replace(/[^a-zA-Z0-9]/g, '_')
      const baseName = `${pid}/${safe}_${Date.now()}_${Math.random().toString(36).slice(2)}`
      try {
        const publicUrl = await uploadMedia(supabase, file, baseName)
        if (publicUrl) newUrls.push(publicUrl)
      } catch (e) { console.error('[MediaUpload]', e.message) }
    }
    setUploading(false)
    if (newUrls.length) onChange([...files, ...newUrls])
  }

  function remove(idx) { onChange(files.filter((_, i) => i !== idx)) }
  return (
    <div>
      <input ref={cameraRef}  type="file" accept="image/*,video/*" capture="environment" style={{ display: 'none' }} onChange={handleFiles} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" multiple            style={{ display: 'none' }} onChange={handleFiles} />
      <button type="button" onClick={() => !uploading && setSheet(true)} disabled={uploading} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', border: `1px dashed ${uploading ? 'var(--accent, #c8963e)' : files.length ? 'var(--green, #3dba7a)' : 'var(--border-dash, #3a3d52)'}`, borderRadius: 6, background: uploading ? 'rgba(200,150,62,0.08)' : files.length ? 'rgba(61,186,122,0.08)' : 'var(--bg-input, #252731)', fontSize: 13, fontWeight: 500, color: uploading ? 'var(--accent, #c8963e)' : files.length ? 'var(--green, #3dba7a)' : 'var(--text-muted, #6b6d82)', cursor: uploading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 11v2a1 1 0 001 1h12a1 1 0 001-1v-2M8 1v9M5 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {uploading ? 'Uploading…' : label}
        {!uploading && files.length > 0 && <span style={{ marginLeft: 'auto', background: 'var(--accent, #c8963e)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, fontFamily: 'var(--font-mono, monospace)' }}>{files.length}</span>}
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

// ── Proof video capture ───────────────────────────────────────────────────────
function ProofVideoCapture({ itemTotal, proofMedia, onChange, pid, itemKey }) {
  const inputRef = useRef(null)
  const [error, setError]       = useState('')
  const [uploading, setUploading] = useState(false)
  if (itemTotal < HIGH_VALUE_VIDEO_THRESHOLD) return null
  const hasProof = (proofMedia || []).length > 0
  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(''); setUploading(true)
    try {
      await validateProofVideo(file)
      const safe = (itemKey || 'item').replace(/[^a-zA-Z0-9]/g, '_')
      const baseName = `${pid}/${safe}_proof_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const url = await uploadMedia(supabase, file, baseName)
      if (url) onChange([url])
    } catch (err) { setError(err.message) }
    setUploading(false)
  }
  return (
    <div style={{ borderRadius: 8, border: `1.5px solid ${hasProof ? 'rgba(61,186,122,0.45)' : 'rgba(200,150,62,0.6)'}`, background: hasProof ? 'rgba(61,186,122,0.06)' : 'rgba(200,150,62,0.08)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: hasProof ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {hasProof ? '✓ Proof video added' : `● High-value item (₹${itemTotal.toLocaleString('en-IN')}) — proof video required`}
      </div>
      {!hasProof && <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)' }}>Record at least 10 s · hold phone vertically</div>}
      {hasProof && <Thumb file={proofMedia[0]} />}
      {error && <div style={{ fontSize: 11, color: 'var(--red, #e05c6a)', fontWeight: 600 }}>✗ {error}</div>}
      <input ref={inputRef} type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
      <button type="button" disabled={uploading} onClick={() => { setError(''); inputRef.current?.click() }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', border: '1px solid rgba(200,150,62,0.4)', borderRadius: 6, background: 'rgba(200,150,62,0.1)', color: 'var(--accent, #c8963e)', fontSize: 12, fontWeight: 700, cursor: uploading ? 'wait' : 'pointer', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em', minHeight: 40 }}>
        <span style={{ fontSize: 14 }}>●</span>
        {uploading ? 'Uploading…' : hasProof ? 'Replace video' : 'Record video'}
      </button>
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
  const [dropPos, setDropPos] = useState({})
  const ref        = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') }
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  function openDropdown() {
    if (open) { setOpen(false); setSearch(''); return }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow < 264 && rect.top > 264) {
        setDropPos({ position: 'fixed', bottom: window.innerHeight - rect.top, top: 'auto', left: rect.left, width: rect.width })
      } else {
        setDropPos({ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width })
      }
    }
    setOpen(true); setSearch('')
  }

  const selected = options.find(o => o.value === value)
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div ref={triggerRef} onClick={openDropdown} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: `1px solid ${value ? 'rgba(200,150,62,0.5)' : 'var(--border, #2e3040)'}`, borderRadius: 6, background: 'var(--bg-input, #252731)', fontSize: 12, color: value ? 'var(--text, #e8e8f0)' : 'var(--text-muted, #6b6d82)', cursor: 'pointer', fontFamily: 'inherit', gap: 6 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        {selected && <span style={{ fontSize: 11, color: 'var(--accent, #c8963e)', whiteSpace: 'nowrap' }}>₹{selected.cost} / {selected.unit}</span>}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><path d="M2 4l4 4 4-4" stroke="#B0B0B0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      {open && (
        <div style={{ ...dropPos, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, zIndex: 9999, maxHeight: 220, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
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
        onChange={id => { const r = rates.find(x => x.id === id); onSelect(id, r ? String(r.cost_per_unit) : '', r?.work_type || '') }}
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
        Not available
      </div>
      <Field label="Note" optional>
        <Textarea value={value || ''} onChange={onChange} placeholder="e.g. No geyser in this room" rows={2} />
      </Field>
    </div>
  )
}

// ── Card-level material picker ────────────────────────────────────────────────
function CardMaterialPicker({ card, onUpdate }) {
  const [search,  setSearch]  = useState('')
  const [results, setResults] = useState([])
  const [open,    setOpen]    = useState(false)
  const [dropPos, setDropPos] = useState({})
  const wrapRef  = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (search.trim().length < 1) { setResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('inventory_items')
        .select('id, fxin, item_name, flent_price, quantity_remaining')
        .gt('flent_price', 0)
        .or(`item_name.ilike.%${search}%,fxin.ilike.%${search}%`)
        .limit(10)
      setResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    if (!open) return
    const close = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function openDrop() {
    const rect = inputRef.current?.getBoundingClientRect()
    if (rect) {
      const below = window.innerHeight - rect.bottom
      setDropPos(below < 220 && rect.top > 220
        ? { position: 'fixed', bottom: window.innerHeight - rect.top, top: 'auto', left: rect.left, width: rect.width }
        : { position: 'fixed', top: rect.bottom + 2, left: rect.left, width: rect.width }
      )
    }
    setOpen(true)
  }

  function clearMat() {
    setSearch(''); setResults([])
    onUpdate('materialItemId', null); onUpdate('materialRateId', null)
    onUpdate('materialDescription', null); onUpdate('materialCost', '')
  }

  const INP = { width: '100%', padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text, #e8e8f0)', fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', minHeight: 44 }

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {card.materialDescription ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.3)', borderRadius: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 2 }}>{card.materialRateId}</div>
            <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.materialDescription}</div>
          </div>
          <button type="button" onClick={clearMat} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #6b6d82)', fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1, minWidth: 28, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={openDrop}
            placeholder="Search inventory by name or FXIN…"
            style={INP}
          />
          {open && results.length > 0 && (
            <div style={{ ...dropPos, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, maxHeight: 220, overflowY: 'auto', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
              {results.map(item => {
                const price = parseFloat(item.flent_price) || 0
                return (
                  <div key={item.id}
                    onMouseDown={() => {
                      onUpdate('materialItemId', item.id)
                      onUpdate('materialRateId', item.fxin)
                      onUpdate('materialDescription', item.item_name)
                      onUpdate('materialCost', String(Math.round(price)))
                      setSearch(''); setOpen(false)
                    }}
                    style={{ padding: '10px 12px', borderBottom: '1px solid var(--border, #2e3040)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 2 }}>{item.fxin}</div>
                      <div style={{ fontSize: 13, color: 'var(--text, #e8e8f0)' }}>{item.item_name}</div>
                      {item.quantity_remaining != null && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)' }}>{item.quantity_remaining} in stock</div>}
                    </div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text, #e8e8f0)', fontWeight: 600, flexShrink: 0 }}>₹{price.toLocaleString('en-IN')}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      {card.materialDescription && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', letterSpacing: '0.08em', marginBottom: 4, fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase' }}>Material cost ₹</div>
          <input type="number" inputMode="decimal" value={card.materialCost || ''} onChange={e => onUpdate('materialCost', e.target.value)} placeholder="0" style={INP} />
        </div>
      )}
    </div>
  )
}

// ── Issue cost row (one per selected non-Functional issue) ────────────────────
function IssueCostRow({ issueLabel, costRow = {}, tradeRates, onUpdate, onSelectRate, onSelectMaterial }) {
  const costType = costRow.costType || 'priced'
  const qty      = Math.max(1, parseFloat(costRow.qty) || 1)
  const unitCost = costType === 'priced' ? (parseFloat(costRow.materialCost) || 0) + (parseFloat(costRow.labourCost) || 0) : 0
  const rowTotal = unitCost * qty

  const [matSearch,  setMatSearch]  = useState('')
  const [matResults, setMatResults] = useState([])
  const [matOpen,    setMatOpen]    = useState(false)
  const [matDropPos, setMatDropPos] = useState({})
  const matRef = useRef(null)

  useEffect(() => {
    if (matSearch.trim().length < 1) { setMatResults([]); return }
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, fxin, item_name, flent_price, market_price, quantity_remaining, trade')
        .or(`item_name.ilike.%${matSearch}%,fxin.ilike.%${matSearch}%`)
        .limit(10)
      console.log('[Material Search]', matSearch, '→', data?.length ?? 0, 'results', error?.message || '')
      setMatResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [matSearch])

  useEffect(() => {
    if (!matOpen) return
    const close = (e) => { if (!matRef.current?.contains(e.target)) setMatOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [matOpen])

  function openMatDropdown() {
    const rect = matRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom
      setMatDropPos(spaceBelow < 200 && rect.top > 200
        ? { position: 'fixed', bottom: window.innerHeight - rect.top, top: 'auto', left: rect.left, width: rect.width }
        : { position: 'fixed', top: rect.bottom + 2, left: rect.left, width: rect.width }
      )
    }
    setMatOpen(true)
  }

  const INP = { width: '100%', padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text, #e8e8f0)', fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', minHeight: 44 }
  const LBL = { fontSize: 10, color: 'var(--text-muted, #6b6d82)', letterSpacing: '0.08em', marginBottom: 6, fontFamily: 'var(--font-mono, monospace)', textTransform: 'uppercase', display: 'block' }

  return (
    <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border, #2e3040)', borderRadius: 10, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '10px 14px', background: 'rgba(200,150,62,0.08)', borderBottom: '1px solid var(--border, #2e3040)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent, #c8963e)' }}>— {issueLabel}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>₹{rowTotal.toLocaleString('en-IN')}</span>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Row 1: Action + Qty */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <span style={LBL}>Action</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {['Repair', 'Replace', 'Install'].map(a => (
                <button key={a} type="button" onClick={() => onUpdate('action', a)} style={{ flex: 1, padding: '7px 0', border: `1px solid ${costRow.action === a ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, background: costRow.action === a ? 'rgba(200,150,62,0.15)' : 'none', color: costRow.action === a ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width: 72 }}>
            <span style={LBL}>Qty</span>
            <input type="number" inputMode="numeric" min="1" value={costRow.qty ?? 1} onChange={e => onUpdate('qty', Math.max(1, parseInt(e.target.value) || 1))} style={{ ...INP, textAlign: 'center' }} />
          </div>
        </div>

        {/* Cost type toggle */}
        <div>
          <span style={LBL}>Cost Type</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ key: 'priced', label: 'Priced' }, { key: 'actuals', label: 'As Actuals' }, { key: 'nil', label: 'No Cost' }].map(opt => (
              <button key={opt.key} type="button" onClick={() => onUpdate('costType', opt.key)} style={{ flex: 1, padding: '7px 0', border: `1px solid ${costType === opt.key ? 'var(--accent, #c8963e)' : 'var(--border, #2e3040)'}`, background: costType === opt.key ? 'rgba(200,150,62,0.15)' : 'none', color: costType === opt.key ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Material | Labour — only when Priced */}
        {costType === 'priced' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Material column */}
          <div>
            <span style={LBL}>Select Material</span>
            <div style={{ position: 'relative' }} ref={matRef}>
              <input
                value={matSearch}
                onChange={e => setMatSearch(e.target.value)}
                onFocus={openMatDropdown}
                placeholder="Search inventory…"
                style={{ ...INP, fontSize: 11, padding: '6px 10px' }}
              />
              {costRow.materialRateId && (
                <div style={{ fontSize: 10, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', margin: '3px 0 6px' }}>
                  {costRow.materialRateId}{costRow.materialDescription ? ` · ${costRow.materialDescription}` : ''}
                </div>
              )}
              {matOpen && matResults.length > 0 && (
                <div style={{ ...matDropPos, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  {matResults.map(item => {
                    const price = parseFloat(item.flent_price ?? item.market_price ?? 0) || 0
                    console.log('[Material Select]', item.fxin, { flent_price: item.flent_price, market_price: item.market_price, price })
                    return (
                      <div key={item.fxin || item.id}
                        onMouseDown={() => { onSelectMaterial(item.id, item.fxin, String(Math.round(price * qty)), item.item_name); setMatSearch(item.item_name); setMatOpen(false) }}
                        style={{ padding: '8px 12px', borderBottom: '1px solid var(--border, #2e3040)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 2 }}>{item.fxin}</div>
                          <div style={{ fontSize: 12, color: 'var(--text, #e8e8f0)' }}>{item.item_name}</div>
                          {item.quantity_remaining != null && <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)' }}>{item.quantity_remaining} in stock</div>}
                        </div>
                        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text, #e8e8f0)', fontWeight: 600, flexShrink: 0 }}>₹{price.toLocaleString('en-IN')}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <span style={{ ...LBL, marginTop: 8 }}>Material ₹</span>
            <input type="number" inputMode="decimal" value={costRow.materialCost || ''} onChange={e => onUpdate('materialCost', e.target.value)} placeholder="0" style={INP} />
          </div>

          {/* Labour column */}
          <div>
            <span style={LBL}>Select Labour</span>
            <LabourRateDropdown rates={tradeRates} value={costRow.labourRateId} labourCost={costRow.labourCost} onSelect={onSelectRate} />
            {costRow.labourDescription && (
              <div style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', marginTop: 3, fontFamily: 'var(--font-mono, monospace)' }}>{costRow.labourDescription}</div>
            )}
            <span style={{ ...LBL, marginTop: 8 }}>Labour ₹</span>
            <input type="number" inputMode="decimal" value={costRow.labourCost || ''} onChange={e => onUpdate('labourCost', e.target.value)} placeholder="0" style={INP} />
          </div>
        </div>}

        {/* As Actuals note */}
        {costType === 'actuals' && (
          <div style={{ padding: '10px 12px', background: 'rgba(200,150,62,0.06)', border: '1px dashed rgba(200,150,62,0.4)', borderRadius: 6, fontSize: 11, color: 'var(--accent, #c8963e)' }}>
            This item will be charged based on actuals — no fixed cost shown in estimate.
          </div>
        )}

        {/* Row 3: Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border, #2e3040)' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>
            {qty > 1 ? `${qty} × ₹${unitCost.toLocaleString('en-IN')} per unit` : ''}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)' }}>
            ₹{rowTotal.toLocaleString('en-IN')}
          </span>
        </div>

      </div>
    </div>
  )
}

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ itemConfig, card, cardIdx, totalCards, isOpen, onToggle, onUpdate, onDuplicate, onRemove, labourRates, pid, sectionLabel }) {
  const { label, trade, issues: presets } = itemConfig
  const isAcPoint      = itemConfig.key === 'acPoint'
  const acProvision    = card.acProvision || 'present'
  const tradeRates     = (labourRates || []).filter(r => r.trade === trade)
  const baseLabel      = isAcPoint ? 'AC Point · Provision check' : label
  const cardLabel      = totalCards > 1 ? `${baseLabel} (${cardIdx + 1})` : baseLabel
  const selectedIssues = card.selectedIssues || []
  const costRows       = card.costRows || {}
  const effFS          = card.fixtureStatus ?? (card.notAvailable ? 'not_available' : null)
  const done           = effFS !== null || selectedIssues.length > 0 || (isAcPoint && acProvision === 'not_present')
  const nonFunctional  = selectedIssues.filter(i => i !== 'Functional')
  const [confirmSheet, setConfirmSheet] = useState(null)
  const itemTotal      = nonFunctional.reduce((sum, issue) => {
    const cr  = costRows[issue] || {}
    const qty = Math.max(1, parseFloat(cr.qty) || 1)
    return sum + ((parseFloat(cr.materialCost) || 0) + (parseFloat(cr.labourCost) || 0)) * qty
  }, 0)
  const effectiveKind   = card.kindOverride ?? classifyItemKind(label, nonFunctional.join(' '), card.action || '', sectionLabel || '', trade || '')
  const needsProofVideo = nonFunctional.length > 0 && itemTotal >= HIGH_VALUE_VIDEO_THRESHOLD && effectiveKind === 'fixture'
  const hasProof        = (card.proofMedia || []).length > 0

  function applyFS(next) {
    onUpdate('fixtureStatus', next)
    onUpdate('notAvailable', false)
    if (next === 'functional') {
      onUpdate('health', 10)
      onUpdate('selectedIssues', [])
      onUpdate('costRows', {})
    }
    if (next === 'not_available') {
      onUpdate('selectedIssues', [])
      onUpdate('costRows', {})
    }
  }

  function tapFS(next) {
    if (effFS === next) { onUpdate('fixtureStatus', null); return }
    if (selectedIssues.length > 0) { setConfirmSheet(next); return }
    applyFS(next)
  }

  function toggleIssue(nextIssues) {
    if (nextIssues.length > 0 && effFS !== null) onUpdate('fixtureStatus', null)
    const newCostRows = { ...costRows }
    nextIssues.forEach(issue => {
      if (issue !== 'Functional' && !newCostRows[issue]) newCostRows[issue] = blankCostRow()
    })
    onUpdate('selectedIssues', nextIssues)
    onUpdate('costRows', newCostRows)
  }

  function updateCostRow(issue, partial) {
    onUpdate('costRows', { ...costRows, [issue]: { ...(costRows[issue] || {}), ...partial } })
  }

  const chipStyle = (active, activeColor, activeBg, activeBorder) => ({
    padding: '4px 9px', minWidth: 44, minHeight: 28,
    fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)',
    borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: `1px solid ${active ? activeBorder : 'var(--border, #2e3040)'}`,
    background: active ? activeBg : 'var(--bg-input, #252731)',
    color: active ? activeColor : 'var(--text-muted, #6b6d82)',
    transition: 'background 0.15s, border-color 0.15s, color 0.15s',
    WebkitTapHighlightColor: 'transparent', userSelect: 'none', whiteSpace: 'nowrap',
  })

  const fixtureChips = (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <button type="button" onClick={e => { e.stopPropagation(); tapFS('functional') }}
        style={chipStyle(effFS === 'functional', 'var(--green, #3dba7a)', 'rgba(61,186,122,0.15)', 'rgba(61,186,122,0.5)')}>
        {effFS === 'functional' ? '✓' : '✓ OK'}
      </button>
      <button type="button" onClick={e => { e.stopPropagation(); tapFS('not_available') }}
        style={chipStyle(effFS === 'not_available', 'var(--text-dim, #9394a8)', 'rgba(107,109,130,0.18)', 'rgba(107,109,130,0.55)')}>
        NA
      </button>
    </div>
  )

  const headerActions = (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {needsProofVideo && !hasProof && (
        <span title="Proof video required" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent, #c8963e)', flexShrink: 0, display: 'inline-block' }} />
      )}
      {nonFunctional.length > 0 && itemTotal >= HIGH_VALUE_VIDEO_THRESHOLD && (
        <button type="button" onClick={e => { e.stopPropagation(); onUpdate('kindOverride', effectiveKind === 'fixture' ? 'service' : 'fixture') }} title={`${card.kindOverride ? 'Manually' : 'Auto'}-classified as ${effectiveKind} — tap to flip`} style={{ padding: '2px 7px', fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', borderRadius: 4, border: `1px solid ${effectiveKind === 'fixture' ? 'rgba(200,150,62,0.4)' : 'rgba(107,109,130,0.4)'}`, background: effectiveKind === 'fixture' ? 'rgba(200,150,62,0.1)' : 'rgba(107,109,130,0.08)', color: effectiveKind === 'fixture' ? 'var(--accent, #c8963e)' : 'var(--text-muted, #6b6d82)', cursor: 'pointer', letterSpacing: '0.08em', whiteSpace: 'nowrap', textTransform: 'uppercase', lineHeight: 1.3 }}>{effectiveKind}</button>
      )}
      {!isAcPoint && fixtureChips}
      <button type="button" onClick={e => { e.stopPropagation(); onDuplicate() }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: '1px solid rgba(200,150,62,0.4)', background: 'rgba(200,150,62,0.08)', color: 'var(--accent, #c8963e)', fontSize: 14, cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}>⊕</button>
      {totalCards > 1 && (
        <button type="button" onClick={e => { e.stopPropagation(); onRemove() }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 5, border: '1px solid rgba(224,92,106,0.35)', background: 'rgba(224,92,106,0.08)', color: 'var(--red, #e05c6a)', fontSize: 14, cursor: 'pointer', fontWeight: 700, lineHeight: 1 }}>×</button>
      )}
    </div>
  )

  const cardStatus = effFS === 'functional' ? 'done' : effFS === 'not_available' ? 'na' : done ? 'done' : isOpen ? 'partial' : null

  return (
    <>
    <div style={{ opacity: effFS !== null ? 0.72 : 1, transition: 'opacity 0.15s' }}>
    <AccordionCard title={cardLabel} status={cardStatus} isOpen={isOpen} onToggle={onToggle} headerAction={headerActions}>
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
            <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Saved as no provision</div>
          </div>
        ) : effFS === 'not_available' ? (
          <NotAvailableNote value={card.notAvailableNote} onChange={v => onUpdate('notAvailableNote', v)} />
        ) : effFS === 'functional' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: '10px 14px', background: 'rgba(61,186,122,0.08)', border: '1px solid rgba(61,186,122,0.25)', borderRadius: 8, fontSize: 11, fontWeight: 600, color: 'var(--green, #3dba7a)', fontFamily: 'var(--font-mono, monospace)' }}>
              ✓ Functional — score 10 / 10
            </div>
            <MediaUpload files={card.media} onChange={v => onUpdate('media', v)} pid={pid} itemKey={`${itemConfig.key}_${cardIdx}`} />
          </div>
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

            <MediaUpload files={card.media} onChange={v => onUpdate('media', v)} pid={pid} itemKey={`${itemConfig.key}_${cardIdx}`} />

            <ProofVideoCapture
              itemTotal={itemTotal}
              proofMedia={card.proofMedia || []}
              onChange={v => onUpdate('proofMedia', v)}
              pid={pid}
              itemKey={`${itemConfig.key}_${cardIdx}_proof`}
            />

            <Field label="Notes" optional>
              <Textarea value={card.notes} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Any observations…" />
            </Field>

            <Field label="Action — what we'll do" optional>
              <input
                type="text"
                value={card.action || ''}
                onChange={e => onUpdate('action', e.target.value)}
                placeholder="e.g. Replace the latch, repaint the panel"
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 6, color: 'var(--text, #e8e8f0)', fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', minHeight: 44 }}
              />
            </Field>

            <Field label="Material" optional>
              <CardMaterialPicker card={card} onUpdate={onUpdate} />
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
                    onUpdate={(field, value) => updateCostRow(issue, { [field]: value })}
                    onSelectRate={(id, cost, desc) => updateCostRow(issue, { labourRateId: id, labourCost: cost, labourDescription: desc })}
                    onSelectMaterial={(id, fxin, cost, name) => updateCostRow(issue, { materialItemId: id, materialRateId: fxin, materialCost: cost, materialDescription: name })}
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
    </div>
    {confirmSheet && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.52)', zIndex: 1000, display: 'flex', alignItems: 'flex-end' }} onClick={() => setConfirmSheet(null)}>
        <div style={{ width: '100%', background: 'var(--bg-panel, #1e2028)', borderRadius: '12px 12px 0 0', padding: '16px 20px 40px' }} onClick={e => e.stopPropagation()}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--border-dash, #3a3d52)', margin: '4px auto 18px' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text, #e8e8f0)', marginBottom: 8 }}>Clear documented issues?</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', marginBottom: 22, lineHeight: 1.5 }}>
            This item has {selectedIssues.length} documented issue{selectedIssues.length !== 1 ? 's' : ''}.{' '}
            {confirmSheet === 'functional' ? 'Marking as functional will remove them.' : 'Marking as N/A will remove them.'}
          </div>
          <button type="button" onClick={() => { applyFS(confirmSheet); setConfirmSheet(null) }}
            style={{ width: '100%', padding: '12px 16px', background: confirmSheet === 'functional' ? 'rgba(61,186,122,0.12)' : 'rgba(107,109,130,0.12)', border: `1px solid ${confirmSheet === 'functional' ? 'rgba(61,186,122,0.4)' : 'rgba(107,109,130,0.4)'}`, borderRadius: 8, color: confirmSheet === 'functional' ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 10, fontFamily: 'inherit' }}>
            {confirmSheet === 'functional' ? 'Clear & mark functional' : 'Clear & mark N/A'}
          </button>
          <button type="button" onClick={() => setConfirmSheet(null)}
            style={{ width: '100%', padding: '12px 16px', background: 'transparent', border: '1px solid var(--border, #2e3040)', borderRadius: 8, color: 'var(--text-muted, #6b6d82)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
        </div>
      </div>
    )}
    </>
  )
}

// ── YesNoControl ─────────────────────────────────────────────────────────────
// value: null (unanswered) | true (Yes) | false (No)
// Tap same pill to deselect back to null (unanswered).
function YesNoControl({ value, onChange }) {
  return (
    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border, #2e3040)', width: 'fit-content' }}>
      {[{ val: true, label: 'Yes' }, { val: false, label: 'No' }].map(opt => {
        const sel = value === opt.val
        return (
          <button key={String(opt.val)} type="button"
            onClick={() => onChange(sel ? null : opt.val)}
            style={{
              minWidth: 44, padding: '8px 18px', border: 'none',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--font-mono, monospace)',
              background: sel ? (opt.val ? 'var(--accent, #c8963e)' : 'var(--bg-input, #252731)') : 'transparent',
              color: sel ? (opt.val ? '#000' : 'var(--text, #e8e8f0)') : 'var(--text-muted, #6b6d82)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >{opt.label}</button>
        )
      })}
    </div>
  )
}

// ── Basics toggle item ────────────────────────────────────────────────────────
function GeneralToggleItem({ config, data, onUpdate, cleaningRates, pid }) {
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

  const isYes = data.enabled === true

  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${isYes ? 'rgba(200,150,62,0.3)' : 'var(--border, #2e3040)'}`, borderRadius: 10, padding: '14px 16px', transition: 'border-color 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isYes ? 16 : 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>{label}</span>
        <YesNoControl value={data.enabled} onChange={v => onUpdate('enabled', v)} />
      </div>

      <div style={{ overflow: 'hidden', maxHeight: isYes ? '2000px' : '0px', opacity: isYes ? 1 : 0, transition: 'max-height 150ms ease-out, opacity 150ms ease', pointerEvents: isYes ? 'auto' : 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {isDeepCleaning ? (
            <>
              {/* Full Home Yes/No */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: data.fullHome === true ? 'rgba(61,186,122,0.08)' : 'var(--bg-input, #252731)', border: `1px solid ${data.fullHome === true ? 'rgba(61,186,122,0.35)' : 'var(--border, #2e3040)'}`, borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: data.fullHome === true ? 'var(--green, #3dba7a)' : 'var(--text-dim, #9394a8)' }}>Full Home Deep Cleaning</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', marginTop: 2 }}>Covers all rooms and areas</div>
                </div>
                <YesNoControl value={data.fullHome} onChange={v => onUpdate('fullHome', v)} />
              </div>

              <div style={{ overflow: 'hidden', maxHeight: data.fullHome === true ? '400px' : '0px', opacity: data.fullHome === true ? 1 : 0, transition: 'max-height 150ms ease-out, opacity 150ms ease' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 2 }}>
                  {cleanOptions.length > 0 && (
                    <Field label="Rate">
                      <SearchableDropdown options={cleanOptions} value={data.rateId} onChange={id => { const r = cleaningRates.find(x => x.id === id); onUpdate('rateId', id); onUpdate('labourCost', r ? String(r.cost_per_unit) : '') }} placeholder="Select cleaning service…" />
                    </Field>
                  )}
                  <Field label="Cost (₹)" hint={data.rateId ? 'auto-filled from rate' : undefined}>
                    <Input value={data.labourCost} onChange={v => onUpdate('labourCost', v)} type="number" placeholder="0" />
                  </Field>
                </div>
              </div>

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
              <MediaUpload files={data.media} onChange={v => onUpdate('media', v)} pid={pid} itemKey={key} />
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
              <MediaUpload files={data.media} onChange={v => onUpdate('media', v)} pid={pid} itemKey={key} />
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
              <MediaUpload files={data.media} onChange={v => onUpdate('media', v)} pid={pid} itemKey={key} />
            </>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Custom item ───────────────────────────────────────────────────────────────
const BLANK_CUSTOM = () => ({ id: `ci_${Date.now()}_${Math.random().toString(36).slice(2)}`, name: '', health: null, notes: '', media: [], issues: [] })

function CustomItemCard({ item, onChange, onRemove, pid }) {
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

      <MediaUpload files={item.media} onChange={v => onChange('media', v)} pid={pid} itemKey={item.id} />

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

// ── WasteScrappingCard ────────────────────────────────────────────────────────
function WasteScrappingCard({ data, onUpdate, pid }) {
  const isYes = data.required === true
  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${isYes ? 'rgba(200,150,62,0.3)' : 'var(--border, #2e3040)'}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isYes ? 14 : 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, #e8e8f0)' }}>Waste Scrapping / Debris Removal</span>
        <YesNoControl value={data.required} onChange={v => onUpdate('required', v)} />
      </div>
      <div style={{ overflow: 'hidden', maxHeight: isYes ? '600px' : '0px', opacity: isYes ? 1 : 0, transition: 'max-height 150ms ease-out, opacity 150ms ease', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Labour Cost ₹" required>
          <Input value={data.labourCost} onChange={v => onUpdate('labourCost', v)} type="number" placeholder="e.g. 1500" />
        </Field>
        <Field label="Notes" optional>
          <Textarea value={data.notes || ''} onChange={v => onUpdate('notes', v)} rows={2} placeholder="Any specifics…" />
        </Field>
        <MediaUpload files={data.media || []} onChange={v => onUpdate('media', v)} pid={pid} itemKey="wasteScrapping" />
      </div>
    </div>
  )
}

// ── ApplianceFeasibilityBlock ─────────────────────────────────────────────────
const FEAS_STATUS_COLORS = { feasible: '#4dd9c0', not_feasible: '#f87171', na: '#9394a8' }
const FEAS_DOT_LABELS    = { feasible: '✓', not_feasible: '✗', na: '–', null: '○' }

function ApplianceFeasibilityBlock({ data, allKeys, onUpdate, pid, feasRefs }) {
  const answeredCount = allKeys.filter(a => data[a]?.status).length
  const allAnswered   = answeredCount === allKeys.length
  const [expanded, setExpanded] = useState(false)
  const collapseTimer = useRef(null)

  // Auto-expand on mount if any item pending
  useEffect(() => {
    if (!allAnswered) setExpanded(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-collapse 400ms after the last item gets answered
  const prevAllAnswered = useRef(allAnswered)
  useEffect(() => {
    if (allAnswered && !prevAllAnswered.current && expanded) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = setTimeout(() => setExpanded(false), 400)
    }
    prevAllAnswered.current = allAnswered
    return () => clearTimeout(collapseTimer.current)
  }, [allAnswered, expanded])

  return (
    <div style={{ background: 'var(--bg-panel, #1e2028)', border: `1px solid ${allAnswered ? 'rgba(77,217,192,0.25)' : 'rgba(240,160,80,0.25)'}`, borderRadius: 10, overflow: 'hidden' }}>

      {/* Collapsible header */}
      <button type="button" onClick={() => setExpanded(p => !p)}
        style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #e8e8f0)', flex: 1 }}>Appliance Feasibility</span>

        {/* Per-appliance status dots */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {allKeys.map(a => {
            const st = data[a]?.status || null
            return (
              <span key={a} style={{ fontSize: 10, fontWeight: 700, color: st ? FEAS_STATUS_COLORS[st] : 'var(--border, #2e3040)', fontFamily: 'var(--font-mono, monospace)' }}>
                {FEAS_DOT_LABELS[st] ?? '○'}
              </span>
            )
          })}
        </div>

        {/* Count + status chip */}
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', background: allAnswered ? 'rgba(77,217,192,0.12)' : 'rgba(240,160,80,0.12)', color: allAnswered ? '#4dd9c0' : '#f0a050', whiteSpace: 'nowrap' }}>
          {allAnswered ? `✓ ${answeredCount}/${allKeys.length}` : `${answeredCount}/${allKeys.length} pending`}
        </span>

        {/* Chevron */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted, #6b6d82)' }}>
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Expandable body */}
      <div style={{ overflow: 'hidden', maxHeight: expanded ? `${allKeys.length * 200}px` : '0px', opacity: expanded ? 1 : 0, transition: 'max-height 200ms ease, opacity 150ms ease' }}>
        <div style={{ borderTop: '1px solid var(--border, #2e3040)', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {allKeys.map((appliance, idx) => {
            const item = data[appliance] || { status: null, notes: '', media: [] }
            const isNotFeas = item.status === 'not_feasible'
            const borderTop = idx > 0 ? '1px solid var(--border, #2e3040)' : 'none'
            const rowBg = isNotFeas ? 'rgba(248,113,113,0.04)' : item.status === 'feasible' ? 'rgba(77,217,192,0.03)' : 'transparent'
            return (
              <div key={appliance} ref={el => { if (feasRefs) feasRefs.current[appliance] = el }}
                style={{ borderTop, background: rowBg, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Row: name + three-pill control */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: item.status ? (FEAS_STATUS_COLORS[item.status] || 'var(--text, #e8e8f0)') : 'var(--text-dim, #9394a8)' }}>{appliance}</span>
                  <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border, #2e3040)', flexShrink: 0 }}>
                    {[{ value: 'feasible', label: 'Feasible' }, { value: 'not_feasible', label: 'Not feasible' }, { value: 'na', label: 'N/A' }].map(opt => {
                      const sel = item.status === opt.value
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => onUpdate(appliance, 'status', sel ? null : opt.value)}
                          style={{ padding: '5px 10px', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', background: sel ? (FEAS_STATUS_COLORS[opt.value] || 'var(--bg-input, #252731)') : 'transparent', color: sel ? '#111' : 'var(--text-muted, #6b6d82)', transition: 'background 0.15s' }}
                        >{opt.label}</button>
                      )
                    })}
                  </div>
                </div>

                {/* "Not feasible" reveals note + photo */}
                <div style={{ overflow: 'hidden', maxHeight: isNotFeas ? '400px' : '0px', opacity: isNotFeas ? 1 : 0, transition: 'max-height 150ms ease, opacity 150ms ease', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Field label="Notes" optional>
                    <Textarea value={item.notes || ''} onChange={v => onUpdate(appliance, 'notes', v)} rows={2} placeholder="Why not feasible?" />
                  </Field>
                  <MediaUpload files={item.media || []} onChange={v => onUpdate(appliance, 'media', v)} pid={pid} itemKey={`feas_${appliance.replace(/\s+/g, '_')}`} />
                </div>

              </div>
            )
          })}
        </div>
      </div>
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
  const allFeasKeys = buildScopedInstances(bhk)
  const tabLabels = tabs.map(t => t.label)

  const [searchParams, setSearchParams] = useSearchParams()
  const tabIdx    = Math.max(0, Math.min(tabs.findIndex(t => t.id === (searchParams.get('tab') || tabs[0].id)), tabs.length - 1))
  const currentTab = tabs[tabIdx]

  const [data, setData] = useState(() => {
    const initial = buildInitialState(tabs, bhk)
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
  const [tabError, setTabError]         = useState('')
  const [feasError, setFeasError]       = useState([])
  const flashTimer = useRef(null)
  const feasRefs   = useRef({})

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

  function updateWaste(field, value) {
    setData(prev => ({ ...prev, basics: { ...prev.basics, wasteScrapping: { ...(prev.basics?.wasteScrapping || {}), [field]: value } } }))
  }

  function updateFeasibility(appliance, field, value) {
    setData(prev => ({
      ...prev,
      basics: {
        ...prev.basics,
        applianceFeasibility: {
          ...(prev.basics?.applianceFeasibility || {}),
          [appliance]: { ...(prev.basics?.applianceFeasibility?.[appliance] || {}), [field]: value },
        },
      },
    }))
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
  function getIncompleteItems() {
    if (currentTab.id === 'basics') {
      const af = data.basics?.applianceFeasibility || {}
      return allFeasKeys.filter(a => !af[a]?.status)
    }
    const missing = []
    currentTab.sections?.forEach(sec => {
      sec.items.forEach(item => {
        const cards = data[currentTab.id]?.[sec.id]?.[item.key] || []
        cards.forEach((card, ci) => {
          const _efs = card.fixtureStatus ?? (card.notAvailable ? 'not_available' : null)
          const done = _efs !== null || (card.selectedIssues || []).length > 0 || card.acProvision === 'not_present'
          if (!done) missing.push(cards.length > 1 ? `${item.label} (${ci + 1})` : item.label)
        })
      })
    })
    return missing
  }

  function handleTabChange(i) {
    if (i > tabIdx) {
      const missing = getIncompleteItems()
      if (missing.length > 0) {
        if (currentTab.id === 'basics') {
          setFeasError(missing)
        } else {
          setTabError(`${missing.length} item${missing.length > 1 ? 's' : ''} not marked: ${missing.join(', ')}`)
        }
        return
      }
    }
    setTabError(''); setFeasError([])
    setOpenCards(new Set())
    setSearchParams({ tab: tabs[i].id }, { replace: true, state })
  }

  function toggleCard(key) { setOpenCards(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n }) }

  // ── Cleaning rates (derived from already-fetched labour_rates) ──
  const cleaningRates = labourRates.filter(r => r.trade === 'cleaning')

  // ── Progress ──
  const { done: totalDone, total: totalItems } = countItems(tabs, bhk, data)
  const progress = totalItems ? Math.round((totalDone / totalItems) * 100) : 0

  // ── Create estimate ──
  async function handleCreateEstimate() {
    setIsEstimating(true); setEstimateError('')

    // Block if any non-excluded high-value item is missing a proof video
    const missingProof = []
    tabs.forEach(tab => {
      if (tab.id === 'basics') return
      tab.sections?.forEach(sec => {
        sec.items.forEach(itemConfig => {
          const cards = data[tab.id]?.[sec.id]?.[itemConfig.key] || []
          cards.forEach((card, ci) => {
            const nonFn = (card.selectedIssues || []).filter(i => i !== 'Functional')
            const total = nonFn.reduce((sum, issue) => {
              const cr = (card.costRows || {})[issue] || {}
              return sum + ((parseFloat(cr.materialCost) || 0) + (parseFloat(cr.labourCost) || 0)) * Math.max(1, parseFloat(cr.qty) || 1)
            }, 0)
            const effKind = card.kindOverride ?? classifyItemKind(itemConfig.label, nonFn.join(' '), card.action || '', sec.label, itemConfig.trade || '')
            if (total >= HIGH_VALUE_VIDEO_THRESHOLD && effKind === 'fixture' && !(card.proofMedia?.length)) {
              const suffix = cards.length > 1 ? ` (${ci + 1})` : ''
              missingProof.push(`${itemConfig.label}${suffix} · ${tab.label}`)
            }
          })
        })
      })
    })
    if (missingProof.length > 0) {
      setEstimateError(`${missingProof.length} item${missingProof.length > 1 ? 's' : ''} need proof videos: ${missingProof.join(', ')}`)
      setIsEstimating(false); return
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: { user } } = await supabase.auth.getUser()
    const { data: ins, error: insErr } = await supabase
      .from('inspections')
      .insert({ pid, inspection_date: today, house_type: houseType, status: 'draft', config: { layout: state?.layout, inspection_type: state?.inspectionType, property_type: houseType, scope: 'indoor', bhk }, owner_email: user?.email ?? null })
      .select('id').single()
    if (insErr) { setEstimateError(insErr.message); setIsEstimating(false); return }

    const inspectionId = ins.id
    const lineItemRows   = []
    const mediaArrays    = []
    const proofMediaArrays = []

    const cleanProofUrls = arr => Array.isArray(arr) ? arr.filter(f => typeof f === 'string' && f.startsWith('http')) : []

    tabs.forEach(tab => {
      if (tab.id === 'basics') {
        GENERAL_ITEMS.forEach(gItem => {
          const d = data.basics?.[gItem.key]
          if (!d?.enabled) return
          const mediaFiles = Array.isArray(d.media) ? d.media.filter(f => typeof f === 'string' && f.startsWith('http')) : []

          if (gItem.key === 'deepCleaning') {
            if (d.fullHome !== false) {
              lineItemRows.push({ inspection_id: inspectionId, section_name: 'Basics', area: 'Cleaning', item_name: 'Deep Cleaning - Full Home', trade: 'cleaning', issue_description: 'Full Home', material_cost: 0, labour_cost: parseFloat(d.labourCost) || 0, item_score: null })
              mediaArrays.push(mediaFiles); proofMediaArrays.push([])
            }
            ;(d.specificAreas || []).forEach(sa => {
              if (!sa.area) return
              lineItemRows.push({ inspection_id: inspectionId, section_name: 'Basics', area: 'Cleaning', item_name: `Deep Cleaning - ${sa.area}`, trade: 'cleaning', issue_description: sa.type || '', material_cost: 0, labour_cost: parseFloat(sa.cost) || 0, item_score: null })
              mediaArrays.push([]); proofMediaArrays.push([])
            })
          } else {
            const desc = gItem.freeText ? d.description : d.areas.join(', ')
            lineItemRows.push({ inspection_id: inspectionId, section_name: 'Basics', area: gItem.trade, item_name: gItem.label, trade: gItem.trade, issue_description: desc, material_cost: 0, labour_cost: parseFloat(d.labourCost) || 0, item_score: null })
            mediaArrays.push(mediaFiles); proofMediaArrays.push([])
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
            const mediaFiles = Array.isArray(card.media) ? card.media.filter(f => typeof f === 'string' && f.startsWith('http')) : []
            const cardProof  = cleanProofUrls(card.proofMedia)
            const area       = TRADE_SEC_IDS.has(sec.id) ? tab.label : sec.label
            const base       = { inspection_id: inspectionId, section_name: tab.label, area, item_name: itemConfig.label + suffix, trade: itemConfig.trade }

            if (itemConfig.key === 'acPoint' && (card.acProvision || 'present') === 'not_present') {
              lineItemRows.push({ ...base, issue_description: 'No provision', material_cost: 0, labour_cost: 0, item_score: null, availability_status: 'no_provision' })
              mediaArrays.push(mediaFiles); proofMediaArrays.push([])
              return
            }

            const cardFS = card.fixtureStatus ?? (card.notAvailable ? 'not_available' : null)
            if (!cardFS && selIssues.length === 0) return

            if (cardFS === 'not_available') {
              lineItemRows.push({ ...base, issue_description: card.notAvailableNote || 'Not available', material_cost: 0, labour_cost: 0, item_score: null, availability_status: 'not_available', fixture_status: 'not_available', excluded_from_estimate: true })
              mediaArrays.push(mediaFiles); proofMediaArrays.push([])
              return
            }

            if (cardFS === 'functional') {
              lineItemRows.push({ ...base, issue_description: 'Functional', material_cost: 0, labour_cost: 0, item_score: 10, fixture_status: 'functional', excluded_from_estimate: true })
              mediaArrays.push(mediaFiles); proofMediaArrays.push([])
              return
            }

            if (selIssues.includes('Functional')) {
              lineItemRows.push({ ...base, issue_description: 'Functional', material_cost: 0, labour_cost: 0, item_score: card.health ?? 10, availability_status: null })
              mediaArrays.push(mediaFiles); proofMediaArrays.push(cardProof)
            } else {
              selIssues.forEach((issue, ri) => {
                const cr         = (card.costRows || {})[issue] || {}
                const qty        = Math.max(1, parseFloat(cr.qty) || 1)
                const issueLabel = issue === 'Other' ? (card.otherIssue || 'Other') : issue
                lineItemRows.push({ ...base, issue_description: cr.labourDescription || issueLabel, action: card.action || cr.action || '', material_item_id: card.materialItemId || cr.materialItemId || null, material_fxin: card.materialRateId || cr.materialRateId || null, material_description: card.materialDescription || cr.materialDescription || null, material_cost: card.materialCost ? (parseFloat(card.materialCost) || 0) : (parseFloat(cr.materialCost) || 0) * qty, labour_cost: (parseFloat(cr.labourCost) || 0) * qty, item_score: card.health ?? null, availability_status: null })
                mediaArrays.push(ri === 0 ? mediaFiles : [])
                proofMediaArrays.push(ri === 0 ? cardProof : [])
              })
            }
          })
        })
      })
      getCI(tab.id).forEach(ci => {
        if (!ci.name) return
        const ciMedia = Array.isArray(ci.media) ? ci.media.filter(f => typeof f === 'string' && f.startsWith('http')) : []
        const ciIssues = ci.issues || []
        if (ciIssues.length === 0) {
          lineItemRows.push({ inspection_id: inspectionId, section_name: tab.label, area: 'Custom', item_name: ci.name, trade: 'misc', issue_description: '', material_cost: 0, labour_cost: 0, item_score: ci.health ?? null })
          mediaArrays.push(ciMedia); proofMediaArrays.push([])
        } else {
          ciIssues.forEach((row, ri) => {
            lineItemRows.push({ inspection_id: inspectionId, section_name: tab.label, area: 'Custom', item_name: ci.name, trade: 'misc', issue_description: row.issueDescription || '', action: row.action || '', material_cost: parseFloat(row.materialCost) || 0, labour_cost: parseFloat(row.labourCost) || 0, item_score: ci.health ?? null })
            mediaArrays.push(ri === 0 ? ciMedia : []); proofMediaArrays.push([])
          })
        }
      })
    })

    if (lineItemRows.length) {
      const VALID_COLS = new Set(['inspection_id','section_name','area','item_name','item_score','issue_description','trade','action','material_cost','labour_cost','notes','excluded_from_estimate','availability_status','fixture_status','qty','material_item_id','material_fxin','material_description','cost_type'])
      const sanitized = lineItemRows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => VALID_COLS.has(k))))
      const { data: inserted, error: liErr } = await supabase.from('inspection_line_items').insert(sanitized).select('id')
      if (liErr) { setEstimateError(liErr.message); setIsEstimating(false); return }
      const mediaInserts = []
      for (let i = 0; i < inserted.length; i++) {
        for (const url of (mediaArrays[i] || [])) {
          mediaInserts.push({ line_item_id: inserted[i].id, url, type: (url.includes('.mp4') || url.includes('.mov')) ? 'video' : 'image', is_proof_video: false })
        }
        for (const url of (proofMediaArrays[i] || [])) {
          mediaInserts.push({ line_item_id: inserted[i].id, url, type: 'video', is_proof_video: true })
        }
      }
      if (mediaInserts.length) await supabase.from('line_item_media').insert(mediaInserts)
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

      {tabError && (
        <div style={{ background: 'rgba(224,92,106,0.10)', borderBottom: '1px solid rgba(224,92,106,0.25)', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#e05c6a', fontFamily: 'var(--font-mono, monospace)' }}>⚠ {tabError}</span>
          <button onClick={() => setTabError('')} style={{ background: 'none', border: 'none', color: '#e05c6a', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>
      )}
      {feasError.length > 0 && (
        <div style={{ background: 'rgba(240,160,80,0.08)', borderBottom: '1px solid rgba(240,160,80,0.2)', padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#f0a050', fontFamily: 'var(--font-mono, monospace)' }}>⚠ Appliance feasibility pending:</span>
          {feasError.map(name => (
            <button key={name} type="button"
              onClick={() => feasRefs.current[name]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              style={{ fontSize: 11, padding: '2px 9px', borderRadius: 10, background: 'rgba(240,160,80,0.15)', border: '1px solid rgba(240,160,80,0.3)', color: '#f0a050', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}
            >{name} →</button>
          ))}
          <button onClick={() => setFeasError([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f0a050', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>
      )}

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
                  pid={pid}
                />
              ))}
              <WasteScrappingCard
                data={data.basics?.wasteScrapping || { required: null, labourCost: '', notes: '', media: [] }}
                onUpdate={updateWaste}
                pid={pid}
              />
              <ApplianceFeasibilityBlock
                data={data.basics?.applianceFeasibility || {}}
                allKeys={allFeasKeys}
                onUpdate={updateFeasibility}
                pid={pid}
                feasRefs={feasRefs}
              />
              {getCI('basics').map((ci, idx) => (
                <CustomItemCard key={ci.id} item={ci} onChange={(f, v) => updateCI('basics', idx, f, v)} onRemove={() => removeCI('basics', idx)} pid={pid} />
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
                      pid={pid}
                      sectionLabel={sec.label}
                    />
                  )
                })
              })}
            </div>
          ))}

          {/* Custom items for this tab */}
          {currentTab.id !== 'basics' && getCI(currentTab.id).map((ci, idx) => (
            <CustomItemCard key={ci.id} item={ci} onChange={(f, v) => updateCI(currentTab.id, idx, f, v)} onRemove={() => removeCI(currentTab.id, idx)} pid={pid} />
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
