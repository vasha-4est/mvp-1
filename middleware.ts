import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PAGE_PREFIXES = ["/owner", "/drying", "/packaging", "/control-tower", "/batches", "/shipments"];
const SESSION_COOKIE_NAME = "session";

function fromBase64(input: string): string | null {
  try {
    return atob(input);
  } catch {
    return null;
  }
}

async function hasValidOwnerSession(sessionToken: string | undefined): Promise<boolean> {
  if (!sessionToken) {
    return false;
  }

  const separator = sessionToken.indexOf(".");
  if (separator <= 0) {
    return false;
  }

  const encodedPayload = sessionToken.slice(0, separator);
  const payloadJson = fromBase64(encodedPayload);
  if (!payloadJson) {
    return false;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return false;
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return false;
  }

  const exp = (payload as { exp?: unknown }).exp;
  if (typeof exp !== "number" || !Number.isFinite(exp) || Date.now() >= exp * 1000) {
    return false;
  }

  const roles = (payload as { roles?: unknown }).roles;
  if (!Array.isArray(roles)) {
    return false;
  }

  return roles.some((role) => typeof role === "string" && role.trim().toUpperCase() === "OWNER");
}

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPage(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (pathname === "/owner" || pathname.startsWith("/owner/")) {
    if (!sessionToken) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!(await hasValidOwnerSession(sessionToken))) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    return NextResponse.next();
  }

  if (!sessionToken) {
    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/owner/:path*", "/drying/:path*", "/packaging/:path*", "/control-tower/:path*", "/batches/:path*", "/shipments/:path*"],
};
