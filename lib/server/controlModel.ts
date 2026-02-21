import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";

import { hashPasswordScrypt } from "@/lib/server/auth/scrypt";
import { readUsersDirectoryFromGas, writeUsersDirectoryHashes } from "@/lib/server/usersDirectory";

export const ALLOWED_ROLES = ["OWNER", "COO", "VIEWER"] as const;
export type AllowedRole = (typeof ALLOWED_ROLES)[number];

export type UserRecord = {
  id: string;
  username: string;
  password_hash: string;
  password?: string;
  is_active: boolean;
  must_change_password?: boolean;
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
  users_directory?: UserRecord[];
  users_roles?: UserRoleRecord[];
  users?: UserRecord[];
  user_roles?: UserRoleRecord[];
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

function normalizeStoreShape(parsed: unknown): ControlModelData {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return emptyStore();
  }

  const typed = parsed as LegacyControlModelData;
  const users = Array.isArray(typed.users)
    ? typed.users
    : Array.isArray(typed.users_directory)
      ? typed.users_directory
      : [];
  const userRoles = Array.isArray(typed.user_roles)
    ? typed.user_roles
    : Array.isArray(typed.users_roles)
      ? typed.users_roles
      : [];

  return {
    users,
    user_roles: userRoles,
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

function asTrimmed(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeRole(role: unknown): AllowedRole | null {
  const value = asTrimmed(role).toUpperCase();
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
    .map((role) => normalizeRole(role))
    .filter((role): role is AllowedRole => role !== null);

  return normalized.filter((role, index, arr) => arr.indexOf(role) === index);
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const lookup = asTrimmed(username).toLowerCase();

  if (process.env.GAS_WEBAPP_URL) {
    const requestId = randomUUID();
    const source = await readUsersDirectoryFromGas(requestId);
    const gasUser = source.users.find((item) => asTrimmed(item.username).toLowerCase() === lookup);

    if (gasUser) {
      const isActive = parseBool(gasUser.is_active);
      return {
        id: gasUser.id,
        username: gasUser.username,
        password_hash: gasUser.password_hash,
        password: gasUser.password,
        is_active: isActive,
        must_change_password: parseMustChangePassword(gasUser.must_change_password ?? ""),
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
        last_login_at: null,
      };
    }
  }

  const store = await readStore();
  const user = store.users.find((item) => asTrimmed(item.username).toLowerCase() === lookup);
  return user ?? null;
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const lookup = asTrimmed(userId);

  if (process.env.GAS_WEBAPP_URL) {
    const requestId = randomUUID();
    const source = await readUsersDirectoryFromGas(requestId);
    const gasUser = source.users.find((item) => asTrimmed(item.id) === lookup);

    if (gasUser) {
      return {
        id: gasUser.id,
        username: gasUser.username,
        password_hash: gasUser.password_hash,
        password: gasUser.password,
        is_active: parseBool(gasUser.is_active),
        must_change_password: parseMustChangePassword(gasUser.must_change_password ?? ""),
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
        last_login_at: null,
      };
    }

    return null;
  }

  const store = await readStore();
  const user = store.users.find((item) => item.id === lookup);
  return user ?? null;
}

export async function getRolesForUser(userId: string): Promise<AllowedRole[]> {
  if (process.env.GAS_WEBAPP_URL) {
    const requestId = randomUUID();
    const source = await readUsersDirectoryFromGas(requestId);
    const lookup = asTrimmed(userId);
    const gasUser = source.users.find((item) => asTrimmed(item.id) === lookup);
    if (gasUser) {
      return parseRoles(gasUser.roles);
    }
  }

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
    must_change_password: false,
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
    mustChangePassword?: boolean;
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


  if (typeof updates.mustChangePassword === "boolean") {
    user.must_change_password = updates.mustChangePassword;
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

function toNormalizedString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).toLowerCase();
}

function parseBool(value: unknown): boolean {
  // Guard for PR-61 crash paths: users_directory cells may be boolean/number and must not call .trim() on non-strings.
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = toNormalizedString(value);
  if (!normalized) {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "n") {
    return false;
  }

  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y") {
    return true;
  }

  return true;
}

function parseMustChangePassword(value: unknown): boolean {
  // Supports string|boolean|number|null|undefined from users_directory payloads.
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = toNormalizedString(value);
  if (!normalized) {
    return false;
  }

  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "n") {
    return false;
  }

  return false;
}

function parseRoles(value: string): AllowedRole[] {
  return value
    .split(/[|,]/)
    .map((item) => normalizeRole(item))
    .filter((item): item is AllowedRole => item !== null)
    .filter((role, index, arr) => arr.indexOf(role) === index);
}

function isPasswordHash(value: string): boolean {
  return value.startsWith("scrypt$");
}

export async function listUsers(params: {
  page: number;
  pageSize: number;
  username?: string;
}): Promise<{ total: number; users: Array<{ id: string; username: string; is_active: boolean; roles: AllowedRole[] }> }> {
  const requestId = randomUUID();
  const source = process.env.GAS_WEBAPP_URL ? await readUsersDirectoryFromGas(requestId) : null;

  if (source) {
    const filterValue = params.username?.trim().toLowerCase() ?? "";
    const mapped = source.users
      .map((user) => ({
        id: user.id,
        username: user.username,
        is_active: parseBool(user.is_active),
        roles: parseRoles(user.roles),
      }))
      .filter((user) => user.id && user.username)
      .filter((user) => (filterValue ? user.username.toLowerCase().includes(filterValue) : true));

    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;

    return {
      total: mapped.length,
      users: mapped.slice(start, end),
    };
  }

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

export async function provisionUsers(): Promise<{
  provisioned_count: number;
  processed: number;
  migratedLegacy: number;
  alreadyHashed: number;
  skippedInactive: number;
  skippedNoPassword: number;
  items: Array<{ id: string; username: string; status: "already_hashed" | "skipped_inactive" | "legacy_pending" | "skipped_no_password" | "provisioned" }>;
  debug_samples: Array<{ id: string; username: string; action: "skippedNoPassword" | "alreadyHashed" | "hashedPlaintext"; password_kind_detected: "empty" | "scrypt" | "plaintext" }>;
}> {
  if (!process.env.GAS_WEBAPP_URL) {
    const store = await readStore();
    return {
      provisioned_count: 0,
      processed: store.users.length,
      migratedLegacy: 0,
      alreadyHashed: 0,
      skippedInactive: 0,
      skippedNoPassword: store.users.length,
      items: store.users.map((user) => ({ id: user.id, username: user.username, status: "skipped_no_password" })),
      debug_samples: [],
    };
  }

  const requestId = randomUUID();
  const source = await readUsersDirectoryFromGas(requestId);
  const store = await readStore();
  const items: Array<{ id: string; username: string; status: "already_hashed" | "skipped_inactive" | "legacy_pending" | "skipped_no_password" | "provisioned" }> = [];

  let migratedLegacy = 0;
  let alreadyHashed = 0;
  let skippedInactive = 0;
  let skippedNoPassword = 0;

  const debugSamples: Array<{ id: string; username: string; action: "skippedNoPassword" | "alreadyHashed" | "hashedPlaintext"; password_kind_detected: "empty" | "scrypt" | "plaintext" }> = [];

  const hashUpdates: Array<{ id: string; password_hash: string }> = [];

  function pushSample(sample: { id: string; username: string; action: "skippedNoPassword" | "alreadyHashed" | "hashedPlaintext"; password_kind_detected: "empty" | "scrypt" | "plaintext" }) {
    if (debugSamples.length < 3) {
      debugSamples.push(sample);
    }
  }

  for (const row of source.users) {
    const id = asTrimmed(row.id);
    const username = asTrimmed(row.username);
    if (!id || !username) {
      continue;
    }

    const isActive = parseBool(row.is_active);
    if (!isActive) {
      skippedInactive += 1;
      items.push({ id, username, status: "skipped_inactive" });
      continue;
    }

    const passwordValue = asTrimmed(row.password);
    const passwordHashValue = asTrimmed(row.password_hash);

    const passwordKind: "empty" | "scrypt" | "plaintext" = !passwordValue
      ? "empty"
      : passwordValue.startsWith("scrypt$")
        ? "scrypt"
        : "plaintext";

    let hashToStore: string | null = null;

    if (passwordKind === "scrypt") {
      alreadyHashed += 1;
      items.push({ id, username, status: "already_hashed" });
      pushSample({ id, username, action: "alreadyHashed", password_kind_detected: "scrypt" });
      hashToStore = passwordValue;
    } else if (passwordKind === "plaintext") {
      const hashed = await hashPasswordScrypt(passwordValue);
      hashUpdates.push({ id, password_hash: hashed });
      migratedLegacy += 1;
      items.push({ id, username, status: "provisioned" });
      pushSample({ id, username, action: "hashedPlaintext", password_kind_detected: "plaintext" });
      hashToStore = hashed;
    } else if (passwordHashValue && isPasswordHash(passwordHashValue)) {
      // Safety fallback if only password_hash has an scrypt token.
      alreadyHashed += 1;
      items.push({ id, username, status: "already_hashed" });
      pushSample({ id, username, action: "alreadyHashed", password_kind_detected: "scrypt" });
      hashToStore = passwordHashValue;
    } else {
      skippedNoPassword += 1;
      items.push({ id, username, status: "skipped_no_password" });
      pushSample({ id, username, action: "skippedNoPassword", password_kind_detected: "empty" });
      continue;
    }

    const now = new Date().toISOString();
    if (!hashToStore) {
      continue;
    }

    const existingUser = store.users.find((user) => asTrimmed(user.id) === id || asTrimmed(user.username).toLowerCase() === username.toLowerCase());
    if (existingUser) {
      existingUser.id = id;
      existingUser.username = username;
      existingUser.password_hash = hashToStore;
      existingUser.is_active = isActive;
      existingUser.updated_at = now;
    } else {
      store.users.push({
        id,
        username,
        password_hash: hashToStore,
        is_active: isActive,
        must_change_password: false,
        created_at: now,
        updated_at: now,
        last_login_at: null,
      });
    }

    const roles = parseRoles(row.roles);
    store.user_roles = store.user_roles.filter((entry) => entry.user_id !== id);
    for (const role of roles) {
      store.user_roles.push({
        id: randomUUID(),
        user_id: id,
        role,
        created_at: now,
      });
    }
  }

  if (hashUpdates.length > 0) {
    await writeUsersDirectoryHashes(requestId, hashUpdates);
  }

  await writeStore(store);

  return {
    provisioned_count: migratedLegacy,
    processed: source.users.length,
    migratedLegacy,
    alreadyHashed,
    skippedInactive,
    skippedNoPassword,
    items,
    debug_samples: debugSamples,
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
