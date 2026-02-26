# PR-103 — Smoke (events/recent)

Use `/api/events/recent` as the audit verification source in Preview. This avoids dependency on Control Tower `recent_events` availability.

## Endpoint
- `GET /api/events/recent?limit=20`
- Requires `x-request-id` header.
- Returns newest-first `events_log` rows.

## DevTools script
Use the updated PR-103 smoke script from task notes (the version that calls only `/api/events/recent`).
