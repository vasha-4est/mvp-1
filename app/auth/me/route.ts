import { NextResponse } from "next/server";

import { auth0, isAuth0Configured } from "@/lib/auth0";
import { roleFromAuth0Session } from "@/lib/auth0Role";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

type Auth0SessionLike = {
  user?: {
    [key: string]: unknown;
  };
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

  const session = (await auth0.getSession(request)) as Auth0SessionLike | null;
  if (!session) {
    return jsonError(request, 401, {
      ok: false,
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  }

  return NextResponse.json(
    {
      ok: true,
      role: roleFromAuth0Session(session),
      user: session.user,
    },
    {
      status: 200,
      headers: {
        [REQUEST_ID_HEADER]: getOrCreateRequestId(request),
      },
    }
  );
}
