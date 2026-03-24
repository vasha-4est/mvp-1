import { NextResponse } from "next/server";

import { requireWritable } from "@/lib/flags/runtime";
import {
  commitShipmentPlanImport,
  parseShipmentPlanImportBody,
} from "@/lib/shipmentPlan/service";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireOwner } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function statusForCode(code: string): number {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "LOCK_CONFLICT") return 409;
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR" || code === "INVALID_PRODUCTS_SKU_SCHEMA") return 400;
  return 502;
}

export async function POST(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  if (!requestId) {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "x-request-id is required",
    });
  }

  const readonly = await requireWritable(request, auth.requestId);
  if (readonly) {
    return readonly;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(auth.requestId, 400, {
      ok: false,
      code: "VALIDATION_ERROR",
      error: "Invalid JSON body",
    });
  }

  const parsed = parseShipmentPlanImportBody(body);
  if (parsed.ok === false) {
    return json(auth.requestId, 400, {
      ok: false,
      code: parsed.code,
      error: parsed.error,
    });
  }

  const actorRoleId = auth.user.roles[0]?.trim().toLowerCase() || "owner";
  const result = await commitShipmentPlanImport({
    requestId,
    rows: parsed.rows,
    actorUserId: auth.user.user_id,
    actorRoleId,
  });

  if (result.ok === false) {
    return json(requestId, statusForCode(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(requestId, result.replayed ? 200 : 201, {
    ok: true,
    ...(result.replayed ? { replayed: true } : {}),
    import_batch_id: result.import_batch_id,
    stats: result.stats,
    staged_rows: result.staged_rows,
  });
}
