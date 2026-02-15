import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { callGas } from "../../../../lib/integrations/gasClient";

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

function authorizeRequest(request: Request) {
  const requiredKey = process.env.GAS_API_KEY;
  if (!requiredKey) {
    return true;
  }

  const provided = request.headers.get("x-gas-api-key");
  return provided === requiredKey;
}

export async function GET(request: Request, context: { params: { code: string } }) {
  if (!authorizeRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const code = String(context.params.code || "").trim();

  if (!isValidBatchCode(code)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid 'code' value (expected B-YYMMDD-NNN or batch_<slug>)",
      },
      { status: 400 }
    );
  }

  try {
    const gasResponse = await callGas("batch_fetch", { code }, randomUUID());
    if (!gasResponse.ok) {
      const message = normalizeErrorMessage(
        (gasResponse as unknown as { error?: unknown }).error,
        "GAS batch_fetch failed"
      );
      const lower = message.toLowerCase();
      const status =
        lower.includes("bad_request") || lower.includes("invalid")
          ? 400
          : lower.includes("unauthorized")
          ? 401
          : lower.includes("forbidden")
          ? 403
          : lower.includes("not_found")
          ? 404
          : 502;

      return NextResponse.json({ ok: false, error: message }, { status });
    }

    return NextResponse.json({ ok: true, data: gasResponse.data ?? null });
  } catch (caughtError) {
    const message = caughtError instanceof Error ? caughtError.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
