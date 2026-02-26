(function initKanbanActions_() {
  const DEFAULT_LIMIT = 200;
  const MAX_LIMIT = 500;

  Actions_.register_('kanban.get', (ctx) => {
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);

    const payload = ctx.payload || {};
    const zoneFilter = asNormString_(payload.zone);
    const stationFilter = asNormString_(payload.station);
    const statusFilter = asNormString_(payload.status);
    const cursor = asString_(payload.cursor) || null;
    const limit = parseLimit_(payload.limit);

    const rows = safeReadAll_(SHEET.WORK_ITEMS);
    const filtered = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const zone = asNormString_(row.zone);
      const station = asNormString_(row.station);
      const status = asNormString_(row.status);

      if (zoneFilter && zoneFilter !== zone) continue;
      if (stationFilter && stationFilter !== station) continue;
      if (statusFilter && statusFilter !== status) continue;

      filtered.push(normalizeWorkItem_(row, i));
      if (filtered.length >= limit) break;
    }

    return {
      ok: true,
      generated_at: nowIso_(),
      tz: 'UTC',
      filters: {
        ...(zoneFilter ? { zone: zoneFilter } : {}),
        ...(stationFilter ? { station: stationFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        limit,
        cursor,
      },
      columns: buildColumns_(filtered),
      items: filtered,
      cursor: null,
    };
  });

  function safeReadAll_(sheetName) {
    try {
      return Db_.readAll_(sheetName);
    } catch (_err) {
      return [];
    }
  }

  function parseLimit_(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === '') return DEFAULT_LIMIT;

    const candidate = Number(raw);
    if (!Number.isFinite(candidate) || Math.floor(candidate) !== candidate) {
      throw new Error('VALIDATION_ERROR: Query param limit must be an integer between 1 and ' + MAX_LIMIT);
    }

    const intCandidate = Math.floor(candidate);
    if (intCandidate < 1 || intCandidate > MAX_LIMIT) {
      throw new Error('VALIDATION_ERROR: Query param limit must be an integer between 1 and ' + MAX_LIMIT);
    }

    return intCandidate;
  }

  function normalizeWorkItem_(row, index) {
    const payloadJson = parsePayloadJson_(row.payload_json);
    const entityType = asString_(row.entity_type) || null;
    const entityId = asString_(row.entity_id) || null;

    const skuId = deriveSkuId_(payloadJson);
    const qty = deriveQty_(payloadJson);
    const entityLabel = deriveEntityLabel_(payloadJson, entityType, entityId);

    return {
      work_item_id: asString_(row.work_item_id) || asString_(row.id) || asString_(row.item_id) || ('row_' + index),
      zone: asString_(row.zone) || null,
      station: asString_(row.station) || null,
      task_type: asString_(row.task_type) || null,
      status: asString_(row.status) || null,
      priority: asNumberOrNull_(row.priority),
      entity_type: entityType,
      entity_id: entityId,
      assignee_user_id: asString_(row.assignee_user_id) || null,
      assignee_role_id: asString_(row.assignee_role_id) || null,
      due_at: asString_(row.due_at) || null,
      created_at: asString_(row.created_at) || null,
      taken_at: asString_(row.taken_at) || null,
      done_at: asString_(row.done_at) || null,
      blocked_reason: asString_(row.blocked_reason) || null,
      entity_label: entityLabel,
      sku_id: skuId,
      qty,
      payload_json: payloadJson,
    };
  }

  function parsePayloadJson_(raw) {
    if (raw === null || raw === undefined) return null;

    if (typeof raw === 'object') return raw;

    const str = String(raw || '').trim();
    if (!str) return null;

    try {
      return JSON.parse(str);
    } catch (_err) {
      return null;
    }
  }

  function deriveEntityLabel_(payloadJson, entityType, entityId) {
    if (!entityId) return null;

    if (payloadJson && typeof payloadJson === 'object') {
      const explicitLabel = asString_(payloadJson.entity_label || payloadJson.label || payloadJson.title);
      if (explicitLabel) return explicitLabel;
    }

    if (entityType === 'batch') {
      return entityId;
    }

    return entityId;
  }

  function deriveSkuId_(payloadJson) {
    if (!payloadJson || typeof payloadJson !== 'object') return null;
    return asString_(payloadJson.sku_id || payloadJson.skuId) || null;
  }

  function deriveQty_(payloadJson) {
    if (!payloadJson || typeof payloadJson !== 'object') return null;
    return asNumberOrNull_(payloadJson.qty);
  }

  function buildColumns_(items) {
    const counts = {};

    for (let i = 0; i < items.length; i++) {
      const key = asNormString_(items[i].status) || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    }

    return Object.keys(counts)
      .sort()
      .map((key) => ({
        key,
        title: titleFromStatus_(key),
        count: counts[key],
      }));
  }

  function titleFromStatus_(status) {
    return String(status || 'unknown')
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function asString_(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function asNormString_(value) {
    return asString_(value).toLowerCase();
  }

  function asNumberOrNull_(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
})();
