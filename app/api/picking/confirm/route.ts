import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { confirmLocalPickingLine, shouldUseLocalPickingFallback } from "@/lib/dev/pickingLocal";
import { requireWritable } from "@/lib/flags/runtime";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

type ConfirmBody = {
  picking_list_id?: unknown;
  line_id?: unknown;
  qty_done?: unknown;
  short_reason?: unknown;
  proof_ref?: unknown;
};

type GasConfirmResponse = {
  replayed?: unknown;
  picking_list_id?: unknown;
  line_id?: unknown;
  sku_id?: unknown;
  planned_qty?: unknown;
  picked_qty?: unknown;
  task_status?: unknown;
  short_reason?: unknown;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function intNum(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) return null;
  return parsed;
}

function mapError(requestId: string, raw: unknown) {
  const parsed = parseErrorPayload(raw);

  if (parsed.code === "LOCK_CONFLICT") return json(requestId, 409, { ok: false, code: "LOCK_CONFLICT", error: parsed.error });
  if (parsed.code === "NOT_FOUND") return json(requestId, 404, { ok: false, code: "NOT_FOUND", error: parsed.error });
  if (parsed.code === "FLAG_DISABLED") return json(requestId, 400, { ok: false, code: "FLAG_DISABLED", error: parsed.error });
  if (parsed.code === "UNAUTHORIZED") return json(requestId, 401, { ok: false, code: "UNAUTHORIZED", error: parsed.error });
  if (parsed.code === "FORBIDDEN") return json(requestId, 403, { ok: false, code: "FORBIDDEN", error: parsed.error });
  if (parsed.code === "BAD_REQUEST" || parsed.code === "VALIDATION_ERROR") {
    return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: parsed.error });
  }

  return json(requestId, 502, { ok: false, code: "BAD_GATEWAY", error: parsed.error });
}

export async function POST(request: Request) {
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

  const readonly = await requireWritable(request, requestId);
  if (readonly) return readonly;

  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return json(requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Invalid JSON body",
    });
  }

  const pickingListId = str(body.picking_list_id);
  const lineId = str(body.line_id);
  const qtyDone = intNum(body.qty_done);
  const shortReason = body.short_reason === null || body.short_reason === undefined ? null : str(body.short_reason);
  const proofRef = body.proof_ref === null || body.proof_ref === undefined ? null : str(body.proof_ref);

  if (!pickingListId || !lineId || qtyDone === null) {
    return json(requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "picking_list_id, line_id and qty_done are required",
    });
  }

  const gas = await callGas<GasConfirmResponse>(
    "picking.confirm",
    {
      picking_list_id: pickingListId,
      line_id: lineId,
      qty_done: qtyDone,
      short_reason: shortReason,
      proof_ref: proofRef,
    },
    requestId
  );

  if (!gas.ok || !gas.data) {
    if (shouldUseLocalPickingFallback()) {
      try {
        const fallback = await confirmLocalPickingLine({
          picking_list_id: pickingListId,
          line_id: lineId,
          qty_done: qtyDone,
        });
        return json(requestId, 201, {
          ok: true,
          picking_list_id: fallback.picking_list_id,
          line_id: fallback.line_id,
          sku_id: fallback.sku_id,
          planned_qty: fallback.planned_qty,
          picked_qty: fallback.picked_qty,
          task_status: fallback.task_status,
          short_reason: fallback.short_reason,
          fallback: "local",
        });
      } catch {
        return json(requestId, 404, { ok: false, code: "NOT_FOUND", error: "Picking line not found" });
      }
    }

    return mapError(requestId, (gas as { error?: unknown }).error);
  }

  return json(requestId, gas.data.replayed === true ? 200 : 201, {
    ok: true,
    ...(gas.data.replayed === true ? { replayed: true } : {}),
    picking_list_id: str(gas.data.picking_list_id) || pickingListId,
    line_id: str(gas.data.line_id) || lineId,
    sku_id: str(gas.data.sku_id),
    planned_qty: intNum(gas.data.planned_qty) ?? 0,
    picked_qty: intNum(gas.data.picked_qty) ?? qtyDone,
    task_status: str(gas.data.task_status),
    short_reason: gas.data.short_reason === null ? null : str(gas.data.short_reason) || null,
  });
}
