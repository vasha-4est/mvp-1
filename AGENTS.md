# AGENTS Rules

These rules apply to all contributors and automation agents in this repository.

## Delivery workflow
- **1 task = 1 PR**. Do not mix unrelated work in a single pull request.
- Use this order in every PR description:
  1. **Plan**
  2. **Changes**
  3. **How to verify**
  4. **Rollback**
- Keep PRs small and reviewable.

## Safety and quality rails
- Never commit secrets, tokens, credentials, or private keys.
- Do not change Vercel project/settings unless there is explicit instruction in the task.
- The `main` branch must remain green (passing checks) at all times.
- Prefer additive docs/process updates over risky runtime changes unless the task explicitly requires behavior changes.
