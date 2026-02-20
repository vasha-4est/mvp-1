(async () => {
  const ORIGIN = location.origin;
  const now = () => new Date().toISOString();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function req(path, { method = "GET", body, debug = false } = {}) {
    const url = debug ? `${path}${path.includes("?") ? "&" : "?"}debug=1` : path;
    const t0 = performance.now();
    let res;
    let text;
    let json;

    try {
      res = await fetch(url, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      text = await res.text();
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    } catch (error) {
      return { url, method, ok: false, status: 0, ms: Math.round(performance.now() - t0), error: String(error) };
    }

    return {
      url,
      method,
      ok: res.ok && (json ? json.ok !== false : true),
      status: res.status,
      ms: Math.round(performance.now() - t0),
      textHead: (text || "").slice(0, 220),
      json,
    };
  }

  function log(label, x) {
    console.log(`${label}:`, x);
    return x;
  }

  const diag = {
    ts: now(),
    origin: ORIGIN,
    mode: null,
    failures: [],
    dev: {},
    prod: {},
    cm: null,
  };

  log("logout", await req("/api/auth/logout", { method: "POST" }));

  const devProbe = await req("/api/auth/dev/login", { method: "POST", body: { role: "OWNER" } });
  if (devProbe.status === 404) {
    diag.mode = "PROD (no dev endpoints)";
  } else {
    diag.mode = "DEV";
  }

  if (diag.mode === "DEV") {
    log("dev/logout", await req("/api/auth/dev/logout", { method: "POST" }));
    const devLogin = log("dev/login(OWNER)", await req("/api/auth/dev/login", { method: "POST", body: { role: "OWNER" } }));
    diag.dev.dev_login_ok = devLogin.ok;

    const meAfterDev = log("me(after dev)", await req("/api/auth/me"));
    diag.dev.me_ok = meAfterDev.ok;

    const gas = log("gas/health", await req("/api/gas/health"));
    diag.dev.gas_ok = gas.ok;

    const cm = log("control-model/health?debug=1", await req("/api/control-model/health", { debug: true }));
    diag.cm = cm.json || null;
    diag.dev.cm_ok = cm.ok;
    diag.dev.cm_header_ok = !!cm.json?.header_ok;

    const users = log("owner/users?debug=1", await req("/api/owner/users", { debug: true }));
    diag.dev.users_ok = users.ok;
    diag.dev.users_total = users.json?.data?.total;

    const prov = log("auth/provision?debug=1", await req("/api/auth/provision", { method: "POST", debug: true }));
    diag.dev.prov_ok = prov.ok;
    diag.dev.prov_processed = prov.json?.processed;
    diag.dev.prov_provisioned = prov.json?.provisioned_count;
  }

  const REAL = { login: "nikolay", username: "nikolay", password: "MVP1-Owner-260217!" };

  log("logout(2)", await req("/api/auth/logout", { method: "POST" }));

  let realLogin = await req("/api/auth/login", { method: "POST", body: { login: REAL.login, password: REAL.password } });
  if (!realLogin.ok) {
    await sleep(200);
    realLogin = await req("/api/auth/login", { method: "POST", body: { username: REAL.username, password: REAL.password } });
  }
  log("REAL login (nikolay)", realLogin);

  const meAfterReal = log("me(after REAL)", await req("/api/auth/me"));
  log("control-model/health (after REAL)", await req("/api/control-model/health"));

  const mustHave = [
    { key: "REAL login (nikolay)", ok: realLogin.ok },
    { key: "me(after REAL)", ok: meAfterReal.ok },
  ];

  if (diag.mode === "DEV") {
    const cmOk = !!diag.dev.cm_ok && !!diag.dev.cm_header_ok;
    mustHave.push(
      { key: "dev/login", ok: !!diag.dev.dev_login_ok },
      { key: "me(after dev)", ok: !!diag.dev.me_ok },
      { key: "gas/health", ok: !!diag.dev.gas_ok },
      { key: "control-model health", ok: cmOk },
      { key: "owner/users", ok: !!diag.dev.users_ok },
      { key: "auth/provision", ok: !!diag.dev.prov_ok }
    );
  }

  const failed = mustHave.filter((x) => !x.ok).map((x) => x.key);
  diag.failures = failed;

  console.log("DIAG:", diag);
  if (failed.length) {
    console.log("❌ FAIL keys:", failed);
  } else {
    console.log("✅ PASS");
  }
})();
