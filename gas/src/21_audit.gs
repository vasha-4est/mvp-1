/** Append-only batch audit helpers. */

const Audit_ = (() => {
  /**
   * @param {string} batchCode
   * @param {BatchEventType} type
   * @param {*} payload
   * @param {string=} actor
   * @returns {BatchEvent}
   */
  function recordEvent(batchCode, type, payload, actor) {
    const event = {
      event_id: uuid_(),
      batch_code: String(batchCode || ''),
      type: String(type || BATCH_EVENT_TYPE.CUSTOM),
      actor: actor ? String(actor) : '',
      at: nowIso_(),
      payload: JSON.stringify(payload || {}),
    };

    if (!event.batch_code) {
      throw new Error(ERROR.BAD_REQUEST + ': batch_code is required');
    }

    return BatchEventsRepo_.insertBatchEvent(event);
  }

  return { recordEvent };
})();

/**
 * Manual GAS smoke test:
 * 1) Inserts CREATE and STATUS_CHANGE events for B-TEST.
 * 2) Reads back B-TEST events and validates id and ISO timestamps exist.
 */
function testRecordBatchEvents_() {
  const created = Audit_.recordEvent('B-TEST', BATCH_EVENT_TYPE.CREATE, { source: 'manual_test' });
  const changed = Audit_.recordEvent('B-TEST', BATCH_EVENT_TYPE.STATUS_CHANGE, { from: 'created', to: 'drying' });

  const events = BatchEventsRepo_.listBatchEvents('B-TEST');
  const hasCreate = events.some((event) => String(event.event_id || '') === String(created.event_id));
  const hasStatusChange = events.some((event) => String(event.event_id || '') === String(changed.event_id));
  const validIso = events.every((event) => /^\d{4}-\d{2}-\d{2}T/.test(String(event.at || '')));

  return {
    inserted_event_ids: [created.event_id, changed.event_id],
    found_inserted_events: hasCreate && hasStatusChange,
    total_events_for_batch: events.length,
    timestamps_look_iso: validIso,
  };
}
