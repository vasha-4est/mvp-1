import { NextResponse } from "next/server";

import { getControlTowerSnapshot } from "@/lib/control-tower/snapshot";
import { getDailySummary } from "@/lib/daily/readDailySummary";
import { upsertEodSnapshot } from "@/lib/eod/snapshot";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function hasReferenceErrorText(message: string): boolean {
  return message.toLowerCase().includes("is not defined");
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;

  const controlTower = await getControlTowerSnapshot(auth.requestId);
  const dailySummary = await getDailySummary(auth.requestId, { days: 1, tz: "Europe/Moscow" });

  const eod = await upsertEodSnapshot(auth.requestId, {
    date: "2026-02-26",
    tz: "Europe/Moscow",
    days_window: 1,
  });

  const checks = {
    control_tower: {
      ok: controlTower.ok === true,
      ...(controlTower.ok === false ? { code: controlTower.code, error: controlTower.error } : {}),
    },
    daily_summary: {
      ok: dailySummary.ok === true,
      ...(dailySummary.ok === false ? { code: dailySummary.code, error: dailySummary.error } : {}),
    },
    eod_snapshot: {
      ok: eod.ok === true,
      ...(eod.ok === false ? { code: eod.code, error: eod.error, details: eod.details } : {}),
    },
  };

  const hasReferenceError =
    (controlTower.ok === false && hasReferenceErrorText(controlTower.error)) ||
    (dailySummary.ok === false && hasReferenceErrorText(dailySummary.error)) ||
    (eod.ok === false && hasReferenceErrorText(eod.error));

  const eodCoresEmpty =
    eod.ok === false &&
    eod.details &&
    typeof eod.details === "object" &&
    Array.isArray((eod.details as { cores?: unknown }).cores) &&
    ((eod.details as { cores?: unknown[] }).cores || []).length === 0;

  if (hasReferenceError || eodCoresEmpty) {
    return json(auth.requestId, 502, {
      ok: false,
      code: "BAD_GATEWAY",
      error: hasReferenceError ? "ReferenceError detected in GAS bridge" : "EOD diagnostics missing cores[]",
      request_id: auth.requestId,
      checks,
    });
  }

  return json(auth.requestId, 200, {
    ok: true,
    request_id: auth.requestId,
    checks,
  });
}
