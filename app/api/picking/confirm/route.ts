import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { requireWritable } from "@/lib/flags/runtime";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

type ConfirmLineInput = {
  line_id?: unknown;
  sku_id?: unknown;
  warehouse_key?: unknown;
  planned_qty?: unknown;
  picked_qty?: unknown;
  short_qty?: unknown;
  short_reason?: unknown;
  blocked_reason?: unknown;
  proof_ref?: unknown;
};

type ConfirmBody = {
  picking_list_id?: unknown;
  lines?: unknown;
  notes?: unknown;
};

type GasConfirmResponse = {
  replayed?: unknown;
  picking_list_id?: unknown;
  confirmed_lines?: unknown;
  total_picked_qty?: unknown;
  total_short_qty?: unknown;
};

const ALLOWED_SHORT_REASONS = new Set(["OUT_OF_STOCK", "DAMAGED", "NOT_FOUND", "OTHER"]);

type NormalizedLine = {
  line_id: string;
  sku_id: string;
  warehouse_key: string;
  planned_qty: number | null;
  picked_qty: number;
  short_qty: number | null;
  short_reason: string | null;
  blocked_reason: string | null;
  proof_ref: string | null;
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

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLine(raw: unknown): { ok: true; line: NormalizedLine } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "line must be an object" };
  }

  const line = raw as ConfirmLineInput;
  const lineId = str(line.line_id);
  const skuId = str(line.sku_id);
  const warehouseKey = str(line.warehouse_key);
  const plannedQty = line.planned_qty === undefined ? null : num(line.planned_qty);
  const pickedQty = num(line.picked_qty);
  const shortQty = line.short_qty === undefined ? null : num(line.short_qty);
  const shortReason = line.short_reason === undefined || line.short_reason === null ? null : str(line.short_reason);
  const blockedReason = line.blocked_reason === undefined || line.blocked_reason === null ? null : str(line.blocked_reason);
  const proofRef = line.proof_ref === undefined || line.proof_ref === null ? null : str(line.proof_ref);

  if (!lineId) return { ok: false, error: "line_id is required" };
  if (!skuId) return { ok: false, error: "sku_id is required" };
  if (pickedQty === null || !Number.isInteger(pickedQty) || pickedQty < 0) {
    return { ok: false, error: "picked_qty must be an integer >= 0" };
  }

  if (plannedQty !== null && (!Number.isInteger(plannedQty) || plannedQty < 0)) {
    return { ok: false, error: "planned_qty must be an integer >= 0" };
  }

  if (shortQty !== null && (!Number.isInteger(shortQty) || shortQty < 0)) {
    return { ok: false, error: "short_qty must be an integer >= 0" };
  }

  if (shortQty !== null && shortQty > 0) {
    if (!shortReason || !ALLOWED_SHORT_REASONS.has(shortReason)) {
      return { ok: false, error: "short_reason must be one of OUT_OF_STOCK|DAMAGED|NOT_FOUND|OTHER when short_qty > 0" };
    }
  }

  return {
    ok: true,
    line: {
      line_id: lineId,
      sku_id: skuId,
      warehouse_key: warehouseKey,
      planned_qty: plannedQty,
      picked_qty: pickedQty,
      short_qty: shortQty,
      short_reason: shortReason,
      blocked_reason: blockedReason && blockedReason.length > 0 ? blockedReason : null,
      proof_ref: proofRef && proofRef.length > 0 ? proofRef : null,
    },
  };
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
  const linesRaw = Array.isArray(body.lines) ? body.lines : null;
  const notes = str(body.notes);

  if (!pickingListId || !linesRaw || linesRaw.length === 0) {
    return json(requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Invalid picking confirm payload",
    });
  }

  const lines: NormalizedLine[] = [];
  for (const rawLine of linesRaw) {
    const normalized = normalizeLine(rawLine);
    if (normalized.ok === false) {
      return json(requestId, 400, {
        ok: false,
        code: "VALIDATION_ERROR",
        error: normalized.error,
      });
    }
    lines.push(normalized.line);
  }

  const gas = await callGas<GasConfirmResponse>(
    "picking.confirm",
    {
      picking_list_id: pickingListId,
      lines,
      notes,
    },
    requestId
  );

  if (!gas.ok || !gas.data) {
    return mapError(requestId, (gas as { error?: unknown }).error);
  }

  return json(requestId, gas.data.replayed === true ? 200 : 201, {
    ok: true,
    replayed: gas.data.replayed === true,
    picking_list_id: str(gas.data.picking_list_id) || pickingListId,
    confirmed_lines: num(gas.data.confirmed_lines) ?? 0,
    total_picked_qty: num(gas.data.total_picked_qty) ?? 0,
    total_short_qty: num(gas.data.total_short_qty) ?? 0,
  });
}
