(function initControlTowerReadActions_() {
  const LOW_STOCK_THRESHOLD = 5;
  const TOP_LIMIT = 10;
  const RECENT_EVENTS_LIMIT = 20;
  const LOCK_SAMPLE_LIMIT = 10;
  const TOP_SHORT_SKU_LIMIT = 5;

  Actions_.register_('control_tower.read', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);

    const inventoryRows = safeReadAll_(SHEET.INVENTORY);
    const incidentsRows = safeReadAll_('incidents');
    const locksRows = safeReadAll_(SHEET.LOCKS);
    const eventsRows = safeReadAll_(SHEET.EVENTS);
    const pickingListRows = safeReadAll_(SHEET.PICKING_LISTS);
    const pickingLineRows = safeReadAll_(SHEET.PICKING_LINES);
    const shipmentRows = safeReadAll_(SHEET.SHIPMENTS);
    const shipmentLineRows = safeReadAll_(SHEET.SHIPMENT_LINES);

    const inventory = summarizeInventory_(inventoryRows);
    const incidents = summarizeIncidents_(incidentsRows);
    const locks = summarizeLocks_(locksRows);
    const recentEvents = summarizeRecentEvents_(eventsRows);
    const picking = summarizePicking_(pickingListRows, pickingLineRows);
    const shipmentsReadiness = summarizeShipmentsReadiness_(shipmentRows, shipmentLineRows, inventoryRows);
    const deficit = summarizeDeficit_(pickingListRows, pickingLineRows, shipmentRows, shipmentLineRows, incidentsRows);

    return {
      ok: true,
      generated_at: nowIso_(),
      sections: {
        deficit,
        shipments_readiness: shipmentsReadiness,
        inventory,
        picking,
        incidents,
        locks,
        recent_events: recentEvents,
      },
    };
  });

  function safeReadAll_(sheetName) {
    try {
      return Db_.readAll_(sheetName);
    } catch (_err) {
      return [];
    }
  }

  function summarizeInventory_(rows) {
    const normalized = [];
    let updatedAtMax = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const skuId = asString_(row.sku_id);
      const locationId = asString_(row.location_id);
      const availableQty = asNumber_(row.available_qty, 0);
      const reservedQty = asNumber_(row.reserved_qty, 0);

      const updatedAt = parseDateMs_(row.updated_at);
      if (updatedAt !== null && (updatedAtMax === null || updatedAt > updatedAtMax)) {
        updatedAtMax = updatedAt;
      }

      if (!skuId || !locationId) continue;

      normalized.push({ sku_id: skuId, location_id: locationId, available_qty: availableQty, reserved_qty: reservedQty });
    }

    const byAvailable = normalized
      .slice()
      .sort((left, right) => right.available_qty - left.available_qty)
      .slice(0, TOP_LIMIT)
      .map((item) => ({ sku_id: item.sku_id, location_id: item.location_id, available_qty: item.available_qty }));

    const byReserved = normalized
      .slice()
      .sort((left, right) => right.reserved_qty - left.reserved_qty)
      .slice(0, TOP_LIMIT)
      .map((item) => ({ sku_id: item.sku_id, location_id: item.location_id, reserved_qty: item.reserved_qty }));

    const lowStock = normalized
      .filter((item) => item.available_qty <= LOW_STOCK_THRESHOLD)
      .sort((left, right) => left.available_qty - right.available_qty)
      .slice(0, TOP_LIMIT)
      .map((item) => ({ sku_id: item.sku_id, location_id: item.location_id, available_qty: item.available_qty }));

    return {
      top_available: byAvailable,
      top_reserved: byReserved,
      low_stock: lowStock,
      updated_at_max: updatedAtMax === null ? null : new Date(updatedAtMax).toISOString(),
    };
  }

  function summarizeIncidents_(rows) {
    let openTotal = 0;
    const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
    const byZone = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const status = asLower_(row.status);
      if (status === 'closed') continue;

      openTotal += 1;

      const severity = asLower_(row.severity);
      if (severity === 'low' || severity === 'medium' || severity === 'high' || severity === 'critical') {
        bySeverity[severity] += 1;
      } else {
        bySeverity.low += 1;
      }

      const zone = asString_(row.zone) || 'unknown';
      byZone[zone] = (byZone[zone] || 0) + 1;
    }

    return { open_total: openTotal, by_severity: bySeverity, by_zone: byZone };
  }

  function summarizeLocks_(rows) {
    const nowMs = Date.now();
    const byEntityType = {};
    const active = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const status = asLower_(row.status);
      if (status && status !== 'active') continue;

      const expiresMs = parseDateMs_(row.expires_at);
      if (expiresMs !== null && expiresMs < nowMs) continue;

      const entityType = asString_(row.entity_type) || 'unknown';
      byEntityType[entityType] = (byEntityType[entityType] || 0) + 1;

      const acquiredMs = parseDateMs_(row.acquired_at);
      active.push({
        lock_key: asString_(row.lock_key),
        entity_type: entityType,
        entity_id: asString_(row.entity_id),
        held_by_role_id: asString_(row.held_by_role_id),
        acquired_at: acquiredMs === null ? asString_(row.acquired_at) : new Date(acquiredMs).toISOString(),
        expires_at: expiresMs === null ? asString_(row.expires_at) : new Date(expiresMs).toISOString(),
        status: asString_(row.status) || 'active',
        _sort_ms: acquiredMs === null ? -1 : acquiredMs,
      });
    }

    active.sort((left, right) => right._sort_ms - left._sort_ms);

    const sample = active.slice(0, LOCK_SAMPLE_LIMIT).map((item) => ({
      lock_key: item.lock_key,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      held_by_role_id: item.held_by_role_id,
      acquired_at: item.acquired_at,
      expires_at: item.expires_at,
      status: item.status,
    }));

    return {
      active_total: active.length,
      by_entity_type: byEntityType,
      sample,
    };
  }

  function summarizeRecentEvents_(rows) {
    const normalized = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const createdMs = parseDateMs_(row.created_at || row.at || row.ts);
      normalized.push({
        event_id: asString_(row.event_id || row.id),
        event_type: asString_(row.event_type || row.event_name || row.type),
        entity_type: asString_(row.entity_type),
        entity_id: asString_(row.entity_id),
        created_at: createdMs === null ? asString_(row.created_at || row.at || row.ts) : new Date(createdMs).toISOString(),
        actor_role_id: asString_(row.actor_role_id || row.role_id),
        request_id: asString_(row.request_id),
        _sort_ms: createdMs === null ? -1 : createdMs,
      });
    }

    normalized.sort((left, right) => right._sort_ms - left._sort_ms);

    return normalized.slice(0, RECENT_EVENTS_LIMIT).map((item) => ({
      event_id: item.event_id,
      event_type: item.event_type,
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      created_at: item.created_at,
      actor_role_id: item.actor_role_id,
      request_id: item.request_id,
    }));
  }

  function summarizePicking_(listRows, lineRows) {
    const openMap = {};
    let lastCreatedMs = null;

    for (let i = 0; i < listRows.length; i++) {
      const row = listRows[i] || {};
      const listId = asString_(row.picking_list_id || row.list_id || row.id);
      if (!listId) continue;

      const status = asLower_(row.status);
      if (status !== 'open' && status !== 'new') {
        continue;
      }

      openMap[listId] = true;
      const createdMs = parseDateMs_(row.created_at);
      if (createdMs !== null && (lastCreatedMs === null || createdMs > lastCreatedMs)) {
        lastCreatedMs = createdMs;
      }
    }

    let openLines = 0;
    if (lineRows.length > 0) {
      for (let i = 0; i < lineRows.length; i++) {
        const row = lineRows[i] || {};
        const listId = asString_(row.picking_list_id || row.list_id || row.picking_id);
        if (listId && openMap[listId]) {
          openLines += 1;
        }
      }
    }

    return {
      open_lists: Object.keys(openMap).length,
      open_lines: lineRows.length > 0 ? openLines : null,
      last_created_at: lastCreatedMs === null ? null : new Date(lastCreatedMs).toISOString(),
    };
  }

  function summarizeShipmentsReadiness_(shipments, lines, inventoryRows) {
    if (!shipments.length) {
      return [];
    }

    const reservedBySku = {};
    for (let i = 0; i < inventoryRows.length; i++) {
      const row = inventoryRows[i] || {};
      const skuId = asString_(row.sku_id);
      if (!skuId) continue;
      reservedBySku[skuId] = (reservedBySku[skuId] || 0) + asNumber_(row.reserved_qty, 0);
    }

    const linesByShipment = {};
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i] || {};
      const shipmentId = asString_(row.shipment_id);
      if (!shipmentId) continue;
      if (!linesByShipment[shipmentId]) linesByShipment[shipmentId] = [];
      linesByShipment[shipmentId].push(row);
    }

    const items = [];
    for (let i = 0; i < shipments.length; i++) {
      const shipment = shipments[i] || {};
      const shipmentId = asString_(shipment.shipment_id || shipment.id);
      if (!shipmentId) continue;

      const status = asLower_(shipment.status);
      if (status === 'closed' || status === 'done' || status === 'shipped') continue;

      const shipmentLines = linesByShipment[shipmentId] || [];
      let totalPlannedQty = 0;
      let totalReadyQty = 0;

      for (let j = 0; j < shipmentLines.length; j++) {
        const line = shipmentLines[j] || {};
        const plannedQty = Math.max(0, asNumber_(line.planned_qty, 0));
        const readyFromLine = asNumber_(line.picked_qty, NaN);
        const readyQty = Number.isFinite(readyFromLine)
          ? Math.max(0, Math.min(plannedQty, readyFromLine))
          : Math.max(0, Math.min(plannedQty, asNumber_(reservedBySku[asString_(line.sku_id)], 0)));

        totalPlannedQty += plannedQty;
        totalReadyQty += readyQty;
      }

      const totalMissingQty = Math.max(0, totalPlannedQty - totalReadyQty);
      const readinessPercent = totalPlannedQty === 0 ? 0 : Math.floor((totalReadyQty / totalPlannedQty) * 100);
      const readinessStatus = totalReadyQty === 0 ? 'BLOCKED' : totalMissingQty === 0 ? 'READY' : 'PARTIAL';

      items.push({
        shipment_id: shipmentId,
        status: readinessStatus,
        readiness_percent: readinessPercent,
        total_planned_qty: totalPlannedQty,
        total_ready_qty: totalReadyQty,
        total_missing_qty: totalMissingQty,
      });
    }

    items.sort((left, right) => right.readiness_percent - left.readiness_percent);
    return items.slice(0, TOP_LIMIT);
  }

  function summarizeDeficit_(pickingLists, pickingLines, shipments, shipmentLines, incidentsRows) {
    const openPickingMap = toOpenMap_(pickingLists, ['done', 'completed', 'closed', 'cancelled', 'canceled'], 'picking_list_id');
    const openShipmentMap = toOpenMap_(shipments, ['done', 'shipped', 'closed', 'cancelled', 'canceled'], 'shipment_id');

    let pickingOpenLines = 0;
    let pickingTotalShortQty = 0;
    let shipmentOpenLines = 0;
    let shipmentTotalMissingQty = 0;
    const skuTotals = {};

    for (let i = 0; i < pickingLines.length; i++) {
      const row = pickingLines[i] || {};
      const listId = asString_(row.picking_list_id || row.list_id || row.picking_id);
      if (listId && !openPickingMap[listId]) continue;

      const planned = asNumber_(row.planned_qty, asNumber_(row.qty_required, 0));
      const picked = asNumber_(row.picked_qty, asNumber_(row.qty_picked, 0));
      const missing = Math.max(planned - picked, 0);

      if (!(missing > 0)) continue;

      pickingOpenLines += 1;
      pickingTotalShortQty += missing;

      const skuId = asString_(row.sku_id);
      if (skuId) {
        skuTotals[skuId] = (skuTotals[skuId] || 0) + missing;
      }
    }

    for (let i = 0; i < shipmentLines.length; i++) {
      const row = shipmentLines[i] || {};
      const shipmentId = asString_(row.shipment_id);
      if (shipmentId && !openShipmentMap[shipmentId]) continue;

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
      .slice(0, TOP_SHORT_SKU_LIMIT);

    let openIncidents = 0;
    for (let i = 0; i < incidentsRows.length; i++) {
      const status = asLower_(incidentsRows[i] && incidentsRows[i].status);
      if (status !== 'closed') {
        openIncidents += 1;
      }
    }

    return {
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
      incidents: {
        open_total: openIncidents,
      },
    };
  }

  function toOpenMap_(rows, closedStatuses, idKey) {
    const closed = {};
    for (let i = 0; i < closedStatuses.length; i++) closed[closedStatuses[i]] = true;

    const map = {};
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const id = asString_(row[idKey] || row.id);
      if (!id) continue;

      const status = asLower_(row.status || row.task_status);
      if (status && closed[status]) continue;

      map[id] = true;
    }

    return map;
  }

  function parseDateMs_(value) {
    const text = asString_(value);
    if (!text) return null;
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? ms : null;
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
