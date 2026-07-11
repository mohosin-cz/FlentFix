import { useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { NavBar } from '../components/ui'
import QuickNotes from '../components/QuickNotes'
import { supabase } from '../lib/supabase'
import { flattenOutdoorDraftToRows } from './InspectionOutdoor'
import { flattenAppliancesDraftToRows } from './InspectionAppliances'
import { advanceStage } from '../utils/propertyJourney'

const MODES = [
  {
    value: 'outdoor',
    label: 'Outdoor',
    desc: 'Utility systems, electrical panels, security & perimeter',
    route: '/inspections/outdoor',
    color: 'var(--accent, #c8963e)',
    bg: 'rgba(200,150,62,0.06)',
    border: 'rgba(200,150,62,0.25)',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="23" stroke="#FF385C" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.3"/>
        <circle cx="24" cy="16" r="5" stroke="#FF385C" strokeWidth="2"/>
        <path d="M24 8v2M24 30v2M16 16h-2M34 16h2M18.3 10.3l1.4 1.4M29.3 21.3l1.4 1.4M18.3 21.7l1.4-1.4M29.3 10.7l1.4-1.4" stroke="#FF385C" strokeWidth="2" strokeLinecap="round"/>
        <path d="M10 36V26l14-9 14 9v10" stroke="#FF385C" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M6 36h36" stroke="#FF385C" strokeWidth="2" strokeLinecap="round"/>
        <path d="M38 36v-5M35 31h6M36 28h4" stroke="#FF385C" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    areas: ['Water Systems', 'Sump & Tanks', 'Electrical DB', 'Security / CCTV'],
  },
  {
    value: 'indoor',
    label: 'Indoor',
    desc: 'Living spaces, kitchen, bedrooms, bathrooms & utilities',
    route: '/inspections/indoor',
    color: 'var(--text-dim, #9394a8)',
    bg: 'var(--bg-input, #252731)',
    border: 'var(--border, #2e3040)',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="8" y="16" width="32" height="26" rx="3" stroke="#9394a8" strokeWidth="2"/>
        <path d="M4 18L24 4l20 14" stroke="#9394a8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="19" y="30" width="10" height="12" rx="1" stroke="#9394a8" strokeWidth="1.8"/>
        <circle cx="27" cy="36" r="1" fill="#9394a8"/>
        <rect x="10" y="22" width="8" height="7" rx="1" stroke="#9394a8" strokeWidth="1.6"/>
        <path d="M14 22v7M10 25.5h8" stroke="#9394a8" strokeWidth="1.2"/>
        <rect x="30" y="22" width="8" height="7" rx="1" stroke="#9394a8" strokeWidth="1.6"/>
        <path d="M34 22v7M30 25.5h8" stroke="#9394a8" strokeWidth="1.2"/>
      </svg>
    ),
    areas: ['Living Room', 'Kitchen', 'Bedrooms', 'Bathrooms'],
  },
  {
    value: 'appliances',
    label: 'Appliances',
    desc: 'All home appliances & equipment',
    route: '/inspections/appliances',
    color: '#7c9ef8',
    bg: 'rgba(96,165,250,0.04)',
    border: 'rgba(96,165,250,0.2)',
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <rect x="4" y="8" width="18" height="10" rx="2" stroke="#7c9ef8" strokeWidth="1.8"/>
        <path d="M8 13h10M8 15.5h6" stroke="#7c9ef8" strokeWidth="1.3" strokeLinecap="round"/>
        <rect x="26" y="6" width="16" height="26" rx="2" stroke="#7c9ef8" strokeWidth="1.8"/>
        <path d="M26 17h16" stroke="#7c9ef8" strokeWidth="1.3"/>
        <path d="M30 12v3M30 22v5" stroke="#7c9ef8" strokeWidth="1.3" strokeLinecap="round"/>
        <rect x="4" y="26" width="18" height="16" rx="2" stroke="#7c9ef8" strokeWidth="1.8"/>
        <circle cx="13" cy="34" r="5" stroke="#7c9ef8" strokeWidth="1.5"/>
        <circle cx="13" cy="34" r="2" stroke="#7c9ef8" strokeWidth="1.2"/>
        <path d="M38 36v4M38 40h4" stroke="#7c9ef8" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    areas: ['AC · Fridge', 'Geyser · Washer', 'Chimney · Hob', 'TV · Inverter'],
  },
]

