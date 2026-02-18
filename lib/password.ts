import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";
const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+";
const HASH_PREFIX = `${PREFIX}$`;

export function isProbablyHash(stored: string): boolean {
  const value = stored.trim();
  if (!value) {
    return false;
  }

  return value.startsWith(HASH_PREFIX) && value.split("$").length === 4;
}

export async function hashPassword(plain: string, cost = 12): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const keyLength = 64;
  const N = 2 ** Math.max(12, cost);
  const derived = scryptSync(plain, salt, keyLength, { N }).toString("hex");
  return `${PREFIX}$${N}$${salt}$${derived}`;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const [prefix, nRaw, salt, derivedHex] = hash.split("$");
  if (!isProbablyHash(hash) || prefix !== PREFIX || !nRaw || !salt || !derivedHex) {
    return false;
  }

  const N = Number(nRaw);
  if (!Number.isFinite(N)) {
    return false;
  }

  const calculated = scryptSync(plain, salt, 64, { N });
  const provided = Buffer.from(derivedHex, "hex");

  if (calculated.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(calculated, provided);
}

export function generateTempPassword(login: string, length = 16): string {
  const safeLength = Math.max(12, Math.min(64, length));
  const bytes = randomBytes(safeLength);
  let temp = "";

  for (let i = 0; i < safeLength; i += 1) {
    temp += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }

  const loginSeed = login.trim().replace(/\s+/g, "").slice(0, 2);
  if (loginSeed.length > 0) {
    temp = `${loginSeed}${temp.slice(loginSeed.length)}`;
  }

  return temp.replace(/\s/g, "");
}
