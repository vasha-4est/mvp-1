import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { findUserByUsername, isStorageError, listUsers, updateUserById } from "@/lib/server/controlModel";
import { requireOwner } from "@/lib/server/guards";
import { hashPasswordScrypt } from "@/lib/server/auth/scrypt";
import { readUsersDirectoryFromGas, writeUsersDirectoryHashes } from "@/lib/server/usersDirectory";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function generateTempPassword(length = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

async function resolveUserById(id: string): Promise<{ id: string; username: string } | null> {
  if (process.env.GAS_WEBAPP_URL) {
    const source = await readUsersDirectoryFromGas(`owner-reset-${id}`);
    const row = source.users.find((u) => u.id.trim() === id.trim());
    if (row) {
      return { id: row.id.trim(), username: row.username.trim() };
    }
    return null;
  }

  const listed = await listUsers({ page: 1, pageSize: 1000 });
  const found = listed.users.find((u) => u.id === id);
  if (!found) {
    return null;
  }
  return { id: found.id, username: found.username };
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

    const provided = typeof (body as { new_password?: unknown })?.new_password === "string" ? (body as { new_password: string }).new_password : "";
    const newPassword = provided.trim() || generateTempPassword(20);

    const target = await resolveUserById(params.id);
    if (!target) {
      return json(auth.requestId, 404, { ok: false, code: "NOT_FOUND" });
    }

    const hashed = await hashPasswordScrypt(newPassword);

    if (process.env.GAS_WEBAPP_URL) {
      await writeUsersDirectoryHashes(auth.requestId, [{ id: target.id, password_hash: hashed }]);
    } else {
      const local = await findUserByUsername(target.username);
      if (!local) {
        return json(auth.requestId, 404, { ok: false, code: "NOT_FOUND" });
      }

      await updateUserById(local.id, { passwordHash: hashed });
    }

    return json(auth.requestId, 200, {
      ok: true,
      user: { id: target.id, username: target.username },
      ...(provided.trim() ? {} : { temp_password: newPassword }),
      changed: true,
      must_change_password: true,
    });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
