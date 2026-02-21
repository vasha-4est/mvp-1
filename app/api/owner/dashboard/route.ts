import { NextResponse } from "next/server";

import { requireRole } from "@/lib/server/guards";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";

type BatchStatus = "created" | "production" | "drying" | "ready" | "closed";

type BatchListItem = {
  code?: unknown;
  status?: unknown;
  dry_end_at?: unknown;
};

type BatchListResponse = {
  items?: BatchListItem[];
};

type BatchEvent = {
  at?: unknown;
  batch_code?: unknown;
  type?: unknown;
  actor?: unknown;
  details?: unknown;
};

type BatchEventsResponse = {
  events?: BatchEvent[];
};

const STATUS_VALUES: BatchStatus[] = ["created", "production", "drying", "ready", "closed"];

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function normalizeStatus(value: unknown): BatchStatus {
  if (typeof value === "string" && STATUS_VALUES.includes(value as BatchStatus)) {
    return value as BatchStatus;
  }

  return "created";
}

export async function GET(request: Request) {
  const auth = requireRole(request, ["OWNER"]);

  if (auth.ok === false) {
    return auth.response;
  }

  const requestId = auth.requestId;

  try {
    const batchesResponse = await callGas<BatchListResponse>("batch_list", {}, requestId);

    if (!batchesResponse.ok || !batchesResponse.data) {
      return json(requestId, 502, {
        ok: false,
        error: "Failed to fetch batches",
        code: "BAD_GATEWAY",
      });
    }

    const batches = Array.isArray(batchesResponse.data.items) ? batchesResponse.data.items : [];
    const counts: Record<BatchStatus, number> = {
      created: 0,
      production: 0,
      drying: 0,
      ready: 0,
      closed: 0,
    };

    const drying: Array<{
      code: string;
      dry_end_at: string;
      dry_remaining_ms: number;
      is_overdue: boolean;
    }> = [];

    const batchCodes: string[] = [];
    const now = Date.now();

    for (const batch of batches) {
      const status = normalizeStatus(batch.status);
      counts[status] += 1;

      const code = typeof batch.code === "string" ? batch.code.trim() : "";
      if (code) {
        batchCodes.push(code);
      }

      if (status !== "drying" || !code) {
        continue;
      }

      const dryEndAtIso = toIsoOrNull(batch.dry_end_at);
      if (!dryEndAtIso) {
        continue;
      }

      const dryEndAtMs = Date.parse(dryEndAtIso);
      const dryRemainingMs = Math.max(dryEndAtMs - now, 0);

      drying.push({
        code,
        dry_end_at: dryEndAtIso,
        dry_remaining_ms: dryRemainingMs,
        is_overdue: now > dryEndAtMs,
      });
    }

    drying.sort((left, right) => Date.parse(left.dry_end_at) - Date.parse(right.dry_end_at));

    const eventsResults = await Promise.allSettled(
      batchCodes.map((code) => callGas<BatchEventsResponse>("batch_events_list", { code }, requestId))
    );

    const allEvents: Array<{
      at: string;
      batch_code: string;
      type: string;
      actor: string;
      details: Record<string, unknown>;
    }> = [];

    for (const result of eventsResults) {
      if (result.status !== "fulfilled" || !result.value.ok || !result.value.data) {
        continue;
      }

      const items = Array.isArray(result.value.data.events) ? result.value.data.events : [];

      for (const raw of items) {
        const at = toIsoOrNull(raw.at);
        const batchCode = typeof raw.batch_code === "string" ? raw.batch_code.trim() : "";
        const type = typeof raw.type === "string" ? raw.type.trim() : "";
        const actor = typeof raw.actor === "string" ? raw.actor.trim() : "";

        if (!at || !batchCode || !type) {
          continue;
        }

        const details =
          typeof raw.details === "object" && raw.details !== null
            ? (raw.details as Record<string, unknown>)
            : {};

        allEvents.push({ at, batch_code: batchCode, type, actor, details });
      }
    }

    allEvents.sort((left, right) => Date.parse(right.at) - Date.parse(left.at));

    const dayAgoMs = now - 24 * 60 * 60 * 1000;
    const eventsLast24h = allEvents.filter((event) => Date.parse(event.at) >= dayAgoMs).length;
    const lastEventAt = allEvents.length > 0 ? allEvents[0].at : null;
    const dryingOverdue = drying.filter((item) => item.is_overdue).length;

    return json(requestId, 200, {
      ok: true,
      data: {
        counts: {
          ...counts,
          total_open: counts.created + counts.production + counts.drying + counts.ready,
        },
        drying,
        recent_events: allEvents.slice(0, 20),
        health: {
          wip_total_open: counts.created + counts.production + counts.drying + counts.ready,
          drying_overdue: dryingOverdue,
          events_last_24h: eventsLast24h,
          errors_last_24h: 0,
          last_event_at: lastEventAt,
        },
      },
    });
  } catch {
    return json(requestId, 502, {
      ok: false,
      error: "Bad gateway",
      code: "BAD_GATEWAY",
    });
  }
}
