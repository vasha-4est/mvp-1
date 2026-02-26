import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { getDailySummary } from "@/lib/daily/readDailySummary";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

const DEFAULT_DAYS = 2;
const MAX_DAYS = 7;

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function parseDays(raw: string | null): { ok: true; value: number } | { ok: false; error: string; code: string } {
  if (!raw) {
    return { ok: true, value: DEFAULT_DAYS };
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      error: "Query param 'days' must be a positive integer",
    };
  }

  return {
    ok: true,
    value: Math.min(value, MAX_DAYS),
  };
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const parsedDays = parseDays(searchParams.get("days"));

  if (parsedDays.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      code: parsedDays.code,
      error: parsedDays.error,
    });
  }

  const result = await getDailySummary(auth.requestId, {
    days: parsedDays.value,
    tz: "UTC",
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
