/**
 * @typedef {'batch_created'|'batch_status_changed'|'dry_end_at_set'|'custom'} BatchEventType
 */

/**
 * @typedef {Object} BatchEvent
 * @property {string} at
 * @property {string} batch_code
 * @property {string} batch_id
 * @property {BatchEventType} type
 * @property {string} actor
 * @property {string} request_id
 * @property {string} details_json
 */

const BATCH_EVENT_TYPE = {
  CREATE: 'batch_created',
  STATUS_CHANGE: 'batch_status_changed',
  DRY_END_SET: 'dry_end_at_set',
  CUSTOM: 'custom',
};
