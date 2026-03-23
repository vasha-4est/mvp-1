Status: CANONICAL  
Layer: architecture  

# CONTROL TOWER ENGINE

## Purpose
Control Tower is the real-time decision system responsible for prioritization, risk detection, and flow control across operations.

## Inputs
- OPS_CAPACITY_MODEL (rates, limits, norms)  
- events_log (real-time event stream)  
- inventory state  
- shipment state  
- picking state  
- batch state  

Rules:
- Inputs MUST reflect current operational state  
- Derived data MUST NOT override source data  

## Computations
Control Tower continuously computes:

- effective_rate (actual vs planned throughput)  
- WIP limits (work-in-progress constraints)  
- bottlenecks (resource or flow constraints)  
- SLA risk (deadline violation probability)  
- ETA (expected completion time)  

Rules:
- Computations MUST be deterministic  
- Computations MUST be based on latest available events  

## Outputs
Control Tower produces:

- priorities (what to do next)  
- recommendations (actions to optimize flow)  
- risk signals (SLA, overload, failures)  
- block signals (when flow must be restricted)  
- system health state  

Rules:
- Outputs MUST NOT mutate state directly  
- Outputs are advisory or control signals only  

## Update cycle
- periodic update: every 60 seconds  
- event-driven update: on critical events  

Critical events include:
- SLA risk detected  
- WIP limit exceeded  
- STOP triggered  

## Control behavior
- Control Tower MAY reprioritize tasks  
- Control Tower MAY restrict new work (WIP control)  
- Control Tower MUST NOT bypass business rules  

## Constraints
- Control Tower MUST NOT write directly to OPS_DB  
- All actions MUST go through backend/event layer  
- No silent decisions — all signals must be traceable  

## References
- /context/metrics/capacity_model.md  
- /context/metrics/thresholds.md  
- /context/architecture/system_architecture.md  
- /context/rules/system_rules.md  