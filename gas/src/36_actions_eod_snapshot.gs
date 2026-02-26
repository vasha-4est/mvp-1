(function initEodSnapshotActions_() {
  const ACTION_WRITE = 'eod.snapshot.upsert';
  const ACTION_READ = 'eod.snapshot.get';
  const DEFAULT_TZ = 'Europe/Moscow';
  const DEFAULT_DAYS_WINDOW = 1;
  const DEFICIT_HIGH_THRESHOLD = 50;
  const LOCKS_SPIKE_THRESHOLD = 10;
  const VERSION = 'v1';
  const SHEET_CANDIDATES = ['kpi_daily', 'scenario_state'];

  Actions_.register_(ACTION_WRITE, (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);

    const payload = (ctx && ctx.payload) ? ctx.payload : {};
    const tz = normalizeTz_(payload.tz);
    const daysWindow = normalizeDaysWindow_(payload.days_window);
    const snapshotDate = normalizeSnapshotDate_(payload.date, tz);
    const lockKey = 'eod:snapshot:' + snapshotDate + ':' + tz;

    withScriptLock_(lockKey, function () {
      const sh = resolveTargetSheet_();
      const existing = findExisting_(sh, snapshotDate, tz);
      if (existing) {
        const existingPayload = parsePayloadJson_(existing.row.payload_json);
        return buildResponse_(existing.row, existingPayload, true);
      }

      const daily = executeSource_(ctx, 'daily_summary', 'daily.summary.get', {
        days: Math.max(1, daysWindow),
        tz: tz,
      }, true);
      const tower = executeSource_(ctx, 'control_tower', 'control_tower.read', {}, true);
      const throughput = executeSource_(ctx, 'throughput', 'kpi.throughput.get', { days: 1 }, false);
      const throughputShifts = executeSource_(ctx, 'throughput_shifts', 'kpi.throughput.shifts.get', { days: 1, tz: tz }, false);
      const shipmentSla = executeSource_(ctx, 'shipment_sla', 'kpi.shipment.sla.get', { days: 1, tz: tz, sla_hours: 24 }, false);

      if (!daily.ok && !tower.ok) {
        throw new Error(
          ERROR.BAD_GATEWAY + ': core EOD sources unavailable | ' + JSON.stringify({
            date: snapshotDate,
            tz: tz,
            attempts: Math.max(num_(daily.attempts), num_(tower.attempts)),
            cores: [toErrorCore_(daily), toErrorCore_(tower)],
          })
        );
      }

      const summary = buildSnapshot_(snapshotDate, tz, {
        daily: daily,
        tower: tower,
        optional: [throughput, throughputShifts, shipmentSla],
      });

      const generatedAt = nowIso_();
      const snapshotId = 'EOD-' + snapshotDate.replace(/-/g, '');
      const row = {
        snapshot_id: snapshotId,
        snapshot_date: snapshotDate,
        tz: tz,
        generated_at: generatedAt,
        payload_json: JSON.stringify(summary),
        version: VERSION,
        version_id: '1',
        lock_key: lockKey,
        updated_at: generatedAt,
      };

      appendByHeader_(sh, row);
      return buildResponse_(row, summary, false);
    });
  });

  Actions_.register_(ACTION_READ, (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);

    const payload = (ctx && ctx.payload) ? ctx.payload : {};
    const tz = normalizeTz_(payload.tz);
    const snapshotDate = normalizeSnapshotDateRequired_(payload.date);

    const sh = resolveTargetSheet_();
    const existing = findExisting_(sh, snapshotDate, tz);
    if (!existing) {
      throw new Error(ERROR.NOT_FOUND + ': EOD snapshot not found');
    }

    return buildResponse_(existing.row, parsePayloadJson_(existing.row.payload_json), true);
  });

  function withScriptLock_(lockKey, fn) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      throw new Error(ERROR.LOCK_CONFLICT + ': unable to acquire lock for ' + lockKey);
    }

    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }

  function resolveTargetSheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) throw new Error('Spreadsheet not configured for ' + DB.OPS);

    for (let i = 0; i < SHEET_CANDIDATES.length; i++) {
      const candidate = SHEET_CANDIDATES[i];
      const sh = ss.getSheetByName(candidate);
      if (sh) {
        return sh;
      }
    }

    throw new Error(ERROR.NOT_FOUND + ': no compatible daily aggregates sheet found (kpi_daily/scenario_state)');
  }

  function findExisting_(sheet, snapshotDate, tz) {
    const header = getHeader_(sheet);
    const idx = index_(header);
    const snapshotDateIdx = pickColumn_(idx, ['snapshot_date', 'date', 'day_key']);
    const tzIdx = pickColumn_(idx, ['tz', 'timezone']);
    if (snapshotDateIdx === -1 || tzIdx === -1) {
      return null;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const data = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    for (let i = data.length - 1; i >= 0; i--) {
      const row = rowToObj_(header, data[i]);
      if (asString_(data[i][snapshotDateIdx]) === snapshotDate && asString_(data[i][tzIdx]) === tz) {
        return { rowNumber: i + 2, row: row };
      }
    }

    return null;
  }

  function appendByHeader_(sheet, source) {
    const header = getHeader_(sheet);
    const row = [];
    for (let i = 0; i < header.length; i++) {
      const key = header[i];
      row.push(Object.prototype.hasOwnProperty.call(source, key) ? source[key] : '');
    }
    sheet.appendRow(row);
  }

  function getHeader_(sheet) {
    const width = sheet.getLastColumn();
    if (width < 1) throw new Error(ERROR.BAD_REQUEST + ': target sheet has no header row');
    return sheet.getRange(1, 1, 1, width).getValues()[0].map(function (v) { return String(v).trim(); });
  }

  function index_(header) {
    const out = {};
    for (let i = 0; i < header.length; i++) {
      out[header[i]] = i;
    }
    return out;
  }

  function pickColumn_(idx, names) {
    for (let i = 0; i < names.length; i++) {
      if (idx[names[i]] !== undefined) return idx[names[i]];
    }
    return -1;
  }

  function rowToObj_(header, values) {
    const out = {};
    for (let i = 0; i < header.length; i++) {
      out[header[i]] = values[i];
    }
    return out;
  }

  function parsePayloadJson_(raw) {
    const text = asString_(raw);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_err) {
      return null;
    }
  }

  function executeSource_(parentCtx, key, action, payload, isCore) {
    const RETRIES = 3;
    const backoffMs = [300, 700];
    let last = { ok: false, key: key, action: action, status: 502, code: 'BAD_GATEWAY', error: 'upstream unavailable', ms: 0, rid: '', data: null, attempts: 1, isCore: isCore };

    for (let i = 0; i < RETRIES; i++) {
      const started = new Date().getTime();
      const rid = 'eod-src-' + key + '-' + uuid_();
      try {
        const data = Actions_.dispatch_(action, {
          requestId: rid,
          payload: payload || {},
          actor: parentCtx && parentCtx.actor ? parentCtx.actor : { role_id: ROLE.OWNER },
          flags: parentCtx && parentCtx.flags ? parentCtx.flags : Flags_.load_(),
        });
        return {
          ok: true,
          key: key,
          action: action,
          status: 200,
          code: 'OK',
          error: '',
          ms: new Date().getTime() - started,
          rid: rid,
          data: data,
          attempts: i + 1,
          isCore: isCore,
        };
      } catch (err) {
        const parsed = parseError_(err);
        last = {
          ok: false,
          key: key,
          action: action,
          status: parsed.code === 'LOCK_CONFLICT' ? 503 : 502,
          code: parsed.code || 'BAD_GATEWAY',
          error: parsed.error || 'upstream unavailable',
          ms: new Date().getTime() - started,
          rid: rid,
          data: null,
          attempts: i + 1,
          isCore: isCore,
        };

        if (!isTransientSourceError_(last.code, last.error) || i === RETRIES - 1) {
          return last;
        }

        if (i < backoffMs.length) {
          Utilities.sleep(backoffMs[i]);
        }
      }
    }

    return last;
  }


  function buildSnapshot_(snapshotDate, tz, sourceStatus) {
    const daily = sourceStatus.daily && sourceStatus.daily.ok ? sourceStatus.daily.data : null;
    const tower = sourceStatus.tower && sourceStatus.tower.ok ? sourceStatus.tower.data : null;
    const latestDay = pickDay_(daily, snapshotDate);

    const deficitTotalMissingQty = num_(pickPath_(tower, ['sections', 'deficit', 'total_missing_qty']));
    const pickingConfirmedEvents = num_(pickPath_(latestDay, ['metrics', 'picking_confirmed_events']));
    const inventoryMovesQty = num_(pickPath_(latestDay, ['metrics', 'inventory_moves_qty']));
    const incidentsOpenNow = num_(pickPath_(daily, ['now', 'open_incidents']));
    const shipmentsOpenNow = num_(pickPath_(daily, ['now', 'shipments_open']));
    const locksActiveTotal = num_(pickPath_(tower, ['sections', 'locks', 'active_total']));

    const deficitTopShortSkus = toTopShortSkus_(pickPath_(tower, ['sections', 'deficit', 'top_short_skus']), 5);
    const inventoryLowStock = toLowStock_(pickPath_(tower, ['sections', 'inventory', 'low_stock']), 5);
    const locksSample = toLocksSample_(pickPath_(tower, ['sections', 'locks', 'sample']), 5);

    const tomorrowLoad = {
      picking_open_lists: num_(pickPath_(daily, ['now', 'picking_open_lists'])) || num_(pickPath_(tower, ['sections', 'picking', 'open_lists'])),
      stations: {
        packaging_queue: numOrNull_(pickPath_(tower, ['sections', 'stations', 'packaging_queue'])),
        labeling_queue: numOrNull_(pickPath_(tower, ['sections', 'stations', 'labeling_queue'])),
        assembly_queue: numOrNull_(pickPath_(tower, ['sections', 'stations', 'assembly_queue'])),
        qc_queue: numOrNull_(pickPath_(tower, ['sections', 'stations', 'qc_queue'])),
      },
      risk_flags: [],
    };

    if (deficitTotalMissingQty >= DEFICIT_HIGH_THRESHOLD) tomorrowLoad.risk_flags.push('DEFICIT_HIGH');
    if (locksActiveTotal >= LOCKS_SPIKE_THRESHOLD) tomorrowLoad.risk_flags.push('LOCKS_SPIKE');
    if (incidentsOpenNow > 0) tomorrowLoad.risk_flags.push('INCIDENTS_OPEN');
    if (shipmentsOpenNow > 0) tomorrowLoad.risk_flags.push('SHIPMENTS_OPEN');
    const partialErrors = collectErrors_(sourceStatus);
    if (partialErrors.length > 0) tomorrowLoad.risk_flags.push('DATA_PARTIAL');

    const notes = buildNotes_({
      snapshotDate: snapshotDate,
      tz: tz,
      deficitTotalMissingQty: deficitTotalMissingQty,
      pickingOpenLists: tomorrowLoad.picking_open_lists,
      incidentsOpenNow: incidentsOpenNow,
      shipmentsOpenNow: shipmentsOpenNow,
      locksActiveTotal: locksActiveTotal,
      partial: partialErrors.length > 0,
    });

    return {
      headline: {
        deficit_total_missing_qty: deficitTotalMissingQty,
        picking_confirmed_events: pickingConfirmedEvents,
        inventory_moves_qty: inventoryMovesQty,
        incidents_open_now: incidentsOpenNow,
        shipments_open_now: shipmentsOpenNow,
        locks_active_total: locksActiveTotal,
      },
      top: {
        deficit_top_short_skus: deficitTopShortSkus,
        inventory_low_stock: inventoryLowStock,
        locks_sample: locksSample,
      },
      tomorrow_load: tomorrowLoad,
      notes: notes,
      sections: {
        daily_summary: daily || null,
        control_tower: tower || null,
      },
      errors: partialErrors,
    };
  }

  function buildResponse_(row, snapshotPayload, replayed) {
    return {
      ok: true,
      generated_at: asString_(row.generated_at) || nowIso_(),
      tz: asString_(row.tz),
      snapshot_date: asString_(row.snapshot_date),
      replayed: replayed,
      snapshot_id: asString_(row.snapshot_id),
      snapshot: snapshotPayload || {
        headline: {
          deficit_total_missing_qty: 0,
          picking_confirmed_events: 0,
          inventory_moves_qty: 0,
          incidents_open_now: 0,
          shipments_open_now: 0,
          locks_active_total: 0,
        },
        top: {
          deficit_top_short_skus: [],
          inventory_low_stock: [],
          locks_sample: [],
        },
        tomorrow_load: {
          picking_open_lists: 0,
          stations: {},
          risk_flags: ['DATA_PARTIAL'],
        },
        notes: 'Snapshot payload is unavailable.',
        sections: { daily_summary: null, control_tower: null },
        errors: [{ key: 'snapshot', status: 502, code: 'BAD_GATEWAY', error: 'payload unavailable' }],
      },
    };
  }

  function normalizeSnapshotDate_(rawDate, tz) {
    const trimmed = asString_(rawDate);
    if (trimmed) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        throw new Error(ERROR.BAD_REQUEST + ': invalid date format, expected YYYY-MM-DD');
      }
      return trimmed;
    }

    return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  }

  function normalizeSnapshotDateRequired_(rawDate) {
    const trimmed = asString_(rawDate);
    if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new Error(ERROR.BAD_REQUEST + ': date is required in YYYY-MM-DD format');
    }
    return trimmed;
  }

  function normalizeTz_(rawTz) {
    const tz = asString_(rawTz) || DEFAULT_TZ;
    try {
      Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
      return tz;
    } catch (_err) {
      throw new Error(ERROR.BAD_REQUEST + ': invalid tz');
    }
  }

  function normalizeDaysWindow_(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_DAYS_WINDOW;
    return Math.max(1, Math.floor(value));
  }

  function pickDay_(daily, snapshotDate) {
    const days = (daily && Array.isArray(daily.days)) ? daily.days : [];
    for (let i = 0; i < days.length; i++) {
      if (asString_(days[i].date) === snapshotDate) return days[i];
    }
    if (days.length > 0) return days[days.length - 1];
    return null;
  }

  function pickPath_(obj, path) {
    let current = obj;
    for (let i = 0; i < path.length; i++) {
      if (!current || typeof current !== 'object') return null;
      current = current[path[i]];
    }
    return current;
  }

  function toTopShortSkus_(rows, limit) {
    const source = Array.isArray(rows) ? rows : [];
    const out = [];
    for (let i = 0; i < source.length && out.length < limit; i++) {
      const row = source[i] || {};
      const skuId = asString_(row.sku_id);
      if (!skuId) continue;
      out.push({ sku_id: skuId, missing_qty: num_(row.missing_qty) });
    }
    return out;
  }

  function toLowStock_(rows, limit) {
    const source = Array.isArray(rows) ? rows : [];
    const out = [];
    for (let i = 0; i < source.length && out.length < limit; i++) {
      const row = source[i] || {};
      const skuId = asString_(row.sku_id);
      if (!skuId) continue;
      const item = { sku_id: skuId, available_qty: num_(row.available_qty) };
      const locationId = asString_(row.location_id);
      if (locationId) item.location_id = locationId;
      out.push(item);
    }
    return out;
  }

  function toLocksSample_(rows, limit) {
    const source = Array.isArray(rows) ? rows : [];
    const out = [];
    for (let i = 0; i < source.length && out.length < limit; i++) {
      const row = source[i] || {};
      const lockKey = asString_(row.lock_key);
      if (!lockKey) continue;
      const item = { lock_key: lockKey };
      const expiresAt = asString_(row.expires_at);
      if (expiresAt) item.expires_at = expiresAt;
      out.push(item);
    }
    return out;
  }

  function buildNotes_(params) {
    const lines = [];
    lines.push('EOD ' + params.snapshotDate + ' (' + params.tz + '): focus on carry-over work.');
    lines.push('Deficit pending: ' + params.deficitTotalMissingQty + ' units.');
    lines.push('Open picking lists for tomorrow: ' + params.pickingOpenLists + '.');
    lines.push('Open incidents now: ' + params.incidentsOpenNow + '; open shipments: ' + params.shipmentsOpenNow + '.');
    lines.push('Active locks: ' + params.locksActiveTotal + '.');
    if (params.partial) {
      lines.push('Data is partial due to temporary source outage (control tower or daily summary).');
    }
    return lines.join('\n');
  }


  function collectErrors_(status) {
    const out = [];
    const all = [];
    if (status && status.daily) all.push(status.daily);
    if (status && status.tower) all.push(status.tower);
    const optional = (status && Array.isArray(status.optional)) ? status.optional : [];
    for (let i = 0; i < optional.length; i++) all.push(optional[i]);

    for (let j = 0; j < all.length; j++) {
      const item = all[j] || {};
      if (item.ok) continue;
      out.push({
        key: asString_(item.key) || asString_(item.action) || 'unknown',
        status: num_(item.status) || 502,
        code: asString_(item.code) || 'BAD_GATEWAY',
        error: asString_(item.error) || 'source failed',
        ms: num_(item.ms),
        rid: asString_(item.rid),
      });
    }

    return out;
  }


  function toErrorCore_(source) {
    return {
      key: asString_(source && source.key),
      status: num_(source && source.status) || 502,
      code: asString_(source && source.code) || 'BAD_GATEWAY',
      error: asString_(source && source.error) || 'source unavailable',
      ms: num_(source && source.ms),
      rid: asString_(source && source.rid),
    };
  }

  function isTransientSourceError_(code, error) {
    const c = asString_(code);
    if (c === 'BAD_GATEWAY' || c === 'LOCK_CONFLICT') return true;
    const normalized = asString_(error).toLowerCase();
    return normalized.indexOf('timed out') >= 0 || normalized.indexOf('timeout') >= 0;
  }

  function parseError_(err) {
    const text = asString_(err && err.message ? err.message : err);
    const match = text.match(/^([A-Z_]+):\s*(.+)$/);
    if (match) return { code: match[1], error: match[2] };
    return { code: 'BAD_GATEWAY', error: text || 'Bad gateway' };
  }

  function asString_(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function num_(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  }

  function numOrNull_(value) {
    if (value === null || value === undefined || value === '') return null;
    return num_(value);
  }
})();
