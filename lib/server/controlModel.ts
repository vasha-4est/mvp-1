import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import { hashPassword } from "@/lib/server/password";

export const ALLOWED_ROLES = ["OWNER", "COO", "VIEWER"] as const;
export type AllowedRole = (typeof ALLOWED_ROLES)[number];

export type UserRecord = {
  id: string;
  username: string;
  password_hash: string;
  password?: string;
  is_active: boolean;
  must_change_password?: boolean;
  roles?: string;
  display_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

export type UserRoleRecord = {
  id: string;
  user_id: string;
  role: AllowedRole;
  created_at: string;
};

type ControlModelData = {
  users: UserRecord[];
  user_roles: UserRoleRecord[];
};

type LegacyControlModelData = {
  users_directory?: unknown[];
  users_roles?: unknown[];
  users?: unknown[];
  user_roles?: unknown[];
};

const DEFAULT_STORE_FILE = "/tmp/control_model.json";

export type ControlModelStoreDiagnostics = {
  store_backend: "file";
  store_file_path: string;
  store_init_error?: string;
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

function storePath(): string {
  const fromEnv = process.env.CONTROL_MODEL_STORE_FILE;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : DEFAULT_STORE_FILE;
}

export function getControlModelStoreDiagnostics(initError?: string): ControlModelStoreDiagnostics {
  return {
    store_backend: "file",
    store_file_path: storePath(),
    ...(initError ? { store_init_error: initError } : {}),
  };
}

function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  const message = error instanceof Error && error.message ? error.message : "Storage error";
  return new StorageError("Storage error", getControlModelStoreDiagnostics(message));
}

async function withStorageGuard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toStorageError(error);
  }
}

function emptyStore(): ControlModelData {
  return {
    users: [],
    user_roles: [],
  };
}

function normalizeHeaderKey(value: string): string {
  return value
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "_");
}

function getFieldValue(row: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = row[alias];
    if (value === null || value === undefined) {
      continue;
    }

    const asString = String(value).trim();
    if (asString) {
      return asString;
    }
  }

  return "";
}

function toBoolean(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeRow(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }

  const normalized: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(input)) {
    const key = normalizeHeaderKey(rawKey);
    if (!key) {
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function normalizeUsers(rows: unknown[]): UserRecord[] {
  const now = new Date().toISOString();

  return rows
    .map(normalizeRow)
    .map((row) => {
      const id = getFieldValue(row, ["id", "user_id"]);
      const username = getFieldValue(row, ["username", "login"]);
      const passwordHash = getFieldValue(row, ["password_hash"]);
      const password = getFieldValue(row, ["password"]);
      const isActive = toBoolean(getFieldValue(row, ["is_active"]), true);
      const mustChangePassword = toBoolean(getFieldValue(row, ["must_change_password"]), false);
      const createdAt = getFieldValue(row, ["created_at"]) || now;
      const updatedAt = getFieldValue(row, ["updated_at"]) || createdAt;
      const lastLoginAt = getFieldValue(row, ["last_login_at"]);

      return {
        id,
        username,
        password_hash: passwordHash,
        ...(password ? { password } : {}),
        is_active: isActive,
        must_change_password: mustChangePassword,
        roles: getFieldValue(row, ["roles", "role"]),
        display_name: getFieldValue(row, ["display_name"]),
        notes: getFieldValue(row, ["notes"]),
        created_at: createdAt,
        updated_at: updatedAt,
        last_login_at: lastLoginAt || null,
      } satisfies UserRecord;
    })
    .filter((user) => Boolean(user.id && user.username));
}

function normalizeUserRoles(rows: unknown[], users: UserRecord[]): UserRoleRecord[] {
  const now = new Date().toISOString();
  const fromTable = rows
    .map(normalizeRow)
    .map((row) => ({
      id: getFieldValue(row, ["id"]) || randomUUID(),
      user_id: getFieldValue(row, ["user_id", "id"]),
      role: normalizeRole(getFieldValue(row, ["role"])) ?? null,
      created_at: getFieldValue(row, ["created_at"]) || now,
    }))
    .filter((item): item is UserRoleRecord => Boolean(item.user_id && item.role));

  if (fromTable.length > 0) {
    return fromTable;
  }

  return users.flatMap((user) => {
    const rolesRaw = user.roles ?? "";
    const parsedRoles = rolesRaw
      .split(",")
      .map((role) => normalizeRole(role))
      .filter((role): role is AllowedRole => role !== null);

    const uniqueRoles = parsedRoles.filter((role, index, arr) => arr.indexOf(role) === index);
    return uniqueRoles.map((role) => ({
      id: randomUUID(),
      user_id: user.id,
      role,
      created_at: now,
    }));
  });
}

function normalizeStoreShape(parsed: unknown): ControlModelData {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return emptyStore();
  }

  const typed = parsed as LegacyControlModelData;
  const sourceUsers = Array.isArray(typed.users)
    ? typed.users
    : Array.isArray(typed.users_directory)
      ? typed.users_directory
      : [];
  const users = normalizeUsers(sourceUsers);

  const sourceUserRoles = Array.isArray(typed.user_roles)
    ? typed.user_roles
    : Array.isArray(typed.users_roles)
      ? typed.users_roles
      : [];
  const userRoles = normalizeUserRoles(sourceUserRoles, users);

  return {
    users,
    user_roles: userRoles,
  };
}

export async function getUsersDirectoryHealthDebug(): Promise<{
  headers_seen: string[];
  missing_required: string[];
  header_ok: boolean;
  header_row_values?: Record<string, unknown>;
}> {
  await ensureStoreDirectory();

  let firstRawRow: Record<string, unknown> | null = null;
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as LegacyControlModelData;
    const sourceUsers = Array.isArray(parsed.users)
      ? parsed.users
      : Array.isArray(parsed.users_directory)
        ? parsed.users_directory
        : [];

    if (sourceUsers.length > 0) {
      firstRawRow = normalizeRow(sourceUsers[0]);
    }
  } catch {
    firstRawRow = null;
  }

  const headersSeen = firstRawRow ? Object.keys(firstRawRow) : [];

  const hasId = headersSeen.includes("id") || headersSeen.includes("user_id");
  const hasUsername = headersSeen.includes("username") || headersSeen.includes("login");
  const hasCredential = headersSeen.includes("password") || headersSeen.includes("password_hash");
  const headerOk = hasId && hasUsername && hasCredential;

  const missingRequired: string[] = [];
  if (!hasId) {
    missingRequired.push("id|user_id");
  }
  if (!hasUsername) {
    missingRequired.push("username|login");
  }
  if (!hasCredential) {
    missingRequired.push("password|password_hash");
  }

  return {
    headers_seen: headersSeen,
    missing_required: missingRequired,
    header_ok: headerOk,
    ...(firstRawRow ? { header_row_values: firstRawRow } : {}),
  };
}

