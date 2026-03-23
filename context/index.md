Status: CANONICAL  
Layer: root  

# CONTEXT ENTRYPOINT (SYSTEM)

This file is the entry point for all agents (Codex, automation, humans).  
It defines how to navigate the system and how to interpret all files.  

---

## PURPOSE

- define system structure  
- define priority of truth  
- provide navigation entry  
- prevent ambiguity for agents  

---

## HOW TO USE THIS CONTEXT

Agents MUST follow this order:

1. Read this file  
2. Resolve task type (rule / architecture / operation / scenario)  
3. Navigate to corresponding layer  
4. Use CANONICAL files only for decisions  
5. Use BRIDGE for migration  
6. Use DERIVED / REFERENCE only for support  

---

## PRIORITY OF TRUTH

1. rules  
2. architecture  
3. operations  
4. metrics  
5. scenarios  
6. playbook  
7. reference  

---

## FILE STATUS MEANING

- CANONICAL = binding source of truth  
- BRIDGE = migration layer  
- DERIVED = summary  
- REFERENCE = examples/templates  

---

## SYSTEM NAVIGATION

### Rules (highest authority)
- /context/rules/

### Architecture (system design)
- /context/architecture/system_architecture.md  
- /context/architecture/data_model.md  
- /context/architecture/data_flow.md  
- /context/architecture/event_model.md  
- /context/architecture/control_tower.md  

### Operations (execution logic)
- /context/operations/  

### Metrics (measurement & limits)
- /context/metrics/  

### Scenarios (system reactions)
- /context/scenarios/  

### Playbook (management layer)
- /context/playbook/system_playbook_v7.md  

### Reference (supporting data)
- /context/reference/  

---

## CORE EXECUTION MODEL

System operates as:

UI → API → Domain → GAS → Tables → Events → Control Tower → UI  

Rules:
- no direct UI → DB writes  
- all mutations go through API  
- every mutation produces event  

---

## EVENT SYSTEM (CRITICAL)

- Event = single source of truth  
- No event → no action  
- No mutation without event  

See:
- /context/architecture/event_model.md  
- /context/reference/event_catalog.md  
- /context/reference/event_type_contracts.md  

---

## CONTROL TOWER (SYSTEM BRAIN)

Control Tower:
- reads events  
- computes load, SLA risk, bottlenecks  
- triggers scenarios  

See:
- /context/architecture/control_tower.md  
- /context/metrics/thresholds.md  
- /context/scenarios/  

---

## NON-NEGOTIABLE RULES

- No direct table writes  
- No silent state change  
- No logic outside domain layer  
- No UI-only behavior  

---

## ENTRY DECISION TREE (FOR AGENTS)

If task is:

- "how system works" → architecture  
- "how to implement logic" → operations  
- "how to react" → scenarios  
- "how to measure" → metrics  
- "what is allowed" → rules  

---

## FINAL PRINCIPLE

System is:

- event-driven  
- state-controlled  
- rule-governed  

If something is unclear:
→ follow priority of truth  