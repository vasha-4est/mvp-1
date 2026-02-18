import { NextResponse } from "next/server";

import { verifySession } from "@/lib/session";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { logJson } from "@/lib/obs/logger";
import { ALLOWED_ROLES, type AllowedRole } from "@/lib/server/controlModel";

export const SESSION_COOKIE_NAME = "session";

type GuardSuccess = {
  ok: true;
  requestId: string;
  roles: string[];
};

type GuardFailure = {
  ok: false;
  requestId: string;
  response: NextResponse;
};

export type GuardResult = GuardSuccess | GuardFailure;

export function isProductionAuthEnvironment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (typeof vercelEnv === "string" && vercelEnv.trim().length > 0) {
    return vercelEnv.trim().toLowerCase() === "production";
  }

  return process.env.NODE_ENV === "production";
}

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

export function isAllowedRole(role: unknown): role is AllowedRole {
  return typeof role === "string" && ALLOWED_ROLES.includes(role as AllowedRole);
}

export function getSessionFromRequest(request: Request): { user_id: string; username: string; roles: string[] } | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.trim()) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken || !sessionToken.trim()) {
    return null;
  }

  const verified = verifySession(sessionToken);
  if (!verified) {
    return null;
  }

  return {
    user_id: verified.user_id,
    username: verified.username,
    roles: verified.roles.filter((role) => isAllowedRole(role)),
  };
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

function logSecurityViolation(request: Request, requestId: string, roles: string[] | null, reason: string) {
  const url = new URL(request.url);

  logJson({
    ts: new Date().toISOString(),
    request_id: requestId,
    audit_log: {
      type: "security_violation",
      details: {
        route: url.pathname,
        method: request.method,
        roles,
        reason,
      },
    },
  });
}

export function requireAuth(request: Request): GuardResult {
  const requestId = getOrCreateRequestId(request);
  const session = getSessionFromRequest(request);

  if (!session || session.roles.length === 0) {
    logSecurityViolation(request, requestId, null, "missing_session");
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
    roles: session.roles.map((role) => role.toLowerCase()),
  };
}

export function requireRole(request: Request, role: string): GuardResult {
  return requireAnyRole(request, [role]);
}

export function requireOwner(request: Request): GuardResult {
  return requireRole(request, "OWNER");
}

export function requireAnyRole(request: Request, roles: string[]): GuardResult {
  const auth = requireAuth(request);
  if (!auth.ok) {
    return auth;
  }

  const allowed = roles.map((item) => item.trim().toLowerCase()).filter(Boolean);
  const hasRole = auth.roles.some((role) => allowed.includes(role));

  if (!hasRole) {
    logSecurityViolation(request, auth.requestId, auth.roles, "insufficient_role");
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
