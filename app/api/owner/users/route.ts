import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { createUser, findUserByUsername, getControlModelStoreDiagnostics, isStorageError, normalizeRoleList, readUsersDirectoryFromGas } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";
import { hashPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function includeDebug(url: URL) {
  return url.searchParams.get("debug") === "1";
}

function ownerUsersDebug(params?: { error?: string; sheets?: Record<string, unknown> }) {
  return {
    ...getControlModelStoreDiagnostics(params?.error),
    control_model: {
      gas_url_present: Boolean(process.env.GAS_WEBAPP_URL),
      gas_key_present: Boolean(process.env.GAS_API_KEY),
    },
    sheets: params?.sheets ?? {
      tried: false,
    },
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

    const passwordHash = await hashPassword(password, 12);
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
    const usernameFilter = (url.searchParams.get("username") ?? "").trim().toLowerCase();
    const normalizedPage = Number.isFinite(page) && page > 0 ? page : 1;
    const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20;

    const snapshot = await readUsersDirectoryFromGas(auth.requestId);
    const mappedUsers = snapshot.rows.map((row) => ({
      id: String(row.data.id ?? "").trim(),
      username: String(row.data.username ?? "").trim(),
      is_active: String(row.data.is_active ?? "true").trim().toLowerCase() !== "false",
      roles: [],
    }));

    const filtered = mappedUsers.filter((user) => {
      if (!usernameFilter) {
        return true;
      }
      return user.username.toLowerCase().includes(usernameFilter);
    });

    const start = (normalizedPage - 1) * normalizedPageSize;
    const users = filtered.slice(start, start + normalizedPageSize);

    return json(auth.requestId, 200, {
      ok: true,
      data: {
        total: filtered.length,
        users,
      },
      ...(wantsDebug
        ? {
            debug: ownerUsersDebug({
              sheets: {
                tried: true,
                header_ok: snapshot.diagnostics.header_ok,
                header_row_index: snapshot.diagnostics.header_row_index,
                header_row_values: snapshot.diagnostics.header_row_values,
                headers_seen: snapshot.diagnostics.headers_seen,
              },
            }),
          }
        : {}),
    });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 503, {
        ok: false,
        error: "Control model unavailable",
        code: "CONTROL_MODEL_UNAVAILABLE",
        ...(wantsDebug ? { debug: ownerUsersDebug({ error: error.diagnostics?.store_init_error }) } : {}),
      });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
