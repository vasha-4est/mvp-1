/** Inventory actions */

(function initInventoryActions_(){

  Actions_.register_('inventory.balance.get', (ctx)=>{
    Validate_.requireFlag_(ctx.flags, FLAG.INVENTORY_CORE);
    // payload: { sku_id?, location_id? }
    const skuId = String(ctx.payload.sku_id || '').trim();
    const locId = String(ctx.payload.location_id || '').trim();
    let rows = Db_.readAll_(SHEET.INVENTORY);
    if (skuId) rows = rows.filter(r => String(r.sku_id) === skuId);
    if (locId) rows = rows.filter(r => String(r.location_id) === locId);
    return { balances: rows };
  });

})();
