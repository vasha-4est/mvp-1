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
