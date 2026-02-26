(function initOperationalIntelligenceKpiActions_() {
  const DEFAULT_DAYS = 14;
  const MAX_DAYS = 60;
  const DEFAULT_TZ = 'Europe/Moscow';
  const DEFAULT_OVERDUE_THRESHOLD_MINUTES = 24 * 60;

  const DEFAULT_SHIFTS = [
    { key: 'shift_1', title: 'Shift 1', start: '08:00', end: '16:00' },
    { key: 'shift_2', title: 'Shift 2', start: '16:00', end: '00:00' },
    { key: 'shift_3', title: 'Shift 3', start: '00:00', end: '08:00' },
  ];

  const CLOSED_SHIPMENT_STATUSES = {
    done: true,
    completed: true,
    shipped: true,
    closed: true,
    cancelled: true,
    canceled: true,
  };

  Actions_.register_('kpi.throughput.shifts.get', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);

    const payload = (ctx && ctx.payload) ? ctx.payload : {};
    const days = normalizeDays_(payload.days);
    const tz = normalizeTz_(payload.tz);
    const shifts = normalizeShifts_(payload.shifts);

    const dayKeys = buildDayKeys_(days, tz);
    const fromDate = dayKeys.length ? dayKeys[0] : formatDay_(new Date(), tz);
    const toDate = dayKeys.length ? dayKeys[dayKeys.length - 1] : fromDate;

    const byBucket = {};
    const keyOrder = [];
    for (let i = 0; i < dayKeys.length; i++) {
      const day = dayKeys[i];
      for (let j = 0; j < shifts.length; j++) {
        const shift = shifts[j];
        const key = day + '|' + shift.key;
        keyOrder.push(key);
        byBucket[key] = {
          date: day,
          shift_key: shift.key,
          metrics: {
            inventory_moves_qty: 0,
            inventory_moves_count: 0,
            picking_confirmed_lines: 0,
            batches_created: 0,
            incidents_opened: 0,
            incidents_closed: 0,
          },
        };
      }
    }

    const inventoryMoves = safeReadAll_(SHEET.INVENTORY_MOVES);
    const events = safeReadAll_(SHEET.EVENTS);
    const incidents = safeReadAll_('incidents');

    const eventInventoryByBucket = {};

    for (let i = 0; i < inventoryMoves.length; i++) {
      const row = inventoryMoves[i] || {};
      const bucket = toShiftBucket_(row.created_at, tz, shifts);
      if (!bucket) continue;
      const key = bucket.date + '|' + bucket.shift_key;
      const target = byBucket[key];
      if (!target) continue;

      target.metrics.inventory_moves_count += 1;
      target.metrics.inventory_moves_qty += asNumber_(row.qty, 0);
    }

    for (let i = 0; i < events.length; i++) {
      const row = events[i] || {};
      const eventType = asLower_(row.event_type || row.event_name || row.type);
      const bucket = toShiftBucket_(row.created_at || row.at || row.ts, tz, shifts);
      if (!bucket) continue;

      const key = bucket.date + '|' + bucket.shift_key;
      const target = byBucket[key];
      if (!target) continue;

      if (eventType === 'picking_confirmed') {
        target.metrics.picking_confirmed_lines += 1;
      }

      if (eventType === 'batch_created') {
        target.metrics.batches_created += 1;
      }

      if (eventType === 'incident_opened' || eventType === 'incident_created') {
        target.metrics.incidents_opened += 1;
      }

      if (eventType === 'incident_closed' || eventType === 'incident_resolved') {
        target.metrics.incidents_closed += 1;
      }

      if (eventType === 'inventory.move' || eventType === 'inventory_moved' || eventType === 'inventory_move') {
        eventInventoryByBucket[key] = eventInventoryByBucket[key] || { qty: 0, count: 0 };
        eventInventoryByBucket[key].count += 1;

        const payloadJson = parsePayloadJson_(row.payload_json);
        const qty = asNumber_(payloadJson.qty, asNumber_(payloadJson.quantity, asNumber_(payloadJson.delta_qty, 0)));
        eventInventoryByBucket[key].qty += qty;
      }
    }

    // fallback when inventory_moves is empty for a bucket
    for (let i = 0; i < keyOrder.length; i++) {
      const key = keyOrder[i];
      const target = byBucket[key];
      if (!target) continue;
      if (target.metrics.inventory_moves_count > 0) continue;

      const eventInv = eventInventoryByBucket[key];
      if (!eventInv) continue;
      target.metrics.inventory_moves_count = asNumber_(eventInv.count, 0);
      target.metrics.inventory_moves_qty = asNumber_(eventInv.qty, 0);
    }

    // fallback incidents from incidents table when explicit events are missing
    for (let i = 0; i < incidents.length; i++) {
      const row = incidents[i] || {};

      const createdBucket = toShiftBucket_(row.created_at, tz, shifts);
      if (createdBucket) {
        const key = createdBucket.date + '|' + createdBucket.shift_key;
        const target = byBucket[key];
        if (target && target.metrics.incidents_opened === 0) {
          target.metrics.incidents_opened += 1;
        }
      }

      const closedBucket = toShiftBucket_(row.closed_at, tz, shifts);
      if (closedBucket) {
        const key = closedBucket.date + '|' + closedBucket.shift_key;
        const target = byBucket[key];
        if (target && target.metrics.incidents_closed === 0) {
          target.metrics.incidents_closed += 1;
        }
      }
    }

    const series = [];
    for (let i = 0; i < keyOrder.length; i++) {
      const key = keyOrder[i];
      if (byBucket[key]) {
        series.push(byBucket[key]);
      }
    }

    return {
      ok: true,
      generated_at: nowIso_(),
      tz,
      window: {
        from_date: fromDate,
        to_date: toDate,
      },
      shifts,
      series,
      grouped_series: buildGroupedSeries_(series, dayKeys, shifts),
    };
  });

  Actions_.register_('kpi.shipments.sla.get', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);

    const payload = (ctx && ctx.payload) ? ctx.payload : {};
    const days = normalizeDays_(payload.days);
    const tz = normalizeTz_(payload.tz);
    const overdueThresholdMinutes = normalizeThresholdMinutes_(payload.overdue_threshold_minutes);

    const dayKeys = buildDayKeys_(days, tz);
    const fromDate = dayKeys.length ? dayKeys[0] : formatDay_(new Date(), tz);
    const toDate = dayKeys.length ? dayKeys[dayKeys.length - 1] : fromDate;

    const events = safeReadAll_(SHEET.EVENTS);
    const shipments = safeReadAll_(SHEET.SHIPMENTS);

    const dayStats = {};
    for (let i = 0; i < dayKeys.length; i++) {
      dayStats[dayKeys[i]] = {
        shipments_open: 0,
        shipments_dispatched: 0,
        durations: [],
      };
    }

    const readyAtByShipment = {};
    const dispatchedAtByShipment = {};

    for (let i = 0; i < shipments.length; i++) {
      const row = shipments[i] || {};
      const shipmentId = asString_(row.shipment_id || row.id);
      if (!shipmentId) continue;

      const readyAt = parseDate_(row.ready_at || row.readiness_at || row.ready_timestamp || row.ready_ts);
      if (readyAt) {
        readyAtByShipment[shipmentId] = readyAt;
      }

      const status = asLower_(row.status);
      if (!CLOSED_SHIPMENT_STATUSES[status]) {
        const createdAt = parseDate_(row.created_at) || new Date();
        const day = formatDay_(createdAt, tz);
        if (dayStats[day]) {
          dayStats[day].shipments_open += 1;
        }
      }
    }

    for (let i = 0; i < events.length; i++) {
      const row = events[i] || {};
      const eventType = asLower_(row.event_type || row.event_name || row.type);
      const createdAt = parseDate_(row.created_at || row.at || row.ts);
      if (!createdAt) continue;

      const shipmentId = asString_(row.entity_id || row.shipment_id || extractShipmentIdFromPayload_(row.payload_json));
      if (!shipmentId) continue;

      if (eventType === 'shipment_ready' || eventType === 'ship_ready') {
        if (!readyAtByShipment[shipmentId] || createdAt.getTime() < readyAtByShipment[shipmentId].getTime()) {
          readyAtByShipment[shipmentId] = createdAt;
        }
      }

      if (eventType === 'ship_dispatched') {
        if (!dispatchedAtByShipment[shipmentId] || createdAt.getTime() < dispatchedAtByShipment[shipmentId].getTime()) {
          dispatchedAtByShipment[shipmentId] = createdAt;
        }
      }
    }

    const shipmentIds = unionKeys_(readyAtByShipment, dispatchedAtByShipment);
    for (let i = 0; i < shipmentIds.length; i++) {
      const shipmentId = shipmentIds[i];
      const dispatchedAt = dispatchedAtByShipment[shipmentId] || null;
      const readyAt = readyAtByShipment[shipmentId] || null;

      if (dispatchedAt) {
        const dispatchDay = formatDay_(dispatchedAt, tz);
        const bucket = dayStats[dispatchDay];
        if (bucket) {
          bucket.shipments_dispatched += 1;

          if (readyAt) {
            const minutes = Math.max(0, Math.round((dispatchedAt.getTime() - readyAt.getTime()) / 60000));
            bucket.durations.push(minutes);
          }
        }
      }
    }

    let overdueShipments = 0;
    const now = new Date();
    for (let i = 0; i < shipments.length; i++) {
      const row = shipments[i] || {};
      const shipmentId = asString_(row.shipment_id || row.id);
      if (!shipmentId) continue;

      if (dispatchedAtByShipment[shipmentId]) {
        continue;
      }

      const status = asLower_(row.status);
      if (CLOSED_SHIPMENT_STATUSES[status]) {
        continue;
      }

      const readyAt = readyAtByShipment[shipmentId] || null;
      if (!readyAt) continue;

      const ageMinutes = Math.max(0, Math.round((now.getTime() - readyAt.getTime()) / 60000));
      if (ageMinutes > overdueThresholdMinutes) {
        overdueShipments += 1;
      }
    }

    const series = [];
    for (let i = 0; i < dayKeys.length; i++) {
      const day = dayKeys[i];
      const bucket = dayStats[day] || { shipments_open: 0, shipments_dispatched: 0, durations: [] };
      const durations = bucket.durations.slice().sort((a, b) => a - b);

      series.push({
        date: day,
        metrics: {
          shipments_open: bucket.shipments_open,
          shipments_dispatched: bucket.shipments_dispatched,
          avg_ready_to_dispatch_minutes: durations.length ? round1_(avg_(durations)) : null,
          p90_ready_to_dispatch_minutes: durations.length ? round1_(percentile_(durations, 0.9)) : null,
          overdue_shipments: day === toDate ? overdueShipments : 0,
        },
      });
    }

    return {
      ok: true,
      generated_at: nowIso_(),
      tz,
      window: {
        from_date: fromDate,
        to_date: toDate,
      },
      series,
      definitions: {
        ready_timestamp_source: 'shipments.ready_at/readiness_at OR shipment_ready event',
        dispatched_event: 'ship_dispatched',
        overdue_threshold_minutes: overdueThresholdMinutes,
      },
    };
  });

  function normalizeDays_(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DAYS;
    return Math.min(Math.floor(parsed), MAX_DAYS);
  }

  function normalizeTz_(raw) {
    const tz = asString_(raw);
    if (!tz) return DEFAULT_TZ;
    try {
      Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
      return tz;
    } catch (_err) {
      return DEFAULT_TZ;
    }
  }

  function normalizeThresholdMinutes_(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_OVERDUE_THRESHOLD_MINUTES;
    return Math.floor(parsed);
  }

  function buildGroupedSeries_(series, dayKeys, shifts) {
    const shiftKeys = {};
    for (let i = 0; i < shifts.length; i++) {
      const key = asString_(shifts[i] && shifts[i].key);
      if (key) shiftKeys[key] = true;
    }

    const byDate = {};
    for (let i = 0; i < series.length; i++) {
      const row = series[i] || {};
      const date = asString_(row.date);
      const shiftKey = asString_(row.shift_key);
      if (!date || !shiftKey || !shiftKeys[shiftKey]) continue;

      if (!byDate[date]) {
        byDate[date] = { date: date, shifts: {} };
      }

      byDate[date].shifts[shiftKey] = {
        metrics: row.metrics || {
          inventory_moves_qty: 0,
          inventory_moves_count: 0,
          picking_confirmed_lines: 0,
          batches_created: 0,
          incidents_opened: 0,
          incidents_closed: 0,
        },
      };
    }

    const out = [];
    for (let i = 0; i < dayKeys.length; i++) {
      const day = dayKeys[i];
      if (byDate[day]) {
        out.push(byDate[day]);
      }
    }

    return out;
  }

  function safeReadAll_(sheetName) {
    try {
      return Db_.readAll_(sheetName);
    } catch (_err) {
      return [];
    }
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

  function parseDate_(value) {
    const text = asString_(value);
    if (!text) return null;
    const dt = new Date(text);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
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

  function parseHm_(value) {
    const text = asString_(value);
    const match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour * 60 + minute;
  }

  function normalizeShifts_(rawShifts) {
    if (!Array.isArray(rawShifts) || rawShifts.length === 0) {
      return DEFAULT_SHIFTS.slice();
    }

    const out = [];
    for (let i = 0; i < rawShifts.length; i++) {
      const row = rawShifts[i] || {};
      const key = asString_(row.key);
      const title = asString_(row.title) || key;
      const start = asString_(row.start);
      const end = asString_(row.end);
      if (!key || parseHm_(start) === null || parseHm_(end) === null) continue;
      out.push({ key, title, start, end });
    }

    return out.length ? out : DEFAULT_SHIFTS.slice();
  }

  function toShiftBucket_(value, tz, shifts) {
    const dt = parseDate_(value);
    if (!dt) return null;

    const day = formatDay_(dt, tz);
    const hm = Utilities.formatDate(dt, tz, 'HH:mm');
    const minute = parseHm_(hm);
    if (minute === null) return null;

    for (let i = 0; i < shifts.length; i++) {
      const shift = shifts[i];
      const start = parseHm_(shift.start);
      const end = parseHm_(shift.end);
      if (start === null || end === null) continue;

      const inShift = shiftContainsMinute_(minute, start, end);
      if (!inShift) continue;

      return {
        date: day,
        shift_key: shift.key,
      };
    }

    return {
      date: day,
      shift_key: shifts.length ? shifts[0].key : 'shift_1',
    };
  }

  function shiftContainsMinute_(minute, start, end) {
    if (start === end) return true;
    if (start < end) {
      return minute >= start && minute < end;
    }
    return minute >= start || minute < end;
  }

  function parsePayloadJson_(value) {
    if (value && typeof value === 'object') {
      return value;
    }

    const text = asString_(value);
    if (!text) return {};

    try {
      const parsed = JSON.parse(text);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (_err) {
      return {};
    }
  }

  function extractShipmentIdFromPayload_(payloadJsonRaw) {
    const payload = parsePayloadJson_(payloadJsonRaw);
    return asString_(payload.shipment_id || payload.shipmentId || payload.id);
  }

  function unionKeys_(left, right) {
    const out = {};
    const keys = [];

    const addFrom = function (obj) {
      const all = Object.keys(obj || {});
      for (let i = 0; i < all.length; i++) {
        const key = all[i];
        if (out[key]) continue;
        out[key] = true;
        keys.push(key);
      }
    };

    addFrom(left);
    addFrom(right);

    return keys;
  }

  function avg_(values) {
    if (!values || !values.length) return 0;
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += Number(values[i]) || 0;
    }
    return sum / values.length;
  }

  function percentile_(sortedValues, p) {
    if (!sortedValues || !sortedValues.length) return 0;
    if (sortedValues.length === 1) return sortedValues[0];

    const rank = p * (sortedValues.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);
    if (lower === upper) return sortedValues[lower];

    const weight = rank - lower;
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight;
  }

  function round1_(value) {
    return Math.round((Number(value) || 0) * 10) / 10;
  }
})();
