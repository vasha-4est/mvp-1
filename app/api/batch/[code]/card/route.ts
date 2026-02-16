import { NextResponse } from "next/server";

import { parseErrorPayload, statusForErrorCode } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";

const BATCH_CODE_PATTERNS = [/^B-\d{6}-\d{3}$/, /^batch_[a-z0-9-]+$/];
const STATUS_VALUES = ["created", "production", "drying", "ready", "closed"] as const;

type BatchStatus = (typeof STATUS_VALUES)[number];
type BatchData = Record<string, unknown> & { status?: unknown; dry_end_at?: unknown };
type BatchEvent = {
  at?: unknown;
  type?: unknown;
  details?: unknown;
};
type BatchEventsResult = {
  batch_code?: string;
  events?: unknown[];
};

type CardRouteContext = { params: { code: string } };

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

function normalizeStatus(value: unknown): BatchStatus {
  if (typeof value === "string" && (STATUS_VALUES as readonly string[]).includes(value)) {
    return value as BatchStatus;
  }

  return "created";
}

function getDryEndAt(batch: BatchData, events: BatchEvent[]): string | null {
  const batchDryEndAt = typeof batch.dry_end_at === "string" ? batch.dry_end_at.trim() : "";
  if (batchDryEndAt) {
    return batchDryEndAt;
  }

  let latestDryEndAt: string | null = null;
  let latestAt = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (event.type !== "batch_status_changed") {
      continue;
    }

    const details =
      typeof event.details === "object" && event.details !== null
        ? (event.details as Record<string, unknown>)
        : null;

    const dryEndAt = typeof details?.dry_end_at === "string" ? details.dry_end_at.trim() : "";
    if (!dryEndAt) {
      continue;
    }

    const eventAtRaw = typeof event.at === "string" ? event.at.trim() : "";
    const eventAt = eventAtRaw ? Date.parse(eventAtRaw) : Number.NaN;
    const sortableAt = Number.isFinite(eventAt) ? eventAt : Number.POSITIVE_INFINITY;

    if (sortableAt >= latestAt) {
      latestAt = sortableAt;
      latestDryEndAt = dryEndAt;
    }
  }

  return latestDryEndAt;
}

function canTransitionTo(status: BatchStatus) {
  if (status === "created") {
    return { production: true, drying: false, ready: false, closed: false };
  }

  if (status === "production") {
    return { production: false, drying: true, ready: false, closed: false };
  }

  if (status === "drying") {
    return { production: false, drying: false, ready: true, closed: false };
  }

  if (status === "ready") {
    return { production: false, drying: false, ready: false, closed: true };
  }

  return { production: false, drying: false, ready: false, closed: false };
}

export async function GET(request: Request, context: CardRouteContext) {
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
    const [batchResponse, eventsResponse] = await Promise.all([
      callGas<BatchData>("batch_fetch", { code }, requestId),
      callGas<BatchEventsResult>("batch_events_list", { code }, requestId),
    ]);

    if (!batchResponse.ok || !batchResponse.data) {
      const parsed = parseErrorPayload((batchResponse as { error?: unknown }).error);
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

    let events: unknown[] = [];
    if (!eventsResponse.ok || !eventsResponse.data) {
      const parsed = parseErrorPayload((eventsResponse as { error?: unknown }).error);
      if (parsed.code !== "NOT_FOUND") {
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
    } else {
      events = Array.isArray(eventsResponse.data.events) ? eventsResponse.data.events : [];
    }

    const typedEvents = events as BatchEvent[];
    const status = normalizeStatus(batchResponse.data.status);
    const isDrying = status === "drying";
    const isClosed = status === "closed";
    const dryEndAt = getDryEndAt(batchResponse.data, typedEvents);
    const dryEndAtMs = dryEndAt ? Date.parse(dryEndAt) : Number.NaN;
    const hasDryEndAt = dryEndAt !== null && Number.isFinite(dryEndAtMs);

    const dryRemainingMs = isDrying && hasDryEndAt ? Math.max(0, dryEndAtMs - Date.now()) : null;
    const isDryingOverdue = isDrying && hasDryEndAt ? Date.now() > dryEndAtMs : null;

    return json(
      requestId,
      {
        ok: true,
        data: {
          batch: batchResponse.data,
          events,
          derived: {
            status,
            is_drying: isDrying,
            is_closed: isClosed,
            dry_end_at: dryEndAt,
            dry_remaining_ms: dryRemainingMs,
            is_drying_overdue: isDryingOverdue,
            can_transition_to: canTransitionTo(status),
          },
        },
      },
      200
    );
  } catch {
    return json(requestId, { ok: false, error: "Bad gateway", code: "BAD_GATEWAY" }, 502);
  }
}