function flattenIndoorDraftToRows(draft, inspectionId, rateMap = {}) {
  const BASICS = {
    deepCleaning:  { label: 'Deep Cleaning',     trade: 'cleaning' },
    pestControl:   { label: 'Pest Control',       trade: 'cleaning' },
    painting:      { label: 'Full Home Painting', trade: 'misc'     },
    floorBuffing:  { label: 'Floor Buffing',      trade: 'misc'     },
    waterproofing: { label: 'Waterproofing',      trade: 'plumbing' },
    carpentry:     { label: 'Carpentry Touch-up', trade: 'woodwork' },
  }
  function toTitle(key) {
    return key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/\b\w/g, c => c.toUpperCase()).trim()
  }
  const KEY_LABELS = {
    // Common Bath (cb* prefix — toTitle gives "Cb Gey", "Cb Sw", etc.)
    cbSw: 'Switchboard', cbGey: 'Geyser', cbExh: 'Exhaust Fan',
    cbMl: 'Mirror Light', cbTap: 'Tap / Basin Mixer', cbSh: 'Shower',
    cbFl: 'Flush Mechanism', cbJs: 'Jet Spray', cbHc: 'Hot/Cold Mixer',
    cbDr: 'Door', cbFt: 'Floor Tiles', cbWt: 'Wall Tiles',
    cbMi: 'Mirror', cbTr: 'Towel Rod', cbSd: 'Soap Dish',
    // Attached Bathroom (b* prefix — toTitle gives "B Switchboard", "B Door")
    bSwitchboard: 'Switchboard', bDoor: 'Door',
    // Labels toTitle gets wrong
    acPoint: 'AC Point', tvUnit: 'TV Unit',
    tap: 'Tap / Basin Mixer', flush: 'Flush Mechanism', hotCold: 'Hot/Cold Mixer',
    ro: 'RO / Water Purifier', chimney: 'Chimney / Exhaust',
    grille: 'Grille / Railing', counter: 'Counter Surface',
    wmPoint: 'Washing Machine Point', wmInlet: 'Washing Machine Inlet',
  }
  const TRADE_SEC_IDS = new Set(['electrical', 'woodwork', 'misc', 'plumbing'])
  const FIXTURE_TRADE = {
    cbSw: 'electrical', cbGey: 'electrical', cbExh: 'electrical', cbMl: 'electrical',
    bSwitchboard: 'electrical', geyser: 'electrical', exhaustFan: 'electrical',
    mirrorLight: 'electrical', wmPoint: 'electrical', utilityLight: 'electrical',
    balconyLight: 'electrical',
    cbTap: 'plumbing', cbSh: 'plumbing', cbFl: 'plumbing', cbJs: 'plumbing',
    cbHc: 'plumbing', tap: 'plumbing', shower: 'plumbing', flush: 'plumbing',
    jetSpray: 'plumbing', hotCold: 'plumbing', wmInlet: 'plumbing', drain: 'plumbing',
    ro: 'plumbing', waterproofing: 'plumbing', sinkTap: 'plumbing',
    cbDr: 'woodwork', bDoor: 'woodwork', grille: 'woodwork',
    cbFt: 'misc', cbWt: 'misc', cbMi: 'misc', cbTr: 'misc', cbSd: 'misc',
    floorTiles: 'misc', wallTiles: 'misc', mirror: 'misc', towelRod: 'misc',
    soapDish: 'misc', ceiling: 'misc', flooring: 'misc', counter: 'misc',
  }
  const rows = []
  const data        = draft.data || {}
  const customItems = draft.customItems || {}
  const FEAS_APPLIANCES = ['Washing Machine', 'Refrigerator', 'Air Conditioner', 'Geyser']
  Object.entries(data).forEach(([tabKey, tabData]) => {
    if (tabKey === 'basics') {
      Object.entries(tabData || {}).forEach(([key, d]) => {
        if (key === 'wasteScrapping' || key === 'applianceFeasibility') return
        if (!d?.enabled) return
        if (key === 'deepCleaning') {
          const descLabel = (d.rateId && rateMap[d.rateId]) ? rateMap[d.rateId] : 'Deep Cleaning'
          if (d.fullHome !== false) {
            rows.push({ inspection_id: inspectionId, section_name: 'Basics', area: 'Cleaning', item_name: 'Deep Cleaning', trade: 'cleaning', issue_description: descLabel, notes: 'Full Home', material_cost: 0, labour_cost: parseFloat(d.labourCost) || 0, item_score: null, _media: d.media || [] })
          }
          ;(d.specificAreas || []).forEach(sa => {
            if (!sa.area) return
            const saDesc = (sa.rateId && rateMap[sa.rateId]) ? rateMap[sa.rateId] : descLabel
            rows.push({ inspection_id: inspectionId, section_name: 'Basics', area: 'Cleaning', item_name: 'Deep Cleaning', trade: 'cleaning', issue_description: saDesc, notes: sa.area, material_cost: 0, labour_cost: parseFloat(sa.cost) || 0, item_score: null, _media: sa.media || [] })
          })
        } else {
          const meta = BASICS[key]
          if (!meta) return
          const desc = (d.rateId && rateMap[d.rateId]) ? rateMap[d.rateId] : meta.label
          const areaNote = (d.areas || []).join(', ') || (d.fullHome ? 'Full Home' : '')
          rows.push({ inspection_id: inspectionId, section_name: 'Basics', area: meta.trade, item_name: meta.label, trade: meta.trade, issue_description: desc, notes: areaNote, material_cost: 0, labour_cost: parseFloat(d.labourCost) || 0, item_score: null, _media: d.media || [] })
        }
      })
      // Waste Scrapping
      const ws = tabData?.wasteScrapping
      if (ws?.required === true) {
        rows.push({ inspection_id: inspectionId, section_name: 'Basics', area: 'Misc', item_name: 'Waste Scrapping / Debris Removal', trade: 'cleaning', issue_description: ws.notes || 'Waste scrapping required', material_cost: 0, labour_cost: parseFloat(ws.labourCost) || 0, item_score: null, _media: ws.media || [] })
      } else if (ws?.required === false) {
        rows.push({ inspection_id: inspectionId, section_name: 'Basics', area: 'Misc', item_name: 'Waste Scrapping / Debris Removal', trade: 'cleaning', issue_description: 'Not required', material_cost: 0, labour_cost: 0, item_score: null, excluded_from_estimate: true })
      }
      // Appliance Feasibility — always save all rows (unanswered marked as 'unanswered') so EstimateWorkspace can gate on them
      const af = tabData?.applianceFeasibility
      if (af) {
        FEAS_APPLIANCES.forEach(appliance => {
          const f = af[appliance]
          const status = f?.status || null
          rows.push({ inspection_id: inspectionId, section_name: 'Basics', area: 'Feasibility', item_name: `Feasibility: ${appliance}`, trade: 'misc', issue_description: status || 'unanswered', material_cost: 0, labour_cost: 0, item_score: status === 'feasible' ? 10 : status === 'not_feasible' ? 1 : null, excluded_from_estimate: true, notes: f?.notes || '', _media: f?.media || [] })
        })
      }
      return
    }
    const tabLabel = toTitle(tabKey)
    Object.entries(tabData || {}).forEach(([secId, secData]) => {
      const area     = TRADE_SEC_IDS.has(secId) ? tabLabel : toTitle(secId)
      const secTrade = TRADE_SEC_IDS.has(secId) ? secId : null
      Object.entries(secData || {}).forEach(([itemKey, cards]) => {
        if (!Array.isArray(cards)) return
        cards.forEach((card, ci) => {
          const sel       = card.selectedIssues || []
          const suffix    = cards.length > 1 ? ` (${ci + 1})` : ''
          const itemTrade = secTrade || FIXTURE_TRADE[itemKey] || 'misc'
          const base      = { inspection_id: inspectionId, section_name: tabLabel, area, item_name: (KEY_LABELS[itemKey] || toTitle(itemKey)) + suffix, trade: itemTrade }
          if (!card.notAvailable && sel.length === 0) return
          if (card.notAvailable) {
            rows.push({ ...base, issue_description: card.notAvailableNote || 'Not available', material_cost: 0, labour_cost: 0, item_score: null, availability_status: 'not_available', _media: card.media || [] })
            return
          }
          if (sel.includes('Functional')) {
            rows.push({ ...base, issue_description: 'Functional', material_cost: 0, labour_cost: 0, item_score: card.health ?? 10, excluded_from_estimate: true, _media: card.media || [] })
          } else {
            sel.forEach((issue, ri) => {
              const cr         = (card.costRows || {})[issue] || {}
              const qty        = Math.max(1, parseFloat(cr.qty) || 1)
              const issueLabel = issue === 'Other' ? (card.otherIssue || 'Other') : issue
              const crType = cr.costType || 'priced'
              rows.push({ ...base, issue_description: cr.labourDescription || issueLabel, action: card.action || cr.action || '', cost_type: crType, material_item_id: card.materialItemId || cr.materialItemId || null, material_fxin: card.materialRateId || cr.materialRateId || null, material_description: card.materialDescription || cr.materialDescription || null, material_cost: card.materialCost ? (parseFloat(card.materialCost) || 0) : crType === 'priced' ? (parseFloat(cr.materialCost) || 0) * qty : 0, labour_cost: crType === 'priced' ? (parseFloat(cr.labourCost) || 0) * qty : 0, item_score: card.health ?? null, _media: ri === 0 ? (card.media || []) : [] })
            })
          }
        })
      })
    })
    ;(customItems[tabKey] || []).forEach(ci => {
      if (!ci.name) return
      const ciRows = ci.issues || []
      if (!ciRows.length) {
        rows.push({ inspection_id: inspectionId, section_name: tabLabel, area: 'Custom', item_name: ci.name, trade: 'misc', issue_description: '', material_cost: 0, labour_cost: 0, item_score: ci.health ?? null, _media: ci.media || [] })
      } else {
        ciRows.forEach((r, ri) => rows.push({ inspection_id: inspectionId, section_name: tabLabel, area: 'Custom', item_name: ci.name, trade: 'misc', issue_description: r.issueDescription || '', action: r.action || '', material_cost: parseFloat(r.materialCost) || 0, labour_cost: parseFloat(r.labourCost) || 0, item_score: ci.health ?? null, _media: ri === 0 ? (ci.media || []) : [] }))
      }
    })
  })
  return rows
}

