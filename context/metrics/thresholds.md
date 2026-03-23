Status: CANONICAL  
Layer: metrics  

# THRESHOLDS

## Definition
Thresholds define system reaction to KPI deviations.  
They are used to trigger warnings, STOP events, and scenarios.  

---

## Threshold table

| Metric        | Warning threshold        | STOP threshold         | Action                    |
|--------------|-------------------------|------------------------|---------------------------|
| SLA risk     | SLA risk detected       | SLA breach imminent    | reprioritize / STOP       |
| WIP level    | WIP > limit             | WIP >> limit           | restrict intake / STOP    |
| defect rate  | > 2%                    | > 3%                   | quality STOP              |

---

## Core rules

- Each KPI MUST have:
  - warning threshold  
  - STOP threshold  

- Thresholds MUST trigger scenarios  
- STOP threshold MUST trigger STOP event  
- Warning threshold MUST trigger signal (not STOP)  

---

## Execution model

- Threshold evaluation MUST be automatic  
- Evaluation MUST use latest available data  
- Threshold breach MUST be logged as event  

---

## Constraints

- Thresholds MUST be deterministic  
- Thresholds MUST NOT be hardcoded in logic  
- Threshold values MUST come from CONTROL_MODEL  

---

## References
- /context/metrics/kpi.md  
- /context/scenarios/overload.md  
- /context/scenarios/sla_risk.md  
- /context/rules/stop_system.md  