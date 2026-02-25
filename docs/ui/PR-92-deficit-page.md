# PR-92 — Deficit/KPI UI

## What was added
- New read-only page at `/kpi/deficit`.
- The page fetches `GET /api/kpi/deficit?limit_shipments=10&limit_picking=50`.
- The page renders:
  - Summary cards for total missing qty, picking short qty, and open incidents.
  - Top shortage SKU table (first 10 rows).
  - By-zone incidents table.
- Graceful states:
  - `FLAG_DISABLED` (HTTP 400 + `error` containing `FLAG_DISABLED`) => friendly feature-disabled message.
  - Any other non-OK response => generic retry-friendly message.
  - Empty arrays/objects render empty table states without crashing.

## Control Tower integration
- Added a small "Deficit" section in Control Tower with a link to `/kpi/deficit`.
- Added an app top-nav link (`Deficit KPI`) for quick access.

## Verification
1. Open `/kpi/deficit` and confirm cards + tables or empty/disabled/error state are visible.
2. Open `/control-tower` and confirm "Deficit" section includes link to `/kpi/deficit`.
