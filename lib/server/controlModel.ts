import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";

export const ALLOWED_ROLES = ["OWNER", "COO", "VIEWER"] as const;
export type AllowedRole = (typeof ALLOWED_ROLES)[number];

export type UserRecord = {
  id: string;
  username: string;
  password_hash: string;
  is_active: boolean;
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
