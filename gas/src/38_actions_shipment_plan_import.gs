/** Stage-only shipment plan import actions. */

(function initShipmentPlanImportActions_() {
  const ACTION_COMMIT = 'shipment_plan_import.commit';
  const EVENT_ENTITY_TYPE = 'shipment_plan_import_batch';
  const LOCK_WAIT_MS = 30000;
  const VALIDATE_REQUIRED_FIELDS = [
    'import_batch_id',
    'shipment_id',
    'marketplace',
    'flow_type',
    'planned_date',
    'destination',
    'products_sku',
    'planned_qty',
  ];
  const ALL_INPUT_FIELDS = [
    'import_batch_id',
    'shipment_id',
    'marketplace',
    'flow_type',
    'planned_date',
    'planned_time_window',
    'deadline_at',
    'destination',
    'carrier_type',
    'carrier_name',
    'booking_ref',
    'products_sku',
    'sku_name',
    'planned_qty',
    'comment_logistic',
    'source_table',
    'pasted_at',
    'pasted_by_user_id',
  ];
  const STAGING_REQUIRED_COLUMNS = [
    'import_batch_id',
    'shipment_id',
    'marketplace',
    'flow_type',
    'planned_date',
    'planned_time_window',
    'deadline_at',
    'destination',
    'carrier_type',
    'carrier_name',
    'booking_ref',
    'sku_id_or_article',
    'sku_name',
    'planned_qty',
    'comment_logistic',
    'source_table',
    'pasted_at',
    'pasted_by_user_id',
    'request_id',
    'status',
    'error',
  ];
  const HEADER_CONSISTENCY_FIELDS = [
    'marketplace',
    'flow_type',
    'planned_date',
    'planned_time_window',
    'deadline_at',
    'destination',
    'carrier_type',
    'carrier_name',
    'booking_ref',
  ];
  const EVENT_TYPE = {
    STARTED: 'shipment_plan_import_started',
    VALIDATED: 'shipment_plan_import_validated',
    COMMITTED: 'shipment_plan_import_committed',
    REPLAYED: 'shipment_plan_import_replayed',
    FAILED: 'shipment_plan_import_failed',
  };
  const LEGACY_FORBIDDEN_FIELDS = {
    ship_date: true,
    sku_id: true,
    qty: true,
    comment: true,
  };

  Actions_.register_('shipment_plan_import.validate', (ctx) => {
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER]);
    const prepared = prepareImport_(ctx, false);

    return {
      import_batch_id: prepared.import_batch_id,
      valid: prepared.errors.length === 0,
      stats: prepared.stats,
      normalized_rows: prepared.normalized_rows,
      errors: prepared.errors,
    };
  });

  Actions_.register_(ACTION_COMMIT, (ctx) => {
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER]);
    const requestId = str_(ctx.requestId);
    if (!requestId) throw new Error(ERROR.BAD_REQUEST + ': request_id is required');

    const replay = findReplay_(requestId);
    if (replay) {
      return {
        replayed: true,
        import_batch_id: replay.import_batch_id,
        stats: replay.stats,
        staged_rows: replay.staged_rows,
      };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_WAIT_MS);
    } catch (_err) {
      throw new Error(ERROR.LOCK_CONFLICT + ': shipment plan import lock timeout');
    }

    try {
      const replayInsideLock = findReplay_(requestId);
      if (replayInsideLock) {
        return {
          replayed: true,
          import_batch_id: replayInsideLock.import_batch_id,
          stats: replayInsideLock.stats,
          staged_rows: replayInsideLock.staged_rows,
        };
      }

      const prepared = prepareImport_(ctx, true);
      const importBatchId = prepared.import_batch_id;

      logImportEventOnce_({
        event_type: EVENT_TYPE.STARTED,
        import_batch_id: importBatchId,
        request_id: requestId,
        ctx,
        payload_json: {
          import_batch_id: importBatchId,
          request_id: requestId,
          rows_count: prepared.stats.rows_count,
          shipments_count: prepared.stats.shipments_count,
          source_table_values: prepared.stats.source_table_values,
        },
      });

      if (prepared.errors.length > 0) {
        logImportEventOnce_({
          event_type: EVENT_TYPE.FAILED,
          import_batch_id: importBatchId,
          request_id: requestId,
          ctx,
          payload_json: {
            import_batch_id: importBatchId,
            request_id: requestId,
            rows_count: prepared.stats.rows_count,
            shipments_count: prepared.stats.shipments_count,
            source_table_values: prepared.stats.source_table_values,
            validation_errors: prepared.errors,
          },
        });

        throw new Error(
          ERROR.BAD_REQUEST + ': shipment plan import validation failed | ' + JSON.stringify({ errors: prepared.errors })
        );
      }

      const stagingSheet = ensureStagingSheetSchema_();
      logImportEventOnce_({
        event_type: EVENT_TYPE.VALIDATED,
        import_batch_id: importBatchId,
        request_id: requestId,
        ctx,
        payload_json: {
          import_batch_id: importBatchId,
          request_id: requestId,
          rows_count: prepared.stats.rows_count,
          shipments_count: prepared.stats.shipments_count,
          source_table_values: prepared.stats.source_table_values,
        },
      });

      appendStagingRows_(stagingSheet, prepared.staged_rows);

      logImportEventOnce_({
        event_type: EVENT_TYPE.COMMITTED,
        import_batch_id: importBatchId,
        request_id: requestId,
        ctx,
        payload_json: {
          import_batch_id: importBatchId,
          request_id: requestId,
          rows_count: prepared.stats.rows_count,
          shipments_count: prepared.stats.shipments_count,
          source_table_values: prepared.stats.source_table_values,
        },
      });
      Idemp_.put_(requestId, ACTION_COMMIT);

      return {
        replayed: false,
        import_batch_id: importBatchId,
        stats: prepared.stats,
        staged_rows: prepared.staged_rows,
      };
    } catch (err) {
      if (!isValidationFailureAlreadyLogged_(requestId)) {
        const payload = safeFailurePayload_(ctx, requestId);
        if (payload) {
          logImportEventOnce_({
            event_type: EVENT_TYPE.FAILED,
            import_batch_id: payload.import_batch_id,
            request_id: requestId,
            ctx,
            payload_json: payload.payload_json,
          });
        }
      }
      throw err;
    } finally {
      lock.releaseLock();
    }
  });

  function prepareImport_(ctx, forCommit) {
    const normalizedRows = normalizeRows_(ctx.payload && ctx.payload.rows);
    const importBatchId = deriveImportBatchId_(normalizedRows, ctx.requestId);
    const actorUserId = actorUserId_(ctx);
    const errors = validateRows_(normalizedRows);
    const nowIso = nowIso_();
    const stats = buildStats_(normalizedRows);
    const stagedRows = normalizedRows.map((row) => {
      const staged = {
        import_batch_id: row.import_batch_id,
        shipment_id: row.shipment_id,
        marketplace: row.marketplace,
        flow_type: row.flow_type,
        planned_date: row.planned_date,
        planned_time_window: row.planned_time_window,
        deadline_at: row.deadline_at,
        destination: row.destination,
        carrier_type: row.carrier_type,
        carrier_name: row.carrier_name,
        booking_ref: row.booking_ref,
        sku_id_or_article: row.products_sku,
        sku_name: row.sku_name,
        planned_qty: row.planned_qty,
        comment_logistic: row.comment_logistic,
        source_table: row.source_table,
        pasted_at: row.pasted_at || nowIso,
        pasted_by_user_id: row.pasted_by_user_id || actorUserId,
        status: forCommit ? 'staged' : 'validated',
        error: '',
      };

      if (forCommit) staged.request_id = str_(ctx.requestId);
      return staged;
    });

    return {
      import_batch_id: importBatchId,
      normalized_rows: stagedRows.map((row) => toValidateResponseRow_(row)),
      staged_rows: stagedRows,
      stats,
      errors,
    };
  }

  function normalizeRows_(rowsRaw) {
    if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
      throw new Error(ERROR.BAD_REQUEST + ': rows must be a non-empty array');
    }

    const rows = [];
    for (let i = 0; i < rowsRaw.length; i++) {
      const row = rowsRaw[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new Error(ERROR.BAD_REQUEST + ': row ' + (i + 1) + ' must be an object');
      }

      const unknownKeys = [];
      for (const key in row) {
        if (LEGACY_FORBIDDEN_FIELDS[key] === true) {
          throw new Error(ERROR.BAD_REQUEST + ": legacy field '" + key + "' is not supported");
        }
        if (ALL_INPUT_FIELDS.indexOf(key) === -1) unknownKeys.push(key);
      }
      if (unknownKeys.length > 0) {
        throw new Error(ERROR.BAD_REQUEST + ': unsupported fields: ' + unknownKeys.join(','));
      }

      rows.push({
        import_batch_id: str_(row.import_batch_id),
        shipment_id: str_(row.shipment_id),
        marketplace: str_(row.marketplace),
        flow_type: str_(row.flow_type),
        planned_date: str_(row.planned_date),
        planned_time_window: str_(row.planned_time_window),
        deadline_at: str_(row.deadline_at),
        destination: str_(row.destination),
        carrier_type: str_(row.carrier_type),
        carrier_name: str_(row.carrier_name),
        booking_ref: str_(row.booking_ref),
        products_sku: str_(row.products_sku),
        sku_name: str_(row.sku_name),
        planned_qty: parsePositiveInteger_(row.planned_qty),
        comment_logistic: str_(row.comment_logistic),
        source_table: str_(row.source_table),
        pasted_at: str_(row.pasted_at),
        pasted_by_user_id: str_(row.pasted_by_user_id),
      });
    }

    return rows;
  }

  function validateRows_(rows) {
    const errors = [];
    const batchIds = {};
    const shipmentHeaders = {};
    const shipmentSkuPairs = {};
    const skuIndex = loadSkuIndex_();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (let j = 0; j < VALIDATE_REQUIRED_FIELDS.length; j++) {
        const field = VALIDATE_REQUIRED_FIELDS[j];
        const value = row[field];
        if ((typeof value === 'string' && !value) || value === null || value === undefined) {
          errors.push(validationIssue_(i + 1, field, 'REQUIRED', field + ' is required'));
        }
      }

      if (!isDateOnly_(row.planned_date)) {
        errors.push(validationIssue_(i + 1, 'planned_date', 'INVALID_FORMAT', 'planned_date must be YYYY-MM-DD'));
      }

      if (row.deadline_at && !isIsoDateTime_(row.deadline_at)) {
        errors.push(validationIssue_(i + 1, 'deadline_at', 'INVALID_FORMAT', 'deadline_at must be a valid ISO datetime'));
      }

      if (!Number.isInteger(row.planned_qty) || row.planned_qty <= 0) {
        errors.push(validationIssue_(i + 1, 'planned_qty', 'INVALID_VALUE', 'planned_qty must be a positive integer'));
      }

      if (!skuIndex[row.products_sku]) {
        errors.push(
          validationIssue_(i + 1, 'products_sku', 'SKU_NOT_FOUND', 'products_sku was not found in products_sku')
        );
      }

      batchIds[row.import_batch_id] = true;

      const pairKey = row.shipment_id + '::' + row.products_sku;
      if (shipmentSkuPairs[pairKey]) {
          errors.push(
            validationIssue_(
              i + 1,
              'products_sku',
              'DUPLICATE_ROW',
              'duplicate (shipment_id, products_sku) row in request'
            )
          );
        } else {
          shipmentSkuPairs[pairKey] = true;
      }

      const shipmentKey = row.shipment_id;
      if (!shipmentHeaders[shipmentKey]) {
        shipmentHeaders[shipmentKey] = {};
        for (let k = 0; k < HEADER_CONSISTENCY_FIELDS.length; k++) {
          const fieldName = HEADER_CONSISTENCY_FIELDS[k];
          shipmentHeaders[shipmentKey][fieldName] = row[fieldName];
        }
      } else {
        for (let m = 0; m < HEADER_CONSISTENCY_FIELDS.length; m++) {
          const consistencyField = HEADER_CONSISTENCY_FIELDS[m];
          if (shipmentHeaders[shipmentKey][consistencyField] !== row[consistencyField]) {
            errors.push(
              validationIssue_(
                i + 1,
                consistencyField,
                'HEADER_MISMATCH',
                consistencyField + ' must be identical for the same shipment_id'
              )
            );
          }
        }
      }
    }

    const batchIdKeys = Object.keys(batchIds).filter(Boolean);
    if (batchIdKeys.length !== 1) {
      errors.push(
        validationIssue_(-1, 'import_batch_id', 'BATCH_MISMATCH', 'all rows must share exactly one import_batch_id')
      );
    }

    return errors;
  }

  function ensureStagingSheetSchema_() {
    const sheet = Sys_.sheet_(SHEET.SHIPMENT_PLAN_IMPORT);
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((value) => str_(value));
    const missing = [];

    for (let i = 0; i < STAGING_REQUIRED_COLUMNS.length; i++) {
      if (header.indexOf(STAGING_REQUIRED_COLUMNS[i]) === -1) {
        missing.push(STAGING_REQUIRED_COLUMNS[i]);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        ERROR.BAD_REQUEST +
          ': shipment_plan_import sheet missing required columns | ' +
          JSON.stringify({ missing_columns: missing })
      );
    }

    return { sheet, header };
  }

  function appendStagingRows_(stagingSheet, stagedRows) {
    const sheet = stagingSheet.sheet;
    const header = stagingSheet.header;
    const values = stagedRows.map((row) =>
      header.map((column) => (Object.prototype.hasOwnProperty.call(row, column) ? row[column] : ''))
    );

    if (values.length === 0) return;

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, values.length, header.length).setValues(values);
  }

  function findReplay_(requestId) {
    const stagedRowsByRequest = Db_.query_(
      SHEET.SHIPMENT_PLAN_IMPORT,
      (row) => str_(row.request_id) === requestId
    );
    if (stagedRowsByRequest.length === 0) return null;

    return {
      import_batch_id: str_(stagedRowsByRequest[0].import_batch_id),
      stats: buildStatsFromStagedRows_(stagedRowsByRequest),
      staged_rows: stagedRowsByRequest,
    };
  }

  function logImportEventOnce_(input) {
    const requestId = str_(input.request_id);
    const eventType = str_(input.event_type);
    if (!requestId || !eventType) return null;

    const existing = Db_.query_(
      SHEET.EVENTS,
      (row) => str_(row.request_id) === requestId && str_(row.event_type) === eventType
    );
    if (existing.length > 0) return existing[0];

    return Audit_.logMutation({
      action: eventType,
      event_type: eventType,
      entity_type: EVENT_ENTITY_TYPE,
      entity_id: str_(input.import_batch_id) || requestId,
      request_id: requestId,
      actor_user_id: actorUserId_(input.ctx),
      actor_role_id: actorRoleId_(input.ctx),
      source: 'api',
      payload_json: input.payload_json || {},
      ctx: input.ctx,
    });
  }

  function isValidationFailureAlreadyLogged_(requestId) {
    const rows = Db_.query_(
      SHEET.EVENTS,
      (row) => str_(row.request_id) === requestId && str_(row.event_type) === EVENT_TYPE.FAILED
    );
    return rows.length > 0;
  }

  function safeFailurePayload_(ctx, requestId) {
    try {
      const prepared = prepareImport_(ctx, false);
      return {
        import_batch_id: prepared.import_batch_id,
        payload_json: {
          import_batch_id: prepared.import_batch_id,
          request_id: requestId,
          rows_count: prepared.stats.rows_count,
          shipments_count: prepared.stats.shipments_count,
          source_table_values: prepared.stats.source_table_values,
          validation_errors: prepared.errors,
        },
      };
    } catch (_err) {
      return {
        import_batch_id: str_(requestId),
        payload_json: {
          import_batch_id: str_(requestId),
          request_id: requestId,
          rows_count: 0,
          shipments_count: 0,
          source_table_values: [],
          validation_errors: [],
        },
      };
    }
  }

  function buildStats_(rows) {
    const shipments = {};
    const sourceTables = {};

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].shipment_id) shipments[rows[i].shipment_id] = true;
      if (rows[i].source_table) sourceTables[rows[i].source_table] = true;
    }

    return {
      rows_count: rows.length,
      shipments_count: Object.keys(shipments).length,
      source_table_values: Object.keys(sourceTables),
    };
  }

  function buildStatsFromStagedRows_(rows) {
    const shipments = {};
    const sourceTables = {};

    for (let i = 0; i < rows.length; i++) {
      if (str_(rows[i].shipment_id)) shipments[str_(rows[i].shipment_id)] = true;
      if (str_(rows[i].source_table)) sourceTables[str_(rows[i].source_table)] = true;
    }

    return {
      rows_count: rows.length,
      shipments_count: Object.keys(shipments).length,
      source_table_values: Object.keys(sourceTables),
    };
  }

  function validationIssue_(rowIndex, field, code, message) {
    return {
      row_index: rowIndex >= 0 ? rowIndex : 0,
      field: str_(field),
      code: str_(code),
      message: str_(message),
    };
  }

  function deriveImportBatchId_(rows, requestId) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].import_batch_id) return rows[i].import_batch_id;
    }
    return str_(requestId);
  }

  function loadSkuIndex_() {
    const sheet = Sys_.sheet_(SHEET.SKU);
    const read = readSheetRows_(sheet);
    const required = ['sku_id'];
    ensureRequiredColumns_(read.headers, required, ERROR.INVALID_PRODUCTS_SKU_SCHEMA, 'products_sku');
    const out = {};

    for (let i = 0; i < read.rows.length; i++) {
      const skuId = str_(read.rows[i].sku_id);
      if (skuId) out[skuId] = true;
    }

    return out;
  }

  function readSheetRows_(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) return { headers: [], rows: [] };

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((value) => str_(value));
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

  function ensureRequiredColumns_(headers, requiredColumns, code, sheetName) {
    const missing = requiredColumns.filter((name) => headers.indexOf(name) === -1);
    if (missing.length > 0) {
      throw new Error(code + ': missing required columns in ' + sheetName + ': ' + missing.join(','));
    }
  }

  function toValidateResponseRow_(row) {
    return {
      import_batch_id: str_(row.import_batch_id),
      shipment_id: str_(row.shipment_id),
      marketplace: str_(row.marketplace),
      flow_type: str_(row.flow_type),
      planned_date: str_(row.planned_date),
      planned_time_window: str_(row.planned_time_window),
      deadline_at: str_(row.deadline_at),
      destination: str_(row.destination),
      carrier_type: str_(row.carrier_type),
      carrier_name: str_(row.carrier_name),
      booking_ref: str_(row.booking_ref),
      products_sku: str_(row.sku_id_or_article),
      sku_name: str_(row.sku_name),
      planned_qty: numberOrZero_(row.planned_qty),
      comment_logistic: str_(row.comment_logistic),
      source_table: str_(row.source_table),
      pasted_at: str_(row.pasted_at),
      pasted_by_user_id: str_(row.pasted_by_user_id),
    };
  }

  function actorUserId_(ctx) {
    const payloadUserId = str_(ctx && ctx.payload && ctx.payload.actor_user_id);
    if (payloadUserId) return payloadUserId;
    return str_(ctx && ctx.actor && (ctx.actor.employee_id || ctx.actor.id)) || 'system';
  }

  function actorRoleId_(ctx) {
    const payloadRoleId = str_(ctx && ctx.payload && ctx.payload.actor_role_id);
    if (payloadRoleId) return payloadRoleId;
    return str_(ctx && ctx.actor && ctx.actor.role) || ROLE.OWNER;
  }

  function parsePositiveInteger_(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
    if (typeof value === 'string' && str_(value)) {
      const parsed = Number(str_(value));
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    return NaN;
  }

  function numberOrZero_(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && str_(value)) {
      const parsed = Number(str_(value));
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function isDateOnly_(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(str_(value));
  }

  function isIsoDateTime_(value) {
    const raw = str_(value);
    if (!raw) return false;
    return Number.isFinite(Date.parse(raw));
  }

  function parseJsonObject_(value) {
    const raw = str_(value);
    if (!raw) return {};

    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_err) {
      return {};
    }
  }

  function str_(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }
})();
