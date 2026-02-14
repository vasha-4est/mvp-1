/**
 * STOP actions: emergency blocks.
 * Controlled by CONTROL_MODEL/stop_actions.
 */

const Stop_ = (() => {
  function check_(actor, action) {
    const rows = Db_.readAll_(SHEET.STOP_ACTIONS);
    // Expected columns: is_enabled, action, role, reason
    for (let i=0;i<rows.length;i++) {
      const r = rows[i];
      if (String(r.is_enabled) !== 'TRUE') continue;
      const a = String(r.action || '').trim();
      const role = String(r.role || '').trim();
      if (a && a !== action) continue;
      if (role && role !== String(actor.role || '').trim()) continue;
      return { blocked: true, reason: String(r.reason || 'Blocked by stop_actions') };
    }
    return { blocked: false, reason: '' };
  }
  return { check_ };
})();
