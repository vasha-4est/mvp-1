import { NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const session = getSessionFromRequest(request);

  if (!session) {
    return json(requestId, 401, { ok: false, code: "UNAUTHORIZED" });
  }

  return json(requestId, 200, {
    ok: true,
    user: {
      user_id: session.user_id,
      username: session.username,
      roles: session.roles,
    },
  });
}
