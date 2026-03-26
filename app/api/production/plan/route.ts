import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { getProductionPlan } from "@/lib/productionPlan/getProductionPlan";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function GET(request: Request) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const result = await getProductionPlan(auth.requestId);

  if (result.ok === false) {
    return json(auth.requestId, statusForErrorCode(result.code), {
      ok: false,
      error: result.error,
      code: result.code,
      ...(result.details ? { details: result.details } : {}),
    });
  }

  return json(auth.requestId, 200, result.data);
}
