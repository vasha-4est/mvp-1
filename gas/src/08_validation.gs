/** Validation & RBAC helpers (Phase A minimal). */

const Validate_ = (() => {

  function requireFlag_(flags, flagKey) {
    if (!flags.isOn(flagKey)) throw new Error(ERROR.FLAG_DISABLED + ': ' + flagKey);
  }

  function requireRole_(actor, allowedRoles) {
    const r = String(actor.role || '').trim();
    if (allowedRoles.indexOf(r) === -1) throw new Error(ERROR.FORBIDDEN + ': role ' + r);
  }

  function requireFields_(obj, fields) {
    fields.forEach(f=>{
      if (obj[f] === undefined || obj[f] === null || String(obj[f]).trim() === '') {
        throw new Error(ERROR.BAD_REQUEST + ': missing ' + f);
      }
    });
  }

  return { requireFlag_, requireRole_, requireFields_ };
})();
