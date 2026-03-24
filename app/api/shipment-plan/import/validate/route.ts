import { NextResponse } from "next/server";

import {
  parseShipmentPlanImportBody,
  validateShipmentPlanImport,
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
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR" || code === "INVALID_PRODUCTS_SKU_SCHEMA") return 400;
  return 502;
}

export async function POST(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
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

  const result = await validateShipmentPlanImport({
    requestId: auth.requestId,
    rows: parsed.rows,
  });

  if (result.ok === false) {
    return json(auth.requestId, statusForCode(result.code), {
      ok: false,
      code: result.code,
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, {
    ok: true,
    import_batch_id: result.import_batch_id,
    valid: result.valid,
    stats: result.stats,
    normalized_rows: result.normalized_rows,
    errors: result.errors,
  });
}
