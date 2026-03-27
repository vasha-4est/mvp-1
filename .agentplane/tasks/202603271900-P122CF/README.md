---
id: "202603271900-P122CF"
title: "PR-122 picking workspace context + filters"
status: "TODO"
priority: "high"
owner: "ORCHESTRATOR"
revision: 1
depends_on:
  - "202603271200-P121PK"
tags:
  - "code"
  - "backend"
  - "frontend"
  - "ui"
  - "product"
verify:
  - "npm run build"
plan_approval:
  state: "approved"
  updated_at: "2026-03-27T19:00:00.000Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "pending"
  updated_at: null
  updated_by: null
  note: null
commit: null
comments:
  -
    author: "ORCHESTRATOR"
    body: "Next roadmap step after the locally validated PR-121 workspace: make `/picking` match the real shipment-driven operating model by adding destination/deadline business context, filters, pagination, and explicit shortage/rebuild-draft semantics without expanding into focus-mode or shipment execution."
events:
  -
    type: "status"
    at: "2026-03-27T19:00:00.000Z"
    author: "ORCHESTRATOR"
    from: "TODO"
    to: "TODO"
    note: "Prepared next active task record for PR-122 Picking Workspace Context + Filters."
doc_version: 1
doc_updated_at: "2026-03-27T19:00:00.000Z"
doc_updated_by: "ORCHESTRATOR"
description: "Refine the new `/picking` workspace into a production-meaningful logistics surface by exposing shipment context, adding filter/pagination controls, and clarifying how shortage and draft rebuild behave when inventory changes after production replenishment."
sections:
  Summary: |-
    PR-122 picking workspace context + filters

    Refine the new `/picking` workspace into a production-meaningful logistics surface by exposing shipment context, adding filter/pagination controls, and clarifying how shortage and draft rebuild behave when inventory changes after production replenishment.
  Scope: |-
    - In scope: add shipment direction / destination / counterparty-facing context and deadline visibility to the picking workspace.
    - In scope: add fast status filters and pagination to both `Shipment candidates` and `Picking lists`, following the existing `Production Plan` interaction style.
    - In scope: make shortage semantics explicit in UI copy and behavior (`available now` vs `requires production`) and introduce an explicit rebuild-draft action model.
    - In scope: keep existing picking lists immutable execution snapshots; replenished stock should affect rebuilt drafts, not silently mutate created lists.
    - Out of scope: assembly focus mode, shipment execution confirmation UI, station FSM redesign, and unrelated inventory refactors.
  Plan: |-
    1. Implement the change for "PR-122 picking workspace context + filters".
    2. Run required checks and capture verification evidence.
    3. Finalize task findings and stop at smoke/UI output for human validation.
  Verify Steps: |-
    1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
    2. Open `/picking` locally as OWNER/COO. Expected: shipment rows expose direction/destination/deadline context and both shipment/list panels support filters and pagination.
    3. Rebuild a draft after changing the selected shipment context. Expected: shortage semantics remain clear and existing created picking lists do not silently change.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: ""
id_source: "generated"
---
## Summary

PR-122 picking workspace context + filters

Refine the new `/picking` workspace into a production-meaningful logistics surface by exposing shipment context, adding filter/pagination controls, and clarifying how shortage and draft rebuild behave when inventory changes after production replenishment.

## Scope

- In scope: add shipment direction / destination / counterparty-facing context and deadline visibility to the picking workspace.
- In scope: add fast status filters and pagination to both `Shipment candidates` and `Picking lists`, following the existing `Production Plan` interaction style.
- In scope: make shortage semantics explicit in UI copy and behavior (`available now` vs `requires production`) and introduce an explicit rebuild-draft action model.
- In scope: keep existing picking lists immutable execution snapshots; replenished stock should affect rebuilt drafts, not silently mutate created lists.
- Out of scope: assembly focus mode, shipment execution confirmation UI, station FSM redesign, and unrelated inventory refactors.

## Plan

1. Implement the change for "PR-122 picking workspace context + filters".
2. Run required checks and capture verification evidence.
3. Finalize task findings and stop at smoke/UI output for human validation.

## Verify Steps

1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
2. Open `/picking` locally as OWNER/COO. Expected: shipment rows expose direction/destination/deadline context and both shipment/list panels support filters and pagination.
3. Rebuild a draft after changing the selected shipment context. Expected: shortage semantics remain clear and existing created picking lists do not silently change.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
