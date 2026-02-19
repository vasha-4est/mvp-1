import { NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { isStorageError, setPasswordForUserByLogin } from "@/lib/server/controlModel";
import { hashPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const session = getSessionFromRequest(request);
  if (!session) {
    return json(requestId, 401, { ok: false, code: "UNAUTHORIZED", error: "Unauthorized" });
  }

  try {
    const body = (await request.json()) as { new_password?: string };
    const newPassword = typeof body.new_password === "string" ? body.new_password.trim() : "";

    if (newPassword.length < 8) {
      return json(requestId, 400, { ok: false, code: "VALIDATION_ERROR", error: "Password too short" });
    }

    const passwordHash = await hashPassword(newPassword, 12);
    const changed = await setPasswordForUserByLogin({
      login: session.username,
      password_hash: passwordHash,
      must_change_password: false,
      clear_temp_password: true,
      requestId,
    });

    if (!changed) {
      return json(requestId, 404, { ok: false, code: "NOT_FOUND", error: "User not found" });
    }

    return json(requestId, 200, { ok: true });
  } catch (error) {
    if (isStorageError(error)) {
      return json(requestId, 503, {
        ok: false,
        code: "CONTROL_MODEL_UNAVAILABLE",
        error: "Control model unavailable",
      });
    }

    return json(requestId, 500, { ok: false, code: "INTERNAL_ERROR", error: "Internal server error" });
  }
}
