import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { signSession } from "@/lib/session";
import { findUserByUsername, getRolesForUser, isStorageError, touchLastLoginAt } from "@/lib/server/controlModel";
import { verifyPassword } from "@/lib/server/password";

type DebugReason = "USER_NOT_FOUND" | "NO_PASSWORD" | "PARSE_FAIL" | "VERIFY_FAIL" | "OK";

type LoginDebug = {
  request: {
    has_username: boolean;
    has_login: boolean;
    payload_keys: string[];
  };
  user_lookup: {
    found: boolean;
    matched_by: "username" | "login" | "none";
    user_id_present: boolean;
  };
  stored_password: {
    kind: "empty" | "plain" | "scrypt" | "unknown";
    prefix: string;
    length: number;
    scrypt_parts_ok: boolean;
    scrypt_N: number | null;
  };
  verify: {
    attempted: boolean;
    result: "pass" | "fail" | "skip";
    reason_code: DebugReason;
  };
  response: {
    http_status: number;
    code: string;
  };
};

function shouldIncludeDebug(request: Request): boolean {
  const url = new URL(request.url);
  return url.searchParams.get("debug") === "1" && process.env.NODE_ENV !== "production";
}

function parseScryptHeader(stored: string): { ok: boolean; N: number | null } {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") {
    return { ok: false, N: null };
  }

  const N = parseInt(parts[1] ?? "", 10);
  const saltHex = parts[2] ?? "";
  const dkHex = parts[3] ?? "";
  if (!Number.isInteger(N)) {
    return { ok: false, N: null };
  }

  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(dkHex) || saltHex.length % 2 !== 0 || dkHex.length % 2 !== 0) {
    return { ok: false, N };
  }

  return { ok: true, N };
}

function inspectStoredPassword(raw: unknown): LoginDebug["stored_password"] {
  if (typeof raw !== "string") {
    return {
      kind: "unknown",
      prefix: "",
      length: 0,
      scrypt_parts_ok: false,
      scrypt_N: null,
    };
  }

  const stored = raw;
  if (!stored) {
    return {
      kind: "empty",
      prefix: "",
      length: 0,
      scrypt_parts_ok: false,
      scrypt_N: null,
    };
  }

  if (stored.startsWith("scrypt$")) {
    const parsed = parseScryptHeader(stored);
    return {
      kind: "scrypt",
      prefix: stored.slice(0, 10),
      length: stored.length,
      scrypt_parts_ok: parsed.ok,
      scrypt_N: parsed.N,
    };
  }

  return {
    kind: "plain",
    prefix: stored.slice(0, 10),
    length: stored.length,
    scrypt_parts_ok: false,
    scrypt_N: null,
  };
}

function withDebug(
  requestId: string,
  status: number,
  code: string,
  body: Record<string, unknown>,
  includeDebug: boolean,
  debugData: Omit<LoginDebug, "response">
) {
  const payload = includeDebug
    ? {
        ...body,
        debug: {
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
  const includeDebug = shouldIncludeDebug(request);

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
    const matchedBy: "username" | "login" | "none" = hasLogin ? "login" : hasUsername ? "username" : "none";

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
          user_lookup: { found: false, matched_by: matchedBy, user_id_present: false },
          stored_password: { kind: "empty", prefix: "", length: 0, scrypt_parts_ok: false, scrypt_N: null },
          verify: { attempted: false, result: "skip", reason_code: "USER_NOT_FOUND" },
        }
      );
    }

    const storedRaw = user.password;
    const stored = typeof storedRaw === "string" ? storedRaw : "";
    const storedInfo = inspectStoredPassword(storedRaw);
    const checked = await verifyPassword(password, stored);

    if (!checked.ok) {
      const reasonCode: DebugReason =
        storedInfo.kind === "empty" ? "NO_PASSWORD" : checked.reason === "HASH_PARSE_FAILED" ? "PARSE_FAIL" : "VERIFY_FAIL";

      return withDebug(
        requestId,
        401,
        "INVALID_CREDENTIALS",
        { ok: false, error: "Invalid username or password", code: "INVALID_CREDENTIALS" },
        includeDebug,
        {
          request: { has_username: hasUsername, has_login: hasLogin, payload_keys: payloadKeys },
          user_lookup: { found: true, matched_by: matchedBy, user_id_present: Boolean(user.id) },
          stored_password: storedInfo,
          verify: { attempted: true, result: "fail", reason_code: reasonCode },
        }
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
          user_lookup: { found: true, matched_by: matchedBy, user_id_present: Boolean(user.id) },
          stored_password: storedInfo,
          verify: { attempted: true, result: "pass", reason_code: "OK" },
        }
      );
    }

    const roles = await getRolesForUser(user.id);
    const now = new Date();
    await touchLastLoginAt(user.id, now.toISOString());

    const response = withDebug(
      requestId,
      200,
      "OK",
      { ok: true, role: roles },
      includeDebug,
      {
        request: { has_username: hasUsername, has_login: hasLogin, payload_keys: payloadKeys },
        user_lookup: { found: true, matched_by: matchedBy, user_id_present: Boolean(user.id) },
        stored_password: storedInfo,
        verify: { attempted: true, result: "pass", reason_code: "OK" },
      }
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
