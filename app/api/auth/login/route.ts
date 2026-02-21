import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { signSession } from "@/lib/session";
import { findUserByUsername, getRolesForUser, isStorageError, touchLastLoginAt } from "@/lib/server/controlModel";
import { type PasswordHashFormat, type PasswordVerifyPath, verifyPassword } from "@/lib/server/password";

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
    triedStandard: boolean;
    triedLegacyUtf8Salt: boolean;
    triedLegacyDefault: boolean;
    matched: boolean;
    result: "pass" | "fail" | "skip";
    reason_code: "OK" | "OK_LEGACY" | "MISMATCH" | "TOKEN_PARSE_FAIL" | "EXCEPTION" | "USER_NOT_FOUND" | "NO_PASSWORD";
    verify_path: PasswordVerifyPath;
    which_variant: "standard" | "legacy_utf8_salt" | "legacy_default" | null;
    triedPaths: string[];
    matched_path: string | null;
  };
  response: {
    http_status: number;
    code: string;
  };
};

function isPreviewDebugEnv(vercelEnv: string, nodeEnv: string): boolean {
  return vercelEnv === "preview" || nodeEnv !== "production";
}

function getDebugContext(request: Request): { includeDebug: boolean; vercelEnv: string; nodeEnv: string } {
  const url = new URL(request.url);
  const debugFlag = url.searchParams.get("debug") === "1";
  const vercelEnv = process.env.VERCEL_ENV || "unknown";
  const nodeEnv = process.env.NODE_ENV || "unknown";
  const includeDebug = debugFlag && isPreviewDebugEnv(vercelEnv, nodeEnv);

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
  let stage = "start";

  try {
    stage = "parse_body";
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const payloadKeys = typeof body === "object" && body !== null && !Array.isArray(body) ? Object.keys(body as Record<string, unknown>) : [];

    stage = "normalize_login";
    const hasLogin = typeof (body as { login?: unknown })?.login === "string";
    const hasUsername = typeof (body as { username?: unknown })?.username === "string";
    const loginValue = hasLogin
      ? String((body as { login: string }).login)
      : hasUsername
        ? String((body as { username: string }).username)
        : "";

    const username = loginValue.trim();
    const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";

    stage = "load_user";
    let user = null;
    if (username) {
      try {
        user = await findUserByUsername(username);
      } catch (error) {
        stage = "load_user";
        throw error;
      }
    }

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
            triedStandard: false,
            triedLegacyUtf8Salt: false,
            triedLegacyDefault: false,
            matched: false,
            result: "skip",
            reason_code: "USER_NOT_FOUND",
            verify_path: "plain",
            which_variant: null,
            triedPaths: [],
            matched_path: null,
          },
        },
        env
      );
    }

    stage = "verify_password";
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
      triedStandard: checked.verify.triedStandard,
      triedLegacyUtf8Salt: checked.verify.triedLegacyUtf8Salt,
      triedLegacyDefault: checked.verify.triedLegacyDefault,
      matched: checked.verify.matched,
      result: checked.verify.matched ? "pass" : "fail",
      reason_code:
        checked.hashFormat === "empty"
          ? "NO_PASSWORD"
          : checked.verify.reason_code,
      verify_path: checked.verifyPath,
      which_variant: checked.verify.which_variant,
      triedPaths: checked.verify.triedPaths,
      matched_path: checked.verify.matched_path,
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

    stage = "touch_last_login";
    const now = new Date();
    await touchLastLoginAt(user.id, now.toISOString());

    stage = "set_session";
    const response = withDebug(
      requestId,
      200,
      "OK",
      { ok: true, role: userRoles, must_change_password: Boolean(user.must_change_password) },
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

    stage = "respond_ok";
    return response;
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "Error";
    const errorMessage = error instanceof Error ? error.message : "Internal error";
    const stackHead = error instanceof Error && typeof error.stack === "string" ? error.stack.split("\n").slice(0, 8) : [];

    if (isStorageError(error)) {
      const payload: Record<string, unknown> = {
        ok: false,
        error: "Storage error",
        code: "STORAGE_ERROR",
      };

      if (includeDebug) {
        payload.debug = {
          stage,
          message: errorMessage,
          name: errorName,
          stack_head: stackHead,
          upstream: process.env.GAS_WEBAPP_URL ? { type: "gas", message: errorMessage } : undefined,
        };
      }

      return NextResponse.json(payload, {
        status: 500,
        headers: { [REQUEST_ID_HEADER]: requestId },
      });
    }

    const payload: Record<string, unknown> = {
      ok: false,
      error: "Internal error",
      code: "INTERNAL_ERROR",
    };

    if (includeDebug) {
      payload.debug = {
        stage,
        message: errorMessage,
        name: errorName,
        stack_head: stackHead,
        upstream: process.env.GAS_WEBAPP_URL ? { type: "gas", message: errorMessage } : undefined,
      };
    }

    return NextResponse.json(payload, {
      status: 500,
      headers: { [REQUEST_ID_HEADER]: requestId },
    });
  }
}
