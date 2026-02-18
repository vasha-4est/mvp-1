import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, isAllowedRole, isProductionAuthEnvironment } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

type LoginBody = {
  role?: unknown;
};

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  });
}

function extractRole(body: unknown, requestUrl: string): string | null {
  const queryRole = new URL(requestUrl).searchParams.get("role");
  if (typeof queryRole === "string" && queryRole.trim()) {
    return queryRole.trim().toUpperCase();
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const bodyRole = (body as LoginBody).role;
  if (typeof bodyRole !== "string" || !bodyRole.trim()) {
    return null;
  }

  return bodyRole.trim().toUpperCase();
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  if (isProductionAuthEnvironment()) {
    return json(requestId, 404, { ok: false, error: "Not found", code: "NOT_FOUND" });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const role = extractRole(body, request.url);
  if (!role || !isAllowedRole(role)) {
    return json(requestId, 400, {
      ok: false,
      error: "Field 'role' must be one of: OWNER, COO, VIEWER, PROD_MASTER, PACKER, LOGISTICS",
      code: "VALIDATION_ERROR",
    });
  }

  const response = json(requestId, 200, {
    ok: true,
    role,
  });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: signSession({
      user_id: "dev-user",
      username: "dev",
      roles: [role],
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
    }),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
