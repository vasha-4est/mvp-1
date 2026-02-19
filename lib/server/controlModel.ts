import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { callGas } from "@/lib/integrations/gasClient";

export const ALLOWED_ROLES = ["OWNER", "COO", "VIEWER"] as const;
export type AllowedRole = (typeof ALLOWED_ROLES)[number];

const REQUIRED_HEADERS = [
  "user_id",
  "login",
  "password_hash",
  "temp_password",
  "must_change_password",
  "is_active",
  "created_at",
  "updated_at",
  "last_login_at",
  "display_name",
  "notes",
] as const;

const DEFAULT_STORE_FILE = "/tmp/control_model.json";
const CONTROL_MODEL_READ_ACTION = "control_model.users_directory.read";
const CONTROL_MODEL_BULK_UPDATE_ACTION = "control_model.users_directory.bulk_update";

type SheetDebug = {
  tried: boolean;
  spreadsheet_id_present: boolean;
  users_directory_found: boolean;
  header_ok: boolean;
  rows_seen: number;
};

export type ControlModelStoreDiagnostics = {
  store_backend: "control_model" | "file";
  store_file_path?: string;
  store_init_error?: string;
  control_model: {
    gas_url_present: boolean;
    gas_key_present: boolean;
  };
  sheets: SheetDebug;
};

export type UserDirectoryRecord = {
  user_id: string;
  login: string;
  password_hash: string;
  temp_password: string;
  must_change_password: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string;
  display_name: string;
  notes: string;
  _rowIndex?: number;
  _raw?: Record<string, unknown>;
};

export type UserRecord = {
  id: string;
  username: string;
  password_hash: string;
  temp_password: string;
  must_change_password: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

export class StorageError extends Error {
  diagnostics?: ControlModelStoreDiagnostics;

  constructor(message = "Storage error", diagnostics?: ControlModelStoreDiagnostics) {
    super(message);
    this.name = "StorageError";
    this.diagnostics = diagnostics;
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

function boolFromUnknown(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n", ""].includes(normalized)) return false;
  return fallback;
}

function storePath(): string {
  const fromEnv = process.env.CONTROL_MODEL_STORE_FILE;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : DEFAULT_STORE_FILE;
}

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

function deriveLogin(userId: string): string {
  return userId.startsWith("user_") ? userId.slice(5) : userId;
}

function normalizeDirectoryRow(raw: Record<string, unknown>, rowIndex: number): UserDirectoryRecord {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[normalizeHeader(key)] = value;
  }

  const userId = String(normalized.user_id ?? "").trim();
  const loginRaw = String(normalized.login ?? "").trim();
  const login = loginRaw || deriveLogin(userId);
  const passwordHash = String(normalized.password_hash ?? "").trim();
  const tempPassword = String(normalized.temp_password ?? "").trim();
  const mustChangePassword =
    typeof normalized.must_change_password === "undefined"
      ? Boolean(tempPassword && !passwordHash)
      : boolFromUnknown(normalized.must_change_password, Boolean(tempPassword && !passwordHash));

  return {
    user_id: userId,
    login,
    password_hash: passwordHash,
    temp_password: tempPassword,
    must_change_password: mustChangePassword,
    is_active: boolFromUnknown(normalized.is_active, true),
    created_at: String(normalized.created_at ?? normalized.start_date ?? "").trim(),
    updated_at: String(normalized.updated_at ?? "").trim(),
    last_login_at: String(normalized.last_login_at ?? "").trim(),
    display_name: String(normalized.display_name ?? "").trim(),
    notes: String(normalized.notes ?? "").trim(),
    _rowIndex: rowIndex,
    _raw: raw,
  };
}

function isBcryptLike(hash: string): boolean {
  return hash.startsWith("$2a$") || hash.startsWith("$2b$");
}

function gasConfigured(): boolean {
  return Boolean(process.env.GAS_WEBAPP_URL && process.env.GAS_API_KEY);
}

function forceFileStore(): boolean {
  return String(process.env.FORCE_FILE_STORE ?? "").trim().toLowerCase() === "true";
}

function canUseFileFallback(): boolean {
  return forceFileStore() || !gasConfigured() || process.env.NODE_ENV === "test";
}

function diagnosticsBase(): Pick<ControlModelStoreDiagnostics, "control_model" | "sheets"> {
  return {
    control_model: {
      gas_url_present: Boolean(process.env.GAS_WEBAPP_URL),
      gas_key_present: Boolean(process.env.GAS_API_KEY),
    },
    sheets: {
      tried: false,
      spreadsheet_id_present: false,
      users_directory_found: false,
      header_ok: false,
      rows_seen: 0,
    },
  };
}

function fileDiagnostics(initError?: string): ControlModelStoreDiagnostics {
  return {
    store_backend: "file",
    store_file_path: storePath(),
    ...(initError ? { store_init_error: initError } : {}),
    ...diagnosticsBase(),
  };
}

function controlModelDiagnostics(patch: Partial<ControlModelStoreDiagnostics["sheets"]>, initError?: string): ControlModelStoreDiagnostics {
  return {
    store_backend: "control_model",
    ...(initError ? { store_init_error: initError } : {}),
    control_model: diagnosticsBase().control_model,
    sheets: {
      ...diagnosticsBase().sheets,
      tried: true,
      ...patch,
    },
  };
}

export function getControlModelStoreDiagnostics(initError?: string): ControlModelStoreDiagnostics {
  if (gasConfigured() && !forceFileStore()) {
    return controlModelDiagnostics({}, initError);
  }

  return fileDiagnostics(initError);
}

type FileModel = {
  users?: Array<Record<string, unknown>>;
  users_directory?: Array<Record<string, unknown>>;
};

async function readFileStoreRows(): Promise<UserDirectoryRecord[]> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });

  let raw: string;
  try {
    raw = await fs.readFile(storePath(), "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError?.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const parsed = JSON.parse(raw) as FileModel;
  const rows = Array.isArray(parsed.users_directory)
    ? parsed.users_directory
    : Array.isArray(parsed.users)
      ? parsed.users
      : [];

  return rows.map((row, index) => normalizeDirectoryRow(row, index + 2));
}

async function writeFileStoreRows(rows: UserDirectoryRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(storePath()), { recursive: true });
  const outRows = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const header of REQUIRED_HEADERS) {
      out[header] = row[header];
    }

    return out;
  });

  await fs.writeFile(storePath(), JSON.stringify({ users_directory: outRows }, null, 2), "utf8");
}

