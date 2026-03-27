# MVP-1 PRODUCT ROADMAP (ORCHESTRATOR VERSION)

---

# 1. CURRENT STATE

## Backend (~90%)

DONE:
- Batch Engine (FSM, idempotency, locking)
- Inventory Engine (reserve/release/moves)
- Picking core (partial)
- Shipment Readiness Engine
- Production Planning Engine
- Control Tower aggregation
- KPI layer
- Alerts / thresholds
- EOD snapshot
- Payroll engine

LOGISTICS:
- Shipment plan import — DONE / merged, deployed GAS parity to verify

---

## Frontend (~65%)

- Control Tower UI — basic
- KPI dashboard — exists, not actionable
- Production Plan UI — actionable read-only
- Stations — read-only

MISSING:
- production UI
- picking UI
- shipment execution UI
- defects UI
- inventory UI

---

## Reality

- system not used by workers
- no closed loop
- no real prioritization
- no execution control

---

# 2. TARGET STATE

System = **операционная система цеха**

---

## Control Tower

- WIP
- Drying
- Shipment readiness
- Production plan
- Shipment plan
- Priorities
- Risks
- Recommendations

KEY:
→ "what to do now"

---

## Production Layer

- production_plan
- production_launch
- live workload
- anti-duplication

---

## Logistics

- shipment plan
- picking lists
- focus mode
- shipment execution

---

## Stations

- assembly
- packaging
- labeling
- QC

→ ACTIONABLE (not read-only)

---

## Defects

- defect capture
- root cause
- task creation

---

## Decision Layer

- risk signals
- recommendations
- bottlenecks

---

## Worker UI

- tasks
- priorities
- next actions

---

# 3. PHASES (SYNCHRONIZED WITH REAL PRs)

---

## ✅ PHASE 1 — VISIBILITY (DONE ~90%)

- PR-114 — shipment readiness
- PR-115 — control tower integration
- PR-116 — prioritization layer

---

## ✅ PHASE 2 — LOGISTICS INPUT (DONE / DEPLOY PARITY PENDING)

### PR-117 — Shipment plan import workspace (DONE / MERGED)

- robust import
- preview
- supersede logic
- UX
- moved from `/owner` to `/shipments/import`
- accepts header rows and canonical raw rows
- retry uses stable request_id to avoid duplicate imports after timeout

---

## 🔥 PHASE 3 — PRODUCTION CORE (CRITICAL)

### PR-118 — Production Planning Engine (DONE / MERGED)

shipment_plan → demand → production_plan

- dedicated `/production/plan` workspace
- Control Tower production-plan summary
- actionable shortage priorities only
- verified with staged demo batch `IMP-PR118-DEMO-001`

---

### PR-119 — Production Launch Engine (DONE / MERGED)

- take into work
- assign worker
- status tracking

---

### PR-120 — Production Live View (DONE / MERGED)

- who is doing what
- WIP visibility
- anti-duplication

---

## 📦 PHASE 4 — EXECUTION

---

### PR-121 — Picking Lists Engine + UI (DONE / MERGED)

- dedicated `/picking` workspace
- shipment-driven draft suggestions from current inventory state
- create governed picking lists
- confirm picking lines
- merged after local smoke and UI validation

---

### PR-122 — Picking Workspace Context + Filters

- add shipment direction / destination / counterparty context
- add deadline / planned date visibility
- group demand closer to `counterparty -> destination warehouse -> SKU`
- add status filters and pagination to `Shipment candidates`
- add status filters and pagination to `Picking lists`
- clarify shortage semantics (`available now` vs `requires production`)
- support explicit `Rebuild draft` behavior without silently mutating existing picking lists
- keep this step narrow: it improves the transitional `/picking` surface, but does not yet remodel execution around the real universal assembly-sheet workflow

---

### PR-123 — Focus Mode (assembly flow)

- reframe `/picking` toward universal `assembly sheets` instead of marketplace-only shipment picking
- canonical execution object = `1 counterparty = 1 assembly sheet`
- support counterparties with one or many destination warehouses inside the same sheet
- add sheet list view with compact / detailed modes
- make matrix view operator-meaningful: `SKU x destination warehouse`
- show warehouse priority and planned ship date above each destination column
- make focus mode the primary picker workflow: one warehouse at a time, neighboring columns hidden
- keep matrix mode for supervisors/logistics review
- preserve additive migration from existing `picking_lists` / `picking_lines` instead of inventing a second parallel domain

---

### PR-124 — Assembly Actions

- confirm work at cell level
- auto-capture acting picker from authenticated user
- require underpick reason when closing an incomplete cell / warehouse / sheet
- capture packed box / cargo-place reference
- link execution back to the governing assembly sheet
- make responsibility traceable for downstream counterparty / marketplace penalties

---

### PR-125 — Shipment Execution UI

---

## ⚠️ PHASE 5 — DEFECTS

---

### PR-126 — Defects Flow

---

### PR-127 — Incident Engine

---

## 📦 PHASE 6 — INVENTORY

---

### PR-128 — Manual Inventory Entry

---

## 🧠 PHASE 7 — DECISION LAYER

---

### PR-129 — Control Tower Intelligence

- recommendations
- bottlenecks
- risk scoring

---

## 🎨 PHASE 8 — UX POLISH

- remove timezone noise
- date pickers
- search
- filters
- simplify UI

---

# 4. CRITICAL GAPS

1. ⚠️ production planning and launch exist, but downstream logistics still need shipment-context execution UX
2. ⚠️ the current `/picking` surface is still a transitional shipment/picking model; the real operating object should be a universal counterparty-driven assembly sheet
3. ⚠️ picker UX still lacks a warehouse focus mode, compact/detailed sheet modes, and a matrix that matches the real paper assembly sheet
4. ⚠️ picker accountability is incomplete: per-cell actor trace, packed box reference, and structured underpick reasons are not yet first-class workflow elements
5. ❌ no closed loop between replenished production output and the next assembly-sheet decision
6. ⚠️ deployed GAS parity for shipment import still needs final confirmation

---

# 5. PROGRESS

| Area        | Progress |
|------------|--------|
| Backend     | 90%    |
| KPI         | 90%    |
| Logistics   | 86%    |
| Production  | 72%    |
| Execution   | 35%    |
| Decision    | 30%    |
| UI          | 60%    |

---

## TOTAL: ~74%

---

# 6. NEXT STEP (LOCKED)

## 👉 PR-123 — Assembly Sheets + Focus Mode

RATIONALE:

- owner clarified that the real execution unit is not “one shipment”, but `one counterparty = one assembly sheet`
- one assembly sheet may contain one or many destination warehouses, with per-warehouse priority and ship-date context
- the current `/picking` UX is therefore only a transitional bridge, even after PR-122 context/filter improvements
- the next blocker is not filters anymore, but the mismatch between UI model and real logistics work:
  - pickers need focus mode on a single warehouse to avoid reading the wrong column
  - logistics needs compact/detailed views of the same assembly sheet
  - supervisors need the sheet matrix to stay readable for many warehouses and many SKU rows
- this is the smallest coherent product step before cell-level assembly actions, box tracking, and shipment execution
