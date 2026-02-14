/**
 * System config: Spreadsheet IDs live in Script Properties.
 *
 * Required:
 * - OPS_DB_SHEET_ID
 * - CONTROL_MODEL_SHEET_ID
 *
 * Optional (Phase B+):
 * - CEO_FINANCE_CORE_SHEET_ID
 */

const Sys_ = (() => {
  const cache = {};

  function prop_(key, required) {
    const v = PropertiesService.getScriptProperties().getProperty(key);
    const out = v ? String(v).trim() : '';
    if (required && !out) throw new Error('Missing ScriptProperty: ' + key);
    return out;
  }

  function dbId_(dbName) {
    switch (dbName) {
      case DB.OPS:
        return prop_('OPS_DB_SHEET_ID', true);
      case DB.CTRL:
        return prop_('CONTROL_MODEL_SHEET_ID', true);
      case DB.CFO:
        return prop_('CEO_FINANCE_CORE_SHEET_ID', false);
      default:
        throw new Error('Unknown dbName: ' + dbName);
    }
  }

  function ss_(dbName) {
    if (cache[dbName]) return cache[dbName];
    const id = dbId_(dbName);
    if (!id) return null;
    cache[dbName] = SpreadsheetApp.openById(id);
    return cache[dbName];
  }

  function sheet_(sheetName) {
    const dbName = SHEET_DB[sheetName];
    if (!dbName) throw new Error('SHEET_DB mapping missing for: ' + sheetName);
    const ss = ss_(dbName);
    if (!ss) throw new Error('Spreadsheet not configured for: ' + dbName);
    const sh = ss.getSheetByName(sheetName);
    if (!sh) throw new Error('Missing sheet tab: ' + sheetName + ' in ' + dbName);
    return sh;
  }

  return { ss_, sheet_, dbId_ };
})();
