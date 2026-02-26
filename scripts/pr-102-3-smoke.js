/**
 * PR-102-3 STRICT OPTIMISTIC LOCKING SMOKE v3 (fixed expectations + retries)
 * Run in DevTools Console on the Vercel Preview for PR-102-3.
 */
(async () => {
  const ridBase = `smoke-${Date.now()}`;
  const results = [];
  const log = (ok, msg, value) => {
    const line = ok ? "✅" : "❌";
    console[ok ? "log" : "error"](`${line} ${msg}`, value ?? "");
    if (!ok) throw new Error(msg);
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fetchJson(url, { method = "GET", body = null, rid = null, expectCtJson = true } = {}) {
    const t0 = performance.now();
    const res = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        ...(rid ? { "x-request-id": rid } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ms = Math.round(performance.now() - t0);
    const ct = res.headers.get("content-type") || "";
    const xr = res.headers.get("x-request-id") || rid || "";
    const text = await res.text();
    let json = null;
    try {
      if (ct.includes("application/json")) json = JSON.parse(text);
    } catch {}
    results.push({ url, method, status: res.status, ms, ct, rid: xr, preview: (text || "").slice(0, 140) });
    if (expectCtJson) {
      log(ct.includes("application/json"), `${method} ${url} content-type JSON`, {
        ct,
        status: res.status,
        preview: text.slice(0, 140),
      });
    }
    return { res, status: res.status, ct, rid: xr, text, json };
  }

  async function withRetry(label, fn, { tries = 3, baseDelay = 900 } = {}) {
    let lastErr = null;
    for (let i = 0; i < tries; i++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        const d = baseDelay * Math.pow(2, i);
        console.warn(`ℹ️ retry ${label} (${i + 1}/${tries}) in ${d}ms:`, String(e?.message || e));
        await sleep(d);
      }
    }
    throw lastErr || new Error(`failed: ${label}`);
  }

  const flags = await withRetry("flags", () => fetchJson("/api/flags", { rid: `${ridBase}-flags` }));
  log(flags.status === 200, "FLAGS 200", flags.status);
  log(!!flags.json && flags.json.ok === true, "FLAGS ok:true", flags.json);
  log(!!flags.rid, "FLAGS has x-request-id header", flags.rid);
  log(flags.json?.flags?.SYSTEM_READONLY === false, "SYSTEM_READONLY false", flags.json?.flags);

  const balances = await withRetry("balances", () => fetchJson("/api/inventory/balances", { rid: `${ridBase}-bal` }));
  log(balances.status === 200, "GET balances 200", balances.status);
  log(balances.json?.ok === true, "balances ok:true", balances.json);
  const items = balances.json?.items;
  log(Array.isArray(items), "balances items array", { len: items?.length });

  const from = items.find((r) => r && r.sku_id && r.location_id && r.version_id != null && Number(r.on_hand_qty) >= 5);
  log(!!from, "found balance row with on_hand_qty>=5", from);

  const sku_id = from.sku_id;
  const from_location_id = from.location_id;
  const fromVersion = Number(from.version_id);
  log(Number.isFinite(fromVersion), "baseline from.version_id numeric", from.version_id);

  const toRow = items.find((r) => r && r.sku_id === sku_id && r.location_id && r.location_id !== from_location_id && r.version_id != null);
  const to_location_id = toRow ? toRow.location_id : "ASSEMBLY";
  log(to_location_id !== from_location_id, "to_location_id differs", { from_location_id, to_location_id });

  console.log("=== A) MOVE strict version checks ===");

  {
    const rid = `${ridBase}-move-missing`;
    const body = { sku_id, from_location_id, to_location_id, qty: 1 };
    const r = await fetchJson("/api/inventory/move", { method: "POST", body, rid });
    log(r.status === 400, "MOVE missing expected_version => 400", { status: r.status, json: r.json });
    log(r.json?.code === "VALIDATION_ERROR", "MOVE missing => VALIDATION_ERROR", r.json);
  }

  {
    const rid = `${ridBase}-move-wrong`;
    const body = {
      sku_id,
      from_location_id,
      to_location_id,
      qty: 1,
      expected_version_id_from: String(fromVersion + 9999),
      ...(toRow ? { expected_version_id_to: String(toRow.version_id) } : {}),
    };
    const r = await fetchJson("/api/inventory/move", { method: "POST", body, rid });
    log(r.status === 409, "MOVE wrong expected_version => 409", { status: r.status, json: r.json });
    log(r.json?.code === "VERSION_CONFLICT", "MOVE wrong => VERSION_CONFLICT", r.json);
    log(r.json?.details?.actual_version_id != null, "MOVE conflict details.actual_version_id present", r.json?.details);
    log(r.json?.details?.expected_version_id != null, "MOVE conflict details.expected_version_id present", r.json?.details);
  }

  console.log("=== B) MOVE correct expected_version ===");
  const moveRid = `${ridBase}-move-ok`;
  const moveBody = {
    sku_id,
    from_location_id,
    to_location_id,
    qty: 1,
    expected_version_id_from: String(from.version_id),
    ...(toRow ? { expected_version_id_to: String(toRow.version_id) } : {}),
  };

  const moveRes = await withRetry("move ok", () => fetchJson("/api/inventory/move", { method: "POST", body: moveBody, rid: moveRid }));
  log(moveRes.status === 200 || moveRes.status === 201, "MOVE ok 200/201", { status: moveRes.status, json: moveRes.json });
  log(moveRes.json?.ok === true, "MOVE ok:true", moveRes.json);
  log(typeof moveRes.json?.move_id === "string" && moveRes.json.move_id.length > 0, "move_id exists", moveRes.json?.move_id);

  console.log("=== C) Effect check (balances) ===");
  const after = await withRetry("balances after", () => fetchJson("/api/inventory/balances", { rid: `${ridBase}-bal-after` }));
  log(after.status === 200, "GET balances after 200", after.status);
  log(after.json?.ok === true, "balances after ok:true", after.json);
  const afterItems = after.json?.items || [];
  const afterFrom = afterItems.find((r) => r.sku_id === sku_id && r.location_id === from_location_id);
  log(!!afterFrom, "afterFrom exists", afterFrom);

  const beforeFromOnHand = Number(from.on_hand_qty);
  const afterFromOnHand = Number(afterFrom.on_hand_qty);
  log(Number.isFinite(afterFromOnHand), "afterFrom on_hand_qty numeric", afterFrom.on_hand_qty);
  log(afterFromOnHand <= beforeFromOnHand - 1, "from.on_hand_qty decremented by at least 1", { beforeFromOnHand, afterFromOnHand });

  const afterTo = afterItems.find((r) => r.sku_id === sku_id && r.location_id === to_location_id);
  log(!!afterTo, "afterTo exists (row present for sku+to_location)", afterTo);

  console.table(results);
  console.log("🎯 PR-102-3 STRICT OPTIMISTIC LOCKING SMOKE v3 PASSED", { sku_id, from_location_id, to_location_id, ridBase });
})().catch((e) => console.error("❌ PR-102-3 SMOKE FAILED:", e));
