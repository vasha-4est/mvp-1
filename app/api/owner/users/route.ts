import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireOwner } from "@/lib/server/guards";
import {
  createUser,
  findUserByLogin,
  isStorageError,
  listUsers,
  normalizeRoleList,
} from "@/lib/server/controlModel";
import { hashPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
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

    const login = typeof (body as { username?: unknown })?.username === "string" ? (body as { username: string }).username.trim().toLowerCase() : "";
    const password =
      typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";
    const roles = normalizeRoleList((body as { roles?: unknown })?.roles);
    const status = (body as { status?: unknown })?.status === "disabled" ? "disabled" : "active";
    const notes = typeof (body as { notes?: unknown })?.notes === "string" ? (body as { notes: string }).notes : "";
    const displayName = typeof (body as { display_name?: unknown })?.display_name === "string" ? (body as { display_name: string }).display_name : "";

    if (!login || !password || !roles || roles.length === 0) {
      return json(auth.requestId, 400, { ok: false, error: "Validation error", code: "VALIDATION_ERROR" });
    }

    const existing = await findUserByLogin(login);
    if (existing) {
      return json(auth.requestId, 409, { ok: false, error: "Login exists", code: "LOGIN_EXISTS" });
    }

    const passwordHash = await hashPassword(password, 12);
    const created = await createUser({ login, passwordHash, roles, status, notes, displayName });

    return json(auth.requestId, 201, {
      ok: true,
      data: {
        user: {
          user_id: created.user_id,
        },
      },
    });
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

  try {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
    const login = url.searchParams.get("username") ?? undefined;

    const data = await listUsers({
      page: Number.isFinite(page) && page > 0 ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20,
      login,
    });

    return json(auth.requestId, 200, {
      ok: true,
      data,
    });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
