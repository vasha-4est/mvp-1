import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

import { hashAsBcryptLike, verifyBcryptLike } from "@/lib/server/controlModel";

const PREFIX = "scrypt";

export async function hashPassword(password: string, cost = 12): Promise<string> {
  return hashAsBcryptLike(password, cost);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$")) {
    return verifyBcryptLike(password, storedHash);
  }

  const [prefix, nRaw, salt, derivedHex] = storedHash.split("$");
  if (prefix !== PREFIX || !nRaw || !salt || !derivedHex) {
    return false;
  }

  const N = Number(nRaw);
  if (!Number.isFinite(N)) {
    return false;
  }

  const calculated = scryptSync(password, salt, 64, { N });
  const provided = Buffer.from(derivedHex, "hex");

  if (calculated.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(calculated, provided);
}

export async function hashLegacyPassword(password: string, cost = 12): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const keyLength = 64;
  const N = 2 ** Math.max(12, cost);
  const derived = scryptSync(password, salt, keyLength, { N }).toString("hex");
  return `${PREFIX}$${N}$${salt}$${derived}`;
}
