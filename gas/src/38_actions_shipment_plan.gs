/** Shipment plan import + preview actions */

(function initShipmentPlanActions_(){

  function toStr_(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function toIntStrict_(value) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (!/^-?\d+$/.test(trimmed)) return null;
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed)) return null;
      return parsed;
    }
    return null;
  }

  function parseDateOnly_(value) {
    const text = toStr_(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return text;
  }

  function normalizePayload_(payload) {
    const tz = toStr_(payload && payload.tz) || 'Europe/Moscow';
    const mode = toStr_(payload && payload.mode).toLowerCase() || 'commit';
    const rowsRaw = payload && Array.isArray(payload.rows) ? payload.rows : [];
    const planDate = parseDateOnly_(payload && payload.plan_date) || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const defaultShipmentId = toStr_(payload && payload.shipment_id);

    const fields = [];
    const normalizedRows = [];

    if (mode !== 'commit' && mode !== 'dry_run') {
      fields.push({ field: 'mode', message: "Field 'mode' must be 'commit' or 'dry_run'" });
    }

    if (!parseDateOnly_(planDate)) {
      fields.push({ field: 'plan_date', message: "Field 'plan_date' must be YYYY-MM-DD" });
    }

    for (let i = 0; i < rowsRaw.length; i++) {
      const row = rowsRaw[i] || {};
      const shipmentId = toStr_(row.shipment_id) || defaultShipmentId;
      const shipDate = parseDateOnly_(row.ship_date);
      const destination = toStr_(row.destination);
      const skuId = toStr_(row.sku_id);
      const qty = toIntStrict_(row.qty);
      const comment = toStr_(row.comment);

      if (!shipmentId) fields.push({ field: `rows[${i}].shipment_id`, message: 'shipment_id is required' });
      if (!shipDate) fields.push({ field: `rows[${i}].ship_date`, message: 'ship_date must be YYYY-MM-DD' });
      if (!destination) fields.push({ field: `rows[${i}].destination`, message: 'destination is required' });
      if (!skuId) fields.push({ field: `rows[${i}].sku_id`, message: 'sku_id is required' });
      if (qty === null || qty <= 0) fields.push({ field: `rows[${i}].qty`, message: 'qty must be integer > 0' });

      normalizedRows.push({
        shipment_id: shipmentId,
        ship_date: shipDate || '',
        destination,
        sku_id: skuId,
        qty: qty === null ? 0 : qty,
        comment,
      });
    }

    if (fields.length > 0) {
      throw new Error('BAD_REQUEST: Invalid shipment plan import payload | ' + JSON.stringify({ fields: fields }));
    }

    return {
      tz,
      plan_date: planDate,
      mode,
      rows: normalizedRows,
    };
  }

  function aggregateStats_(rows) {
    const shipmentSet = {};
    for (let i = 0; i < rows.length; i++) {
      shipmentSet[rows[i].shipment_id] = true;
    }

    return {
      rows: rows.length,
      shipments: Object.keys(shipmentSet).length,
      lines: rows.length,
    };
  }

  function buildLineRollup_(rows) {
    const byKey = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const key = row.shipment_id + '::' + row.sku_id;
      if (!byKey[key]) {
        byKey[key] = {
          shipment_id: row.shipment_id,
          sku_id: row.sku_id,
          qty: 0,
        };
      }
      byKey[key].qty += row.qty;
    }

    return Object.keys(byKey).map((k) => byKey[k]);
  }

  function upsertPlanRows_(rows) {
    const existing = Db_.readAll_(SHEET.SHIPMENT_PLAN);
    const existingByKey = {};
    for (let i = 0; i < existing.length; i++) {
      const row = existing[i];
      const key = [toStr_(row.shipment_id), toStr_(row.ship_date), toStr_(row.destination)].join('::');
      existingByKey[key] = true;
    }

    const seenBatch = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const key = [row.shipment_id, row.ship_date, row.destination].join('::');
      if (existingByKey[key] || seenBatch[key]) continue;

      Db_.append_(SHEET.SHIPMENT_PLAN, {
        shipment_id: row.shipment_id,
        ship_date: row.ship_date,
        destination: row.destination,
        status: 'planned',
      });
      seenBatch[key] = true;
    }
  }

  function upsertLineRows_(lineRollup) {
    const existing = Db_.readAll_(SHEET.SHIPMENT_LINES);
    const existingMap = {};

    for (let i = 0; i < existing.length; i++) {
      const row = existing[i];
      const key = toStr_(row.shipment_id) + '::' + toStr_(row.sku_id);
      const qty = toIntStrict_(row.qty || row.planned_qty || 0) || 0;
      existingMap[key] = { row: row, qty: qty };
    }

    for (let i = 0; i < lineRollup.length; i++) {
      const line = lineRollup[i];
      const key = line.shipment_id + '::' + line.sku_id;
      const found = existingMap[key];

      if (!found) {
        Db_.append_(SHEET.SHIPMENT_LINES, {
          shipment_id: line.shipment_id,
          sku_id: line.sku_id,
          qty: line.qty,
          planned_qty: line.qty,
          status: 'planned',
        });
        continue;
      }

      const nextQty = found.qty + line.qty;
      const patched = {
        qty: nextQty,
        planned_qty: nextQty,
      };

      if (toStr_(found.row.line_id)) {
        Db_.updateByPk_(SHEET.SHIPMENT_LINES, 'line_id', toStr_(found.row.line_id), patched);
        continue;
      }

      if (toStr_(found.row.id)) {
        Db_.updateByPk_(SHEET.SHIPMENT_LINES, 'id', toStr_(found.row.id), patched);
        continue;
      }

      Db_.append_(SHEET.SHIPMENT_LINES, {
        shipment_id: line.shipment_id,
        sku_id: line.sku_id,
        qty: nextQty,
        planned_qty: nextQty,
        status: 'planned',
      });
    }
  }

  function findReplayByRequestId_(requestId) {
    const rows = Db_.query_(SHEET.SHIPMENT_PLAN_IMPORT, function(row) {
      return toStr_(row.request_id) === toStr_(requestId);
    });

    if (!rows || rows.length === 0) return null;

    const importId = toStr_(rows[0].import_id) || uuid_();
    const normRows = rows.map(function(r) {
      return {
        shipment_id: toStr_(r.shipment_id),
        ship_date: toStr_(r.ship_date),
        destination: toStr_(r.destination),
        sku_id: toStr_(r.sku_id),
        qty: toIntStrict_(r.qty) || 0,
        comment: toStr_(r.comment),
      };
    });

    return {
      replayed: true,
      import_id: importId,
      stats: aggregateStats_(normRows),
      tz: toStr_(rows[0].tz) || 'Europe/Moscow',
      generated_at: nowIso_(),
    };
  }

  function appendImportRows_(normalized, requestId, importId, actorId, importedAt) {
    for (let i = 0; i < normalized.rows.length; i++) {
      const row = normalized.rows[i];
      Db_.append_(SHEET.SHIPMENT_PLAN_IMPORT, {
        import_id: importId,
        imported_at: importedAt,
        imported_by: actorId,
        request_id: requestId,
        status: 'staged',
        shipment_id: row.shipment_id,
        ship_date: row.ship_date,
        destination: row.destination,
        sku_id: row.sku_id,
        qty: row.qty,
        comment: row.comment,
        plan_date: normalized.plan_date,
        tz: normalized.tz,
      });
    }
  }

  function markImportCommitted_(importId, committedAt) {
    const rows = Db_.query_(SHEET.SHIPMENT_PLAN_IMPORT, function(row) {
      return toStr_(row.import_id) === importId;
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (toStr_(row.id)) {
        Db_.updateByPk_(SHEET.SHIPMENT_PLAN_IMPORT, 'id', toStr_(row.id), { status: 'committed', committed_at: committedAt });
      }
    }
  }

  Actions_.register_('shipment_plan.import', (ctx)=>{
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER]);

    const normalized = normalizePayload_(ctx.payload || {});
    const stats = aggregateStats_(normalized.rows);

    if (normalized.mode === 'dry_run') {
      return {
        ok: true,
        dry_run: true,
        stats,
        normalized_preview: normalized.rows.slice(0, 200),
        tz: normalized.tz,
        generated_at: nowIso_(),
      };
    }

    const replay = findReplayByRequestId_(ctx.requestId);
    if (replay) {
      return replay;
    }

    const importId = uuid_();
    const importedAt = nowIso_();
    const actorId = toStr_(ctx.actor && (ctx.actor.id || ctx.actor.name)) || 'owner';

    appendImportRows_(normalized, ctx.requestId, importId, actorId, importedAt);
    upsertPlanRows_(normalized.rows);
    upsertLineRows_(buildLineRollup_(normalized.rows));
    markImportCommitted_(importId, nowIso_());

    return {
      ok: true,
      replayed: false,
      import_id: importId,
      stats,
      tz: normalized.tz,
      generated_at: nowIso_(),
    };
  });

  Actions_.register_('shipment_plan.preview', (ctx)=>{
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER]);

    const payload = ctx.payload || {};
    const tz = toStr_(payload.tz) || 'Europe/Moscow';
    const daysRaw = toIntStrict_(payload.days);
    const days = daysRaw && daysRaw > 0 ? daysRaw : 14;

    const today = new Date();
    const fromDate = Utilities.formatDate(today, tz, 'yyyy-MM-dd');
    const toDate = Utilities.formatDate(new Date(today.getTime() + (days - 1) * 24 * 60 * 60 * 1000), tz, 'yyyy-MM-dd');

    const planRows = Db_.readAll_(SHEET.SHIPMENT_PLAN);
    const lineRows = Db_.readAll_(SHEET.SHIPMENT_LINES);

    const linesByShipment = {};
    for (let i = 0; i < lineRows.length; i++) {
      const row = lineRows[i];
      const shipmentId = toStr_(row.shipment_id);
      if (!shipmentId) continue;
      const qty = toIntStrict_(row.qty || row.planned_qty || 0) || 0;
      if (!linesByShipment[shipmentId]) {
        linesByShipment[shipmentId] = { total_lines: 0, total_qty: 0 };
      }
      linesByShipment[shipmentId].total_lines += 1;
      linesByShipment[shipmentId].total_qty += qty;
    }

    const shipments = [];
    for (let i = 0; i < planRows.length; i++) {
      const row = planRows[i];
      const shipDate = parseDateOnly_(row.ship_date);
      if (!shipDate) continue;
      if (shipDate < fromDate || shipDate > toDate) continue;

      const shipmentId = toStr_(row.shipment_id);
      if (!shipmentId) continue;

      const agg = linesByShipment[shipmentId] || { total_lines: 0, total_qty: 0 };
      shipments.push({
        shipment_id: shipmentId,
        ship_date: shipDate,
        destination: toStr_(row.destination),
        total_lines: agg.total_lines,
        total_qty: agg.total_qty,
        status: toStr_(row.status) || 'planned',
      });
    }

    return {
      ok: true,
      tz,
      window: {
        from_date: fromDate,
        to_date: toDate,
        days,
      },
      shipments,
      lines_sample: lineRows.slice(0, 20),
    };
  });

})();
