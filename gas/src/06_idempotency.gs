/** Idempotency store: OPS_DB/idempotency_log */

const Idemp_ = (() => {
  function get_(requestId) {
    const row = Db_.findBy_(SHEET.IDEMP, 'request_id', requestId);
    if (!row) return null;
    return { action: row.action, data: JSON.parse(row.response_json || '{}') };
  }

  function put_(requestId, action, responseObj) {
    const existing = Db_.findBy_(SHEET.IDEMP, 'request_id', requestId);
    if (existing) return;
    Db_.append_(SHEET.IDEMP, {
      request_id: requestId,
      action,
      response_json: JSON.stringify(responseObj || {}),
      created_at: nowIso_(),
    });
  }
  return { get_, put_ };
})();
