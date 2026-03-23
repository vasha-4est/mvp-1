Status: CANONICAL  
Layer: metrics  

# CAPACITY MODEL

## Definition
Capacity model defines system throughput limits and production capabilities.  
It is used by Control Tower for rate calculation, WIP control, and bottleneck detection.  

---

## Canonical source

Canonical spreadsheet template:  
- /context/assets/spreadsheet-templates/OPS_CAPACITY_MODEL.xlsx  

This file defines interpretation rules, not raw spreadsheet contents.  

---

## Core components

- production rate  
- drying capacity  
- packaging rate  

Additional:
- station limits  
- buffer capacity  
- SLA constraints  

---

## Effective rate

effective_rate = mix(norm_rate, actual_rate)  

Where:
- norm_rate = planned capacity (from model)  
- actual_rate = real throughput (from events)  

Rules:
- effective_rate MUST reflect current system state  
- effective_rate MUST be recalculated continuously  

---

## Usage

Capacity model is used by Control Tower to:

- detect bottlenecks  
- enforce WIP limits  
- calculate SLA risk  
- estimate ETA  
- adjust priorities  

---

## Core rules

- Capacity limits MUST be respected  
- Overload MUST trigger scenario  
- Underutilization MAY trigger optimization  

---

## Execution model

- Capacity model MUST NOT store operational data  
- All inputs MUST come from:
  - OPS_CAPACITY_MODEL  
  - events_log  
- Calculations MUST be deterministic  

---

## Constraints

- Capacity MUST NOT be hardcoded in logic  
- All values MUST come from CONTROL_MODEL / templates  
- Manual overrides MUST be explicit and logged  

---

## References
- /context/architecture/control_tower.md  
- /context/metrics/thresholds.md  
- /context/architecture/data_model.md  