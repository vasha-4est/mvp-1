Status: CANONICAL  
Layer: operations  

# PRODUCTION FLOW

## Preconditions
- batch_id MUST be unique  
- SKU MUST exist  
- required materials MUST be available  
- actor MUST have permission  
- system MUST NOT be in SYSTEM_READONLY  

---

## Steps

1. create batch  
2. start batch  
3. finish batch  
4. move to drying  
5. record defects (if any)  

---

## Checks

- quantity MUST be validated before batch creation  
- actual output MUST be recorded at finish  
- defects MUST be explicitly recorded or confirmed as zero  
- batch state MUST follow allowed transitions  

---

## Failure cases

- duplicate batch_id → reject operation  
- insufficient materials → block batch start  
- invalid quantity → reject batch creation  
- state transition violation → reject action  
- missing event → reject downstream action  

---

## Downstream events

- batch_created  
- batch_started  
- batch_finished  
- batch_moved_to_drying  
- batch_defect_recorded  

Rules:
- every step MUST produce corresponding event  
- no state change without event  

---

## Constraints

- batch_id MUST remain immutable  
- batch history MUST NOT be rewritten  
- corrections MUST be recorded as new events  

---

## Execution model

- all actions MUST go through backend  
- no direct writes to OPS_DB  
- flow MUST follow defined sequence  

---

## References
- /context/architecture/data_model.md  
- /context/architecture/event_model.md  
- /context/rules/data_integrity.md  