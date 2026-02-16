(function initBatchStatusPatchAction_() {
  const BATCH_REGISTRY_SHEET = 'batch_registry';
  const BATCH_STATUS_IDEMPOTENCY_SHEET = 'batch_status_idempotency';
  const LOCK_WAIT_MS = 5000;

  const BATCH_STATUS_IDEMPOTENCY_HEADERS = [
    'batch_code',
    'idempotency_key',
    'to_status',
    'result_status',
    'updated_at',
  ];

  Actions_.register_('batch_status_patch', (ctx) => {
    const payload = ctx.payload || {};

    const code = String(payload.code || '').trim();
    const toStatus = String(payload.to_status || '').trim();
    const idempotencyKey = String(payload.idempotency_key || '').trim();

    validateInput_(code, toStatus, idempotencyKey);

    const precheckReplay = findIdempotencyRecord_(code, idempotencyKey);
    if (precheckReplay) {
      if (String(precheckReplay.to_status) !== toStatus) {
        throw conflictError_('IDEMPOTENCY_KEY_REUSE', 'Idempotency key already used with a different to_status', {
          batch_code: code,
          idempotency_key: idempotencyKey,
          existing_to_status: String(precheckReplay.to_status || ''),
          requested_to_status: toStatus,
        });
      }

      const precheckBatch = findBatchByCode_(code);
      if (!precheckBatch) {
        throw statusError_('NOT_FOUND', 'Batch not found');
      }

      return {
        batch: precheckBatch.row,
        replayed: true,
      };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_WAIT_MS);
    } catch (_e) {
      throw statusError_('LOCK_TIMEOUT', 'Service unavailable');
    }

    try {
      const replayInsideLock = findIdempotencyRecord_(code, idempotencyKey);
      if (replayInsideLock) {
        if (String(replayInsideLock.to_status) !== toStatus) {
          throw conflictError_('IDEMPOTENCY_KEY_REUSE', 'Idempotency key already used with a different to_status', {
            batch_code: code,
            idempotency_key: idempotencyKey,
            existing_to_status: String(replayInsideLock.to_status || ''),
            requested_to_status: toStatus,
          });
        }

        const replayBatch = findBatchByCode_(code);
        if (!replayBatch) {
          throw statusError_('NOT_FOUND', 'Batch not found');
        }

        return {
          batch: replayBatch.row,
          replayed: true,
        };
      }

      const located = findBatchByCode_(code);
      if (!located) {
        throw statusError_('NOT_FOUND', 'Batch not found');
      }

      const row = located.row;
      const currentStatus = String(row.status || '').trim();
      if (!BatchFsm_.isValidStatus_(currentStatus)) {
        throw validationError_('Batch has invalid current status');
      }

      if (!BatchFsm_.validateTransition_(currentStatus, toStatus)) {
        throw conflictError_('ILLEGAL_TRANSITION', 'Illegal status transition', {
          from: currentStatus,
          to: toStatus,
        });
      }

      const now = new Date();
      let nextDryEndAt = String(row.dry_end_at || '').trim();

      if (toStatus === 'ready') {
        const dryEndAt = parseDateIfPresent_(row.dry_end_at);
        if (dryEndAt && now.getTime() < dryEndAt.getTime()) {
          throw conflictError_('DRYING_NOT_FINISHED', 'Drying not finished', {
            dry_end_at: dryEndAt.toISOString(),
          });
        }
      }

      if (toStatus === 'drying' && !nextDryEndAt) {
        nextDryEndAt = BatchFsm_.computeDryEndAt_(now);
      }

      const header = located.header;
      const nextRow = located.values.slice();
      nextRow[located.index.status] = toStatus;
      if (located.index.dry_end_at !== undefined) {
        nextRow[located.index.dry_end_at] = nextDryEndAt;
      }

      located.sheet
        .getRange(located.rowNumber, 1, 1, header.length)
        .setValues([nextRow]);

      upsertIdempotencyRecord_(code, idempotencyKey, toStatus, toStatus, nowIso_());

      const updatedBatch = rowFromValues_(header, nextRow);
      return {
        batch: updatedBatch,
        replayed: false,
      };
    } catch (err) {
      if (err instanceof Error) {
        throw err;
      }

      throw statusError_('BAD_GATEWAY', 'Bad gateway');
    } finally {
      lock.releaseLock();
    }
  });

  function validateInput_(code, toStatus, idempotencyKey) {
    if (!code || (!/^B-\d{6}-\d{3}$/.test(code) && !/^batch_[a-z0-9-]+$/.test(code))) {
      throw validationError_('Invalid code format');
    }

    if (!BatchFsm_.isValidStatus_(toStatus) || toStatus === 'created') {
      throw validationError_('Invalid to_status value');
    }

    if (!idempotencyKey) {
      throw validationError_('idempotency_key is required');
    }
  }

  function findBatchByCode_(code) {
    const sheet = getBatchRegistrySheet_();
    if (!sheet) {
      return null;
    }

    ensureBatchRegistryColumns_(sheet);

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) {
      return null;
    }

    const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((v) => String(v).trim());
    const index = headerIndex_(header);
    if (index.code === undefined || index.status === undefined) {
      throw validationError_('batch_registry sheet requires code and status columns');
    }

    const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][index.code] || '').trim() === code) {
        return {
          sheet,
          header,
          index,
          rowNumber: i + 2,
          values: data[i],
          row: rowFromValues_(header, data[i]),
        };
      }
    }

    return null;
  }

  function ensureBatchRegistryColumns_(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) {
      throw validationError_('batch_registry sheet has no headers');
    }

    const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((v) => String(v).trim());
    if (header.indexOf('dry_end_at') === -1) {
      sheet.getRange(1, lastCol + 1).setValue('dry_end_at');
    }
  }

  function findIdempotencyRecord_(batchCode, idempotencyKey) {
    const sheet = getIdempotencySheet_(false);
    if (!sheet) {
      return null;
    }

    const header = getHeader_(sheet);
    const idx = headerIndex_(header);
    if (idx.batch_code === undefined || idx.idempotency_key === undefined) {
      throw validationError_('batch_status_idempotency sheet has invalid headers');
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return null;
    }

    const data = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    for (let i = 0; i < data.length; i++) {
      const rowBatchCode = String(data[i][idx.batch_code] || '').trim();
      const rowIdempotencyKey = String(data[i][idx.idempotency_key] || '').trim();
      if (rowBatchCode === batchCode && rowIdempotencyKey === idempotencyKey) {
        return rowFromValues_(header, data[i]);
      }
    }

    return null;
  }

  function upsertIdempotencyRecord_(batchCode, idempotencyKey, toStatus, resultStatus, updatedAt) {
    const sheet = getIdempotencySheet_(true);
    const header = getHeader_(sheet);
    const idx = headerIndex_(header);
    const lastRow = sheet.getLastRow();

    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
      for (let i = 0; i < data.length; i++) {
        const rowBatchCode = String(data[i][idx.batch_code] || '').trim();
        const rowIdempotencyKey = String(data[i][idx.idempotency_key] || '').trim();
        if (rowBatchCode === batchCode && rowIdempotencyKey === idempotencyKey) {
          data[i][idx.to_status] = toStatus;
          data[i][idx.result_status] = resultStatus;
          data[i][idx.updated_at] = updatedAt;
          sheet.getRange(i + 2, 1, 1, header.length).setValues([data[i]]);
          return;
        }
      }
    }

    const row = header.map(() => '');
    row[idx.batch_code] = batchCode;
    row[idx.idempotency_key] = idempotencyKey;
    row[idx.to_status] = toStatus;
    row[idx.result_status] = resultStatus;
    row[idx.updated_at] = updatedAt;
    sheet.appendRow(row);
  }

  function getIdempotencySheet_(createIfMissing) {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) {
      throw new Error('Spreadsheet not configured for ' + DB.OPS);
    }

    let sh = ss.getSheetByName(BATCH_STATUS_IDEMPOTENCY_SHEET);
    if (!sh) {
      if (!createIfMissing) {
        return null;
      }
      sh = ss.insertSheet(BATCH_STATUS_IDEMPOTENCY_SHEET);
      sh.getRange(1, 1, 1, BATCH_STATUS_IDEMPOTENCY_HEADERS.length)
        .setValues([BATCH_STATUS_IDEMPOTENCY_HEADERS]);
      return sh;
    }

    const currentHeader = getHeader_(sh);
    const invalid = BATCH_STATUS_IDEMPOTENCY_HEADERS.some((name, index) => currentHeader[index] !== name);
    if (invalid) {
      throw validationError_('invalid headers in sheet ' + BATCH_STATUS_IDEMPOTENCY_SHEET);
    }

    return sh;
  }

  function getBatchRegistrySheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) {
      throw new Error('Spreadsheet not configured for ' + DB.OPS);
    }

    return ss.getSheetByName(BATCH_REGISTRY_SHEET);
  }

  function parseDateIfPresent_(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }

    const dt = new Date(String(value));
    if (Number.isNaN(dt.getTime())) {
      return null;
    }

    return dt;
  }

  function getHeader_(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) {
      return [];
    }

    return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((v) => String(v).trim());
  }

  function headerIndex_(header) {
    const idx = {};
    for (let i = 0; i < header.length; i++) {
      idx[header[i]] = i;
    }
    return idx;
  }

  function rowFromValues_(header, values) {
    const row = {};
    for (let i = 0; i < header.length; i++) {
      row[header[i] || ('col_' + i)] = values[i];
    }
    return row;
  }

  function validationError_(message) {
    return statusError_('VALIDATION_ERROR', message);
  }

  function conflictError_(code, message, details) {
    return statusError_(code, message, details);
  }

  function statusError_(code, message, details) {
    const parts = [code + ': ' + message];
    if (details && Object.keys(details).length > 0) {
      parts.push(JSON.stringify(details));
    }
    return new Error(parts.join(' | '));
  }
})();
