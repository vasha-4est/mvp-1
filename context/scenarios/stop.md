Status: CANONICAL  
Layer: scenarios  

# STOP SCENARIO

## Trigger
- critical failure  
- data inconsistency  

## Detection
- integrity violation detected  
- system cannot guarantee correct state  
- repeated STOP without resolution  

## Auto-actions
- freeze operations  
- block new actions  
- restrict system flow  

## Escalation
- require decision (D)  
- notify responsible owner  

## Exit conditions
- decision made  
- SOP_CHANGE or explicit waiver applied  
- system state verified  

## References
- /context/rules/stop_system.md  
- /context/playbook/system_playbook_v7.md  