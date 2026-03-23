Status: CANONICAL  
Layer: scenarios  

# OVERLOAD

## Trigger
- WIP high  
- SLA risk  

## Detection
- load > threshold (from capacity_model)  
- SLA breach probability > threshold  

## Auto-actions
- block new batches  
- prioritize critical SKU  

## Escalation
- notify COO  

## Exit conditions
- load returns below threshold  
- SLA risk resolved  