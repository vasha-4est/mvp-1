# CURRENT STATE

## Merged product work
...
- PR-114 — shipment readiness
- PR-115 — control tower readiness integration
- PR-116 — control tower prioritization layer
- PR-117 — shipment plan import workspace
- PR-118 — production planning engine
- PR-119 — production launch engine
- PR-120 — production live view
- PR-121 — picking lists engine + UI

## Reality
- backend and API signals are ahead of UI
- logistics input now has a dedicated `/shipments/import` workspace
- production planning and launch now exist in `/production/plan`, including worker assignment, status flow, done qty, batch id generation, filters, sorting, and pagination
- supervisors now have `/production/live` for active WIP by worker, status slices, and anti-duplication visibility across launch items
- supervisors now also have a first `/picking` workspace that can build shipment-driven drafts, create picking lists, and confirm lines in a locally smokeable flow
- the current `/picking` surface is still a transitional bridge: even with PR-122 context/filter improvements, it still thinks in shipment/picking terms instead of the real `1 counterparty = 1 assembly sheet` operating model
- owner clarified that one assembly sheet may include one or many destination warehouses for the same counterparty, and that this must work not only for marketplaces but also for online/offline stores and wholesale orders
- the real paper workflow is matrix-based: `SKU x destination warehouse`, with per-warehouse priority and ship-date context, row/column totals, and optional intermediate category totals
- existing picking lists are still treated as immutable execution snapshots; replenished stock affects a rebuilt draft, not an already created list
- picker workflow is still incomplete: focus mode, compact/detailed sheet modes, box/cargo-place capture, and structured per-cell picker accountability are not yet first-class in the product
- OPS_DB already contains a usable execution skeleton (`picking_lists`, `picking_lines`, `shipments`, `shipment_lines`, `inventory_balances`, `locations`, `work_items`), so the next step should evolve the current domain rather than create a second parallel logistics store
- repeated `take` on already active production launch items is now conflict-protected instead of silently reassigning work
- stations are still mostly read-only
- no real worker loop yet

## Next planned product step
- PR-123 — assembly sheets + focus mode
- goal: reframe `/picking` into a universal assembly-sheet workspace where `1 counterparty = 1 sheet`, warehouses remain matrix columns, supervisors can switch between compact/detailed modes, and pickers work primarily in single-warehouse focus mode
