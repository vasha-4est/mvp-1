Status: REFERENCE  
Layer: reference  

This file is the human-readable catalog.  
Machine-readable contracts live in:  
- /context/reference/event_schema.current.json  
- /context/reference/event_schema.target.json  
- /context/reference/event_type_contracts.md  

---

# EVENT CATALOG (MVP-1)

All system actions are recorded as events.  

Event = single source of truth.  

---

## 1. COMMON STRUCTURE

Each event contains:

- event_id (uuid)  
- event_type (string)  
- entity_type (string)  
- entity_id (string)  
- payload_json (object)  
- created_at (timestamp)  
- acting_user_id  
- real_user_id (for impersonation)  
- idempotency_key (optional)  

Rules:
- events are immutable  
- no updates, only new events  
- idempotent where required  

---

## 2. AUTH EVENTS

- user_logged_in  
- user_logged_out  
- user_login_failed  
- login_failed_multiple  

---

## 3. USER MANAGEMENT

- user_created  
- user_role_changed  
- password_reset  
- user_blocked  
- user_unblocked  

---

## 4. IMPERSONATION

- impersonation_started  
- impersonation_ended  

---

## 5. SHIFT EVENTS

- shift_started  
- shift_paused  
- shift_resumed  
- shift_ended  

---

## 6. BATCH EVENTS

- batch_created  
- batch_started  
- batch_finished  
- batch_moved_to_drying  
- batch_drying_started  
- batch_drying_finished  
- batch_moved_to_packaging  
- batch_closed  

---

## 7. PRODUCTION / WORK ITEMS

- task_created  
- task_started  
- task_paused  
- task_completed  
- task_blocked  
- task_issue_reported  

---

## 8. QC EVENTS

- qc_started  
- qc_checked  
- qc_failed  
- qc_passed  
- defect_recorded  

---

## 9. INVENTORY EVENTS

- inventory_received  
- inventory_moved  
- inventory_reserved  
- inventory_released  
- inventory_adjusted  

---

## 10. PICKING EVENTS

- picking_created  
- picking_reserved  
- picking_started  
- picking_scanned  
- picking_confirmed  
- picking_completed  

---

## 11. SHIPMENT EVENTS

- shipment_created  
- shipment_updated  
- shipment_ready  
- shipment_confirmed  
- shipment_shipped  

---

## 12. DRYING EVENTS

- drying_started  
- drying_progress_updated  
- drying_completed  

---

## 13. SYSTEM EVENTS

- system_error  
- system_warning  
- manual_refresh_triggered  

---

## 14. CONTROL TOWER EVENTS

- sla_risk_detected  
- bottleneck_detected  
- wip_limit_reached  
- recommendation_generated  

---

## 15. STOP SYSTEM EVENTS

- stop_triggered  
- stop_acknowledged  
- stop_resolved  
- sop_changed  

---

## 16. KPI EVENTS

- kpi_calculated  
- kpi_threshold_exceeded  

---

## 17. PAYROLL EVENTS

- payroll_entry_created  
- payroll_calculated  
- payroll_confirmed  

Rule:
- no_event → no_pay  

---

## 18. LOCK EVENTS

- lock_acquired  
- lock_released  
- lock_conflict  

---

## 19. IDENTITY RULES

Every critical event MUST include:

- acting_user_id  
- real_user_id (if impersonation)  

---

## 20. CORE PRINCIPLE

If action is not recorded as event:  
→ it did not happen  