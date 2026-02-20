import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { signSession } from "@/lib/session";
import {
  findUserByUsername,
  getRolesForUser,
  isStorageError,
  migrateUserPasswordToScrypt,
  touchLastLoginAt,
} from "@/lib/server/controlModel";
import { hashPassword, type PasswordVerificationBranch, verifyPassword } from "@/lib/server/password";

function withDebug(body: Record<string, unknown>, request: Request, branch: PasswordVerificationBranch) {
  const debugEnabled = new URL(request.url).searchParams.get("debug") === "1";
  if (!debugEnabled) {
    return body;
  }

  return {
    ...body,
    debug_branch: branch,
  };
}

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

    const loginRaw =
      typeof (body as { login?: unknown })?.login === "string"
        ? (body as { login: string }).login
        : typeof (body as { username?: unknown })?.username === "string"
          ? (body as { username: string }).username
          : "";
    const login = loginRaw.trim();
    const password =
      typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";

    if (!login || !password) {
      return json(requestId, 400, {
        ok: false,
        error: "Fields 'login' and 'password' are required",
        code: "VALIDATION_ERROR",
      });
    }

    const user = await findUserByUsername(login);
    if (!user) {
      return json(
        requestId,
        401,
        withDebug(
          {
            ok: false,
            error: "Invalid username or password",
            code: "INVALID_CREDENTIALS",
          },
          request,
          "reject_mismatch"
        )
      );
    }

    if (!user.is_active) {
      return json(requestId, 403, { ok: false, error: "Account inactive", code: "ACCOUNT_INACTIVE" });
    }

    const stored = String(user.password_hash?.trim() ? user.password_hash : user.password ?? "");
    const verification = verifyPassword(password, stored);

    if (!verification.ok) {
      return json(
        requestId,
        401,
        withDebug(
          {
            ok: false,
            error: "Invalid username or password",
            code: "INVALID_CREDENTIALS",
          },
          request,
          verification.branch
        )
      );
    }

    if (verification.shouldMigratePlaintext) {
      const newHash = await hashPassword(password, 12);
      await migrateUserPasswordToScrypt(user.id, newHash);
    }

    const roles = await getRolesForUser(user.id);
    const now = new Date();
    await touchLastLoginAt(user.id, now.toISOString());

    const response = json(
      requestId,
      200,
      withDebug(
        {
          ok: true,
          role: roles,
          ...(verification.shouldMigratePlaintext ? { must_change_password: true } : {}),
        },
        request,
        verification.branch
      )
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
      return json(requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
