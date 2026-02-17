import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { getAuth0Client, isAuth0Configured } from "@/lib/auth0";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (!isAuth0Configured()) {
    return json(requestId, 500, {
      ok: false,
      error: "Auth0 is not configured",
      code: "AUTH0_NOT_CONFIGURED",
    });
  }

  try {
    const auth0 = getAuth0Client();
    return await auth0.handleLogin(request);
  } catch {
    return json(requestId, 500, {
      ok: false,
      error: "Failed to start Auth0 login",
      code: "AUTH0_LOGIN_FAILED",
    });
  }
}
