import { NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  try {
    const session = getSessionFromRequest(request);

    if (!session) {
      return json(requestId, 401, { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" });
    }

    return json(requestId, 200, {
      ok: true,
      user: {
        id: session.user_id,
        login: session.username,
        roles: session.roles,
      },
    });
  } catch {
    return json(requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
