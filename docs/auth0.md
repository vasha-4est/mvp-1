# Auth0 environment variables

Required:

- `AUTH0_SECRET`
- `AUTH0_BASE_URL`
- `AUTH0_ISSUER_BASE_URL`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`

Optional role mapping:

- `AUTH0_ROLE_CLAIM` (default: `https://mvp-1/role`)
- `OWNER_EMAILS` (comma-separated)
- `COO_EMAILS` (comma-separated)

## Preview flow quick check

1. Open `/auth/login`.
2. Complete Auth0 login.
3. Callback mints signed app `session` cookie.
4. Verify `/api/auth/me` and protected routes behavior by role.