function readDraftProgress(pid) {
  try {
    // Outdoor
    const oDraft = JSON.parse(localStorage.getItem(`flentfix_outdoor_draft_${pid}`) || 'null')
    let oDone = 0, oTotal = 0
    if (oDraft?.data) {
      Object.values(oDraft.data).forEach(sec => {
        Object.values(sec).forEach(card => {
          oTotal++
          if (card.health !== null || card.notAvailable) oDone++
        })
      })
      Object.values(oDraft.customItems || {}).forEach(items => {
        if (Array.isArray(items)) items.forEach(card => {
          oTotal++
          if (card.health !== null || card.notAvailable) oDone++
        })
      })
    }

    // Indoor
    const iDraft = JSON.parse(localStorage.getItem(`flentfix_indoor_draft_${pid}`) || 'null')
    let iDone = 0, iTotal = 0
    if (iDraft?.data) {
      Object.entries(iDraft.data).forEach(([key, val]) => {
        if (key === 'basics') {
          Object.entries(val || {}).forEach(([bKey, item]) => {
            if (bKey === 'applianceFeasibility') {
              Object.values(item || {}).forEach(f => { iTotal++; if (f?.status) iDone++ })
              return
            }
            if (bKey === 'wasteScrapping') {
              iTotal++; if (item?.required !== null && item?.required !== undefined) iDone++
              return
            }
            iTotal++
            if (item?.enabled) iDone++
          })
        } else {
          Object.values(val || {}).forEach(section => {
            if (section && typeof section === 'object') {
              Object.values(section).forEach(card => {
                if (card && ('notAvailable' in card || 'selectedIssues' in card || 'health' in card)) {
                  iTotal++
                  if (card.notAvailable || (card.selectedIssues?.length > 0) || card.health !== null || card.acProvision === 'not_present') iDone++
                }
              })
            }
          })
        }
      })
      // custom items
      Object.values(iDraft.customItems || {}).forEach(items => {
        if (Array.isArray(items)) items.forEach(card => {
          iTotal++
          if (card.health !== null) iDone++
        })
      })
    }

    // Appliances
    const aDraft = JSON.parse(localStorage.getItem(`flentfix_appliances_draft_${pid}`) || 'null')
    let aDone = 0, aTotal = 0
    if (aDraft?.data) {
      Object.values(aDraft.data).forEach(d => {
        aTotal++
        if (d?.health !== null || d?.notPresent) aDone++
      })
    }
    ;(aDraft?.customAppliances || []).forEach(d => {
      aTotal++
      if (d?.health !== null || d?.notPresent) aDone++
    })

    return {
      outdoor:    { done: oDone, total: oTotal, started: !!oDraft },
      indoor:     { done: iDone, total: iTotal, started: !!iDraft },
      appliances: { done: aDone, total: aTotal, started: !!aDraft },
    }
  } catch {
    return {
      outdoor:    { done: 0, total: 0, started: false },
      indoor:     { done: 0, total: 0, started: false },
      appliances: { done: 0, total: 0, started: false },
    }
  }
}

