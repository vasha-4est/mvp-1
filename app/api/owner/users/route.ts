import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { createUser, findUserByUsername, getControlModelStoreDiagnostics, isStorageError, listUsers, normalizeRoleList } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";
import { hashPasswordScrypt } from "@/lib/server/auth/scrypt";
import { readUsersDirectoryFromGas } from "@/lib/server/usersDirectory";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function includeDebug(url: URL) {
  return url.searchParams.get("debug") === "1";
}

async function ownerUsersDebug(error?: string) {
  let sheets: Record<string, unknown> = { tried: false };

  if (process.env.GAS_WEBAPP_URL) {
    try {
      const source = await readUsersDirectoryFromGas("owner-users-debug");
      sheets = {
        users_directory_found: source.debug.users_directory_found,
        available_sheet_names: source.debug.available_sheet_names,
        header_row_index: source.debug.header_row_index,
        header_row_values: source.debug.header_row_values,
        headers_seen: source.debug.headers_seen,
        missing_required: source.debug.missing_required,
        header_ok: source.debug.header_ok,
      };
    } catch {
      sheets = {
        users_directory_found: false,
        available_sheet_names: [],
        header_row_index: null,
        header_row_values: [],
        headers_seen: [],
        missing_required: ["id", "username", "password"],
        header_ok: false,
      };
    }
  }

  return {
    ...getControlModelStoreDiagnostics(error),
    control_model: {
      gas_url_present: Boolean(process.env.GAS_WEBAPP_URL),
      gas_key_present: Boolean(process.env.GAS_API_KEY),
    },
    sheets,
  };
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

    const passwordHash = await hashPasswordScrypt(password);
    const created = await createUser({ username, passwordHash, roles });

    return json(auth.requestId, 201, { ok: true, user_id: created.user_id });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}

export async function GET(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  const url = new URL(request.url);
  const wantsDebug = includeDebug(url);

  try {
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
    const username = url.searchParams.get("username") ?? undefined;

    const data = await listUsers({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20,
      username,
    });

    return json(auth.requestId, 200, {
      ok: true,
      data,
      ...(wantsDebug ? { debug: await ownerUsersDebug() } : {}),
    });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 503, {
        ok: false,
        error: "Control model unavailable",
        code: "CONTROL_MODEL_UNAVAILABLE",
        ...(wantsDebug ? { debug: await ownerUsersDebug(error.diagnostics?.store_init_error) } : {}),
      });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
