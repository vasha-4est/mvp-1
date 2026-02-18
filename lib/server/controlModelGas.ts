import { REQUEST_ID_HEADER } from "@/lib/obs/requestId";
import type { UserRecord } from "@/lib/server/controlModel";

const DEFAULT_TIMEOUT_MS = 12_000;
const EXPECTED_COLUMNS = [
  "user_id",
  "login",
  "password_hash",
  "temp_password",
  "must_change_password",
  "is_active",
  "created_at",
  "updated_at",
  "last_login_at",
  "notes",
  "display_name",
] as const;

type GasUsersDirectoryResponse = {
  ok?: boolean;
  rows?: unknown;
  headers?: unknown;
  sheet_names?: unknown;
  sheets?: unknown;
  users_directory_found?: unknown;
  data?: {
    rows?: unknown;
    headers?: unknown;
    sheet_names?: unknown;
    sheets?: unknown;
    users_directory_found?: unknown;
  };
};

export type GasUsersDirectoryDebug = {
  source: "gas" | "none";
  availableSheetNames: string[];
  usersDirectoryFound: boolean;
  headerRow: string[];
  previewRows: Array<Record<string, unknown>>;
  detectedColumnIndexes: Record<string, number>;
};

export class ControlModelUnavailableError extends Error {
  code = "CONTROL_MODEL_UNAVAILABLE";

  constructor(message = "Control model unavailable") {
    super(message);
    this.name = "ControlModelUnavailableError";
  }
}

export class UsersDirectoryNotFoundError extends Error {
  code = "USERS_DIRECTORY_NOT_FOUND";

  constructor(message = "users_directory sheet not found") {
    super(message);
    this.name = "UsersDirectoryNotFoundError";
  }
}

export class UsersDirectoryInvalidError extends Error {
  code = "USERS_DIRECTORY_INVALID";

  constructor(message = "users_directory header invalid") {
    super(message);
    this.name = "UsersDirectoryInvalidError";
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

function looksSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("pass") || lower.includes("secret") || lower.includes("token");
}

function redactRecord(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (key === "password_hash" || key === "temp_password" || looksSensitiveKey(key)) {
      out[key] = "***";
      continue;
    }

    out[key] = value;
  }

  return out;
}

function normalizeGasUserRecord(input: Record<string, unknown>): UserRecord | null {
  const now = new Date().toISOString();
  const userId = asString(input.user_id).trim() || asString(input.id).trim();
  if (!userId) {
    return null;
  }

  const login = asString(input.login).trim() || asString(input.username).trim() || userId;

  return {
    user_id: userId,
    login,
    password_hash: asString(input.password_hash).trim(),
    temp_password: asString(input.temp_password),
    must_change_password: asBoolean(input.must_change_password, false),
    is_active: asBoolean(input.is_active, true),
    created_at: asString(input.created_at).trim() || now,
    updated_at: asString(input.updated_at).trim() || now,
    last_login_at: asString(input.last_login_at).trim() || null,
    notes: asString(input.notes),
    display_name: asString(input.display_name),
  };
}

export function isGasUsersDirectoryConfigured(): boolean {
  return !!(process.env.GAS_WEBAPP_URL && process.env.GAS_WEBAPP_URL.trim());
}

function toObjectRows(rowsRaw: unknown, header: string[]): Array<Record<string, unknown>> {
  if (!Array.isArray(rowsRaw)) {
    return [];
  }

  if (rowsRaw.length === 0) {
    return [];
  }

  if (typeof rowsRaw[0] === "object" && rowsRaw[0] !== null && !Array.isArray(rowsRaw[0])) {
    return rowsRaw.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item));
  }

  if (!header.length) {
    return [];
  }

  return rowsRaw
    .filter((item): item is unknown[] => Array.isArray(item))
    .map((row) => {
      const mapped: Record<string, unknown> = {};
      for (let i = 0; i < header.length; i += 1) {
        mapped[header[i]] = row[i];
      }
      return mapped;
    });
}

