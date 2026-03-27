---
id: "202603261141-6BX7V0"
title: "PR-111 shipment plan import workspace"
status: "DOING"
priority: "high"
owner: "CODER"
revision: 5
depends_on: []
tags:
  - "code"
  - "backend"
  - "frontend"
  - "ui"
verify:
  - "npm run build"
plan_approval:
  state: "approved"
  updated_at: "2026-03-26T11:43:19.616Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-03-26T11:49:48.994Z"
  updated_by: "TESTER"
  note: "Verified: production build passed and PR-111 owner shipment-plan import smoke/UI checks are ready for human validation."
commit: null
comments:
  -
    author: "CODER"
    body: "Start: Implement PR-111 shipment plan import workspace on the Owner page with latest staged batch visibility and explicit supersede acknowledgement, keeping the diff additive and scoped to logistics input."
events:
  -
    type: "status"
    at: "2026-03-26T11:43:24.878Z"
    author: "CODER"
    from: "TODO"
    to: "DOING"
    note: "Start: Implement PR-111 shipment plan import workspace on the Owner page with latest staged batch visibility and explicit supersede acknowledgement, keeping the diff additive and scoped to logistics input."
  -
    type: "verify"
    at: "2026-03-26T11:49:48.994Z"
    author: "TESTER"
    state: "ok"
    note: "Verified: production build passed and PR-111 owner shipment-plan import smoke/UI checks are ready for human validation."
doc_version: 3
doc_updated_at: "2026-03-26T11:49:48.996Z"
doc_updated_by: "TESTER"
description: "Complete the next roadmap dependency by making shipment plan import operational for owner/logistics: preview validation results, expose latest staged batch context, and make superseding a visible explicit action without redesigning downstream production flow."
sections:
  Summary: |-
    PR-111 shipment plan import workspace
    
    Complete the next roadmap dependency by making shipment plan import operational for owner/logistics: preview validation results, expose latest staged batch context, and make superseding a visible explicit action without redesigning downstream production flow.
  Scope: |-
    - In scope: add an owner-facing shipment plan import workspace on the existing Owner page, with input parsing, validation preview, latest staged batch visibility, and explicit supersede acknowledgement before commit.
    - In scope: add the smallest backend read surface needed to load the latest staged shipment plan batch into the UI.
    - Out of scope: PR-117 production planning, worker/station execution flows, schema/table changes, and unrelated dashboard refactors.
  Plan: |-
    1. Implement the change for "PR-111 shipment plan import workspace".
    2. Run required checks and capture verification evidence.
    3. Finalize task findings and finish with traceable commit metadata.
  Verify Steps: |-
    1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
    2. Review the changed artifact or behavior for the `code` task. Expected: the requested outcome is visible and matches the approved scope.
    3. Compare the final result against the task summary and touched scope. Expected: remaining follow-up is either resolved or explicit in ## Findings.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    #### 2026-03-26T11:49:48.994Z — VERIFY — ok
    
    By: TESTER
    
    Note: Verified: production build passed and PR-111 owner shipment-plan import smoke/UI checks are ready for human validation.
    
    VerifyStepsRef: doc_version=3, doc_updated_at=2026-03-26T11:43:24.879Z, excerpt_hash=sha256:5aa0db3d6c28031a45178e6576c665a2eea9228680dd85ba7033b1d80ac68f8c
    
    Details:
    
    Executed:
    - npm run build
    
    Result:
    - PASS: Next.js production build completed successfully.
    - REVIEW: Internal reviewer found no blocking scope or regression issues.
    
    Human validation target:
    - Owner page shipment-plan import workspace on /owner
    - Latest staged batch refresh and supersede acknowledgement behavior
    
    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: ""
id_source: "generated"
---
## Summary

PR-111 shipment plan import workspace

Complete the next roadmap dependency by making shipment plan import operational for owner/logistics: preview validation results, expose latest staged batch context, and make superseding a visible explicit action without redesigning downstream production flow.

## Scope

- In scope: add an owner-facing shipment plan import workspace on the existing Owner page, with input parsing, validation preview, latest staged batch visibility, and explicit supersede acknowledgement before commit.
- In scope: add the smallest backend read surface needed to load the latest staged shipment plan batch into the UI.
- Out of scope: PR-117 production planning, worker/station execution flows, schema/table changes, and unrelated dashboard refactors.

## Plan

1. Implement the change for "PR-111 shipment plan import workspace".
2. Run required checks and capture verification evidence.
3. Finalize task findings and finish with traceable commit metadata.

## Verify Steps

1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
2. Review the changed artifact or behavior for the `code` task. Expected: the requested outcome is visible and matches the approved scope.
3. Compare the final result against the task summary and touched scope. Expected: remaining follow-up is either resolved or explicit in ## Findings.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
#### 2026-03-26T11:49:48.994Z — VERIFY — ok

By: TESTER

Note: Verified: production build passed and PR-111 owner shipment-plan import smoke/UI checks are ready for human validation.

VerifyStepsRef: doc_version=3, doc_updated_at=2026-03-26T11:43:24.879Z, excerpt_hash=sha256:5aa0db3d6c28031a45178e6576c665a2eea9228680dd85ba7033b1d80ac68f8c

Details:

Executed:
- npm run build

Result:
- PASS: Next.js production build completed successfully.
- REVIEW: Internal reviewer found no blocking scope or regression issues.

Human validation target:
- Owner page shipment-plan import workspace on /owner
- Latest staged batch refresh and supersede acknowledgement behavior

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
