import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { deactivateUser, isStorageError, normalizeRoleList, updateUserById } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";
import { hashPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
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

    const password =
      typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : undefined;
    const rawRoles = (body as { roles?: unknown })?.roles;
    const roles = typeof rawRoles === "undefined" ? undefined : normalizeRoleList(rawRoles);

    if (typeof rawRoles !== "undefined" && (!roles || roles.length === 0)) {
      return json(auth.requestId, 400, { ok: false, code: "VALIDATION_ERROR" });
    }

    const passwordHash = password ? await hashPassword(password, 12) : undefined;

    const ok = await updateUserById(params.id, {
      passwordHash,
      roles,
    });

    if (!ok) {
      return json(auth.requestId, 404, { ok: false, code: "NOT_FOUND" });
    }

    return json(auth.requestId, 200, { ok: true });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const ok = await deactivateUser(params.id);
    if (!ok) {
      return json(auth.requestId, 404, { ok: false, code: "NOT_FOUND" });
    }

    return json(auth.requestId, 200, { ok: true });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
