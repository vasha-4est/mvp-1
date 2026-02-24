(function initIncidentsActions_() {
  const INCIDENTS_SHEET = 'incidents';
  const INCIDENTS_HEADERS = ['incident_id', 'type', 'severity', 'message', 'created_at', 'created_by', 'meta_json'];

  const EVENTS_LOG_SHEET = 'events_log';

  const ALLOWED_SEVERITY = {
    low: true,
    medium: true,
    high: true,
  };

  Actions_.register_('incidents.list', (ctx) => {
    const payload = ctx && ctx.payload ? ctx.payload : {};
    const limit = normalizeLimit_(payload.limit);

    const incidentsSheet = ensureIncidentsSheet_();
    const rows = readRowsByHeader_(incidentsSheet);

    const items = rows
      .map((row) => toIncidentItem_(row))
      .filter((item) => item !== null)
      .sort((left, right) => Date.parse(String(right.created_at || '')) - Date.parse(String(left.created_at || '')))
      .slice(0, limit);

    return { items };
  });

  Actions_.register_('incidents.report', (ctx) => {
    const payload = ctx && ctx.payload ? ctx.payload : {};

    const type = String(payload.type || '').trim();
    const message = String(payload.message || '').trim();
    const severity = String(payload.severity || '').trim().toLowerCase();

    if (!type) {
      throw new Error(ERROR.BAD_REQUEST + ': missing type');
    }

    if (!message) {
      throw new Error(ERROR.BAD_REQUEST + ': missing message');
    }

    if (!ALLOWED_SEVERITY[severity]) {
      throw new Error(ERROR.BAD_REQUEST + ': invalid severity');
    }

    const meta = toMetaObject_(payload.meta);
    const incidentId = 'inc_' + uuid_();
    const createdAt = nowIso_();
    const createdBy = actorToCreatedBy_(ctx && ctx.actor ? ctx.actor : null);

    const incidentsSheet = ensureIncidentsSheet_();
    appendByHeader_(incidentsSheet, {
      incident_id: incidentId,
      type,
      severity,
      message,
      created_at: createdAt,
      created_by: createdBy,
      meta_json: meta ? JSON.stringify(meta) : '',
    });

    appendEventsLogBestEffort_({
      event_name: 'incident_reported',
      incident_id: incidentId,
      at: createdAt,
      actor: createdBy,
      payload_json: JSON.stringify({ type, severity }),
    });

    return {
      incident_id: incidentId,
    };
  });

  function normalizeLimit_(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 50;
    return Math.min(200, Math.floor(parsed));
  }

  function toMetaObject_(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    return raw;
  }

  function toIncidentItem_(row) {
    const incidentId = String(row.incident_id || '').trim();
    const type = String(row.type || '').trim();
    const severity = String(row.severity || '').trim().toLowerCase();
    const message = String(row.message || '').trim();
    const createdAt = String(row.created_at || '').trim();
    const createdBy = String(row.created_by || '').trim();

    if (!incidentId || !type || !message || !createdAt || !createdBy || !ALLOWED_SEVERITY[severity]) {
      return null;
    }

    const out = {
      incident_id: incidentId,
      type,
      severity,
      message,
      created_at: createdAt,
      created_by: createdBy,
    };

    const meta = parseMeta_(row.meta_json);
    if (meta) {
      out.meta = meta;
    }

    return out;
  }

  function parseMeta_(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_e) {}

    return null;
  }

  function actorToCreatedBy_(actor) {
    if (actor && actor.employee_id) return String(actor.employee_id);
    if (actor && actor.uid) return String(actor.uid);
    return 'system';
  }

  function ensureIncidentsSheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) throw new Error('Spreadsheet not configured for ' + DB.OPS);

    let sh = ss.getSheetByName(INCIDENTS_SHEET);
    if (!sh) {
      sh = ss.insertSheet(INCIDENTS_SHEET);
      sh.getRange(1, 1, 1, INCIDENTS_HEADERS.length).setValues([INCIDENTS_HEADERS]);
      return sh;
    }

    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, INCIDENTS_HEADERS.length).setValues([INCIDENTS_HEADERS]);
      return sh;
    }

    const header = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), INCIDENTS_HEADERS.length)).getValues()[0].map(String);
    const valid = INCIDENTS_HEADERS.every((name, index) => String(header[index] || '').trim() === name);
    if (!valid) {
      throw new Error(ERROR.BAD_REQUEST + ': invalid headers in sheet incidents');
    }

    return sh;
  }

  function appendEventsLogBestEffort_(rowObj) {
    try {
      const ss = Sys_.ss_(DB.OPS);
      if (!ss) return;

      const sh = ss.getSheetByName(EVENTS_LOG_SHEET);
      if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return;

      appendByHeader_(sh, rowObj);
    } catch (_e) {
      // best effort, ignore
    }
  }

  function appendByHeader_(sh, rowObj) {
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const values = header.map((key) => (Object.prototype.hasOwnProperty.call(rowObj, key) ? rowObj[key] : ''));
    sh.appendRow(values);
  }

  function readRowsByHeader_(sh) {
    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();

    if (lastRow < 2 || lastCol < 1) return [];

    const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map((value) => String(value).trim());
    const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return data.map((cells) => {
      const row = {};
      for (let i = 0; i < header.length; i++) {
        const key = header[i] || ('col_' + i);
        row[key] = cells[i];
      }
      return row;
    });
  }
})();
