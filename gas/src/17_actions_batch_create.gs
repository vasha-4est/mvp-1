(function initBatchCreateActions_(){
  const BATCH_HEADERS = ['id', 'code', 'status', 'created_at', 'request_id', 'note'];

  Actions_.register_('batch_create', (ctx) => {
    const payload = ctx.payload || {};
    const code = String(payload.code || '').trim();
    const note = payload.note === undefined ? '' : String(payload.note);

    if (!code) {
      throw new Error(ERROR.BAD_REQUEST + ': code is required');
    }

    const sh = ensureBatchesSheet_();
    const existing = findBatchByRequestId_(sh, ctx.requestId);
    if (existing) {
      return {
        id: String(existing.id || ''),
        code: String(existing.code || ''),
        status: String(existing.status || 'created'),
        created_at: String(existing.created_at || ''),
      };
    }

    const row = {
      id: 'batch_' + uuid_(),
      code,
      status: 'created',
      created_at: nowIso_(),
      request_id: ctx.requestId,
      note,
    };

    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const values = header.map((key) => Object.prototype.hasOwnProperty.call(row, key) ? row[key] : '');
    sh.appendRow(values);

    return {
      id: row.id,
      code: row.code,
      status: row.status,
      created_at: row.created_at,
    };
  });

  function ensureBatchesSheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) throw new Error('Spreadsheet not configured for ' + DB.OPS);

    let sh = ss.getSheetByName('batches');
    if (!sh) {
      sh = ss.insertSheet('batches');
      sh.getRange(1, 1, 1, BATCH_HEADERS.length).setValues([BATCH_HEADERS]);
      return sh;
    }

    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, BATCH_HEADERS.length).setValues([BATCH_HEADERS]);
      return sh;
    }

    const existingHeader = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), BATCH_HEADERS.length)).getValues()[0].map(String);
    const current = existingHeader.slice(0, BATCH_HEADERS.length);

    if (current.join('|') !== BATCH_HEADERS.join('|')) {
      sh.getRange(1, 1, 1, BATCH_HEADERS.length).setValues([BATCH_HEADERS]);
    }

    return sh;
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
