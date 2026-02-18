import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { isStorageError, updateUserById } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";
import { hashPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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
      typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";

    if (!password.trim()) {
      return json(auth.requestId, 400, { ok: false, error: "Validation error", code: "VALIDATION_ERROR" });
    }

    const passwordHash = await hashPassword(password, 12);
    const ok = await updateUserById(params.id, {
      passwordHash,
    });

    if (!ok) {
      return json(auth.requestId, 404, { ok: false, error: "Not found", code: "NOT_FOUND" });
    }

    return json(auth.requestId, 200, { ok: true, data: { user_id: params.id } });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
