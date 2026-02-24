/** Inventory actions */

(function initInventoryActions_(){
  const SERVICE_TIMEZONE = 'Europe/Moscow';
  const LOCK_WAIT_MS = 30000;

  Actions_.register_('inventory.balance.get', (ctx)=>{
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);
    const skuId = String(ctx.payload.sku_id || '').trim();
    const locId = String(ctx.payload.location_id || '').trim();
    let rows = Db_.readAll_(SHEET.INVENTORY);
    if (skuId) rows = rows.filter((r) => String(r.sku_id) === skuId);
    if (locId) rows = rows.filter((r) => String(r.location_id) === locId);
    return { balances: rows };
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

    return withInventoryLock_(() => {
      const replay = idempGet_(ctx.requestId, 'inventory.move.create');
      if (replay) return replay;

      const movedAt = nowIso_();
      const fromRow = readInventoryRow_(skuId, fromLocationId);
      if (!fromRow) throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      if (fromRow.onHandQty < qty) throw new Error(ERROR.INSUFFICIENT_STOCK + ': insufficient on_hand_qty');

      writeInventoryRow_(fromRow, {
        on_hand_qty: fromRow.onHandQty - qty,
        reserved_qty: fromRow.reservedQty,
        updated_at: movedAt,
      });

      const toRow = readInventoryRow_(skuId, toLocationId);
      if (toRow) {
        writeInventoryRow_(toRow, {
          on_hand_qty: toRow.onHandQty + qty,
          reserved_qty: toRow.reservedQty,
          updated_at: movedAt,
        });
      } else {
        createInventoryRow_(skuId, toLocationId, qty, movedAt);
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

      appendEvent_('inventory_move', moveId, 'created', {
        sku_id: skuId,
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        qty,
        reason,
      }, movedAt, ctx.requestId, ctx);

      const result = {
        ok: true,
        move_id: moveId,
        sku_id: skuId,
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        qty,
      };
      idempPut_(ctx.requestId, 'inventory.move.create', result);
      return result;
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

    return withInventoryLock_(() => {
      const replay = idempGet_(ctx.requestId, 'inventory.reserve.create');
      if (replay) return replay;

      const updatedAt = nowIso_();
      const row = readInventoryRow_(skuId, locationId);
      if (!row) throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      if (row.availableQty < qty) throw new Error(ERROR.INSUFFICIENT_STOCK + ': insufficient available_qty');

      writeInventoryRow_(row, {
        on_hand_qty: row.onHandQty,
        reserved_qty: row.reservedQty + qty,
        updated_at: updatedAt,
      });

      appendEvent_('inventory_reserve', skuId + ':' + locationId, 'created', {
        sku_id: skuId,
        location_id: locationId,
        qty,
        reason,
        proof_ref: proofRef,
      }, updatedAt, ctx.requestId, ctx);

      const result = { ok: true, sku_id: skuId, location_id: locationId, qty };
      idempPut_(ctx.requestId, 'inventory.reserve.create', result);
      return result;
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

    return withInventoryLock_(() => {
      const replay = idempGet_(ctx.requestId, 'inventory.release.create');
      if (replay) return replay;

      const updatedAt = nowIso_();
      const row = readInventoryRow_(skuId, locationId);
      if (!row) throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      if (row.reservedQty < qty) throw new Error(ERROR.INSUFFICIENT_STOCK + ': insufficient reserved_qty');

      writeInventoryRow_(row, {
        on_hand_qty: row.onHandQty,
        reserved_qty: row.reservedQty - qty,
        updated_at: updatedAt,
      });

      appendEvent_('inventory_release', skuId + ':' + locationId, 'created', {
        sku_id: skuId,
        location_id: locationId,
        qty,
        reason,
        proof_ref: proofRef,
      }, updatedAt, ctx.requestId, ctx);

      const result = { ok: true, sku_id: skuId, location_id: locationId, qty };
      idempPut_(ctx.requestId, 'inventory.release.create', result);
      return result;
    });
  });

  function withInventoryLock_(fn) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_WAIT_MS);
    } catch (_e) {
      throw new Error(ERROR.LOCK_CONFLICT + ': lock timeout after ' + LOCK_WAIT_MS + 'ms');
    }

    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  function idempGet_(requestId, action) {
    const row = Db_.query_(SHEET.IDEMP, (r) => String(r.request_id) === String(requestId) && String(r.action) === String(action));
    if (row.length === 0) return null;
    return JSON.parse(String(row[0].response_json || '{}'));
  }

  function idempPut_(requestId, action, responseObj) {
    const existing = idempGet_(requestId, action);
    if (existing) return;
    Db_.append_(SHEET.IDEMP, {
      request_id: requestId,
      action,
      response_json: JSON.stringify(responseObj || {}),
      created_at: nowIso_(),
    });
  }

  function readInventoryRow_(skuId, locationId) {
    const sh = Sys_.sheet_(SHEET.INVENTORY);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return null;
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const idx = idx_(header);
    const values = sh.getRange(2, 1, lastRow - 1, header.length).getValues();

    for (let i = 0; i < values.length; i++) {
      if (String(values[i][idx.sku_id]) === skuId && String(values[i][idx.location_id]) === locationId) {
        return {
          rowNumber: i + 2,
          header,
          idx,
          values: values[i],
          skuId,
          locationId,
          onHandQty: num_(values[i][idx.on_hand_qty]),
          reservedQty: num_(values[i][idx.reserved_qty]),
          availableQty: num_(values[i][idx.available_qty]),
          versionId: String(values[i][idx.version_id] || '0'),
        };
      }
    }

    return null;
  }

  function writeInventoryRow_(row, patch) {
    const sh = Sys_.sheet_(SHEET.INVENTORY);
    const currentVersion = String(sh.getRange(row.rowNumber, row.idx.version_id + 1).getValue() || '0');
    if (currentVersion !== row.versionId) {
      throw new Error(ERROR.LOCK_CONFLICT + ': version mismatch');
    }

    const onHandQty = num_(patch.on_hand_qty);
    const reservedQty = num_(patch.reserved_qty);
    const availableQty = onHandQty - reservedQty;
    const nextVersion = String(num_(currentVersion) + 1);

    const newRow = row.values.slice();
    newRow[row.idx.on_hand_qty] = String(onHandQty);
    newRow[row.idx.reserved_qty] = String(reservedQty);
    newRow[row.idx.available_qty] = String(availableQty);
    newRow[row.idx.version_id] = nextVersion;
    newRow[row.idx.updated_at] = String(patch.updated_at || nowIso_());
    sh.getRange(row.rowNumber, 1, 1, row.header.length).setValues([newRow]);
  }

  function createInventoryRow_(skuId, locationId, onHandQty, updatedAt) {
    Db_.append_(SHEET.INVENTORY, {
      sku_id: skuId,
      location_id: locationId,
      on_hand_qty: String(onHandQty),
      reserved_qty: '0',
      available_qty: String(onHandQty),
      version_id: '1',
      updated_at: updatedAt,
    });
  }

  function appendEvent_(entityType, entityId, eventType, payload, createdAt, requestId, ctx) {
    Db_.append_(SHEET.EVENTS, {
      event_id: uuid_(),
      server_ts: createdAt,
      request_id: requestId,
      event_key: eventType,
      zone_id: '',
      object_type: entityType,
      payload_json: JSON.stringify({
        entity_type: entityType,
        entity_id: entityId,
        event_type: eventType,
        payload_json: JSON.stringify(payload || {}),
        created_at: createdAt,
      }),
      actor_employee_id: actorUserId_(ctx),
      actor_role: actorRoleId_(ctx),
    });
  }

  function nextMoveId_(isoTs) {
    const sh = Sys_.sheet_(SHEET.INVENTORY_MOVES);
    const lastRow = sh.getLastRow();
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const moveIdIdx = header.indexOf('move_id');
    if (moveIdIdx === -1) throw new Error(ERROR.BAD_REQUEST + ': inventory_moves missing move_id');

    const dateKey = Utilities.formatDate(new Date(isoTs), SERVICE_TIMEZONE, 'yyMMdd');
    const prefix = 'MV-' + dateKey + '-';
    let maxSeq = 0;

    if (lastRow >= 2) {
      const values = sh.getRange(2, 1, lastRow - 1, header.length).getValues();
      for (let i = 0; i < values.length; i++) {
        const moveId = String(values[i][moveIdIdx] || '');
        if (moveId.indexOf(prefix) !== 0) continue;
        const seq = Number(moveId.slice(prefix.length));
        if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
      }
    }

    return prefix + String(maxSeq + 1).padStart(3, '0');
  }

  function idx_(header) {
    const out = {};
    for (let i = 0; i < header.length; i++) out[String(header[i])] = i;
    const required = ['sku_id', 'location_id', 'on_hand_qty', 'reserved_qty', 'available_qty', 'version_id', 'updated_at'];
    for (let j = 0; j < required.length; j++) {
      if (out[required[j]] === undefined) {
        throw new Error(ERROR.BAD_REQUEST + ': inventory_balances missing ' + required[j]);
      }
    }
    return out;
  }

  function actorUserId_(ctx) {
    return ctx && ctx.actor && ctx.actor.employee_id ? String(ctx.actor.employee_id) : '';
  }

  function actorRoleId_(ctx) {
    return ctx && ctx.actor && ctx.actor.role ? String(ctx.actor.role) : '';
  }

  function num_(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function str_(v) {
    return String(v || '').trim();
  }
})();
