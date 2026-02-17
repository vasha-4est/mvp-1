import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { auth0, isAuth0Configured } from "@/lib/auth0";
import { roleFromAuth0Session } from "@/lib/auth0Role";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { signSession } from "@/lib/session";

type Auth0CallbackClient = {
  handleCallback?: (request: Request) => Promise<Response>;
  middleware: (request: Request) => Promise<Response>;
};

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

function redirectTarget(role: "OWNER" | "COO" | "VIEWER", request: Request): string {
  const returnTo = new URL(request.url).searchParams.get("returnTo");
  if (typeof returnTo === "string" && returnTo.trim()) {
    return returnTo;
  }

  if (role === "OWNER") {
    return "/owner";
  }

  return "/";
}

export async function GET(request: Request) {
  if (!isAuth0Configured()) {
    return jsonError(request, 500, {
      ok: false,
      error: "Auth0 is not configured",
      code: "AUTH0_NOT_CONFIGURED",
    });
  }

  try {
    const client = auth0 as unknown as Auth0CallbackClient;
    const callbackResponse =
      typeof client.handleCallback === "function"
        ? await client.handleCallback(request)
        : await client.middleware(request);

    const session = (await auth0.getSession(request)) as Auth0SessionLike | null;
    const role = session ? roleFromAuth0Session(session) : null;

    if (!role) {
      return jsonError(request, 403, {
        ok: false,
        error: "Auth0 user is not mapped to an allowed role",
        code: "AUTH0_ROLE_NOT_MAPPED",
      });
    }

    const response = NextResponse.redirect(new URL(redirectTarget(role, request), request.url));
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: signSession({ role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 8,
    });

    const setCookieHeader = callbackResponse.headers.get("set-cookie");
    if (setCookieHeader) {
      response.headers.append("set-cookie", setCookieHeader);
    }

    return response;
  } catch {
    return jsonError(request, 500, {
      ok: false,
      error: "Auth0 callback failed",
      code: "AUTH0_CALLBACK_FAILED",
    });
  }
}
