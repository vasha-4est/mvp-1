/** Inventory actions */

(function initInventoryActions_(){
  const SERVICE_TIMEZONE = 'Europe/Moscow';
  const ENTITY_LOCK_TTL_SEC = 30;
  const WEBAPP_SOURCE = 'webapp';

  Actions_.register_('inventory.balance.get', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);
    const payload = ctx.payload || {};
    const skuId = str_(payload.sku_id);
    const locationId = str_(payload.location_id);

    let rows = Db_.readAll_(SHEET.INVENTORY);
    if (skuId) rows = rows.filter((row) => str_(row.sku_id) === skuId);
    if (locationId) rows = rows.filter((row) => str_(row.location_id) === locationId);
    return { balances: rows };
  });

  Actions_.register_('inventory.moves.list', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);
    const payload = ctx.payload || {};
    const skuId = str_(payload.sku_id);
    const limitValue = num_(payload.limit);
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : 10;

    let rows = Db_.readAll_(SHEET.INVENTORY_MOVES);
    if (skuId) rows = rows.filter((row) => str_(row.sku_id) === skuId);

    rows.sort((left, right) => str_(right.created_at).localeCompare(str_(left.created_at)));
    return { items: rows.slice(0, limit) };
  });

  Actions_.register_('inventory.move.create', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);
    const payload = ctx.payload || {};
    const skuId = str_(payload.sku_id);
    const fromLocationId = str_(payload.from_location_id);
    const toLocationId = str_(payload.to_location_id);
    const reason = str_(payload.reason);
    const proofRef = str_(payload.proof_ref);
    const qty = num_(payload.qty);
    const expectedVersionFrom = parseVersionInt_(payload.expected_version_id_from);
    const expectedVersionTo = parseVersionInt_(payload.expected_version_id_to);

    if (!skuId) throw new Error(ERROR.BAD_REQUEST + ': missing sku_id');
    if (!fromLocationId) throw new Error(ERROR.BAD_REQUEST + ': missing from_location_id');
    if (!toLocationId) throw new Error(ERROR.BAD_REQUEST + ': missing to_location_id');
    if (fromLocationId === toLocationId) throw new Error(ERROR.BAD_REQUEST + ': from_location_id must differ from to_location_id');
    if (!Number.isFinite(qty) || qty <= 0 || Math.floor(qty) !== qty) throw new Error(ERROR.BAD_REQUEST + ': qty must be a positive integer');
    if (expectedVersionFrom === null) throw new Error(ERROR.BAD_REQUEST + ': expected_version_id_from is required');

    const replayMoveId = replayMoveId_(ctx.requestId);
    if (idempExists_(ctx.requestId, 'inventory.move')) {
      return {
        ok: true,
        replayed: true,
        move_id: replayMoveId,
        sku_id: skuId,
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        qty,
      };
    }

    return withInventoryMoveLock_(ctx, skuId, fromLocationId, toLocationId, () => {
      const movedAt = nowIso_();
      const inventoryCtx = inventorySheetCtx_();
      const fromRow = readBalanceRow_(inventoryCtx, skuId, fromLocationId);
      if (!fromRow) throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      ensureExpectedVersion_(skuId, fromLocationId, expectedVersionFrom, fromRow.versionId);
      if (fromRow.onHandQty < qty) throw new Error(ERROR.INSUFFICIENT_STOCK + ': insufficient on_hand_qty');

      const fromVersionNew = updateBalanceRow_(fromRow, fromRow.onHandQty - qty, fromRow.reservedQty, movedAt);

      const toRow = readBalanceRow_(inventoryCtx, skuId, toLocationId);
      let toVersionNew = '';
      if (toRow) {
        if (expectedVersionTo === null) throw new Error(ERROR.BAD_REQUEST + ': expected_version_id_to is required when destination exists');
        ensureExpectedVersion_(skuId, toLocationId, expectedVersionTo, toRow.versionId);
        toVersionNew = updateBalanceRow_(toRow, toRow.onHandQty + qty, toRow.reservedQty, movedAt);
      } else {
        Db_.append_(SHEET.INVENTORY, {
          sku_id: skuId,
          location_id: toLocationId,
          on_hand_qty: String(qty),
          reserved_qty: '0',
          available_qty: String(qty),
          version_id: '1',
          updated_at: movedAt,
        });
        const appendedRowNumber = inventoryCtx.sheet.getLastRow();
        rememberInventoryIndex_(inventoryCtx, skuId, toLocationId, appendedRowNumber);
        toVersionNew = '1';
      }

      const moveId = nextMoveId_(movedAt);
      Db_.append_(SHEET.INVENTORY_MOVES, {
        move_id: moveId,
        sku_id: skuId,
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        qty: String(qty),
        reason,
        actor_user_id: actorUserId_(ctx),
        actor_role_id: actorRoleId_(ctx),
        proof_ref: proofRef,
        created_at: movedAt,
      });

      appendEvent_('inventory.move', 'inventory_move', moveId, {
        sku_id: skuId,
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        qty,
        reason,
        proof_ref: proofRef,
      }, movedAt, ctx);

      markIdempotent_(ctx.requestId, 'inventory.move');

      return {
        ok: true,
        move_id: moveId,
        sku_id: skuId,
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        qty,
        from_version_id_new: fromVersionNew,
        to_version_id_new: toVersionNew,
      };
    });
  });

  Actions_.register_('inventory.reserve', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);
    const payload = ctx.payload || {};
    const skuId = str_(payload.sku_id);
    const locationId = str_(payload.location_id);
    const reason = str_(payload.reason);
    const proofRef = str_(payload.proof_ref);
    const qty = num_(payload.qty);
    const expectedVersionId = parseVersionInt_(payload.expected_version_id);
    const requireExpectedVersion = payload.require_expected_version !== false;

    if (!skuId) throw new Error(ERROR.BAD_REQUEST + ': missing sku_id');
    if (!locationId) throw new Error(ERROR.BAD_REQUEST + ': missing location_id');
    if (!Number.isFinite(qty) || qty <= 0 || Math.floor(qty) !== qty) throw new Error(ERROR.BAD_REQUEST + ': qty must be a positive integer');
    if (requireExpectedVersion && expectedVersionId === null) throw new Error(ERROR.BAD_REQUEST + ': expected_version_id is required');

    const action = 'inventory.reserve';
    const operationId = operationId_(ctx.requestId, 'RSV');

    if (idempExists_(ctx.requestId, action)) {
      return replayReserveResponse_(ctx.requestId, operationId, skuId, locationId, qty);
    }

    return withInventoryBalanceLock_(ctx, skuId, locationId, () => {
      const updatedAt = nowIso_();
      const inventoryCtx = inventorySheetCtx_();
      const row = readBalanceRow_(inventoryCtx, skuId, locationId);
      if (!row) throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      const effectiveExpectedVersion = expectedVersionId === null ? row.versionId : expectedVersionId;
      ensureExpectedVersion_(skuId, locationId, effectiveExpectedVersion, row.versionId);
      if (row.availableQty < qty) throw new Error(ERROR.INSUFFICIENT_AVAILABLE + ': insufficient available_qty');

      const nextReservedQty = row.reservedQty + qty;
      const nextVersionId = updateBalanceRow_(row, row.onHandQty, nextReservedQty, updatedAt);
      const nextAvailableQty = row.onHandQty - nextReservedQty;

      appendEvent_('inventory.reserve', 'inventory_balance', skuId + '::' + locationId, {
        operation_id: operationId,
        reservation_id: operationId,
        sku_id: skuId,
        location_id: locationId,
        qty,
        reserved_qty: nextReservedQty,
        available_qty: nextAvailableQty,
        version_id: nextVersionId,
        reason,
        proof_ref: proofRef,
      }, updatedAt, ctx);

      markIdempotent_(ctx.requestId, action, true);
      return {
        ok: true,
        reservation_id: operationId,
        operation_id: operationId,
        sku_id: skuId,
        location_id: locationId,
        qty,
        reserved_qty: nextReservedQty,
        available_qty: nextAvailableQty,
        version_id: nextVersionId,
        updated_at: updatedAt,
      };
    });
  });

  Actions_.register_('inventory.release', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);
    const payload = ctx.payload || {};
    const skuId = str_(payload.sku_id);
    const locationId = str_(payload.location_id);
    const reason = str_(payload.reason);
    const proofRef = str_(payload.proof_ref);
    const qty = num_(payload.qty);
    const expectedVersionId = parseVersionInt_(payload.expected_version_id);
    const requireExpectedVersion = payload.require_expected_version !== false;

    if (!skuId) throw new Error(ERROR.BAD_REQUEST + ': missing sku_id');
    if (!locationId) throw new Error(ERROR.BAD_REQUEST + ': missing location_id');
    if (!Number.isFinite(qty) || qty <= 0 || Math.floor(qty) !== qty) throw new Error(ERROR.BAD_REQUEST + ': qty must be a positive integer');
    if (requireExpectedVersion && expectedVersionId === null) throw new Error(ERROR.BAD_REQUEST + ': expected_version_id is required');

    const action = 'inventory.release';
    const operationId = operationId_(ctx.requestId, 'REL');

    if (idempExists_(ctx.requestId, action)) {
      return replayReleaseResponse_(ctx.requestId, operationId, skuId, locationId, qty);
    }

    return withInventoryBalanceLock_(ctx, skuId, locationId, () => {
      const updatedAt = nowIso_();
      const inventoryCtx = inventorySheetCtx_();
      const row = readBalanceRow_(inventoryCtx, skuId, locationId);
      if (!row) throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      const effectiveExpectedVersion = expectedVersionId === null ? row.versionId : expectedVersionId;
      ensureExpectedVersion_(skuId, locationId, effectiveExpectedVersion, row.versionId);
      if (row.reservedQty < qty) throw new Error(ERROR.INSUFFICIENT_RESERVED + ': insufficient reserved_qty');

      const nextReservedQty = row.reservedQty - qty;
      const nextVersionId = updateBalanceRow_(row, row.onHandQty, nextReservedQty, updatedAt);
      const nextAvailableQty = row.onHandQty - nextReservedQty;

      appendEvent_('inventory.release', 'inventory_balance', skuId + '::' + locationId, {
        operation_id: operationId,
        release_id: operationId,
        sku_id: skuId,
        location_id: locationId,
        qty,
        reserved_qty: nextReservedQty,
        available_qty: nextAvailableQty,
        version_id: nextVersionId,
        reason,
        proof_ref: proofRef,
      }, updatedAt, ctx);

      markIdempotent_(ctx.requestId, action, true);
      return {
        ok: true,
        release_id: operationId,
        operation_id: operationId,
        sku_id: skuId,
        location_id: locationId,
        qty,
        reserved_qty: nextReservedQty,
        available_qty: nextAvailableQty,
        version_id: nextVersionId,
        updated_at: updatedAt,
      };
    });
  });

  function withInventoryMoveLock_(ctx, skuId, fromLocationId, toLocationId, fn) {
    const lockIds = [skuId + ':' + fromLocationId, skuId + ':' + toLocationId].sort();
    return withEntitySheetLocks_(ctx, 'inventory_balance', lockIds, fn);
  }

  function withInventoryBalanceLock_(ctx, skuId, locationId, fn) {
    return withEntitySheetLocks_(ctx, 'inventory_balance', [skuId + ':' + locationId], fn);
  }

  function withEntitySheetLocks_(ctx, entityType, entityIds, fn) {
    const ids = Array.isArray(entityIds) ? entityIds.slice() : [];
    if (ids.length === 0) return fn();

    const now = new Date();
    const acquiredAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ENTITY_LOCK_TTL_SEC * 1000).toISOString();
    const lockSheet = Sys_.sheet_(SHEET.LOCKS);
    const lockHeader = lockSheet.getRange(1, 1, 1, lockSheet.getLastColumn()).getValues()[0].map(String);
    const lockIdx = index_(lockHeader, [
      'lock_key',
      'entity_type',
      'entity_id',
      'held_by_user_id',
      'held_by_role_id',
      'acquired_at',
      'expires_at',
      'status',
    ]);

    const lockRows = readLockRows_(lockSheet, lockHeader.length);
    const toDelete = [];
    const activeKeys = {};

    for (let i = 0; i < lockRows.length; i++) {
      const row = lockRows[i];
      const lockKey = str_(row.values[lockIdx.lock_key]);
      const status = str_(row.values[lockIdx.status]);
      const rowExpiresAt = new Date(str_(row.values[lockIdx.expires_at]));
      const expired = Number.isFinite(rowExpiresAt.getTime()) && rowExpiresAt.getTime() < now.getTime();
      if (expired) {
        toDelete.push(row.rowNumber);
        continue;
      }
      if (status === 'active') activeKeys[lockKey] = true;
    }

    for (let j = toDelete.length - 1; j >= 0; j--) {
      lockSheet.deleteRow(toDelete[j]);
    }

    const lockKeys = [];
    for (let k = 0; k < ids.length; k++) {
      const lockKey = entityType + ':' + ids[k];
      if (activeKeys[lockKey]) throw new Error(ERROR.LOCK_CONFLICT + ': Inventory entity is locked');
      lockKeys.push(lockKey);
    }

    for (let a = 0; a < ids.length; a++) {
      const entityId = ids[a];
      const lockKey = lockKeys[a];
      lockSheet.appendRow(lockHeader.map((columnName) => {
        if (columnName === 'lock_key') return lockKey;
        if (columnName === 'entity_type') return entityType;
        if (columnName === 'entity_id') return entityId;
        if (columnName === 'held_by_user_id') return actorUserId_(ctx) || 'system';
        if (columnName === 'held_by_role_id') return actorRoleId_(ctx);
        if (columnName === 'acquired_at') return acquiredAt;
        if (columnName === 'expires_at') return expiresAt;
        if (columnName === 'status') return 'active';
        return '';
      }));
    }

    try {
      return fn();
    } finally {
      const rows = readLockRows_(lockSheet, lockHeader.length);
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        const rowLockKey = str_(row.values[lockIdx.lock_key]);
        const rowAcquiredAt = str_(row.values[lockIdx.acquired_at]);
        if (rowAcquiredAt !== acquiredAt) continue;
        for (let lk = 0; lk < lockKeys.length; lk++) {
          if (rowLockKey === lockKeys[lk]) {
            lockSheet.deleteRow(row.rowNumber);
            break;
          }
        }
      }
    }
  }

  function readLockRows_(sheet, width) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    const rows = [];
    for (let i = 0; i < values.length; i++) {
      rows.push({ rowNumber: i + 2, values: values[i] });
    }
    return rows;
  }


  function idempExists_(requestId, action) {
    const req = str_(requestId);
    if (!req) return false;
    const rows = Db_.query_(SHEET.IDEMP, (row) => str_(row.request_id) === req && str_(row.action) === action);
    return rows.length > 0;
  }

  function markIdempotent_(requestId, action, assumeMissing) {
    if (!assumeMissing && idempExists_(requestId, action)) return;
    Db_.append_(SHEET.IDEMP, {
      request_id: str_(requestId),
      action,
      created_at: nowIso_(),
    });
  }

  function replayMoveId_(requestId) {
    const req = str_(requestId);
    if (!req) return '';
    const rows = Db_.query_(SHEET.EVENTS, (row) => str_(row.request_id) === req && str_(row.event_type) === 'inventory.move');
    if (rows.length === 0) return '';
    return str_(rows[0].entity_id);
  }

  function operationId_(requestId, prefix) {
    const clean = str_(requestId).replace(/[^A-Za-z0-9]/g, '').slice(0, 20).toUpperCase();
    return prefix + '-' + (clean || 'REQUEST');
  }

  function replayReserveResponse_(requestId, reservationId, skuId, locationId, qty) {
    const payload = findInventoryEventPayload_(requestId, 'inventory.reserve');
    if (payload) {
      return {
        ok: true,
        replayed: true,
        reservation_id: str_(payload.reservation_id || reservationId),
        operation_id: str_(payload.operation_id || reservationId),
        sku_id: str_(payload.sku_id || skuId),
        location_id: str_(payload.location_id || locationId),
        qty: num_(payload.qty || qty),
        reserved_qty: num_(payload.reserved_qty),
        available_qty: num_(payload.available_qty),
        version_id: String(payload.version_id || ''),
        updated_at: str_(payload.updated_at) || nowIso_(),
      };
    }

    const inventoryCtx = inventorySheetCtx_();
    const row = readBalanceRow_(inventoryCtx, skuId, locationId);
    return {
      ok: true,
      replayed: true,
      reservation_id: reservationId,
      operation_id: reservationId,
      sku_id: skuId,
      location_id: locationId,
      qty,
      reserved_qty: row ? row.reservedQty : null,
      available_qty: row ? row.availableQty : null,
      version_id: row ? String(row.versionId) : '',
      updated_at: row ? row.updatedAt : nowIso_(),
    };
  }

  function replayReleaseResponse_(requestId, releaseId, skuId, locationId, qty) {
    const payload = findInventoryEventPayload_(requestId, 'inventory.release');
    if (payload) {
      return {
        ok: true,
        replayed: true,
        release_id: str_(payload.release_id || releaseId),
        operation_id: str_(payload.operation_id || releaseId),
        sku_id: str_(payload.sku_id || skuId),
        location_id: str_(payload.location_id || locationId),
        qty: num_(payload.qty || qty),
        reserved_qty: num_(payload.reserved_qty),
        available_qty: num_(payload.available_qty),
        version_id: String(payload.version_id || ''),
        updated_at: str_(payload.updated_at) || nowIso_(),
      };
    }

    const inventoryCtx = inventorySheetCtx_();
    const row = readBalanceRow_(inventoryCtx, skuId, locationId);
    return {
      ok: true,
      replayed: true,
      release_id: releaseId,
      operation_id: releaseId,
      sku_id: skuId,
      location_id: locationId,
      qty,
      reserved_qty: row ? row.reservedQty : null,
      available_qty: row ? row.availableQty : null,
      version_id: row ? String(row.versionId) : '',
      updated_at: row ? row.updatedAt : nowIso_(),
    };
  }

  function findInventoryEventPayload_(requestId, eventType) {
    const req = str_(requestId);
    if (!req) return null;

    const rows = Db_.query_(SHEET.EVENTS, (row) => str_(row.request_id) === req && str_(row.event_type) === eventType);
    if (rows.length === 0) return null;

    const row = rows[0];
    const rawPayload = str_(row.payload_json);
    if (!rawPayload) return null;

    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed && typeof parsed === 'object') {
        return {
          ...parsed,
          updated_at: str_(row.created_at),
        };
      }
      return null;
    } catch (err) {
      return null;
    }
  }


  function parseVersionInt_(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const parsed = parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  function ensureExpectedVersion_(skuId, locationId, expectedVersionId, currentVersionId) {
    const currentVersion = parseVersionInt_(currentVersionId);
    if (currentVersion === null || currentVersion !== expectedVersionId) {
      throw new Error(
        ERROR.VERSION_CONFLICT + ': stale version | ' + JSON.stringify({
          sku_id: skuId,
          location_id: locationId,
          expected_version_id: expectedVersionId,
          actual_version_id: currentVersion,
        })
      );
    }
  }

  function inventorySheetCtx_() {
    const sheet = Sys_.sheet_(SHEET.INVENTORY);
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const idx = index_(header, ['sku_id', 'location_id', 'on_hand_qty', 'reserved_qty', 'available_qty', 'version_id', 'updated_at']);
    return {
      sheet,
      header,
      idx,
      lastRow: sheet.getLastRow(),
      cacheKey: 'inventory_index_v1',
    };
  }

  function readBalanceRow_(ctx, skuId, locationId) {
    if (!ctx || ctx.lastRow < 2) return null;

    const rowNumber = inventoryIndexLookup_(ctx, skuId, locationId);
    if (rowNumber === null) return null;

    const values = ctx.sheet.getRange(rowNumber, 1, 1, ctx.header.length).getValues()[0];
    if (str_(values[ctx.idx.sku_id]) !== skuId || str_(values[ctx.idx.location_id]) !== locationId) {
      clearInventoryIndex_(ctx);
      return null;
    }

    return {
      rowNumber,
      header: ctx.header,
      idx: ctx.idx,
      rowValues: values,
      sheet: ctx.sheet,
      onHandQty: num_(values[ctx.idx.on_hand_qty]),
      reservedQty: num_(values[ctx.idx.reserved_qty]),
      availableQty: num_(values[ctx.idx.available_qty]),
      versionId: parseVersionInt_(values[ctx.idx.version_id]) || 0,
      updatedAt: str_(values[ctx.idx.updated_at]),
    };
  }

  function updateBalanceRow_(row, nextOnHandQty, nextReservedQty, updatedAt) {
    const currentRow = row.sheet.getRange(row.rowNumber, 1, 1, row.header.length).getValues()[0];
    const currentVersion = parseVersionInt_(currentRow[row.idx.version_id]);
    if (currentVersion === null || currentVersion !== row.versionId) {
      throw new Error(ERROR.VERSION_CONFLICT + ': stale version | ' + JSON.stringify({
        sku_id: str_(currentRow[row.idx.sku_id]),
        location_id: str_(currentRow[row.idx.location_id]),
        expected_version_id: row.versionId,
        actual_version_id: currentVersion,
      }));
    }

    const onHandQty = num_(nextOnHandQty);
    const reservedQty = num_(nextReservedQty);
    const availableQty = onHandQty - reservedQty;
    const nextVersion = String(currentVersion + 1);

    const out = currentRow.slice();
    out[row.idx.on_hand_qty] = String(onHandQty);
    out[row.idx.reserved_qty] = String(reservedQty);
    out[row.idx.available_qty] = String(availableQty);
    out[row.idx.version_id] = nextVersion;
    out[row.idx.updated_at] = updatedAt;
    row.sheet.getRange(row.rowNumber, 1, 1, row.header.length).setValues([out]);
    return nextVersion;
  }

  function inventoryIndexLookup_(ctx, skuId, locationId) {
    const map = loadInventoryIndexMap_(ctx);
    const key = inventoryKey_(skuId, locationId);
    const raw = map[key];
    if (raw !== undefined) {
      const parsed = parseInt(String(raw), 10);
      if (Number.isFinite(parsed) && parsed >= 2 && parsed <= ctx.lastRow) return parsed;
      return null;
    }

    if (ctx.lastRow < 2) return null;
    const startCol = Math.min(ctx.idx.sku_id, ctx.idx.location_id) + 1;
    const width = Math.abs(ctx.idx.sku_id - ctx.idx.location_id) + 1;
    const values = ctx.sheet.getRange(2, startCol, ctx.lastRow - 1, width).getValues();
    const offsetSku = ctx.idx.sku_id - (startCol - 1);
    const offsetLoc = ctx.idx.location_id - (startCol - 1);

    for (let i = 0; i < values.length; i++) {
      const rowSku = str_(values[i][offsetSku]);
      const rowLoc = str_(values[i][offsetLoc]);
      const rowNum = i + 2;
      map[inventoryKey_(rowSku, rowLoc)] = rowNum;
    }

    storeInventoryIndexMap_(ctx, map);
    return map[key] ? parseInt(String(map[key]), 10) : null;
  }

  function rememberInventoryIndex_(ctx, skuId, locationId, rowNumber) {
    const map = loadInventoryIndexMap_(ctx);
    map[inventoryKey_(skuId, locationId)] = rowNumber;
    storeInventoryIndexMap_(ctx, map);
  }

  function clearInventoryIndex_(ctx) {
    const props = PropertiesService.getScriptProperties();
    props.deleteProperty(ctx.cacheKey);
  }

  function loadInventoryIndexMap_(ctx) {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(ctx.cacheKey);
    const now = Date.now();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.expires_at && parsed.index) {
          if (Number(parsed.expires_at) > now) {
            return parsed.index;
          }
        }
      } catch (err) {}
    }
    return {};
  }

  function storeInventoryIndexMap_(ctx, map) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(ctx.cacheKey, JSON.stringify({
      expires_at: Date.now() + 60 * 1000,
      index: map,
    }));
  }

  function inventoryKey_(skuId, locationId) {
    return str_(skuId) + '::' + str_(locationId);
  }

  function appendEvent_(action, entityType, entityId, payload, createdAt, ctx) {
    const reason = str_(payload && payload.reason);
    Audit_.logMutation({
      ctx,
      action,
      event_type: action,
      entity_type: entityType,
      entity_id: entityId,
      request_id: str_(ctx.requestId),
      source: WEBAPP_SOURCE,
      required_proof: '',
      proof_ref: str_(payload && payload.proof_ref),
      reason,
      created_at: createdAt,
      diff_or_effect: payload || {},
      payload_json: {
        ...(payload || {}),
        action,
        entity_type: entityType,
        entity_id: entityId,
        request_id: str_(ctx.requestId),
        ...(reason ? { reason } : {}),
      },
    });
  }

  function nextMoveId_(isoTs) {
    const sheet = Sys_.sheet_(SHEET.INVENTORY_MOVES);
    const lastRow = sheet.getLastRow();
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const idx = index_(header, ['move_id']);

    const dateKey = Utilities.formatDate(new Date(isoTs), SERVICE_TIMEZONE, 'yyMMdd');
    const prefix = 'MV-' + dateKey + '-';
    let maxSeq = 0;

    if (lastRow >= 2) {
      const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
      for (let i = 0; i < values.length; i++) {
        const moveId = str_(values[i][idx.move_id]);
        if (moveId.indexOf(prefix) !== 0) continue;
        const seq = Number(moveId.slice(prefix.length));
        if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
      }
    }

    return prefix + String(maxSeq + 1).padStart(3, '0');
  }

  function actorUserId_(ctx) {
    return ctx && ctx.actor && ctx.actor.employee_id ? str_(ctx.actor.employee_id) : '';
  }

  function actorRoleId_(ctx) {
    return ctx && ctx.actor && ctx.actor.role ? str_(ctx.actor.role) : '';
  }

  function index_(header, required) {
    const out = {};
    for (let i = 0; i < header.length; i++) {
      out[str_(header[i])] = i;
    }

    for (let j = 0; j < required.length; j++) {
      if (out[required[j]] === undefined) {
        throw new Error(ERROR.BAD_REQUEST + ': missing column ' + required[j]);
      }
    }

    return out;
  }

  function str_(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }

  function num_(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
})();
