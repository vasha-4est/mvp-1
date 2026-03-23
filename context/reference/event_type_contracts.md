Status: CANONICAL  
Layer: reference  

This file is authoritative for event semantics.  
Schema files validate structure, but this file defines meaning.  

---

# EVENT TYPE CONTRACTS

## Definition
Event contracts define the meaning, required fields, and expected side effects of each event type.

Rules:
- Schema defines structure  
- Contracts define behavior and semantics  
- If conflict → contracts win  

---

## Contract layers

System operates with three layers:

1. CURRENT — runtime contracts in repository  
2. TARGET — canonical contracts (MVP-1)  
3. BRIDGE — mapping between them  

---

## 1. CURRENT CONTRACTS (repo reality)

### events_log (audit writer)

Canonical current shape:
- event_id  
- event_type  
- entity_type  
- entity_id  
- payload_json  
- created_at  
- actor_user_id  
- request_id  

Notes:
- append-only  
- closest to future canonical format  
- naming mismatch exists (actor_user_id vs created_by_employee_id)  

---

### batch_events (timeline stream)

Shape:
- at  
- batch_code  
- batch_id  
- type  
- actor  
- request_id  
- details_json  

Rules:
- append-only  
- used for batch timeline  
- MUST NOT be broken during MVP-1  

---

## 2. TARGET CONTRACT (canonical)

### Canonical event row

Required:
- event_id  
- event_type  
- entity_type  
- entity_id  
- payload_json  
- created_at  
- created_by_employee_id  

Optional:
- request_id  
- severity  
- source  
- client_ts  

---

## 3. CORE CONTRACT RULES

- Events MUST be immutable  
- Events MUST be append-only  
- Events MUST be idempotent where required  
- No state change without event  
- Event MUST fully describe action  

---

## 4. HIGH-VALUE EVENT CONTRACTS

### inventory_moved

Required:
- entity_type = inventory  
- entity_id  
- payload:
  - qty  
  - from_location  
  - to_location  

Side effects:
- inventory_moves updated  
- event written  
- idempotency enforced  

---

### picking_confirmed

Required:
- entity_type = picking_line  
- entity_id  
- payload:
  - qty  
  - sku  

Side effects:
- qty updated  
- reservation adjusted  
- event written  

---

### batch lifecycle

Events:
- batch_created  
- batch_started  
- batch_finished  
- batch_moved_to_drying  

Rules:
- must follow valid state transitions  
- must reference batch_code / id  

---

### shipment_shipped (target)

Current alias:
- ship_dispatched  

Rules:
- canonical name MUST be used for new writes  
- alias MAY be emitted for compatibility  

---

## 5. STOP CONTRACT

Canonical chain:
- stop_triggered  
- decision_recorded  
- sop_changed  

Rules:
- STOP not closed without decision  
- SOP/WI linkage required  

---

## 6. IDENTITY CONTRACT

Every critical event MUST include:

- acting_user_id  
- real_user_id (if impersonation)  

Rules:
- no anonymous mutations  
- impersonation MUST be traceable  

---

## 7. MIGRATION RULES

- Do NOT rewrite historical events  
- Mapping MUST occur on read  
- New writes MUST use target schema  
- Legacy formats MUST NOT be extended  

---

## 8. WRITE POLICY

- New code MUST use canonical contracts  
- Legacy event formats MUST NOT be used for new logic  
- Adapter layer MUST normalize all reads  

---

## 9. NON-NEGOTIABLE RULES

- No event → no action  
- No contract → no event  
- No mutation without event  
- No deletion of history  