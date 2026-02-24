import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { requireWritable } from "@/lib/flags/runtime";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";

type Body = {
  sku_id?: unknown;
  from_location_id?: unknown;
  to_location_id?: unknown;
  qty?: unknown;
  reason?: unknown;
  proof_ref?: unknown;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function qtyNum(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function mapError(requestId: string, raw: unknown) {
  const parsed = parseErrorPayload(raw);
  if (parsed.code === "FLAG_DISABLED") return json(requestId, 503, { ok: false, code: "FLAG_DISABLED" });
  if (parsed.code === "LOCK_CONFLICT") return json(requestId, 409, { ok: false, code: "LOCK_CONFLICT" });
  if (parsed.code === "INSUFFICIENT_STOCK") return json(requestId, 409, { ok: false, code: "INSUFFICIENT_STOCK" });
  if (parsed.code === "NOT_FOUND") return json(requestId, 404, { ok: false, code: "SKU_NOT_FOUND" });
  if (parsed.code === "BAD_REQUEST") return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: parsed.error });
  return json(requestId, 502, { ok: false, code: parsed.code, error: parsed.error });
}

export async function POST(request: Request) {
  const incomingRequestId = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  const auth = requireRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;
  if (!incomingRequestId) return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "x-request-id is required" });

  const readonlyResponse = await requireWritable(request, auth.requestId);
  if (readonlyResponse) return readonlyResponse;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "Invalid JSON body" });
  }

  const skuId = str(body.sku_id);
  const fromLocationId = str(body.from_location_id);
  const toLocationId = str(body.to_location_id);
  const reason = str(body.reason);
  const proofRef = str(body.proof_ref);
  const qty = qtyNum(body.qty);

  if (!skuId || !fromLocationId || !toLocationId || fromLocationId === toLocationId || qty === null || qty <= 0) {
    return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "Invalid inventory move payload" });
  }

  const gas = await callGas<{ move_id?: unknown }>(
    "inventory.move.create",
    { sku_id: skuId, from_location_id: fromLocationId, to_location_id: toLocationId, qty, reason, proof_ref: proofRef },
    auth.requestId
  );

  if (!gas.ok || !gas.data) return mapError(auth.requestId, (gas as { error?: unknown }).error);

  return json(auth.requestId, 200, {
    ok: true,
    move_id: typeof gas.data.move_id === "string" ? gas.data.move_id : "",
    sku_id: skuId,
    from_location_id: fromLocationId,
    to_location_id: toLocationId,
    qty,
  });
}
