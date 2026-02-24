import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { getAssemblyCapacity } from "@/lib/inventory/getAssemblyCapacity";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const auth = requireRole(request, ["OWNER", "COO"]);

  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const result = await getAssemblyCapacity(auth.requestId);

    if (result.ok === false) {
      return json(auth.requestId, statusForErrorCode(result.code ?? "BAD_GATEWAY"), {
        ok: false,
        error: result.error,
        code: result.code,
        ...(result.details ? { details: result.details } : {}),
      });
    }

    return json(auth.requestId, 200, {
      ok: true,
      items: result.items,
    });
  } catch {
    return json(auth.requestId, 500, {
      ok: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
}
