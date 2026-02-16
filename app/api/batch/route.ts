import { NextResponse } from "next/server";

import { callGas } from "../../../lib/integrations/gasClient";
import { withApiLog } from "../../../lib/obs/apiLog";
import { getOrCreateRequestId } from "../../../lib/obs/requestId";

type BatchListResult = {
  items?: unknown[];
  total?: number;
};

function normalizeErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function parseDateParamStrict(name: "fromDate" | "toDate", value: string | null) {
  if (value === null || value.trim() === "") {
    return { value: undefined as string | undefined };
  }

  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { error: `Invalid '${name}' date value` };
  }

  const [yearStr, monthStr, dayStr] = normalized.split("-");
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return { error: `Invalid '${name}' date value` };
  }

  return { value: normalized };
}

function authorizeRequest(request: Request) {
  const requiredKey = process.env.GAS_API_KEY;
  if (!requiredKey) {
    return true;
  }

  const provided = request.headers.get("x-gas-api-key");
  return provided === requiredKey;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = getOrCreateRequestId(request);
  const path = new URL(request.url).pathname;
  const actor = "service";

  const finalize = (response: NextResponse, code?: string) =>
    withApiLog(response, {
      startedAt,
      requestId,
      method: request.method,
      path,
      actor,
      ...(code ? { code } : {}),
    });

  if (!authorizeRequest(request)) {
    return finalize(NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }), "UNAUTHORIZED");
  }

  const { searchParams } = new URL(request.url);

  const fromDateResult = parseDateParamStrict("fromDate", searchParams.get("fromDate"));
  if (fromDateResult.error) {
    return finalize(NextResponse.json({ ok: false, error: fromDateResult.error }, { status: 400 }), "BAD_REQUEST");
  }

  const toDateResult = parseDateParamStrict("toDate", searchParams.get("toDate"));
  if (toDateResult.error) {
    return finalize(NextResponse.json({ ok: false, error: toDateResult.error }, { status: 400 }), "BAD_REQUEST");
  }

  if (fromDateResult.value && toDateResult.value && fromDateResult.value > toDateResult.value) {
    return finalize(
      NextResponse.json(
        { ok: false, error: "Invalid date range: fromDate must be <= toDate" },
        { status: 400 }
      ),
      "BAD_REQUEST"
    );
  }

  const payload: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (value.trim() !== "") {
      payload[key] = value;
    }
  });

  if (fromDateResult.value) {
    payload.fromDate = fromDateResult.value;
  }

  if (toDateResult.value) {
    payload.toDate = toDateResult.value;
  }

  try {
    const gasResponse = await callGas<BatchListResult>("batch_list", payload, requestId);
    if (!gasResponse.ok) {
      const message = normalizeErrorMessage(
        (gasResponse as unknown as { error?: unknown }).error,
        "GAS batch_list failed"
      );
      const lower = message.toLowerCase();
      const isLockOrTimeout =
        lower.includes("lock_conflict") ||
        lower.includes("lock timeout") ||
        lower.includes("timeout after") ||
        lower.includes("timed out");

      if (lower.includes("not_found")) {
        return finalize(NextResponse.json({ ok: true, data: { items: [], total: 0 } }), "NOT_FOUND");
      }

      const status =
        lower.includes("unauthorized") ||
        lower.includes("forbidden") ||
        lower.includes("auth mismatch")
          ? 401
          : lower.includes("bad_request") ||
            lower.includes("invalid") ||
            lower.includes("validation")
          ? 400
          : isLockOrTimeout
          ? 503
          : 502;

      return finalize(NextResponse.json({ ok: false, error: message }, { status }));
    }

    return finalize(NextResponse.json({ ok: true, data: gasResponse.data ?? { items: [], total: 0 } }));
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Unknown error";
    return finalize(NextResponse.json({ ok: false, error: message }, { status: 500 }));
  }
}
