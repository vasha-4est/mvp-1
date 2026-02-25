import { NextResponse } from "next/server";

import { parseErrorPayload } from "@/lib/api/gasError";
import { requireWritable } from "@/lib/flags/runtime";
import { callGas } from "@/lib/integrations/gasClient";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

type ConfirmLineInput = {
  line_id?: unknown;
  picked_qty?: unknown;
  short_reason?: unknown;
  proof_ref?: unknown;
};

type ConfirmBody = {
  picking_list_id?: unknown;
  lines?: unknown;
};

type ConfirmResult = {
  line_id: string;
  planned_qty: number;
  picked_qty: number;
  short_qty: number;
  status: "done";
};

type GasConfirmResponse = {
  replayed?: unknown;
  picking_list_id?: unknown;
  results?: unknown[];
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

function normalizeLine(line: unknown): { line_id: string; picked_qty: number; short_reason: string | null; proof_ref: string | null } | null {
  if (typeof line !== "object" || line === null) return null;

  const input = line as ConfirmLineInput;
  const lineId = str(input.line_id);
  const pickedQty = num(input.picked_qty);
  const shortReasonRaw = input.short_reason;
  const shortReason = shortReasonRaw === null ? null : str(shortReasonRaw);
  const proofRefRaw = input.proof_ref;
  const proofRef = proofRefRaw === null ? null : str(proofRefRaw);

  if (!lineId || pickedQty === null || pickedQty < 0) return null;

  return {
    line_id: lineId,
    picked_qty: pickedQty,
    short_reason: shortReason && shortReason.length > 0 ? shortReason : null,
    proof_ref: proofRef && proofRef.length > 0 ? proofRef : null,
  };
}

function normalizeResults(raw: unknown): ConfirmResult[] {
  if (!Array.isArray(raw)) return [];

  const out: ConfirmResult[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const lineId = str(row.line_id);
    const plannedQty = num(row.planned_qty);
    const pickedQty = num(row.picked_qty);
    const shortQty = num(row.short_qty);

    if (!lineId || plannedQty === null || pickedQty === null || shortQty === null) continue;

    out.push({
      line_id: lineId,
      planned_qty: plannedQty,
      picked_qty: pickedQty,
      short_qty: shortQty,
      status: "done",
    });
  }

  return out;
}

function mapError(requestId: string, raw: unknown) {
  const parsed = parseErrorPayload(raw);

  if (parsed.code === "LOCK_CONFLICT") return json(requestId, 409, { ok: false, code: "LOCK_CONFLICT", error: parsed.error });
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

  const readonly = await requireWritable(request, auth.requestId);
  if (readonly) return readonly;

  let body: ConfirmBody;
  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Invalid JSON body",
    });
  }

  const pickingListId = str(body.picking_list_id);
  const linesRaw = Array.isArray(body.lines) ? body.lines : null;
  if (!pickingListId || !linesRaw || linesRaw.length === 0) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Invalid picking confirm payload",
    });
  }

  const lines = linesRaw.map((line) => normalizeLine(line));
  if (lines.some((line) => line === null)) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Invalid picking line payload",
    });
  }

  const gas = await callGas<GasConfirmResponse>(
    "picking.confirm",
    {
      picking_list_id: pickingListId,
      lines,
    },
    auth.requestId
  );

  if (!gas.ok || !gas.data) {
    return mapError(auth.requestId, (gas as { error?: unknown }).error);
  }

  return json(auth.requestId, gas.data.replayed === true ? 200 : 201, {
    ok: true,
    ...(gas.data.replayed === true ? { replayed: true } : {}),
    picking_list_id: str(gas.data.picking_list_id) || pickingListId,
    results: normalizeResults(gas.data.results),
  });
}
