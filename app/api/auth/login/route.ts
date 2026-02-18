import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { signSession } from "@/lib/session";
import { findUserByUsername, getRolesForUser, isStorageError, touchLastLoginAt } from "@/lib/server/controlModel";
import { verifyPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);

  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const username =
      typeof (body as { username?: unknown })?.username === "string"
        ? (body as { username: string }).username.trim()
        : "";
    const password =
      typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";

    const user = username ? await findUserByUsername(username) : null;
    if (!user) {
      return json(requestId, 401, {
        ok: false,
        error: "Invalid username or password",
        code: "INVALID_CREDENTIALS",
      });
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return json(requestId, 401, {
        ok: false,
        error: "Invalid username or password",
        code: "INVALID_CREDENTIALS",
      });
    }

    if (!user.is_active) {
      return json(requestId, 403, { ok: false, error: "Account inactive", code: "ACCOUNT_INACTIVE" });
    }

    const roles = await getRolesForUser(user.user_id);
    const now = new Date();
    await touchLastLoginAt(user.user_id, now.toISOString());

    const response = json(requestId, 200, { ok: true, role: roles, must_change_password: user.must_change_password === true });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: signSession({
        user_id: user.user_id,
        username: user.login,
        roles,
        must_change_password: user.must_change_password === true,
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
      return json(requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
