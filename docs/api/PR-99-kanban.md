# PR-99 — Basic Kanban API (read-only)

## Endpoint

`GET /api/kanban`

Authenticated read-only endpoint returning Kanban cards based on `OPS_DB.work_items` via GAS action `kanban.get`.

## Query params

- `zone` (optional)
- `station` (optional)
- `status` (optional)
- `limit` (optional, default `200`, max `500`)
- `cursor` (optional)

## Response shape

```json
{
  "ok": true,
  "generated_at": "2026-01-01T00:00:00.000Z",
  "tz": "UTC",
  "filters": {
    "zone": "assembly",
    "station": "assembly-1",
    "status": "open",
    "limit": 200,
    "cursor": null
  },
  "columns": [
    { "key": "open", "title": "Open", "count": 12 }
  ],
  "items": [
    {
      "work_item_id": "wi_123",
      "zone": "assembly",
      "station": "assembly-1",
      "task_type": "pick",
      "status": "open",
      "priority": 2,
      "entity_type": "batch",
      "entity_id": "BATCH-001",
      "assignee_user_id": null,
      "assignee_role_id": null,
      "due_at": null,
      "created_at": "2026-01-01T00:00:00.000Z",
      "taken_at": null,
      "done_at": null,
      "blocked_reason": null,
      "entity_label": "BATCH-001",
      "sku_id": "SKU-1",
      "qty": 5,
      "payload_json": { "sku_id": "SKU-1", "qty": 5 }
    }
  ],
  "cursor": null
}
```

## Error behavior

- `401 UNAUTHORIZED` when session is missing.
- `400 VALIDATION_ERROR` when `limit` is invalid.
- `502 BAD_GATEWAY` when upstream GAS fails or times out.
- `x-request-id` response header is present for both success and error responses.
