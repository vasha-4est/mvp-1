import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, isAllowedRole } from "@/lib/auth";
import { getAuth0Client, isAuth0Configured } from "@/lib/auth0";
import { signSession } from "@/lib/session";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

type Auth0UserClaims = {
  ["https://mvp-1/role"]?: unknown;
  app_metadata?: {
    role?: unknown;
  };
  role?: unknown;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function roleFromClaims(user: Auth0UserClaims | undefined): "OWNER" | "COO" | "VIEWER" {
  const raw =
    user?.["https://mvp-1/role"] ??
    user?.app_metadata?.role ??
    user?.role;

  const normalized = typeof raw === "string" ? raw.trim().toUpperCase() : "";

  if (!isAllowedRole(normalized)) {
    return "VIEWER";
  }

  return normalized;
}

function redirectTarget(role: "OWNER" | "COO" | "VIEWER") {
  return role === "OWNER" ? "/owner" : "/batches";
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
    await auth0.handleCallback(request);

    const session = await auth0.getSession(request);
    const role = roleFromClaims(session?.user as Auth0UserClaims | undefined);

    const url = new URL(request.url);
    const response = NextResponse.redirect(new URL(redirectTarget(role), `${url.protocol}//${url.host}`));

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: signSession({ role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch {
    return json(requestId, 500, {
      ok: false,
      error: "Failed to complete Auth0 login",
      code: "AUTH0_CALLBACK_FAILED",
    });
  }
}
