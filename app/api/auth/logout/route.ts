import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const response = NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        [REQUEST_ID_HEADER]: requestId,
      },
    }
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
