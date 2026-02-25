# PR-91 — KPI / Deficit Engine v1 (read-only API)

## Endpoint
- **Method:** `GET`
- **Path:** `/api/kpi/deficit`
- **Query params:**
  - `limit_shipments` (optional, default `10`, max `200`)
  - `limit_picking` (optional, default `50`, max `500`)

## Required flags
The endpoint requires all flags to be `TRUE`:
- `PHASE_A_CORE`
- `PICKING_CORE`
- `INVENTORY_CORE`

If any flag is disabled, response is:
- HTTP `400`
- `{ ok: false, code: "FLAG_DISABLED", error: "<message>" }`

## Response 200
```json
{
  "ok": true,
  "generated_at": "2026-01-01T10:00:00.000Z",
  "deficit": {
    "total_missing_qty": 14,
    "top_short_skus": [
      { "sku_id": "SKU-001", "missing_qty": 9 },
      { "sku_id": "SKU-009", "missing_qty": 5 }
    ],
    "picking": {
      "open_lists": 4,
      "open_lines": 8,
      "total_short_qty": 10
    },
    "shipments": {
      "open_shipments": 2,
      "open_lines": 3,
      "total_missing_qty": 4
    }
  },
  "incidents": {
    "open_total": 5,
    "by_zone": {
      "A1": 2,
      "PACK": 3
    }
  }
}
```

## Data behavior
- Read-only aggregation over `picking_lines`, `shipment_lines`, `picking_lists`, `shipments`, and `incidents`.
- No writes to `kpi_daily` (or any other sheet) in v1.
- Defensive parsing: missing optional columns produce zero/empty values rather than runtime errors.
- Empty sheets return `ok: true` with numeric zeros and empty arrays/objects.
