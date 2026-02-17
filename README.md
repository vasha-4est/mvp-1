# MVP-1

MVP-1 is an early-stage operations app foundation focused on predictable delivery, clear process rails, and documented architecture for future product iterations.

## What this repository contains
- A Next.js MVP shell.
- Documentation scaffolding that defines architecture, data model, integrations, roadmap, and screen scope.
- Contributor and agent guardrails for PR-based delivery.

## PR-only workflow (for non-programmers)
1. Create a branch for one task.
2. Make only the required changes for that single task.
3. Open a Pull Request with a clear summary and verification steps.
4. Wait for owner feedback in PR comments and apply fixes in the same PR.
5. Merge only after checks are green.

## How to check Vercel Preview for a PR
1. Open the PR in GitHub.
2. Wait for Vercel Preview deployment/check to finish.
3. Confirm the Vercel check is green.
4. Open the Preview URL from the PR checks.
5. Confirm the app loads successfully.

## Auth setup
Required environment variables:

- `SESSION_SECRET`
- `AUTH0_SECRET`
- `AUTH0_BASE_URL`
- `AUTH0_ISSUER_BASE_URL`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`

Main auth endpoints:

- `GET /auth/login`
- `GET /auth/callback`
- `GET /auth/logout`
- `GET /auth/me` (Auth0 session debug)
- `GET /api/auth/me` (app signed-session role)


Auth0 Preview smoke test:

- Open `/auth/login`
- Complete Auth0 login and return through callback
- Confirm you are redirected and `session` cookie is set
- Verify role-based behavior via `/api/auth/me` and `/api/owner/dashboard`

See also: [Auth0 variables and role mapping](./docs/auth0.md).

## Dev auth for Preview/Development only
Use the dev auth endpoints to quickly set a session during smoke testing in non-production auth environments:

- `POST /api/auth/dev/login` with JSON body `{ "role": "OWNER" }` sets an `httpOnly` signed session cookie.
- `POST /api/auth/dev/logout` clears the signed session cookie.

`VERCEL_ENV=production` disables both endpoints (they return `404`), so production requires real Auth0 login/session.

## Documentation location
All project scaffolding docs are in [`/docs`](./docs):
- [Architecture](./docs/ARCHITECTURE.md)
- [Roadmap](./docs/ROADMAP.md)
- [Screens](./docs/SCREENS.md)
- [Data model](./docs/DATA_MODEL.md)
- [Integrations](./docs/INTEGRATIONS.md)
