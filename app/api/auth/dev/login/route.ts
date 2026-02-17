import { NextResponse } from "next/server";

import { DEV_ROLE_COOKIE_NAME, isAllowedRole, isProductionAuthEnvironment } from "@/lib/auth";
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

function extractRole(request: Request, body: unknown): string | null {
  const roleFromQuery = new URL(request.url).searchParams.get("role");
  if (roleFromQuery && roleFromQuery.trim()) {
    return roleFromQuery.trim().toUpperCase();
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

  const role = extractRole(request, body);
  if (!role || !isAllowedRole(role)) {
    return json(requestId, 400, {
      ok: false,
      error: "Field 'role' must be one of: OWNER, COO, VIEWER",
      code: "VALIDATION_ERROR",
    });
  }

  const url = new URL(request.url);
  const isHttps = url.protocol === "https:";

  const response = json(requestId, 200, {
    ok: true,
    role,
  });

  response.cookies.set({
    name: DEV_ROLE_COOKIE_NAME,
    value: role,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isHttps,
  });

  return response;
}
