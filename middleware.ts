import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PAGE_PREFIXES = ["/owner", "/drying", "/packaging", "/control-tower", "/batches"];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPage(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/owner/:path*", "/drying/:path*", "/packaging/:path*", "/control-tower/:path*", "/batches/:path*"],
};
