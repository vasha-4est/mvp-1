/** Events read actions */

(function initEventsActions_() {
  const DEFAULT_LIMIT = 20;
  const MAX_LIMIT = 200;
  const MAX_SCAN_ROWS = 1000;

  Actions_.register_('events.recent', (ctx) => {
    const payload = ctx.payload || {};
    const limit = normalizeLimit_(payload.limit);
    const nowIso = nowIso_();

    const sheet = Sys_.sheet_(SHEET.EVENTS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return {
        ok: true,
        generated_at: nowIso,
        items: [],
      };
    }

    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    const idx = index_(header, [
      'event_id',
      'created_at',
      'event_type',
      'entity_type',
      'entity_id',
      'actor_user_id',
      'actor_role_id',
      'source',
      'request_id',
      'payload_json',
    ]);

    const availableRows = lastRow - 1;
    const scanRows = Math.min(Math.max(limit * 5, limit), availableRows, MAX_SCAN_ROWS);
    const startRow = lastRow - scanRows + 1;
    const values = sheet.getRange(startRow, 1, scanRows, header.length).getValues();

    const rows = [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const createdAt = str_(row[idx.created_at]);
      const ts = Date.parse(createdAt);
      rows.push({
        row_no: startRow + i,
        event_id: str_(row[idx.event_id]),
        created_at: createdAt,
        event_type: str_(row[idx.event_type]),
        entity_type: str_(row[idx.entity_type]),
        entity_id: str_(row[idx.entity_id]),
        actor_user_id: str_(row[idx.actor_user_id]),
        actor_role_id: str_(row[idx.actor_role_id]),
        source: str_(row[idx.source]),
        request_id: str_(row[idx.request_id]),
        payload_json: str_(row[idx.payload_json]),
        created_ts: Number.isFinite(ts) ? ts : null,
      });
    }

    rows.sort((a, b) => {
      if (a.created_ts !== null && b.created_ts !== null) return b.created_ts - a.created_ts;
      if (a.created_ts !== null) return -1;
      if (b.created_ts !== null) return 1;
      return b.row_no - a.row_no;
    });

    const items = [];
    for (let j = 0; j < rows.length && items.length < limit; j++) {
      items.push({
        event_id: rows[j].event_id,
        created_at: rows[j].created_at,
        event_type: rows[j].event_type,
        entity_type: rows[j].entity_type,
        entity_id: rows[j].entity_id,
        actor_user_id: rows[j].actor_user_id,
        actor_role_id: rows[j].actor_role_id,
        source: rows[j].source,
        request_id: rows[j].request_id,
        payload_json: rows[j].payload_json,
      });
    }

    return {
      ok: true,
      generated_at: nowIso,
      items,
    };
  });

  function normalizeLimit_(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.floor(n));
  }

  function index_(header, required) {
    const out = {};
    for (let i = 0; i < header.length; i++) out[str_(header[i])] = i;
    for (let j = 0; j < required.length; j++) {
      if (out[required[j]] === undefined) {
        throw new Error(ERROR.BAD_REQUEST + ': missing column ' + required[j]);
      }
    }
    return out;
  }

  function str_(value) {
    return String(value === undefined || value === null ? '' : value).trim();
  }
})();
