(function initKpiThroughputActions_() {
  const DEFAULT_DAYS = 14;
  const MAX_DAYS = 60;

  Actions_.register_('kpi.throughput.get', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);

    const payload = ctx && ctx.payload ? ctx.payload : {};
    const days = normalizeDays_(payload.days);
    const tz = normalizeTz_(payload.tz);

    const toDate = new Date();
    const toDateIso = toDate.toISOString().slice(0, 10);
    const fromDateIso = new Date(toDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const dateRange = buildDateRange_(fromDateIso, toDateIso);
    const byDate = {};

    for (let i = 0; i < dateRange.length; i++) {
      byDate[dateRange[i]] = {
        inventory_moves_qty: 0,
        inventory_moves_count: 0,
        incidents_opened: 0,
        incidents_closed: 0,
        picking_confirmed_lines: 0,
        batches_created: 0,
      };
    }

    const inventoryMoves = safeReadAll_(SHEET.INVENTORY_MOVES);
    const incidents = safeReadAll_('incidents');
    const events = safeReadAll_(SHEET.EVENTS);
    const pickingLines = safeReadAll_(SHEET.PICKING_LINES);
    const batches = safeReadAll_(SHEET.BATCHES);
    const batchRegistry = safeReadAll_('batch_registry');

    const eventPickingByDate = {};
    const eventBatchByDate = {};

    for (let i = 0; i < inventoryMoves.length; i++) {
      const row = inventoryMoves[i] || {};
      const dateKey = isoDate_(row.created_at);
      if (!dateKey || !byDate[dateKey]) continue;

      byDate[dateKey].inventory_moves_qty += asNumber_(row.qty, 0);
      byDate[dateKey].inventory_moves_count += 1;
    }

    for (let i = 0; i < incidents.length; i++) {
      const row = incidents[i] || {};

      const openedDate = isoDate_(row.created_at);
      if (openedDate && byDate[openedDate]) {
        byDate[openedDate].incidents_opened += 1;
      }

      const closedDate = isoDate_(row.closed_at);
      if (closedDate && byDate[closedDate]) {
        byDate[closedDate].incidents_closed += 1;
      }
    }

    for (let i = 0; i < events.length; i++) {
      const row = events[i] || {};
      const eventType = asLower_(row.event_type);
      const dateKey = isoDate_(row.created_at);
      if (!dateKey || !byDate[dateKey]) continue;

      if (eventType === 'picking_confirmed') {
        eventPickingByDate[dateKey] = (eventPickingByDate[dateKey] || 0) + 1;
      }

      if (eventType === 'batch_created') {
        eventBatchByDate[dateKey] = (eventBatchByDate[dateKey] || 0) + 1;
      }
    }

    const fallbackPickingByDate = {};
    for (let i = 0; i < pickingLines.length; i++) {
      const row = pickingLines[i] || {};
      const dateKey = isoDate_(row.done_at || row.confirmed_at || row.updated_at);
      if (!dateKey || !byDate[dateKey]) continue;
      fallbackPickingByDate[dateKey] = (fallbackPickingByDate[dateKey] || 0) + 1;
    }

    const fallbackBatchByDate = {};
    accumulateDateCounts_(fallbackBatchByDate, batches, 'created_at', byDate);
    accumulateDateCounts_(fallbackBatchByDate, batchRegistry, 'created_at', byDate);

    for (let i = 0; i < dateRange.length; i++) {
      const dateKey = dateRange[i];
      const eventPicking = asNumber_(eventPickingByDate[dateKey], 0);
      const eventBatches = asNumber_(eventBatchByDate[dateKey], 0);
      const fallbackPicking = asNumber_(fallbackPickingByDate[dateKey], 0);
      const fallbackBatches = asNumber_(fallbackBatchByDate[dateKey], 0);

      byDate[dateKey].picking_confirmed_lines = eventPicking > 0 ? eventPicking : fallbackPicking;
      byDate[dateKey].batches_created = eventBatches > 0 ? eventBatches : fallbackBatches;
    }

    const totals = {
      inventory_moves_qty: 0,
      inventory_moves_count: 0,
      incidents_opened: 0,
      incidents_closed: 0,
      picking_confirmed_lines: 0,
      batches_created: 0,
    };

    const series = [];
    for (let i = 0; i < dateRange.length; i++) {
      const dateKey = dateRange[i];
      const metrics = byDate[dateKey] || {
        inventory_moves_qty: 0,
        inventory_moves_count: 0,
        incidents_opened: 0,
        incidents_closed: 0,
        picking_confirmed_lines: 0,
        batches_created: 0,
      };

      totals.inventory_moves_qty += metrics.inventory_moves_qty;
      totals.inventory_moves_count += metrics.inventory_moves_count;
      totals.incidents_opened += metrics.incidents_opened;
      totals.incidents_closed += metrics.incidents_closed;
      totals.picking_confirmed_lines += metrics.picking_confirmed_lines;
      totals.batches_created += metrics.batches_created;

      series.push({
        date: dateKey,
        metrics: metrics,
      });
    }

    return {
      ok: true,
      generated_at: nowIso_(),
      from_date: fromDateIso,
      to_date: toDateIso,
      tz: tz,
      series: series,
      totals: totals,
    };
  });

  function normalizeDays_(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
    return Math.min(Math.floor(parsed), MAX_DAYS);
  }

  function normalizeTz_(raw) {
    const text = asString_(raw);
    return text || 'UTC';
  }

  function buildDateRange_(fromIsoDate, toIsoDate) {
    const start = new Date(fromIsoDate + 'T00:00:00.000Z');
    const end = new Date(toIsoDate + 'T00:00:00.000Z');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) {
      return [];
    }

    const dates = [];
    for (let cursor = new Date(start.getTime()); cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
      dates.push(cursor.toISOString().slice(0, 10));
    }

    return dates.slice(0, MAX_DAYS);
  }

  function safeReadAll_(sheetName) {
    try {
      return Db_.readAll_(sheetName);
    } catch (_err) {
      return [];
    }
  }

  function accumulateDateCounts_(targetMap, rows, dateField, rangeMap) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const dateKey = isoDate_(row[dateField]);
      if (!dateKey || !rangeMap[dateKey]) continue;
      targetMap[dateKey] = (targetMap[dateKey] || 0) + 1;
    }
  }

  function isoDate_(value) {
    const text = asString_(value);
    if (!text) return '';

    const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch && isoMatch[1]) {
      return isoMatch[1];
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
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
