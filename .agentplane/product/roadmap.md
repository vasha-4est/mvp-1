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

### PR-121 — Picking Lists Engine + UI (LOCAL VALIDATED / MERGE PENDING)

- dedicated `/picking` workspace
- shipment-driven draft suggestions from current inventory state
- create governed picking lists
- confirm picking lines
- local smoke validated, roadmap completion waits for merge

---

### PR-122 — Picking Workspace Context + Filters

- add shipment direction / destination / counterparty context
- add deadline / planned date visibility
- group demand closer to `counterparty -> destination warehouse -> SKU`
- add status filters and pagination to `Shipment candidates`
- add status filters and pagination to `Picking lists`
- clarify shortage semantics (`available now` vs `requires production`)
- support explicit `Rebuild draft` behavior without silently mutating existing picking lists

---

### PR-123 — Focus Mode (assembly flow)

---

### PR-124 — Assembly Actions

- confirm work
- link to picking

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
2. ⚠️ picking workspace exists, but lacks destination/deadline context, grouping, filters, and pagination
3. ❌ no closed loop between replenished production output and next picking decision
4. ⚠️ deployed GAS parity for shipment import still needs final confirmation

---

# 5. PROGRESS

| Area        | Progress |
|------------|--------|
| Backend     | 90%    |
| KPI         | 90%    |
| Logistics   | 88%    |
| Production  | 72%    |
| Execution   | 40%    |
| Decision    | 30%    |
| UI          | 65%    |

---

## TOTAL: ~74%

---

# 6. NEXT STEP (LOCKED)

## 👉 PR-122 — Picking Workspace Context + Filters

RATIONALE:

- PR-121 already proved the picking workspace can execute the basic flow
- the current blocker is not “can we pick at all”, but “can supervisors pick with real shipment context”
- without destination / counterparty / deadline context:
  - picking remains operationally ambiguous
  - shortage signals are hard to interpret
  - existing picking lists are disconnected from the real shipment structure
- without filters and pagination:
  - the workspace will stop being usable as shipment volume grows
  - supervisors cannot reliably prioritize open work
- this is the smallest coherent step before focus mode and shipment execution
