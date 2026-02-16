const BatchFsm_ = (() => {
  const DEFAULT_DRYING_HOURS = 24;
  const VALID_STATUSES = ['created', 'production', 'drying', 'ready', 'closed'];
  const ALLOWED_TRANSITIONS = {
    created: ['production'],
    production: ['drying'],
    drying: ['ready'],
    ready: ['closed'],
    closed: [],
  };

  function isValidStatus_(status) {
    return VALID_STATUSES.indexOf(String(status || '').trim()) !== -1;
  }

  function validateTransition_(fromStatus, toStatus) {
    const from = String(fromStatus || '').trim();
    const to = String(toStatus || '').trim();

    if (!isValidStatus_(from) || !isValidStatus_(to)) {
      return false;
    }

    const allowed = ALLOWED_TRANSITIONS[from] || [];
    return allowed.indexOf(to) !== -1;
  }

  function computeDryEndAt_(nowDate) {
    const now = nowDate instanceof Date ? nowDate : new Date();
    return new Date(now.getTime() + DEFAULT_DRYING_HOURS * 60 * 60 * 1000).toISOString();
  }

  return {
    DEFAULT_DRYING_HOURS,
    ALLOWED_TRANSITIONS,
    isValidStatus_,
    validateTransition_,
    computeDryEndAt_,
  };
})();
