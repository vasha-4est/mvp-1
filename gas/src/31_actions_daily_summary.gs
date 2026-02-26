(function initDailySummaryActions_() {
  const DEFAULT_DAYS = 2;
  const MAX_DAYS = 7;
  const DEFAULT_TZ = 'UTC';

  const CLOSED_INCIDENT_STATUSES = {
    closed: true,
    resolved: true,
    done: true,
    cancelled: true,
    canceled: true,
  };

  const CLOSED_PICKING_STATUSES = {
    done: true,
    completed: true,
    closed: true,
    cancelled: true,
    canceled: true,
  };

  const CLOSED_SHIPMENT_STATUSES = {
    done: true,
    completed: true,
    shipped: true,
    closed: true,
    cancelled: true,
    canceled: true,
  };

  Actions_.register_('daily.summary.get', (ctx) => {
    const payload = (ctx && ctx.payload) ? ctx.payload : {};
    const days = normalizeDays_(payload.days);
    const tz = normalizeTz_(payload.tz);

    const dayKeys = buildDayKeys_(days, tz);
    const fromDate = dayKeys.length > 0 ? dayKeys[0] : formatDay_(new Date(), tz);
    const toDate = dayKeys.length > 0 ? dayKeys[dayKeys.length - 1] : fromDate;

    const inventoryMoves = safeReadAll_(SHEET.INVENTORY_MOVES);
    const incidents = safeReadAll_('incidents');
    const eventsLog = safeReadAll_(SHEET.EVENTS);
    const shipments = safeReadAll_(SHEET.SHIPMENTS);
    const pickingLists = safeReadAll_(SHEET.PICKING_LISTS);

    const dailyMap = initDailyMap_(dayKeys);

    accumulateInventoryMoves_(dailyMap, inventoryMoves, tz);
    accumulateEvents_(dailyMap, eventsLog, tz);
    accumulateIncidents_(dailyMap, incidents, tz);

    const daysOut = dayKeys.map((day) => {
      const row = dailyMap[day] || emptyDayStats_();
      return {
        date: day,
        metrics: {
          inventory_moves_qty: row.metrics.inventory_moves_qty,
          inventory_moves_count: row.metrics.inventory_moves_count,
          incidents_opened: row.metrics.incidents_opened,
          incidents_closed: row.metrics.incidents_closed,
          incidents_open_now: computeIncidentsOpenOnDay_(incidents, day, tz),
          picking_confirmed_events: row.metrics.picking_confirmed_events,
          batches_created_events: row.metrics.batches_created_events,
        },
        highlights: {
          top_incident_zones: topItems_(row.incidentZones, 'zone'),
          top_moved_skus: topItems_(row.movedSkus, 'sku_id', true),
        },
      };
    });

    return {
      ok: true,
      generated_at: nowIso_(),
      tz,
      window: {
        from_date: fromDate,
        to_date: toDate,
      },
      days: daysOut,
      now: {
        open_incidents: summarizeOpenIncidentsNow_(incidents).open_incidents,
        open_incidents_by_severity: summarizeOpenIncidentsNow_(incidents).open_incidents_by_severity,
        shipments_open: countOpenRows_(shipments, CLOSED_SHIPMENT_STATUSES),
        picking_open_lists: countOpenRows_(pickingLists, CLOSED_PICKING_STATUSES),
      },
    };
  });

  function normalizeDays_(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
    return Math.min(Math.floor(parsed), MAX_DAYS);
  }

  function normalizeTz_(raw) {
    const tz = String(raw || '').trim();
    if (!tz) return DEFAULT_TZ;

    try {
      Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
      return tz;
    } catch (_err) {
      return DEFAULT_TZ;
    }
  }

  function safeReadAll_(sheetName) {
    try {
      return Db_.readAll_(sheetName);
    } catch (_err) {
      return [];
    }
  }

  function formatDay_(date, tz) {
    return Utilities.formatDate(date, tz, 'yyyy-MM-dd');
  }

  function buildDayKeys_(days, tz) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      out.push(formatDay_(d, tz));
    }
    return out;
  }

  function parseDate_(value) {
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  function asString_(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function asLower_(value) {
    return asString_(value).toLowerCase();
  }

  function asNumber_(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function initDailyMap_(dayKeys) {
    const out = {};
    for (let i = 0; i < dayKeys.length; i++) {
      out[dayKeys[i]] = emptyDayStats_();
    }
    return out;
  }

  function emptyDayStats_() {
    return {
      metrics: {
        inventory_moves_qty: 0,
        inventory_moves_count: 0,
        incidents_opened: 0,
        incidents_closed: 0,
        picking_confirmed_events: 0,
        batches_created_events: 0,
      },
      incidentZones: {},
      movedSkus: {},
    };
  }

  function accumulateInventoryMoves_(dailyMap, rows, tz) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const dt = parseDate_(row.created_at);
      if (!dt) continue;

      const day = formatDay_(dt, tz);
      const bucket = dailyMap[day];
      if (!bucket) continue;

      const qty = asNumber_(row.qty);
      bucket.metrics.inventory_moves_count += 1;
      bucket.metrics.inventory_moves_qty += qty;

      const skuId = asString_(row.sku_id);
      if (skuId) {
        bucket.movedSkus[skuId] = (bucket.movedSkus[skuId] || 0) + qty;
      }
    }
  }

  function accumulateEvents_(dailyMap, rows, tz) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const dt = parseDate_(row.created_at || row.at || row.ts);
      if (!dt) continue;

      const day = formatDay_(dt, tz);
      const bucket = dailyMap[day];
      if (!bucket) continue;

      const eventType = asLower_(row.event_type || row.event_name);
      if (eventType === 'picking_confirmed') {
        bucket.metrics.picking_confirmed_events += 1;
      }
      if (eventType === 'batch_created') {
        bucket.metrics.batches_created_events += 1;
      }
    }
  }

  function accumulateIncidents_(dailyMap, rows, tz) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};

      const createdAt = parseDate_(row.created_at);
      if (createdAt) {
        const createdDay = formatDay_(createdAt, tz);
        const createdBucket = dailyMap[createdDay];
        if (createdBucket) {
          createdBucket.metrics.incidents_opened += 1;
          const zone = asString_(row.zone) || 'unknown';
          createdBucket.incidentZones[zone] = (createdBucket.incidentZones[zone] || 0) + 1;
        }
      }

      const closedAt = parseDate_(row.closed_at);
      if (closedAt) {
        const closedDay = formatDay_(closedAt, tz);
        const closedBucket = dailyMap[closedDay];
        if (closedBucket) {
          closedBucket.metrics.incidents_closed += 1;
        }
      }
    }
  }

  function computeIncidentsOpenOnDay_(rows, day, tz) {
    let open = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const createdAt = parseDate_(row.created_at);
      if (!createdAt) continue;

      const createdDay = formatDay_(createdAt, tz);
      if (createdDay > day) {
        continue;
      }

      const closedAt = parseDate_(row.closed_at);
      if (closedAt) {
        const closedDay = formatDay_(closedAt, tz);
        if (closedDay <= day) {
          continue;
        }
      }

      const status = asLower_(row.status);
      if (status && CLOSED_INCIDENT_STATUSES[status] && !closedAt) {
        continue;
      }

      open += 1;
    }

    return open;
  }

  function summarizeOpenIncidentsNow_(rows) {
    const severityBuckets = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    let openIncidents = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const status = asLower_(row.status);
      if (status && CLOSED_INCIDENT_STATUSES[status]) {
        continue;
      }
      if (asString_(row.closed_at)) {
        continue;
      }

      openIncidents += 1;
      const severity = asLower_(row.severity);
      if (Object.prototype.hasOwnProperty.call(severityBuckets, severity)) {
        severityBuckets[severity] += 1;
      }
    }

    return {
      open_incidents: openIncidents,
      open_incidents_by_severity: severityBuckets,
    };
  }

  function countOpenRows_(rows, closedStatuses) {
    let count = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const status = asLower_(row.status || row.task_status);
      if (status && closedStatuses[status]) {
        continue;
      }

      count += 1;
    }

    return count;
  }

  function topItems_(map, keyName, absoluteQty) {
    return Object.keys(map || {})
      .map((key) => {
        const value = Number(map[key]) || 0;
        const qty = absoluteQty ? Math.abs(value) : value;
        return { key, qty };
      })
      .filter((item) => item.qty > 0)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map((item) => ({
        [keyName]: item.key,
        count: keyName === 'zone' ? item.qty : undefined,
        qty: keyName === 'sku_id' ? item.qty : undefined,
      }))
      .map((item) => {
        if (keyName === 'zone') {
          return { zone: item.zone, count: item.count };
        }
        return { sku_id: item.sku_id, qty: item.qty };
      });
  }
})();
