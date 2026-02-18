/*
Run in browser DevTools console on the same Preview origin.
Checks owner session + debug payload for users_directory and provision behavior.
*/
(async () => {
  const loginAsOwner = async () => {
    const r = await fetch(`/api/auth/dev/login?role=OWNER`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "OWNER" }),
    });
    console.log("dev login", r.status, await r.text());
  };

  const probe = async (path, opts = {}) => {
    const r = await fetch(path, { credentials: "include", ...opts });
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("application/json") ? await r.json() : await r.text();
    console.log(path, "->", r.status, body);
    return { status: r.status, body };
  };

  await loginAsOwner();
  await probe("/api/auth/me");
  await probe("/api/owner/users?debug=1");
  await probe("/api/auth/provision?debug=1", { method: "POST" });

  // Optional login probe (wrong password -> 401 INVALID_CREDENTIALS,
  // source unavailable -> 503 CONTROL_MODEL_UNAVAILABLE)
  // await probe("/api/auth/login", {
  //   method: "POST",
  //   headers: { "content-type": "application/json" },
  //   body: JSON.stringify({ username: "nikolay", password: "wrong" }),
  // });
})();
