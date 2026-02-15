(function initBatchCreateActions_(){
  const SERVICE_TIMEZONE = 'Europe/Moscow';
  const LOCK_WAIT_MS = 30000;

  const BATCH_REGISTRY_SHEET = 'batch_registry';
  const BATCH_HEADERS = ['id', 'code', 'status', 'created_at', 'request_id', 'note'];

  const SEQUENCES_SHEET = 'sequences';
  const SEQUENCE_HEADERS = ['date_key', 'last_seq', 'updated_at', 'updated_by'];

  Actions_.register_('batch_create', (ctx) => {
    const payload = ctx.payload || {};
    const note = payload.note === undefined ? '' : String(payload.note);

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_WAIT_MS);
    } catch (_e) {
      throw new Error(ERROR.LOCK_CONFLICT + ': lock timeout after ' + LOCK_WAIT_MS + 'ms');
    }

    try {
      const batchSheet = ensureBatchRegistrySheet_();
      const sequenceSheet = ensureSequencesSheet_();

      const existing = findBatchByRequestId_(batchSheet, ctx.requestId);
      if (existing) {
        return {
          id: String(existing.id || ''),
          code: String(existing.code || ''),
          status: String(existing.status || 'created'),
          created_at: String(existing.created_at || ''),
        };
      }

      const now = new Date();
      const dateKey = Utilities.formatDate(now, SERVICE_TIMEZONE, 'yyMMdd');
      const nextSeq = nextDailySequence_(sequenceSheet, dateKey);
      const padded = String(nextSeq).padStart(3, '0');
      const code = 'B-' + dateKey + '-' + padded;

      const row = {
        id: 'batch_' + uuid_(),
        code,
        status: 'created',
        created_at: nowIso_(),
        request_id: ctx.requestId,
        note,
      };

      appendByHeader_(batchSheet, row);

      return {
        id: row.id,
        code: row.code,
        status: row.status,
        created_at: row.created_at,
      };
    } finally {
      lock.releaseLock();
    }
  });

  function ensureBatchRegistrySheet_() {
    return ensureSheetWithHeaders_(BATCH_REGISTRY_SHEET, BATCH_HEADERS);
  }

  function ensureSequencesSheet_() {
    return ensureSheetWithHeaders_(SEQUENCES_SHEET, SEQUENCE_HEADERS);
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

  function nextDailySequence_(sh, dateKey) {
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const dateIdx = header.indexOf('date_key');
    const seqIdx = header.indexOf('last_seq');
    const updatedAtIdx = header.indexOf('updated_at');
    const updatedByIdx = header.indexOf('updated_by');
    if (dateIdx === -1 || seqIdx === -1 || updatedAtIdx === -1 || updatedByIdx === -1) {
      throw new Error(ERROR.BAD_REQUEST + ': sequences sheet must have date_key,last_seq,updated_at,updated_by');
    }

    const lastRow = sh.getLastRow();
    const rowsCount = Math.max(0, lastRow - 1);
    const data = rowsCount > 0 ? sh.getRange(2, 1, rowsCount, header.length).getValues() : [];

    let foundIndex = -1;
    let lastSeq = 0;

    for (let i = 0; i < data.length; i++) {
      if (String(data[i][dateIdx]) === String(dateKey)) {
        foundIndex = i;
        const parsed = Number(data[i][seqIdx]);
        lastSeq = Number.isFinite(parsed) ? parsed : 0;
        break;
      }
    }

    const nextSeq = lastSeq + 1;
    const updatedAt = nowIso_();

    if (foundIndex === -1) {
      const newRow = header.map(() => '');
      newRow[dateIdx] = dateKey;
      newRow[seqIdx] = nextSeq;
      newRow[updatedAtIdx] = updatedAt;
      newRow[updatedByIdx] = 'service';
      sh.appendRow(newRow);
    } else {
      const rowNumber = foundIndex + 2;
      sh.getRange(rowNumber, seqIdx + 1).setValue(nextSeq);
      sh.getRange(rowNumber, updatedAtIdx + 1).setValue(updatedAt);
      sh.getRange(rowNumber, updatedByIdx + 1).setValue('service');
    }

    return nextSeq;
  }

  function appendByHeader_(sh, rowObj) {
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const values = header.map((key) => Object.prototype.hasOwnProperty.call(rowObj, key) ? rowObj[key] : '');
    sh.appendRow(values);
  }

  function findBatchByRequestId_(sh, requestId) {
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return null;

    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const reqIdx = header.indexOf('request_id');
    if (reqIdx === -1) return null;

    const data = sh.getRange(2, 1, lastRow - 1, header.length).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][reqIdx]) === String(requestId)) {
        const rowObj = {};
        for (let j = 0; j < header.length; j++) {
          rowObj[header[j]] = data[i][j];
        }
        return rowObj;
      }
    }

    return null;
  }
})();
