/**
 * HTTP Router
 * - doPost: /exec endpoint for WebApp
 * - doGet: serve WebApp UI
 */

function doPost(e) {
  try {
    const bodyStr = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const body = JSON.parse(bodyStr || '{}');

    const action = String(body.action || '').trim();
    const requestId = String(body.request_id || '').trim();
    const payload = body.payload || {};
    const auth = body.auth || {};

    if (!action) return jsonErr_(ERROR.BAD_REQUEST, 'Missing action');
    if (!requestId) return jsonErr_(ERROR.BAD_REQUEST, 'Missing request_id');

    // Flags
    const flags = Flags_.load_();
    if (!flags.isOn(FLAG.PHASE_A_CORE)) {
      return jsonErr_(ERROR.FLAG_DISABLED, 'PHASE_A_CORE must be enabled');
    }

    // Idempotency
    if (flags.isOn(FLAG.IDEMPOTENCY_REQUEST_ID)) {
      const cached = Idemp_.get_(requestId);
      if (cached) {
        return jsonOk_(requestId, cached.data);
      }
    }

    // Auth
    const actor = Auth_.authenticate_(auth, flags);
    if (!actor) return jsonErr_(ERROR.UNAUTHORIZED, 'Auth failed');

    // STOP actions (kill switch)
    const stop = Stop_.check_(actor, action);
    if (stop.blocked) return jsonErr_(ERROR.FORBIDDEN, stop.reason);

    // Dispatch
    const ctx = { requestId, payload, actor, flags };
    const res = Actions_.dispatch_(action, ctx);

    // Cache idempotency response
    if (flags.isOn(FLAG.IDEMPOTENCY_REQUEST_ID)) {
      Idemp_.put_(requestId, action, res);
    }

    return jsonOk_(requestId, res);
  } catch (err) {
    return jsonErr_(ERROR.BAD_REQUEST, String(err && err.stack ? err.stack : err));
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
