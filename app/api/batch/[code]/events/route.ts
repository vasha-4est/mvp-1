import { NextResponse } from "next/server";

import { parseErrorPayload, statusForErrorCode } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

const BATCH_CODE_PATTERNS = [/^B-\d{6}-\d{3}$/, /^batch_[a-z0-9-]+$/];

type BatchEventsResult = {
  batch_code?: string;
  events?: unknown[];
};

type EventsRouteContext = { params: { code: string } };

function getOrCreateRequestId(request: Request): string {
  const existing = request.headers.get("x-request-id");
  if (existing && existing.trim()) {
    return existing.trim();
  }

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function json(requestId: string, body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
    },
  });
}

function isValidBatchCode(value: string): boolean {
  return BATCH_CODE_PATTERNS.some((pattern) => pattern.test(value));
}

export async function GET(request: Request, context: EventsRouteContext) {
  const requestId = getOrCreateRequestId(request);
  const code = String(context.params.code || "").trim();

  if (!isValidBatchCode(code)) {
    return json(
      requestId,
      {
        ok: false,
        error: "Invalid 'code' value (expected B-YYMMDD-NNN or batch_<slug>)",
        code: "VALIDATION_ERROR",
      },
      400
    );
  }

  try {
    const gasResponse = await callGas<BatchEventsResult>("batch_events_list", { code }, requestId);

    if (!gasResponse.ok || !gasResponse.data) {
      const parsed = parseErrorPayload((gasResponse as { error?: unknown }).error);

      return json(
        requestId,
        {
          ok: false,
          error: parsed.error,
          code: parsed.code,
          ...(parsed.details ? { details: parsed.details } : {}),
        },
        statusForErrorCode(parsed.code)
      );
    }

    return json(
      requestId,
      {
        ok: true,
        data: {
          batch_code: String(gasResponse.data.batch_code || code),
          events: Array.isArray(gasResponse.data.events) ? gasResponse.data.events : [],
        },
      },
      200
    );
  } catch {
    return json(requestId, { ok: false, error: "Bad gateway", code: "BAD_GATEWAY" }, 502);
  }
}
