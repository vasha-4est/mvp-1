import { NextResponse } from "next/server";

import { callGas } from "../../../../lib/integrations/gasClient";
import { withApiLog } from "../../../../lib/obs/apiLog";
import { getOrCreateRequestId } from "../../../../lib/obs/requestId";

const BATCH_CODE_PATTERNS = [/^B-\d{6}-\d{3}$/, /^batch_[a-z0-9-]+$/];

function isValidBatchCode(value: string): boolean {
  return BATCH_CODE_PATTERNS.some((pattern) => pattern.test(value));
}

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

function extractCleanError(message: string): string {
  const firstLine = message.split("\n")[0].trim();

  const withoutErrorPrefix = firstLine.startsWith("Error:")
    ? firstLine.replace(/^Error:\s*/, "")
    : firstLine;

  const lower = withoutErrorPrefix.toLowerCase();
  if (lower.includes("not_found") || lower.includes("not found")) {
    return "Batch not found";
  }

  return withoutErrorPrefix;
}

function authorizeRequest(request: Request) {
  const requiredKey = process.env.GAS_API_KEY;
  if (!requiredKey) {
    return true;
  }

  const provided = request.headers.get("x-gas-api-key");
  return provided === requiredKey;
}

export async function GET(request: Request, context: { params: { code: string } }) {
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

  const code = String(context.params.code || "").trim();

  if (!isValidBatchCode(code)) {
    return finalize(
      NextResponse.json(
        {
          ok: false,
          error: "Invalid 'code' value (expected B-YYMMDD-NNN or batch_<slug>)",
        },
        { status: 400 }
      ),
      "BAD_REQUEST"
    );
  }

  try {
    const gasResponse = await callGas("batch_fetch", { code }, requestId);
    if (!gasResponse.ok) {
      const message = normalizeErrorMessage(
        (gasResponse as unknown as { error?: unknown }).error,
        "GAS batch_fetch failed"
      );
      const lower = message.toLowerCase();
      const isLockOrTimeout =
        lower.includes("lock_conflict") ||
        lower.includes("lock timeout") ||
        lower.includes("timeout after") ||
        lower.includes("timed out");

      if (lower.includes("not_found")) {
        const clean = extractCleanError(message);
        return finalize(NextResponse.json({ ok: false, error: clean }, { status: 404 }), "NOT_FOUND");
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

    return finalize(NextResponse.json({ ok: true, data: gasResponse.data ?? null }));
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Unknown error";
    return finalize(NextResponse.json({ ok: false, error: message }, { status: 500 }));
  }
}
