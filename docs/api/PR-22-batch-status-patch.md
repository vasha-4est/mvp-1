# PR-22 — Batch Status Transition Engine (FSM)

## Endpoint

`PATCH /api/batch/:code/status`

Request body:

```json
{
  "to_status": "production | drying | ready | closed",
  "idempotency_key": "required-string"
}
```

## curl verify script

Set env first:

```bash
export BASE_URL="http://localhost:3000"
export GAS_API_KEY="your-key"
```

### 1) Create a batch for the main flow (201)

```bash
curl -sS -X POST "$BASE_URL/api/batch/create" \
  -H "Content-Type: application/json" \
  -H "x-gas-api-key: $GAS_API_KEY" \
  -d '{"note":"PR-22 test batch"}'
```

Copy `data.code` from the response:

```bash
export BATCH_CODE="B-YYMMDD-NNN"
```

### 2) created -> production (200, replayed:false)

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -H "x-gas-api-key: $GAS_API_KEY" \
  -d '{"to_status":"production","idempotency_key":"pr22-prod-1"}'
```

### 3) Repeat same request (200, replayed:true)

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -H "x-gas-api-key: $GAS_API_KEY" \
  -d '{"to_status":"production","idempotency_key":"pr22-prod-1"}'
```

### 4) production -> drying (200, sets dry_end_at once)

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -H "x-gas-api-key: $GAS_API_KEY" \
  -d '{"to_status":"drying","idempotency_key":"pr22-drying-1"}'
```

### 5) drying -> ready immediately (409, code=DRYING_NOT_FINISHED)

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -H "x-gas-api-key: $GAS_API_KEY" \
  -d '{"to_status":"ready","idempotency_key":"pr22-ready-too-early"}'
```

### 6) Illegal transition created -> ready (409, code=ILLEGAL_TRANSITION)

Create another fresh batch and copy its code:

```bash
curl -sS -X POST "$BASE_URL/api/batch/create" \
  -H "Content-Type: application/json" \
  -H "x-gas-api-key: $GAS_API_KEY" \
  -d '{"note":"PR-22 illegal transition test"}'

export FRESH_BATCH_CODE="B-YYMMDD-NNN"
```

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$FRESH_BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -H "x-gas-api-key: $GAS_API_KEY" \
  -d '{"to_status":"ready","idempotency_key":"pr22-illegal-1"}'
```

### 7) Reuse idempotency key with different to_status (409, code=IDEMPOTENCY_KEY_REUSE)

```bash
curl -sS -X PATCH "$BASE_URL/api/batch/$BATCH_CODE/status" \
  -H "Content-Type: application/json" \
  -H "x-gas-api-key: $GAS_API_KEY" \
  -d '{"to_status":"closed","idempotency_key":"pr22-drying-1"}'
```

## Rollback

- Code rollback: revert this PR.
- Data rollback: not required. The `batch_status_idempotency` sheet can remain in OPS_DB.
