# AgentPlane bootstrap for MVP-1

This pack is a **local-only orchestration layer** for `mvp-1`.
It is not a product PR and does not need GitHub review.

## Goal

Single-entry workflow:

1. You describe the next task in plain language.
2. PRODUCT_ORCHESTRATOR reads roadmap + repo state.
3. It creates/updates the task in AgentPlane.
4. It runs the internal flow:
   - ORCHESTRATOR
   - PLANNER
   - CODER
   - REVIEWER
   - TESTER / VERIFIER
5. It returns to you only:
   - smoke
   - UI checklist

After you verify localhost:

6. You tell it "smoke ok, ui ok"
7. It returns:
   - branch name
   - commit title
   - PR title
   - PR description

After you merge:

8. You tell it "PR merged"
9. It moves roadmap state forward and gives the start prompt for the next PR.

## How to install

From the root of your local `mvp-1` repo:

```bash
npm install -g agentplane
agentplane init
```

Then replace the generated local files with the contents of this pack:

- `AGENTS.md`
- `.agentplane/config.json`
- `.agentplane/WORKFLOW.md`
- `.agentplane/agents/*.json`
- `.agentplane/product/roadmap.md`
- `.agentplane/product/current_state.md`
- `.agentplane/product/target_state.md`

## Recommended workflow mode

Use:

```bash
agentplane config set workflow_mode direct
```

This matches your solo local loop best.

## Human responsibilities

You only do:

- describe the task
- run smoke on localhost
- inspect UI
- merge PR

You do **not** manually maintain:
- backlog
- run state
- role-by-role prompts
- task staging files

## Important note

AgentPlane still needs a controlling conversation with PRODUCT_ORCHESTRATOR.
This pack reduces manual role juggling drastically, but it does not remove your final validation gate.
