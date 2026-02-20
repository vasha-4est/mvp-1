# PR-52 — Full Auth Smoke (DEV/PREVIEW/PROD auto-detect)

Use this in browser DevTools Console. It auto-detects whether dev endpoints are enabled.

```js
(async () => {
  const now = new Date().toISOString();

  const req = async (url, { method = "GET", body } = {}) => {
    const started = performance.now();
    const r = await fetch(url, {
      method,
      credentials: "include",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    const out = {
      method,
      url,
      status: r.status,
      ok: r.ok,
      ms: Math.round(performance.now() - started),
      json,
      textHead: text.slice(0, 180),
    };

    console.log(`${method} ${url}`, out.status, out.json || out.textHead);
    return out;
  };

  console.log("=== MVP-1 FULL AUTH SMOKE PR-52 ===");
  console.log("ts:", now);
  console.log("origin:", location.origin);

  await req("/api/auth/logout", { method: "POST" });

  const devLogout = await req("/api/auth/dev/logout", { method: "POST" });
  const devMode = devLogout.status !== 404;

  if (devMode) {
    const devLogin = await req("/api/auth/dev/login", { method: "POST", body: {} });
    if (!devLogin.ok) {
      console.error("❌ dev/login failed");
      return;
    }

    await req("/api/control-model/health?debug=1");
    await req("/api/owner/users?debug=1");
    await req("/api/auth/provision?debug=1", { method: "POST" });
    await req("/api/auth/logout", { method: "POST" });
  } else {
    console.log("PROD mode: dev endpoints are disabled (expected)");
  }

  const real = await req("/api/auth/login?debug=1", {
    method: "POST",
    body: { username: "nikolay", password: "MVP1-Owner-260217!" },
  });

  const me = await req("/api/auth/me");

  if (!real.ok && !devMode) {
    // In prod, only run extra diagnostics if already authorized.
    if (me.ok) {
      await req("/api/control-model/health");
      await req("/api/gas/debug");
    }
    console.error("❌ REAL login failed");
    return;
  }

  if (!real.ok) {
    console.error("❌ REAL login failed");
    return;
  }

  console.log("✅ PASS");
  console.log("=== DONE ===");
})();
```

Notes:
- `scrypt$saltHex$hashHex` legacy format is supported with default `N=4096`.
- `?debug=1` on `/api/auth/login` returns `debug_reason` only in non-production.
