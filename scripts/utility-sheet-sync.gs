/**
 * Fixture 0.05 — the sheet's whole Apps Script (Extensions → Apps Script → Code.gs).
 *
 * Part 1  onEdit dropdowns for estimate-dboard and master-po. This is the
 *         sheet's existing code, unchanged.
 * Part 2  Pulse → utility-log. Every 15 minutes it asks Pulse for WiFi / water
 *         purifier bookings that aren't in the sheet yet, or were edited in Pulse
 *         since, and writes them in the tab's own columns. Gas, pest control
 *         and anything else stay in Pulse.
 *
 * Written in plain ES5 (var, function) so it runs on either Apps Script
 * runtime. A syntax the old runtime can't read would stop onEdit too.
 * Changes made by a script don't fire onEdit, so the sync never sets off
 * the dropdown code.
 *
 * Setup: paste the keys into PULSE_ANON and PULSE_SYNC_KEY, save, run
 * installUtilitySync once and approve. Run syncUtilities to sync now.
 */


/* ═══════════════════════ Part 1 — existing dropdowns ═══════════════════════ */

function onEdit(e) {
  try {
    if (!e || !e.range || !e.range.getSheet()) return;

    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    var row = e.range.getRow();
    var col = e.range.getColumn();

    if (row <= 1) return;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var coreSheet        = ss.getSheetByName("core-nomc");
    var materialSheet    = ss.getSheetByName("material-rc");
    var labourSheet      = ss.getSheetByName("labour-rc");
    var labourDboardSheet = ss.getSheetByName("labour-dboard");

    if (!coreSheet || !materialSheet || !labourSheet || !labourDboardSheet) {
      Logger.log("One or more sheets not found. Please check the sheet names.");
      return;
    }

    var coreData         = coreSheet.getDataRange().getValues();
    var materialData     = materialSheet.getDataRange().getValues();
    var labourData       = labourSheet.getDataRange().getValues();
    var labourDboardData = labourDboardSheet.getDataRange().getValues();

    if (sheetName === "estimate-dboard") {

      if (col === 3) {
        var area = sheet.getRange(row, 3).getValue();
        var issues = getIssuesForArea(area, coreData);
        sheet.getRange(row, 4).clearContent();
        updateDropdown(row, 4, issues, sheet);
      }

      if (col === 6) {
        var category = sheet.getRange(row, 6).getValue();

        var materials = getMaterialsForCategory(category, materialData);
        sheet.getRange(row, 9).clearContent();
        sheet.getRange(row, 10).clearContent();
        sheet.getRange(row, 11).clearContent();
        updateDropdown(row, 9, materials, sheet);

        var labourServices = getLabourForCategory(category, labourData);
        sheet.getRange(row, 12).clearContent();
        sheet.getRange(row, 13).clearContent();
        updateDropdown(row, 12, labourServices, sheet);
      }

      if (col === 9) {
        var materialName = sheet.getRange(row, 9).getValue();
        var matDetails = getMaterialDetails(materialName, materialData);
        sheet.getRange(row, 10).setValue(matDetails.code);
        sheet.getRange(row, 11).setValue(matDetails.cost);
      }

      if (col === 12) {
        var labourDesc = sheet.getRange(row, 12).getValue();
        var labourCost = getLabourCost(labourDesc, labourData);
        sheet.getRange(row, 13).setValue(labourCost !== null ? labourCost : 0);
      }
    }

    else if (sheetName === "master-po") {

      if (col === 3) {
        var expertise = sheet.getRange(row, 3).getValue();

        var vendors = getVendorsForExpertise(expertise, labourDboardData);
        sheet.getRange(row, 4).clearContent();
        updateDropdown(row, 4, vendors, sheet);

        var services = getServicesForExpertise(expertise, labourData);
        sheet.getRange(row, 5).clearContent();
        sheet.getRange(row, 8).clearContent();
        updateDropdown(row, 5, services, sheet);

        var inventory = getInventoryForExpertise(expertise, materialData);
        sheet.getRange(row, 6).clearContent();
        updateDropdown(row, 6, inventory, sheet);
      }

      if (col === 5) {
        var selectedService = sheet.getRange(row, 5).getValue();
        var unitCost = getUnitCost(selectedService, labourData);
        if (unitCost !== null && selectedService) {
          sheet.getRange(row, 8).setValue(unitCost);
        } else {
          sheet.getRange(row, 8).clearContent();
        }
      }
    }

  } catch (error) {
    Logger.log("Error in onEdit: " + error.toString());
  }
}

