/** Control model actions for users_directory sheet diagnostics and provisioning helpers. */

(function initControlModelActions_() {
  const HEADER_SCAN_ROWS = 10;

  function normalizeHeader_(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function countNonEmpty_(values) {
    let count = 0;
    for (let i = 0; i < values.length; i++) {
      if (String(values[i] || "").trim()) {
        count += 1;
      }
    }
    return count;
  }

  function getUsersDirectorySheet_() {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET.USERS_DIRECTORY);
    if (!sheet) {
      throw new Error(ERROR.NOT_FOUND + ': sheet not found: ' + SHEET.USERS_DIRECTORY);
    }
    return sheet;
  }

  function readUsersDirectory_(sheet) {
    const scanRows = Math.max(1, Math.min(HEADER_SCAN_ROWS, Math.max(sheet.getLastRow(), HEADER_SCAN_ROWS)));
    const fallbackLastCol = Math.max(1, sheet.getMaxColumns());
    const topRange = sheet.getRange(1, 1, scanRows, fallbackLastCol);
    const lastCol = Math.max(sheet.getLastColumn(), topRange.getLastColumn());
    const topValues = sheet.getRange(1, 1, scanRows, lastCol).getDisplayValues();

    let headerRowIndex = 0;
    for (let i = 0; i < topValues.length; i++) {
      if (countNonEmpty_(topValues[i]) > 0) {
        headerRowIndex = i + 1;
        break;
      }
    }

    if (!headerRowIndex) {
      for (let j = 0; j < topValues.length; j++) {
        if (countNonEmpty_(topValues[j]) >= 2) {
          headerRowIndex = j + 1;
          break;
        }
      }
    }

    const headerRowValues = headerRowIndex > 0 ? sheet.getRange(headerRowIndex, 1, 1, lastCol).getDisplayValues()[0] : [];
    const headersSeen = [];
    for (let k = 0; k < headerRowValues.length; k++) {
      headersSeen.push(normalizeHeader_(headerRowValues[k]));
    }

    const lastRow = sheet.getLastRow();
    const dataRowsValues = [];
    const usersDirectory = [];

    if (headerRowIndex > 0 && lastRow > headerRowIndex) {
      const values = sheet.getRange(headerRowIndex + 1, 1, lastRow - headerRowIndex, lastCol).getDisplayValues();
      for (let rowIdx = 0; rowIdx < values.length; rowIdx++) {
        const row = values[rowIdx];
        if (countNonEmpty_(row) === 0) {
          continue;
        }

        dataRowsValues.push({
          row_index: headerRowIndex + 1 + rowIdx,
          values: row,
        });

        const item = {};
        for (let colIdx = 0; colIdx < headersSeen.length; colIdx++) {
          const key = headersSeen[colIdx] || ('col_' + colIdx);
          item[key] = row[colIdx];
        }
        usersDirectory.push(item);
      }
    }

    return {
      header_row_index: headerRowIndex,
      header_row_values: headerRowValues,
      headers_seen: headersSeen,
      users_directory: usersDirectory,
      data_rows_values: dataRowsValues,
      header_ok: headerRowIndex > 0 && headersSeen.filter((v) => v).length > 0,
    };
  }

  Actions_.register_('control_model.users_directory.read', (ctx) => {
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER, ROLE.CEO]);
    const sheet = getUsersDirectorySheet_();
    return readUsersDirectory_(sheet);
  });

  Actions_.register_('control_model.users_directory.patch_passwords', (ctx) => {
    Validate_.requireRole_(ctx.actor, [ROLE.OWNER, ROLE.CEO]);
    const updates = Array.isArray(ctx.payload && ctx.payload.updates) ? ctx.payload.updates : [];
    const sheet = getUsersDirectorySheet_();
    const snapshot = readUsersDirectory_(sheet);
    const headers = snapshot.headers_seen || [];
    const passwordIndex = headers.indexOf('password');
    const passwordHashIndex = headers.indexOf('password_hash');

    if (passwordIndex === -1 || passwordHashIndex === -1) {
      throw new Error(ERROR.BAD_REQUEST + ': users_directory missing password/password_hash headers');
    }

    let updated = 0;
    for (let i = 0; i < updates.length; i++) {
      const rowIndex = Number(updates[i].row_index);
      const passwordHash = String(updates[i].password_hash || '').trim();
      if (!Number.isFinite(rowIndex) || rowIndex <= snapshot.header_row_index || !passwordHash) {
        continue;
      }

      sheet.getRange(rowIndex, passwordHashIndex + 1).setValue(passwordHash);
      sheet.getRange(rowIndex, passwordIndex + 1).setValue('');
      updated += 1;
    }

    return {
      ok: true,
      updated,
      header_row_index: snapshot.header_row_index,
      header_row_values: snapshot.header_row_values,
      headers_seen: snapshot.headers_seen,
    };
  });
})();

