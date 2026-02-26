import { NextResponse } from "next/server";

import { getControlTowerSnapshot } from "@/lib/control-tower/snapshot";
import { getDailySummary } from "@/lib/daily/readDailySummary";
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

  const checks = {
    control_tower: {
      ok: controlTower.ok === true,
      ...(controlTower.ok === false ? { code: controlTower.code, error: controlTower.error } : {}),
    },
    daily_summary: {
      ok: dailySummary.ok === true,
      ...(dailySummary.ok === false ? { code: dailySummary.code, error: dailySummary.error } : {}),
    },
  };

  const hasReferenceError =
    (controlTower.ok === false && hasReferenceErrorText(controlTower.error)) ||
    (dailySummary.ok === false && hasReferenceErrorText(dailySummary.error));

  if (hasReferenceError) {
    return json(auth.requestId, 502, {
      ok: false,
      code: "BAD_GATEWAY",
      error: "ReferenceError detected in GAS bridge",
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
