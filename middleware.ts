import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LOGIN_PATH = "/api/auth/dev/login";
const LOGOUT_PATH = "/api/auth/dev/logout";
const INTERNAL_LOGIN_PATH = "/api/auth/login";
const INTERNAL_LOGOUT_PATH = "/api/auth/logout";
const INTERNAL_ME_PATH = "/api/auth/me";

function jsonError(status: 401 | 403, code: "UNAUTHORIZED" | "FORBIDDEN") {
  return NextResponse.json({ ok: false, code }, { status });
}

function decodeRolesFromUnsignedSessionPayload(token: string): string[] {
  const separator = token.indexOf(".");
  if (separator <= 0) {
    return [];
  }

  const encodedPayload = token.slice(0, separator);
  if (!encodedPayload) {
    return [];
  }

  try {
    const decodedPayload =
      typeof globalThis.atob === "function"
        ? globalThis.atob(encodedPayload)
        : Buffer.from(encodedPayload, "base64").toString("utf8");

    const parsed: unknown = JSON.parse(decodedPayload);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return [];
    }

    const role = (parsed as { role?: unknown }).role;
    if (typeof role === "string" && role.trim()) {
      return [role.trim().toUpperCase()];
    }

    const roles = (parsed as { roles?: unknown }).roles;
    if (!Array.isArray(roles)) {
      return [];
    }

    return roles
      .filter((item): item is string => typeof item === "string" && !!item.trim())
      .map((item) => item.trim().toUpperCase());
  } catch {
    return [];
  }
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

  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return jsonError(401, "UNAUTHORIZED");
  }

  const roles = decodeRolesFromUnsignedSessionPayload(sessionToken);

  if (pathname.startsWith("/api/owner") && !roles.includes("OWNER")) {
    return jsonError(403, "FORBIDDEN");
  }

  if (pathname.startsWith("/api/batch/") && pathname.endsWith("/status")) {
    if (!roles.includes("OWNER") && !roles.includes("COO")) {
      return jsonError(403, "FORBIDDEN");
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
