/** Feature flags stored in OPS_DB/config_flags */

const Flags_ = (() => {
  function load_() {
    const rows = Db_.readAll_(SHEET.CONFIG_FLAGS);
    const map = {};
    rows.forEach(r => {
      const k = String(r.flag_key || '').trim();
      if (!k) return;
      const on = String(r.enabled_default || '').toUpperCase() === 'TRUE';
      map[k] = on;
    });
    function isOn(key) { return !!map[key]; }
    return { isOn, all: map };
  }

  function set_(ctx, updates) {
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER]);
    Validate_.requireFlag_(ctx.flags, FLAG.PHASE_A_CORE);
    if (!Array.isArray(updates) || updates.length === 0) throw new Error(ERROR.BAD_REQUEST + ': updates empty');

    updates.forEach(u => {
      const key = String(u.flag_key || '').trim();
      const val = String(u.enabled_default || '').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
      if (!key) throw new Error(ERROR.BAD_REQUEST + ': flag_key empty');
      const row = Db_.findBy_(SHEET.CONFIG_FLAGS, 'flag_key', key);
      if (!row) throw new Error(ERROR.NOT_FOUND + ': flag ' + key);
      Db_.updateByPk_(SHEET.CONFIG_FLAGS, 'flag_key', key, { enabled_default: val }, null);
    });

    Events_.log_(ctx, 'flags_updated', 'system', 'flags', { updates });
    return { updated: updates.length };
  }

  return { load_, set_ };
})();
