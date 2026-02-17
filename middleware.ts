import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { hasSessionCookie } from "@/lib/auth/edge";
import { auth0 } from "@/lib/auth0";

const PROTECTED_API_PREFIXES = ["/api/owner", "/api/batch"];

function isProtectedApiPath(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const auth0Response = await auth0.middleware(request);
  const pathname = request.nextUrl.pathname;

  if (!isProtectedApiPath(pathname)) {
    return auth0Response;
  }

  if (hasSessionCookie(request)) {
    return auth0Response;
  }

  return NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