async function readUsersDirectoryViaGas(requestId: string): Promise<{ rows: UserDirectoryRecord[]; diagnostics: ControlModelStoreDiagnostics }> {
  const response = await callGas<{
    spreadsheet_id_present?: boolean;
    users_directory_found?: boolean;
    header_ok?: boolean;
    headers?: string[];
    rows?: Array<Record<string, unknown>>;
  }>(CONTROL_MODEL_READ_ACTION, {}, requestId);

  if (!response.ok || !response.data) {
    throw new StorageError(
      "Control model unavailable",
      controlModelDiagnostics({}, response.error ?? "read_failed")
    );
  }

  const headers = Array.isArray(response.data.headers) ? response.data.headers.map((item) => normalizeHeader(String(item))) : [];
  const required = REQUIRED_HEADERS.every((header) => headers.includes(header));
  const rows = (response.data.rows ?? []).map((row, index) => normalizeDirectoryRow(row, index + 2));

  return {
    rows,
    diagnostics: controlModelDiagnostics({
      spreadsheet_id_present: Boolean(response.data.spreadsheet_id_present),
      users_directory_found: Boolean(response.data.users_directory_found),
      header_ok: Boolean(response.data.header_ok) && required,
      rows_seen: rows.length,
    }),
  };
}

async function loadUsersDirectory(requestId: string): Promise<{ rows: UserDirectoryRecord[]; diagnostics: ControlModelStoreDiagnostics }> {
  if (gasConfigured() && !forceFileStore()) {
    return readUsersDirectoryViaGas(requestId);
  }

  if (!canUseFileFallback()) {
    throw new StorageError("Control model unavailable", controlModelDiagnostics({}, "gas_missing"));
  }

  const rows = await readFileStoreRows();
  return {
    rows,
    diagnostics: { ...fileDiagnostics(), sheets: { ...fileDiagnostics().sheets, rows_seen: rows.length } },
  };
}