function ProgressBadge({ done, total, started }) {
  if (!started) return (
    <span style={{ fontSize: 10, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 3, padding: '2px 7px' }}>
      not started
    </span>
  )
  if (total === 0) return (
    <span style={{ fontSize: 10, color: 'var(--accent, #c8963e)', fontFamily: 'var(--font-mono, monospace)', background: 'rgba(200,150,62,0.08)', border: '1px solid rgba(200,150,62,0.25)', borderRadius: 3, padding: '2px 7px' }}>
      in progress
    </span>
  )
  const allDone = done >= total
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono, monospace)',
      background: allDone ? 'rgba(61,186,122,0.1)' : 'rgba(200,150,62,0.08)',
      border: `1px solid ${allDone ? 'rgba(61,186,122,0.3)' : 'rgba(200,150,62,0.25)'}`,
      color: allDone ? 'var(--green, #3dba7a)' : 'var(--accent, #c8963e)',
      borderRadius: 3, padding: '2px 7px',
    }}>
      {done}/{total} done
    </span>
  )
}

export default function InspectionMode() {
  const navigate  = useNavigate()
  const { state } = useLocation()
  const [showEndModal, setShowEndModal] = useState(false)
  const [isEnding, setIsEnding] = useState(false)

  useEffect(() => {
    if (!state?.pid) navigate('/inspections/new', { replace: true })
  }, [])

  if (!state?.pid) return null

  const houseType   = (state.propertyType || state.inspectionType || '').toLowerCase()
  const isApartment = houseType.includes('apartment')

  // Apartments skip Outdoor; Independent Home and Enterprise show all three tiles
  const visibleModes = isApartment
    ? MODES.filter(m => m.value !== 'outdoor')
    : MODES

  const progress = readDraftProgress(state.pid)

  function choose(mode) {
    navigate(mode.route, { state })
  }

  async function confirmEnd() {
    setIsEnding(true)
    try {
      const pid = state.pid
      const { data: { user } } = await supabase.auth.getUser()

      // Always create a fresh inspection record so re-used PIDs don't pollute old data
      const { data: newInspection, error: insErr } = await supabase
        .from('inspections')
        .insert({
          pid,
          house_type: state.propertyType || state.inspectionType,
          inspection_date: new Date().toISOString().split('T')[0],
          status: 'completed',
          config: state,
          owner_email: user?.email ?? null,
        })
        .select()
        .single()
      if (insErr) throw insErr
      const inspectionId = newInspection.id

      // Flush any unsaved drafts to inspection_line_items
      const outdoorDraft    = JSON.parse(localStorage.getItem(`flentfix_outdoor_draft_${pid}`)    || '{}')
      const indoorDraft     = JSON.parse(localStorage.getItem(`flentfix_indoor_draft_${pid}`)     || '{}')
      const appliancesDraft = JSON.parse(localStorage.getItem(`flentfix_appliances_draft_${pid}`) || '{}')

      // Fetch labour rate names for basics items (Fix 1)
      const rateMap = {}
      const basicsData = (indoorDraft.data || {}).basics || {}
      const rateIds = []
      Object.values(basicsData).forEach(d => { if (d?.rateId) rateIds.push(d.rateId) })
      if (rateIds.length > 0) {
        const { data: rates } = await supabase.from('labour_rates').select('id, work_type').in('id', [...new Set(rateIds)])
        if (rates) rates.forEach(r => { rateMap[r.id] = r.work_type })
      }

      const outdoorRows    = flattenOutdoorDraftToRows(outdoorDraft, inspectionId)
      const indoorRows     = flattenIndoorDraftToRows(indoorDraft, inspectionId, rateMap)
      const appliancesRows = flattenAppliancesDraftToRows(appliancesDraft, inspectionId)

      console.log('[EndInspection] outdoorRows:', outdoorRows.length, outdoorRows)
      console.log('[EndInspection] indoorRows:', indoorRows.length, indoorRows)
      console.log('[EndInspection] appliancesRows:', appliancesRows.length, appliancesRows)

      // ── Sanitize + insert with full error visibility ──
      const VALID_COLUMNS = new Set([
        'inspection_id', 'section_name', 'area', 'item_name',
        'item_score', 'issue_description', 'trade', 'action',
        'material_cost', 'labour_cost', 'notes',
        'excluded_from_estimate', 'availability_status', 'qty',
        'material_item_id', 'material_fxin', 'material_description', 'cost_type',
      ])
      const sanitize = (item) => {
        const row = Object.fromEntries(Object.entries(item).filter(([k]) => VALID_COLUMNS.has(k)))
        if (row.item_score != null) row.item_score = Math.min(10, Math.max(1, Math.round(row.item_score)))
        return row
      }
      const rawAllRows = [...outdoorRows, ...indoorRows, ...appliancesRows]
      const allRows = rawAllRows.map(sanitize)
      console.log('[EndInspection] total rows to insert:', allRows.length, allRows[0])
      if (allRows.length > 0) {
        const { data: insertedRows, error: insertErr } = await supabase
          .from('inspection_line_items')
          .insert(allRows)
          .select()
        console.log('[EndInspection] insert result:', insertedRows, insertErr)
        if (insertErr) throw new Error('Line item insert failed: ' + insertErr.message)

        // Save media from draft to line_item_media (Fix 2)
        if (insertedRows?.length) {
          const mediaInserts = []
          for (let i = 0; i < insertedRows.length; i++) {
            const media = rawAllRows[i]?._media || []
            for (const url of media) {
              if (typeof url !== 'string' || !url.startsWith('http')) continue
              mediaInserts.push({ line_item_id: insertedRows[i].id, url, type: (url.includes('.mp4') || url.includes('.mov')) ? 'video' : 'image' })
            }
          }
          if (mediaInserts.length > 0) {
            await supabase.from('line_item_media').insert(mediaInserts)
          }
        }
      }

      // Clear flushed drafts
      localStorage.removeItem(`flentfix_outdoor_draft_${pid}`)
      localStorage.removeItem(`flentfix_indoor_draft_${pid}`)
      localStorage.removeItem(`flentfix_appliances_draft_${pid}`)

      await supabase
        .from('properties')
        .upsert(
          { pid, name: pid, type: state.propertyType || 'independent_home', address: '', landlord: '', deleted_at: null },
          { onConflict: 'pid' }
        )

      // Sync quick note to Supabase on end
      const noteText = localStorage.getItem(`flent_quick_notes_${pid}`)
      if (noteText && noteText.trim()) {
        const { data: existingNote } = await supabase
          .from('quick_notes')
          .select('id')
          .eq('pid', pid)
          .maybeSingle()

        if (existingNote) {
          await supabase
            .from('quick_notes')
            .update({ note: noteText, updated_at: new Date().toISOString() })
            .eq('pid', pid)
        } else {
          await supabase
            .from('quick_notes')
            .insert({ pid, note: noteText, created_by: 'anonymous' })
        }
      }

      setShowEndModal(false)
      await advanceStage(supabase, pid, 'inspection_done', user?.email)
      navigate(`/properties/${pid}`)
    } catch (err) {
      console.error('End inspection error:', err)
      alert('Error saving inspection: ' + err.message)
    } finally {
      setIsEnding(false)
    }
  }

  return (
    <div style={{ minHeight: '100svh', background: 'var(--bg, #16171f)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, Poppins, sans-serif)', color: 'var(--text, #e8e8f0)' }}>
      <NavBar title="inspection_hub" subtitle={`${state.pid} · ${state.layout}`} onBack={() => navigate('/')} />

      {/* Progress bar */}
      <div style={{ height: 2, background: 'var(--border, #2e3040)' }}>
        <div style={{ height: '100%', background: 'var(--accent, #c8963e)', width: '50%', transition: 'width 0.3s' }} />
      </div>

      <div style={{ flex: 1, padding: '28px 20px 100px', maxWidth: 560, width: '100%', margin: '0 auto' }}>

        {/* heading */}
        <div style={{ marginBottom: 28 }} className="animate-fadeUp">
          <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)' }}>Inspection Hub</p>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text, #e8e8f0)', letterSpacing: '-0.5px', margin: '0 0 6px', lineHeight: 1.3 }}>
            Inspection sections
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #6b6d82)', margin: 0 }}>
            Switch freely between sections. End inspection when all sections are complete.
          </p>
        </div>

        {/* mode cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visibleModes.map((mode, i) => {
            const prog = progress[mode.value]
            return (
              <button
                key={mode.value}
                className={`animate-fadeUp stagger-${i + 1}`}
                onClick={() => choose(mode)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 0,
                  background: mode.bg,
                  border: `1px dashed ${mode.border}`,
                  borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  WebkitTapHighlightColor: 'transparent',
                  color: 'var(--text, #e8e8f0)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent, #c8963e)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent, #c8963e)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = mode.border; e.currentTarget.style.boxShadow = 'none' }}
              >
                {/* icon area */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 24px 12px', lineHeight: 0, opacity: 0.85 }}>
                  {mode.icon}
                </div>

                {/* text area */}
                <div style={{ padding: '0 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: mode.color, fontFamily: 'var(--font-mono, monospace)' }}>{mode.label}</span>
                        <ProgressBadge {...prog} />
                      </div>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'var(--accent, #c8963e)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M3.5 2.5l5 3.5-5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, margin: 0 }}>{mode.desc}</p>
                  </div>

                  {/* area tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {mode.areas.map(a => (
                      <span key={a} style={{
                        fontSize: 10, fontWeight: 600, padding: '3px 8px',
                        background: 'var(--bg-input, #252731)',
                        border: '1px solid var(--border, #2e3040)',
                        color: 'var(--text-dim, #9394a8)',
                        borderRadius: 3,
                        fontFamily: 'var(--font-mono, monospace)',
                      }}>{a}</span>
                    ))}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* tip */}
        <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1, color: 'var(--text-muted, #6b6d82)' }}>
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 6v3.5M7 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <p style={{ fontSize: 11, color: 'var(--text-muted, #6b6d82)', lineHeight: 1.5, margin: 0, fontFamily: 'var(--font-mono, monospace)' }}>
            Complete each section and use "Create Estimate" within each section to save data. Then end the inspection.
          </p>
        </div>

        {/* End Inspection button */}
        <button
          onClick={() => setShowEndModal(true)}
          style={{
            marginTop: 24, width: '100%',
            padding: '14px 20px',
            background: 'rgba(200,150,62,0.1)',
            border: '1px solid rgba(200,150,62,0.4)',
            borderRadius: 10, cursor: 'pointer',
            fontSize: 14, fontWeight: 700,
            color: 'var(--accent, #c8963e)',
            fontFamily: 'var(--font-mono, monospace)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,150,62,0.18)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(200,150,62,0.1)' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 2l4 4-6 6H4v-4l6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          End Inspection
        </button>
      </div>

      <QuickNotes pid={state.pid} />

      {/* End Inspection confirmation modal */}
      {showEndModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
          onClick={() => setShowEndModal(false)}
        >
          <div
            style={{ width: '100%', maxWidth: 360, background: 'var(--bg-panel, #1e2028)', border: '1px solid var(--border, #2e3040)', borderRadius: 14, padding: '28px 24px 24px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(200,150,62,0.1)', border: '1px solid rgba(200,150,62,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 2l9 18H2L11 2z" stroke="var(--accent, #c8963e)" strokeWidth="1.8" strokeLinejoin="round"/>
                <path d="M11 9v4M11 15.5v.5" stroke="var(--accent, #c8963e)" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text, #e8e8f0)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 8, letterSpacing: '-0.3px' }}>
              End inspection?
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted, #6b6d82)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 24 }}>
              End inspection for <strong style={{ color: 'var(--text, #e8e8f0)' }}>{state.pid}</strong>? All captured data will be saved to the property record. Make sure you have created estimates from each section.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowEndModal(false)}
                style={{ flex: 1, padding: '11px 0', background: 'var(--bg-input, #252731)', border: '1px solid var(--border, #2e3040)', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-dim, #9394a8)', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmEnd}
                disabled={isEnding}
                style={{ flex: 1, padding: '11px 0', background: 'var(--accent, #c8963e)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff', cursor: isEnding ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-mono, monospace)', opacity: isEnding ? 0.7 : 1 }}
              >
                {isEnding ? 'Saving…' : 'End Inspection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
