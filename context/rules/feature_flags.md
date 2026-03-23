Status: CANONICAL  
Layer: rules  

# FEATURE FLAGS

## Canonical table
- config_flags
- flag_dependencies

## Core rules
- Every module MUST check feature flag before execution  
- If flag = OFF → no side effects MUST occur  
- Flag check MUST happen before any write operation  

## Flag structure
Table: config_flags
- flag_key (unique)
- enabled (boolean)
- phase (A | B | C)
- owner_only (boolean)

## Phases
- A — core operations (blocking)  
- B — optimization (non-blocking)  
- C — finance & KPI (analytical layer)  

## Dependencies
- Flag dependencies are mandatory  
- If parent flag = OFF → all dependent flags are OFF  
- Dependencies MUST be resolved before execution  

## Emergency flags (highest priority)
- SYSTEM_READONLY → blocks all write operations  
- DISABLE_ALL_NOTIFICATIONS → disables all outgoing signals  
- DEMO_MODE → disables real side effects  

Priority rule:
Emergency flags override all other flags

## Execution model
- Flags are evaluated at runtime  
- No flag = default OFF  
- Owner-only flags require OWNER role  

## Enforcement
- Violations MUST fail fast  
- Silent bypass of flags is forbidden  

## References
- /context/architecture/data_model.md  
- /context/rules/system_rules.md  