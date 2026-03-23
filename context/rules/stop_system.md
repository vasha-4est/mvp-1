Status: CANONICAL  
Layer: rules  

# STOP SYSTEM

## Definition
STOP is a formal system event indicating a critical deviation requiring decision and resolution.

## Flow
STOP → DECISION → SOP_CHANGE → VERIFY → CLOSE  

## Core rules
- STOP MUST be logged as event  
- STOP MUST have an assigned decision owner (D)  
- STOP MUST trigger escalation  

## Blocking behavior
- STOP MAY block system operations depending on severity  
- Active STOP MUST be visible in Control Tower  

## Closure rules
- STOP MUST NOT be closed without resolution  
- Resolution MUST include:
  - SOP_CHANGE or WI update  
  OR  
  - explicit waiver with justification  

## Failure condition
- Repeated STOP without SOP/WI update = system failure  

## State rule
- STOP remains active until explicitly closed  
- No implicit closure allowed  

## Execution model
- STOP affects prioritization and flow control  
- Critical STOP may enforce SYSTEM_READONLY behavior  

## References
- /context/playbook/system_playbook_v7.md  
- /context/rules/system_rules.md  