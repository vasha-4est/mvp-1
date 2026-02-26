export type ParsedGasError = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

export function parseErrorPayload(rawError: unknown): ParsedGasError {
  if (typeof rawError === "object" && rawError !== null) {
    const obj = rawError as { code?: unknown; message?: unknown; details?: unknown; error?: unknown };
    const code = typeof obj.code === "string" ? obj.code : "BAD_GATEWAY";
    const messageRaw =
      typeof obj.message === "string"
        ? obj.message
        : typeof obj.error === "string"
          ? obj.error
          : "Bad gateway";

    const [message, detailsFromMessage] = messageRaw.split(" | ");
    let details =
      typeof obj.details === "object" && obj.details !== null && !Array.isArray(obj.details)
        ? (obj.details as Record<string, unknown>)
        : undefined;

    if (!details && detailsFromMessage) {
      try {
        const parsed = JSON.parse(detailsFromMessage);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          details = parsed as Record<string, unknown>;
        }
      } catch {
        details = undefined;
      }
    }

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

export function statusForErrorCode(code: string): number {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "NOT_FOUND") return 404;
  if (code === "VALIDATION_ERROR" || code === "BAD_REQUEST") return 400;

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
