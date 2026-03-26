import { NextResponse } from "next/server";

import { getLocalControlTowerFallback, withDevFastTimeout } from "@/lib/dev/localReadFallbacks";
import { statusForErrorCode } from "@/lib/api/gasError";
import { getControlTowerSnapshot } from "@/lib/control-tower/snapshot";
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

  const result = await withDevFastTimeout(getControlTowerSnapshot(auth.requestId), {
    ok: true as const,
    data: getLocalControlTowerFallback(),
  });

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
