import { NextResponse } from "next/server";
import { handleAuth, handleCallback, handleLogin, handleLogout } from "@auth0/nextjs-auth0";

import { SESSION_COOKIE_NAME, isAllowedRole } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { signSession } from "@/lib/session";

const AUTH0_ENV_KEYS = [
  "AUTH0_SECRET",
  "AUTH0_BASE_URL",
  "AUTH0_ISSUER_BASE_URL",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
] as const;

type Auth0Claims = {
  ["https://mvp-1/role"]?: unknown;
  role?: unknown;
};

function isAuth0Configured() {
  return AUTH0_ENV_KEYS.every((key) => typeof process.env[key] === "string" && process.env[key]!.trim().length > 0);
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

function roleFromClaims(user: Auth0Claims | undefined): "OWNER" | "COO" | "VIEWER" {
  const claimRole = user?.["https://mvp-1/role"] ?? user?.role;
  const normalized = typeof claimRole === "string" ? claimRole.trim().toUpperCase() : "";

  if (!isAllowedRole(normalized)) {
    return "VIEWER";
  }

  return normalized;
}

function withAppSessionCookie(response: Response, role: "OWNER" | "COO" | "VIEWER") {
  const nextResponse = NextResponse.from(response);

  nextResponse.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: signSession({ role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return nextResponse;
}

const authHandler = handleAuth({
  login: async (request: Request) => {
    const returnTo = new URL(request.url).searchParams.get("returnTo") ?? "/";
    return handleLogin(request, { returnTo });
  },

  logout: async (request: Request) => {
    const returnTo = new URL(request.url).searchParams.get("returnTo") ?? "/";
    const response = await handleLogout(request, { returnTo });
    const nextResponse = NextResponse.from(response);

    nextResponse.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });

    return nextResponse;
  },

  callback: async (request: Request) => {
    let derivedRole: "OWNER" | "COO" | "VIEWER" = "VIEWER";

    const response = await handleCallback(request, {
      afterCallback: async (_request, session) => {
        derivedRole = roleFromClaims(session?.user as Auth0Claims | undefined);
        return session;
      },
    });

    return withAppSessionCookie(response, derivedRole);
  },
});

export const GET = async (request: Request, context: { params: { auth0: string } }) => {
  if (!isAuth0Configured()) {
    return jsonError(request, 500, {
      ok: false,
      error: "Auth0 is not configured",
      code: "AUTH0_NOT_CONFIGURED",
    });
  }

  try {
    return await authHandler(request, context);
  } catch {
    return jsonError(request, 500, {
      ok: false,
      error: "Auth0 handler failed",
      code: "AUTH0_HANDLER_FAILED",
    });
  }
};
