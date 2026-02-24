/** Feature flags stored in OPS_DB/config_flags */

const Flags_ = (() => {
  function normalizeEnabled_(value) {
    return value === true || value === 'TRUE' || value === 'true' || value === '1' || value === 1;
  }

  function buildFlagsMap_() {
    const rows = Db_.readAll_(SHEET.CONFIG_FLAGS);
    const map = {};

    rows.forEach((row) => {
      const key = String(row.flag_key || '').trim();
      if (!key) return;
      map[key] = normalizeEnabled_(row.enabled);
    });

    return map;
  }

  function load_() {
    const map = buildFlagsMap_();

    // Keep Phase A core enabled by default so action routing is not blocked.
    map[FLAG.PHASE_A_CORE] = true;

    function isOn(key) { return !!map[key]; }
    return { isOn, all: map };
  }

  function set_(ctx, updates) {
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER]);
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);
    if (!Array.isArray(updates) || updates.length === 0) throw new Error(ERROR.BAD_REQUEST + ': updates empty');

    updates.forEach(u => {
      const key = String(u.flag_key || '').trim();
      const rawEnabled = Object.prototype.hasOwnProperty.call(u, 'enabled') ? u.enabled : u.enabled_default;
      const val = normalizeEnabled_(rawEnabled) ? 'TRUE' : 'FALSE';
      if (!key) throw new Error(ERROR.BAD_REQUEST + ': flag_key empty');
      const row = Db_.findBy_(SHEET.CONFIG_FLAGS, 'flag_key', key);
      if (!row) throw new Error(ERROR.NOT_FOUND + ': flag ' + key);
      Db_.updateByPk_(SHEET.CONFIG_FLAGS, 'flag_key', key, { enabled: val, enabled_default: val }, null);
    });

    Events_.log_(ctx, 'flags_updated', 'system', 'flags', { updates });
    return { updated: updates.length };
  }

  return { load_, set_, buildFlagsMap_ };
})();
