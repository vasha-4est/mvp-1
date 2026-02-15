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

    let rows = Db_.readAll_(BATCH_REGISTRY_SHEET);

    if (status) {
      rows = rows.filter((row) => String(row.status || '').trim() === status);
    }

    if (prefix) {
      rows = rows.filter((row) => String(row.code || '').indexOf(prefix) === 0);
    }

    const items = rows.filter((row) => {
      const created = toDateValue_(row.created_at);
      if (!created) {
        return false;
      }

      if (fromDate && created.getTime() < fromDate.getTime()) {
        return false;
      }

      if (toDate && created.getTime() > toDate.getTime()) {
        return false;
      }

      return true;
    });

    return {
      items,
      total: items.length,
    };
  });

  Actions_.register_('batch_fetch', (ctx) => {
    const payload = ctx.payload || {};
    const code = String(payload.code || '').trim();

    if (!code) {
      throw new Error(ERROR.BAD_REQUEST + ': missing code');
    }

    const row = Db_.query_(BATCH_REGISTRY_SHEET, (item) => String(item.code || '').trim() === code)[0] || null;
    if (!row) {
      throw new Error(ERROR.NOT_FOUND + ': batch not found');
    }

    return row;
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

})();
