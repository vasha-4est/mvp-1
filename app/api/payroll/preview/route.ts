import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { getPayrollPreview } from "@/lib/payroll/readPreview";
import { requireOwner } from "@/lib/server/guards";

const DEFAULT_DAYS = 14;
const MAX_DAYS = 60;
const DEFAULT_TZ = "Europe/Moscow";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function parseDays(raw: string | null): { ok: true; value: number } | { ok: false; code: "BAD_REQUEST"; error: string } {
  if (!raw) return { ok: true, value: DEFAULT_DAYS };
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return { ok: false, code: "BAD_REQUEST", error: "Query param 'days' must be a positive integer" };
  }
  return { ok: true, value: Math.min(parsed, MAX_DAYS) };
}

function parseIsoDate(raw: string | null, name: "from_date" | "to_date") {
  const value = (raw || "").trim();
  if (!value) {
    return { ok: true as const, value: "" };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false as const, code: "BAD_REQUEST" as const, error: `Query param '${name}' must be YYYY-MM-DD` };
  }
  return { ok: true as const, value };
}

export async function GET(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const fromDate = parseIsoDate(searchParams.get("from_date"), "from_date");
  if (fromDate.ok === false) {
    return json(auth.requestId, 400, { ok: false, code: fromDate.code, error: fromDate.error });
  }

  const toDate = parseIsoDate(searchParams.get("to_date"), "to_date");
  if (toDate.ok === false) {
    return json(auth.requestId, 400, { ok: false, code: toDate.code, error: toDate.error });
  }

  if ((fromDate.value && !toDate.value) || (!fromDate.value && toDate.value)) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "BAD_REQUEST",
      error: "Both 'from_date' and 'to_date' must be provided together",
    });
  }

  const daysResult = parseDays(searchParams.get("days"));
  if (daysResult.ok === false) {
    return json(auth.requestId, 400, { ok: false, code: daysResult.code, error: daysResult.error });
  }

  const payload = {
    days: fromDate.value && toDate.value ? undefined : daysResult.value,
    tz: (searchParams.get("tz") || "").trim() || DEFAULT_TZ,
    from_date: fromDate.value || undefined,
    to_date: toDate.value || undefined,
  };

  const result = await getPayrollPreview(auth.requestId, payload);

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
