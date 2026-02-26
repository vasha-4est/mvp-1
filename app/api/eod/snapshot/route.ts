import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { getEodSnapshot, upsertEodSnapshot } from "@/lib/eod/snapshot";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function intOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export async function POST(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;

  let body: { date?: unknown; tz?: unknown; days_window?: unknown };
  try {
    body = (await request.json()) as { date?: unknown; tz?: unknown; days_window?: unknown };
  } catch {
    return json(auth.requestId, 400, { ok: false, code: "BAD_REQUEST", error: "Invalid JSON body" });
  }

  const tz = str(body.tz);
  if (!tz) {
    return json(auth.requestId, 400, { ok: false, code: "BAD_REQUEST", error: "Field 'tz' is required" });
  }

  const dateRaw = body.date === null ? null : str(body.date);
  const daysWindow = intOrUndefined(body.days_window);
  const result = await upsertEodSnapshot(auth.requestId, {
    date: dateRaw,
    tz,
    ...(daysWindow ? { days_window: daysWindow } : {}),
  });

  if (result.ok === false) {
    return json(auth.requestId, statusForErrorCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, result.data.replayed ? 200 : 201, result.data);
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;

  const { searchParams } = new URL(request.url);
  const date = str(searchParams.get("date"));
  const tz = str(searchParams.get("tz"));

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json(auth.requestId, 400, { ok: false, code: "BAD_REQUEST", error: "Query param 'date' is required" });
  }

  if (!tz) {
    return json(auth.requestId, 400, { ok: false, code: "BAD_REQUEST", error: "Query param 'tz' is required" });
  }

  const result = await getEodSnapshot(auth.requestId, { date, tz });

  if (result.ok === false) {
    return json(auth.requestId, statusForErrorCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, result.data);
}
