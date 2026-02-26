import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAuth } from "@/lib/server/guards";

type LockItem = {
  lock_key?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  held_by_user_id?: unknown;
  held_by_role_id?: unknown;
  acquired_at?: unknown;
  expires_at?: unknown;
  status?: unknown;
};

type ListResponse = { generated_at?: unknown; items?: unknown };

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toItem(raw: LockItem): Record<string, string> {
  return {
    lock_key: str(raw.lock_key),
    entity_type: str(raw.entity_type),
    entity_id: str(raw.entity_id),
    held_by_user_id: str(raw.held_by_user_id),
    held_by_role_id: str(raw.held_by_role_id),
    acquired_at: str(raw.acquired_at),
    expires_at: str(raw.expires_at),
    status: str(raw.status),
  };
}

function mapError(requestId: string, error: unknown) {
  const parsed = parseErrorPayload(error);
  if (parsed.code === "UNAUTHORIZED") return json(requestId, 401, { ok: false, code: parsed.code, error: parsed.error });
  return json(requestId, 502, { ok: false, code: parsed.code, error: parsed.error, ...(parsed.details ? { details: parsed.details } : {}) });
}

export async function GET(request: Request) {
  const auth = requireAuth(request);
  if (auth.ok === false) return auth.response;

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 50;

  const gas = await callGas<ListResponse>("locks.list", { limit }, auth.requestId);
  if (!gas.ok || !gas.data) return mapError(auth.requestId, (gas as { error?: unknown }).error);

  const itemsRaw = Array.isArray(gas.data.items) ? (gas.data.items as LockItem[]) : [];
  return json(auth.requestId, 200, {
    ok: true,
    generated_at: str(gas.data.generated_at),
    items: itemsRaw.map((item) => toItem(item)),
  });
}
