import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";

export type PasswordVerificationBranch = "verified_scrypt" | "migrated_plaintext" | "reject_empty" | "reject_mismatch";

export type PasswordVerificationResult = {
  ok: boolean;
  branch: PasswordVerificationBranch;
  shouldMigratePlaintext: boolean;
};

export type ParsedScryptHash = {
  N: number;
  salt: Buffer;
  dk: Buffer;
};

export async function hashPassword(password: string, cost = 12): Promise<string> {
  const salt = randomBytes(16);
  const keyLength = 64;
  const N = 2 ** Math.max(12, cost);
  const derived = scryptSync(password, salt, keyLength, { N, r: 8, p: 1 }).toString("hex");
  return `${PREFIX}$${N}$${salt.toString("hex")}$${derived}`;
}

export function parseScryptHash(stored: string): ParsedScryptHash | null {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return null;
  }

  const N = Number(parts[1]);
  if (!Number.isInteger(N) || N <= 0) {
    return null;
  }

  const saltHex = parts[2] ?? "";
  const dkHex = parts[3] ?? "";
  const isHex = (value: string) => /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0;

  if (!isHex(saltHex) || !isHex(dkHex)) {
    return null;
  }

  return {
    N,
    salt: Buffer.from(saltHex, "hex"),
    dk: Buffer.from(dkHex, "hex"),
  };
}

function looksLikeHash(value: string): boolean {
  return value.includes("$");
}

export function verifyPassword(password: string, storedRaw: string): PasswordVerificationResult {
  const stored = storedRaw.trim();

  if (!stored) {
    return { ok: false, branch: "reject_empty", shouldMigratePlaintext: false };
  }

  if (stored.startsWith(`${PREFIX}$`)) {
    const parsed = parseScryptHash(stored);
    if (!parsed) {
      return { ok: false, branch: "reject_mismatch", shouldMigratePlaintext: false };
    }

    const derived = scryptSync(password, parsed.salt, parsed.dk.length, {
      N: parsed.N,
      r: 8,
      p: 1,
    });

    if (derived.length !== parsed.dk.length) {
      return { ok: false, branch: "reject_mismatch", shouldMigratePlaintext: false };
    }

    const ok = timingSafeEqual(derived, parsed.dk);
    return { ok, branch: ok ? "verified_scrypt" : "reject_mismatch", shouldMigratePlaintext: false };
  }

  if (looksLikeHash(stored)) {
    return { ok: false, branch: "reject_mismatch", shouldMigratePlaintext: false };
  }

  const ok = password === stored;
  return { ok, branch: ok ? "migrated_plaintext" : "reject_mismatch", shouldMigratePlaintext: ok };
}
