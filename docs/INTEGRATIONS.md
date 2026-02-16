# Integrations

## System map

```text
[Vercel + Next.js app]
          |
          v
   [GAS WebApp API]
       /       \
      v         v
 [Google Sheets] [Telegram]
```

## Flow summary
- The Next.js app (deployed on Vercel) sends operational requests to a Google Apps Script WebApp.
- GAS validates/transforms requests and writes/reads structured records in Google Sheets.
- GAS (or app-side integration layer) can send notifications to Telegram for important events.

## Environment variables (names only)
- `NEXT_PUBLIC_APP_URL`
- `GAS_WEBAPP_URL`
- `GAS_API_KEY` (server-only)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEETS_ID`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `FEATURE_FLAGS_VERSION`

## Next.js GAS Client

A minimal integration client is available at `lib/integrations/gasClient.ts`.

### Request format

`callGas<T>(action, payload, requestId)` sends a `POST` request to `process.env.GAS_WEBAPP_URL` with JSON body:

```json
{
  "action": "<string>",
  "payload": { "...": "..." },
  "request_id": "<string>"
}
```

`request_id` is required for idempotency.

If `GAS_API_KEY` is set in Next.js environment, the server sends it to GAS in `auth.api_key`.
Set the same `GAS_API_KEY` value in GAS Script Properties and in Vercel env.

### Response contract

The client normalizes responses to:

```ts
{
  ok: boolean;
  data?: T;
  error?: string;
}
```

- Successful responses return `{ ok: true, data }`.
- Any network, timeout, non-2xx, or parsing error returns `{ ok: false, error }`.

## Action: `batch_create`

### Route
- Next.js API route: `POST /api/batch/create`.
- Internally calls: `callGas("batch_create", payload, requestId)`.

### Request body to Next.js route

```json
{
  "note": "smoke",
  "meta": { "source": "preview" },
  "request_id": "optional-idempotency-key"
}
```

- `code` is **not accepted** from clients; it is generated only in GAS.
- `note` is optional.
- `meta` is optional object (forwarded as payload metadata).
- `request_id` is optional for clients; if omitted, the route generates one.

### GAS payload and result

Request sent to GAS:

```json
{
  "action": "batch_create",
  "payload": {
    "note": "smoke",
    "meta": { "source": "preview" }
  },
  "request_id": "..."
}
```

Expected GAS response shape:

```json
{ "ok": true, "data": { "id": "...", "code": "B-250215-001", "status": "created", "created_at": "..." } }
```

or

```json
{ "ok": false, "error": "..." }
```

### Idempotency behavior
- GAS stores `request_id` in the `batch_registry` sheet.
- If `batch_create` is called again with the same `request_id`, GAS returns the existing batch row and does not insert a duplicate.
- HTTP semantics: `201` on create, `200` on replay, and response includes top-level `replayed` boolean.


## Action: `batch_fetch`

### Route
- Next.js API route: `GET /api/batch/:code`.
- Requires header `x-gas-api-key: <GAS_API_KEY>` when `GAS_API_KEY` is configured in environment.
- Internally calls: `callGas("batch_fetch", { code }, requestId)`.

### Query/path behavior
- Path param `:code` is required.
- GAS action also supports lookup by `id` (for internal reuse), but route uses `code`.

### Response behavior
- `200` + `{ ok: true, data: { ...batchRow } }` when found.
- `404` + `{ ok: false, error: "NOT_FOUND: ..." }` when no row exists.

## Action: `batch_list`

### Route
- Next.js API route: `GET /api/batch`.
- Requires header `x-gas-api-key: <GAS_API_KEY>` when `GAS_API_KEY` is configured in environment.
- Internally calls: `callGas("batch_list", filters, requestId)`.

### Supported query params
- `status` — exact match.
- `fromDate=YYYY-MM-DD` — lower bound on `created_at`.
- `toDate=YYYY-MM-DD` — upper bound on `created_at`.
- `prefix` — `code` starts with prefix.

### Response behavior
- `200` + `{ ok: true, data: [] }` when empty.
- `200` + `{ ok: true, data: [ ... ] }` when matches exist.
- `400` + `{ ok: false, error }` for invalid date formats/ranges.


### Preview environment checklist (for `/batches`)
- If `/batches` shows `Unauthorized`/`401` or runtime GAS config errors, verify **Preview** env has:
  - `GAS_API_KEY`
  - `GAS_WEBAPP_URL`
- In Vercel, ensure these variables are assigned to the **Preview** environment (they may not always be inherited as expected).

## Health Endpoint

- `GET /api/gas/health`
- Used to validate app connectivity to the configured GAS WebApp.
- Requires GAS to implement a `ping` action.
- Returns normalized JSON in this shape:
  - Success: `{ ok: true, gas: <response> }`
  - Error: `{ ok: false, error: "...", gas?: <response> }`
