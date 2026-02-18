/*
Run in browser DevTools console after logging in as OWNER.
Performs quick smoke checks for PR-43 fix flow.
*/
(async () => {
  const me = await fetch('/api/auth/me', { credentials: 'include' });
  const meBody = await me.json();
  console.log('GET /api/auth/me', me.status, meBody);

  const provision = await fetch('/api/owner/users/provision', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'missing_only' }),
  });
  const provisionBody = await provision.json();
  console.log('POST /api/owner/users/provision', provision.status, provisionBody);
})();
