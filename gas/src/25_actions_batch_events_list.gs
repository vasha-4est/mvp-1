(function initBatchEventsListAction_() {
  const BATCH_REGISTRY_SHEET = 'batch_registry';

  Actions_.register_('batch_events_list', (ctx) => {
    const payload = ctx.payload || {};
    const code = String(payload.code || '').trim();

    validateBatchCode_(code);

    if (!batchExists_(code)) {
      throw statusError_('NOT_FOUND', 'Batch not found');
    }

    const events = BatchEventsRepo_.listBatchEvents(code)
      .map((event, index) => ({
        event,
        index,
        time: parseEventTime_(event && event.at),
      }))
      .sort((a, b) => {
        const aHasTime = a.time !== null;
        const bHasTime = b.time !== null;

        if (aHasTime && bHasTime) {
          if (a.time !== b.time) {
            return a.time - b.time;
          }
          return a.index - b.index;
        }

        if (!aHasTime && !bHasTime) {
          return a.index - b.index;
        }

        return aHasTime ? -1 : 1;
      })
      .map((item) => item.event);

    return {
      batch_code: code,
      events,
    };
  });

  function validateBatchCode_(code) {
    const isValid = /^B-\d{6}-\d{3}$/.test(code) || /^batch_[a-z0-9-]+$/.test(code);
    if (!isValid) {
      throw validationError_('Invalid code format');
    }
  }

  function parseEventTime_(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }

    const dt = new Date(String(value));
    if (Number.isNaN(dt.getTime())) {
      return null;
    }

    return dt.getTime();
  }

  function batchExists_(code) {
    const sheet = getBatchRegistrySheet_();
    if (!sheet) {
      return false;
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) {
      return false;
    }

    const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((value) => String(value).trim());
    const codeIndex = header.indexOf('code');
    if (codeIndex === -1) {
      throw validationError_('batch_registry sheet requires code column');
    }

    const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][codeIndex] || '').trim() === code) {
        return true;
      }
    }

    return false;
  }

  function getBatchRegistrySheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) {
      throw new Error('Spreadsheet not configured for ' + DB.OPS);
    }

    return ss.getSheetByName(BATCH_REGISTRY_SHEET);
  }

  function validationError_(message) {
    return statusError_('VALIDATION_ERROR', message);
  }

  function statusError_(code, message) {
    throw new Error(code + ': ' + message);
  }
})();
