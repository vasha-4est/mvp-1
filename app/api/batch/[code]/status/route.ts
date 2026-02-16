import { NextResponse } from "next/server";

import { callGas } from "../../../../../lib/integrations/gasClient";

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

function parseErrorPayload(rawError: unknown): {
  error: string;
  code: string;
  details?: Record<string, unknown>;
} {
  if (typeof rawError === "object" && rawError !== null) {
    const obj = rawError as { code?: unknown; message?: unknown; details?: unknown; error?: unknown };
    const code = typeof obj.code === "string" ? obj.code : "BAD_GATEWAY";
    const message =
      typeof obj.message === "string"
        ? obj.message
        : typeof obj.error === "string"
        ? obj.error
        : "Bad gateway";
    const details =
      typeof obj.details === "object" && obj.details !== null && !Array.isArray(obj.details)
        ? (obj.details as Record<string, unknown>)
        : undefined;

    return { error: message, code, ...(details ? { details } : {}) };
  }

  const fallback = { error: "Bad gateway", code: "BAD_GATEWAY" };
  if (typeof rawError !== "string") {
    return fallback;
  }

  const firstLine = rawError.split("\n")[0].trim();
  const clean = firstLine.startsWith("Error:") ? firstLine.replace(/^Error:\s*/, "") : firstLine;

  const [primary, detailsPart] = clean.split(" | ");
  const match = primary.match(/^([A-Z_]+)\s*:\s*(.+)$/);
  if (!match) {
    return { error: clean || "Bad gateway", code: "BAD_GATEWAY" };
  }

  let details: Record<string, unknown> | undefined;
  if (detailsPart) {
    try {
      const parsed = JSON.parse(detailsPart);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        details = parsed as Record<string, unknown>;
      }
    } catch {
      details = undefined;
    }
  }

  return {
    code: match[1],
    error: match[2],
    ...(details ? { details } : {}),
  };
}

function statusForErrorCode(code: string): number {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "NOT_FOUND") return 404;
  if (code === "VALIDATION_ERROR" || code === "BAD_REQUEST") return 400;

  // Transition conflicts must stay at HTTP 409.
  if (
    code === "DRYING_NOT_FINISHED" ||
    code === "ILLEGAL_TRANSITION" ||
    code === "IDEMPOTENCY_KEY_REUSE"
  ) {
    return 409;
  }

  if (code === "LOCK_TIMEOUT" || code === "LOCK_CONFLICT") return 503;
  return 502;
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
      return withApiLog(
        {
          ok: false,
          error: parsed.error,
          code: parsed.code,
          ...(parsed.details ? { details: parsed.details } : {}),
        },
        statusForErrorCode(parsed.code),
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
