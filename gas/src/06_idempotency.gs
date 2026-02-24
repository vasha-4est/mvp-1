/** Idempotency store: OPS_DB/idempotency_log */

const Idemp_ = (() => {
  function get_(requestId, action) {
    const req = String(requestId || '').trim();
    if (!req) return null;

    const rows = Db_.query_(SHEET.IDEMP, (row) => {
      if (String(row.request_id) !== req) return false;
      if (action && String(row.action) !== String(action)) return false;
      return true;
    });

    if (rows.length === 0) return null;
    return { action: rows[0].action, data: null };
  }

  function put_(requestId, action) {
    const existing = get_(requestId, action);
    if (existing) return;

    Db_.append_(SHEET.IDEMP, {
      request_id: requestId,
      action,
      created_at: nowIso_(),
    });
  }

  return { get_, put_ };
})();
