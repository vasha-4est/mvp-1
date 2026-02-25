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

    if (!skuId) throw new Error(ERROR.BAD_REQUEST + ': missing sku_id');
    if (!fromLocationId) throw new Error(ERROR.BAD_REQUEST + ': missing from_location_id');
    if (!toLocationId) throw new Error(ERROR.BAD_REQUEST + ': missing to_location_id');
    if (fromLocationId === toLocationId) throw new Error(ERROR.BAD_REQUEST + ': from_location_id must differ from to_location_id');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(ERROR.BAD_REQUEST + ': qty must be > 0');

    return withInventoryMoveLock_(ctx, skuId, fromLocationId, () => {
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

      const movedAt = nowIso_();
      const fromRow = readBalanceRow_(skuId, fromLocationId);
      if (!fromRow) throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      if (fromRow.onHandQty < qty) throw new Error(ERROR.INSUFFICIENT_STOCK + ': insufficient on_hand_qty');

      updateBalanceRow_(fromRow, fromRow.onHandQty - qty, fromRow.reservedQty, movedAt);

      const toRow = readBalanceRow_(skuId, toLocationId);
      if (toRow) {
        updateBalanceRow_(toRow, toRow.onHandQty + qty, toRow.reservedQty, movedAt);
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

      appendEvent_('inventory_move', 'inventory_move', moveId, {
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
      };
    });
  });

  Actions_.register_('inventory.reserve.create', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);
    const payload = ctx.payload || {};
    const skuId = str_(payload.sku_id);
    const locationId = str_(payload.location_id);
    const reason = str_(payload.reason);
    const proofRef = str_(payload.proof_ref);
    const qty = num_(payload.qty);

    if (!skuId) throw new Error(ERROR.BAD_REQUEST + ': missing sku_id');
    if (!locationId) throw new Error(ERROR.BAD_REQUEST + ': missing location_id');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(ERROR.BAD_REQUEST + ': qty must be > 0');

    return withLock_(() => {
      if (idempExists_(ctx.requestId, 'inventory.reserve')) {
        return { ok: true, replayed: true, sku_id: skuId, location_id: locationId, qty };
      }

      const updatedAt = nowIso_();
      const row = readBalanceRow_(skuId, locationId);
      if (!row) throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      if (row.availableQty < qty) throw new Error(ERROR.INSUFFICIENT_STOCK + ': insufficient available_qty');

      updateBalanceRow_(row, row.onHandQty, row.reservedQty + qty, updatedAt);

      appendEvent_('inventory_reserve', 'inventory_balance', skuId + ':' + locationId, {
        sku_id: skuId,
        location_id: locationId,
        qty,
        reason,
        proof_ref: proofRef,
      }, updatedAt, ctx);

      markIdempotent_(ctx.requestId, 'inventory.reserve');
      return { ok: true, sku_id: skuId, location_id: locationId, qty };
    });
  });

  Actions_.register_('inventory.release.create', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);
    const payload = ctx.payload || {};
    const skuId = str_(payload.sku_id);
    const locationId = str_(payload.location_id);
    const reason = str_(payload.reason);
    const proofRef = str_(payload.proof_ref);
    const qty = num_(payload.qty);

    if (!skuId) throw new Error(ERROR.BAD_REQUEST + ': missing sku_id');
    if (!locationId) throw new Error(ERROR.BAD_REQUEST + ': missing location_id');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error(ERROR.BAD_REQUEST + ': qty must be > 0');

    return withLock_(() => {
      if (idempExists_(ctx.requestId, 'inventory.release')) {
        return { ok: true, replayed: true, sku_id: skuId, location_id: locationId, qty };
      }

      const updatedAt = nowIso_();
      const row = readBalanceRow_(skuId, locationId);
      if (!row) throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      if (row.reservedQty < qty) throw new Error(ERROR.INSUFFICIENT_STOCK + ': insufficient reserved_qty');

      updateBalanceRow_(row, row.onHandQty, row.reservedQty - qty, updatedAt);

      appendEvent_('inventory_release', 'inventory_balance', skuId + ':' + locationId, {
        sku_id: skuId,
        location_id: locationId,
        qty,
        reason,
        proof_ref: proofRef,
      }, updatedAt, ctx);

      markIdempotent_(ctx.requestId, 'inventory.release');
      return { ok: true, sku_id: skuId, location_id: locationId, qty };
    });
  });

  function withInventoryMoveLock_(ctx, skuId, fromLocationId, fn) {
    const lockKey = 'inventory:' + skuId + ':' + fromLocationId;
    const now = new Date();
    const acquiredAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ENTITY_LOCK_TTL_SEC * 1000).toISOString();
    const lockSheet = Sys_.sheet_('locks');
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

    const lastRow = lockSheet.getLastRow();
    if (lastRow >= 2) {
      const lockRows = lockSheet.getRange(2, 1, lastRow - 1, lockHeader.length).getValues();
      const toDelete = [];

      for (let i = 0; i < lockRows.length; i++) {
        if (str_(lockRows[i][lockIdx.lock_key]) !== lockKey) continue;

        const expiresAtValue = new Date(str_(lockRows[i][lockIdx.expires_at]));
        const isExpired = Number.isFinite(expiresAtValue.getTime()) && expiresAtValue.getTime() < now.getTime();
        if (isExpired) {
          toDelete.push(i + 2);
          continue;
        }

        const status = str_(lockRows[i][lockIdx.status]);
        if (status === 'active') {
          throw new Error(ERROR.LOCK_CONFLICT + ': Inventory entity is locked');
        }
      }

      for (let j = toDelete.length - 1; j >= 0; j--) {
        lockSheet.deleteRow(toDelete[j]);
      }
    }

    lockSheet.appendRow(lockHeader.map((columnName) => {
      if (columnName === 'lock_key') return lockKey;
      if (columnName === 'entity_type') return 'inventory';
      if (columnName === 'entity_id') return skuId + '|' + fromLocationId;
      if (columnName === 'held_by_user_id') return actorUserId_(ctx) || 'system';
      if (columnName === 'held_by_role_id') return actorRoleId_(ctx);
      if (columnName === 'acquired_at') return acquiredAt;
      if (columnName === 'expires_at') return expiresAt;
      if (columnName === 'status') return 'active';
      return '';
    }));

    try {
      return fn();
    } finally {
      const currentLastRow = lockSheet.getLastRow();
      if (currentLastRow < 2) return;

      const rows = lockSheet.getRange(2, 1, currentLastRow - 1, lockHeader.length).getValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        const rowLockKey = str_(rows[i][lockIdx.lock_key]);
        const rowAcquiredAt = str_(rows[i][lockIdx.acquired_at]);
        if (rowLockKey === lockKey && rowAcquiredAt === acquiredAt) {
          lockSheet.deleteRow(i + 2);
          break;
        }
      }
    }
  }

  function withLock_(fn) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(50)) {
      throw new Error(ERROR.LOCK_CONFLICT + ': Inventory entity is locked');
    }

    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  function idempExists_(requestId, action) {
    const req = str_(requestId);
    if (!req) return false;
    const rows = Db_.query_(SHEET.IDEMP, (row) => str_(row.request_id) === req && str_(row.action) === action);
    return rows.length > 0;
  }

  function markIdempotent_(requestId, action) {
    if (idempExists_(requestId, action)) return;
    Db_.append_(SHEET.IDEMP, {
      request_id: str_(requestId),
      action,
      created_at: nowIso_(),
    });
  }

  function replayMoveId_(requestId) {
    const req = str_(requestId);
    if (!req) return '';
    const rows = Db_.query_(SHEET.EVENTS, (row) => str_(row.request_id) === req && str_(row.event_type) === 'inventory_move');
    if (rows.length === 0) return '';
    return str_(rows[0].entity_id);
  }

  function readBalanceRow_(skuId, locationId) {
    const sheet = Sys_.sheet_(SHEET.INVENTORY);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const idx = index_(header, ['sku_id', 'location_id', 'on_hand_qty', 'reserved_qty', 'available_qty', 'version_id', 'updated_at']);
    const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();

    for (let i = 0; i < values.length; i++) {
      if (str_(values[i][idx.sku_id]) === skuId && str_(values[i][idx.location_id]) === locationId) {
        return {
          rowNumber: i + 2,
          header,
          idx,
          rowValues: values[i],
          onHandQty: num_(values[i][idx.on_hand_qty]),
          reservedQty: num_(values[i][idx.reserved_qty]),
          availableQty: num_(values[i][idx.available_qty]),
          versionId: str_(values[i][idx.version_id] || '0'),
        };
      }
    }

    return null;
  }

  function updateBalanceRow_(row, nextOnHandQty, nextReservedQty, updatedAt) {
    const sheet = Sys_.sheet_(SHEET.INVENTORY);
    const currentVersion = str_(sheet.getRange(row.rowNumber, row.idx.version_id + 1).getValue() || '0');
    if (currentVersion !== row.versionId) {
      throw new Error(ERROR.LOCK_CONFLICT + ': version mismatch');
    }

    const onHandQty = num_(nextOnHandQty);
    const reservedQty = num_(nextReservedQty);
    const availableQty = onHandQty - reservedQty;
    const nextVersion = String(num_(currentVersion) + 1);

    const out = row.rowValues.slice();
    out[row.idx.on_hand_qty] = String(onHandQty);
    out[row.idx.reserved_qty] = String(reservedQty);
    out[row.idx.available_qty] = String(availableQty);
    out[row.idx.version_id] = nextVersion;
    out[row.idx.updated_at] = updatedAt;
    sheet.getRange(row.rowNumber, 1, 1, row.header.length).setValues([out]);
  }

  function appendEvent_(eventType, entityType, entityId, payload, createdAt, ctx) {
    Db_.append_(SHEET.EVENTS, {
      event_id: uuid_(),
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      payload: '',
      created_at: createdAt,
      actor_user_id: actorUserId_(ctx),
      actor_role_id: actorRoleId_(ctx),
      required_proof: '',
      proof_ref: str_(payload.proof_ref),
      source: WEBAPP_SOURCE,
      request_id: str_(ctx.requestId),
      payload_json: JSON.stringify(payload || {}),
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
