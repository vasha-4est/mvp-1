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

## Validated local branch work (not merged yet)
- PR-121 — picking lists engine + UI

## Reality
- backend and API signals are ahead of UI
- logistics input now has a dedicated `/shipments/import` workspace
- production planning and launch now exist in `/production/plan`, including worker assignment, status flow, done qty, batch id generation, filters, sorting, and pagination
- supervisors now have `/production/live` for active WIP by worker, status slices, and anti-duplication visibility across launch items
- supervisors now also have a first `/picking` workspace that can build shipment-driven drafts, create picking lists, and confirm lines in a locally smokeable flow
- the current `/picking` surface is still only a first execution slice: it lacks destination/deadline context, hierarchy by counterparty and destination warehouse, and production-grade filtering/pagination
- existing picking lists are still treated as immutable execution snapshots; replenished stock affects a rebuilt draft, not an already created list
- repeated `take` on already active production launch items is now conflict-protected instead of silently reassigning work
- stations are still mostly read-only
- no real worker loop yet

## Next planned product step
- PR-122 — picking workspace context + filters
- goal: bring `/picking` closer to the real shipment-driven operating model by adding direction/destination/deadline context, shipment grouping semantics, status filters, pagination, and explicit shortage/rebuild-draft behavior
