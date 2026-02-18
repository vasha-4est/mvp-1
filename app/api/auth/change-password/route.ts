import { NextResponse } from "next/server";

import { getSessionFromRequest, requireAuth } from "@/lib/auth";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { hashPassword } from "@/lib/password";
import { findUserById, isStorageError, updateUsersDirectoryRowsByUserId } from "@/lib/server/controlModel";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function isValidPassword(value: string): boolean {
  if (value.length < 10) {
    return false;
  }

  const hasLetter = /[a-zA-Z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  return hasLetter && hasDigit;
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
  if (auth.ok === false) {
    return auth.response;
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return json(auth.requestId, 401, { ok: false, code: "UNAUTHORIZED", error: "Unauthorized" });
  }

  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const newPassword =
      typeof (body as { new_password?: unknown })?.new_password === "string"
        ? (body as { new_password: string }).new_password
        : "";

    if (!isValidPassword(newPassword)) {
      return json(auth.requestId, 400, {
        ok: false,
        code: "VALIDATION_ERROR",
        error: "Password must be at least 10 chars and include letters and digits",
      });
    }

    const currentUser = await findUserById(session.user_id);
    if (!currentUser) {
      return json(auth.requestId, 401, { ok: false, code: "UNAUTHORIZED", error: "Unauthorized" });
    }

    const passwordHash = await hashPassword(newPassword);
    await updateUsersDirectoryRowsByUserId([
      {
        user_id: session.user_id,
        update: {
          password_hash: passwordHash,
          must_change_password: false,
          temp_password: "",
          updated_at: new Date().toISOString(),
        },
      },
    ]);

    return json(auth.requestId, 200, { ok: true });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
