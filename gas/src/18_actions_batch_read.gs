(function initBatchReadActions_(){
  const BATCH_REGISTRY_SHEET = 'batch_registry';
  const BATCH_HEADERS = ['id', 'code', 'status', 'created_at', 'request_id', 'note'];

  Actions_.register_('batch_fetch', (ctx) => {
    const payload = ctx.payload || {};
    const code = payload.code === undefined ? '' : String(payload.code).trim();
    const id = payload.id === undefined ? '' : String(payload.id).trim();

    if (!code && !id) {
      throw new Error(ERROR.BAD_REQUEST + ': batch_fetch requires code or id');
    }

    const sheet = ensureBatchRegistrySheet_();
    const header = getHeader_(sheet);
    const codeIdx = header.indexOf('code');
    const idIdx = header.indexOf('id');

    if (codeIdx === -1 || idIdx === -1) {
      throw new Error(ERROR.BAD_REQUEST + ': batch_registry requires id and code columns');
    }

    const rows = readDataRows_(sheet, header.length);
    for (let i = 0; i < rows.length; i++) {
      const rowCode = String(rows[i][codeIdx] || '');
      const rowId = String(rows[i][idIdx] || '');
      if ((code && rowCode === code) || (id && rowId === id)) {
        return toObject_(header, rows[i]);
      }
    }

    throw new Error(ERROR.NOT_FOUND + ': batch not found');
  });

  Actions_.register_('batch_list', (ctx) => {
    const payload = ctx.payload || {};
    const status = payload.status === undefined ? '' : String(payload.status).trim();
    const prefix = payload.prefix === undefined ? '' : String(payload.prefix).trim();
    const fromDate = payload.fromDate === undefined ? '' : String(payload.fromDate).trim();
    const toDate = payload.toDate === undefined ? '' : String(payload.toDate).trim();

    const fromTs = fromDate ? parseDateFilter_(fromDate, 'fromDate', false) : null;
    const toTs = toDate ? parseDateFilter_(toDate, 'toDate', true) : null;

    if (fromTs !== null && toTs !== null && fromTs > toTs) {
      throw new Error(ERROR.BAD_REQUEST + ': fromDate must be <= toDate');
    }

    const sheet = ensureBatchRegistrySheet_();
    const header = getHeader_(sheet);
    const statusIdx = header.indexOf('status');
    const createdAtIdx = header.indexOf('created_at');
    const codeIdx = header.indexOf('code');

    if (statusIdx === -1 || createdAtIdx === -1 || codeIdx === -1) {
      throw new Error(ERROR.BAD_REQUEST + ': batch_registry requires status, created_at, code columns');
    }

    const rows = readDataRows_(sheet, header.length);
    const result = [];

    for (let i = 0; i < rows.length; i++) {
      const rowStatus = String(rows[i][statusIdx] || '');
      const rowCode = String(rows[i][codeIdx] || '');
      const createdAtStr = String(rows[i][createdAtIdx] || '').trim();
      const createdAtTs = createdAtStr ? Date.parse(createdAtStr) : NaN;

      if (status && rowStatus !== status) continue;
      if (prefix && !rowCode.startsWith(prefix)) continue;
      if (fromTs !== null) {
        if (Number.isNaN(createdAtTs) || createdAtTs < fromTs) continue;
      }
      if (toTs !== null) {
        if (Number.isNaN(createdAtTs) || createdAtTs > toTs) continue;
      }

      result.push(toObject_(header, rows[i]));
    }

    return result;
  });

  function parseDateFilter_(raw, field, isEndOfDay) {
    const parsed = new Date(raw + 'T00:00:00.000Z');
    if (String(parsed) === 'Invalid Date') {
      throw new Error(ERROR.BAD_REQUEST + ': invalid ' + field + ' format (expected YYYY-MM-DD)');
    }

    if (isEndOfDay) {
      parsed.setUTCHours(23, 59, 59, 999);
    }

    return parsed.getTime();
  }

  function ensureBatchRegistrySheet_() {
    return ensureSheetWithHeaders_(BATCH_REGISTRY_SHEET, BATCH_HEADERS);
  }

  function ensureSheetWithHeaders_(sheetName, expectedHeaders) {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) throw new Error('Spreadsheet not configured for ' + DB.OPS);

    let sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
      sh.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      return sh;
    }

    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      return sh;
    }

    const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), expectedHeaders.length)).getValues()[0].map(String);
    const isSameHeader = expectedHeaders.every((name, index) => header[index] === name);
    if (!isSameHeader) {
      throw new Error(ERROR.BAD_REQUEST + ': invalid headers in sheet ' + sheetName);
    }

    return sh;
  }

  function getHeader_(sh) {
    return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  }

  function readDataRows_(sh, columnCount) {
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return [];
    return sh.getRange(2, 1, lastRow - 1, columnCount).getValues();
  }

  function toObject_(header, row) {
    const out = {};
    for (let i = 0; i < header.length; i++) {
      out[header[i]] = row[i];
    }
    return out;
  }
})();
