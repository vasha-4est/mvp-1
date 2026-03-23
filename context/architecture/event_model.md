Status: CANONICAL  
Layer: architecture  

# EVENT MODEL

## Definition
All state-changing actions are represented as events.

No action without event.  

---

## Event model layers

System operates with three layers:

1. Current event shapes (existing repo implementation)  
2. Target canonical event model (MVP-1 architecture)  
3. Migration bridge (mapping between current and target)  

---

## Canonical files

- /context/reference/event_schema.current.json  
- /context/reference/event_schema.target.json  
- /context/architecture/events_mapping.md  
- /context/reference/event_type_contracts.md  

Rules:
- event_schema.target.json defines future contract  
- events_mapping.md defines translation layer  
- event_type_contracts.md defines semantics  

---

## Core event structure

Every event MUST contain:

- event_id  
- event_type  
- entity_type  
- entity_id  
- payload_json  
- created_at  

Optional:
- created_by_employee_id  
- severity  
- request_id  

---

## Core rules

- Events MUST be immutable (no updates)  
- Events MUST be append-only  
- Events MUST be idempotent  
- Events MUST be traceable to actor  

---

## Idempotency

- Duplicate events MUST NOT create duplicate effects  
- request_id SHOULD be used for idempotency control  
- Repeated requests MUST result in same system state  

---

## Event lifecycle

Create → Store → Consume → Derive  

Rules:
- Events are written once  
- Events may be consumed multiple times  
- Derived state MUST NOT overwrite original events  

---

## State linkage

- All state changes MUST reference an event  
- events_log is the global audit layer  
- No mutation without corresponding event  

---

## Write model

- All events MUST be created via backend  
- No direct writes from client  
- No silent state changes without event creation  

---

## Constraints

- New event types MUST follow canonical naming  
- Legacy event formats MUST NOT be extended  
- New code MUST use target event schema  

---

## Migration rule

- Current events MAY be normalized on read  
- New events MUST follow target schema  
- Migration MUST be incremental  

---

## References
- /context/architecture/data_model.md  
- /context/rules/data_integrity.md  
- /context/architecture/system_architecture.md  