import { NextResponse } from "next/server";

import { parseErrorPayload, statusForErrorCode } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { withApiLog } from "@/lib/obs/apiLog";
import { getOrCreateRequestId } from "@/lib/obs/requestId";

type BatchEvent = {
  event_id?: string;
  batch_code?: string;
  type?: string;
  actor?: string;
  at?: string;
  payload?: string;
};

type BatchEventsResult = {
  events?: BatchEvent[];
};

const BATCH_CODE_PATTERNS = [/^B-\d{6}-\d{3}$/, /^batch_[a-z0-9-]+$/];

function isValidBatchCode(value: string): boolean {
  return BATCH_CODE_PATTERNS.some((pattern) => pattern.test(value));
}

function authorizeRequest() {
  return true;
}

export async function GET(request: Request, context: { params: { code: string } }) {
  const startedAt = Date.now();
  const requestId = getOrCreateRequestId(request);
  const path = new URL(request.url).pathname;

  const finalize = (response: NextResponse, code?: string) =>
    withApiLog(response, {
      startedAt,
      requestId,
      method: request.method,
      path,
      actor: "service",
      ...(code ? { code } : {}),
    });

  if (!authorizeRequest()) {
    return finalize(NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 }));
  }

  const code = String(context.params.code || "").trim();
  if (!isValidBatchCode(code)) {
    return finalize(
      NextResponse.json(
        {
          ok: false,
          error: "Invalid 'code' value (expected B-YYMMDD-NNN or batch_<slug>)",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      ),
      "VALIDATION_ERROR"
    );
  }

  const gasResponse = await callGas<BatchEventsResult>("batch_events_list", { code }, requestId);
  if (!gasResponse.ok) {
    const parsed = parseErrorPayload((gasResponse as { error?: unknown }).error);
    return finalize(
      NextResponse.json(
        {
          ok: false,
          error: parsed.error,
          code: parsed.code,
          ...(parsed.details ? { details: parsed.details } : {}),
        },
        { status: statusForErrorCode(parsed.code) }
      ),
      parsed.code
    );
  }

  const events = Array.isArray(gasResponse.data?.events) ? gasResponse.data.events : [];
  return finalize(NextResponse.json({ ok: true, events }, { status: 200 }));
}
