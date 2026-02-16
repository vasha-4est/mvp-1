/**
 * @typedef {'CREATE'|'STATUS_CHANGE'|'DRY_END_SET'|'CUSTOM'} BatchEventType
 */

/**
 * @typedef {Object} BatchEvent
 * @property {string} event_id
 * @property {string} batch_code
 * @property {BatchEventType} type
 * @property {string} actor
 * @property {string} at
 * @property {string} payload
 */

const BATCH_EVENT_TYPE = {
  CREATE: 'CREATE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  DRY_END_SET: 'DRY_END_SET',
  CUSTOM: 'CUSTOM',
};
