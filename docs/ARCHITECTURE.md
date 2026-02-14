# Architecture

MVP-1 follows a layered structure to keep responsibilities clear and future changes predictable.

## Layers and responsibilities

1. **UI**
   - Renders screens and forms.
   - Collects user input and displays status/errors.
   - Does not contain business rules beyond presentation concerns.

2. **Actions**
   - Orchestrates user-triggered operations (submit, update, close, retry).
   - Validates request shape and calls domain services.
   - Handles request/response mapping between UI and domain.

3. **Domain**
   - Source of truth for business rules and state transitions.
   - Defines entities, invariants, and status lifecycle.
   - Must be deterministic and testable.

4. **Integrations**
   - Adapters for external systems (GAS WebApp, Sheets, Telegram, platform APIs).
   - Converts domain intents to provider-specific payloads and back.
   - Handles retries/timeouts in a controlled way.

5. **Storage**
   - Persists application data and operation logs.
   - Supports idempotent writes using stable request keys.
   - Keeps an audit trail for operational debugging.

## Cross-cutting concerns

### Events
- Domain actions emit events for important transitions (created, updated, stopped, completed).
- Event payloads should be minimal, explicit, and versionable.

### Idempotency
- Mutating operations must carry a stable `request_id`.
- Duplicate submissions with the same `request_id` should not create duplicate records.

### Feature flags
- New behavior should be introduced behind flags when risk exists.
- Flags should be explicit, documented, and removable after stabilization.
