import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireOwner } from "@/lib/server/guards";
import { previewShipmentPlan } from "@/lib/shipmentPlan/service";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function isIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parseDays(raw: string | null): { ok: true; days: number } | { ok: false; error: string } {
  if (!raw) return { ok: true, days: 14 };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { ok: false, error: "Query param 'days' must be a positive integer" };
  }
  return { ok: true, days: parsed };
}

function statusForCode(code: string): number {
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR") return 400;
  if (code === "FORBIDDEN") return 403;
  return 502;
}

export async function GET(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  const url = new URL(request.url);
  const daysResult = parseDays(url.searchParams.get("days"));
  if (daysResult.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "BAD_REQUEST",
      error: daysResult.error,
      details: { fields: [{ field: "days", message: daysResult.error }] },
      request_id: auth.requestId,
    });
  }

  const tz = url.searchParams.get("tz")?.trim() || "Europe/Moscow";
  if (!isIanaTimezone(tz)) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "BAD_REQUEST",
      error: "Query param 'tz' must be a valid IANA timezone",
      details: { fields: [{ field: "tz", message: "Query param 'tz' must be a valid IANA timezone" }] },
      request_id: auth.requestId,
    });
  }

  const result = await previewShipmentPlan(auth.requestId, { days: daysResult.days, tz });
  if (result.ok === false) {
    return json(auth.requestId, statusForCode(result.code), {
      ok: false,
      code: result.code === "FORBIDDEN" ? "FORBIDDEN" : result.code === "BAD_REQUEST" ? "BAD_REQUEST" : "BAD_GATEWAY",
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
      request_id: auth.requestId,
    });
  }

  return json(auth.requestId, 200, {
    ...result.data,
    request_id: auth.requestId,
  });
}
