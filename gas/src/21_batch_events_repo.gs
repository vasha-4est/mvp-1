/** batch_events repository (OPS_DB / append-only). */

const BatchEventsRepo_ = (() => {
  const HEADERS = ['event_id', 'batch_code', 'type', 'actor', 'at', 'payload'];

  /**
   * @param {BatchEvent} event
   * @returns {BatchEvent}
   */
  function insertBatchEvent(event) {
    const sh = ensureBatchEventsSheet_();

    const row = {
      event_id: String(event && event.event_id ? event.event_id : ''),
      batch_code: String(event && event.batch_code ? event.batch_code : ''),
      type: String(event && event.type ? event.type : ''),
      actor: String(event && event.actor ? event.actor : ''),
      at: String(event && event.at ? event.at : ''),
      payload: String(event && event.payload ? event.payload : '{}'),
    };

    if (!row.event_id) throw new Error(ERROR.BAD_REQUEST + ': event_id is required');
    if (!row.batch_code) throw new Error(ERROR.BAD_REQUEST + ': batch_code is required');
    if (!row.type) throw new Error(ERROR.BAD_REQUEST + ': type is required');
    if (!row.at) throw new Error(ERROR.BAD_REQUEST + ': at is required');

    appendByHeader_(sh, row);
    return row;
  }

  /**
   * @param {string} batchCode
   * @returns {BatchEvent[]}
   */
  function listBatchEvents(batchCode) {
    const sh = getBatchEventsSheet_();
    if (!sh) return [];

    const rows = readRowsByHeader_(sh);
    if (!batchCode) return rows;

    const requestedCode = String(batchCode || '').trim();
    return rows.filter((row) => String(row.batch_code || '').trim() === requestedCode);
  }

  function ensureBatchEventsSheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) throw new Error('Spreadsheet not configured for ' + DB.OPS);

    let sh = ss.getSheetByName(SHEET.BATCH_EVENTS);
    if (!sh) {
      sh = ss.insertSheet(SHEET.BATCH_EVENTS);
      sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      return sh;
    }

    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      return sh;
    }

    const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), HEADERS.length)).getValues()[0].map(String);
    const isSameHeader = HEADERS.every((name, index) => header[index] === name);
    if (!isSameHeader) {
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
    const values = header.map((key) => Object.prototype.hasOwnProperty.call(rowObj, key) ? rowObj[key] : '');
    sh.appendRow(values);
  }

  function readRowsByHeader_(sh) {
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return [];

    const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map((value) => String(value).trim());
    const rowsCount = lastRow - 1;
    if (rowsCount <= 0) return [];

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

  return { insertBatchEvent, listBatchEvents };
})();
