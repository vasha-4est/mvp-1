Status: CANONICAL  
Layer: operations  

# SCANNING SYSTEM

## Definition
Scanning is the primary method of identifying entities (SKU, batch, inventory) in the system.  
It is the entry point for event creation in physical operations.  

---

## Scan modes (priority)

1. camera (default, highest priority)  
2. manual input (logged)  
3. search / list fallback  

Rules:
- camera MUST be used whenever available  
- manual input MUST be explicitly logged  
- search mode MUST be treated as fallback only  

---

## Critical processes

- picking  
- inventory operations  

Rules:
- scanning is mandatory in critical processes  
- manual input in critical processes MUST be logged as exception  
- repeated manual input MAY trigger alert or STOP  

---

## Validation

- scanned value MUST match expected entity  
- validation MUST occur before confirmation  
- mismatch MUST block operation  

---

## Event linkage

- every scan MUST produce event or be part of event creation  
- manual input MUST produce explicit audit event  
- no confirmation without validated scan  

---

## Failure cases

- invalid scan → reject  
- mismatch with expected SKU → reject  
- missing scan before confirm → reject  
- repeated manual override → escalate  

---

## Constraints

- scanning MUST precede state-changing actions  
- no implicit identification allowed  
- no “assume correct” behavior  

---

## Execution model

- scanning is part of operation flow (not optional)  
- validation MUST happen before write  
- all results MUST be traceable  

---

## References
- /context/architecture/event_model.md  
- /context/operations/picking.md  
- /context/operations/inventory.md  