function getIssuesForArea(area, data) {
  var issues = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === area) {
      issues.push(data[i][1]);
    }
  }
  return issues;
}

function getMaterialsForCategory(category, data) {
  var materials = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][4] === category) {
      materials.push(data[i][0]);
    }
  }
  return materials;
}

function getMaterialDetails(materialName, data) {
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === materialName) {
      return { code: data[i][1], cost: data[i][2] };
    }
  }
  return { code: "Not Found", cost: 0 };
}

function getLabourForCategory(category, data) {
  var services = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][3] === category) {
      services.push(data[i][2]);
    }
  }
  return services;
}

function getLabourCost(labourDesc, data) {
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === labourDesc) {
      return data[i][5] !== "" ? data[i][5] : null;
    }
  }
  return null;
}

function getVendorsForExpertise(expertise, data) {
  var vendors = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === expertise) {
      vendors.push(data[i][1]);
    }
  }
  return vendors;
}

function getServicesForExpertise(expertise, data) {
  var services = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][3] === expertise) {
      services.push(data[i][2]);
    }
  }
  return services;
}

function getInventoryForExpertise(expertise, data) {
  var inventory = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][4] === expertise) {
      inventory.push(data[i][0]);
    }
  }
  return inventory;
}

function getUnitCost(selectedValue, data) {
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === selectedValue) {
      return data[i][5] !== "" ? data[i][5] : null;
    }
  }
  return null;
}

function updateDropdown(row, col, values, sheet) {
  var range = sheet.getRange(row, col);
  range.clearDataValidations();
  var list = values.length > 0 ? values : ["No Options Available"];
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(list)
    .setAllowInvalid(false)
    .build();
  range.setDataValidation(rule);
}


/* ═══════════════════════ Part 2 — Pulse → utility-log ═══════════════════════
 *
 *   A Booking Date  sheet formula, left alone        I Start Date  dd-mm-yyyy
 *   B PID                                            J Acc-PH-DP ID
 *   C Month         sheet formula, left alone        K SSID
 *   D Service       WiFi | Water                     L Password
 *   E Provider      the dropdown's spelling          M Plan Type
 *   F Duration      1M 2M 3M 6M 12M                  N LockBox Code
 *   G Plan Price                                     O Invoice link
 *   H Added Cost                                     P Payment Mode
 *
 * A booking already in the sheet (same PID + service + start date) is updated
 * in place, and only in the cells Pulse has a value for; nothing in the sheet
 * is blanked. Anything new goes under the last row that has a PID. Pulse is
 * told which rows were written, so each booking is sent once, and again only
 * if it's edited in Pulse.
 */

var PULSE_URL = 'https://pjetqnlvyuuejcuvkare.supabase.co';
var PULSE_ANON = 'PASTE_ANON_KEY';      // the public anon key Pulse's web app uses
var PULSE_SYNC_KEY = 'PASTE_SYNC_KEY';  // the sheet's own key (api_clients, scope utilities:sheet)
var UTILITY_TAB = 'utility-log';
var UTILITY_PROVIDERS = ['ACT', 'Airtel', 'DrinkPrime ', 'LivPure', 'Local Vendor', 'AquaGuard-LL', 'Tata Play Fiber'];

