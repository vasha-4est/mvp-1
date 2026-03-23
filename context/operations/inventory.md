Status: CANONICAL  
Layer: operations  

# INVENTORY OPERATIONS

## Definition
Inventory operations manage physical and logical movement of stock.

All actions:
- MUST be validated (scan or explicit confirmation)  
- MUST be logged as events  
- MUST NOT violate data integrity rules  

---

## Operations

### 1. RECEIVE

Adds inventory into system.

Preconditions:
- SKU MUST exist  
- quantity MUST be valid (> 0)  
- source MUST be defined  

Events:
- inventory_received  

Forbidden:
- receiving negative quantity  
- receiving unknown SKU  

---

### 2. MOVE

Transfers inventory between locations.

Preconditions:
- sufficient quantity MUST exist  
- source and destination MUST be defined  
- inventory MUST be available (not reserved)  

Events:
- inventory_moved  

Forbidden:
- moving more than available  
- moving without location  
- implicit inventory creation  

---

### 3. RESERVE

Locks inventory for future use (picking).

Preconditions:
- sufficient available quantity MUST exist  
- SKU MUST match request  
- reservation MUST be tied to entity (picking / batch)  

Events:
- inventory_reserved  

Forbidden:
- reserving more than available  
- reservation without reference entity  
- duplicate reservation for same unit  

---

### 4. RELEASE

Releases previously reserved inventory.

Preconditions:
- reservation MUST exist  
- reservation MUST be active  

Events:
- inventory_released  

Forbidden:
- releasing non-existing reservation  
- releasing more than reserved  

---

### 5. ADJUST

Corrects inventory (manual or system correction).

Preconditions:
- adjustment reason MUST be provided  
- actor MUST have permission  

Events:
- inventory_adjusted  

Forbidden:
- silent adjustment  
- adjustment without reason  
- adjustment bypassing event system  

---

## Global rules

- Inventory MUST NOT go negative  
- Available = total − reserved  
- Reserved inventory MUST NOT be moved  
- All operations MUST be idempotent  
- No state change without event  

---

## Execution model

- All operations MUST go through backend  
- No direct writes to OPS_DB  
- No silent mutations  

---

## References
- /context/architecture/data_model.md  
- /context/architecture/event_model.md  
- /context/rules/data_integrity.md  