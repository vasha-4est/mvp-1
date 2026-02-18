import { NextResponse } from "next/server";

import { isProductionAuthEnvironment, requireOwner } from "@/lib/auth";
import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import { generateTempPassword, hashPassword, isProbablyHash } from "@/lib/password";
import {
  ensureUsersDirectoryColumns,
  getUsersDirectoryRows,
  isStorageError,
  writeUsersDirectoryRows,
  type UserRecord,
} from "@/lib/server/controlModel";
import { ControlModelUnavailableError, importUsersDirectoryFromGas, isGasUsersDirectoryConfigured } from "@/lib/server/controlModelGas";

function json(requestId: string, status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: requestId } });
}

function isProvisioningEnabled(): boolean {
  if (process.env.INTERNAL_AUTH_PROVISIONING_ENABLED === "true") {
    return true;
  }

  return !isProductionAuthEnvironment();
}

function needsImportFromSheets(users: UserRecord[]): boolean {
  if (users.length === 0) {
    return true;
  }

  return users.some((user) => !user.user_id.trim() || !user.login.trim());
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
    let users = await getUsersDirectoryRows();
    let importedFromSheets = 0;

    if (needsImportFromSheets(users) && isGasUsersDirectoryConfigured()) {
      const imported = await importUsersDirectoryFromGas(auth.requestId);
      importedFromSheets = imported.length;

      if (imported.length > 0) {
        const byUserId = new Map(users.map((item) => [item.user_id, item]));
        for (const row of imported) {
          byUserId.set(row.user_id, {
            ...row,
            login: row.login.trim() || row.user_id,
          });
        }

        users = Array.from(byUserId.values());
      }
    }

    const now = new Date().toISOString();

    let processed = 0;
    let migratedLegacy = 0;
    let alreadyHashed = 0;
    let skippedInactive = 0;

    const items: Array<{ user_id: string; login: string; temp_password: string; must_change_password: boolean }> = [];

    for (const user of users) {
      user.login = user.login.trim() || user.user_id;

      if (!user.is_active || !user.login.trim()) {
        skippedInactive += 1;
        continue;
      }

      const hasHash = isProbablyHash(user.password_hash ?? "");
      if (hasHash && mode === "missing_only") {
        alreadyHashed += 1;
        continue;
      }

      const hasLegacyPlaintext = !!user.password_hash.trim() && !hasHash;
      const isMissing = !user.password_hash.trim();

      if (mode === "missing_only" && !hasLegacyPlaintext && !isMissing) {
        alreadyHashed += 1;
        continue;
      }

      let tempPassword = "";
      if (mode === "reset_all" || isMissing) {
        tempPassword = user.temp_password.trim() || generateTempPassword(user.login);
      } else if (hasLegacyPlaintext) {
        tempPassword = user.password_hash;
        migratedLegacy += 1;
      }

      const passwordHash = await hashPassword(tempPassword);

      user.password_hash = passwordHash;
      user.temp_password = tempPassword;
      user.must_change_password = true;
      user.created_at = user.created_at?.trim() ? user.created_at : now;
      user.updated_at = now;

      processed += 1;
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
      provisioned_count: processed,
      processed,
      importedFromSheets,
      migratedLegacy,
      alreadyHashed,
      skippedInactive,
      items,
    });
  } catch (error) {
    if (isStorageError(error) || error instanceof ControlModelUnavailableError) {
      return json(auth.requestId, 503, {
        ok: false,
        error: "Control model unavailable",
        code: "CONTROL_MODEL_UNAVAILABLE",
      });
    }

    return json(auth.requestId, 500, { ok: false, error: "Internal server error", code: "INTERNAL_ERROR" });
  }
}
