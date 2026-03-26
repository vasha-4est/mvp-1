# MVP-1 PRODUCT ROADMAP (ORCHESTRATOR VERSION)

---

# 1. CURRENT STATE

## Backend (~88%)

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

## Frontend (~55%)

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

### PR-119 — Production Launch Engine (NEXT LOCKED STEP)

- take into work
- assign worker
- status tracking

---

### PR-120 — Production Live View

- who is doing what
- WIP visibility
- anti-duplication

---

## 📦 PHASE 4 — EXECUTION

---

### PR-121 — Picking Lists Engine + UI

---

### PR-122 — Focus Mode (assembly flow)

---

### PR-123 — Assembly Actions

- confirm work
- link to picking

---

### PR-124 — Shipment Execution UI

---

## ⚠️ PHASE 5 — DEFECTS

---

### PR-125 — Defects Flow

---

### PR-126 — Incident Engine

---

## 📦 PHASE 6 — INVENTORY

---

### PR-127 — Manual Inventory Entry

---

## 🧠 PHASE 7 — DECISION LAYER

---

### PR-128 — Control Tower Intelligence

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

1. ⚠️ production planning exists, but no launch/take-into-work flow yet
2. ❌ no picking UI
3. ❌ no execution loop
4. ⚠️ deployed GAS parity for shipment import still needs final confirmation

---

# 5. PROGRESS

| Area        | Progress |
|------------|--------|
| Backend     | 88%    |
| KPI         | 90%    |
| Logistics   | 85%    |
| Production  | 40%    |
| Execution   | 25%    |
| Decision    | 30%    |
| UI          | 55%    |

---

## TOTAL: ~68%

---

# 6. NEXT STEP (LOCKED)

## 👉 PR-118 — Production Planning Engine

RATIONALE:

- everything depends on demand
- production must be driven by shipment plan
- without it:
  - launch meaningless
  - picking disconnected
  - control tower incomplete
