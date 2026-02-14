# Data Model

## Core entities

### Batch
- Represents a production batch/work item.
- Key fields:
  - `id`
  - `code`
  - `status`
  - `created_at`
  - `updated_at`
  - `request_id` (idempotent mutation key)
  - `note` (optional)

### WIP/Drying
- Tracks in-process and drying lifecycle state for a batch.
- Key fields:
  - `batch_id`
  - `stage` (`wip` or `drying`)
  - `status`
  - `dry_start_at`
  - `dry_end_at`
  - `request_id`

### Stop
- Captures a stoppage/incident linked to production flow.
- Key fields:
  - `id`
  - `batch_id` (optional when stop is line-level)
  - `reason`
  - `started_at`
  - `ended_at`
  - `status`
  - `request_id`

### Role/Permission
- Defines user capabilities.
- Key fields:
  - `role`
  - `permission`
  - `scope`
  - `status`

## Statuses (baseline)
- Batch: `created` (initial status for `batch_create`), `in_progress`, `drying`, `completed`, `stopped`.
- WIP/Drying: `queued`, `active`, `waiting`, `done`, `stopped`.
- Stop: `open`, `acknowledged`, `resolved`, `cancelled`.
- Role/Permission: `active`, `disabled`.

## Idempotency key
- `request_id` is required for every mutating action.
- A repeated `request_id` must resolve to the same logical result without duplicate side effects.
