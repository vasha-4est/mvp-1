import { NextResponse } from "next/server";

import type { BatchEvent } from "@/lib/api/batch";
import { parseErrorPayload, statusForErrorCode } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { withApiLog } from "@/lib/obs/apiLog";
import { getOrCreateRequestId } from "@/lib/obs/requestId";

type BatchEventsListResult = {
  batch_code: string;
  events: BatchEvent[];
};

const BATCH_CODE_PATTERNS = [/^B-\d{6}-\d{3}$/, /^batch_[a-z0-9-]+$/];

function isValidBatchCode(value: string): boolean {
  return BATCH_CODE_PATTERNS.some((pattern) => pattern.test(value));
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

  try {
    const gasResponse = await callGas<BatchEventsListResult>("batch_events_list", { code }, requestId);

    if (!gasResponse.ok || !gasResponse.data) {
      const parsed = parseErrorPayload((gasResponse as { error?: unknown }).error);
      const status = statusForErrorCode(parsed.code);
      return finalize(
        NextResponse.json(
          {
            ok: false,
            error: parsed.error,
            code: parsed.code,
            ...(parsed.details ? { details: parsed.details } : {}),
          },
          { status }
        ),
        parsed.code
      );
    }

    return finalize(
      NextResponse.json(
        {
          ok: true,
          data: {
            batch_code: gasResponse.data.batch_code,
            events: gasResponse.data.events,
          },
        },
        { status: 200 }
      )
    );
  } catch {
    return finalize(
      NextResponse.json({ ok: false, error: "Bad gateway", code: "BAD_GATEWAY" }, { status: 502 }),
      "BAD_GATEWAY"
    );
  }
}
