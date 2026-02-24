/** Idempotency store: OPS_DB/idempotency_log */

const Idemp_ = (() => {
  function get_(requestId, action) {
    const req = String(requestId || "").trim();
    if (!req) return null;

    if (action) {
      const rows = Db_.query_(SHEET.IDEMP, (row) => String(row.request_id) === req && String(row.action) === String(action));
      if (rows.length > 0) {
        return { action: rows[0].action, data: JSON.parse(rows[0].response_json || '{}') };
      }
    }

    const row = Db_.findBy_(SHEET.IDEMP, 'request_id', req);
    if (!row) return null;
    return { action: row.action, data: JSON.parse(row.response_json || '{}') };
  }

  function put_(requestId, action, responseObj) {
    const existing = get_(requestId, action);
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
