import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { logJson } from "@/lib/obs/logger";

export const DEV_ROLE_COOKIE_NAME = "mvp1_role";

const ALLOWED_ROLES = ["OWNER", "COO", "VIEWER"] as const;

type AllowedRole = (typeof ALLOWED_ROLES)[number];

type GuardSuccess = {
  ok: true;
  requestId: string;
  role: string;
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

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
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

export function getRoleFromRequest(request: Request): string | null {
  if (isProductionAuthEnvironment()) {
    return null;
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.trim()) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);
  const rawRole = cookies[DEV_ROLE_COOKIE_NAME];
  if (!rawRole || !rawRole.trim()) {
    return null;
  }

  if (!isAllowedRole(rawRole.trim().toUpperCase())) {
    return null;
  }

  return normalizeRole(rawRole);
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
  const role = getRoleFromRequest(request);

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

export function requireOwner(request: Request): GuardResult {
  return requireRole(request, "OWNER");
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
