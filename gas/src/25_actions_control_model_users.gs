(function initControlModelUsersActions_() {
  function normalizeHeader_(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  function requiredHeaders_() {
    return [
      'user_id',
      'login',
      'password_hash',
      'temp_password',
      'must_change_password',
      'is_active',
      'created_at',
      'updated_at',
      'last_login_at',
      'display_name',
      'notes',
    ];
  }

  function headersMap_(headers) {
    const map = {};
    for (var i = 0; i < headers.length; i += 1) {
      map[normalizeHeader_(headers[i])] = i;
    }

    return map;
  }

  function normalizeRecord_(raw) {
    const userId = String(raw.user_id || '').trim();
    const login = String(raw.login || '').trim() || (userId.indexOf('user_') === 0 ? userId.substring(5) : userId);
    const passwordHash = String(raw.password_hash || '').trim();
    const tempPassword = String(raw.temp_password || '').trim();
    const mustChange = raw.must_change_password === '' || raw.must_change_password === undefined
      ? (!!tempPassword && !passwordHash)
      : ['true', '1', 'yes'].indexOf(String(raw.must_change_password).trim().toLowerCase()) >= 0;

    return {
      user_id: userId,
      login: login,
      password_hash: passwordHash,
      temp_password: tempPassword,
      must_change_password: mustChange,
      is_active: ['false', '0', 'no'].indexOf(String(raw.is_active).trim().toLowerCase()) < 0,
      created_at: String(raw.created_at || raw.start_date || '').trim(),
      updated_at: String(raw.updated_at || '').trim(),
      last_login_at: String(raw.last_login_at || '').trim(),
      display_name: String(raw.display_name || '').trim(),
      notes: String(raw.notes || '').trim(),
    };
  }

  Actions_.register_('control_model.users_directory.read', function (ctx) {
    const sh = Sys_.sheet_(SHEET.USERS_DIRECTORY);
    const lastRow = sh.getLastRow();
    const lastColumn = Math.max(1, sh.getLastColumn());
    const headers = sh.getRange(1, 1, 1, lastColumn).getValues()[0];
    const map = headersMap_(headers);
    const required = requiredHeaders_();
    const headerOk = required.every(function (header) { return map[header] !== undefined; });

    const rows = [];
    if (lastRow >= 2) {
      const values = sh.getRange(2, 1, lastRow - 1, lastColumn).getValues();
      for (var i = 0; i < values.length; i += 1) {
        const raw = {};
        for (var c = 0; c < headers.length; c += 1) {
          raw[normalizeHeader_(headers[c])] = values[i][c];
        }
        rows.push(normalizeRecord_(raw));
      }
    }

    return {
      spreadsheet_id_present: !!Sys_.dbId_(DB.CTRL),
      users_directory_found: true,
      header_ok: headerOk,
      headers: headers,
      rows: rows,
    };
  });

  Actions_.register_('control_model.users_directory.bulk_update', function (ctx) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const updates = (ctx.payload && ctx.payload.updates) || [];
      const sh = Sys_.sheet_(SHEET.USERS_DIRECTORY);
      const lastRow = sh.getLastRow();
      const lastColumn = Math.max(1, sh.getLastColumn());
      const headers = sh.getRange(1, 1, 1, lastColumn).getValues()[0];
      const map = headersMap_(headers);
      const required = requiredHeaders_();
      const headerOk = required.every(function (header) { return map[header] !== undefined; });

      const data = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, lastColumn).getValues() : [];
      var updated = 0;

      for (var i = 0; i < updates.length; i += 1) {
        var patch = updates[i].patch || {};
        var userId = String(updates[i].user_id || '').trim();
        if (!userId) continue;

        for (var r = 0; r < data.length; r += 1) {
          var rowUserId = String(data[r][map['user_id']] || '').trim();
          if (rowUserId !== userId) continue;

          Object.keys(patch).forEach(function (key) {
            var idx = map[normalizeHeader_(key)];
            if (idx !== undefined) {
              data[r][idx] = patch[key];
            }
          });

          updated += 1;
          break;
        }
      }

      if (data.length > 0) {
        sh.getRange(2, 1, data.length, lastColumn).setValues(data);
      }

      return {
        ok: true,
        updated: updated,
        header_ok: headerOk,
        users_directory_found: true,
        spreadsheet_id_present: !!Sys_.dbId_(DB.CTRL),
      };
    } finally {
      lock.releaseLock();
    }
  });
})();
