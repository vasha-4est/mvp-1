import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { getAuth0Client, isAuth0Configured } from "@/lib/auth0";

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

async function logout(request: Request) {
  const fallback = NextResponse.redirect(new URL("/", request.url));
  clearSessionCookie(fallback);

  if (!isAuth0Configured()) {
    return fallback;
  }

  try {
    const auth0 = getAuth0Client();
    const response = await auth0.handleLogout(request);
    clearSessionCookie(response);
    return response;
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  return logout(request);
}

export async function POST(request: Request) {
  return logout(request);
}
