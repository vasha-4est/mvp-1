(function initProductionLaunchActions_() {
  const ACTION_UPDATE = 'production.launch.update';
  const TASK_TYPE = 'production_launch';
  const ENTITY_TYPE = 'production_launch';
  const DEFAULT_ZONE = 'production';
  const DEFAULT_STATION = 'assembly';
  const WORK_ITEMS_HEADERS = [
    'work_item_id',
    'zone',
    'station',
    'task_type',
    'status',
    'priority',
    'entity_type',
    'entity_id',
    'assignee_user_id',
    'assignee_role_id',
    'due_at',
    'created_at',
    'updated_at',
    'taken_at',
    'done_at',
    'blocked_reason',
    'payload_json',
    'request_id',
    'version_id',
  ];

  Actions_.register_('production.launch.list', (ctx) => {
    const importBatchId = str_(ctx && ctx.payload && ctx.payload.import_batch_id);
    const rows = safeReadAll_(SHEET.WORK_ITEMS);
    const items = [];

    for (let i = 0; i < rows.length; i++) {
      const item = normalizeRow_(rows[i]);
      if (!item) continue;
      if (importBatchId && item.import_batch_id !== importBatchId) continue;
      items.push(item);
    }

    items.sort((left, right) => {
      const deadlineCompare = compareIso_(left.earliest_deadline_at, right.earliest_deadline_at);
      if (deadlineCompare !== 0) return deadlineCompare;
      return String(left.sku_id || '').localeCompare(String(right.sku_id || ''));
    });

    return {
      ok: true,
      generated_at: nowIso_(),
      items,
    };
  });

  Actions_.register_('production.launch.update', (ctx) => {
    const payload = ctx.payload || {};
    const requestId = str_(ctx.requestId);
    if (!requestId) throw new Error('VALIDATION_ERROR: request_id is required');

    const parsed = parseUpdatePayload_(payload);
    if (idempExists_(requestId, ACTION_UPDATE)) {
      return replayUpdate_(parsed.entity_id);
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(5000);
    } catch (_err) {
      throw new Error('LOCK_TIMEOUT: Service unavailable');
    }

    try {
      if (idempExists_(requestId, ACTION_UPDATE)) {
        return replayUpdate_(parsed.entity_id);
      }

      const sheet = ensureWorkItemsSheet_();
      const header = header_(sheet);
      const idx = index_(header);
      const found = findRowByEntityId_(sheet, header, idx, parsed.entity_id);
      const nowTs = nowIso_();
      const nextRow = found ? found.values.slice() : header.map(function () { return ''; });
      const current = found ? rowFromValues_(header, found.values) : {};
      const currentPayload = parseJsonSafe_(current.payload_json) || {};
      const existingStatus = normalizeStatus_(current.status);
      assertTakeAllowed_(parsed, current, existingStatus);
      const nextPayload = buildPayload_(currentPayload, parsed, nowTs);
      const nextStatus = resolveNextStatus_(parsed, existingStatus);
      const nextAssigneeUserId = resolveAssigneeUserId_(parsed, current, nextStatus);
      const nextAssigneeRoleId = resolveAssigneeRoleId_(parsed, current, nextAssigneeUserId);
      const nextAssigneeUsername = resolveAssigneeUsername_(parsed, current, nextAssigneeUserId);

      setIfColumn_(idx, nextRow, 'work_item_id', parsed.work_item_id);
      setIfColumn_(idx, nextRow, 'zone', DEFAULT_ZONE);
      setIfColumn_(idx, nextRow, 'station', DEFAULT_STATION);
      setIfColumn_(idx, nextRow, 'task_type', TASK_TYPE);
      setIfColumn_(idx, nextRow, 'status', nextStatus);
      setIfColumn_(idx, nextRow, 'priority', String(parsed.priority));
      setIfColumn_(idx, nextRow, 'entity_type', ENTITY_TYPE);
      setIfColumn_(idx, nextRow, 'entity_id', parsed.entity_id);
      setIfColumn_(idx, nextRow, 'assignee_user_id', nextAssigneeUserId);
      setIfColumn_(idx, nextRow, 'assignee_role_id', nextAssigneeRoleId);
      setIfColumn_(idx, nextRow, 'due_at', parsed.earliest_deadline_at || '');
      setIfColumn_(idx, nextRow, 'created_at', str_(current.created_at) || nowTs);
      setIfColumn_(idx, nextRow, 'updated_at', nowTs);
      setIfColumn_(idx, nextRow, 'taken_at', resolveTakenAt_(parsed, current, nextStatus, nowTs));
      setIfColumn_(idx, nextRow, 'done_at', resolveDoneAt_(nextStatus, current, nowTs));
      setIfColumn_(idx, nextRow, 'blocked_reason', nextStatus === 'blocked' ? parsed.blocked_reason : '');
      setIfColumn_(idx, nextRow, 'payload_json', JSON.stringify(nextPayload));
      setIfColumn_(idx, nextRow, 'request_id', requestId);
      setIfColumn_(idx, nextRow, 'version_id', str_(current.version_id) || '1');

      if (found) {
        sheet.getRange(found.rowNumber, 1, 1, header.length).setValues([nextRow]);
      } else {
        sheet.appendRow(nextRow);
      }

      const updated = rowFromValues_(header, nextRow);

      markIdempotent_(requestId, ACTION_UPDATE);
      Audit_.logMutation({
        action: ACTION_UPDATE,
        event_type: 'production_launch_updated',
        entity_type: ENTITY_TYPE,
        entity_id: parsed.entity_id,
        request_id: requestId,
        actor_user_id: parsed.actor_user_id,
        actor_role_id: parsed.actor_role_id,
        payload_json: nextPayload,
        diff_or_effect: {
          update_action: parsed.update_action,
          status: nextStatus,
          assignee_user_id: nextAssigneeUserId,
          assignee_role_id: nextAssigneeRoleId,
        },
        created_at: nowTs,
        source: 'webapp',
      });

      return {
        ok: true,
        replayed: false,
        item: normalizeRow_(updated),
      };
    } finally {
      lock.releaseLock();
    }
  });

  function parseUpdatePayload_(payload) {
    const importBatchId = str_(payload.import_batch_id);
    const skuId = str_(payload.sku_id);
    const updateAction = str_(payload.update_action).toLowerCase();
    const actorUserId = str_(payload.actor_user_id);
    const actorRoleId = str_(payload.actor_role_id).toUpperCase();
    const actorUsername = str_(payload.actor_username);
    const productionQty = int_(payload.production_qty);
    const doneQty = intOrNull_(payload.done_qty);
    const demandQty = int_(payload.demand_qty);
    const shipmentCount = int_(payload.shipment_count);
    const shipmentIds = arrayOfStrings_(payload.shipment_ids);
    const earliestDeadlineAt = normalizeIso_(payload.earliest_deadline_at);
    const priorityReason = str_(payload.priority_reason);
    const priority = int_(payload.priority);
    const assigneeUserId = str_(payload.assignee_user_id);
    const assigneeRoleId = str_(payload.assignee_role_id).toUpperCase();
    const assigneeUsername = str_(payload.assignee_username);
    const status = normalizeStatus_(payload.status);
    const blockedReason = str_(payload.blocked_reason);
    const batchId = str_(payload.batch_id);
    const batchCode = str_(payload.batch_code);

    if (!importBatchId) throw new Error('VALIDATION_ERROR: import_batch_id is required');
    if (!skuId) throw new Error('VALIDATION_ERROR: sku_id is required');
    if (['take', 'assign', 'status'].indexOf(updateAction) === -1) {
      throw new Error('VALIDATION_ERROR: update_action must be one of take, assign, status');
    }
    if (!actorUserId) throw new Error('VALIDATION_ERROR: actor_user_id is required');
    if (!actorRoleId) throw new Error('VALIDATION_ERROR: actor_role_id is required');
    if (!priorityReason) throw new Error('VALIDATION_ERROR: priority_reason is required');
    if (productionQty < 0 || demandQty < 0 || shipmentCount < 0) {
      throw new Error('VALIDATION_ERROR: quantities must be >= 0');
    }
    if (updateAction === 'assign' && !assigneeUserId) {
      throw new Error('VALIDATION_ERROR: assignee_user_id is required for assign');
    }
    if (updateAction === 'status' && ['new', 'in_progress', 'blocked', 'done'].indexOf(status) === -1) {
      throw new Error('VALIDATION_ERROR: invalid status value');
    }
    if (status === 'blocked' && !blockedReason) {
      throw new Error('VALIDATION_ERROR: blocked_reason is required when status=blocked');
    }

    const entityId = importBatchId + ':' + skuId;
    return {
      import_batch_id: importBatchId,
      sku_id: skuId,
      entity_id: entityId,
      work_item_id: workItemId_(importBatchId, skuId),
      update_action: updateAction,
      actor_user_id: actorUserId,
      actor_role_id: actorRoleId,
      actor_username: actorUsername,
      production_qty: productionQty,
      done_qty: doneQty === null ? null : Math.max(0, Math.min(productionQty, doneQty)),
      demand_qty: demandQty,
      shipment_count: shipmentCount,
      shipment_ids: shipmentIds,
      earliest_deadline_at: earliestDeadlineAt,
      priority_reason: priorityReason,
      priority: priority >= 0 ? priority : 0,
      assignee_user_id: assigneeUserId,
      assignee_role_id: assigneeRoleId,
      assignee_username: assigneeUsername,
      status: status,
      blocked_reason: blockedReason,
      batch_id: batchId,
      batch_code: batchCode,
    };
  }

  function resolveNextStatus_(parsed, existingStatus) {
    if (parsed.update_action === 'take') return 'in_progress';
    if (parsed.update_action === 'assign') return existingStatus || 'new';
    return parsed.status || existingStatus || 'new';
  }

  function resolveAssigneeUserId_(parsed, current, nextStatus) {
    if (parsed.update_action === 'take') return str_(current.assignee_user_id) || parsed.actor_user_id;
    if (parsed.update_action === 'assign') return parsed.assignee_user_id;
    if (parsed.update_action === 'status' && nextStatus === 'in_progress') {
      return str_(current.assignee_user_id) || parsed.actor_user_id;
    }
    return str_(current.assignee_user_id);
  }

  function resolveAssigneeRoleId_(parsed, current, nextAssigneeUserId) {
    if (!nextAssigneeUserId) return '';
    if (parsed.update_action === 'take') return str_(current.assignee_role_id) || parsed.actor_role_id;
    if (parsed.update_action === 'assign' && parsed.assignee_role_id) return parsed.assignee_role_id;
    return str_(current.assignee_role_id);
  }

  function resolveAssigneeUsername_(parsed, current, nextAssigneeUserId) {
    if (!nextAssigneeUserId) return '';
    if (parsed.update_action === 'take') {
      return str_(currentPayloadValue_(current, 'assignee_username')) || parsed.actor_username || nextAssigneeUserId;
    }
    if (parsed.update_action === 'assign' && parsed.assignee_username) return parsed.assignee_username;
    return str_(currentPayloadValue_(current, 'assignee_username')) || nextAssigneeUserId;
  }

  function assertTakeAllowed_(parsed, current, existingStatus) {
    if (parsed.update_action !== 'take') return;
    if (!current || !existingStatus || existingStatus === 'new') return;

    const currentAssigneeUserId = str_(current.assignee_user_id);
    if (existingStatus === 'in_progress' && currentAssigneeUserId && currentAssigneeUserId === parsed.actor_user_id) {
      return;
    }

    const currentAssigneeUsername = str_(currentPayloadValue_(current, 'assignee_username')) || currentAssigneeUserId || null;
    throw new Error(
      'CONFLICT: production launch item already active | ' +
        JSON.stringify({
          entity_id: parsed.entity_id,
          status: existingStatus,
          assignee_user_id: currentAssigneeUserId || null,
          assignee_username: currentAssigneeUsername,
        })
    );
  }

  function resolveTakenAt_(parsed, current, nextStatus, nowTs) {
    if (nextStatus === 'in_progress') {
      return str_(current.taken_at) || nowTs;
    }
    return str_(current.taken_at);
  }

  function resolveDoneAt_(nextStatus, current, nowTs) {
    if (nextStatus === 'done') {
      return nowTs;
    }
    return '';
  }

  function buildPayload_(currentPayload, parsed, nowTs) {
    return {
      import_batch_id: parsed.import_batch_id,
      sku_id: parsed.sku_id,
      demand_qty: parsed.demand_qty,
      production_qty: parsed.production_qty,
      done_qty:
        parsed.done_qty === null
          ? intOrNull_(currentPayload.done_qty)
          : Math.max(0, Math.min(parsed.production_qty, parsed.done_qty)),
      shipment_count: parsed.shipment_count,
      shipment_ids: parsed.shipment_ids,
      earliest_deadline_at: parsed.earliest_deadline_at || null,
      priority_reason: parsed.priority_reason,
      priority: parsed.priority,
      assignee_username:
        parsed.update_action === 'take'
          ? (parsed.actor_username || parsed.actor_user_id)
          : parsed.update_action === 'assign'
          ? (parsed.assignee_username || parsed.assignee_user_id)
          : str_(currentPayload.assignee_username),
      blocked_reason: parsed.status === 'blocked' ? parsed.blocked_reason : '',
      batch_id: parsed.batch_id || str_(currentPayload.batch_id),
      batch_code: parsed.batch_code || str_(currentPayload.batch_code),
      last_update_action: parsed.update_action,
      last_updated_at: nowTs,
    };
  }

  function replayUpdate_(entityId) {
    const rows = safeReadAll_(SHEET.WORK_ITEMS);
    for (let i = 0; i < rows.length; i++) {
      const item = normalizeRow_(rows[i]);
      if (item && item.entity_id === entityId) {
        return { ok: true, replayed: true, item: item };
      }
    }

    throw new Error('NOT_FOUND: production launch item not found');
  }

  function normalizeRow_(row) {
    const taskType = str_(row.task_type);
    const entityType = str_(row.entity_type);
    if (taskType !== TASK_TYPE || entityType !== ENTITY_TYPE) {
      return null;
    }

    const payload = parseJsonSafe_(row.payload_json) || {};
    const importBatchId = str_(payload.import_batch_id);
    const skuId = str_(payload.sku_id);
    if (!importBatchId || !skuId) {
      return null;
    }

    return {
      work_item_id: str_(row.work_item_id),
      entity_id: str_(row.entity_id),
      import_batch_id: importBatchId,
      sku_id: skuId,
      status: normalizeStatus_(row.status),
      assignee_user_id: str_(row.assignee_user_id) || null,
      assignee_role_id: str_(row.assignee_role_id) || null,
      assignee_username: str_(payload.assignee_username) || null,
      created_at: normalizeIso_(row.created_at),
      updated_at: normalizeIso_(row.updated_at),
      taken_at: normalizeIso_(row.taken_at),
      done_at: normalizeIso_(row.done_at),
      due_at: normalizeIso_(row.due_at),
      blocked_reason: str_(row.blocked_reason) || str_(payload.blocked_reason) || null,
      demand_qty: int_(payload.demand_qty),
      production_qty: int_(payload.production_qty),
      done_qty: int_(payload.done_qty),
      shipment_count: int_(payload.shipment_count),
      shipment_ids: arrayOfStrings_(payload.shipment_ids),
      earliest_deadline_at: normalizeIso_(payload.earliest_deadline_at),
      priority_reason: str_(payload.priority_reason) || null,
      priority: intOrNull_(row.priority),
      batch_id: str_(payload.batch_id) || null,
      batch_code: str_(payload.batch_code) || null,
    };
  }

  function ensureWorkItemsSheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) throw new Error('BAD_GATEWAY: Spreadsheet not configured for OPS_DB');

    let sh = ss.getSheetByName(SHEET.WORK_ITEMS);
    if (!sh) {
      sh = ss.insertSheet(SHEET.WORK_ITEMS);
      sh.getRange(1, 1, 1, WORK_ITEMS_HEADERS.length).setValues([WORK_ITEMS_HEADERS]);
      return sh;
    }

    if (sh.getLastColumn() === 0) {
      sh.getRange(1, 1, 1, WORK_ITEMS_HEADERS.length).setValues([WORK_ITEMS_HEADERS]);
      return sh;
    }

    const header = header_(sh);
    const missing = [];
    for (let i = 0; i < WORK_ITEMS_HEADERS.length; i++) {
      if (header.indexOf(WORK_ITEMS_HEADERS[i]) === -1) {
        missing.push(WORK_ITEMS_HEADERS[i]);
      }
    }

    if (missing.length > 0) {
      sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
    }

    return sh;
  }

  function safeReadAll_(sheetName) {
    try {
      return Db_.readAll_(sheetName);
    } catch (_err) {
      return [];
    }
  }

  function findRowByEntityId_(sheet, header, idx, entityId) {
    const entityIdx = idx.entity_id;
    if (entityIdx === undefined) return null;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    for (let i = 0; i < values.length; i++) {
      if (str_(values[i][entityIdx]) === entityId && str_(values[i][idx.task_type]) === TASK_TYPE) {
        return { rowNumber: i + 2, values: values[i] };
      }
    }

    return null;
  }

  function currentPayloadValue_(row, key) {
    const payload = parseJsonSafe_(row && row.payload_json) || {};
    return payload[key];
  }

  function workItemId_(importBatchId, skuId) {
    return 'prodlaunch_' + sanitizeKey_(importBatchId) + '_' + sanitizeKey_(skuId);
  }

  function sanitizeKey_(value) {
    return str_(value).replace(/[^A-Za-z0-9_-]+/g, '_');
  }

  function compareIso_(left, right) {
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;
    return String(left).localeCompare(String(right));
  }

  function normalizeIso_(value) {
    const candidate = str_(value);
    if (!candidate) return null;
    const parsed = new Date(candidate);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }

  function normalizeStatus_(value) {
    const candidate = str_(value).toLowerCase();
    if (['new', 'in_progress', 'blocked', 'done'].indexOf(candidate) !== -1) {
      return candidate;
    }
    return 'new';
  }

  function int_(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }

  function intOrNull_(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  }

  function parseJsonSafe_(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }

  function arrayOfStrings_(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (let i = 0; i < value.length; i++) {
      const normalized = str_(value[i]);
      if (normalized) out.push(normalized);
    }
    return out;
  }

  function header_(sheet) {
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (value) {
      return String(value).trim();
    });
  }

  function index_(header) {
    const idx = {};
    for (let i = 0; i < header.length; i++) idx[String(header[i]).trim()] = i;
    return idx;
  }

  function rowFromValues_(header, values) {
    const out = {};
    for (let i = 0; i < header.length; i++) out[header[i]] = values[i];
    return out;
  }

  function setIfColumn_(idx, row, name, value) {
    if (idx[name] !== undefined) {
      row[idx[name]] = value;
    }
  }

  function idempExists_(requestId, action) {
    const rows = Db_.readAll_(SHEET.IDEMP);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (str_(rows[i].request_id) === requestId && str_(rows[i].action) === action) {
        return true;
      }
    }
    return false;
  }

  function markIdempotent_(requestId, action) {
    if (idempExists_(requestId, action)) return;
    Db_.append_(SHEET.IDEMP, {
      request_id: requestId,
      action: action,
      created_at: nowIso_(),
    });
  }

  function str_(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }
})();
