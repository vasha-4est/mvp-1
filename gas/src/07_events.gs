/** Events log: OPS_DB/events_log */

const Events_ = (() => {
  function log_(ctx, eventKey, zoneId, objectType, payload) {
    if (!ctx.flags.isOn(FLAG.EVENT_LOG)) return;
    Db_.append_(SHEET.EVENTS, {
      event_id: uuid_(),
      server_ts: nowIso_(),
      request_id: ctx.requestId,
      event_key: eventKey,
      zone_id: zoneId || '',
      object_type: objectType || '',
      payload_json: JSON.stringify(payload || {}),
      actor_employee_id: ctx.actor.employee_id,
      actor_role: ctx.actor.role,
    });
  }

  return { log_ };
})();
