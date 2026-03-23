Status: CANONICAL  
Layer: architecture  

# DATA MODEL

## Canonical stores
- OPS_DB = operational state (execution layer)  
- CONTROL_MODEL = governance, RBAC, thresholds, scenarios  

Spreadsheet templates are stored in:  
/context/assets/spreadsheet-templates/  

---

## OPS_DB — canonical sheets

Operational database (execution layer):

- config_flags  
- flag_dependencies  

- batch_registry  
- batches  
- batch_events  

- work_items  
- incidents  

- inventory_balances  
- inventory_moves  

- picking_lists  
- picking_lines  

- shipments  
- shipment_lines  
- shipment_plan_import  

- events_log  
- idempotency_log  
- locks  

- users_directory_cache  

- notification_outbox  

- kpi_daily  
- scenario_state  

---

## CONTROL_MODEL — canonical sheets

Management and governance layer:

- system_config  

- roles_registry  
- users_roles  
- rbac_permissions  
- role_forbidden_actions  

- users_directory  

- process_registry  
- events_catalog  

- kpi_catalog  
- kpi_thresholds  
- kpi_formulas  

- scenarios  
- scenario_rules  
- auto_actions  

- feature_flags  
- flag_dependencies  

- operation_norms  
- capacity_model  

- tariffs  

- skills_matrix  
- career_grades  

- onboarding_offboarding  

- zone_playbooks  

- stop_actions  

- overload_signals  
- overload_rules  

- data_sync_rules  

- system_logs  

---

## Data ownership

- OPS_DB owns operational state  
- CONTROL_MODEL owns control logic  

Rules:
- Data MUST NOT be duplicated across stores  
- Derived data MUST NOT override source data  
- CONTROL_MODEL MUST NOT store operational state  

---

## Write model

- All writes MUST go through backend (API → GAS)  
- No direct client writes to spreadsheets  
- No manual edits except OWNER (with audit)  

---

## Event linkage

- All state changes MUST be linked to events  
- events_log is the global audit layer  
- No state change without corresponding event  

---

## Constraints

- Canonical sheet names MUST NOT be changed  
- New sheets MUST NOT duplicate existing domains  
- Schema changes MUST be explicit and versioned  

---

## Interpretation rule

Do not infer semantics from sheet names alone.  
Canonical semantics are defined in this file and in project specifications.  

---

## References
- /context/architecture/system_architecture.md  
- /context/architecture/event_model.md  
- /context/rules/data_integrity.md  