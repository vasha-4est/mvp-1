(function initBatchReadActions_(){
  const BATCH_REGISTRY_SHEET = 'batch_registry';

  Actions_.register_('batch_list', (ctx) => {
    const payload = ctx.payload || {};

    const fromDate = parseDateFilter_(payload.fromDate, 'fromDate', false);
    const toDate = parseDateFilter_(payload.toDate, 'toDate', true);

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new Error(ERROR.BAD_REQUEST + ': fromDate must be <= toDate');
    }

    const status = payload.status === undefined ? '' : String(payload.status).trim();
    const prefixRaw = payload.prefix === undefined ? payload.codePrefix : payload.prefix;
    const prefix = prefixRaw === undefined ? '' : String(prefixRaw).trim();

    const batchRegistry = getBatchRegistrySheet_();
    if (!batchRegistry) {
      return {
        items: [],
        total: 0,
      };
    }

    const rows = readRowsByHeader_(batchRegistry);

    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (status && String(row.status || '').trim() !== status) {
        continue;
      }

      const rowCode = String(row.code || '').trim();
      if (prefix && rowCode.indexOf(prefix) !== 0) {
        continue;
      }

      const created = toDateValue_(row.created_at);
      if (!created) {
        continue;
      }

      if (fromDate && created.getTime() < fromDate.getTime()) {
        continue;
      }

      if (toDate && created.getTime() > toDate.getTime()) {
        continue;
      }

      items.push(row);
    }

    return {
      items,
      total: items.length,
    };
  });

  Actions_.register_('batch_fetch', (ctx) => {
    const payload = ctx.payload || {};
    const identifier = String(payload.code || payload.id || '').trim();

    if (!identifier) {
      throw new Error(ERROR.BAD_REQUEST + ': missing code');
    }

    const batchRegistry = getBatchRegistrySheet_();
    if (!batchRegistry) {
      throw new Error(ERROR.NOT_FOUND + ': batch not found');
    }

    const rows = readRowsByHeader_(batchRegistry);
    const row = rows.find((item) => {
      const code = String(item.code || '').trim();
      const id = String(item.id || '').trim();
      return code === identifier || id === identifier;
    }) || null;

    if (!row) {
      throw new Error(ERROR.NOT_FOUND + ': batch not found');
    }

    return row;
  });

  Actions_.register_('batch_events_list', (ctx) => {
    const payload = ctx.payload || {};
    const code = String(payload.code || '').trim();

    if (!code) {
      throw new Error(ERROR.BAD_REQUEST + ': missing code');
    }

    if (!/^B-\d{6}-\d{3}$/.test(code) && !/^batch_[a-z0-9-]+$/.test(code)) {
      throw new Error(ERROR.BAD_REQUEST + ': invalid code');
    }

    const events = BatchEventsRepo_.listBatchEvents(code);
    return { events };
  });

  function parseDateFilter_(raw, field, isEndOfDay) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return null;
    }

    const input = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      throw new Error(ERROR.BAD_REQUEST + ': invalid ' + field + ' value (expected real YYYY-MM-DD date)');
    }

    const parts = input.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    const dt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    if (
      dt.getUTCFullYear() !== year ||
      dt.getUTCMonth() !== month - 1 ||
      dt.getUTCDate() !== day
    ) {
      throw new Error(ERROR.BAD_REQUEST + ': invalid ' + field + ' value (expected real YYYY-MM-DD date)');
    }

    if (isEndOfDay) {
      dt.setUTCHours(23, 59, 59, 999);
    }

    return dt;
  }

  function toDateValue_(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }

    const dt = new Date(String(value));
    if (Number.isNaN(dt.getTime())) {
      return null;
    }

    return dt;
  }

  function getBatchRegistrySheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) {
      throw new Error('Spreadsheet not configured for ' + DB.OPS);
    }

    return ss.getSheetByName(BATCH_REGISTRY_SHEET);
  }

  function readRowsByHeader_(sh) {
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) {
      return [];
    }

    const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map((value) => String(value).trim());
    const rowsCount = lastRow - 1;
    if (rowsCount <= 0) {
      return [];
    }

    const data = sh.getRange(2, 1, rowsCount, lastCol).getValues();

    return data.map((cells) => {
      const row = {};
      for (let i = 0; i < header.length; i++) {
        const key = header[i] || ('col_' + i);
        row[key] = cells[i];
      }
      return row;
    });
  }

})();
