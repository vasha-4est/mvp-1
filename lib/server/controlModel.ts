import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";

export const ALLOWED_ROLES = ["OWNER", "COO", "VIEWER"] as const;
export type AllowedRole = (typeof ALLOWED_ROLES)[number];

const USERS_DIRECTORY_REQUIRED_COLUMNS = [
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

export type UsersDirectoryRequiredColumn = (typeof USERS_DIRECTORY_REQUIRED_COLUMNS)[number];

export type UserRecord = {
  user_id: string;
  login: string;
  password_hash: string;
  temp_password: string;
  must_change_password: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  notes: string;
  display_name: string;
};

export type UserRoleRecord = {
  id: string;
  user_id: string;
  role: AllowedRole;
  created_at: string;
};

type ControlModelData = {
  users_directory: UserRecord[];
  users_roles: UserRoleRecord[];
};

type LegacyUserRecord = {
  id?: unknown;
  user_id?: unknown;
  username?: unknown;
  login?: unknown;
  password_hash?: unknown;
  temp_password?: unknown;
  must_change_password?: unknown;
  is_active?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  last_login_at?: unknown;
  notes?: unknown;
  display_name?: unknown;
};

type LegacyControlModelData = {
  users_directory?: unknown;
  users_roles?: unknown;
  users?: unknown;
  user_roles?: unknown;
};

const DEFAULT_STORE_FILE = "/tmp/control_model.json";

export class StorageError extends Error {
  constructor() {
    super("Storage error");
    this.name = "StorageError";
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

function storePath(): string {
  const fromEnv = process.env.CONTROL_MODEL_STORE_FILE;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : DEFAULT_STORE_FILE;
}

async function withStorageGuard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new StorageError();
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }

  return fallback;
}

function normalizeUserRecord(input: LegacyUserRecord): UserRecord {
  const now = nowIso();
  const userId = asString(input.user_id).trim() || asString(input.id).trim() || randomUUID();
  const login = asString(input.login).trim() || asString(input.username).trim();

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

function normalizeRole(role: string): AllowedRole | null {
  const value = role.trim().toUpperCase();
  if (ALLOWED_ROLES.includes(value as AllowedRole)) {
    return value as AllowedRole;
  }

  return null;
}

function normalizeRoleRecord(input: unknown): UserRoleRecord | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const record = input as { id?: unknown; user_id?: unknown; role?: unknown; created_at?: unknown };
  const role = typeof record.role === "string" ? normalizeRole(record.role) : null;
  const userId = asString(record.user_id).trim();

  if (!role || !userId) {
    return null;
  }

  return {
    id: asString(record.id).trim() || randomUUID(),
    user_id: userId,
    role,
    created_at: asString(record.created_at).trim() || nowIso(),
  };
}

function emptyStore(): ControlModelData {
  return {
    users_directory: [],
    users_roles: [],
  };
}

function normalizeStoreShape(parsed: unknown): ControlModelData {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return emptyStore();
  }

  const typed = parsed as LegacyControlModelData;
  const usersRaw = Array.isArray(typed.users_directory)
    ? typed.users_directory
    : Array.isArray(typed.users)
      ? typed.users
      : [];
  const rolesRaw = Array.isArray(typed.users_roles)
    ? typed.users_roles
    : Array.isArray(typed.user_roles)
      ? typed.user_roles
      : [];

  return {
    users_directory: usersRaw
      .filter((item): item is LegacyUserRecord => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((item) => normalizeUserRecord(item)),
    users_roles: rolesRaw.map((item) => normalizeRoleRecord(item)).filter((item): item is UserRoleRecord => item !== null),
  };
}

async function ensureStoreFile(): Promise<void> {
  await withStorageGuard(async () => {
    const filePath = storePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    try {
      await fs.access(filePath);
      return;
    } catch {
      await fs.writeFile(filePath, JSON.stringify(emptyStore(), null, 2), "utf8");
    }
  });
}

async function readStore(): Promise<ControlModelData> {
  await ensureStoreFile();

  return withStorageGuard(async () => {
    const raw = await fs.readFile(storePath(), "utf8");

    try {
      return normalizeStoreShape(JSON.parse(raw));
    } catch {
      return emptyStore();
    }
  });
}

async function writeStore(data: ControlModelData): Promise<void> {
  await ensureStoreFile();

  await withStorageGuard(async () => {
    await fs.writeFile(storePath(), JSON.stringify(data, null, 2), "utf8");
  });
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

export async function ensureUsersDirectoryColumns(): Promise<UsersDirectoryRequiredColumn[]> {
  const store = await readStore();
  for (let index = 0; index < store.users_directory.length; index += 1) {
    store.users_directory[index] = normalizeUserRecord(store.users_directory[index]);
  }
  await writeStore(store);
  return [...USERS_DIRECTORY_REQUIRED_COLUMNS];
}

export async function getUsersDirectoryRows(): Promise<UserRecord[]> {
  const store = await readStore();
  return store.users_directory.map((item) => normalizeUserRecord(item));
}

export async function writeUsersDirectoryRows(rows: UserRecord[]): Promise<void> {
  const store = await readStore();
  store.users_directory = rows.map((item) => normalizeUserRecord(item));
  await writeStore(store);
}

export async function updateUsersDirectoryRowsByUserId(
  updates: Array<{ user_id: string; update: Partial<UserRecord> }>
): Promise<number> {
  if (updates.length === 0) {
    return 0;
  }

  const store = await readStore();
  let changed = 0;

  for (const update of updates) {
    const row = store.users_directory.find((item) => item.user_id === update.user_id);
    if (!row) {
      continue;
    }

    Object.assign(row, update.update);
    changed += 1;
  }

  await writeStore(store);
  return changed;
}

export async function findUserByUsername(username: string): Promise<UserRecord | null> {
  const lookup = username.trim().toLowerCase();
  const store = await readStore();

  const user = store.users_directory.find((item) => item.login.trim().toLowerCase() === lookup);
  return user ?? null;
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  const store = await readStore();
  return store.users_directory.find((item) => item.user_id === userId) ?? null;
}

export async function getRolesForUser(userId: string): Promise<AllowedRole[]> {
  const store = await readStore();
  return store.users_roles
    .filter((item) => item.user_id === userId)
    .map((item) => item.role)
    .filter((role, index, arr) => arr.indexOf(role) === index);
}

export async function touchLastLoginAt(userId: string, atIso: string): Promise<void> {
  const store = await readStore();
  const user = store.users_directory.find((item) => item.user_id === userId);
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
  const now = nowIso();

  const userId = randomUUID();

  const user: UserRecord = {
    user_id: userId,
    login: params.username.trim(),
    password_hash: params.passwordHash,
    temp_password: "",
    must_change_password: false,
    is_active: true,
    created_at: now,
    updated_at: now,
    last_login_at: null,
    notes: "",
    display_name: "",
  };

  store.users_directory.push(user);
  for (const role of params.roles) {
    store.users_roles.push({
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
  const user = store.users_directory.find((item) => item.user_id === userId);

  if (!user) {
    return false;
  }

  const now = nowIso();

  if (typeof updates.passwordHash === "string" && updates.passwordHash.trim()) {
    user.password_hash = updates.passwordHash;
  }

  if (updates.roles) {
    store.users_roles = store.users_roles.filter((item) => item.user_id !== userId);

    for (const role of updates.roles) {
      store.users_roles.push({
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

  const filtered = store.users_directory.filter((user) => {
    if (!filterValue) {
      return true;
    }

    return user.login.toLowerCase().includes(filterValue);
  });

  const start = (params.page - 1) * params.pageSize;
  const end = start + params.pageSize;

  const users = filtered.slice(start, end).map((user) => ({
    id: user.user_id,
    username: user.login,
    is_active: user.is_active,
    roles: store.users_roles
      .filter((item) => item.user_id === user.user_id)
      .map((item) => item.role)
      .filter((role, index, arr) => arr.indexOf(role) === index),
  }));

  return {
    total: filtered.length,
    users,
  };
}

export async function deactivateUser(userId: string): Promise<boolean> {
  const store = await readStore();
  const user = store.users_directory.find((item) => item.user_id === userId);

  if (!user) {
    return false;
  }

  user.is_active = false;
  user.updated_at = nowIso();
  await writeStore(store);
  return true;
}