async function ensureStoreDirectory(): Promise<void> {
  await withStorageGuard(async () => {
    await fs.mkdir(path.dirname(storePath()), { recursive: true });
  });
}

async function readStore(): Promise<ControlModelData> {
  await ensureStoreDirectory();

  return withStorageGuard(async () => {
    const filePath = storePath();

    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") {
        return emptyStore();
      }

      throw error;
    }

    try {
      return normalizeStoreShape(JSON.parse(raw));
    } catch {
      throw new StorageError("Control model store is corrupted", getControlModelStoreDiagnostics("corrupted_json"));
    }
  });
}

async function writeStore(data: ControlModelData): Promise<void> {
  await ensureStoreDirectory();

  await withStorageGuard(async () => {
    await fs.writeFile(storePath(), JSON.stringify(data, null, 2), "utf8");
  });
}

function normalizeRole(role: string): AllowedRole | null {
  const value = role.trim().toUpperCase();
  if (ALLOWED_ROLES.includes(value as AllowedRole)) {
    return value as AllowedRole;
  }

  return null;
}

export function normalizeRoleList(roles: unknown): AllowedRole[] | null {
  if (!Array.isArray(roles)) {
    return null;
  }

  const normalized = roles
    .map((role) => (typeof role === "string" ? normalizeRole(role) : null))
    .filter((role): role is AllowedRole => role !== null);

  return normalized.filter((role, index, arr) => arr.indexOf(role) === index);
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const lookup = username.trim().toLowerCase();
  const store = await readStore();

  const user = store.users.find((item) => item.username.trim().toLowerCase() === lookup);
  return user ?? null;
}

export async function getRolesForUser(userId: string): Promise<AllowedRole[]> {
  const store = await readStore();
  return store.user_roles
    .filter((item) => item.user_id === userId)
    .map((item) => item.role)
    .filter((role, index, arr) => arr.indexOf(role) === index);
}

export async function touchLastLoginAt(userId: string, atIso: string): Promise<void> {
  const store = await readStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user) {
    return;
  }

  user.last_login_at = atIso;
  user.updated_at = atIso;
  await writeStore(store);
}

