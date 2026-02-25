import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { requireWritable } from "@/lib/flags/runtime";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";

type PickingLineInput = {
  sku_id?: unknown;
  location_id?: unknown;
  qty?: unknown;
};

type Body = {
  warehouse_key?: unknown;
  lines?: unknown;
};

type CreateResponse = {
  replayed?: unknown;
  picking_list_id?: unknown;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function qtyNum(v: unknown): number | null {
  const parsed = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function mapError(requestId: string, raw: unknown) {
  const parsed = parseErrorPayload(raw);

  if (parsed.code === "FLAG_DISABLED") return json(requestId, 400, { ok: false, code: "FLAG_DISABLED" });
  if (parsed.code === "LOCK_CONFLICT") return json(requestId, 409, { ok: false, code: "LOCK_CONFLICT" });
  if (parsed.code === "INSUFFICIENT_AVAILABLE") return json(requestId, 409, { ok: false, code: "INSUFFICIENT_AVAILABLE" });
  if (parsed.code === "NOT_FOUND") return json(requestId, 404, { ok: false, code: "SKU_NOT_FOUND" });
  if (parsed.code === "BAD_REQUEST") {
    return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: parsed.error });
  }

  return json(requestId, 502, { ok: false, code: parsed.code, error: parsed.error });
}

function normalizeLines(linesRaw: unknown): Array<{ sku_id: string; location_id: string; qty: number }> | null {
  if (!Array.isArray(linesRaw) || linesRaw.length === 0) return null;

  const out: Array<{ sku_id: string; location_id: string; qty: number }> = [];
  for (const lineRaw of linesRaw) {
    if (typeof lineRaw !== "object" || lineRaw === null) return null;

    const line = lineRaw as PickingLineInput;
    const skuId = str(line.sku_id);
    const locationId = str(line.location_id);
    const qty = qtyNum(line.qty);

    if (!skuId || !locationId || qty === null || qty <= 0) {
      return null;
    }

    out.push({
      sku_id: skuId,
      location_id: locationId,
      qty,
    });
  }

  return out;
}

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  const auth = requireRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) return auth.response;

  if (!requestId) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "x-request-id is required",
    });
  }

  const readonly = await requireWritable(request, auth.requestId);
  if (readonly) return readonly;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Invalid JSON body",
    });
  }

  const warehouseKey = str(body.warehouse_key);
  const lines = normalizeLines(body.lines);

  if (!warehouseKey || !lines) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Invalid picking list payload",
    });
  }

  const gas = await callGas<CreateResponse>(
    "picking.lists.create",
    {
      warehouse_key: warehouseKey,
      lines,
    },
    auth.requestId
  );

  if (!gas.ok || !gas.data) {
    return mapError(auth.requestId, (gas as { error?: unknown }).error);
  }

  const pickingListId = typeof gas.data.picking_list_id === "string" ? gas.data.picking_list_id : "";

  return json(auth.requestId, gas.data.replayed === true ? 200 : 201, {
    ok: true,
    ...(gas.data.replayed === true ? { replayed: true } : {}),
    picking_list_id: pickingListId,
  });
}
