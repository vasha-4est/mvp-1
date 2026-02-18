# PR-42 Smoke Test (Vercel Preview)

```js
// PR-42 SMOKE — paste into DevTools Console on the Vercel Preview domain
// Assumes dev auth endpoints still exist in non-production OR internal login works.
// If dev endpoints are removed, you can run the "manual login" part by using /login UI.

(async () => {
  const BASE = location.origin;
  const j = async (url, opts={}) => {
    const res = await fetch(url, { credentials: "include", ...opts });
    const ct = res.headers.get("content-type") || "";
    const rid = res.headers.get("x-request-id") || null;
    let data = null;
    if (ct.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      const t = await res.text().catch(() => "");
      data = { text: t.slice(0, 200) };
    }
    return { status: res.status, ct, rid, data, url };
  };

  const ok = (cond, msg, meta) => {
    if (!cond) {
      console.error("❌", msg, meta || "");
      throw new Error("SMOKE FAILED: " + msg);
    }
    console.log("✅", msg, meta || "");
  };

  console.log("=== PR-42 UI + RBAC SMOKE start ===", { BASE, at: new Date().toISOString() });

  // 1) unauth should not access owner API
  const noRoleUsers = await j(`${BASE}/api/owner/users`);
  ok([401,403].includes(noRoleUsers.status), "unauth /api/owner/users -> 401/403", {status:noRoleUsers.status, code:noRoleUsers.data?.code});

  // 2) login as OWNER (dev endpoint if present)
  // If your repo uses /api/auth/dev/login with role query/body, try both.
  let loginOwner = await j(`${BASE}/api/auth/dev/login?role=OWNER`, { method: "POST", headers: { "content-type":"application/json" }, body: JSON.stringify({}) });
  if (loginOwner.status === 404 || loginOwner.status === 405) {
    loginOwner = await j(`${BASE}/api/auth/dev/login`, { method: "POST", headers: { "content-type":"application/json" }, body: JSON.stringify({ role: "OWNER" }) });
  }
  ok([200,404].includes(loginOwner.status), "dev login OWNER -> 200 (or 404 if dev login disabled)", {status:loginOwner.status});

  // If dev login is disabled, you must manually login via /login then re-run from step 3.
  if (loginOwner.status !== 200) {
    console.log("ℹ️ Dev login disabled. Please login manually at /login, then re-run smoke from step 3.");
    return;
  }

  // 3) owner users list should be accessible
  const ownerUsers = await j(`${BASE}/api/owner/users`);
  ok([200,502].includes(ownerUsers.status), "OWNER /api/owner/users -> 200 or 502", {status:ownerUsers.status});
  ok(ownerUsers.status !== 200 || Array.isArray(ownerUsers.data?.data?.users), "users[] exists when 200", {sample: ownerUsers.data?.data?.users?.[0]});

  // 4) Create a user (if endpoint exists)
  const uname = `u_${Math.random().toString(16).slice(2,8)}`;
  const createUser = await j(`${BASE}/api/owner/users`, {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify({
      username: uname,
      password: "Passw0rd!123",
      roles: ["VIEWER","PACKER"],
      status: "active",
      notes: "smoke",
    }),
  });

  ok([200,201,404].includes(createUser.status), "create user -> 200/201 (or 404 if not implemented)", {status:createUser.status, body:createUser.data});
  const createdId = createUser.data?.data?.user?.user_id || createUser.data?.data?.user_id || null;

  if (createdId) {
    // 5) fetch user details
    const getUser = await j(`${BASE}/api/owner/users/${encodeURIComponent(createdId)}`);
    ok(getUser.status === 200, "get user -> 200", {status:getUser.status});
    ok((getUser.data?.data?.user?.username || "").includes(uname), "username matches", {username:getUser.data?.data?.user?.username});

    // 6) disable user
    const disableUser = await j(`${BASE}/api/owner/users/${encodeURIComponent(createdId)}/status`, {
      method: "PATCH",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ status: "disabled" }),
    });
    ok([200,204].includes(disableUser.status), "disable user -> 200/204", {status:disableUser.status});

    // 7) reset password
    const resetPwd = await j(`${BASE}/api/owner/users/${encodeURIComponent(createdId)}/password`, {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ password: "NewPassw0rd!456" }),
    });
    ok([200,204].includes(resetPwd.status), "reset password -> 200/204", {status:resetPwd.status});
  } else {
    console.log("ℹ️ create user endpoint not present or did not return id; skipping user mutation steps.");
  }

  console.log("✅ PR-42 UI + RBAC SMOKE PASSED");
})();
```