function extractPayloadParts(payload: GasUsersDirectoryResponse) {
  const rowsRaw = Array.isArray(payload.rows)
    ? payload.rows
    : payload.data && Array.isArray(payload.data.rows)
      ? payload.data.rows
      : [];

  const headerRaw = Array.isArray(payload.headers)
    ? payload.headers
    : payload.data && Array.isArray(payload.data.headers)
      ? payload.data.headers
      : [];

  const sheetNamesRaw = Array.isArray(payload.sheet_names)
    ? payload.sheet_names
    : Array.isArray(payload.sheets)
      ? payload.sheets
      : payload.data && Array.isArray(payload.data.sheet_names)
        ? payload.data.sheet_names
        : payload.data && Array.isArray(payload.data.sheets)
          ? payload.data.sheets
          : [];

  const usersDirectoryFoundRaw =
    typeof payload.users_directory_found === "boolean"
      ? payload.users_directory_found
      : payload.data && typeof payload.data.users_directory_found === "boolean"
        ? payload.data.users_directory_found
        : null;

  const headerRow = headerRaw.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim());
  const sheetNames = sheetNamesRaw
    .filter((item): item is string => typeof item === "string" && !!item.trim())
    .map((item) => item.trim());

  const rows = toObjectRows(rowsRaw, headerRow);

  return {
    rows,
    headerRow,
    sheetNames,
    usersDirectoryFound:
      typeof usersDirectoryFoundRaw === "boolean"
        ? usersDirectoryFoundRaw
        : sheetNames.length > 0
          ? sheetNames.includes("users_directory")
          : rows.length > 0,
  };
}

function buildColumnIndexes(headerRow: string[]): Record<string, number> {
  const lowerHeader = headerRow.map((item) => item.toLowerCase());
  return EXPECTED_COLUMNS.reduce<Record<string, number>>((acc, col) => {
    acc[col] = lowerHeader.indexOf(col.toLowerCase());
    return acc;
  }, {});
}

async function fetchGasUsersDirectoryPayload(requestId: string): Promise<GasUsersDirectoryResponse> {
  const baseUrl = process.env.GAS_WEBAPP_URL;
  if (!baseUrl || !baseUrl.trim()) {
    throw new ControlModelUnavailableError("Control model unavailable");
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

    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new ControlModelUnavailableError("Control model unavailable");
    }

    const typed = payload as GasUsersDirectoryResponse;
    if (typed.ok === false) {
      throw new ControlModelUnavailableError("Control model unavailable");
    }

    return typed;
  } catch (error) {
    if (error instanceof UsersDirectoryInvalidError || error instanceof UsersDirectoryNotFoundError) {
      throw error;
    }

    throw new ControlModelUnavailableError("Control model unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectUsersDirectoryFromGas(requestId: string): Promise<GasUsersDirectoryDebug> {
  if (!isGasUsersDirectoryConfigured()) {
    return {
      source: "none",
      availableSheetNames: [],
      usersDirectoryFound: false,
      headerRow: [],
      previewRows: [],
      detectedColumnIndexes: {},
    };
  }

  const payload = await fetchGasUsersDirectoryPayload(requestId);
  const parsed = extractPayloadParts(payload);

  if (!parsed.usersDirectoryFound) {
    throw new UsersDirectoryNotFoundError("users_directory sheet not found");
  }

  if (parsed.headerRow.length === 0 && parsed.rows.length > 0) {
    const derived = Object.keys(parsed.rows[0]);
    if (derived.length === 0) {
      throw new UsersDirectoryInvalidError("users_directory header invalid");
    }
    parsed.headerRow.push(...derived);
  }

  const detectedColumnIndexes = buildColumnIndexes(parsed.headerRow);

  return {
    source: "gas",
    availableSheetNames: parsed.sheetNames,
    usersDirectoryFound: parsed.usersDirectoryFound,
    headerRow: parsed.headerRow,
    previewRows: parsed.rows.slice(0, 3).map((item) => redactRecord(item)),
    detectedColumnIndexes,
  };
}

export async function importUsersDirectoryFromGas(requestId: string): Promise<UserRecord[]> {
  const inspection = await inspectUsersDirectoryFromGas(requestId);
  if (inspection.source === "none") {
    return [];
  }

  if (!inspection.usersDirectoryFound) {
    throw new UsersDirectoryNotFoundError("users_directory sheet not found");
  }

  if (inspection.headerRow.length === 0) {
    throw new UsersDirectoryInvalidError("users_directory header invalid");
  }

  const payload = await fetchGasUsersDirectoryPayload(requestId);
  const parsed = extractPayloadParts(payload);
  const rows = parsed.rows.map((item) => normalizeGasUserRecord(item)).filter((item): item is UserRecord => item !== null);
  return rows;
}
