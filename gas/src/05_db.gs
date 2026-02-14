/**
 * Sheet DB helper across multiple spreadsheets.
 * Assumes header row on row 1.
 */

const Db_ = (() => {

  function sheet_(name) {
    return Sys_.sheet_(name);
  }

  function header_(sh) {
    const hdr = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
    return hdr;
  }

  function index_(hdr) {
    const idx = {};
    hdr.forEach((k,i)=> idx[String(k)] = i);
    return idx;
  }

  function rowToObj_(hdr, row) {
    const o = {};
    hdr.forEach((k,i)=>{ o[k] = row[i]; });
    return o;
  }

  function readAll_(name) {
    const sh = sheet_(name);
    const last = sh.getLastRow();
    if (last < 2) return [];
    const hdr = header_(sh);
    const values = sh.getRange(2,1,last-1,hdr.length).getValues();
    return values.map(r => rowToObj_(hdr,r));
  }

  function append_(name, obj) {
    const sh = sheet_(name);
    const hdr = header_(sh);
    const row = hdr.map(k => (obj && Object.prototype.hasOwnProperty.call(obj,k)) ? obj[k] : '');
    sh.appendRow(row);
  }

  function findBy_(name, col, value) {
    const rows = readAll_(name);
    const v = String(value);
    for (let i=0;i<rows.length;i++) {
      if (String(rows[i][col]) === v) return rows[i];
    }
    return null;
  }

  function query_(name, predicateFn) {
    return readAll_(name).filter(predicateFn);
  }

  /**
   * Update a row by primary key with optional optimistic lock.
   * - pkCol: name of primary key column
   * - pkValue: value
   * - patch: map col->new value
   * - expectedVersionId: if provided, compares to 'version_id'
   */
  function updateByPk_(name, pkCol, pkValue, patch, expectedVersionId) {
    const sh = sheet_(name);
    const hdr = header_(sh);
    const idx = index_(hdr);

    const last = sh.getLastRow();
    if (last < 2) return { updated: false, reason: ERROR.NOT_FOUND };
    const data = sh.getRange(2,1,last-1,hdr.length).getValues();

    const pkIdx = idx[pkCol];
    if (pkIdx === undefined) throw new Error('Missing PK col: ' + pkCol + ' in ' + name);

    let found = -1;
    for (let i=0;i<data.length;i++) {
      if (String(data[i][pkIdx]) === String(pkValue)) { found = i; break; }
    }
    if (found === -1) return { updated: false, reason: ERROR.NOT_FOUND };

    // optimistic lock
    if (expectedVersionId !== undefined && expectedVersionId !== null) {
      const vIdx = idx['version_id'];
      if (vIdx === undefined) throw new Error('Missing version_id in ' + name);
      const current = String(data[found][vIdx]);
      if (String(expectedVersionId) !== current) {
        return { updated: false, reason: ERROR.LOCK_CONFLICT, current_version_id: current };
      }
    }

    Object.keys(patch || {}).forEach(k => {
      const cIdx = idx[k];
      if (cIdx !== undefined) data[found][cIdx] = patch[k];
    });

    // bump version_id if exists
    const vIdx2 = idx['version_id'];
    if (vIdx2 !== undefined) {
      const cur = Number(data[found][vIdx2] || 0);
      data[found][vIdx2] = String(cur + 1);
    }

    sh.getRange(found+2,1,1,hdr.length).setValues([data[found]]);
    return { updated: true, row: rowToObj_(hdr, data[found]) };
  }

  return { readAll_, append_, findBy_, query_, updateByPk_, rowToObj_ };
})();
