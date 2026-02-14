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
  "code": "TEST-001",
  "note": "smoke",
  "meta": { "source": "preview" },
  "request_id": "optional-idempotency-key"
}
```

- `code` is required and must be a non-empty string.
- `note` is optional.
- `meta` is optional object (forwarded as payload metadata).
- `request_id` is optional for clients; if omitted, the route generates one.

### GAS payload and result

Request sent to GAS:

```json
{
  "action": "batch_create",
  "payload": {
    "code": "TEST-001",
    "note": "smoke",
    "meta": { "source": "preview" }
  },
  "request_id": "..."
}
```

Expected GAS response shape:

```json
{ "ok": true, "data": { "id": "...", "code": "TEST-001", "status": "created", "created_at": "..." } }
```

or

```json
{ "ok": false, "error": "..." }
```

### Idempotency behavior
- GAS stores `request_id` in the `batch_registry` sheet.
- If `batch_create` is called again with the same `request_id`, GAS returns the existing batch row and does not insert a duplicate.

## Health Endpoint

- `GET /api/gas/health`
- Used to validate app connectivity to the configured GAS WebApp.
- Requires GAS to implement a `ping` action.
- Returns normalized JSON in this shape:
  - Success: `{ ok: true, gas: <response> }`
  - Error: `{ ok: false, error: "...", gas?: <response> }`
