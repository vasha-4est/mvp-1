import { NextResponse } from "next/server";

import { statusForErrorCode } from "@/lib/api/gasError";
import { listIncidents, parseLimit } from "@/lib/incidents/service";
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

  const requestId = auth.requestId;

  try {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const result = await listIncidents(requestId, limit);

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
      items: result.items,
    });
  } catch {
    return json(requestId, 502, {
      ok: false,
      error: "Bad gateway",
      code: "BAD_GATEWAY",
    });
  }
}
