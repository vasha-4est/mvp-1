import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { signSession } from "@/lib/session";
import { findUserByUsername, getRolesForUser, isStorageError, touchLastLoginAt } from "@/lib/server/controlModel";
import { writeUsersDirectoryHashes } from "@/lib/server/usersDirectory";
import { hashPassword, type PasswordHashFormat, type PasswordVerifyPath, verifyPassword } from "@/lib/server/password";

type LoginDebug = {
  env: {
    vercel_env: string;
    node_env: string;
  };
  request: {
    has_username: boolean;
    has_login: boolean;
    payload_keys: string[];
  };
  user_lookup: {
    found: boolean;
    id?: string;
    username?: string;
    is_active?: boolean;
    roles?: string[];
  };
  stored_password: {
    kind: PasswordHashFormat | "unknown";
    N?: number | null;
    salt_hex_len?: number;
    dk_hex_len?: number;
    key_len?: number;
  };
  verify: {
    attempted: boolean;
    triedRawBytes: boolean;
    triedUtf8Hex: boolean;
    matched: boolean;
    result: "pass" | "fail" | "skip";
    reason_code: "OK" | "MISMATCH" | "TOKEN_PARSE_FAIL" | "EXCEPTION" | "USER_NOT_FOUND" | "NO_PASSWORD";
    verify_path: PasswordVerifyPath;
    which_variant: "utf8_hex" | "raw_bytes" | null;
  };
  response: {
    http_status: number;
    code: string;
  };
};

function getDebugContext(request: Request): { includeDebug: boolean; vercelEnv: string; nodeEnv: string } {
  const url = new URL(request.url);
  const debugFlag = url.searchParams.get("debug") === "1";
  const vercelEnv = process.env.VERCEL_ENV || "unknown";
  const nodeEnv = process.env.NODE_ENV || "unknown";
  const includeDebug = debugFlag && vercelEnv !== "production";

  return { includeDebug, vercelEnv, nodeEnv };
}

function withDebug(
  requestId: string,
  status: number,
  code: string,
  body: Record<string, unknown>,
  includeDebug: boolean,
  debugData: Omit<LoginDebug, "response" | "env">,
  env: LoginDebug["env"]
) {
  const payload = includeDebug
    ? {
        ...body,
        debug: {
          env,
          ...debugData,
          response: {
            http_status: status,
            code,
          },
        },
      }
    : body;

  return NextResponse.json(payload, {
    status,
    headers: { [REQUEST_ID_HEADER]: requestId },
  });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const { includeDebug, vercelEnv, nodeEnv } = getDebugContext(request);
  const env = { vercel_env: vercelEnv, node_env: nodeEnv };

  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const payloadKeys = typeof body === "object" && body !== null && !Array.isArray(body) ? Object.keys(body as Record<string, unknown>) : [];
    const hasLogin = typeof (body as { login?: unknown })?.login === "string";
    const hasUsername = typeof (body as { username?: unknown })?.username === "string";
    const loginValue = hasLogin
      ? String((body as { login: string }).login)
      : hasUsername
        ? String((body as { username: string }).username)
        : "";

    const username = loginValue.trim();
    const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";

    const user = username ? await findUserByUsername(username) : null;
    if (!user) {
      return withDebug(
        requestId,
        401,
        "INVALID_CREDENTIALS",
        { ok: false, error: "Invalid username or password", code: "INVALID_CREDENTIALS" },
        includeDebug,
        {
          request: { has_username: hasUsername, has_login: hasLogin, payload_keys: payloadKeys },
          user_lookup: { found: false },
          stored_password: { kind: "empty" },
          verify: {
            attempted: false,
            triedRawBytes: false,
            triedUtf8Hex: false,
            matched: false,
            result: "skip",
            reason_code: "USER_NOT_FOUND",
            verify_path: "plain",
            which_variant: null,
          },
        },
        env
      );
    }

    const stored = typeof user.password === "string" ? user.password : "";
    const checked = await verifyPassword(password, stored);

    const userRoles = await getRolesForUser(user.id);

    const storedPasswordMeta: LoginDebug["stored_password"] =
      checked.hashFormat === "scrypt"
        ? {
            kind: checked.tokenMeta?.kind ?? "unknown",
            N: checked.tokenMeta?.N ?? null,
            salt_hex_len: checked.tokenMeta?.saltHexLen ?? 0,
            dk_hex_len: checked.tokenMeta?.dkHexLen ?? 0,
            key_len: checked.tokenMeta?.keyLen ?? 0,
          }
        : {
            kind: checked.hashFormat,
          };

    const verifyDebug: LoginDebug["verify"] = {
      attempted: checked.verify.attempted,
      triedRawBytes: checked.verify.triedRawBytes,
      triedUtf8Hex: checked.verify.triedUtf8Hex,
      matched: checked.verify.matched,
      result: checked.verify.matched ? "pass" : "fail",
      reason_code:
        checked.hashFormat === "empty"
          ? "NO_PASSWORD"
          : checked.verify.reason_code,
      verify_path: checked.verifyPath,
      which_variant: checked.verify.which_variant,
    };

    if (!checked.ok) {
      return withDebug(
        requestId,
        401,
        "INVALID_CREDENTIALS",
        { ok: false, error: "Invalid username or password", code: "INVALID_CREDENTIALS" },
        includeDebug,
        {
          request: { has_username: hasUsername, has_login: hasLogin, payload_keys: payloadKeys },
          user_lookup: { found: true, id: user.id, username: user.username, is_active: user.is_active, roles: userRoles },
          stored_password: storedPasswordMeta,
          verify: verifyDebug,
        },
        env
      );
    }

    if (
      checked.ok &&
      checked.hashFormat === "scrypt" &&
      checked.verifyPath === "utf8_hex" &&
      process.env.GAS_WEBAPP_URL &&
      user.id
    ) {
      try {
        const canonicalHash = await hashPassword(password, 12);
        await writeUsersDirectoryHashes(requestId, [{ id: user.id, password_hash: canonicalHash }]);
      } catch {
        // best-effort upgrade; do not block successful login
      }
    }

    if (!user.is_active) {
      return withDebug(
        requestId,
        403,
        "ACCOUNT_INACTIVE",
        { ok: false, error: "Account inactive", code: "ACCOUNT_INACTIVE" },
        includeDebug,
        {
          request: { has_username: hasUsername, has_login: hasLogin, payload_keys: payloadKeys },
          user_lookup: { found: true, id: user.id, username: user.username, is_active: user.is_active, roles: userRoles },
          stored_password: storedPasswordMeta,
          verify: verifyDebug,
        },
        env
      );
    }

    const now = new Date();
    await touchLastLoginAt(user.id, now.toISOString());

    const response = withDebug(
      requestId,
      200,
      "OK",
      { ok: true, role: userRoles },
      includeDebug,
      {
        request: { has_username: hasUsername, has_login: hasLogin, payload_keys: payloadKeys },
        user_lookup: { found: true, id: user.id, username: user.username, is_active: user.is_active, roles: userRoles },
        stored_password: storedPasswordMeta,
        verify: verifyDebug,
      },
      env
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: signSession({
        user_id: user.id,
        username: user.username,
        roles: userRoles,
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
      return NextResponse.json(
        {
          ok: false,
          error: "Storage error",
          code: "STORAGE_ERROR",
        },
        {
          status: 500,
          headers: { [REQUEST_ID_HEADER]: requestId },
        }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      },
      {
        status: 500,
        headers: { [REQUEST_ID_HEADER]: requestId },
      }
    );
  }
}
