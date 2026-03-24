import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { getShipmentsReadiness } from "@/lib/shipments/readiness";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function statusForShipmentsCode(code: string): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR") return 400;
  if (code === "SHEET_MISSING") return 500;
  return 502;
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const result = await getShipmentsReadiness(auth.requestId);

  if (result.ok === false) {
    return json(auth.requestId, statusForShipmentsCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, {
    ok: true,
    generated_at: result.generated_at,
    import_batch_id: result.import_batch_id,
    shipments: result.shipments,
  });
}
