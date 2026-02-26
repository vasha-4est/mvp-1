import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

type GasEvent = {
  event_id?: unknown;
  created_at?: unknown;
  event_type?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  actor_user_id?: unknown;
  actor_role_id?: unknown;
  source?: unknown;
  request_id?: unknown;
  payload_json?: unknown;
};

type GasRecentResponse = {
  generated_at?: unknown;
  items?: unknown;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function normalizeLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(200, Math.floor(n));
}

function mapError(requestId: string, raw: unknown) {
  const parsed = parseErrorPayload(raw);
  if (parsed.code === "BAD_REQUEST" || parsed.code === "VALIDATION_ERROR") {
    return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: parsed.error });
  }

  if (parsed.code === "UNAUTHORIZED") {
    return json(requestId, 401, { ok: false, code: "UNAUTHORIZED", error: parsed.error });
  }

  if (parsed.code === "FORBIDDEN") {
    return json(requestId, 403, { ok: false, code: "FORBIDDEN", error: parsed.error });
  }

  return json(requestId, 502, { ok: false, code: parsed.code, error: parsed.error });
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;

  const requestId = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  if (!requestId) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "x-request-id is required",
    });
  }

  const { searchParams } = new URL(request.url);
  const limit = normalizeLimit(searchParams.get("limit"));

  const gas = await callGas<GasRecentResponse>("events.recent", { limit }, requestId);
  if (!gas.ok || !gas.data) return mapError(requestId, (gas as { error?: unknown }).error);

  const rawItems = Array.isArray(gas.data.items) ? (gas.data.items as GasEvent[]) : [];
  const items = rawItems.map((row) => ({
    event_id: str(row.event_id),
    created_at: str(row.created_at),
    event_type: str(row.event_type),
    entity_type: str(row.entity_type),
    entity_id: str(row.entity_id),
    actor_user_id: str(row.actor_user_id),
    actor_role_id: str(row.actor_role_id),
    source: str(row.source),
    request_id: str(row.request_id),
    payload_json: str(row.payload_json),
  }));

  return json(requestId, 200, {
    ok: true,
    generated_at: str(gas.data.generated_at) || new Date().toISOString(),
    items,
  });
}
