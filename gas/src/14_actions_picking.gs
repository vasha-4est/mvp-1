/** Picking actions (Phase A). */

(function initPickingActions_(){
  const SERVICE_TIMEZONE = 'Europe/Moscow';
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
