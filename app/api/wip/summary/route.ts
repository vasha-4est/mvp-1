import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireRole } from "@/lib/server/guards";
import { getWipSummary } from "@/lib/wip/summary";

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
    const summary = await getWipSummary(auth.requestId);
    return json(auth.requestId, 200, summary);
  } catch {
    return json(auth.requestId, 500, {
      ok: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
}
