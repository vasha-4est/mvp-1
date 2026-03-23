Status: CANONICAL  
Layer: architecture  

# SYSTEM ARCHITECTURE

## Core systems
- OPS_DB = operational state (single source of truth for execution)  
- CONTROL_MODEL = permissions, thresholds, scenarios, governance  
- GAS = authoritative execution and storage layer  
- Next.js API = transport and UI-facing layer  
- Vercel = deployment and runtime environment  

## Layering
UI → API / actions → domain services → integration layer → GAS / Sheets  

Rules:
- Business logic MUST NOT live in UI layer  
- Next.js MUST NOT implement core domain logic  
- GAS is authoritative for state changes  
- Integration layer MUST isolate external systems  

## Core entities
- batch  
- sku  
- inventory  
- picking  
- shipment  

## Entity flow
batch → inventory → picking → shipment  

Rules:
- Flow MUST be respected unless explicitly overridden by scenario  
- No downstream action without upstream state completion  

## Event model
- All state changes MUST be event-driven  
- Events are immutable and append-only  
- No action without event  

## State ownership
- OPS_DB = operational truth  
- CONTROL_MODEL = control logic  
- Derived data MUST NOT override source data  

## Constraints
- No direct writes from client to data stores  
- All writes MUST go through backend (API → GAS)  
- No silent state mutations  

## References
- /context/architecture/data_model.md  
- /context/architecture/event_model.md  
- /context/rules/system_rules.md  