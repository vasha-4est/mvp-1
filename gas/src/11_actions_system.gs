/** System / catalog actions */

(function initSystemActions_(){

  Actions_.register_('flags.get', (ctx)=>{
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER, ROLE.CEO]);
    return { flags: ctx.flags.all };
  });

  Actions_.register_('flags.set', (ctx)=>{
    return Flags_.set_(ctx, ctx.payload.updates || []);
  });

  Actions_.register_('catalog.bootstrap', (ctx)=>{
    // What UI needs at app start: user, roles, zones, stations, sku, etc
    const zones = Db_.readAll_(SHEET.ZONES);
    const stations = Db_.readAll_(SHEET.STATIONS);
    const sku = Db_.readAll_(SHEET.SKU);
    const roles = Db_.readAll_(SHEET.ROLES_CATALOG); // from CONTROL_MODEL
    return {
      actor: ctx.actor,
      flags: ctx.flags.all,
      zones,
      stations,
      sku,
      roles,
    };
  });

})();
