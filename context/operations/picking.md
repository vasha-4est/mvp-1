Status: CANONICAL  
Layer: operations  

# PICKING FLOW

## Preconditions
- inventory MUST be reserved  
- picking_line MUST exist  
- lock MUST be acquired before execution  
- actor MUST have permission  
- SKU MUST be identified (scan or validated fallback)  
- system MUST NOT be in SYSTEM_READONLY  

---

## Steps

1. reserve inventory  
2. acquire lock (picking_line)  
3. scan SKU  
4. confirm quantity  
5. update inventory  
6. release lock  

---

## Checks

- reserved quantity MUST match picking requirement  
- scanned SKU MUST match expected SKU  
- confirmed quantity MUST NOT exceed reserved quantity  
- inventory update MUST reflect actual movement  

---

## Failure cases

- lock conflict → reject operation  
- insufficient available quantity → block picking  
- SKU mismatch → reject scan  
- duplicate picking attempt → reject operation  
- missing reservation → reject picking  
- missing event → reject downstream action  

---

## Downstream events

- inventory_reserved  
- picking_started  
- picking_scanned  
- picking_confirmed  
- picking_completed  
- inventory_moved  

Rules:
- every step MUST produce corresponding event  
- no state change without event  

---

## Constraints

- double picking MUST NOT occur  
- lock MUST guarantee single actor execution  
- inventory MUST NOT go negative  
- picking_line state MUST be consistent  

---

## Execution model

- picking MUST be atomic per picking_line  
- all actions MUST go through backend  
- no direct writes to OPS_DB  
- partial execution MUST be explicitly handled  

---

## References
- /context/architecture/data_model.md  
- /context/architecture/event_model.md  
- /context/rules/data_integrity.md  