export async function listUsers(params: {
  page: number;
  pageSize: number;
  username?: string;
  requestId?: string;
}): Promise<{ total: number; users: Array<{ id: string; username: string; is_active: boolean; must_change_password: boolean; roles: AllowedRole[] }>; diagnostics: ControlModelStoreDiagnostics }> {
  const loaded = await loadUsersDirectory(params.requestId ?? randomUUID());
  const filterValue = params.username?.trim().toLowerCase() ?? "";

  const filtered = loaded.rows.filter((user) => {
    if (!filterValue) return true;
    return user.login.toLowerCase().includes(filterValue);
  });

  const start = (params.page - 1) * params.pageSize;
  const users = filtered.slice(start, start + params.pageSize).map((user) => ({
    id: user.user_id,
    username: user.login,
    is_active: user.is_active,
    must_change_password: user.must_change_password,
    roles: ["VIEWER"] as AllowedRole[],
  }));

  return { total: filtered.length, users, diagnostics: loaded.diagnostics };
}

export async function findUserByUsername(username: string, requestId?: string): Promise<{ user: UserRecord | null; diagnostics: ControlModelStoreDiagnostics }> {
  const loaded = await loadUsersDirectory(requestId ?? randomUUID());
  const lookup = username.trim().toLowerCase();
  const found = loaded.rows.find((item) => item.login.trim().toLowerCase() === lookup);

  if (!found) return { user: null, diagnostics: loaded.diagnostics };

  return {
    user: {
      id: found.user_id,
      username: found.login,
      password_hash: found.password_hash,
      temp_password: found.temp_password,
      must_change_password: found.must_change_password,
      is_active: found.is_active,
      created_at: found.created_at,
      updated_at: found.updated_at,
      last_login_at: found.last_login_at || null,
    },
    diagnostics: loaded.diagnostics,
  };
}

export async function getRolesForUser(_userId: string): Promise<AllowedRole[]> {
  return ["OWNER"];
}

export async function touchLastLoginAt(userId: string, atIso: string, requestId?: string): Promise<void> {
  await updateUsersById(
    [{ user_id: userId, patch: { last_login_at: atIso, updated_at: atIso } }],
    requestId ?? randomUUID()
  );
}

export async function setPasswordForUserByLogin(params: {
  login: string;
  password_hash: string;
  must_change_password: boolean;
  clear_temp_password: boolean;
  requestId?: string;
}): Promise<boolean> {
  const loaded = await loadUsersDirectory(params.requestId ?? randomUUID());
  const target = loaded.rows.find((row) => row.login.toLowerCase() === params.login.trim().toLowerCase());
  if (!target) return false;

  const now = new Date().toISOString();
  await updateUsersById(
    [
      {
        user_id: target.user_id,
        patch: {
          password_hash: params.password_hash,
          must_change_password: params.must_change_password,
          temp_password: params.clear_temp_password ? "" : target.temp_password,
          last_login_at: now,
          updated_at: now,
        },
      },
    ],
    params.requestId ?? randomUUID()
  );

  return true;
}

async function updateUsersById(
  updates: Array<{ user_id: string; patch: Partial<UserDirectoryRecord> }>,
  requestId: string
): Promise<void> {
  if (gasConfigured() && !forceFileStore()) {
    const response = await callGas(
      CONTROL_MODEL_BULK_UPDATE_ACTION,
      {
        updates: updates.map((item) => ({ user_id: item.user_id, patch: item.patch })),
      },
      requestId
    );

    if (!response.ok) {
      throw new StorageError("Control model unavailable", controlModelDiagnostics({}, response.error ?? "write_failed"));
    }

    return;
  }

  if (!canUseFileFallback()) {
    throw new StorageError("Control model unavailable", controlModelDiagnostics({}, "write_not_allowed"));
  }

  const rows = await readFileStoreRows();
  const byId = new Map(rows.map((row) => [row.user_id, row]));
  for (const change of updates) {
    const current = byId.get(change.user_id);
    if (!current) continue;
    Object.assign(current, change.patch);
  }

  await writeFileStoreRows(rows);
}

