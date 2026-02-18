import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";

export const ALLOWED_ROLES = ["OWNER", "COO", "VIEWER", "PROD_MASTER", "PACKER", "LOGISTICS"] as const;
export type AllowedRole = (typeof ALLOWED_ROLES)[number];

const USERS_DIRECTORY_HEADER = [
  "user_id",
  "login",
  "password_hash",
  "must_change_password",
  "is_active",
  "created_at",
  "updated_at",
  "last_login_at",
  "notes",
  "display_name",
] as const;

type UsersDirectoryRecord = {
  user_id: string;
  login: string;
  password_hash: string;
  must_change_password: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  notes: string;
  display_name: string;
};

type UsersRolesRecord = {
  id: string;
  user_id: string;
  role: AllowedRole;
  created_at: string;
};

type ControlModelData = {
  users_directory_header: string[];
  users_directory: UsersDirectoryRecord[];
  users_roles: UsersRolesRecord[];
};

type LegacyControlModelData = {
  users_directory_header?: unknown;
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

function emptyStore(): ControlModelData {
  return {
    users_directory_header: [...USERS_DIRECTORY_HEADER],
    users_directory: [],
    users_roles: [],
  };
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }

  return fallback;
}

function normalizeIso(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return new Date(parsed).toISOString();
}

function normalizeOptionalIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function deriveLoginFromUserId(userId: string): string {
  return userId.replace(/^user_/i, "").trim().toLowerCase();
}

function normalizeRole(role: string): AllowedRole | null {
  const value = role.trim().toUpperCase();
  if (ALLOWED_ROLES.includes(value as AllowedRole)) {
    return value as AllowedRole;
  }

  return null;
}

function normalizeUsersDirectoryRecord(input: unknown): UsersDirectoryRecord | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const row = input as Record<string, unknown>;
  const nowIso = new Date().toISOString();

  const userIdRaw =
    typeof row.user_id === "string"
      ? row.user_id
      : typeof row.id === "string"
      ? row.id
      : typeof row.display_name === "string"
      ? `user_${row.display_name.trim().toLowerCase().replace(/\s+/g, "_")}`
      : "";
  const user_id = userIdRaw.trim();
  if (!user_id) {
    return null;
  }

  const loginRaw =
    typeof row.login === "string"
      ? row.login
      : typeof row.username === "string"
      ? row.username
      : deriveLoginFromUserId(user_id);
  const login = loginRaw.trim().toLowerCase();
  if (!login) {
    return null;
  }

  const created_at = normalizeIso(row.created_at ?? row.start_date, nowIso);
  const updated_at = normalizeIso(row.updated_at ?? created_at, created_at);

  return {
    user_id,
    login,
    password_hash: typeof row.password_hash === "string" ? row.password_hash.trim() : "",
    must_change_password: normalizeBoolean(row.must_change_password, true),
    is_active: normalizeBoolean(row.is_active, true),
    created_at,
    updated_at,
    last_login_at: normalizeOptionalIso(row.last_login_at),
    notes: typeof row.notes === "string" ? row.notes : "",
    display_name:
      typeof row.display_name === "string"
        ? row.display_name
        : typeof row.login === "string"
        ? row.login
        : login,
  };
}

function normalizeUsersRolesRecord(input: unknown): UsersRolesRecord | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }

  const row = input as Record<string, unknown>;
  const role = typeof row.role === "string" ? normalizeRole(row.role) : null;
  const user_id = typeof row.user_id === "string" ? row.user_id.trim() : "";
  if (!role || !user_id) {
    return null;
  }

  return {
    id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : randomUUID(),
    user_id,
    role,
    created_at: normalizeIso(row.created_at, new Date().toISOString()),
  };
}

function normalizeRoleRows(raw: unknown): UsersRolesRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const rows = raw.map(normalizeUsersRolesRecord).filter((item): item is UsersRolesRecord => item !== null);
  const dedupe = new Set<string>();

  return rows.filter((row) => {
    const key = `${row.user_id}:${row.role}`;
    if (dedupe.has(key)) {
      return false;
    }

    dedupe.add(key);
    return true;
  });
}

function ensureUsersDirectoryHeader(store: ControlModelData): ControlModelData {
  const current = store.users_directory_header;
  const sameHeader =
    Array.isArray(current) &&
    current.length === USERS_DIRECTORY_HEADER.length &&
    current.every((item, index) => item === USERS_DIRECTORY_HEADER[index]);

  if (sameHeader) {
    return store;
  }

  const byUserId = new Map<string, UsersDirectoryRecord>();
  const byDisplay = new Map<string, UsersDirectoryRecord>();

  for (const row of store.users_directory) {
    byUserId.set(row.user_id, row);
    if (row.display_name.trim()) {
      byDisplay.set(row.display_name.trim().toLowerCase(), row);
    }
  }

  const migratedRows = store.users_directory.map((row) => {
    const byId = byUserId.get(row.user_id);
    const byName = row.display_name.trim() ? byDisplay.get(row.display_name.trim().toLowerCase()) : null;
    return {
      ...(byName ?? byId ?? row),
      user_id: row.user_id,
      login: row.login || deriveLoginFromUserId(row.user_id),
      password_hash: row.password_hash,
      must_change_password: row.must_change_password,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_login_at: row.last_login_at,
      notes: row.notes,
      display_name: row.display_name,
    };
  });

  return {
    users_directory_header: [...USERS_DIRECTORY_HEADER],
    users_directory: migratedRows,
    users_roles: store.users_roles,
  };
}

