---
id: "202603262040-L4N8Q2"
title: "PR-119 production launch engine"
status: "DONE"
priority: "high"
owner: "ORCHESTRATOR"
revision: 2
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
  updated_at: "2026-03-26T20:40:00.000Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-03-26T20:55:00.000Z"
  updated_by: "TESTER"
  note: "Verified: Next.js production build passed and PR-119 localhost smoke/UI checks are ready for human validation."
commit: "merged"
comments:
  -
    author: "ORCHESTRATOR"
    body: "Start: Implement PR-119 Production Launch Engine as the next locked roadmap step by layering take-into-work, assignee selection, and launch status tracking on top of the existing production plan using work_items, API->GAS mutations, and explicit event logging without entering PR-120 live view scope."
  -
    author: "TESTER"
    body: "Verified: Next.js production build passed and PR-119 localhost smoke/UI checks are ready for human validation."
  -
    author: "ORCHESTRATOR"
    body: "Verified: PR-119 merged after localhost smoke and UI approval. Roadmap advanced to PR-120 Production Live View as the next locked step."
events:
  -
    type: "status"
    at: "2026-03-26T20:40:00.000Z"
    author: "ORCHESTRATOR"
    from: "TODO"
    to: "DOING"
    note: "Start: Implement PR-119 Production Launch Engine as the next locked roadmap step by layering take-into-work, assignee selection, and launch status tracking on top of the existing production plan using work_items, API->GAS mutations, and explicit event logging without entering PR-120 live view scope."
  -
    type: "verify"
    at: "2026-03-26T20:55:00.000Z"
    author: "TESTER"
    state: "ok"
    note: "Verified: Next.js production build passed and PR-119 localhost smoke/UI checks are ready for human validation."
  -
    type: "status"
    at: "2026-03-27T00:00:00.000Z"
    author: "ORCHESTRATOR"
    from: "DOING"
    to: "DONE"
    note: "Verified: PR-119 merged after localhost smoke and UI approval. Roadmap advanced to PR-120 Production Live View as the next locked step."
doc_version: 2
doc_updated_at: "2026-03-27T00:00:00.000Z"
doc_updated_by: "ORCHESTRATOR"
description: "Complete the next roadmap dependency by turning the read-only production plan into a governed launch workspace: allow staff to take a SKU into work, assign an operator, and track launch status in an auditable way without introducing live-floor scope or changing batch FSM semantics."
sections:
  Summary: |-
    PR-119 production launch engine

    Complete the next roadmap dependency by turning the read-only production plan into a governed launch workspace: allow staff to take a SKU into work, assign an operator, and track launch status in an auditable way without introducing live-floor scope or changing batch FSM semantics.
  Scope: |-
    - In scope: add production launch task state on top of production-plan SKUs using the existing work_items operational sheet.
    - In scope: expose take-into-work, assignee selection, and status tracking in the /production/plan workspace for OWNER/COO.
    - In scope: keep mutations auditable through API -> GAS with request_id-based idempotency and explicit event logging.
    - Out of scope: worker-specific login surfaces, live-floor aggregation, batch FSM redesign, new domain tables, and PR-120 WIP visibility.
  Plan: |-
    1. Implement the change for "PR-119 production launch engine".
    2. Run required checks and capture verification evidence.
    3. Finalize task findings and stop at smoke/UI output for human validation.
  Verify Steps: |-
    1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
    2. Open /production/plan while logged in as OWNER/COO. Expected: actionable SKUs show launch controls, worker assignment options, and persisted launch status.
    3. Trigger take-into-work and status updates on one SKU. Expected: the UI refreshes deterministically, assigned worker/status persist, and no unrelated control-tower or shipment flow regresses.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    #### 2026-03-26T20:55:00.000Z — VERIFY — ok

    By: TESTER

    Note: Verified: Next.js production build passed and PR-119 localhost smoke/UI checks are ready for human validation.

    Details:

    Executed:
    - npm run build

    Result:
    - PASS: Next.js production build completed successfully.
    - REVIEW: /production/plan now exposes production launch controls with take-into-work, worker assignment, and persisted launch status flow.

    Human validation target:
    - /production/plan
    - /api/production/launch
    - /api/production/workers

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: ""
id_source: "generated"
---
## Summary

PR-119 production launch engine

Complete the next roadmap dependency by turning the read-only production plan into a governed launch workspace: allow staff to take a SKU into work, assign an operator, and track launch status in an auditable way without introducing live-floor scope or changing batch FSM semantics.

## Scope

- In scope: add production launch task state on top of production-plan SKUs using the existing work_items operational sheet.
- In scope: expose take-into-work, assignee selection, and status tracking in the /production/plan workspace for OWNER/COO.
- In scope: keep mutations auditable through API -> GAS with request_id-based idempotency and explicit event logging.
- Out of scope: worker-specific login surfaces, live-floor aggregation, batch FSM redesign, new domain tables, and PR-120 WIP visibility.

## Plan

1. Implement the change for "PR-119 production launch engine".
2. Run required checks and capture verification evidence.
3. Finalize task findings and stop at smoke/UI output for human validation.

## Verify Steps

1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
2. Open /production/plan while logged in as OWNER/COO. Expected: actionable SKUs show launch controls, worker assignment options, and persisted launch status.
3. Trigger take-into-work and status updates on one SKU. Expected: the UI refreshes deterministically, assigned worker/status persist, and no unrelated control-tower or shipment flow regresses.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
#### 2026-03-26T20:55:00.000Z — VERIFY — ok

By: TESTER

Note: Verified: Next.js production build passed and PR-119 localhost smoke/UI checks are ready for human validation.

Details:

Executed:
- npm run build

Result:
- PASS: Next.js production build completed successfully.
- REVIEW: /production/plan now exposes production launch controls with take-into-work, worker assignment, and persisted launch status flow.

Human validation target:
- /production/plan
- /api/production/launch
- /api/production/workers

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
