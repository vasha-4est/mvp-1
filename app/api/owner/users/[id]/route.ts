import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { getUserById, isStorageError, normalizeRoleList, updateUserById } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const user = await getUserById(params.id);
    if (!user) {
      return json(auth.requestId, 404, { ok: false, error: "Not found", code: "NOT_FOUND" });
    }

    return json(auth.requestId, 200, {
      ok: true,
      data: {
        user: {
          user_id: user.id,
          username: user.username,
          status: user.is_active ? "active" : "disabled",
          roles: user.roles,
          last_login_at: user.last_login_at,
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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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

    const rawRoles = (body as { roles?: unknown })?.roles;
    const roles = typeof rawRoles === "undefined" ? undefined : normalizeRoleList(rawRoles);

    if (typeof rawRoles !== "undefined" && (!roles || roles.length === 0)) {
      return json(auth.requestId, 400, { ok: false, error: "Validation error", code: "VALIDATION_ERROR" });
    }

    const ok = await updateUserById(params.id, {
      roles,
    });

    if (!ok) {
      return json(auth.requestId, 404, { ok: false, error: "Not found", code: "NOT_FOUND" });
    }

    return json(auth.requestId, 200, { ok: true, data: { updated: true } });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
