import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { resolveSetBom } from "@/lib/bom/resolveSetBom";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

type BomRouteContext = {
  params: {
    set_sku: string;
  };
};

export async function GET(request: Request, context: BomRouteContext) {
  const requestId = getOrCreateRequestId(request);
  const setSku = String(context.params.set_sku || "").trim();

  if (!setSku) {
    return json(requestId, 400, {
      ok: false,
      error: "Invalid set_sku",
      code: "VALIDATION_ERROR",
    });
  }

  try {
    const result = await resolveSetBom(setSku, requestId);

    if (result.ok === false) {
      return json(requestId, statusForErrorCode(result.code), {
        ok: false,
        error: result.error,
        code: result.code,
        ...(result.details ? { details: result.details } : {}),
      });
    }

    return json(requestId, 200, {
      ok: true,
      set_sku: result.set_sku,
      components: result.components,
    });
  } catch {
    return json(requestId, 502, {
      ok: false,
      error: "Bad gateway",
      code: "BAD_GATEWAY",
    });
  }
}
