# PR-13 — Batch GET endpoints

Adds read-side endpoints for batch entities:

- `GET /api/batch/:code`
- `GET /api/batch?status=<>&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&prefix=<str>`

Auth header for all examples:

```http
x-gas-api-key: <GAS_API_KEY>
```

Response shape is normalized in all cases:

```json
{ "ok": true, "data": {} }
```

or

```json
{ "ok": false, "error": "..." }
```


## 0) GAS storage note (PR-13.2)

`batch_fetch` and `batch_list` read directly from `OPS_DB` spreadsheet tab `batch_registry` via `Sys_.ss_(DB.OPS)` + `getSheetByName("batch_registry")`.

This avoids dependency on `SHEET_DB` mapping for `batch_registry`, matching the existing `batch_create` write path.

## 1) Fetch single batch by code

```bash
curl -sS "https://<YOUR_VERCEL_DOMAIN>/api/batch/B-250215-001" \
  -H "x-gas-api-key: <GAS_API_KEY>" | jq
```

Success (`200`):

```json
{
  "ok": true,
  "data": {
    "id": "batch_...",
    "code": "B-250215-001",
    "status": "created",
    "created_at": "2025-02-15T10:11:12.000Z",
    "request_id": "...",
    "note": "smoke"
  }
}
```

Not found (`404`):

```json
{
  "ok": false,
  "error": "NOT_FOUND: batch not found"
}
```

## 2) List batches with optional filters

```bash
curl -sS "https://<YOUR_VERCEL_DOMAIN>/api/batch?status=created&fromDate=2025-02-15&toDate=2025-02-15&prefix=B-250215" \
  -H "x-gas-api-key: <GAS_API_KEY>" | jq
```

Success (`200`):

```json
{
  "ok": true,
  "data": [
    {
      "id": "batch_...",
      "code": "B-250215-001",
      "status": "created",
      "created_at": "2025-02-15T10:11:12.000Z",
      "request_id": "...",
      "note": "smoke"
    }
  ]
}
```

No matches (`200`):

```json
{ "ok": true, "data": [] }
```

Invalid filter format (`400`):

```json
{
  "ok": false,
  "error": "Invalid 'fromDate' format. Expected YYYY-MM-DD"
}
```

## 3) Sanity scripts

```bash
BASE_URL="https://<YOUR_VERCEL_DOMAIN>" GAS_API_KEY="<GAS_API_KEY>" sh scripts/test-batch-fetch.sh
BASE_URL="https://<YOUR_VERCEL_DOMAIN>" GAS_API_KEY="<GAS_API_KEY>" sh scripts/test-batch-list.sh
```
