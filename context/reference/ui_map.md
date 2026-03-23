Status: REFERENCE  
Layer: reference  

---

# UI MAP

This file defines the canonical structure of UI screens and their relationships.

UI map is:
- navigation contract
- screen responsibility map
- entry points for all roles

---

# SOURCES OF TRUTH

Primary architecture references:

- /context/architecture/system_architecture.md  
- /context/architecture/control_tower.md  

UI MUST reflect these documents.

If conflict:
- architecture wins  
- UI adapts  

---

# CORE PRINCIPLES

- UI reflects system state, not replaces it  
- No UI-only logic  
- Every screen must map to:
  - entity
  - process
  - or control layer  

- No orphan screens  
- No hidden flows  

---

# SCREEN GROUPS

## 1. AUTH

### Login
- email / login
- password
- session init

---

## 2. BATCH MANAGEMENT

### Create Batch
- create batch
- validate inputs
- send to API

### Batch Card
- batch overview
- status
- timeline

### My Batches
- list of batches by user
- quick actions

---

## 3. PRODUCTION FLOW

### Production Board
- active batches
- workload

### Drying Board
- drying batches
- time left
- alerts

---

## 4. OPERATIONS

### Assembly Station
- read-only (MVP-1)
- SKU mapping

### Packaging Station
- read-only (MVP-1)

### Labeling Station
- read-only (MVP-1)

---

## 5. INVENTORY

### Inventory View
- stock levels
- locations

### Picking
- picking lists
- picking lines

---

## 6. SHIPMENT

### Shipment Readiness
- ready shipments
- blockers

---

## 7. CONTROL TOWER

### Control Tower Dashboard
- WIP
- load
- bottlenecks

### KPI Dashboard
- throughput
- SLA
- daily metrics

### Daily Summary
- end-of-day snapshot

---

# CONTROL TOWER INTEGRATION

UI MUST reflect Control Tower logic:

- signals → visible  
- overload → visible  
- decisions → traceable  

Control Tower is NOT a screen  
It is a layer that:
- aggregates system state  
- drives UI visibility  

---

# NAVIGATION RULES

- Every screen has:
  - entry point
  - exit path  

- No dead ends  

- Navigation MUST follow process flow:
  production → drying → ready → shipment  

---

# STATE VISIBILITY

UI MUST:

- show real system state  
- not cache critical state incorrectly  
- reflect backend as source of truth  

---

# ROLE VISIBILITY

Access controlled by:

- roles  
- permissions  

Rules:
- UI hides forbidden actions  
- API enforces permissions  

---

# EVENT LINKING

Every action in UI MUST:

- produce event  
- or read events  

No silent mutations  

---

# NON-NEGOTIABLE RULES

- No screen without purpose  
- No action without API  
- No API without event  
- No UI bypassing system logic  