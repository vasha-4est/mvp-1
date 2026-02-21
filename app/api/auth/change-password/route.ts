import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER, getOrCreateRequestId } from "@/lib/obs/requestId";
import { hashPasswordScrypt } from "@/lib/server/auth/scrypt";
import { findUserById, isStorageError, updateUserById } from "@/lib/server/controlModel";
import { requireAuth } from "@/lib/server/guards";
import { writeUsersDirectoryHashes } from "@/lib/server/usersDirectory";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

export async function POST(request: Request) {
  const auth = requireAuth(request);
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

    const newPassword =
      typeof (body as { new_password?: unknown })?.new_password === "string"
        ? (body as { new_password: string }).new_password
        : typeof (body as { password?: unknown })?.password === "string"
          ? (body as { password: string }).password
          : "";

    if (newPassword.trim().length < 8) {
      return json(auth.requestId, 400, {
        ok: false,
        error: "Password must be at least 8 characters",
        code: "PASSWORD_TOO_SHORT",
      });
    }

    const currentUser = await findUserById(auth.user.user_id);
    if (!currentUser) {
      return json(auth.requestId, 404, { ok: false, code: "NOT_FOUND" });
    }

    const hashed = await hashPasswordScrypt(newPassword);

    if (process.env.GAS_WEBAPP_URL) {
      try {
        await writeUsersDirectoryHashes(auth.requestId, [
          { id: currentUser.id, password_hash: hashed, must_change_password: false },
        ]);
      } catch {
        return json(auth.requestId, 503, {
          ok: false,
          error: "Control model unavailable",
          code: "CONTROL_MODEL_UNAVAILABLE",
        });
      }
    } else {
      const updated = await updateUserById(currentUser.id, {
        passwordHash: hashed,
        mustChangePassword: false,
      });

      if (!updated) {
        return json(auth.requestId, 404, { ok: false, code: "NOT_FOUND" });
      }
    }

    return json(auth.requestId, 200, { ok: true });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
