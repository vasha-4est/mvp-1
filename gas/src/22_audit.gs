/** Append-only batch audit helpers. */

const Audit_ = (() => {
  const SERVICE_TIMEZONE = 'Europe/Moscow';
  const LOCK_WAIT_MS = 30000;
  const MAX_PAYLOAD_JSON_LENGTH = 8000;

  /**
   * @param {string} batchCode
   * @param {BatchEventType} type
   * @param {*} payload
   * @param {string=} actor
   * @returns {BatchEvent}
   */
  function recordEvent(batchCode, type, payload, actor) {
    const event = {
      at: nowIso_(),
      batch_code: String(batchCode || ''),
      batch_id: '',
      type: String(type || BATCH_EVENT_TYPE.CUSTOM),
      actor: actor ? String(actor) : '',
      request_id: uuid_(),
      details_json: JSON.stringify(payload || {}),
    };

    if (!event.batch_code) {
      throw new Error(ERROR.BAD_REQUEST + ': batch_code is required');
    }

    return BatchEventsRepo_.insertBatchEvent(event);
  }

  function logMutation(input) {
    const data = input || {};
    const action = str_(data.action);
    const entityType = str_(data.entity_type);
    const entityId = str_(data.entity_id);
    const requestId = str_(data.request_id);
    const reason = str_(data.reason);
    const proofRef = str_(data.proof_ref);
    const requiredProof = str_(data.required_proof);
    const createdAt = str_(data.created_at) || nowIso_();
    const eventType = str_(data.event_type) || action;
    const source = normalizeSource_(data.source, data.ctx);
    const actorUserId = resolveActorUserId_(data.actor_user_id, data.ctx);
    const actorRoleId = resolveActorRoleId_(data.actor_role_id, data.ctx);

    if (!action) throw new Error(ERROR.BAD_REQUEST + ': action is required');
    if (!entityType) throw new Error(ERROR.BAD_REQUEST + ': entity_type is required');
    if (!entityId) throw new Error(ERROR.BAD_REQUEST + ': entity_id is required');
    if (!requestId) throw new Error(ERROR.BAD_REQUEST + ': request_id is required');
    if (requiredProof && !proofRef) throw new Error(ERROR.BAD_REQUEST + ': proof_ref is required');
    if (data.reason_required === true && !reason) throw new Error(ERROR.BAD_REQUEST + ': reason is required');

    const payloadObj = payloadJsonObject_(data.payload_json, {
      action,
      entity_type: entityType,
      entity_id: entityId,
      diff_or_effect: data.diff_or_effect || {},
      request_id: requestId,
      ...(reason ? { reason } : {}),
    });

    const eventId = nextEventId_(createdAt);
    Db_.append_(SHEET.EVENTS, {
      event_id: eventId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      payload: str_(data.payload),
      created_at: createdAt,
      actor_user_id: actorUserId,
      actor_role_id: actorRoleId,
      required_proof: requiredProof,
      proof_ref: proofRef,
      source,
      request_id: requestId,
      payload_json: stringifyLimited_(payloadObj),
    });

    return {
      event_id: eventId,
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      created_at: createdAt,
      request_id: requestId,
    };
  }

  function nextEventId_(isoTs) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(LOCK_WAIT_MS);
    } catch (_err) {
      throw new Error(ERROR.LOCK_CONFLICT + ': audit event id lock timeout');
    }

    try {
      const sheet = Sys_.sheet_(SHEET.EVENTS);
      const lastRow = sheet.getLastRow();
      const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      const idx = index_(header, ['event_id']);
      const ts = new Date(isoTs || nowIso_());
      const dateKey = Utilities.formatDate(ts, SERVICE_TIMEZONE, 'yyMMdd');
      const prefix = 'EV-' + dateKey + '-';
      let maxSeq = 0;

      if (lastRow >= 2) {
        const rows = sheet.getRange(2, idx.event_id + 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < rows.length; i++) {
          const eventId = str_(rows[i][0]);
          if (eventId.indexOf(prefix) !== 0) continue;
          const seq = Number(eventId.slice(prefix.length));
          if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
        }
      }

      return prefix + String(maxSeq + 1).padStart(3, '0');
    } finally {
      lock.releaseLock();
    }
  }

  function payloadJsonObject_(payloadJson, fallback) {
    const fallbackObj = fallback || {};
    if (payloadJson && typeof payloadJson === 'object') {
      return mergePayload_(payloadJson, fallbackObj);
    }

    const raw = str_(payloadJson);
    if (!raw) return fallbackObj;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return mergePayload_(parsed, fallbackObj);
    } catch (err) {}

    return fallbackObj;
  }

  function mergePayload_(base, fallback) {
    const out = {};
    const src = base || {};
    const fb = fallback || {};

    for (const key in src) out[key] = src[key];
    for (const key in fb) {
      if (out[key] === undefined || out[key] === null || out[key] === '') out[key] = fb[key];
    }
    return out;
  }

  function stringifyLimited_(value) {
    let serialized = '';
    try {
      serialized = JSON.stringify(value || {});
    } catch (err) {
      serialized = JSON.stringify({ error: 'payload_json_serialization_error' });
    }

    if (serialized.length <= MAX_PAYLOAD_JSON_LENGTH) return serialized;
    return serialized.slice(0, MAX_PAYLOAD_JSON_LENGTH - 1) + '…';
  }

  function resolveActorUserId_(actorUserId, ctx) {
    const provided = str_(actorUserId);
    if (provided) return provided;
    if (ctx && ctx.actor && ctx.actor.employee_id) return str_(ctx.actor.employee_id);
    return 'system';
  }

  function resolveActorRoleId_(actorRoleId, ctx) {
    const provided = str_(actorRoleId);
    if (provided) return provided;
    if (ctx && ctx.actor && ctx.actor.role) return str_(ctx.actor.role);
    return 'system';
  }

  function normalizeSource_(source, ctx) {
    const raw = str_(source).toLowerCase();
    if (raw === 'webapp' || raw === 'system') return raw;
    return ctx && ctx.actor ? 'webapp' : 'system';
  }

  function index_(header, required) {
    const out = {};
    for (let i = 0; i < header.length; i++) out[str_(header[i])] = i;
    for (let j = 0; j < required.length; j++) {
      if (out[required[j]] === undefined) throw new Error(ERROR.BAD_REQUEST + ': missing column ' + required[j]);
    }
    return out;
  }

  function str_(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }

  return { recordEvent, logMutation };
})();

/**
 * Manual GAS smoke test:
 * 1) Inserts CREATE and STATUS_CHANGE events for B-TEST.
 * 2) Reads back B-TEST events and validates id and ISO timestamps exist.
 */
function testRecordBatchEvents_() {
  const created = Audit_.recordEvent('B-TEST', BATCH_EVENT_TYPE.CREATE, { source: 'manual_test' });
  const changed = Audit_.recordEvent('B-TEST', BATCH_EVENT_TYPE.STATUS_CHANGE, { from: 'created', to: 'drying' });

  const events = BatchEventsRepo_.listBatchEvents('B-TEST');
  const hasCreate = events.some((event) => String(event.request_id || '') === String(created.request_id));
  const hasStatusChange = events.some((event) => String(event.request_id || '') === String(changed.request_id));
  const validIso = events.every((event) => /^\d{4}-\d{2}-\d{2}T/.test(String(event.at || '')));

  return {
    inserted_request_ids: [created.request_id, changed.request_id],
    found_inserted_events: hasCreate && hasStatusChange,
    total_events_for_batch: events.length,
    timestamps_look_iso: validIso,
  };
}
