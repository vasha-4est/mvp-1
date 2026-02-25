import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { requireWritable } from "@/lib/flags/runtime";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";

type Body = { sku_id?: unknown; location_id?: unknown; qty?: unknown; reason?: unknown; proof_ref?: unknown };

type ReleaseResp = { release_id?: unknown; operation_id?: unknown; reserved_qty?: unknown; available_qty?: unknown; version_id?: unknown; replayed?: unknown };

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }
function qtyNum(v: unknown): number | null {
  const parsed = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function mapError(requestId: string, raw: unknown) {
  const parsed = parseErrorPayload(raw);
  if (parsed.code === "FLAG_DISABLED") return json(requestId, 400, { ok: false, code: "FLAG_DISABLED" });
  if (parsed.code === "LOCK_CONFLICT") return json(requestId, 409, { ok: false, code: "LOCK_CONFLICT" });
  if (parsed.code === "INSUFFICIENT_RESERVED") return json(requestId, 409, { ok: false, code: "INSUFFICIENT_RESERVED" });
  if (parsed.code === "NOT_FOUND") return json(requestId, 404, { ok: false, code: "SKU_NOT_FOUND" });
  if (parsed.code === "BAD_REQUEST") return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: parsed.error });
  return json(requestId, 502, { ok: false, code: parsed.code, error: parsed.error });
}

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  const auth = requireRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;
  if (!requestId) return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "x-request-id is required" });

  const readonly = await requireWritable(request, auth.requestId);
  if (readonly) return readonly;

  let body: Body;
  try { body = (await request.json()) as Body; } catch { return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "Invalid JSON body" }); }

  const skuId = str(body.sku_id);
  const locationId = str(body.location_id);
  const reason = str(body.reason);
  const proofRef = str(body.proof_ref);
  const qty = qtyNum(body.qty);

  if (!skuId || !locationId || qty === null || qty <= 0) {
    return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "Invalid release payload" });
  }

  const gas = await callGas<ReleaseResp>("inventory.release", { sku_id: skuId, location_id: locationId, qty, reason, proof_ref: proofRef }, auth.requestId);
  if (!gas.ok || !gas.data) return mapError(auth.requestId, (gas as { error?: unknown }).error);

  return json(auth.requestId, 200, {
    ok: true,
    ...(gas.data.replayed === true ? { replayed: true } : {}),
    release_id: typeof gas.data.release_id === "string" ? gas.data.release_id : "",
    operation_id: typeof gas.data.operation_id === "string" ? gas.data.operation_id : "",
    sku_id: skuId,
    location_id: locationId,
    qty,
    reserved_qty: typeof gas.data.reserved_qty === "number" ? gas.data.reserved_qty : null,
    available_qty: typeof gas.data.available_qty === "number" ? gas.data.available_qty : null,
    version_id: typeof gas.data.version_id === "string" ? gas.data.version_id : "",
  });
}
