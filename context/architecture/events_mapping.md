Status: BRIDGE  
Layer: architecture  

# EVENTS MAPPING (current → target)

This file is migration-only.  
It is not the canonical target schema.  
It maps current repo reality to target event model.  

---

## Purpose
- unify event model  
- support migration  
- prevent ambiguity for agents  

---

## Source systems

### Current sources:
1. events_log (GAS)  
2. batch_events (GAS)  
3. implicit events in API / services  

### Target:
- unified event model (event_schema.target.json)  

---

## Field mapping

| CURRENT (events_log)      | CURRENT (batch_events) | TARGET FIELD            | NOTES |
|--------------------------|------------------------|------------------------|------|
| event_key                | type                   | event_type             | rename |
| object_type              | —                      | entity_type            | normalize |
| object_id (implicit)     | batch_id / batch_code  | entity_id              | unify |
| server_ts                | at                     | created_at             | ISO datetime |
| payload_json             | details_json           | payload_json           | keep |
| actor_employee_id        | actor                  | created_by_employee_id | normalize |
| actor_role               | —                      | payload.role           | move to payload |
| request_id               | request_id             | request_id             | keep |
| —                        | —                      | severity               | new field |
| —                        | —                      | source                 | new field |

---

## Event type normalization

### Current → Target mapping

| CURRENT EVENT TYPE              | TARGET EVENT TYPE        |
|--------------------------------|--------------------------|
| inventory.move                 | inventory_moved          |
| inventory.received             | inventory_received       |
| picking.confirm                | picking_confirmed        |
| ship_dispatched                | shipment_shipped         |
| batch_status_changed           | batch_started / finished |
| users_directory_cache_refreshed| system_event             |

Rules:
- dot notation → snake_case  
- verbs MUST be normalized to past tense  

---

## Entity type normalization

| CURRENT   | TARGET                     |
|-----------|---------------------------|
| batch     | batch                     |
| inventory | inventory                 |
| picking   | picking_list / picking_line |
| shipment  | shipment                  |
| user      | user                      |

Rules:
- avoid generic entity names  
- prefer explicit domain entities  

---

## Structural differences

### Current system
- multiple event formats  
- inconsistent field naming  
- partial auditability  

### Target system
- single schema  
- strict typing  
- full traceability  
- idempotent events  

---

## Migration rules

- Historical events MUST NOT be rewritten  
- Mapping MUST happen on read (adapter layer)  
- New writes MUST follow target schema  
- Compatibility layer MUST exist in API  
- Migration MUST be incremental  

---

## Write policy

- New code MUST write target-style events only  
- Legacy event formats MUST NOT be extended  
- Legacy events MAY be normalized on read  
- No new current-style events allowed  

---

## Adapter layer (critical)

All reads MUST pass through:

normalizeEvent(currentEvent) → targetEvent  

Responsibilities:
- map fields  
- normalize event_type  
- ensure required fields exist  
- enforce minimal schema validity  

---

## Conflict rule

If mismatch between:
- current data  
- target schema  

→ target schema wins  

But:
→ production data MUST NOT be broken  

---

## For agents

Agents MUST:
- use ONLY target schema in new code  
- NEVER introduce new current-style events  
- ALWAYS normalize legacy events before use  

---

## Core principle

Current system = historical reality  
Target schema = future truth  

Mapping = bridge between them  