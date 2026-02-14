# Roadmap (PR iterations)

## PR-1 — Docs scaffolding and agent rules
- Add contribution rails, architecture/data/integration docs, and README guidance.
- **How to verify**
  - Confirm new docs files exist and are non-empty.
  - Confirm README includes MVP summary, PR preview checks, and docs location.

## PR-2 — Basic domain and screen skeleton alignment
- Align initial screens with documented entities/status terms.
- **How to verify**
  - Open app and confirm screens map to documented MVP list.
  - Confirm no regression on existing landing behavior.

## PR-3 — Integration contract hardening
- Define/implement stable request/response contracts to GAS/Sheets.
- **How to verify**
  - Run integration smoke flow using a test dataset.
  - Confirm retries do not duplicate writes when `request_id` repeats.

## PR-4 — Operational reliability and notifications
- Add operational stop/recovery pathways and Telegram notifications.
- **How to verify**
  - Trigger a stop event and confirm persisted status + notification delivery.
  - Confirm recovery flow returns entity to expected status.

## PR-5 — Release readiness and handover
- Final cleanup, checklist hardening, and deployment handoff notes.
- **How to verify**
  - Validate merge checklist and preview checks are green.
  - Confirm documentation is up to date with shipped behavior.
