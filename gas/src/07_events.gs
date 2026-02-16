/** Events log: OPS_DB/events_log */

const Events_ = (() => {
  const BATCH_EVENTS_HEADERS = ['at', 'batch_code', 'batch_id', 'type', 'actor', 'request_id', 'details_json'];
  const BATCH_EVENTS_DUP_SCAN_LIMIT = 500;

  function log_(ctx, eventKey, zoneId, objectType, payload) {
    if (!ctx.flags.isOn(FLAG.EVENT_LOG)) return;
    Db_.append_(SHEET.EVENTS, {
      event_id: uuid_(),
      server_ts: nowIso_(),
      request_id: ctx.requestId,
      event_key: eventKey,
      zone_id: zoneId || '',
      object_type: objectType || '',
      payload_json: JSON.stringify(payload || {}),
      actor_employee_id: ctx.actor.employee_id,
      actor_role: ctx.actor.role,
    });
  }

  function append_(event) {
    const sh = ensureBatchEventsSheet_();

    const row = {
      at: String(event && event.at ? event.at : nowIso_()),
      batch_code: String(event && event.batch_code ? event.batch_code : ''),
      batch_id: String(event && event.batch_id ? event.batch_id : ''),
      type: String(event && event.type ? event.type : ''),
      actor: String(event && event.actor ? event.actor : ''),
      request_id: String(event && event.request_id ? event.request_id : ''),
      details_json: toDetailsJson_(event ? event.details : undefined),
    };

    if (!row.batch_code) throw new Error(ERROR.BAD_REQUEST + ': batch_code is required');
    if (!row.type) throw new Error(ERROR.BAD_REQUEST + ': type is required');
    if (!row.request_id) throw new Error(ERROR.BAD_REQUEST + ': request_id is required');

    if (exists_(row.request_id, row.type)) {
      return false;
    }

    appendByHeader_(sh, row);
    return true;
  }

  function exists_(requestId, type) {
    const req = String(requestId || '').trim();
    const eventType = String(type || '').trim();

    if (!req || !eventType) return false;

    const sh = getBatchEventsSheet_();
    if (!sh) return false;

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return false;

    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const reqIdx = header.indexOf('request_id');
    const typeIdx = header.indexOf('type');
    if (reqIdx === -1 || typeIdx === -1) return false;

    const available = lastRow - 1;
    const rowsToRead = Math.min(BATCH_EVENTS_DUP_SCAN_LIMIT, available);
    const startRow = lastRow - rowsToRead + 1;
    const values = sh.getRange(startRow, 1, rowsToRead, header.length).getValues();

    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][reqIdx]) === req && String(values[i][typeIdx]) === eventType) {
        return true;
      }
    }

    return false;
  }

  function ensureBatchEventsSheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) throw new Error('Spreadsheet not configured for ' + DB.OPS);

    let sh = ss.getSheetByName(SHEET.BATCH_EVENTS);
    if (!sh) {
      sh = ss.insertSheet(SHEET.BATCH_EVENTS);
      sh.getRange(1, 1, 1, BATCH_EVENTS_HEADERS.length).setValues([BATCH_EVENTS_HEADERS]);
      return sh;
    }

    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, BATCH_EVENTS_HEADERS.length).setValues([BATCH_EVENTS_HEADERS]);
      return sh;
    }

    const header = sh
      .getRange(1, 1, 1, Math.max(sh.getLastColumn(), BATCH_EVENTS_HEADERS.length))
      .getValues()[0]
      .map(String);
    const valid = BATCH_EVENTS_HEADERS.every((name, index) => header[index] === name);
    if (!valid) {
      throw new Error(ERROR.BAD_REQUEST + ': invalid headers in sheet ' + SHEET.BATCH_EVENTS);
    }

    return sh;
  }

  function getBatchEventsSheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) throw new Error('Spreadsheet not configured for ' + DB.OPS);
    return ss.getSheetByName(SHEET.BATCH_EVENTS);
  }

  function appendByHeader_(sh, rowObj) {
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const values = header.map((key) => (Object.prototype.hasOwnProperty.call(rowObj, key) ? rowObj[key] : ''));
    sh.appendRow(values);
  }

  function toDetailsJson_(details) {
    if (details === undefined || details === null || details === '') {
      return '';
    }

    if (typeof details === 'string') {
      return details;
    }

    return JSON.stringify(details);
  }

  return { log_, append_, exists_ };
})();
