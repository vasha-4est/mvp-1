/** Read-only shipment plan import actions. */

(function initShipmentPlanReadActions_() {
  const REQUIRED_COLUMNS = [
    'import_batch_id',
    'shipment_id',
    'planned_date',
    'deadline_at',
    'destination',
    'products_sku',
    'planned_qty',
    'pasted_at',
    'status',
  ];

  Actions_.register_('shipment_plan_import.staged.latest', () => {
    try {
      const sheet = Sys_.sheet_(SHEET.SHIPMENT_PLAN_IMPORT);
      const read = readSheetRows_(sheet);

      ensureRequiredColumns_(read.headers, REQUIRED_COLUMNS, SHEET.SHIPMENT_PLAN_IMPORT);

      const stagedRows = read.rows.filter((row) => asString_(row.status).toLowerCase() === 'staged');
      if (stagedRows.length === 0) {
        return {
          ok: true,
          import_batch_id: '',
          rows: [],
        };
      }

      const latestBatchId = pickLatestBatchId_(stagedRows);
      const rows = stagedRows.filter((row) => asString_(row.import_batch_id) === latestBatchId);

      return {
        ok: true,
        import_batch_id: latestBatchId,
        rows: rows,
      };
    } catch (err) {
      rethrowNormalized_(err);
    }
  });

  function pickLatestBatchId_(rows) {
    const batches = {};

    for (let i = 0; i < rows.length; i++) {
      const batchId = asString_(rows[i].import_batch_id);
      if (!batchId) continue;

      const pastedAt = asString_(rows[i].pasted_at);
      const current = batches[batchId];
      if (!current || pastedAt > current.pasted_at) {
        batches[batchId] = {
          import_batch_id: batchId,
          pasted_at: pastedAt,
        };
      }
    }

    return Object.keys(batches)
      .map((key) => batches[key])
      .sort((left, right) => {
        const dateCompare = asString_(right.pasted_at).localeCompare(asString_(left.pasted_at));
        if (dateCompare !== 0) return dateCompare;
        return asString_(right.import_batch_id).localeCompare(asString_(left.import_batch_id));
      })[0].import_batch_id;
  }

  function asString_(value) {
    return String(value == null ? '' : value).trim();
  }

  function readSheetRows_(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) return { headers: [], rows: [] };

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((value) => asString_(value));
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { headers, rows: [] };

    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const rows = values.map((row) => {
      const out = {};
      for (let i = 0; i < headers.length; i++) out[headers[i]] = row[i];
      return out;
    });

    return { headers, rows };
  }

  function ensureRequiredColumns_(headers, requiredColumns, sheetName) {
    const missing = requiredColumns.filter((name) => headers.indexOf(name) === -1);
    if (missing.length > 0) {
      throw new Error(ERROR.BAD_REQUEST + ': missing required columns in ' + sheetName + ': ' + missing.join(','));
    }
  }

  function rethrowNormalized_(err) {
    const message = String(err && err.message ? err.message : err);
    if (/^[A-Z_]+\s*:\s*/.test(message)) {
      throw err;
    }

    throw new Error(ERROR.INTERNAL_ERROR + ': ' + message);
  }
})();
