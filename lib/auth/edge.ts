import type { NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "session";

export function hasSessionCookie(request: NextRequest): boolean {
  const value = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return typeof value === "string" && value.trim().length > 0;
}
