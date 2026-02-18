import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { isStorageError, setPasswordResetById } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";
import { hashPassword } from "@/lib/server/password";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(12);
  return Array.from(bytes)
    .map((item) => alphabet[item % alphabet.length])
    .join("");
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  try {
    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword, 12);

    const ok = await setPasswordResetById(params.id, passwordHash);

    if (!ok) {
      return json(auth.requestId, 404, { ok: false, error: "Not found", code: "NOT_FOUND" });
    }

    return json(auth.requestId, 200, {
      ok: true,
      data: {
        user_id: params.id,
        temp_password: tempPassword,
      },
    });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