export async function createUser(params: {
  username: string;
  passwordHash: string;
  roles: AllowedRole[];
}): Promise<{ user_id: string }> {
  const store = await readStore();
  const now = new Date().toISOString();

  const userId = randomUUID();

  const user: UserRecord = {
    id: userId,
    username: params.username.trim(),
    password_hash: params.passwordHash,
    is_active: true,
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };

  store.users.push(user);
  for (const role of params.roles) {
    store.user_roles.push({
      id: randomUUID(),
      user_id: userId,
      role,
      created_at: now,
    });
  }

  await writeStore(store);
  return { user_id: userId };
}

export async function updateUserById(
  userId: string,
  updates: {
    passwordHash?: string;
    roles?: AllowedRole[];
  }
): Promise<boolean> {
  const store = await readStore();
  const user = store.users.find((item) => item.id === userId);

  if (!user) {
    return false;
  }

  const now = new Date().toISOString();

  if (typeof updates.passwordHash === "string" && updates.passwordHash.trim()) {
    user.password_hash = updates.passwordHash;
  }

  if (updates.roles) {
    store.user_roles = store.user_roles.filter((item) => item.user_id !== userId);

    for (const role of updates.roles) {
      store.user_roles.push({
        id: randomUUID(),
        user_id: userId,
        role,
        created_at: now,
      });
    }
  }

  user.updated_at = now;
  await writeStore(store);
  return true;
}

export async function listUsers(params: {
  page: number;
  pageSize: number;
  username?: string;
}): Promise<{ total: number; users: Array<{ id: string; username: string; is_active: boolean; roles: AllowedRole[] }> }> {
  const store = await readStore();
  const filterValue = params.username?.trim().toLowerCase() ?? "";

  const filtered = store.users.filter((user) => {
    if (!filterValue) {
      return true;
    }

    return user.username.toLowerCase().includes(filterValue);
  });

  const start = (params.page - 1) * params.pageSize;
  const end = start + params.pageSize;

  const users = filtered.slice(start, end).map((user) => ({
    id: user.id,
    username: user.username,
    is_active: user.is_active,
    roles: store.user_roles
      .filter((item) => item.user_id === user.id)
      .map((item) => item.role)
      .filter((role, index, arr) => arr.indexOf(role) === index),
  }));

  return {
    total: filtered.length,
    users,
  };
}


function isPasswordHash(value: string): boolean {
  return value.startsWith("scrypt$");
}

export async function provisionUsers(): Promise<{
  provisioned_count: number;
  processed: number;
  migratedLegacy: number;
  alreadyHashed: number;
  skippedInactive: number;
  skippedNoPassword: number;
  items: Array<{ id: string; username: string; status: "already_hashed" | "skipped_inactive" | "legacy_pending" | "provisioned" | "skipped_no_password" }>;
}> {
  const store = await readStore();
  const items: Array<{ id: string; username: string; status: "already_hashed" | "skipped_inactive" | "legacy_pending" | "provisioned" | "skipped_no_password" }> = [];
  let migratedLegacy = 0;
  let alreadyHashed = 0;
  let skippedInactive = 0;
  let skippedNoPassword = 0;
  let changed = false;

  for (const user of store.users) {
    if (!user.is_active) {
      skippedInactive += 1;
      items.push({ id: user.id, username: user.username, status: "skipped_inactive" });
      continue;
    }

    if (isPasswordHash(user.password_hash)) {
      alreadyHashed += 1;
      items.push({ id: user.id, username: user.username, status: "already_hashed" });
      continue;
    }

    const plainPassword = user.password?.trim() ?? "";
    if (plainPassword) {
      user.password_hash = await hashPassword(plainPassword, 12);
      delete user.password;
      user.updated_at = new Date().toISOString();
      migratedLegacy += 1;
      changed = true;
      items.push({ id: user.id, username: user.username, status: "provisioned" });
      continue;
    }

    if (user.password_hash.trim()) {
      items.push({ id: user.id, username: user.username, status: "legacy_pending" });
      continue;
    }

    skippedNoPassword += 1;
    items.push({ id: user.id, username: user.username, status: "skipped_no_password" });
    continue;
  }

  if (changed) {
    await writeStore(store);
  }

  return {
    provisioned_count: migratedLegacy,
    processed: store.users.length,
    migratedLegacy,
    alreadyHashed,
    skippedInactive,
    skippedNoPassword,
    items,
  };
}

export async function deactivateUser(userId: string): Promise<boolean> {
  const store = await readStore();
  const user = store.users.find((item) => item.id === userId);

  if (!user) {
    return false;
  }

  user.is_active = false;
  user.updated_at = new Date().toISOString();
  await writeStore(store);
  return true;
}
