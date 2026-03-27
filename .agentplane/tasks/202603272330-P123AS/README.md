---
id: "202603272330-P123AS"
title: "PR-123 assembly sheets + focus mode"
status: "TODO"
priority: "high"
owner: "ORCHESTRATOR"
revision: 1
depends_on:
  - "202603271900-P122CF"
tags:
  - "code"
  - "backend"
  - "frontend"
  - "ui"
  - "product"
verify:
  - "npm run build"
  - "npx tsc --noEmit"
plan_approval:
  state: "approved"
  updated_at: "2026-03-27T23:30:00.000Z"
  updated_by: "ORCHESTRATOR"
  note: "Owner clarified the real logistics object and explicitly redirected the next step from shipment-picking UX into universal assembly sheets."
verification:
  state: "pending"
  updated_at: null
  updated_by: null
  note: null
commit: null
comments:
  -
    author: "ORCHESTRATOR"
    body: "PR-123 is no longer a vague 'focus mode' placeholder. It is the first real assembly-sheet step: reframe `/picking` into a universal `assembly sheet` workspace where `1 counterparty = 1 sheet`, warehouses stay as matrix columns, and pickers work primarily in warehouse focus mode."
events:
  -
    type: "status"
    at: "2026-03-27T23:30:00.000Z"
    author: "ORCHESTRATOR"
    from: "TODO"
    to: "TODO"
    note: "Prepared the next active task record for PR-123 Assembly Sheets + Focus Mode."
doc_version: 1
doc_updated_at: "2026-03-27T23:30:00.000Z"
doc_updated_by: "ORCHESTRATOR"
description: "Turn the transitional shipment-driven picking surface into the first true assembly-sheet workspace: universal by counterparty, matrix-capable for supervisors, and warehouse-focused for pickers."
sections:
  Summary: |-
    PR-123 assembly sheets + focus mode

    Turn the transitional shipment-driven picking surface into the first true assembly-sheet workspace: universal by counterparty, matrix-capable for supervisors, and warehouse-focused for pickers.
  Scope: |-
    - In scope: redefine the main execution object as `1 counterparty = 1 assembly sheet`, not marketplace-only shipment picking.
    - In scope: support one or many destination warehouses inside the same sheet and show their priority + planned ship date in the UI.
    - In scope: add compact and detailed sheet modes for logistics / supervisors.
    - In scope: add warehouse focus mode as the primary picker workflow; when a warehouse is focused, neighboring columns should be hidden to reduce picking mistakes.
    - In scope: keep the implementation additive on top of `picking_lists` / `picking_lines` where possible instead of inventing a second operational domain.
    - Out of scope: full shipment execution closing, box / cargo-place traceability per action, and final picker accountability workflow; those belong to the next step.
  Plan: |-
    1. Reframe the existing `/picking` route into an `assembly sheets` surface with universal counterparty-first terminology.
    2. Implement compact / detailed sheet presentation and a warehouse focus mode that is safe for picker execution.
    3. Preserve backward-compatible reads from current picking data while preparing the UI/API shape for later cell actions and shipment execution.
    4. Run required checks and stop at smoke/UI output for human validation.
  Verify Steps: |-
    1. Run `npm run build`. Expected: it succeeds and the new assembly-sheet route/view compiles without regressions.
    2. Run `npx tsc --noEmit`. Expected: type-check passes after the domain/terminology shift.
    3. Open the assembly-sheet workspace locally as OWNER/COO. Expected: list view uses counterparty-first sheet terminology and shows destination warehouses, priorities, and planned ship dates.
    4. Switch between compact and detailed modes. Expected: the same sheet remains understandable in both modes without reloading into a different workflow.
    5. Enter warehouse focus mode. Expected: only the chosen warehouse remains actionable/visible for picker work and the UI clearly reduces wrong-column risk.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: "The owner clarified that the real logistics model is universal counterparty-based assembly sheets; PR-123 is the first step that must align the UI with that operating truth."
id_source: "generated"
---
## Summary

PR-123 assembly sheets + focus mode

Turn the transitional shipment-driven picking surface into the first true assembly-sheet workspace: universal by counterparty, matrix-capable for supervisors, and warehouse-focused for pickers.

## Scope

- In scope: redefine the main execution object as `1 counterparty = 1 assembly sheet`, not marketplace-only shipment picking.
- In scope: support one or many destination warehouses inside the same sheet and show their priority + planned ship date in the UI.
- In scope: add compact and detailed sheet modes for logistics / supervisors.
- In scope: add warehouse focus mode as the primary picker workflow; when a warehouse is focused, neighboring columns should be hidden to reduce picking mistakes.
- In scope: keep the implementation additive on top of `picking_lists` / `picking_lines` where possible instead of inventing a second operational domain.
- Out of scope: full shipment execution closing, box / cargo-place traceability per action, and final picker accountability workflow; those belong to the next step.

## Plan

1. Reframe the existing `/picking` route into an `assembly sheets` surface with universal counterparty-first terminology.
2. Implement compact / detailed sheet presentation and a warehouse focus mode that is safe for picker execution.
3. Preserve backward-compatible reads from current picking data while preparing the UI/API shape for later cell actions and shipment execution.
4. Run required checks and stop at smoke/UI output for human validation.

## Verify Steps

1. Run `npm run build`. Expected: it succeeds and the new assembly-sheet route/view compiles without regressions.
2. Run `npx tsc --noEmit`. Expected: type-check passes after the domain/terminology shift.
3. Open the assembly-sheet workspace locally as OWNER/COO. Expected: list view uses counterparty-first sheet terminology and shows destination warehouses, priorities, and planned ship dates.
4. Switch between compact and detailed modes. Expected: the same sheet remains understandable in both modes without reloading into a different workflow.
5. Enter warehouse focus mode. Expected: only the chosen warehouse remains actionable/visible for picker work and the UI clearly reduces wrong-column risk.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
The owner clarified that the real logistics model is universal counterparty-based assembly sheets; PR-123 is the first step that must align the UI with that operating truth.
