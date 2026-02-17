import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, isProductionAuthEnvironment } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (isProductionAuthEnvironment()) {
    return json(requestId, 404, { ok: false, error: "Not found", code: "NOT_FOUND" });
  }

  const response = json(requestId, 200, { ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });

  return response;
}
