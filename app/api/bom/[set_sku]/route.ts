import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { getBomForSet } from "@/lib/bom/getBomForSet";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { requireAnyRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request, context: { params: { set_sku: string } }) {
  const auth = requireAnyRole(request, ["OWNER", "COO"]);
  if (auth.ok === false) {
    return auth.response;
  }

  const requestId = auth.requestId;

  try {
    const result = await getBomForSet(requestId, context.params.set_sku);

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
    const requestIdForError = requestId || getOrCreateRequestId(request);

    return json(requestIdForError, 502, {
      ok: false,
      error: "Bad gateway",
      code: "BAD_GATEWAY",
    });
  }
}
