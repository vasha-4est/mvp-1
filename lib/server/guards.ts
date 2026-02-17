import { NextResponse } from "next/server";

import { logJson } from "@/lib/obs/logger";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";

const ROLE_COOKIE_CANDIDATES = ["role", "user_role", "actor_role"];
const ROLE_HEADER_CANDIDATES = ["x-user-role", "x-role", "x-actor-role"];

type GuardRole = string;

type GuardSuccess = {
  ok: true;
  requestId: string;
  role: GuardRole;
};

type GuardFailure = {
  ok: false;
  requestId: string;
  response: NextResponse;
};

type GuardResult = GuardSuccess | GuardFailure;

function parseCookieHeader(cookieHeader: string): Record<string, string> {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const separator = entry.indexOf("=");
      if (separator <= 0) {
        return acc;
      }

      const key = decodeURIComponent(entry.slice(0, separator).trim());
      const value = decodeURIComponent(entry.slice(separator + 1).trim());
      if (key) {
        acc[key] = value;
      }

      return acc;
    }, {});
}

function resolveRoleFromRequest(request: Request): string | null {
  for (const headerName of ROLE_HEADER_CANDIDATES) {
    const headerValue = request.headers.get(headerName);
    if (headerValue && headerValue.trim()) {
      return headerValue.trim().toLowerCase();
    }
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.trim()) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  for (const cookieName of ROLE_COOKIE_CANDIDATES) {
    const value = cookies[cookieName];
    if (value && value.trim()) {
      return value.trim().toLowerCase();
    }
  }

  return null;
}

function jsonError(status: 401 | 403, requestId: string, body: { error: string; code: string }) {
  return NextResponse.json(
    {
      ok: false,
      ...body,
    },
    {
      status,
      headers: {
        [REQUEST_ID_HEADER]: requestId,
      },
    }
  );
}

function logSecurityViolation(request: Request, requestId: string, role: string | null, reason: string) {
  const url = new URL(request.url);

  logJson({
    ts: new Date().toISOString(),
    request_id: requestId,
    audit_log: {
      type: "security_violation",
      details: {
        route: url.pathname,
        method: request.method,
        role,
        reason,
      },
    },
  });
}

export function requireAuth(request: Request): GuardResult {
  const requestId = getOrCreateRequestId(request);
  const role = resolveRoleFromRequest(request);

  if (!role) {
    logSecurityViolation(request, requestId, null, "missing_role");
    return {
      ok: false,
      requestId,
      response: jsonError(401, requestId, {
        error: "Unauthorized",
        code: "UNAUTHORIZED",
      }),
    };
  }

  return {
    ok: true,
    requestId,
    role,
  };
}

export function requireRole(request: Request, role: string): GuardResult {
  return requireAnyRole(request, [role]);
}

export function requireAnyRole(request: Request, roles: string[]): GuardResult {
  const auth = requireAuth(request);
  if (!auth.ok) {
    return auth;
  }

  const allowed = roles.map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(auth.role)) {
    logSecurityViolation(request, auth.requestId, auth.role, "insufficient_role");
    return {
      ok: false,
      requestId: auth.requestId,
      response: jsonError(403, auth.requestId, {
        error: "Forbidden",
        code: "FORBIDDEN",
      }),
    };
  }

  return auth;
}
