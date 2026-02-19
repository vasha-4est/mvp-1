/**
 * CONTROL_MODEL actions for users_directory reads/updates with strict header detection.
 */

(() => {
  const REQUIRED_LOGICAL = ['id', 'username', 'password'];
  const HEADER_ALIASES = {
    id: ['id', 'user_id'],
    username: ['username', 'login'],
    password: ['password', 'password_hash'],
  };

  function cleanText_(value) {
    return String(value == null ? '' : value)
      .replace(/\uFEFF/g, '')
      .replace(/[\u200B-\u200D\u2060]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  function toLogicalField_(headerName) {
    const normalized = cleanText_(headerName);
    for (const logical in HEADER_ALIASES) {
      if (HEADER_ALIASES[logical].indexOf(normalized) !== -1) {
        return logical;
      }
    }
    return normalized;
  }

  function sheetNames_(ss) {
    return ss.getSheets().map((s) => s.getName());
  }

  function invalidSheetError_(meta) {
    throw new Error(ERROR.CONTROL_MODEL_SHEET_INVALID + ': ' + JSON.stringify(meta));
  }

  function inspectUsersDirectory_(requestedSheetName) {
    const spreadsheetId = Sys_.dbId_(DB.CTRL);
    const ss = Sys_.ss_(DB.CTRL);
    const available = ss ? sheetNames_(ss) : [];
    const sh = ss ? ss.getSheetByName(requestedSheetName) : null;

    if (!sh) {
      invalidSheetError_({
        spreadsheet_id: spreadsheetId,
        requested_sheet_name: requestedSheetName,
        available_sheet_names: available,
      });
    }

    const lastRow = sh.getLastRow();
    const lastCol = sh.getLastColumn();
    const scanRows = Math.min(5, Math.max(lastRow, 1));
    const scanCols = Math.max(lastCol, 1);
    const scannedRows = sh.getRange(1, 1, scanRows, scanCols).getValues();

    let headerRowIndex = null;
    let headerRowValues = [];
    let headersSeen = [];
    let missingRequired = REQUIRED_LOGICAL.slice();

    for (let i = 0; i < scannedRows.length; i++) {
      const row = scannedRows[i];
      const hasAnyValue = row.some((cell) => cleanText_(cell) !== '');
      if (!hasAnyValue) {
        continue;
      }

      const normalized = row.map((cell) => toLogicalField_(cell));
      const uniq = {};
      normalized.forEach((name) => {
        if (name) {
          uniq[name] = true;
        }
      });

      const missing = REQUIRED_LOGICAL.filter((required) => !uniq[required]);
      if (missing.length === 0) {
        headerRowIndex = i + 1;
        headerRowValues = row;
        headersSeen = normalized;
        missingRequired = [];
        break;
      }

      if (headerRowIndex === null) {
        headerRowValues = row;
        headersSeen = normalized;
        missingRequired = missing;
      }
    }

    const debug = {
      users_directory_found: true,
      available_sheet_names: available,
      header_row_index: headerRowIndex,
      header_row_values: headerRowValues,
      headers_seen: headersSeen,
      missing_required: missingRequired,
      header_ok: headerRowIndex !== null,
      sheet_last_row: lastRow,
      sheet_last_col: lastCol,
      scanned_rows_preview: scannedRows,
      spreadsheet_id: spreadsheetId,
      requested_sheet_name: requestedSheetName,
    };

    if (headerRowIndex === null) {
      invalidSheetError_({
        spreadsheet_id: spreadsheetId,
        requested_sheet_name: requestedSheetName,
        available_sheet_names: available,
        sheet_last_row: lastRow,
        sheet_last_col: lastCol,
        scanned_rows_preview: scannedRows,
        headers_seen: headersSeen,
        missing_required: missingRequired,
      });
    }

    return {
      sheet: sh,
      headerRowIndex,
      headerRowValues,
      headersSeen,
      debug,
    };
  }

  function rowsToUsers_(inspection) {
    const sh = inspection.sheet;
    const header = inspection.headerRowValues;
    const normalized = inspection.headersSeen;
    const lastRow = sh.getLastRow();
    if (lastRow <= inspection.headerRowIndex) {
      return [];
    }

    const numRows = lastRow - inspection.headerRowIndex;
    const values = sh.getRange(inspection.headerRowIndex + 1, 1, numRows, Math.max(header.length, 1)).getValues();

    const users = [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const obj = {};
      for (let c = 0; c < normalized.length; c++) {
        const key = normalized[c] || ('col_' + c);
        obj[key] = row[c];
      }
      const id = String(obj.id || obj.user_id || '').trim();
      const username = String(obj.username || obj.login || '').trim();
      if (!id || !username) {
        continue;
      }
      users.push(obj);
    }

    return users;
  }

  function findCellValue_(rowObj, keys) {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (Object.prototype.hasOwnProperty.call(rowObj, k)) {
        return rowObj[k];
      }
    }
    return '';
  }

  Actions_.register_('control_model.users_directory.read', (ctx) => {
    const requestedSheetName = String((ctx.payload && ctx.payload.sheet_name) || SHEET.USERS_DIRECTORY).trim() || SHEET.USERS_DIRECTORY;
    const inspection = inspectUsersDirectory_(requestedSheetName);
    const rawUsers = rowsToUsers_(inspection);

    const users = rawUsers.map((row) => ({
      id: String(findCellValue_(row, ['id', 'user_id']) || '').trim(),
      username: String(findCellValue_(row, ['username', 'login']) || '').trim(),
      password: String(findCellValue_(row, ['password']) || '').trim(),
      password_hash: String(findCellValue_(row, ['password_hash']) || '').trim(),
      is_active: String(findCellValue_(row, ['is_active']) || '').trim(),
      roles: String(findCellValue_(row, ['roles']) || '').trim(),
      created_at: String(findCellValue_(row, ['created_at']) || '').trim(),
      updated_at: String(findCellValue_(row, ['updated_at']) || '').trim(),
      last_login_at: String(findCellValue_(row, ['last_login_at']) || '').trim(),
      notes: String(findCellValue_(row, ['notes']) || '').trim(),
      display_name: String(findCellValue_(row, ['display_name']) || '').trim(),
    }));

    return {
      users,
      debug: inspection.debug,
    };
  });

  Actions_.register_('control_model.users_directory.update_passwords', (ctx) => {
    const requestedSheetName = String((ctx.payload && ctx.payload.sheet_name) || SHEET.USERS_DIRECTORY).trim() || SHEET.USERS_DIRECTORY;
    const updates = Array.isArray(ctx.payload && ctx.payload.updates) ? ctx.payload.updates : [];
    const inspection = inspectUsersDirectory_(requestedSheetName);
    const sh = inspection.sheet;
    const header = inspection.headerRowValues;
    const normalized = inspection.headersSeen;

    const idIndex = normalized.indexOf('id');
    const passwordHashIndex = normalized.indexOf('password_hash');
    const passwordIndex = normalized.indexOf('password');
    const updatedAtIndex = normalized.indexOf('updated_at');

    if (idIndex === -1 || (passwordHashIndex === -1 && passwordIndex === -1)) {
      invalidSheetError_({
        spreadsheet_id: Sys_.dbId_(DB.CTRL),
        requested_sheet_name: requestedSheetName,
        available_sheet_names: inspection.debug.available_sheet_names,
        sheet_last_row: inspection.debug.sheet_last_row,
        sheet_last_col: inspection.debug.sheet_last_col,
        scanned_rows_preview: inspection.debug.scanned_rows_preview,
        headers_seen: normalized,
        missing_required: REQUIRED_LOGICAL.filter((field) => normalized.indexOf(field) === -1),
      });
    }

    const lastRow = sh.getLastRow();
    if (lastRow <= inspection.headerRowIndex || updates.length === 0) {
      return { updated: 0, mode: passwordHashIndex !== -1 ? 'password_hash' : 'password' };
    }

    const mode = passwordHashIndex !== -1 ? 'password_hash' : 'password';
    const height = lastRow - inspection.headerRowIndex;
    const data = sh.getRange(inspection.headerRowIndex + 1, 1, height, Math.max(header.length, 1)).getValues();
    const byId = {};

    for (let i = 0; i < updates.length; i++) {
      const item = updates[i] || {};
      const id = String(item.id || '').trim();
      const hash = String(item.password_hash || '').trim();
      if (id && hash) {
        byId[id] = hash;
      }
    }

    let updated = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const id = String(row[idIndex] || '').trim();
      if (!id || !byId[id]) {
        continue;
      }

      row[mode === 'password_hash' ? passwordHashIndex : passwordIndex] = byId[id];
      if (updatedAtIndex !== -1) {
        row[updatedAtIndex] = nowIso_();
      }
      updated += 1;
    }

    if (updated > 0) {
      sh.getRange(inspection.headerRowIndex + 1, 1, data.length, data[0].length).setValues(data);
    }

    return { updated, mode };
  });
})();
