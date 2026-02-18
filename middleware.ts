import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LOGIN_PATH = "/api/auth/dev/login";
const LOGOUT_PATH = "/api/auth/dev/logout";
const INTERNAL_LOGIN_PATH = "/api/auth/login";
const INTERNAL_LOGOUT_PATH = "/api/auth/logout";
const INTERNAL_ME_PATH = "/api/auth/me";
const INTERNAL_CHANGE_PASSWORD_PATH = "/api/auth/change-password";

function jsonError(status: 401 | 403, code: "UNAUTHORIZED" | "FORBIDDEN") {
  return NextResponse.json({ ok: false, code }, { status });
}

function decodeSessionPayload(token: string): { roles: string[]; mustChangePassword: boolean } {
  const separator = token.indexOf(".");
  if (separator <= 0) {
    return { roles: [], mustChangePassword: false };
  }

  const encodedPayload = token.slice(0, separator);
  if (!encodedPayload) {
    return { roles: [], mustChangePassword: false };
  }

  try {
    const decodedPayload =
      typeof globalThis.atob === "function"
        ? globalThis.atob(encodedPayload)
        : Buffer.from(encodedPayload, "base64").toString("utf8");

    const parsed: unknown = JSON.parse(decodedPayload);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { roles: [], mustChangePassword: false };
    }

    const role = (parsed as { role?: unknown }).role;
    const roles = (parsed as { roles?: unknown }).roles;
    const normalizedRoles = [
      ...(typeof role === "string" && role.trim() ? [role.trim().toUpperCase()] : []),
      ...(Array.isArray(roles)
        ? roles.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim().toUpperCase())
        : []),
    ].filter((item, index, arr) => arr.indexOf(item) === index);

    return {
      roles: normalizedRoles,
      mustChangePassword: (parsed as { must_change_password?: unknown }).must_change_password === true,
    };
  } catch {
    return { roles: [], mustChangePassword: false };
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === LOGIN_PATH ||
    pathname === LOGOUT_PATH ||
    pathname === INTERNAL_LOGIN_PATH ||
    pathname === INTERNAL_LOGOUT_PATH ||
    pathname === INTERNAL_ME_PATH ||
    pathname === INTERNAL_CHANGE_PASSWORD_PATH
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return jsonError(401, "UNAUTHORIZED");
  }

  const session = decodeSessionPayload(sessionToken);

  if (session.mustChangePassword && pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    return jsonError(403, "FORBIDDEN");
  }

  if (pathname.startsWith("/api/owner") && !session.roles.includes("OWNER")) {
    return jsonError(403, "FORBIDDEN");
  }

  if (pathname.startsWith("/api/batch/") && pathname.endsWith("/status")) {
    if (!session.roles.includes("OWNER") && !session.roles.includes("COO")) {
      return jsonError(403, "FORBIDDEN");
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
