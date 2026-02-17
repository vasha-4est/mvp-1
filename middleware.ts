import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifySession } from "@/lib/session";

export function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get("session")?.value;
  if (!sessionToken) {
    return NextResponse.next();
  }

  const verified = verifySession(sessionToken);
  if (!verified) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-role", verified.role);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
