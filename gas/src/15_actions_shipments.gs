/** Shipments actions for Logistics UI */

(function initShipmentsActions_(){

  Actions_.register_('shipments.list', (ctx)=>{
    // logistics sees shipments but OPS_DB access is via webapp
    const status = String(ctx.payload.status || '').trim();
    let rows = Db_.readAll_(SHEET.SHIPMENTS);
    if (status) rows = rows.filter(r => String(r.status) === status);
    return { shipments: rows };
  });

  Actions_.register_('shipments.get', (ctx)=>{
    Validate_.requireFields_(ctx.payload, ['shipment_id']);
    const shipmentId = String(ctx.payload.shipment_id).trim();
    const shipment = Db_.findBy_(SHEET.SHIPMENTS, 'shipment_id', shipmentId);
    if (!shipment) throw new Error(ERROR.NOT_FOUND + ': shipment');

    const lines = Db_.readAll_(SHEET.SHIPMENT_LINES).filter(l => String(l.shipment_id) === shipmentId);
    const pickingLines = Db_.readAll_(SHEET.PICKING_LINES).filter(pl => String(pl.shipment_id) === shipmentId);
    const agg = Db_.findBy_(SHEET.SHIPMENTS_AGG, 'shipment_id', shipmentId);

    return { shipment, lines, picking_lines: pickingLines, aggregates: agg || {} };
  });

})();
