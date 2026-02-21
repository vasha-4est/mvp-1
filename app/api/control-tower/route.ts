import { NextResponse } from "next/server";

import { getControlTowerSnapshot } from "@/lib/control-tower/snapshot";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function GET(request: Request) {
  const auth = requireRole(request, ["OWNER", "COO"]);

  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const snapshot = await getControlTowerSnapshot({ requestId: auth.requestId });

    return json(auth.requestId, 200, snapshot);
  } catch {
    return json(auth.requestId, 502, {
      ok: false,
      error: "Bad gateway",
      code: "BAD_GATEWAY",
    });
  }
}