function normalizeStoreShape(parsed: unknown): ControlModelData {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return emptyStore();
  }

  const typed = parsed as LegacyControlModelData;
  const directoryRaw = Array.isArray(typed.users_directory)
    ? typed.users_directory
    : Array.isArray(typed.users)
    ? typed.users
    : [];

  const users_directory = directoryRaw
    .map(normalizeUsersDirectoryRecord)
    .filter((item): item is UsersDirectoryRecord => item !== null);
  const users_roles = normalizeRoleRows(Array.isArray(typed.users_roles) ? typed.users_roles : typed.user_roles);

  const rawHeader = Array.isArray(typed.users_directory_header)
    ? typed.users_directory_header.filter((item): item is string => typeof item === "string")
    : [];

  return ensureUsersDirectoryHeader({
    users_directory_header: rawHeader.length > 0 ? rawHeader : [...USERS_DIRECTORY_HEADER],
    users_directory,
    users_roles,
  });
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
    await fs.writeFile(storePath(), JSON.stringify(ensureUsersDirectoryHeader(data), null, 2), "utf8");
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

export async function findUserByLogin(login: string): Promise<UsersDirectoryRecord | null> {
  const lookup = login.trim().toLowerCase();
  const store = await readStore();

  const user = store.users_directory.find((item) => item.login.trim().toLowerCase() === lookup);
  return user ?? null;
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
  login: string;
  passwordHash: string;
  roles: AllowedRole[];
  status?: "active" | "disabled";
  notes?: string;
  displayName?: string;
}): Promise<{ user_id: string }> {
  const store = await readStore();
  const now = new Date().toISOString();

  const normalizedLogin = params.login.trim().toLowerCase();
  const userId = `user_${normalizedLogin}`;

  const user: UsersDirectoryRecord = {
    user_id: userId,
    login: normalizedLogin,
    password_hash: params.passwordHash,
    must_change_password: false,
    is_active: params.status !== "disabled",
    created_at: now,
    updated_at: now,
    last_login_at: null,
    notes: params.notes?.trim() ?? "",
    display_name: params.displayName?.trim() || normalizedLogin,
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
    notes?: string;
    mustChangePassword?: boolean;
  }
): Promise<boolean> {
  const store = await readStore();
  const user = store.users_directory.find((item) => item.user_id === userId);

  if (!user) {
    return false;
  }

  const now = new Date().toISOString();

  if (typeof updates.passwordHash === "string") {
    user.password_hash = updates.passwordHash.trim();
  }

  if (typeof updates.notes === "string") {
    user.notes = updates.notes;
  }

  if (typeof updates.mustChangePassword === "boolean") {
    user.must_change_password = updates.mustChangePassword;
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
  login?: string;
}): Promise<{
  total: number;
  users: Array<{
    user_id: string;
    login: string;
    is_active: boolean;
    roles: AllowedRole[];
    last_login_at: string | null;
    must_change_password: boolean;
    notes: string;
    display_name: string;
  }>;
}> {
  const store = await readStore();
  const filterValue = params.login?.trim().toLowerCase() ?? "";

  const filtered = store.users_directory.filter((user) => {
    if (!filterValue) {
      return true;
    }

    return user.login.toLowerCase().includes(filterValue);
  });

  const start = (params.page - 1) * params.pageSize;
  const end = start + params.pageSize;

  const users = filtered.slice(start, end).map((user) => ({
    user_id: user.user_id,
    login: user.login,
    is_active: user.is_active,
    roles: store.users_roles
      .filter((item) => item.user_id === user.user_id)
      .map((item) => item.role)
      .filter((role, index, arr) => arr.indexOf(role) === index),
    last_login_at: user.last_login_at,
    must_change_password: user.must_change_password,
    notes: user.notes,
    display_name: user.display_name,
  }));

  return {
    total: filtered.length,
    users,
  };
}

export async function getUserById(userId: string): Promise<{
  user_id: string;
  login: string;
  is_active: boolean;
  roles: AllowedRole[];
  last_login_at: string | null;
  must_change_password: boolean;
  notes: string;
  display_name: string;
} | null> {
  const store = await readStore();
  const user = store.users_directory.find((item) => item.user_id === userId);
  if (!user) {
    return null;
  }

  return {
    user_id: user.user_id,
    login: user.login,
    is_active: user.is_active,
    roles: store.users_roles
      .filter((item) => item.user_id === user.user_id)
      .map((item) => item.role)
      .filter((role, index, arr) => arr.indexOf(role) === index),
    last_login_at: user.last_login_at,
    must_change_password: user.must_change_password,
    notes: user.notes,
    display_name: user.display_name,
  };
}

export async function setUserStatusById(userId: string, status: "active" | "disabled"): Promise<boolean> {
  const store = await readStore();
  const user = store.users_directory.find((item) => item.user_id === userId);
  if (!user) {
    return false;
  }

  user.is_active = status === "active";
  user.updated_at = new Date().toISOString();
  await writeStore(store);
  return true;
}

export async function setPasswordResetById(userId: string, passwordHash: string): Promise<boolean> {
  return updateUserById(userId, {
    passwordHash,
    mustChangePassword: true,
  });
}
