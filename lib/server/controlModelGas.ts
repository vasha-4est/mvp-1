import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import type { UserRecord } from "@/lib/server/controlModel";

const DEFAULT_TIMEOUT_MS = 12_000;

type GasUsersDirectoryResponse = {
  ok?: boolean;
  rows?: unknown;
  data?: {
    rows?: unknown;
  };
};

export class ControlModelUnavailableError extends Error {
  constructor(message = "Control model unavailable") {
    super(message);
    this.name = "ControlModelUnavailableError";
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizeGasUserRecord(input: unknown): UserRecord | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const row = input as Record<string, unknown>;
  const now = new Date().toISOString();
  const userId = asString(row.user_id).trim() || asString(row.id).trim();
  if (!userId) {
    return null;
  }

  const login = asString(row.login).trim() || asString(row.username).trim() || userId;

  return {
    user_id: userId,
    login,
    password_hash: asString(row.password_hash).trim(),
    temp_password: asString(row.temp_password),
    must_change_password: asBoolean(row.must_change_password, false),
    is_active: asBoolean(row.is_active, true),
    created_at: asString(row.created_at).trim() || now,
    updated_at: asString(row.updated_at).trim() || now,
    last_login_at: asString(row.last_login_at).trim() || null,
    notes: asString(row.notes),
    display_name: asString(row.display_name),
  };
}

export function isGasUsersDirectoryConfigured(): boolean {
  return !!(process.env.GAS_WEBAPP_URL && process.env.GAS_WEBAPP_URL.trim());
}

function parseRows(payload: GasUsersDirectoryResponse): UserRecord[] {
  const rowsRaw = Array.isArray(payload.rows)
    ? payload.rows
    : payload.data && Array.isArray(payload.data.rows)
      ? payload.data.rows
      : [];

  return rowsRaw.map((item) => normalizeGasUserRecord(item)).filter((item): item is UserRecord => item !== null);
}

export async function importUsersDirectoryFromGas(requestId: string): Promise<UserRecord[]> {
  const baseUrl = process.env.GAS_WEBAPP_URL;
  if (!baseUrl || !baseUrl.trim()) {
    return [];
  }

  const apiKey = process.env.GAS_API_KEY ?? "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const url = new URL("/api/control_model/users_directory", baseUrl.trim());
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        [REQUEST_ID_HEADER]: requestId,
        ...(apiKey ? { "x-gas-api-key": apiKey } : {}),
      },
      signal: controller.signal,
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      throw new ControlModelUnavailableError("Control model unavailable");
    }

    if (!response.ok) {
      throw new ControlModelUnavailableError("Control model unavailable");
    }

    const typed = payload as GasUsersDirectoryResponse;
    if (typed.ok === false) {
      throw new ControlModelUnavailableError("Control model unavailable");
    }

    return parseRows(typed);
  } catch {
    throw new ControlModelUnavailableError("Control model unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
