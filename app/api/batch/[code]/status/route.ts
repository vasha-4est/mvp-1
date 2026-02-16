import { NextResponse } from "next/server";

import { callGas } from "@/lib/integrations/gasClient";
import { parseErrorPayload, statusForErrorCode } from "@/lib/api/gasError";

type BatchStatus = "created" | "production" | "drying" | "ready" | "closed";

type PatchStatusRequest = {
  to_status: BatchStatus;
  idempotency_key: string;
};

type PatchStatusResult = {
  batch: Record<string, unknown>;
  replayed: boolean;
};

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

function withApiLog(body: Record<string, unknown>, status: number, requestId: string) {
  return NextResponse.json(body, {
    status,
    headers: {
      "x-request-id": requestId,
    },
  });
}

const BATCH_CODE_PATTERNS = [/^B-\d{6}-\d{3}$/, /^batch_[a-z0-9-]+$/];
const TARGET_STATUSES: BatchStatus[] = ["production", "drying", "ready", "closed"];

function isValidBatchCode(value: string): boolean {
  return BATCH_CODE_PATTERNS.some((pattern) => pattern.test(value));
}

function authorizeRequest() {
  return true;
}

function validateRequest(
  code: string,
  body: unknown
): { value?: PatchStatusRequest; error?: string; code?: string } {
  if (!isValidBatchCode(code)) {
    return {
      error: "Invalid 'code' value (expected B-YYMMDD-NNN or batch_<slug>)",
      code: "VALIDATION_ERROR",
    };
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Body must be a JSON object", code: "VALIDATION_ERROR" };
  }

  const toStatus = (body as { to_status?: unknown }).to_status;
  if (typeof toStatus !== "string" || !TARGET_STATUSES.includes(toStatus as BatchStatus)) {
    return {
      error: "Field 'to_status' must be one of: production, drying, ready, closed",
      code: "VALIDATION_ERROR",
    };
  }

  const idempotencyKey = (body as { idempotency_key?: unknown }).idempotency_key;
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    return {
      error: "Field 'idempotency_key' is required",
      code: "VALIDATION_ERROR",
    };
  }

  return {
    value: {
      to_status: toStatus as BatchStatus,
      idempotency_key: idempotencyKey.trim(),
    },
  };
}

export async function PATCH(request: Request, context: { params: { code: string } }) {
  const requestId = getOrCreateRequestId(request);

  if (!authorizeRequest()) {
    return withApiLog({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, 401, requestId);
  }

  const code = String(context.params.code || "").trim();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withApiLog({ ok: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" }, 400, requestId);
  }

  const validation = validateRequest(code, body);
  if (!validation.value) {
    return withApiLog(
      { ok: false, error: validation.error, code: validation.code || "VALIDATION_ERROR" },
      400,
      requestId
    );
  }

  try {
    const gasResponse = await callGas<PatchStatusResult>(
      "batch_status_patch",
      {
        code,
        to_status: validation.value.to_status,
        idempotency_key: validation.value.idempotency_key,
      },
      requestId
    );

    if (!gasResponse.ok || !gasResponse.data) {
      const parsed = parseErrorPayload((gasResponse as { error?: unknown }).error);
      const status = statusForErrorCode(parsed.code);
      return withApiLog(
        {
          ok: false,
          error: parsed.error,
          code: parsed.code,
          ...(parsed.details ? { details: parsed.details } : {}),
        },
        status,
        requestId
      );
    }

    return withApiLog(
      { ok: true, batch: gasResponse.data.batch, replayed: gasResponse.data.replayed },
      200,
      requestId
    );
  } catch {
    return withApiLog({ ok: false, error: "Bad gateway", code: "BAD_GATEWAY" }, 502, requestId);
  }
}
