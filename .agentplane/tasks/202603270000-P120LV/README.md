---
id: "202603270000-P120LV"
title: "PR-120 production live view"
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
  updated_at: "2026-03-27T00:00:00.000Z"
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
    body: "Next locked step: Implement PR-120 Production Live View by exposing who is doing what right now, active WIP visibility, and anti-duplication safeguards on top of the new production launch state without redesigning downstream station flows."
events:
  -
    type: "status"
    at: "2026-03-27T00:00:00.000Z"
    author: "ORCHESTRATOR"
    from: "TODO"
    to: "TODO"
    note: "Prepared next active task record for the roadmap-locked PR-120 Production Live View step."
doc_version: 1
doc_updated_at: "2026-03-27T00:00:00.000Z"
doc_updated_by: "ORCHESTRATOR"
description: "Build the next roadmap dependency after launch: provide a live production view that shows active work by worker and SKU, makes current WIP visible, and reduces duplicate parallel work without expanding into full station execution redesign."
sections:
  Summary: |-
    PR-120 production live view

    Build the next roadmap dependency after launch: provide a live production view that shows active work by worker and SKU, makes current WIP visible, and reduces duplicate parallel work without expanding into full station execution redesign.
  Scope: |-
    - In scope: expose a live view of active production launch items grouped or filterable by worker/status so supervisors can see who is doing what right now.
    - In scope: surface current WIP and anti-duplication cues using the existing production launch state and work_items data.
    - In scope: keep the change additive to the current `/production/plan` and/or related live-floor surfaces.
    - Out of scope: full station FSM redesign, picking execution, payroll logic, and unrelated inventory refactors.
  Plan: |-
    1. Implement the change for "PR-120 production live view".
    2. Run required checks and capture verification evidence.
    3. Finalize task findings and stop at smoke/UI output for human validation.
  Verify Steps: |-
    1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
    2. Open the live production surface locally as OWNER/COO. Expected: active work is visible by worker/SKU/status without duplicate ambiguity.
    3. Compare the live view against `/production/plan`. Expected: active launch state and WIP cues remain consistent across surfaces.
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

PR-120 production live view

Build the next roadmap dependency after launch: provide a live production view that shows active work by worker and SKU, makes current WIP visible, and reduces duplicate parallel work without expanding into full station execution redesign.

## Scope

- In scope: expose a live view of active production launch items grouped or filterable by worker/status so supervisors can see who is doing what right now.
- In scope: surface current WIP and anti-duplication cues using the existing production launch state and work_items data.
- In scope: keep the change additive to the current `/production/plan` and/or related live-floor surfaces.
- Out of scope: full station FSM redesign, picking execution, payroll logic, and unrelated inventory refactors.

## Plan

1. Implement the change for "PR-120 production live view".
2. Run required checks and capture verification evidence.
3. Finalize task findings and stop at smoke/UI output for human validation.

## Verify Steps

1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
2. Open the live production surface locally as OWNER/COO. Expected: active work is visible by worker/SKU/status without duplicate ambiguity.
3. Compare the live view against `/production/plan`. Expected: active launch state and WIP cues remain consistent across surfaces.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
- 2026-03-27: `npm run build` — OK.
<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