function syncUtilities() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var rows = pulseRpc_('utility_sheet_feed', { p_key: PULSE_SYNC_KEY });
    if (!rows.length) return;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(UTILITY_TAB);
    if (!sh) throw new Error('No tab named ' + UTILITY_TAB);
    var tz = ss.getSpreadsheetTimeZone();

    // last row that actually has a PID. Columns A and C carry formulas far below.
    var lastRow = sh.getLastRow();
    var last = 1;
    if (lastRow > 1) {
      var colB = sh.getRange(2, 2, lastRow - 1, 1).getValues();
      for (var i = colB.length - 1; i >= 0; i--) {
        if (String(colB[i][0]).replace(/^\s+|\s+$/g, '') !== '') { last = i + 2; break; }
      }
    }

    var at = {};
    if (last > 1) {
      var data = sh.getRange(2, 1, last - 1, 16).getValues();
      for (var r = 0; r < data.length; r++) {
        var k0 = utilityKey_(data[r][1], data[r][3], data[r][8], tz);
        if (k0) at[k0] = r + 2;
      }
    }

    var done = [];
    for (var j = 0; j < rows.length; j++) {
      var u = rows[j];
      var key = utilityKey_(u.pid, u.service, u.start, tz);
      var row = (u.sheet_key && at[u.sheet_key]) || (key && at[key]);
      var fresh = !row;
      if (fresh) { last = last + 1; row = last; if (key) at[key] = row; }

      var cells = [
        [2, Number(u.pid)],
        [4, u.service],
        [5, utilityProvider_(u.provider)],
        [6, u.duration],
        [7, u.price],
        [8, u.added],
        [9, u.start ? utilityDate_(u.start) : null],
        [10, u.account],
        [11, u.ssid],
        [12, u.password],
        [13, u.plan],
        [14, u.lockbox],
        [15, u.invoice],
        [16, u.payment]
      ];
      for (var c = 0; c < cells.length; c++) {
        var col = cells[c][0], v = cells[c][1];
        if (v === null || v === undefined || v === '') {
          // a new row gets the sheet's usual fillers; an existing row keeps what it has
          if (fresh && col === 6) sh.getRange(row, col).setValue('N/A');
          if (fresh && col === 8) sh.getRange(row, col).setValue(0);
          continue;
        }
        sh.getRange(row, col).setValue(v);
      }
      sh.getRange(row, 9).setNumberFormat('dd-mm-yyyy');
      sh.getRange(row, 10).setNumberFormat('0');
      if (!sh.getRange(row, 1).getFormula()) sh.getRange(row, 1).setFormula('=IF(B' + row + '<>"", TODAY(), "")');
      if (!sh.getRange(row, 3).getFormula()) sh.getRange(row, 3).setFormula('=TEXT(I' + row + ', "mmm yyyy")');
      done.push({ id: u.id, key: key });
    }
    SpreadsheetApp.flush();
    pulseRpc_('utility_sheet_ack', { p_key: PULSE_SYNC_KEY, p_rows: done });
  } finally {
    lock.releaseLock();
  }
}

// Run once. It replaces only its own 15-minute trigger, never the sheet's
// other triggers, then syncs straight away.
function installUtilitySync() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncUtilities') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('syncUtilities').timeBased().everyMinutes(15).create();
  syncUtilities();
}

function pulseRpc_(fn, body) {
  var res = UrlFetchApp.fetch(PULSE_URL + '/rest/v1/rpc/' + fn, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: PULSE_ANON, Authorization: 'Bearer ' + PULSE_ANON },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('Pulse ' + fn + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}

// PID|WiFi|2026-10-27, the same key Pulse stores in sheet_key
function utilityKey_(pid, service, start, tz) {
  var p = String(pid === null || pid === undefined ? '' : pid).replace(/^\s+|\s+$/g, '').replace(/\.0$/, '');
  var s = String(service || '').replace(/^\s+|\s+$/g, '');
  if (!p || !s || !start) return null;
  var d, m;
  if (start instanceof Date) {
    d = Utilities.formatDate(start, tz, 'yyyy-MM-dd');
  } else {
    var t = String(start).replace(/^\s+|\s+$/g, '');
    if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) d = m[1] + '-' + m[2] + '-' + m[3];
    else if ((m = t.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/))) d = m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
    else return null;
  }
  return p + '|' + s + '|' + d;
}

function pad2_(x) { x = String(x); return x.length < 2 ? '0' + x : x; }

function utilityDate_(iso) {
  var p = String(iso).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

// match the dropdown's spelling (it has "DrinkPrime " with a trailing space)
function utilityProvider_(p) {
  if (!p) return null;
  var want = String(p).replace(/^\s+|\s+$/g, '').toLowerCase();
  for (var i = 0; i < UTILITY_PROVIDERS.length; i++) {
    if (UTILITY_PROVIDERS[i].replace(/^\s+|\s+$/g, '').toLowerCase() === want) return UTILITY_PROVIDERS[i];
  }
  return p;
}
