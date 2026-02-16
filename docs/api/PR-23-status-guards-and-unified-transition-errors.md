# PR-23 — Status Guards & Unified Transition Errors (FSM hardening)

## Endpoint

`PATCH /api/batch/:code/status`

Request body:

```json
{
  "to_status": "production | drying | ready | closed",
  "idempotency_key": "required-string"
}
```

## Error model

Conflict errors return HTTP 409 with this payload shape:

```json
{
  "ok": false,
  "error": "<human message>",
  "code": "<MACHINE_CODE>",
  "details": {
    "...": "optional"
  }
}
```

Validation errors remain HTTP 400.
Not found remains HTTP 404 with `code: "NOT_FOUND"`.
Unauthorized remains HTTP 401 with `code: "UNAUTHORIZED"`.

## curl verify script

Set env first:

```bash
export BASE_URL="http://localhost:3000"
```

### 1) Create batch → production → drying (happy path)

```bash
curl -sS -X POST "$BASE_URL/api/batch/create" \
  -H "Content-Type: application/json" \
  -d '{"note":"PR-23 happy path"}'
```

Copy `data.code` from the response:

```bash
export BATCH_CODE="B-YYMMDD-NNN"
```

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -d '{"to_status":"production","idempotency_key":"pr23-prod-1"}'
```

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -d '{"to_status":"drying","idempotency_key":"pr23-drying-1"}'
```

### 2) drying → ready too early => 409 DRYING_NOT_FINISHED with details.dry_end_at

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -d '{"to_status":"ready","idempotency_key":"pr23-ready-too-early"}'
```

### 3) illegal transition created → ready => 409 ILLEGAL_TRANSITION with details.from/to

Create another fresh batch and copy its code:

```bash
curl -sS -X POST "$BASE_URL/api/batch/create" \
  -H "Content-Type: application/json" \
  -d '{"note":"PR-23 illegal transition"}'

export FRESH_BATCH_CODE="B-YYMMDD-NNN"
```

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$FRESH_BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -d '{"to_status":"ready","idempotency_key":"pr23-illegal-1"}'
```

### 4) idempotency replay same key same to_status => 200 replayed:true

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -d '{"to_status":"drying","idempotency_key":"pr23-drying-1"}'
```

### 5) idempotency key reuse different to_status => 409 IDEMPOTENCY_KEY_REUSE

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -d '{"to_status":"ready","idempotency_key":"pr23-drying-1"}'
```

## Rollback

- Pure code rollback: revert this PR.
- No sheet migrations required.
