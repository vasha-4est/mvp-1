/** Locks API actions with TTL + owner override */

(function initLockActions_() {
  const DEFAULT_TTL_SECONDS = 30;
  const MAX_LIST_SCAN_ROWS = 500;
  const SOURCE = 'webapp';

  Actions_.register_('locks.list', (ctx) => {
    const payload = ctx.payload || {};
    const limitRaw = Number(payload.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 50;
    const now = new Date();

    const lockRows = readRecentLocks_(MAX_LIST_SCAN_ROWS);
    const items = [];
    for (let i = 0; i < lockRows.length; i++) {
      const row = lockRows[i];
      if (!isActiveLock_(row, now)) continue;
      items.push(toLockDto_(row));
      if (items.length >= limit) break;
    }

    return {
      ok: true,
      generated_at: now.toISOString(),
      items,
    };
  });

  Actions_.register_('locks.acquire', (ctx) => {
    const payload = ctx.payload || {};
    const entityType = str_(payload.entity_type);
    const entityId = str_(payload.entity_id);
    const reason = str_(payload.reason);
    const ttlRaw = Number(payload.ttl_seconds);
    const ttlSeconds = Number.isFinite(ttlRaw) && ttlRaw > 0 ? Math.floor(ttlRaw) : DEFAULT_TTL_SECONDS;
    const action = 'locks.acquire';

    if (!entityType || !entityId) {
      throw new Error('VALIDATION_ERROR: entity_type and entity_id are required');
    }

    if (idempExists_(ctx.requestId, action)) {
      const replay = replayAcquire_(ctx.requestId, entityType, entityId, ttlSeconds);
      return { ok: true, replayed: true, ...replay };
    }

    const lockKey = entityType + ':' + entityId;
    const lockSheet = Sys_.sheet_(SHEET.LOCKS);
    const lockHeader = lockSheet.getRange(1, 1, 1, lockSheet.getLastColumn()).getValues()[0].map(String);
    const lockIdx = index_(lockHeader, [
      'lock_key',
      'entity_type',
      'entity_id',
      'held_by_user_id',
      'held_by_role_id',
      'acquired_at',
      'expires_at',
      'status',
    ]);

    const now = new Date();
    const nowIso = now.toISOString();
    const active = findActiveLock_(lockSheet, lockHeader, lockIdx, entityType, entityId, now);
    if (active) {
      throwLockConflict_(active.row);
    }

    markExpiredLocks_(lockSheet, lockHeader, lockIdx, entityType, entityId, nowIso, now);

    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    lockSheet.appendRow(lockHeader.map((name) => {
      if (name === 'lock_key') return lockKey;
      if (name === 'entity_type') return entityType;
      if (name === 'entity_id') return entityId;
      if (name === 'held_by_user_id') return actorUserId_(ctx);
      if (name === 'held_by_role_id') return actorRoleId_(ctx);
      if (name === 'acquired_at') return nowIso;
      if (name === 'expires_at') return expiresAt;
      if (name === 'status') return 'active';
      return '';
    }));

    appendLockEvent_(ctx, 'locks.acquire', lockKey, entityType, entityId, {
      lock_key: lockKey,
      entity_type: entityType,
      entity_id: entityId,
      ttl_seconds: ttlSeconds,
      reason,
      expires_at: expiresAt,
      held_by_user_id: actorUserId_(ctx),
      held_by_role_id: actorRoleId_(ctx),
      request_id: str_(ctx.requestId),
    }, nowIso);

    markIdempotent_(ctx.requestId, action);

    return {
      ok: true,
      lock_key: lockKey,
      entity_type: entityType,
      entity_id: entityId,
      expires_at: expiresAt,
      ttl_seconds: ttlSeconds,
    };
  });

  Actions_.register_('locks.release', (ctx) => {
    const payload = ctx.payload || {};
    const lockKey = str_(payload.lock_key);
    const action = 'locks.release';
    if (!lockKey) throw new Error('VALIDATION_ERROR: lock_key is required');

    if (idempExists_(ctx.requestId, action)) {
      return {
        ok: true,
        replayed: true,
        ...replayReleaseOrOverride_(ctx.requestId, lockKey),
      };
    }

    const parsed = parseLockKey_(lockKey);
    if (!parsed) throw new Error('NOT_FOUND: lock not found');

    const lockSheet = Sys_.sheet_(SHEET.LOCKS);
    const lockHeader = lockSheet.getRange(1, 1, 1, lockSheet.getLastColumn()).getValues()[0].map(String);
    const lockIdx = index_(lockHeader, [
      'lock_key', 'entity_type', 'entity_id', 'held_by_user_id', 'held_by_role_id', 'acquired_at', 'expires_at', 'status',
    ]);

    const match = findLatestByLockKey_(lockSheet, lockHeader, lockIdx, lockKey);
    if (!match) throw new Error('NOT_FOUND: lock not found');

    const nowIso = nowIso_();
    let changed = false;
    const wasActive = isActiveLock_(match.row, new Date()) && str_(match.row.status) === 'active';
    if (wasActive) {
      const nextRow = match.values.slice();
      nextRow[lockIdx.status] = 'released';
      nextRow[lockIdx.expires_at] = nowIso;
      lockSheet.getRange(match.rowNumber, 1, 1, lockHeader.length).setValues([nextRow]);
      changed = true;
    }

    if (changed) {
      appendLockEvent_(ctx, 'locks.release', lockKey, str_(match.row.entity_type), str_(match.row.entity_id), {
        lock_key: lockKey,
        entity_type: str_(match.row.entity_type),
        entity_id: str_(match.row.entity_id),
        ttl_seconds: ttlFromRow_(match.row),
        request_id: str_(ctx.requestId),
      }, nowIso);
    }

    markIdempotent_(ctx.requestId, action);
    return { ok: true, lock_key: lockKey, changed };
  });

  Actions_.register_('locks.override', (ctx) => {
    const payload = ctx.payload || {};
    const lockKey = str_(payload.lock_key);
    const reason = str_(payload.reason || payload.override_reason);
    const action = 'locks.override';

    if (actorRoleId_(ctx).toLowerCase() !== ROLE.OWNER) {
      throw new Error('FORBIDDEN: owner role required');
    }

    if (!lockKey) throw new Error('VALIDATION_ERROR: lock_key is required');
    if (!reason || reason.length < 3) throw new Error('VALIDATION_ERROR: reason is required and must be at least 3 chars');

    if (idempExists_(ctx.requestId, action)) {
      return {
        ok: true,
        replayed: true,
        ...replayReleaseOrOverride_(ctx.requestId, lockKey),
      };
    }

    const lockSheet = Sys_.sheet_(SHEET.LOCKS);
    const lockHeader = lockSheet.getRange(1, 1, 1, lockSheet.getLastColumn()).getValues()[0].map(String);
    const lockIdx = index_(lockHeader, [
      'lock_key', 'entity_type', 'entity_id', 'held_by_user_id', 'held_by_role_id', 'acquired_at', 'expires_at', 'status',
    ]);

    const match = findLatestByLockKey_(lockSheet, lockHeader, lockIdx, lockKey);
    if (!match) throw new Error('NOT_FOUND: lock not found');

    const now = new Date();
    const nowIso = now.toISOString();
    let changed = false;
    if (isActiveLock_(match.row, now) && str_(match.row.status) === 'active') {
      const nextRow = match.values.slice();
      nextRow[lockIdx.status] = 'overridden';
      nextRow[lockIdx.expires_at] = nowIso;
      lockSheet.getRange(match.rowNumber, 1, 1, lockHeader.length).setValues([nextRow]);
      changed = true;

      appendLockEvent_(ctx, 'locks.override', lockKey, str_(match.row.entity_type), str_(match.row.entity_id), {
        lock_key: lockKey,
        entity_type: str_(match.row.entity_type),
        entity_id: str_(match.row.entity_id),
        ttl_seconds: ttlFromRow_(match.row),
        reason,
        request_id: str_(ctx.requestId),
      }, nowIso);
    }

    markIdempotent_(ctx.requestId, action);
    return { ok: true, lock_key: lockKey, changed };
  });

  function toLockDto_(row) {
    return {
      lock_key: str_(row.lock_key),
      entity_type: str_(row.entity_type),
      entity_id: str_(row.entity_id),
      held_by_user_id: str_(row.held_by_user_id),
      held_by_role_id: str_(row.held_by_role_id),
      acquired_at: str_(row.acquired_at),
      expires_at: str_(row.expires_at),
      status: str_(row.status),
    };
  }

  function readRecentLocks_(scanLimit) {
    const sheet = Sys_.sheet_(SHEET.LOCKS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const idx = index_(header, ['lock_key', 'entity_type', 'entity_id', 'held_by_user_id', 'held_by_role_id', 'acquired_at', 'expires_at', 'status']);
    const available = lastRow - 1;
    const rowsToRead = Math.min(Math.max(1, scanLimit), available);
    const start = lastRow - rowsToRead + 1;
    const values = sheet.getRange(start, 1, rowsToRead, header.length).getValues();

    const out = [];
    for (let i = values.length - 1; i >= 0; i--) {
      const row = {};
      for (const key in idx) {
        row[key] = values[i][idx[key]];
      }
      out.push(row);
    }
    return out;
  }

  function isActiveLock_(row, now) {
    const status = str_(row.status);
    const expiresAt = new Date(str_(row.expires_at));
    if (status !== 'active') return false;
    if (!Number.isFinite(expiresAt.getTime())) return false;
    return expiresAt.getTime() > now.getTime();
  }

  function findActiveLock_(sheet, header, idx, entityType, entityId, now) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      const row = rowFromValues_(values[i], idx);
      if (str_(row.entity_type) !== entityType || str_(row.entity_id) !== entityId) continue;
      if (isActiveLock_(row, now)) return { row, rowNumber: i + 2, values: values[i] };
    }

    return null;
  }

  function markExpiredLocks_(sheet, header, idx, entityType, entityId, nowIso, now) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    const updates = [];

    for (let i = 0; i < values.length; i++) {
      const row = rowFromValues_(values[i], idx);
      if (str_(row.entity_type) !== entityType || str_(row.entity_id) !== entityId) continue;
      if (str_(row.status) !== 'active') continue;

      const expiresAt = new Date(str_(row.expires_at));
      const expired = Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime();
      if (!expired) continue;

      const next = values[i].slice();
      next[idx.status] = 'expired';
      next[idx.expires_at] = nowIso;
      updates.push({ rowNumber: i + 2, values: next });
    }

    for (let j = 0; j < updates.length; j++) {
      sheet.getRange(updates[j].rowNumber, 1, 1, header.length).setValues([updates[j].values]);
    }
  }

  function throwLockConflict_(row) {
    const details = {
      lock_key: str_(row.lock_key),
      expires_at: str_(row.expires_at),
      held_by_user_id: str_(row.held_by_user_id),
      held_by_role_id: str_(row.held_by_role_id),
    };
    throw new Error('LOCK_CONFLICT: lock is active | ' + JSON.stringify(details));
  }

  function findLatestByLockKey_(sheet, header, idx, lockKey) {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (str_(values[i][idx.lock_key]) !== lockKey) continue;
      return { row: rowFromValues_(values[i], idx), rowNumber: i + 2, values: values[i] };
    }
    return null;
  }

  function rowFromValues_(values, idx) {
    const row = {};
    for (const key in idx) {
      row[key] = values[idx[key]];
    }
    return row;
  }

  function idempExists_(requestId, action) {
    const req = str_(requestId);
    if (!req) return false;
    const rows = Db_.query_(SHEET.IDEMP, (row) => str_(row.request_id) === req && str_(row.action) === action);
    return rows.length > 0;
  }

  function markIdempotent_(requestId, action) {
    if (idempExists_(requestId, action)) return;
    Db_.append_(SHEET.IDEMP, {
      request_id: str_(requestId),
      action,
      created_at: nowIso_(),
    });
  }

  function replayAcquire_(requestId, entityType, entityId, ttlSeconds) {
    const payload = eventPayloadByRequest_(requestId, 'locks.acquire');
    if (payload) {
      return {
        lock_key: str_(payload.lock_key),
        entity_type: str_(payload.entity_type),
        entity_id: str_(payload.entity_id),
        expires_at: str_(payload.expires_at),
        ttl_seconds: Number(payload.ttl_seconds) || ttlSeconds,
      };
    }

    return {
      lock_key: entityType + ':' + entityId,
      entity_type: entityType,
      entity_id: entityId,
      expires_at: nowIso_(),
      ttl_seconds: ttlSeconds,
    };
  }

  function replayReleaseOrOverride_(requestId, fallbackLockKey) {
    const payload = eventPayloadByRequest_(requestId, 'locks.release') || eventPayloadByRequest_(requestId, 'locks.override');
    return {
      lock_key: payload ? str_(payload.lock_key) : fallbackLockKey,
      changed: payload ? true : false,
    };
  }

  function eventPayloadByRequest_(requestId, eventType) {
    const req = str_(requestId);
    if (!req) return null;

    const rows = Db_.query_(SHEET.EVENTS, (row) => str_(row.request_id) === req && str_(row.event_type) === eventType);
    if (rows.length === 0) return null;

    const raw = str_(rows[0].payload_json);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (err) {
      return null;
    }

    return null;
  }

  function appendLockEvent_(ctx, action, lockKey, entityType, entityId, payload, createdAt) {
    const reason = str_(payload && payload.reason);
    Audit_.logMutation({
      ctx,
      action,
      event_type: action,
      entity_type: entityType,
      entity_id: entityId,
      request_id: str_(ctx.requestId),
      source: SOURCE,
      required_proof: '',
      proof_ref: '',
      reason,
      created_at: createdAt || nowIso_(),
      diff_or_effect: payload || {},
      payload_json: {
        lock_key: lockKey,
        actor_user_id: actorUserId_(ctx),
        actor_role_id: actorRoleId_(ctx),
        ...(payload || {}),
        action,
        entity_type: entityType,
        entity_id: entityId,
        request_id: str_(ctx.requestId),
        ...(reason ? { reason } : {}),
      },
    });
  }

  function ttlFromRow_(row) {
    const acquiredAt = new Date(str_(row.acquired_at));
    const expiresAt = new Date(str_(row.expires_at));
    if (!Number.isFinite(acquiredAt.getTime()) || !Number.isFinite(expiresAt.getTime())) return 0;
    return Math.max(0, Math.round((expiresAt.getTime() - acquiredAt.getTime()) / 1000));
  }

  function parseLockKey_(lockKey) {
    const value = str_(lockKey);
    const pos = value.indexOf(':');
    if (pos <= 0 || pos >= value.length - 1) return null;
    return { entityType: value.slice(0, pos), entityId: value.slice(pos + 1) };
  }

  function actorUserId_(ctx) {
    return str_(ctx && ctx.actor && ctx.actor.employee_id ? ctx.actor.employee_id : '');
  }

  function actorRoleId_(ctx) {
    return str_(ctx && ctx.actor && ctx.actor.role ? ctx.actor.role : '');
  }

  function index_(header, required) {
    const out = {};
    for (let i = 0; i < header.length; i++) out[str_(header[i])] = i;
    for (let j = 0; j < required.length; j++) {
      if (out[required[j]] === undefined) {
        throw new Error('BAD_REQUEST: missing column ' + required[j]);
      }
    }
    return out;
  }

  function str_(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }
})();
