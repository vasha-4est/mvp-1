import { NextResponse } from "next/server";

import { isProductionAuthEnvironment } from "@/lib/auth";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireOwner } from "@/lib/server/guards";
import { createUser, findUserByUsername, isStorageError, listUsers, normalizeRoleList } from "@/lib/server/controlModel";
import {
  ControlModelUnavailableError,
  UsersDirectoryInvalidError,
  UsersDirectoryNotFoundError,
  inspectUsersDirectoryFromGas,
  isGasUsersDirectoryConfigured,
} from "@/lib/server/controlModelGas";
import { hashPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function errorResponse(requestId: string, error: unknown) {
  if (error instanceof UsersDirectoryNotFoundError) {
    return json(requestId, 503, { ok: false, code: "USERS_DIRECTORY_NOT_FOUND", error: "users_directory sheet not found" });
  }

  if (error instanceof UsersDirectoryInvalidError) {
    return json(requestId, 503, { ok: false, code: "USERS_DIRECTORY_INVALID", error: "users_directory header invalid" });
  }

  if (isStorageError(error) || error instanceof ControlModelUnavailableError) {
    return json(requestId, 503, { ok: false, code: "CONTROL_MODEL_UNAVAILABLE", error: "Control model unavailable" });
  }

  return json(requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
}

export async function POST(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

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
    const roles = normalizeRoleList((body as { roles?: unknown })?.roles);

    if (!username || !password || !roles || roles.length === 0) {
      return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR" });
    }

    const existing = await findUserByUsername(username);
    if (existing) {
      return json(auth.requestId, 409, { ok: false, code: "USERNAME_EXISTS" });
    }

    const passwordHash = await hashPassword(password, 12);
    const created = await createUser({ username, passwordHash, roles });

    return json(auth.requestId, 201, { ok: true, user_id: created.user_id });
  } catch (error) {
    return errorResponse(auth.requestId, error);
  }
}

export async function GET(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  const debugEnabled = !isProductionAuthEnvironment() && new URL(request.url).searchParams.get("debug") === "1";

  try {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
    const username = url.searchParams.get("username") ?? undefined;

    const data = await listUsers({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20,
      username,
    });

    let debugControlModel: Record<string, unknown> | undefined;
    if (debugEnabled) {
      if (isGasUsersDirectoryConfigured()) {
        const gasDebug = await inspectUsersDirectoryFromGas(auth.requestId);
        debugControlModel = {
          source: gasDebug.source,
          availableSheetNames: gasDebug.availableSheetNames,
          usersDirectoryFound: gasDebug.usersDirectoryFound,
          headerRow: gasDebug.headerRow,
          previewRows: gasDebug.previewRows,
          detectedColumnIndexes: gasDebug.detectedColumnIndexes,
        };
      } else {
        debugControlModel = {
          source: data.total > 0 ? "json-store" : "none",
          availableSheetNames: [],
          usersDirectoryFound: data.total > 0,
          headerRow: [],
          previewRows: [],
          detectedColumnIndexes: {},
        };
      }
    }

    return json(auth.requestId, 200, {
      ok: true,
      data,
      ...(data.total === 0 && isGasUsersDirectoryConfigured() ? { warning: "NOT_PROVISIONED" } : {}),
      ...(debugEnabled ? { debug: { controlModel: debugControlModel } } : {}),
    });
  } catch (error) {
    return errorResponse(auth.requestId, error);
  }
}
