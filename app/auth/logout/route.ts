import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { auth0, isAuth0Configured } from "@/lib/auth0";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

type Auth0LogoutClient = {
  handleLogout?: (request: Request, options?: { returnTo?: string }) => Promise<Response>;
  middleware: (request: Request) => Promise<Response>;
};

function clearAppSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

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
  const returnTo = new URL(request.url).searchParams.get("returnTo") ?? "/";

  if (!isAuth0Configured()) {
    const fallback = NextResponse.redirect(new URL(returnTo, request.url));
    clearAppSessionCookie(fallback);
    return fallback;
  }

  try {
    const client = auth0 as unknown as Auth0LogoutClient;
    const response =
      typeof client.handleLogout === "function"
        ? await client.handleLogout(request, { returnTo })
        : await client.middleware(request);

    const nextResponse = new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
    clearAppSessionCookie(nextResponse);
    return nextResponse;
  } catch {
    return jsonError(request, 500, {
      ok: false,
      error: "Auth0 logout failed",
      code: "AUTH0_LOGOUT_FAILED",
    });
  }
}
