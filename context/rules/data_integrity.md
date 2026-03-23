Status: CANONICAL  
Layer: rules  

# DATA INTEGRITY

## Canonical stores
- OPS_DB = operational source of truth  
- CONTROL_MODEL = governance, RBAC, limits  

## Rules
- Inventory MUST NOT go negative  
- Reservation MUST exist before picking  
- All movements MUST be recorded before downstream actions  
- All writes MUST be idempotent (no duplicate entities)  
- Historical records MUST NOT be overwritten  
- Corrections MUST be implemented via new events, not mutations  

## Write model
- All writes go through backend only (no direct client writes)  
- All state changes MUST be event-driven (append-only)  

## Enforcement
- Violations MUST fail fast (no silent corrections)  
- Integrity checks MUST be enforced at API/service layer  

## References
- /context/architecture/data_model.md  
- /context/architecture/events_mapping.md  