/** Admin sync actions (Phase A): keep OPS_DB caches in sync from CONTROL_MODEL */

(function initAdminSyncActions_(){

  Actions_.register_('admin.users_directory_cache.refresh', (ctx)=>{
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER, ROLE.CEO]);
    const source = Sys_.ss_(DB.CTRL).getSheetByName(SHEET.USERS_DIRECTORY);
    const target = Sys_.ss_(DB.OPS).getSheetByName(SHEET.USERS_DIRECTORY_CACHE);
    if (!source || !target) throw new Error('Missing users_directory / users_directory_cache sheets');

    const srcRange = source.getDataRange().getValues();
    target.clearContents();
    target.getRange(1,1,srcRange.length, srcRange[0].length).setValues(srcRange);

    Events_.log_(ctx, 'users_directory_cache_refreshed', 'system', 'users_directory_cache', { rows: srcRange.length-1 });
    return { ok: true, rows: srcRange.length-1 };
  });

})();
