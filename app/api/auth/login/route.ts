import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { signSession } from "@/lib/session";
import { findUserByUsername, getRolesForUser, isStorageError, touchLastLoginAt } from "@/lib/server/controlModel";
import { verifyPassword } from "@/lib/server/password";

type DebugReason = "HASH_PARSE_FAILED" | "PASSWORD_MISMATCH" | "USER_NOT_FOUND" | "OK";

function shouldIncludeDebug(request: Request): boolean {
  const url = new URL(request.url);
  return process.env.NODE_ENV !== "production" && url.searchParams.get("debug") === "1";
}

function json(
  requestId: string,
  status: number,
  body: Record<string, unknown>,
  includeDebug: boolean,
  debugReason?: DebugReason
) {
  return NextResponse.json(includeDebug && debugReason ? { ...body, debug_reason: debugReason } : body, {
    status,
    headers: { [REQUEST_ID_HEADER]: requestId },
  });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const includeDebug = shouldIncludeDebug(request);

  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const loginValue =
      typeof (body as { login?: unknown })?.login === "string"
        ? (body as { login: string }).login
        : typeof (body as { username?: unknown })?.username === "string"
          ? (body as { username: string }).username
          : "";

    const username = loginValue.trim();
    const password =
      typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";

    const user = username ? await findUserByUsername(username) : null;
    if (!user) {
      return json(
        requestId,
        401,
        { ok: false, error: "Invalid username or password", code: "INVALID_CREDENTIALS" },
        includeDebug,
        "USER_NOT_FOUND"
      );
    }

    const stored = String(user.password ?? "");
    const checked = await verifyPassword(password, stored);
    if (!checked.ok) {
      return json(
        requestId,
        401,
        { ok: false, error: "Invalid username or password", code: "INVALID_CREDENTIALS" },
        includeDebug,
        checked.reason === "HASH_PARSE_FAILED" ? "HASH_PARSE_FAILED" : "PASSWORD_MISMATCH"
      );
    }

    if (!user.is_active) {
      return json(requestId, 403, { ok: false, error: "Account inactive", code: "ACCOUNT_INACTIVE" }, includeDebug, "OK");
    }

    const roles = await getRolesForUser(user.id);
    const now = new Date();
    await touchLastLoginAt(user.id, now.toISOString());

    const response = json(requestId, 200, { ok: true, role: roles }, includeDebug, "OK");
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
      return json(requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" }, includeDebug);
    }

    return json(requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" }, includeDebug);
  }
}
