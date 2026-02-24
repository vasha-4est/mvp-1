/** Picking actions (Phase A). */

(function initPickingActions_(){

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

})();
