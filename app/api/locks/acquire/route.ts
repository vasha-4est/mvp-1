import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAuth } from "@/lib/server/guards";

type Body = { entity_type?: unknown; entity_id?: unknown; ttl_seconds?: unknown; reason?: unknown };
type AcquireResponse = {
  lock_key?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  expires_at?: unknown;
  ttl_seconds?: unknown;
  replayed?: unknown;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function mapError(requestId: string, error: unknown) {
  const parsed = parseErrorPayload(error);
  if (parsed.code === "VALIDATION_ERROR" || parsed.code === "BAD_REQUEST") {
    return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: parsed.error, ...(parsed.details ? { details: parsed.details } : {}) });
  }
  if (parsed.code === "LOCK_CONFLICT") {
    return json(requestId, 409, { ok: false, code: "LOCK_CONFLICT", error: parsed.error, ...(parsed.details ? { details: parsed.details } : {}) });
  }
  return json(requestId, 502, { ok: false, code: parsed.code, error: parsed.error, ...(parsed.details ? { details: parsed.details } : {}) });
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth.ok === false) return auth.response;

  const requestId = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  if (!requestId) return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "x-request-id is required" });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "Invalid JSON body" });
  }

  const entityType = str(body.entity_type);
  const entityId = str(body.entity_id);
  const ttlRaw = Number(body.ttl_seconds);
  const payload = {
    entity_type: entityType,
    entity_id: entityId,
    reason: str(body.reason),
    ...(Number.isFinite(ttlRaw) && ttlRaw > 0 ? { ttl_seconds: Math.floor(ttlRaw) } : {}),
  };

  const gas = await callGas<AcquireResponse>("locks.acquire", payload, requestId);
  if (!gas.ok || !gas.data) return mapError(requestId, (gas as { error?: unknown }).error);

  const replayed = gas.data.replayed === true;
  const status = replayed ? 200 : 201;
  return json(requestId, status, {
    ok: true,
    ...(replayed ? { replayed: true } : {}),
    lock_key: str(gas.data.lock_key),
    entity_type: str(gas.data.entity_type),
    entity_id: str(gas.data.entity_id),
    expires_at: str(gas.data.expires_at),
    ttl_seconds: Number(gas.data.ttl_seconds) || 30,
  });
}
