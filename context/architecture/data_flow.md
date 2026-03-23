Status: CANONICAL  
Layer: architecture  

# DATA FLOW (TABLES → API → UI)

## Definition
This file defines how data moves through the system:

Tables → Domain → API → UI → Events  

It is the execution contract for MVP-1.  

---

## CORE PRINCIPLE

- Tables store state  
- API changes state  
- UI triggers API  
- Events record everything  

No direct UI → DB access allowed  

---

## 1. DATA SOURCES (TABLES)

### OPS_DB (operational state)

Key domains:
- batch_registry  
- inventory_balances  
- picking_lists / picking_lines  
- shipments  
- events_log  

---

### CONTROL_MODEL (logic layer)

Key domains:
- roles / permissions  
- feature_flags  
- kpi thresholds  
- scenarios  
- capacity_model  

---

## 2. DOMAIN LAYER (lib)

Responsible for:
- validation  
- business rules  
- orchestration  

Examples:

- lib/inventory  
- lib/picking  
- lib/shipments  
- lib/control-tower  

Rules:
- no direct UI logic  
- no direct sheet access  

---

## 3. API LAYER (app/api)

API = single entry point for mutations  

Examples:

- /api/batch/create  
- /api/picking/confirm  
- /api/inventory/move  
- /api/shipments/ready  

Rules:
- validate input  
- call domain layer  
- write event  
- return result  

---

## 4. INTEGRATION LAYER (GAS)

- GAS = storage adapter  
- receives API calls  
- writes to OPS_DB  

Rules:
- append-only where possible  
- no business logic duplication  

---

## 5. UI LAYER (app + components)

UI responsibilities:
- trigger API  
- display state  
- show signals (Control Tower)  

Rules:
- no business logic  
- no direct writes  
- no silent state  

---

## 6. EVENT FLOW

Every mutation:

UI  
→ API  
→ Domain  
→ GAS  
→ OPS_DB  
→ Event written  

Then:

Event  
→ Control Tower  
→ Signals  
→ UI update  

---

## 7. EXAMPLE FLOW

### Picking confirm

UI:
- scan SKU  
- confirm qty  

API:
- /api/picking/confirm  

Domain:
- validate reservation  
- validate qty  

GAS:
- update picking_line  
- update inventory  

Event:
- picking_confirmed  
- inventory_moved  

UI:
- refresh state  

---

## 8. CONTROL TOWER FLOW

Inputs:
- events_log  
- inventory  
- batches  

Process:
- compute load  
- detect SLA risk  
- detect bottlenecks  

Outputs:
- signals  
- priorities  
- recommendations  

---

## 9. WRITE RULES

- all writes go through API  
- API MUST produce event  
- no direct table writes  
- no silent updates  

---

## 10. NON-NEGOTIABLE

- UI MUST NOT write directly to tables  
- Domain MUST enforce rules  
- GAS MUST NOT invent logic  
- Event MUST exist for every change  

---

## References

- /context/architecture/data_model.md  
- /context/architecture/event_model.md  
- /context/operations/*.md  
- /context/reference/event_catalog.md  