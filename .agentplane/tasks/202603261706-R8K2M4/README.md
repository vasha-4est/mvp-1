---
id: "202603261706-R8K2M4"
title: "PR-118 production planning engine"
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
  updated_at: "2026-03-26T17:06:00.000Z"
  updated_by: "ORCHESTRATOR"
  note: null
verification:
  state: "ok"
  updated_at: "2026-03-26T17:28:00.000Z"
  updated_by: "TESTER"
  note: "Verified: production build passed, reviewer-raised priority leak was fixed, and PR-118 localhost smoke/UI checks are ready for human validation."
commit: "merged"
comments:
  -
    author: "ORCHESTRATOR"
    body: "Start: Implement PR-118 production planning engine as the next roadmap dependency by deriving a read-only production plan from the staged shipment plan and current inventory, with the smallest additive UI/API surface and no new tables."
  -
    author: "ORCHESTRATOR"
    body: "Verified: PR-118 merged after localhost smoke and UI approval. Roadmap advanced to PR-119 Production Launch Engine as the next locked step."
events:
  -
    type: "status"
    at: "2026-03-26T17:06:00.000Z"
    author: "ORCHESTRATOR"
    from: "TODO"
    to: "DOING"
    note: "Start: Implement PR-118 production planning engine as the next roadmap dependency by deriving a read-only production plan from the staged shipment plan and current inventory, with the smallest additive UI/API surface and no new tables."
  -
    type: "status"
    at: "2026-03-26T18:05:00.000Z"
    author: "ORCHESTRATOR"
    from: "DOING"
    to: "DONE"
    note: "Verified: PR-118 merged after localhost smoke and UI approval. Roadmap advanced to PR-119 Production Launch Engine as the next locked step."
doc_version: 2
doc_updated_at: "2026-03-26T18:05:00.000Z"
doc_updated_by: "ORCHESTRATOR"
description: "Complete the next roadmap dependency by turning the staged shipment plan into an actionable production plan: compute SKU demand after available inventory coverage, prioritize what production must make next, and expose the result in the smallest additive UI/API layer without entering launch/execution scope."
sections:
  Summary: |-
    PR-118 production planning engine

    Complete the next roadmap dependency by turning the staged shipment plan into an actionable production plan: compute SKU demand after available inventory coverage, prioritize what production must make next, and expose the result in the smallest additive UI/API layer without entering launch/execution scope.
  Scope: |-
    - In scope: derive a read-only production planning view from the active staged shipment plan and current inventory, including SKU demand, missing quantity, shipment impact, deadline-based priority, and clear next-action cues.
    - In scope: add the smallest backend/API surface needed to load the production plan into UI screens for OWNER/COO.
    - In scope: expose this planning layer in a dedicated production page and/or concise Control Tower summary if it improves operational visibility without expanding into launch actions.
    - Out of scope: task launch/take-into-work flows, assignee management, worker execution, schema/table changes, shipment import redesign, and unrelated UI refactors.
  Plan: |-
    1. Implement the change for "PR-118 production planning engine".
    2. Run required checks and capture verification evidence.
    3. Finalize task findings and stop at smoke/UI output for human validation.
  Verify Steps: |-
    1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
    2. Open the production planning surface locally as OWNER/COO. Expected: it shows deterministic production priorities derived from staged shipment plan data or a clear empty state if no staged plan exists.
    3. Review the Control Tower and navigation impact. Expected: the new planning layer is visible, additive, and does not break existing shipment readiness or control tower flows.
  Verification: |-
    <!-- BEGIN VERIFICATION RESULTS -->
    #### 2026-03-26T17:28:00.000Z — VERIFY — ok

    By: TESTER

    Note: Verified: production build passed, reviewer-raised priority leak was fixed, and PR-118 localhost smoke/UI checks are ready for human validation.

    Details:

    Executed:
    - npm run build

    Result:
    - PASS: Next.js production build completed successfully.
    - REVIEW: Production plan priorities now expose only actionable SKUs with `production_qty > 0`.
    - REVIEW: Internal reviewer found no remaining blocking scope or regression issues after the fix.

    Human validation target:
    - /production/plan
    - /api/production/plan
    - Control Tower production plan summary

    <!-- END VERIFICATION RESULTS -->
  Rollback Plan: |-
    - Revert task-related commit(s).
    - Re-run required checks to confirm rollback safety.
  Findings: ""
id_source: "generated"
---
## Summary

PR-118 production planning engine

Complete the next roadmap dependency by turning the staged shipment plan into an actionable production plan: compute SKU demand after available inventory coverage, prioritize what production must make next, and expose the result in the smallest additive UI/API layer without entering launch/execution scope.

## Scope

- In scope: derive a read-only production planning view from the active staged shipment plan and current inventory, including SKU demand, missing quantity, shipment impact, deadline-based priority, and clear next-action cues.
- In scope: add the smallest backend/API surface needed to load the production plan into UI screens for OWNER/COO.
- In scope: expose this planning layer in a dedicated production page and/or concise Control Tower summary if it improves operational visibility without expanding into launch actions.
- Out of scope: task launch/take-into-work flows, assignee management, worker execution, schema/table changes, shipment import redesign, and unrelated UI refactors.

## Plan

1. Implement the change for "PR-118 production planning engine".
2. Run required checks and capture verification evidence.
3. Finalize task findings and stop at smoke/UI output for human validation.

## Verify Steps

1. Run `npm run build`. Expected: it succeeds and confirms the requested outcome for this task.
2. Open the production planning surface locally as OWNER/COO. Expected: it shows deterministic production priorities derived from staged shipment plan data or a clear empty state if no staged plan exists.
3. Review the Control Tower and navigation impact. Expected: the new planning layer is visible, additive, and does not break existing shipment readiness or control tower flows.

## Verification

<!-- BEGIN VERIFICATION RESULTS -->
#### 2026-03-26T17:28:00.000Z — VERIFY — ok

By: TESTER

Note: Verified: production build passed, reviewer-raised priority leak was fixed, and PR-118 localhost smoke/UI checks are ready for human validation.

Details:

Executed:
- npm run build

Result:
- PASS: Next.js production build completed successfully.
- REVIEW: Production plan priorities now expose only actionable SKUs with `production_qty > 0`.
- REVIEW: Internal reviewer found no remaining blocking scope or regression issues after the fix.

Human validation target:
- /production/plan
- /api/production/plan
- Control Tower production plan summary

<!-- END VERIFICATION RESULTS -->

## Rollback Plan

- Revert task-related commit(s).
- Re-run required checks to confirm rollback safety.

## Findings
