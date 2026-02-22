/** Read-only BOM and SKU catalog actions. */

(function initBomCatalogActions_() {
  const BOM_REQUIRED_COLUMNS = ['set_sku', 'component_sku', 'qty'];
  const PRODUCTS_SKU_REQUIRED_COLUMNS = ['sku_id', 'sku_name', 'sku_type', 'sub_category', 'active'];

  Actions_.register_('sku_bom_read', (ctx) => {
    try {
      const setSku = String((ctx.payload && ctx.payload.set_sku) || '').trim();
      if (!setSku) {
        throw new Error(ERROR.BAD_REQUEST + ': set_sku is required');
      }

      const sh = Sys_.sheet_(SHEET.SKU_BOM);
      const read = readSheetRows_(sh);

      ensureRequiredColumns_(read.headers, BOM_REQUIRED_COLUMNS, ERROR.BAD_REQUEST, 'sku_bom');

      const rows = read.rows.filter((row) => String(row.set_sku || '').trim() === setSku);
      if (rows.length === 0) {
        throw new Error(ERROR.NOT_FOUND + ': BOM rows not found for set_sku ' + setSku);
      }

      return {
        ok: true,
        set_sku: setSku,
        rows,
      };
    } catch (err) {
      rethrowNormalized_(err);
    }
  });

  Actions_.register_('catalog.products_sku.read', () => {
    try {
      const sh = Sys_.sheet_(SHEET.SKU);
      const read = readSheetRows_(sh);

      ensureRequiredColumns_(read.headers, PRODUCTS_SKU_REQUIRED_COLUMNS, ERROR.INVALID_PRODUCTS_SKU_SCHEMA, 'products_sku');

      return {
        ok: true,
        headers: read.headers,
        rows: read.rows,
      };
    } catch (err) {
      rethrowNormalized_(err);
    }
  });



  function rethrowNormalized_(err) {
    const message = String(err && err.message ? err.message : err);
    if (/^[A-Z_]+\s*:\s*/.test(message)) {
      throw err;
    }

    throw new Error(ERROR.INTERNAL_ERROR + ': ' + message);
  }

  function readSheetRows_(sheet) {
    const lastCol = sheet.getLastColumn();
    if (lastCol < 1) {
      return { headers: [], rows: [] };
    }

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map((value) => String(value || '').trim());
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { headers, rows: [] };
    }

    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    const rows = values.map((row) => {
      const out = {};
      for (let i = 0; i < headers.length; i++) {
        const key = headers[i] || ('col_' + (i + 1));
        out[key] = row[i];
      }
      return out;
    });

    return { headers, rows };
  }

  function ensureRequiredColumns_(headers, requiredColumns, code, sheetName) {
    const missing = requiredColumns.filter((name) => headers.indexOf(name) === -1);
    if (missing.length > 0) {
      throw new Error(code + ': missing required columns in ' + sheetName + ': ' + missing.join(','));
    }
  }
})();
