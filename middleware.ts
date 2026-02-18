import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LOGIN_PATH = "/api/auth/dev/login";
const LOGOUT_PATH = "/api/auth/dev/logout";
const INTERNAL_LOGIN_PATH = "/api/auth/login";
const INTERNAL_LOGOUT_PATH = "/api/auth/logout";
const INTERNAL_ME_PATH = "/api/auth/me";
const REQUEST_ID_HEADER = "x-request-id";

type SessionSummary = {
  roles: string[];
  exp: number | null;
};

function getRequestId(request: NextRequest): string {
  const existing = request.headers.get(REQUEST_ID_HEADER);
  if (existing && existing.trim()) {
    return existing;
  }

  return crypto.randomUUID();
}

function jsonError(
  requestId: string,
  status: 401 | 403,
  code: "UNAUTHORIZED" | "FORBIDDEN",
  error: "Unauthorized" | "Forbidden"
) {
  return NextResponse.json(
    { ok: false, error, code },
    {
      status,
      headers: {
        [REQUEST_ID_HEADER]: requestId,
      },
    }
  );
}

function decodeSessionPayload(token: string): SessionSummary | null {
  const separator = token.indexOf(".");
  if (separator <= 0) {
    return null;
  }

  const encodedPayload = token.slice(0, separator);
  if (!encodedPayload) {
    return null;
  }

  try {
    const decodedPayload = globalThis.atob(encodedPayload);
    const parsed: unknown = JSON.parse(decodedPayload);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const expValue = (parsed as { exp?: unknown }).exp;
    const exp = typeof expValue === "number" && Number.isFinite(expValue) ? expValue : null;

    const role = (parsed as { role?: unknown }).role;
    if (typeof role === "string" && role.trim()) {
      return { roles: [role.trim().toUpperCase()], exp };
    }

    const roles = (parsed as { roles?: unknown }).roles;
    if (!Array.isArray(roles)) {
      return { roles: [], exp };
    }

    return {
      roles: roles
        .filter((item): item is string => typeof item === "string" && !!item.trim())
        .map((item) => item.trim().toUpperCase()),
      exp,
    };
  } catch {
    return null;
  }
}

function isSessionProbablyValid(request: NextRequest): SessionSummary | null {
  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return null;
  }

  const decoded = decodeSessionPayload(sessionToken);
  if (!decoded) {
    return null;
  }

  if (typeof decoded.exp === "number" && Date.now() >= decoded.exp * 1000) {
    return null;
  }

  return decoded;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === LOGIN_PATH ||
    pathname === LOGOUT_PATH ||
    pathname === INTERNAL_LOGIN_PATH ||
    pathname === INTERNAL_LOGOUT_PATH ||
    pathname === INTERNAL_ME_PATH
  ) {
    return NextResponse.next();
  }

  const requestId = getRequestId(request);
  const session = isSessionProbablyValid(request);

  if (pathname.startsWith("/owner")) {
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!session.roles.includes("OWNER")) {
      return NextResponse.rewrite(new URL("/403", request.url));
    }
  }

  if (pathname.startsWith("/api/owner")) {
    if (!session) {
      return jsonError(requestId, 401, "UNAUTHORIZED", "Unauthorized");
    }

    if (!session.roles.includes("OWNER")) {
      return jsonError(requestId, 403, "FORBIDDEN", "Forbidden");
    }
  }

  if (pathname.startsWith("/api/batch/") && pathname.endsWith("/status")) {
    if (!session) {
      return jsonError(requestId, 401, "UNAUTHORIZED", "Unauthorized");
    }

    if (!session.roles.includes("OWNER") && !session.roles.includes("COO")) {
      return jsonError(requestId, 403, "FORBIDDEN", "Forbidden");
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/owner/:path*", "/owner"],
};
