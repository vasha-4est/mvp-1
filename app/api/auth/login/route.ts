import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, isProductionAuthEnvironment } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { signSession } from "@/lib/session";
import { findUserByUsername, getRolesForUser, isStorageError, touchLastLoginAt } from "@/lib/server/controlModel";
import { type PasswordCheckReason, verifyPassword } from "@/lib/server/password";

type DebugReason = "USER_NOT_FOUND" | "STORE_UNAVAILABLE" | "HASH_PARSE_FAILED" | "PASSWORD_MISMATCH" | "OK";

function json(
  requestId: string,
  status: number,
  body: Record<string, unknown>,
  debugEnabled: boolean,
  debugReason?: DebugReason
) {
  const payload = debugEnabled && debugReason ? { ...body, debug_reason: debugReason } : body;
  return NextResponse.json(payload, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function shouldIncludeDebugReason(request: Request): boolean {
  const url = new URL(request.url);
  return !isProductionAuthEnvironment() && url.searchParams.get("debug") === "1";
}

function logDebug(requestId: string, message: string, extra?: Record<string, unknown>) {
  if (isProductionAuthEnvironment()) {
    return;
  }

  console.warn(
    JSON.stringify({
      ts: new Date().toISOString(),
      request_id: requestId,
      auth_login_debug: { message, ...(extra ?? {}) },
    })
  );
}

function normalizePasswordReason(reason: PasswordCheckReason): DebugReason {
  if (reason === "OK") return "OK";
  if (reason === "HASH_PARSE_FAILED") return "HASH_PARSE_FAILED";
  return "PASSWORD_MISMATCH";
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const includeDebugReason = shouldIncludeDebugReason(request);

  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const usernameFromBody = typeof (body as { username?: unknown })?.username === "string" ? (body as { username: string }).username : "";
    const loginFromBody = typeof (body as { login?: unknown })?.login === "string" ? (body as { login: string }).login : "";
    const username = (usernameFromBody || loginFromBody).trim();
    const password =
      typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";

    const user = username ? await findUserByUsername(username) : null;
    if (!user) {
      return json(
        requestId,
        401,
        {
          ok: false,
          error: "Invalid username or password",
          code: "INVALID_CREDENTIALS",
        },
        includeDebugReason,
        "USER_NOT_FOUND"
      );
    }

    const storedSecret = user.password_hash?.trim() ? user.password_hash : user.password?.trim() || "";
    const checked = await verifyPassword(password, storedSecret);

    if (!checked.ok) {
      if (checked.reason === "HASH_PARSE_FAILED") {
        logDebug(requestId, "Stored scrypt hash parse failed", { user_id: user.id, username: user.username });
      }

      return json(
        requestId,
        401,
        {
          ok: false,
          error: "Invalid username or password",
          code: "INVALID_CREDENTIALS",
        },
        includeDebugReason,
        normalizePasswordReason(checked.reason)
      );
    }

    if (!user.is_active) {
      return json(
        requestId,
        403,
        { ok: false, error: "Account inactive", code: "ACCOUNT_INACTIVE" },
        includeDebugReason,
        "OK"
      );
    }

    const roles = await getRolesForUser(user.id);
    const now = new Date();
    await touchLastLoginAt(user.id, now.toISOString());

    const response = json(
      requestId,
      200,
      {
        ok: true,
        role: roles,
        ...(checked.isPlaintextMatch ? { must_change_password: true } : {}),
      },
      includeDebugReason,
      "OK"
    );
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: signSession({
        user_id: user.id,
        username: user.username,
        roles,
        exp: Math.floor(now.getTime() / 1000) + 60 * 60 * 8,
      }),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    if (isStorageError(error)) {
      return json(
        requestId,
        500,
        { ok: false, error: "Storage error", code: "STORAGE_ERROR" },
        includeDebugReason,
        "STORE_UNAVAILABLE"
      );
    }

    return json(
      requestId,
      500,
      { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      includeDebugReason,
      "STORE_UNAVAILABLE"
    );
  }
}
