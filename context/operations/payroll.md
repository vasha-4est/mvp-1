Status: CANONICAL  
Layer: operations  

# PAYROLL LOGIC

## Definition
Payroll is derived from events and system state.  
No event = no pay.  

---

## Core rules

- No event = no pay  
- Every payroll line MUST reference:
  - event_id  
  OR  
  - explicit manual exception  

- Manual adjustment MUST require approval  
- All payroll entries MUST be explainable and auditable  

---

## Structure

Payroll consists of:

- fixed (base compensation)  
- variable (event-driven performance)  
- deposit (advance / prepayment)  

---

## Payroll line model

Each payroll line MUST include:

- employee_id  
- event_id (or manual_exception_id)  
- amount  
- type (fixed | variable | deposit)  
- created_at  

Rules:
- payroll lines MUST be immutable  
- corrections MUST be new entries (no overwrite)  

---

## Event linkage

- Variable pay MUST be derived from events  
- Events MUST define:
  - action performed  
  - quantity / result  
  - context  

- No derived value without source event  

---

## Failure cases

- missing event reference → reject payroll line  
- duplicate event usage → reject or flag  
- manual entry without approval → reject  
- negative or invalid amount → reject  

---

## Execution model

- payroll is calculated, not manually constructed  
- calculations MUST be reproducible  
- system MUST be able to fully reconstruct payroll from events  

---

## Constraints

- payroll MUST be deterministic  
- historical payroll MUST NOT be rewritten  
- adjustments MUST be traceable  

---

## References
- /context/architecture/event_model.md  
- /context/rules/data_integrity.md  