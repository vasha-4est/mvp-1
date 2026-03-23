Status: CANONICAL
Layer: rules

# SYSTEM RULES

- Every state-changing action MUST create an event
- Events MUST be immutable
- Critical actions MUST require explicit confirmation
- History MUST NOT be rewritten
- Direct spreadsheet edits by non-OWNER actors are forbidden

Violation = system error

If a rule cannot be checked, it is not a real rule.