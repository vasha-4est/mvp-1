(function initKpiDeficitActions_() {
  const DEFAULT_LIMIT_SHIPMENTS = 10;
  const DEFAULT_LIMIT_PICKING = 50;

  Actions_.register_('kpi.deficit.get', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);
    Validate_.requireFlag_(ctx.flags, FLAG.PICKING_CORE);
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);

    const payload = ctx && ctx.payload ? ctx.payload : {};
    const limitShipments = normalizeLimit_(payload.limit_shipments, DEFAULT_LIMIT_SHIPMENTS, 200);
    const limitPicking = normalizeLimit_(payload.limit_picking, DEFAULT_LIMIT_PICKING, 500);

    const pickingLists = safeReadAll_(SHEET.PICKING_LISTS).slice(0, limitPicking);
    const pickingLines = safeReadAll_(SHEET.PICKING_LINES);
    const shipments = safeReadAll_(SHEET.SHIPMENTS).slice(0, limitShipments);
    const shipmentLines = safeReadAll_(SHEET.SHIPMENT_LINES);
    const incidents = safeReadAll_('incidents');

    const openPickingMap = toOpenEntityMap_(pickingLists, 'picking_list_id', {
      done: true,
      completed: true,
      closed: true,
      cancelled: true,
      canceled: true,
    });

    const openShipmentMap = toOpenEntityMap_(shipments, 'shipment_id', {
      done: true,
      shipped: true,
      closed: true,
      cancelled: true,
      canceled: true,
    });

    const skuTotals = {};
    let pickingOpenLines = 0;
    let pickingTotalShortQty = 0;

    for (let i = 0; i < pickingLines.length; i++) {
      const row = pickingLines[i] || {};
      const pickingListId = asString_(row.picking_list_id || row.list_id || row.picking_id);
      if (pickingListId && !openPickingMap[pickingListId]) {
        continue;
      }

      const planned = asNumber_(row.planned_qty, asNumber_(row.qty_required, 0));
      const picked = asNumber_(row.picked_qty, asNumber_(row.qty_picked, 0));
      const blockedQty = asNumber_(row.qty_blocked, 0);
      const status = asLower_(row.task_status || row.status);

      const missing = Math.max(planned - picked, 0);
      const blockedByStatus = status === 'blocked' || status === 'hold' || status === 'on_hold';
      const isShort = missing > 0 || blockedQty > 0 || blockedByStatus;
      if (!isShort) continue;

      pickingOpenLines += 1;
      pickingTotalShortQty += missing;

      const skuId = asString_(row.sku_id);
      if (skuId) {
        skuTotals[skuId] = (skuTotals[skuId] || 0) + missing;
      }
    }

    let shipmentOpenLines = 0;
    let shipmentTotalMissingQty = 0;

    for (let i = 0; i < shipmentLines.length; i++) {
      const row = shipmentLines[i] || {};
      const shipmentId = asString_(row.shipment_id);
      if (shipmentId && !openShipmentMap[shipmentId]) {
        continue;
      }

      let missing = asNumber_(row.missing_qty, NaN);
      if (!Number.isFinite(missing)) {
        const planned = asNumber_(row.planned_qty, 0);
        const picked = asNumber_(row.picked_qty, 0);
        missing = Math.max(planned - picked, 0);
      }

      if (!(missing > 0)) continue;

      shipmentOpenLines += 1;
      shipmentTotalMissingQty += missing;

      const skuId = asString_(row.sku_id);
      if (skuId) {
        skuTotals[skuId] = (skuTotals[skuId] || 0) + missing;
      }
    }

    const topShortSkus = Object.keys(skuTotals)
      .map((skuId) => ({ sku_id: skuId, missing_qty: Number(skuTotals[skuId]) || 0 }))
      .filter((item) => item.missing_qty > 0)
      .sort((left, right) => right.missing_qty - left.missing_qty)
      .slice(0, 10);

    const incidentsOpen = summarizeOpenIncidents_(incidents);

    return {
      ok: true,
      generated_at: nowIso_(),
      deficit: {
        total_missing_qty: pickingTotalShortQty + shipmentTotalMissingQty,
        top_short_skus: topShortSkus,
        picking: {
          open_lists: Object.keys(openPickingMap).length,
          open_lines: pickingOpenLines,
          total_short_qty: pickingTotalShortQty,
        },
        shipments: {
          open_shipments: Object.keys(openShipmentMap).length,
          open_lines: shipmentOpenLines,
          total_missing_qty: shipmentTotalMissingQty,
        },
      },
      incidents: incidentsOpen,
    };
  });

  function normalizeLimit_(raw, fallback, max) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.min(Math.floor(parsed), max);
  }

  function safeReadAll_(sheetName) {
    try {
      return Db_.readAll_(sheetName);
    } catch (_err) {
      return [];
    }
  }

  function toOpenEntityMap_(rows, idKey, closedStatuses) {
    const map = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const id = asString_(row[idKey]);
      if (!id) continue;

      const status = asLower_(row.status || row.task_status);
      if (status && closedStatuses[status]) continue;

      map[id] = true;
    }

    return map;
  }

  function summarizeOpenIncidents_(rows) {
    let openTotal = 0;
    const byZone = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const status = asLower_(row.status);
      if (status && status !== 'open' && status !== 'new') {
        continue;
      }

      openTotal += 1;
      const zone = asString_(row.zone) || 'unknown';
      byZone[zone] = (byZone[zone] || 0) + 1;
    }

    return {
      open_total: openTotal,
      by_zone: byZone,
    };
  }

  function asString_(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function asLower_(value) {
    return asString_(value).toLowerCase();
  }

  function asNumber_(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }
})();
