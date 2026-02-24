(function initIncidentsActions_() {
  const INCIDENTS_SHEET = 'incidents';
  const EVENTS_LOG_SHEET = 'events_log';
  const SEVERITY = { low: true, medium: true, high: true };

  Actions_.register_('incidents.list', (ctx) => {
    const payload = ctx && ctx.payload ? ctx.payload : {};
    const limit = normalizeLimit_(payload.limit);

    const incidentsSheet = getIncidentsSheet_();
    const rows = readRowsByHeader_(incidentsSheet);

    const items = rows
      .map((row) => normalizeIncidentRow_(row))
      .filter((row) => row !== null)
      .sort((left, right) => Date.parse(String(right.created_at || '')) - Date.parse(String(left.created_at || '')))
      .slice(0, limit);

    return { items };
  });

  Actions_.register_('incidents.report', (ctx) => {
    const payload = ctx && ctx.payload ? ctx.payload : {};

    const severity = String(payload.severity || '').trim().toLowerCase();
    const zone = String(payload.zone || '').trim();
    const entityType = String(payload.entity_type || '').trim();
    const entityId = String(payload.entity_id || '').trim();
    const title = String(payload.title || '').trim();
    const description = String(payload.description || '').trim();
    const proofRef = String(payload.proof_ref || '').trim();

    if (!SEVERITY[severity]) throw new Error(ERROR.BAD_REQUEST + ': invalid severity');
    if (!zone) throw new Error(ERROR.BAD_REQUEST + ': missing zone');
    if (!entityType) throw new Error(ERROR.BAD_REQUEST + ': missing entity_type');
    if (!entityId) throw new Error(ERROR.BAD_REQUEST + ': missing entity_id');
    if (!title) throw new Error(ERROR.BAD_REQUEST + ': missing title');
    if (!description) throw new Error(ERROR.BAD_REQUEST + ': missing description');

    const sh = getIncidentsSheet_();
    const incidentId = nextIncidentId_(sh);
    const createdAt = nowIso_();

    const actor = ctx && ctx.actor ? ctx.actor : {};
    const reportedByUserId = actorToUserId_(actor);
    const reportedByRoleId = actorToRoleId_(actor);

    appendByHeader_(sh, {
      incident_id: incidentId,
      severity,
      zone,
      entity_type: entityType,
      entity_id: entityId,
      reported_by_user_id: reportedByUserId,
      reported_by_role_id: reportedByRoleId,
      status: 'open',
      title,
      description,
      proof_ref: proofRef,
      created_at: createdAt,
      closed_at: '',
      owner_role_id: '',
    });

    appendEventsLogBestEffort_({
      event_name: 'incident_reported',
      incident_id: incidentId,
      at: createdAt,
      actor: reportedByUserId,
      payload_json: JSON.stringify({ severity, zone, entity_type: entityType, entity_id: entityId }),
    });

    return { incident_id: incidentId };
  });

  function normalizeLimit_(raw) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 50;
    return Math.min(200, Math.floor(parsed));
  }

  function getIncidentsSheet_() {
    const ss = Sys_.ss_(DB.OPS);
    if (!ss) throw new Error('Spreadsheet not configured for ' + DB.OPS);

    const sh = ss.getSheetByName(INCIDENTS_SHEET);
    if (!sh) throw new Error(ERROR.NOT_FOUND + ': incidents sheet not found');
    return sh;
  }

  function normalizeIncidentRow_(row) {
    const incidentId = String(row.incident_id || '').trim();
    const severity = String(row.severity || '').trim().toLowerCase();
    const zone = String(row.zone || '').trim();
    const entityType = String(row.entity_type || '').trim();
    const entityId = String(row.entity_id || '').trim();
    const reportedByUserId = String(row.reported_by_user_id || '').trim();
    const reportedByRoleId = String(row.reported_by_role_id || '').trim();
    const status = String(row.status || '').trim();
    const title = String(row.title || '').trim();
    const description = String(row.description || '').trim();
    const proofRef = String(row.proof_ref || '').trim();
    const createdAt = String(row.created_at || '').trim();
    const closedAt = String(row.closed_at || '').trim();
    const ownerRoleId = String(row.owner_role_id || '').trim();

    if (
      !incidentId ||
      !SEVERITY[severity] ||
      !zone ||
      !entityType ||
      !entityId ||
      !reportedByUserId ||
      !reportedByRoleId ||
      !status ||
      !title ||
      !description ||
      !createdAt
    ) {
      return null;
    }

    return {
      incident_id: incidentId,
      severity,
      zone,
      entity_type: entityType,
      entity_id: entityId,
      reported_by_user_id: reportedByUserId,
      reported_by_role_id: reportedByRoleId,
      status,
      title,
      description,
      proof_ref: proofRef,
      created_at: createdAt,
      closed_at: closedAt,
      owner_role_id: ownerRoleId,
    };
  }

  function actorToUserId_(actor) {
    if (actor && actor.employee_id) return String(actor.employee_id);
    if (actor && actor.id) return String(actor.id);
    return 'system';
  }

  function actorToRoleId_(actor) {
    if (actor && actor.role) return String(actor.role);
    return 'owner';
  }

  function nextIncidentId_(sheet) {
    const rows = readRowsByHeader_(sheet);
    const yymmdd = Utilities.formatDate(new Date(), 'Etc/UTC', 'yyMMdd');
    const prefix = 'INC-' + yymmdd + '-';

    let maxSeq = 0;
    for (let i = 0; i < rows.length; i++) {
      const id = String(rows[i].incident_id || '').trim();
      if (id.indexOf(prefix) !== 0) continue;
      const seqRaw = id.slice(prefix.length);
      const seq = Number(seqRaw);
      if (Number.isFinite(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }

    const next = String(maxSeq + 1).padStart(3, '0');
    return prefix + next;
  }

  function appendEventsLogBestEffort_(rowObj) {
    try {
      const ss = Sys_.ss_(DB.OPS);
      if (!ss) return;

      const sh = ss.getSheetByName(EVENTS_LOG_SHEET);
      if (!sh || sh.getLastRow() < 1 || sh.getLastColumn() < 1) return;

      appendByHeader_(sh, rowObj);
    } catch (_e) {
      // best effort
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

    const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map((v) => String(v).trim());
    const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return data.map((cells) => {
      const row = {};
      for (let i = 0; i < header.length; i++) {
        row[header[i] || ('col_' + i)] = cells[i];
      }
      return row;
    });
  }
})();
