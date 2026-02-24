/**
 * HTTP Router
 * - doPost: /exec endpoint for WebApp
 * - doGet: serve WebApp UI
 */

function doPost(e) {
  const startedAtMs = Date.now();
  let requestId = '';
  let action = '';

  try {
    const bodyStr = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const body = JSON.parse(bodyStr || '{}');

    action = String(body.action || '').trim();
    requestId = String((body.request_id || '')).trim();
    const payload = body.payload || {};
    const auth = body.auth || {};

    if (!action) {
      return finalizeGas_(jsonErr_(ERROR.BAD_REQUEST, 'Missing action'), {
        startedAtMs,
        requestId,
        action: action || 'unknown',
        ok: false,
        errorCode: ERROR.BAD_REQUEST,
        error: 'Missing action',
      });
    }

    if (!requestId) {
      requestId = uuid_();
    }

    // Flags
    const flags = Flags_.load_();
    if (!flags.isOn(FLAG.PHASE_A_CORE)) {
      return finalizeGas_(jsonErr_(ERROR.FLAG_DISABLED, 'PHASE_A_CORE must be enabled'), {
        startedAtMs,
        requestId,
        action,
        ok: false,
        errorCode: ERROR.FLAG_DISABLED,
        error: 'PHASE_A_CORE must be enabled',
      });
    }

    // Idempotency
    if (flags.isOn(FLAG.IDEMPOTENCY_REQUEST_ID)) {
      const cached = Idemp_.get_(requestId, action);
      if (cached) {
        return finalizeGas_(jsonOk_(requestId, cached.data), {
          startedAtMs,
          requestId,
          action,
          ok: true,
        });
      }
    }

    // Auth
    const actor = AuthService_.authenticate_(auth) || Auth_.authenticate_(auth, flags);
    if (!actor) {
      return finalizeGas_(jsonErr_(ERROR.UNAUTHORIZED, 'Auth failed'), {
        startedAtMs,
        requestId,
        action,
        ok: false,
        errorCode: ERROR.UNAUTHORIZED,
        error: 'Auth failed',
      });
    }

    // STOP actions (kill switch)
    const stop = Stop_.check_(actor, action);
    if (stop.blocked) {
      return finalizeGas_(jsonErr_(ERROR.FORBIDDEN, stop.reason), {
        startedAtMs,
        requestId,
        action,
        ok: false,
        errorCode: ERROR.FORBIDDEN,
        error: stop.reason,
      });
    }

    // Dispatch
    const ctx = { requestId, payload, actor, flags };
    const res = Actions_.dispatch_(action, ctx);

    // Cache idempotency response
    if (flags.isOn(FLAG.IDEMPOTENCY_REQUEST_ID)) {
      Idemp_.put_(requestId, action, res);
    }

    return finalizeGas_(jsonOk_(requestId, res), {
      startedAtMs,
      requestId,
      action,
      ok: true,
    });
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    const parsed = parseErrorFromMessage_(message);
    return finalizeGas_(jsonErr_(parsed.code, parsed.message), {
      startedAtMs,
      requestId,
      action: action || 'unknown',
      ok: false,
      errorCode: parsed.code,
      error: parsed.message,
    });
  }
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('99_webapp_ui');
}

function jsonOk_(requestId, data) {
  const out = { ok: true, request_id: requestId, server_ts: nowIso_(), data };
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonErr_(code, message) {
  const out = { ok: false, error: { code, message }, server_ts: nowIso_() };
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function finalizeGas_(response, meta) {
  logJson_({
    ts: nowIso_(),
    request_id: meta.requestId || '',
    action: meta.action,
    ok: meta.ok,
    latency_ms: Math.max(0, Date.now() - meta.startedAtMs),
    ...(meta.errorCode ? { error_code: meta.errorCode } : {}),
    ...(meta.error ? { error: meta.error } : {}),
  });

  return response;
}

function parseErrorFromMessage_(message) {
  const clean = String(message || '').trim();
  const match = clean.match(/^([A-Z_]+)\s*:\s*(.+)$/);
  const passthroughCodes = {
    DRYING_NOT_FINISHED: true,
    ILLEGAL_TRANSITION: true,
    IDEMPOTENCY_KEY_REUSE: true,
    NOT_FOUND: true,
    FLAG_DISABLED: true,
    LOCK_CONFLICT: true,
    INSUFFICIENT_STOCK: true,
    BAD_REQUEST: true,
    CONTROL_MODEL_SHEET_INVALID: true,
    INVALID_PRODUCTS_SKU_SCHEMA: true,
    INTERNAL_ERROR: true,
  };

  if (match && passthroughCodes[match[1]] === true) {
    return {
      code: match[1],
      message: match[2],
    };
  }

  return {
    code: ERROR.BAD_REQUEST,
    message: clean,
  };
}
