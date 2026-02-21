import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { listDryingBatches } from "@/lib/drying/listDryingBatches";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
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

  const requestId = auth.requestId;

  try {
    const result = await listDryingBatches(requestId);

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
      data: result.data,
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
