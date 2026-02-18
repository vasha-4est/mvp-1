import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { requireOwner } from "@/lib/server/guards";
import { deactivateUser, normalizeRoleList, updateUserById } from "@/lib/server/controlModel";
import { hashPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : undefined;
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
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  const ok = await deactivateUser(params.id);
  if (!ok) {
    return json(auth.requestId, 404, { ok: false, code: "NOT_FOUND" });
  }

  return json(auth.requestId, 200, { ok: true });
}
