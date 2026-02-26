import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { getThroughputShiftsKpi } from "@/lib/kpi/readThroughputShifts";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;
const DEFAULT_TZ = "Europe/Moscow";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function parseDays(raw: string | null): { ok: true; value: number } | { ok: false; error: string; code: "BAD_REQUEST" } {
  if (!raw) return { ok: true, value: DEFAULT_DAYS };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false, code: "BAD_REQUEST", error: "Query param 'days' must be a positive integer" };
  }
  return { ok: true, value: Math.min(parsed, MAX_DAYS) };
}

function parseTimezone(raw: string | null): string {
  const tz = (raw || "").trim();
  return tz || DEFAULT_TZ;
}

function parseShiftDefinitions(searchParams: URLSearchParams) {
  const pairs = [
    ["shift_1", "Shift 1", searchParams.get("shift_1_start"), searchParams.get("shift_1_end")],
    ["shift_2", "Shift 2", searchParams.get("shift_2_start"), searchParams.get("shift_2_end")],
    ["shift_3", "Shift 3", searchParams.get("shift_3_start"), searchParams.get("shift_3_end")],
  ] as const;

  if (!pairs.some(([, , start, end]) => start || end)) {
    return undefined;
  }

  return pairs.map(([key, title, start, end]) => ({
    key,
    title,
    start: (start || "").trim(),
    end: (end || "").trim(),
  }));
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const daysResult = parseDays(searchParams.get("days"));
  if (daysResult.ok === false) {
    return json(auth.requestId, 400, { ok: false, code: daysResult.code, error: daysResult.error });
  }

  const result = await getThroughputShiftsKpi(auth.requestId, {
    days: daysResult.value,
    tz: parseTimezone(searchParams.get("tz")),
    shifts: parseShiftDefinitions(searchParams),
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
