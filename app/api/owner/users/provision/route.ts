import { NextResponse } from "next/server";

import { isProductionAuthEnvironment, requireOwner } from "@/lib/auth";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { generateTempPassword, hashPassword } from "@/lib/password";
import {
  ensureUsersDirectoryColumns,
  getUsersDirectoryRows,
  isStorageError,
  writeUsersDirectoryRows,
} from "@/lib/server/controlModel";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function isProvisioningEnabled(): boolean {
  if (process.env.INTERNAL_AUTH_PROVISIONING_ENABLED === "true") {
    return true;
  }

  return !isProductionAuthEnvironment();
}

export async function POST(request: Request) {
  const auth = requireOwner(request);
  if (auth.ok === false) {
    return auth.response;
  }

  if (!isProvisioningEnabled()) {
    return json(auth.requestId, 403, { ok: false, code: "FORBIDDEN", error: "Provisioning disabled" });
  }

  try {
    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const rawMode = (body as { mode?: unknown })?.mode;
    const mode = rawMode === "reset_all" ? "reset_all" : rawMode === "missing_only" ? "missing_only" : "missing_only";

    await ensureUsersDirectoryColumns();
    const users = await getUsersDirectoryRows();
    const now = new Date().toISOString();

    const items: Array<{ user_id: string; login: string; temp_password: string; must_change_password: boolean }> = [];

    for (const user of users) {
      if (!user.is_active || !user.login.trim()) {
        continue;
      }

      const shouldProvision = mode === "reset_all" || !user.password_hash.trim();
      if (!shouldProvision) {
        continue;
      }

      const tempPassword = generateTempPassword(user.login);
      const passwordHash = await hashPassword(tempPassword);

      user.password_hash = passwordHash;
      user.temp_password = tempPassword;
      user.must_change_password = true;
      user.created_at = user.created_at?.trim() ? user.created_at : now;
      user.updated_at = now;

      items.push({
        user_id: user.user_id,
        login: user.login,
        temp_password: tempPassword,
        must_change_password: true,
      });
    }

    await writeUsersDirectoryRows(users);

    return json(auth.requestId, 200, {
      ok: true,
      provisioned_count: items.length,
      items,
    });
  } catch (error) {
    if (isStorageError(error)) {
      return json(auth.requestId, 500, { ok: false, error: "Storage error", code: "STORAGE_ERROR" });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
