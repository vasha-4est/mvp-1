import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { logJson } from "@/lib/obs/logger";
import { verifySession } from "@/lib/session";
import { ALLOWED_ROLES, type AllowedRole } from "@/lib/server/controlModel";

export const SESSION_COOKIE_NAME = "session";

export type AuthenticatedUser = {
  user_id: string;
  username: string;
  roles: string[];
};

type GuardSuccess = {
  ok: true;
  requestId: string;
  user: AuthenticatedUser;
};

type GuardFailure = {
  ok: false;
  requestId: string;
  response: NextResponse;
};

export type GuardResult = GuardSuccess | GuardFailure;

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

function getSessionFromToken(token: string | null | undefined): AuthenticatedUser | null {
  if (!token || !token.trim()) {
    return null;
  }

  const verified = verifySession(token);
  if (!verified) {
    return null;
  }

  return {
    user_id: verified.user_id,
    username: verified.username,
    roles: verified.roles.filter((role) => isAllowedRole(role)),
  };
}

export function getSessionFromRequest(request: Request): AuthenticatedUser | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader.trim()) {
    return null;
  }

  const sessionToken = parseCookieHeader(cookieHeader)[SESSION_COOKIE_NAME];
  return getSessionFromToken(sessionToken);
}

export function getSessionFromCookies(): AuthenticatedUser | null {
  const sessionToken = cookies().get(SESSION_COOKIE_NAME)?.value;
  return getSessionFromToken(sessionToken);
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

export function hasRole(user: AuthenticatedUser, allowedRoles: string[]): boolean {
  const normalizedAllowedRoles = allowedRoles.map((role) => role.trim().toUpperCase()).filter(Boolean);
  return user.roles.some((role) => normalizedAllowedRoles.includes(role.trim().toUpperCase()));
}

export function requireAuth(request: Request): GuardResult {
  const requestId = getOrCreateRequestId(request);
  const user = getSessionFromRequest(request);

  if (!user || user.roles.length === 0) {
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
    user,
  };
}

export function requireRole(request: Request, allowedRoles: string[]): GuardResult {
  const auth = requireAuth(request);
  if (!auth.ok) {
    return auth;
  }

  if (!hasRole(auth.user, allowedRoles)) {
    logSecurityViolation(request, auth.requestId, auth.user.roles, "insufficient_role");
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

export function requirePageRole(pathname: string, allowedRoles: string[]): AuthenticatedUser {
  const user = getSessionFromCookies();

  if (!user || user.roles.length === 0) {
    redirect(`/?next=${encodeURIComponent(pathname)}`);
  }

  if (!hasRole(user, allowedRoles)) {
    redirect("/forbidden");
  }

  return user;
}
