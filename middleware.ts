import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LOGIN_PATH = "/api/auth/dev/login";
const LOGOUT_PATH = "/api/auth/dev/logout";

function jsonError(status: 401 | 403, code: "UNAUTHORIZED" | "FORBIDDEN") {
  return NextResponse.json({ ok: false, code }, { status });
}

function decodeRoleFromUnsignedSessionPayload(token: string): string | null {
  const separator = token.indexOf(".");
  if (separator <= 0) {
    return null;
  }

  const encodedPayload = token.slice(0, separator);
  if (!encodedPayload) {
    return null;
  }

  try {
    const decodedPayload =
      typeof globalThis.atob === "function"
        ? globalThis.atob(encodedPayload)
        : Buffer.from(encodedPayload, "base64").toString("utf8");

    const parsed: unknown = JSON.parse(decodedPayload);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const role = (parsed as { role?: unknown }).role;
    if (typeof role !== "string" || !role.trim()) {
      return null;
    }

    return role.trim().toUpperCase();
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === LOGIN_PATH || pathname === LOGOUT_PATH) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return jsonError(401, "UNAUTHORIZED");
  }

  const role = decodeRoleFromUnsignedSessionPayload(sessionToken);

  if (pathname.startsWith("/api/owner") && role !== "OWNER") {
    return jsonError(403, "FORBIDDEN");
  }

  if (pathname.startsWith("/api/batch") && role !== "OWNER" && role !== "COO") {
    return jsonError(403, "FORBIDDEN");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
