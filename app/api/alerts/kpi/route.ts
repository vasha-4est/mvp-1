import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { getKpiAlerts } from "@/lib/alerts/readKpiAlerts";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;
const DEFAULT_TZ = "Europe/Moscow";
const DEFAULT_SLA_HOURS = 24;

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function parseDays(raw: string | null): { ok: true; value: number } | { ok: false; error: string; code: "BAD_REQUEST" } {
  if (!raw) return { ok: true, value: DEFAULT_DAYS };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      error: "Query param 'days' must be a positive integer",
    };
  }

  return { ok: true, value: Math.min(parsed, MAX_DAYS) };
}

function parseSlaHours(raw: string | null): { ok: true; value: number } | { ok: false; error: string; code: "BAD_REQUEST" } {
  if (!raw) return { ok: true, value: DEFAULT_SLA_HOURS };

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      error: "Query param 'sla_hours' must be a positive integer",
    };
  }

  return { ok: true, value: parsed };
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const daysResult = parseDays(searchParams.get("days"));
  if (daysResult.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      code: daysResult.code,
      error: daysResult.error,
    });
  }

  const slaResult = parseSlaHours(searchParams.get("sla_hours"));
  if (slaResult.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      code: slaResult.code,
      error: slaResult.error,
    });
  }

  const result = await getKpiAlerts(auth.requestId, {
    days: daysResult.value,
    tz: (searchParams.get("tz") || "").trim() || DEFAULT_TZ,
    sla_hours: slaResult.value,
  });

  if (result.ok === false) {
    return json(auth.requestId, statusForErrorCode(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, result.data);
}
