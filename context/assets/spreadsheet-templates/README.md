Status: REFERENCE  
Layer: assets  

---

# Spreadsheet Templates

These files are canonical spreadsheet templates referenced by MVP-1 specification.

---

## TEMPLATES

- OPS_DB.xlsx → operational database template  
- CONTROL_MODEL.xlsx → RBAC / governance / control logic  
- OPS_CAPACITY_MODEL.xlsx → norms, limits, SLA inputs for Control Tower  
- CEO_FINANCE_CORE.xlsx → finance aggregates / limits (read-only for MVP-1)  
- Logistics_Shipment_Plan_Import_Template.xlsx → logistics import source  

---

## USAGE RULES

These are source artifacts, not policy files.

Agents MUST NOT infer business rules from:
- file names  
- sheet names  
- column labels  

---

## SOURCE OF TRUTH

Canonical interpretation lives in:

- /context/architecture/data_model.md  
- /context/metrics/capacity_model.md  
- /context/playbook/system_playbook_v7.md  