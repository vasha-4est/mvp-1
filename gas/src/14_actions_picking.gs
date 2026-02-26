/** Picking actions (Phase A). */

(function initPickingActions_(){
  const SERVICE_TIMEZONE = 'Europe/Moscow';
  const ENTITY_LOCK_TTL_SEC = 30;
  const WEBAPP_SOURCE = 'webapp';

  Actions_.register_('picking.lists.create', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PICKING_CORE);

    const payload = ctx.payload || {};
    const warehouseKey = String(payload.warehouse_key || '').trim();
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const requestId = String(ctx.requestId || '').trim();
    const action = 'picking.lists.create';

    if (!requestId) throw new Error(ERROR.BAD_REQUEST + ': request_id is required');
    if (!warehouseKey) throw new Error(ERROR.BAD_REQUEST + ': warehouse_key is required');
    if (lines.length === 0) throw new Error(ERROR.BAD_REQUEST + ': lines must not be empty');

    if (idempExists_(requestId, action)) {
      return replayPickingCreateResponse_(requestId);
    }

    const normalizedLines = normalizeLines_(lines);
    validateBalancesExist_(normalizedLines);

    const pickingListId = nextPickingListId_();
    const createdAt = nowIso_();
    const reservedLines = [];

    try {
      for (let i = 0; i < normalizedLines.length; i++) {
        const line = normalizedLines[i];
        const reserveCtx = withChildRequest_(ctx, childRequestId_(requestId, 'reserve', line, i), {
          sku_id: line.sku_id,
          location_id: line.location_id,
          qty: line.qty,
          reason: 'picking_list_create',
          proof_ref: pickingListId,
          require_expected_version: false,
        });

        Actions_.dispatch_('inventory.reserve', reserveCtx);
        reservedLines.push(line);
      }
    } catch (err) {
      rollbackReservations_(ctx, requestId, reservedLines, pickingListId);

      const message = String(err && err.message ? err.message : err);
      if (message.indexOf(ERROR.INSUFFICIENT_AVAILABLE + ':') === 0) {
        throw new Error(ERROR.INSUFFICIENT_AVAILABLE + ': insufficient available_qty');
      }

      throw err;
    }

    const totalQty = normalizedLines.reduce((sum, line) => sum + line.qty, 0);

    Db_.append_(SHEET.PICKING_LISTS, {
      picking_list_id: pickingListId,
      warehouse_key: warehouseKey,
      status: 'NEW',
      planned_lines: String(normalizedLines.length),
      planned_qty: String(totalQty),
      created_at: createdAt,
      updated_at: createdAt,
      request_id: requestId,
      version_id: '1',
    });

    for (let i = 0; i < normalizedLines.length; i++) {
      const line = normalizedLines[i];
      const pickingLineId = nextPickingLineId_(pickingListId, i + 1);
      Db_.append_(SHEET.PICKING_LINES, {
        picking_line_id: pickingLineId,
        line_id: pickingLineId,
        picking_list_id: pickingListId,
        sku_id: line.sku_id,
        location_id: line.location_id,
        qty_required: String(line.qty),
        planned_qty: String(line.qty),
        qty_picked: '0',
        picked_qty: '0',
        status: 'NEW',
        created_at: createdAt,
        updated_at: createdAt,
        request_id: requestId,
        version_id: '1',
      });
    }

    appendPickingEvent_(ctx, 'picking_list_created', 'picking_list', pickingListId, {
      picking_list_id: pickingListId,
      warehouse_key: warehouseKey,
      lines_count: normalizedLines.length,
      planned_qty: totalQty,
    }, createdAt);

    markIdempotent_(requestId, action, true);

    return {
      ok: true,
      picking_list_id: pickingListId,
    };
  });

  Actions_.register_('picking.lines.get', (ctx)=>{
    Validate_.requireFlag_(ctx.flags, FLAG.PICKING_CORE);
    const shipmentId = String(ctx.payload.shipment_id || '').trim();
    const listId = String(ctx.payload.picking_list_id || '').trim();
    let rows = Db_.readAll_(SHEET.PICKING_LINES);
    if (shipmentId) rows = rows.filter(r => String(r.shipment_id) === shipmentId);
    if (listId) rows = rows.filter(r => String(r.picking_list_id) === listId);
    return { lines: rows };
  });

  Actions_.register_('picking.lists.list', (ctx)=>{
    Validate_.requireFlag_(ctx.flags, FLAG.PICKING_CORE);

    const rawLimit = Number(ctx.payload.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50;

    let rows = Db_.readAll_(SHEET.PICKING_LISTS);
    if (limit > 0) {
      rows = rows.slice(0, limit);
    }

    return { items: rows };
  });

  Actions_.register_('picking.lists.get', (ctx)=>{
    Validate_.requireFlag_(ctx.flags, FLAG.PICKING_CORE);
    Validate_.requireFields_(ctx.payload, ['picking_list_id']);

    const pickingListId = String(ctx.payload.picking_list_id || '').trim();
    const pickingList = Db_.findBy_(SHEET.PICKING_LISTS, 'picking_list_id', pickingListId);
    if (!pickingList) {
      throw new Error(ERROR.NOT_FOUND + ': picking_list_id');
    }

    const lines = Db_.readAll_(SHEET.PICKING_LINES)
      .filter((row) => String(row.picking_list_id || '') === pickingListId);

    return {
      picking_list: pickingList,
      lines,
    };
  });

  Actions_.register_('picking.line.start', (ctx)=>{
    Validate_.requireFlag_(ctx.flags, FLAG.PICKING_CORE);
    Validate_.requireFields_(ctx.payload, ['picking_line_id']);
    const id = String(ctx.payload.picking_line_id).trim();
    const patch = {
      in_progress_by_employee_id: ctx.actor.employee_id,
      in_progress_at: nowIso_(),
    };
    const res = Db_.updateByPk_(SHEET.PICKING_LINES, 'picking_line_id', id, patch, ctx.payload.expected_version_id);
    if (!res.updated) throw new Error(res.reason || ERROR.BAD_REQUEST);
    Events_.log_(ctx, 'picking_line_started', 'logistics', 'picking_line', { picking_line_id: id });
    return { line: res.row };
  });

  Actions_.register_('picking.line.confirm', (ctx)=>{
    Validate_.requireFlag_(ctx.flags, FLAG.PICKING_CORE);
    Validate_.requireFields_(ctx.payload, ['picking_line_id', 'qty_picked']);
    const id = String(ctx.payload.picking_line_id).trim();
    const add = Number(ctx.payload.qty_picked);
    if (!(add > 0)) throw new Error(ERROR.BAD_REQUEST + ': qty_picked must be >0');

    const cur = Db_.findBy_(SHEET.PICKING_LINES, 'picking_line_id', id);
    if (!cur) throw new Error(ERROR.NOT_FOUND + ': picking_line_id');

    const required = Number(cur.qty_required || 0);
    const picked = Number(cur.qty_picked || 0);
    const next = picked + add;
    if (next > required) throw new Error(ERROR.QTY_EXCEEDS_REMAINING + `: required=${required}, picked=${picked}`);

    const status = (next >= required) ? 'DONE' : 'IN_PROGRESS';
    const patch = {
      qty_picked: next,
      status,
      picked_by_employee_id: (status === 'DONE') ? ctx.actor.employee_id : (cur.picked_by_employee_id || ''),
      picked_at: (status === 'DONE') ? nowIso_() : (cur.picked_at || ''),
      in_progress_by_employee_id: '',
      in_progress_at: '',
    };

    const res = Db_.updateByPk_(SHEET.PICKING_LINES, 'picking_line_id', id, patch, ctx.payload.expected_version_id);
    if (!res.updated) throw new Error(res.reason || ERROR.BAD_REQUEST);

    // Evidence: confirm/photo/scan/mp_log
    const evidence = ctx.payload.evidence || { type: 'confirm' };
    Events_.log_(ctx, 'picking_line_confirmed', 'logistics', 'picking_line', {
      picking_line_id: id,
      qty_added: add,
      evidence,
    });

    return { line: res.row };
  });

  Actions_.register_('picking.confirm', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PICKING_CORE);
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);

    const payload = ctx.payload || {};
    const requestId = String(ctx.requestId || '').trim();
    const pickingListId = String(payload.picking_list_id || '').trim();
    const lineId = String(payload.line_id || '').trim();
    const qtyDone = Number(payload.qty_done);
    const shortReason = payload.short_reason === null || payload.short_reason === undefined ? '' : String(payload.short_reason).trim();
    const proofRef = payload.proof_ref === null || payload.proof_ref === undefined ? '' : String(payload.proof_ref).trim();
    const action = 'picking.confirm';

    if (!requestId) throw new Error(ERROR.BAD_REQUEST + ': request_id is required');
    if (!pickingListId) throw new Error(ERROR.BAD_REQUEST + ': picking_list_id is required');
    if (!lineId) throw new Error(ERROR.BAD_REQUEST + ': line_id is required');
    if (!Number.isFinite(qtyDone) || qtyDone < 0 || Math.floor(qtyDone) !== qtyDone) {
      throw new Error(ERROR.BAD_REQUEST + ': qty_done must be an integer >= 0');
    }

    const replayResult = replayPickingConfirmByRequest_(requestId, action);
    if (replayResult) return replayResult;

    const lockEntityId = pickingListId + ':' + lineId;
    return withEntitySheetLock_(ctx, 'picking_line', lockEntityId, () => {
      const lineRow = readPickingLineRow_(pickingListId, lineId);
      if (!lineRow) throw new Error(ERROR.NOT_FOUND + ': line_id');

      const plannedQty = numberOrZero_(lineRow.valueByColumn('planned_qty') || lineRow.valueByColumn('qty_required'));
      if (!(plannedQty > 0)) throw new Error(ERROR.BAD_REQUEST + ': planned_qty must be > 0');
      if (qtyDone > plannedQty) throw new Error(ERROR.BAD_REQUEST + ': qty_done cannot exceed planned_qty');

      const shortQty = plannedQty - qtyDone;
      if (shortQty > 0 && !shortReason) {
        throw new Error(ERROR.BAD_REQUEST + ': short_reason is required when qty_done < planned_qty');
      }

      const nowTs = nowIso_();
      const actorUserId = ctx && ctx.actor && ctx.actor.employee_id ? String(ctx.actor.employee_id).trim() : 'system';
      const actorRoleId = ctx && ctx.actor && ctx.actor.role ? String(ctx.actor.role).trim() : 'OWNER';
      const taskStatus = shortQty > 0 ? 'short' : 'done';

      applyPickingConfirmRowPatch_(lineRow, {
        qtyDone,
        shortQty,
        shortReason,
        taskStatus,
        proofRef,
        nowTs,
        actorUserId,
        actorRoleId,
        requestId,
      });

      if (shortQty > 0) {
        const skuId = String(lineRow.valueByColumn('sku_id') || '').trim();
        const locationId = String(lineRow.valueByColumn('location_id') || '').trim();
        if (skuId && locationId) {
          const releaseCtx = withChildRequest_(ctx, requestId + ':release', {
            sku_id: skuId,
            location_id: locationId,
            qty: shortQty,
            reason: 'picking_confirm_short_release',
            proof_ref: pickingListId + ':' + lineId,
            require_expected_version: false,
          });
          Actions_.dispatch_('inventory.release', releaseCtx);
        }
      }

      appendPickingEvent_(ctx, 'picking_confirmed', 'picking_line', lockEntityId, {
        picking_list_id: pickingListId,
        line_id: lineId,
        sku_id: String(lineRow.valueByColumn('sku_id') || '').trim(),
        planned_qty: plannedQty,
        qty_done: qtyDone,
        short_reason: shortQty > 0 ? shortReason : null,
      }, nowTs);

      markIdempotentFast_(requestId, action, nowTs);

      return {
        ok: true,
        picking_list_id: pickingListId,
        line_id: lineId,
        sku_id: String(lineRow.valueByColumn('sku_id') || '').trim(),
        planned_qty: plannedQty,
        picked_qty: qtyDone,
        task_status: taskStatus,
        short_reason: shortQty > 0 ? shortReason : null,
      };
    });
  });

  function normalizeLines_(lines) {
    const out = [];

    for (let i = 0; i < lines.length; i++) {
      const row = lines[i] || {};
      const skuId = String(row.sku_id || '').trim();
      const locationId = String(row.location_id || '').trim();
      const qty = Number(row.qty);

      if (!skuId || !locationId) {
        throw new Error(ERROR.BAD_REQUEST + ': sku_id and location_id are required');
      }

      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error(ERROR.BAD_REQUEST + ': qty must be > 0');
      }

      out.push({ sku_id: skuId, location_id: locationId, qty });
    }

    return out;
  }

  function replayPickingConfirmByRequest_(requestId, action) {
    const idempSheet = Sys_.sheet_(SHEET.IDEMP);
    const idempLastRow = idempSheet.getLastRow();
    if (idempLastRow >= 2) {
      const idempHeader = idempSheet.getRange(1, 1, 1, idempSheet.getLastColumn()).getValues()[0].map(String);
      const idempIdx = indexLock_(idempHeader, ['request_id', 'action']);
      const idempRows = idempSheet.getRange(2, 1, idempLastRow - 1, idempHeader.length).getValues();
      for (let i = 0; i < idempRows.length; i++) {
        if (String(idempRows[i][idempIdx.request_id] || '').trim() === requestId && String(idempRows[i][idempIdx.action] || '').trim() === action) {
          return replayPickingConfirmResponse_(requestId);
        }
      }
    }

    return null;
  }

  function readPickingLineRow_(pickingListId, lineId) {
    const sheet = Sys_.sheet_(SHEET.PICKING_LINES);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const idx = indexLock_(header, ['picking_list_id', 'line_id']);
    const rows = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (String(row[idx.picking_list_id] || '').trim() !== pickingListId) continue;
      if (String(row[idx.line_id] || '').trim() !== lineId) continue;

      return {
        sheet,
        header,
        idxMap: indexHeader_(header),
        rowNumber: i + 2,
        row,
        valueByColumn: function(name) {
          const pos = this.idxMap[name];
          return pos === undefined ? '' : this.row[pos];
        },
      };
    }

    return null;
  }

  function applyPickingConfirmRowPatch_(lineRow, input) {
    const next = lineRow.row.slice();
    setIfColumn_(lineRow.idxMap, next, 'picked_qty', String(input.qtyDone));
    setIfColumn_(lineRow.idxMap, next, 'qty_picked', String(input.qtyDone));
    setIfColumn_(lineRow.idxMap, next, 'qty_done', String(input.qtyDone));
    setIfColumn_(lineRow.idxMap, next, 'qty_blocked', String(input.shortQty));
    setIfColumn_(lineRow.idxMap, next, 'blocked_reason', input.shortQty > 0 ? input.shortReason : '');
    setIfColumn_(lineRow.idxMap, next, 'task_status', input.taskStatus);
    setIfColumn_(lineRow.idxMap, next, 'status', input.taskStatus === 'done' ? 'DONE' : 'PARTIAL');
    setIfColumn_(lineRow.idxMap, next, 'done_at', input.nowTs);
    setIfColumn_(lineRow.idxMap, next, 'done_by_user_id', input.actorUserId);
    setIfColumn_(lineRow.idxMap, next, 'done_by_role_id', input.actorRoleId);
    setIfColumn_(lineRow.idxMap, next, 'proof_ref', input.proofRef);
    setIfColumn_(lineRow.idxMap, next, 'request_id', input.requestId);
    setIfColumn_(lineRow.idxMap, next, 'updated_at', input.nowTs);

    const payload = parseJsonSafe_(lineRow.valueByColumn('payload_json')) || {};
    payload.short_reason = input.shortQty > 0 ? input.shortReason : null;
    payload.short_qty = input.shortQty;
    payload.confirmed_at = input.nowTs;
    setIfColumn_(lineRow.idxMap, next, 'payload_json', JSON.stringify(payload));

    const versionPos = lineRow.idxMap.version_id;
    if (versionPos !== undefined) {
      const currentVersion = Number(next[versionPos] || 0);
      next[versionPos] = String(Number.isFinite(currentVersion) ? currentVersion + 1 : 1);
    }

    lineRow.sheet.getRange(lineRow.rowNumber, 1, 1, lineRow.header.length).setValues([next]);
  }

  function replayPickingConfirmResponse_(requestId) {
    const eventsSheet = Sys_.sheet_(SHEET.EVENTS);
    const lastRow = eventsSheet.getLastRow();
    if (lastRow < 2) {
      throw new Error(ERROR.BAD_REQUEST + ': replay payload not found');
    }

    const header = eventsSheet.getRange(1, 1, 1, eventsSheet.getLastColumn()).getValues()[0].map(String);
    const idx = indexLock_(header, ['request_id', 'event_type', 'payload_json']);
    const rows = eventsSheet.getRange(2, 1, lastRow - 1, header.length).getValues();

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][idx.request_id] || '').trim() !== requestId) continue;
      if (String(rows[i][idx.event_type] || '').trim() !== 'picking_confirmed') continue;
      const payload = parseJsonSafe_(rows[i][idx.payload_json]) || {};
      const plannedQty = numberOrZero_(payload.planned_qty);
      const qtyDone = numberOrZero_(payload.qty_done);
      return {
        ok: true,
        replayed: true,
        picking_list_id: String(payload.picking_list_id || '').trim(),
        line_id: String(payload.line_id || '').trim(),
        sku_id: String(payload.sku_id || '').trim(),
        planned_qty: plannedQty,
        picked_qty: qtyDone,
        task_status: plannedQty === qtyDone ? 'done' : 'short',
        short_reason: payload.short_reason ? String(payload.short_reason) : null,
      };
    }

    throw new Error(ERROR.BAD_REQUEST + ': replay payload not found');
  }

  function markIdempotentFast_(requestId, action, createdAt) {
    const sheet = Sys_.sheet_(SHEET.IDEMP);
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const row = header.map((name) => {
      if (name === 'request_id') return requestId;
      if (name === 'action') return action;
      if (name === 'created_at') return createdAt;
      return '';
    });

    sheet.appendRow(row);
  }

  function indexHeader_(header) {
    const out = {};
    for (let i = 0; i < header.length; i++) {
      out[String(header[i] || '').trim()] = i;
    }
    return out;
  }

  function setIfColumn_(idxMap, row, name, value) {
    const pos = idxMap[name];
    if (pos !== undefined) row[pos] = value;
  }

  function withEntitySheetLock_(ctx, entityType, entityId, fn) {
    const lockKey = entityType + ':' + entityId;
    const now = new Date();
    const acquiredAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ENTITY_LOCK_TTL_SEC * 1000).toISOString();
    const lockSheet = Sys_.sheet_(SHEET.LOCKS);
    const lockHeader = lockSheet.getRange(1, 1, 1, lockSheet.getLastColumn()).getValues()[0].map(String);
    const lockIdx = indexLock_(lockHeader, [
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
        if (String(lockRows[i][lockIdx.lock_key] || '').trim() !== lockKey) continue;

        const expiresAtValue = new Date(String(lockRows[i][lockIdx.expires_at] || '').trim());
        const isExpired = Number.isFinite(expiresAtValue.getTime()) && expiresAtValue.getTime() < now.getTime();
        if (isExpired) {
          toDelete.push(i + 2);
          continue;
        }

        const status = String(lockRows[i][lockIdx.status] || '').trim();
        if (status === 'active') {
          throw new Error(ERROR.LOCK_CONFLICT + ': Picking line is locked');
        }
      }

      for (let j = toDelete.length - 1; j >= 0; j--) {
        lockSheet.deleteRow(toDelete[j]);
      }
    }

    lockSheet.appendRow(lockHeader.map((columnName) => {
      if (columnName === 'lock_key') return lockKey;
      if (columnName === 'entity_type') return entityType;
      if (columnName === 'entity_id') return entityId;
      if (columnName === 'held_by_user_id') return ctx && ctx.actor && ctx.actor.employee_id ? String(ctx.actor.employee_id).trim() : 'system';
      if (columnName === 'held_by_role_id') return ctx && ctx.actor && ctx.actor.role ? String(ctx.actor.role).trim() : '';
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
        const rowLockKey = String(rows[i][lockIdx.lock_key] || '').trim();
        const rowAcquiredAt = String(rows[i][lockIdx.acquired_at] || '').trim();
        if (rowLockKey === lockKey && rowAcquiredAt === acquiredAt) {
          lockSheet.deleteRow(i + 2);
          break;
        }
      }
    }
  }

  function indexLock_(header, required) {
    const out = {};
    for (let i = 0; i < header.length; i++) {
      out[String(header[i] || '').trim()] = i;
    }

    for (let j = 0; j < required.length; j++) {
      if (out[required[j]] === undefined) {
        throw new Error(ERROR.BAD_REQUEST + ': Missing lock column ' + required[j]);
      }
    }

    return out;
  }

  function parseJsonSafe_(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function numberOrZero_(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function validateBalancesExist_(lines) {
    const balances = Db_.readAll_(SHEET.INVENTORY);
    const keys = {};

    for (let i = 0; i < balances.length; i++) {
      const key = String(balances[i].sku_id || '').trim() + '::' + String(balances[i].location_id || '').trim();
      keys[key] = true;
    }

    for (let j = 0; j < lines.length; j++) {
      const line = lines[j];
      const key = line.sku_id + '::' + line.location_id;
      if (!keys[key]) {
        throw new Error(ERROR.NOT_FOUND + ': SKU_NOT_FOUND');
      }
    }
  }

  function rollbackReservations_(ctx, requestId, reservedLines, pickingListId) {
    for (let i = reservedLines.length - 1; i >= 0; i--) {
      const line = reservedLines[i];
      try {
        const releaseCtx = withChildRequest_(ctx, childRequestId_(requestId, 'rollback', line, i), {
          sku_id: line.sku_id,
          location_id: line.location_id,
          qty: line.qty,
          reason: 'picking_list_create_rollback',
          proof_ref: pickingListId,
          require_expected_version: false,
        });
        Actions_.dispatch_('inventory.release', releaseCtx);
      } catch (releaseErr) {
        appendPickingEvent_(ctx, 'picking_list_create_rollback_failed', 'picking_list', pickingListId || '', {
          sku_id: line.sku_id,
          location_id: line.location_id,
          qty: line.qty,
          error: String(releaseErr && releaseErr.message ? releaseErr.message : releaseErr),
        }, nowIso_());
      }
    }
  }

  function withChildRequest_(ctx, childRequestId, payload) {
    return {
      requestId: childRequestId,
      payload,
      actor: ctx.actor,
      flags: ctx.flags,
    };
  }

  function childRequestId_(requestId, mode, line, index) {
    return [
      String(requestId || '').trim(),
      'picking',
      mode,
      String(index),
      line.sku_id,
      line.location_id,
    ].join(':');
  }

  function replayPickingCreateResponse_(requestId) {
    return {
      ok: true,
      replayed: true,
      picking_list_id: findPickingListIdByRequest_(requestId),
    };
  }

  function findPickingListIdByRequest_(requestId) {
    const req = String(requestId || '').trim();
    if (!req) return '';

    const events = Db_.query_(
      SHEET.EVENTS,
      (row) => String(row.request_id || '').trim() === req && String(row.event_type || '').trim() === 'picking_list_created'
    );

    if (events.length > 0) {
      const first = events[0] || {};
      const payloadRaw = String(first.payload_json || '').trim();
      if (payloadRaw) {
        try {
          const payload = JSON.parse(payloadRaw);
          if (payload && typeof payload === 'object' && payload.picking_list_id) {
            return String(payload.picking_list_id).trim();
          }
        } catch (err) {}
      }

      const entityId = String(first.entity_id || '').trim();
      if (entityId) return entityId;
    }

    const rows = Db_.query_(SHEET.PICKING_LISTS, (row) => String(row.request_id || '').trim() === req);
    if (rows.length > 0) return String(rows[0].picking_list_id || '').trim();
    return '';
  }

  function markIdempotent_(requestId, action, assumeMissing) {
    if (!assumeMissing && idempExists_(requestId, action)) return;

    Db_.append_(SHEET.IDEMP, {
      request_id: String(requestId || '').trim(),
      action,
      created_at: nowIso_(),
    });
  }

  function idempExists_(requestId, action) {
    const req = String(requestId || '').trim();
    if (!req) return false;

    const rows = Db_.query_(
      SHEET.IDEMP,
      (row) => String(row.request_id || '').trim() === req && String(row.action || '').trim() === action
    );

    return rows.length > 0;
  }

  function appendPickingEvent_(ctx, eventType, entityType, entityId, payload, createdAt) {
    Db_.append_(SHEET.EVENTS, {
      event_id: uuid_(),
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      payload: '',
      created_at: createdAt,
      actor_user_id: ctx && ctx.actor && ctx.actor.employee_id ? String(ctx.actor.employee_id).trim() : '',
      actor_role_id: ctx && ctx.actor && ctx.actor.role ? String(ctx.actor.role).trim() : '',
      required_proof: '',
      proof_ref: '',
      source: WEBAPP_SOURCE,
      request_id: String(ctx && ctx.requestId ? ctx.requestId : '').trim(),
      payload_json: JSON.stringify(payload || {}),
    });
  }

  function nextPickingListId_() {
    const rows = Db_.readAll_(SHEET.PICKING_LISTS);
    const dateKey = Utilities.formatDate(new Date(), SERVICE_TIMEZONE, 'yyMMdd');
    const prefix = 'PL-' + dateKey + '-';
    let max = 0;

    for (let i = 0; i < rows.length; i++) {
      const id = String(rows[i].picking_list_id || '').trim();
      if (id.indexOf(prefix) !== 0) continue;
      const seq = Number(id.slice(prefix.length));
      if (Number.isFinite(seq) && seq > max) max = seq;
    }

    return prefix + String(max + 1).padStart(3, '0');
  }

  function nextPickingLineId_(pickingListId, lineNumber) {
    return pickingListId + '-L' + String(lineNumber).padStart(3, '0');
  }

})();
