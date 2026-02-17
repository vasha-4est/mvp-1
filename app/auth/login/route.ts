import { NextResponse } from "next/server";

import { auth0, isAuth0Configured } from "@/lib/auth0";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

type Auth0LoginClient = {
  handleLogin?: (request: Request, options?: { returnTo?: string }) => Promise<Response>;
  middleware: (request: Request) => Promise<Response>;
};

function jsonError(request: Request, status: number, body: Record<string, unknown>) {
  const requestId = getOrCreateRequestId(request);
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function GET(request: Request) {
  if (!isAuth0Configured()) {
    return jsonError(request, 500, {
      ok: false,
      error: "Auth0 is not configured",
      code: "AUTH0_NOT_CONFIGURED",
    });
  }

  const returnTo = new URL(request.url).searchParams.get("returnTo") ?? "/";

  try {
    const client = auth0 as unknown as Auth0LoginClient;
    if (typeof client.handleLogin === "function") {
      return await client.handleLogin(request, { returnTo });
    }

    return await client.middleware(request);
  } catch {
    return jsonError(request, 500, {
      ok: false,
      error: "Auth0 login failed",
      code: "AUTH0_LOGIN_FAILED",
    });
  }
}