let provisioningInFlight = false;

export async function provisionUsers(requestId?: string): Promise<{
  provisioned_count: number;
  processed: number;
  alreadyHashed: number;
  skippedInactive: number;
  skippedNoPassword: number;
  diagnostics: ControlModelStoreDiagnostics;
}> {
  if (provisioningInFlight) {
    throw new StorageError("Provision already running", getControlModelStoreDiagnostics("single_flight"));
  }

  provisioningInFlight = true;
  try {
    const loaded = await loadUsersDirectory(requestId ?? randomUUID());
    let provisioned = 0;
    let alreadyHashed = 0;
    let skippedInactive = 0;
    let skippedNoPassword = 0;
    const now = new Date().toISOString();
    const updates: Array<{ user_id: string; patch: Partial<UserDirectoryRecord> }> = [];

    for (const user of loaded.rows) {
      if (!user.is_active) {
        skippedInactive += 1;
        continue;
      }

      if (isBcryptLike(user.password_hash)) {
        alreadyHashed += 1;
        continue;
      }

      if (!user.temp_password) {
        skippedNoPassword += 1;
        continue;
      }

      updates.push({
        user_id: user.user_id,
        patch: {
          password_hash: hashAsBcryptLike(user.temp_password, 12),
          must_change_password: true,
          temp_password: "",
          updated_at: now,
        },
      });
      provisioned += 1;
    }

    if (updates.length > 0) {
      await updateUsersById(updates, requestId ?? randomUUID());
    }

    return {
      provisioned_count: provisioned,
      processed: loaded.rows.length,
      alreadyHashed,
      skippedInactive,
      skippedNoPassword,
      diagnostics: loaded.diagnostics,
    };
  } finally {
    provisioningInFlight = false;
  }
}

export function hashAsBcryptLike(password: string, cost = 12): string {
  const salt = randomBytes(16).toString("hex");
  const N = 2 ** Math.max(10, cost);
  const digest = scryptSync(password, salt, 64, { N }).toString("hex");
  return `$2b$${Math.max(10, cost)}$${salt}$${digest}`;
}

export async function verifyBcryptLike(password: string, hash: string): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 5 || (parts[1] !== "2a" && parts[1] !== "2b")) {
    return false;
  }

  const cost = Number(parts[2]);
  const salt = parts[3];
  const digest = parts[4];
  if (!Number.isFinite(cost) || !salt || !digest) return false;

  const calculated = scryptSync(password, salt, 64, { N: 2 ** Math.max(10, cost) });
  const provided = Buffer.from(digest, "hex");
  if (calculated.length !== provided.length) return false;
  return timingSafeEqual(calculated, provided);
}

export async function createUser(): Promise<{ user_id: string }> {
  throw new StorageError("Not implemented for users_directory adapter", getControlModelStoreDiagnostics("create_not_supported"));
}

export async function updateUserById(userId: string, updates: { passwordHash?: string; roles?: AllowedRole[] }): Promise<boolean> {
  if (!updates.passwordHash) {
    return true;
  }

  await updateUsersById(
    [
      {
        user_id: userId,
        patch: {
          password_hash: updates.passwordHash,
          updated_at: new Date().toISOString(),
        },
      },
    ],
    randomUUID()
  );

  return true;
}

export async function deactivateUser(userId: string): Promise<boolean> {
  await updateUsersById(
    [
      {
        user_id: userId,
        patch: {
          is_active: false,
          updated_at: new Date().toISOString(),
        },
      },
    ],
    randomUUID()
  );

  return true;
}

export function normalizeRoleList(roles: unknown): AllowedRole[] | null {
  if (!Array.isArray(roles)) return null;
  const normalized = roles
    .map((role) => (typeof role === "string" ? role.trim().toUpperCase() : ""))
    .filter((role): role is AllowedRole => ALLOWED_ROLES.includes(role as AllowedRole));

  return normalized.filter((role, index, arr) => arr.indexOf(role) === index);
}
