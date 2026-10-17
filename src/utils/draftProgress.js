// How far an inspection in progress has got, from the drafts saved on this
// device (localStorage, per PID). Used by the inspection hub and by Home's
// "Continue" card. Progress lives only on the device that took it.
export function readDraftProgress(pid) {
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
            if (item?.enabled !== null && item?.enabled !== undefined) iDone++
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
