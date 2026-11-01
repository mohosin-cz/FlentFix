/**
 * Pulse → Fixture 0.05 · utility-log
 *
 * Lives in the sheet (Extensions → Apps Script). Every 15 minutes it asks
 * Pulse for WiFi / water purifier bookings that are not in the sheet yet, or
 * were edited in Pulse since they were written, and writes them in the tab's
 * own format:
 *
 *   A Booking Date  formula, left to the sheet      I Start Date  dd-mm-yyyy
 *   B PID                                           J Acc-PH-DP ID
 *   C Month         formula, left to the sheet      K SSID
 *   D Service       WiFi | Water                    L Password
 *   E Provider      the dropdown's spelling         M Plan Type
 *   F Duration      1M 2M 3M 6M 12M …               N LockBox Code
 *   G Plan Price                                    O Invoice link
 *   H Added Cost                                    P Payment Mode
 *
 * A booking already in the sheet (same PID + service + start date) is updated
 * in place — only the cells Pulse has a value for; nothing in the sheet is
 * blanked. Anything else is added under the last row. Pulse is told which
 * rows were written, so each booking goes out once and again only when it
 * changes.
 *
 * Setup: paste this file, put the key in SYNC_KEY, run installTrigger() once
 * and approve. Run syncUtilities() to sync now.
 */

const PULSE_URL = 'https://pjetqnlvyuuejcuvkare.supabase.co'
const PULSE_ANON = 'PASTE_ANON_KEY'   // the public anon key Pulse's web app uses
const SYNC_KEY = 'PASTE_SYNC_KEY'     // api_clients key with scope utilities:sheet
const TAB = 'utility-log'

const PROVIDERS = ['ACT', 'Airtel', 'DrinkPrime ', 'LivPure', 'Local Vendor', 'AquaGuard-LL', 'Tata Play Fiber']

function syncUtilities() {
  const lock = LockService.getScriptLock()
  if (!lock.tryLock(30000)) return
  try {
    const rows = rpc('utility_sheet_feed', { p_key: SYNC_KEY })
    if (!rows.length) return

    const sh = SpreadsheetApp.getActive().getSheetByName(TAB)
    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone()

    // last row that actually has a PID — columns A and C carry formulas far below
    const colB = sh.getRange(2, 2, Math.max(sh.getLastRow() - 1, 1), 1).getValues()
    let last = 1
    for (let i = colB.length - 1; i >= 0; i--) if (String(colB[i][0]).trim() !== '') { last = i + 2; break }

    const data = last > 1 ? sh.getRange(2, 1, last - 1, 16).getValues() : []
    const at = {}
    data.forEach((r, i) => { const k = keyOf(r[1], r[3], r[8], tz); if (k) at[k] = i + 2 })

    const done = []
    for (const u of rows) {
      const key = keyOf(u.pid, u.service, u.start, tz)
      let row = (u.sheet_key && at[u.sheet_key]) || (key && at[key])
      const fresh = !row
      if (fresh) { row = ++last; if (key) at[key] = row }

      const cells = {
        2: Number(u.pid),
        4: u.service,
        5: provider(u.provider),
        6: u.duration,
        7: u.price,
        8: u.added,
        9: u.start ? toDate(u.start) : null,
        10: u.account,
        11: u.ssid,
        12: u.password,
        13: u.plan,
        14: u.lockbox,
        15: u.invoice,
        16: u.payment,
      }
      for (const c in cells) {
        const v = cells[c]
        if (v === null || v === undefined || v === '') { if (fresh) sh.getRange(row, +c).setValue(c == 8 ? 0 : (c == 6 ? 'N/A' : '')); continue }
        sh.getRange(row, +c).setValue(v)
      }
      sh.getRange(row, 9).setNumberFormat('dd-mm-yyyy')
      sh.getRange(row, 10).setNumberFormat('0')
      if (!sh.getRange(row, 1).getFormula()) sh.getRange(row, 1).setFormula(`=IF(B${row}<>"", TODAY(), "")`)
      if (!sh.getRange(row, 3).getFormula()) sh.getRange(row, 3).setFormula(`=TEXT(I${row}, "mmm yyyy")`)
      done.push({ id: u.id, key: key })
    }
    SpreadsheetApp.flush()
    rpc('utility_sheet_ack', { p_key: SYNC_KEY, p_rows: done })
  } finally {
    lock.releaseLock()
  }
}

function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncUtilities')
    .forEach(t => ScriptApp.deleteTrigger(t))
  ScriptApp.newTrigger('syncUtilities').timeBased().everyMinutes(15).create()
  syncUtilities()
}

function rpc(fn, body) {
  const res = UrlFetchApp.fetch(`${PULSE_URL}/rest/v1/rpc/${fn}`, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: PULSE_ANON, Authorization: `Bearer ${PULSE_ANON}` },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  })
  if (res.getResponseCode() >= 300) throw new Error(`Pulse ${fn}: ${res.getContentText()}`)
  return JSON.parse(res.getContentText())
}

// PID|WiFi|2026-10-27 — the same key Pulse stores in sheet_key
function keyOf(pid, service, start, tz) {
  const p = String(pid).trim().replace(/\.0$/, '')
  const s = String(service || '').trim()
  if (!p || !s || !start) return null
  let d
  if (start instanceof Date) d = Utilities.formatDate(start, tz, 'yyyy-MM-dd')
  else {
    const t = String(start).trim()
    let m
    if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) d = `${m[1]}-${m[2]}-${m[3]}`
    else if ((m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    else return null
  }
  return `${p}|${s}|${d}`
}

function toDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// match the dropdown's spelling (it has "DrinkPrime " with a trailing space)
function provider(p) {
  if (!p) return null
  const hit = PROVIDERS.find(x => x.trim().toLowerCase() === String(p).trim().toLowerCase())
  return hit || p
}
