---
id: "202603271200-P121PK"
title: "PR-121 picking lists engine + UI"
status: "TODO"
priority: "high"
owner: "ORCHESTRATOR"
revision: 1
depends_on:
  - "202603262040-L4N8Q2"
tags:
  - "code"
  - "backend"
  - "frontend"
  - "ui"
verify:
  - "npm run build"
plan_approval:
  state: "approved"
  updated_at: "2026-03-27T12:00:00.000Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "approved"
  updated_at: "2026-03-27T20:30:00.000Z"
  updated_by: "ORCHESTRATOR"
  note: "PR-121 was locally validated by the human and then merged; roadmap step complete."
commit: null
comments:
  -
    author: "ORCHESTRATOR"
    body: "Next locked step: Implement PR-121 Picking Lists Engine + UI by turning shipment demand into actionable picking lists with a dedicated operator-facing workspace and clear execution state, without entering focus-mode or shipment execution scope."
  -
    author: "ORCHESTRATOR"
    body: "Human validated localhost smoke and UI flow for the new `/picking` workspace; keep PR-121 merge-pending and treat PR-122 as the next roadmap step for shipment context, filters, pagination, and clarified shortage behavior."
  -
    author: "ORCHESTRATOR"
    body: "Human confirmed PR-121 was merged and local/main repositories were synchronized; treat PR-121 as complete and PR-122 as the locked next step."
events:
  -
    type: "status"
    at: "2026-03-27T12:00:00.000Z"
    author: "ORCHESTRATOR"
    from: "TODO"
    to: "TODO"
    note: "Prepared next active task record for the roadmap-locked PR-121 Picking Lists Engine + UI step."
  -
    type: "status"
    at: "2026-03-27T20:30:00.000Z"
    author: "ORCHESTRATOR"
    from: "TODO"
    to: "DONE"
    note: "PR-121 merged after human-validated localhost smoke and UI flow."
doc_version: 1
doc_updated_at: "2026-03-27T12:00:00.000Z"
doc_updated_by: "ORCHESTRATOR"
description: "Build the next execution dependency after production live visibility: generate governed picking lists from shipment/production state, expose them in a dedicated UI, and keep the change additive to existing logistics and production flows."
sections:
  Summary: |-
    PR-121 picking lists engine + UI

    Build the next execution dependency after production live visibility: generate governed picking lists from shipment/production state, expose them in a dedicated UI, and keep the change additive to existing logistics and production flows.
  Scope: |-
    - In scope: generate actionable picking lists from the current shipment/production state using existing logistics domains where possible.
    - In scope: expose a dedicated picking UI for OWNER/COO and logistics staff with clear list state and line visibility.
    - In scope: keep all mutations auditable and additive without redesigning focus mode or shipment execution.
    - Out of scope: assembly focus mode, shipment execution confirmation UI, defects flow, and unrelated inventory refactors.
  Plan: |-
    1. Implement the change for "PR-121 picking lists engine + UI".
    2. Run required checks and capture verification evidence.
    3. Finalize task findings and stop at smoke/UI output for human validation.
  Verify Steps: |-
    1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
    2. Open the picking workspace locally as OWNER/COO. Expected: actionable picking lists and list lines are visible with deterministic state.
    3. Cross-check one shipment against the new picking surface. Expected: picking scope aligns with current shipment and production state without duplicate execution ambiguity.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    - 2026-03-27: human-validated localhost smoke and UI flow for `/picking` including draft build, list creation, and line confirmation.
    - 2026-03-27: human confirmed PR-121 was merged and local/main repositories were synchronized.
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: "PR-121 is complete and merged; the next scoped gap is shipment-context UX and filtering/pagination on `/picking`."
id_source: "generated"
---
## Summary

PR-121 picking lists engine + UI

Build the next execution dependency after production live visibility: generate governed picking lists from shipment/production state, expose them in a dedicated UI, and keep the change additive to existing logistics and production flows.

## Scope

- In scope: generate actionable picking lists from the current shipment/production state using existing logistics domains where possible.
- In scope: expose a dedicated picking UI for OWNER/COO and logistics staff with clear list state and line visibility.
- In scope: keep all mutations auditable and additive without redesigning focus mode or shipment execution.
- Out of scope: assembly focus mode, shipment execution confirmation UI, defects flow, and unrelated inventory refactors.

## Plan

1. Implement the change for "PR-121 picking lists engine + UI".
2. Run required checks and capture verification evidence.
3. Finalize task findings and stop at smoke/UI output for human validation.

## Verify Steps

1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
2. Open the picking workspace locally as OWNER/COO. Expected: actionable picking lists and list lines are visible with deterministic state.
3. Cross-check one shipment against the new picking surface. Expected: picking scope aligns with current shipment and production state without duplicate execution ambiguity.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
- 2026-03-27: human-validated localhost smoke and UI flow for `/picking` including draft build, list creation, and line confirmation.
- 2026-03-27: human confirmed PR-121 was merged and local/main repositories were synchronized.
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
PR-121 is complete and merged; the next scoped gap is shipment-context UX and filtering/pagination on `/picking`.
