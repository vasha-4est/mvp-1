# AGENTS.md — Final Policy Gate (MVP-1)

Status: CANONICAL  
Layer: root  

This file is the policy gate for all agents working in this repository.  
It is short on purpose. Context lives in `/context/`.  
README explains the project. AGENTS constrains execution.

---

## 1. PURPOSE

Agents MUST:
- execute one scoped task at a time
- preserve architecture
- keep production-safe behavior
- prefer minimal, reversible changes

Agents MUST NOT:
- invent behavior
- invent architecture
- bypass system rules
- treat documentation as optional

---

## 2. ENTRY ORDER (MANDATORY)

Before changing code, agents MUST read in this order:

1. `/context/index.md`
2. relevant file(s) in `/context/rules/`
3. relevant file(s) in `/context/architecture/`
4. relevant file(s) in `/context/operations/`, `/context/metrics/`, `/context/scenarios/`
5. `/context/playbook/system_playbook_v7.md` if management logic is involved

If conflict:
- `rules` win
- then `architecture`
- then `operations`
- then `metrics`
- then `scenarios`
- then `playbook`
- `reference` never overrides canonical files

---

## 3. DELIVERY WORKFLOW

- **1 task = 1 PR**
- PR title MUST start with: `PR-XX —`
- Branch/PR MUST stay scoped to a single task
- Keep PRs small and reviewable

Every PR description MUST use this exact order:

1. **Plan**
2. **Changes**
3. **How to verify**
4. **Rollback**

---

## 4. TOOLING (CURRENT REPO)

Before finishing work, agents MUST run the commands that are actually available in this repo:

```bash
npm run build
npx tsc --noEmit
```

If a change touches runtime behavior, agents SHOULD also verify the affected route/page locally.

If future scripts are added (lint/tests), agents MUST use them too.

Agents MUST NOT claim lint/tests passed if such scripts do not exist.

---

## 5. ARCHITECTURAL BOUNDARIES

System execution model:

```text
UI → API → Domain → GAS → Tables → Events → Control Tower → UI
```

Rules:
- UI MUST NOT write directly to tables
- all mutations MUST go through API
- domain logic MUST NOT live in UI
- GAS is authoritative for state changes
- no silent state changes
- no mutation without event

Canonical stores:
- `OPS_DB` = operational state
- `CONTROL_MODEL` = governance / permissions / thresholds / scenarios

Agents MUST NOT:
- create duplicate domain sheets
- rename canonical sheets
- split one domain across multiple parallel stores
- infer semantics from sheet names alone

---

## 6. EVENT SYSTEM RULES

Events are mandatory system truth.

Agents MUST:
- use canonical event vocabulary for new code
- keep events append-only
- preserve idempotency where actions are retryable
- normalize legacy event formats before using them in new logic

Agents MUST NOT:
- introduce new legacy-style event shapes
- rewrite historical events
- patch state silently without event linkage

Primary references:
- `/context/architecture/event_model.md`
- `/context/architecture/events_mapping.md`
- `/context/reference/event_catalog.md`
- `/context/reference/event_type_contracts.md`

---

## 7. SECURITY

Agents MUST NOT:
- commit secrets, tokens, credentials, private keys
- commit `.env.local`
- change Vercel project/settings unless explicitly asked
- expose hidden internal URLs or secret values in docs/PR text

Agents MUST treat these as local-only / secret-adjacent:
- `.env.local`
- service credentials
- API keys
- deployment secrets

---

## 8. LOCAL DEV RULES

Local runbook:
- `/local_dev_runbook.md`

Agents MUST assume:
- `.env.example` is reference only
- `.env.local` is runtime config
- local dev may use `POST /api/auth/dev/login` in non-production only

Agents MUST NOT:
- rely on dev-login behavior in production logic
- weaken production auth because local dev is easier that way

---

## 9. MUST / MUST NOT

### MUST
- preserve backward compatibility unless task explicitly changes contract
- keep changes additive where possible
- document new constraints in `/context` if behavior becomes repeatable
- use copy-paste-ready instructions for the owner
- prefer safest minimal implementation when uncertain

### MUST NOT
- refactor unrelated modules “while here”
- add new dependencies without strong reason
- move business logic into client components
- mix migration work with feature work unless task explicitly requires both
- claim success without verification path

---

## 10. DEFINITION OF DONE

A task is DONE only if:

- scoped change is implemented
- `npm run build` passes
- `npx tsc --noEmit` passes
- affected route/page/API has a clear verification path
- Preview/rollback instructions are written in PR format
- no existing documented behavior is silently broken

If verification could not be completed, agents MUST say so explicitly.

---

## 11. REFERENCE-BY-EXAMPLE RULE

Agents SHOULD reduce ambiguity by following existing repo patterns.

Prefer existing patterns from:
- `app/api/`
- current read-only station routes
- existing GAS action files
- existing request/error normalization

Agents MUST NOT create a second style when a working repo pattern already exists.

---

## 12. FAILURE MODE

If uncertain:

- choose the safest minimal implementation
- avoid irreversible changes
- do not invent undocumented behavior
- escalate uncertainty in the PR notes
- update `/context` if a recurring ambiguity was discovered

---

## 13. FINAL PRINCIPLE

README explains.  
`/context` defines truth.  
AGENTS enforces behavior.

Short. Hard. Checkable.
