import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";

export type PasswordCheckReason = "OK" | "HASH_PARSE_FAILED" | "PASSWORD_MISMATCH";

type ParsedScrypt = {
  N: number;
  salt: Buffer;
  expected: Buffer;
};

export async function hashPassword(password: string, cost = 12): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const keyLength = 64;
  const N = 2 ** Math.max(12, cost);
  const derived = scryptSync(password, salt, keyLength, { N }).toString("hex");
  return `${PREFIX}$${N}$${salt}$${derived}`;
}

function parseScrypt(stored: string): ParsedScrypt | null {
  const parts = stored.split("$");
  if (parts.length !== 4) return null;
  if (parts[0] !== PREFIX) return null;

  const N = parseInt(parts[1] ?? "", 10);
  const saltHex = parts[2] ?? "";
  const dkHex = parts[3] ?? "";

  if (!Number.isInteger(N)) return null;

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(dkHex, "hex");

    if (salt.length === 0 || expected.length === 0) {
      return null;
    }

    return { N, salt, expected };
  } catch {
    return null;
  }
}

export function verifyScrypt(password: string, stored: string): boolean {
  const parsed = parseScrypt(stored);
  if (!parsed) {
    return false;
  }

  const derived = scryptSync(password, parsed.salt, parsed.expected.length, {
    N: parsed.N,
    r: 8,
    p: 1,
  });

  if (derived.length !== parsed.expected.length) {
    return false;
  }

  return timingSafeEqual(derived, parsed.expected);
}

export async function verifyPassword(password: string, stored: string): Promise<{ ok: boolean; reason: PasswordCheckReason }> {
  if (!stored) {
    return { ok: false, reason: "PASSWORD_MISMATCH" };
  }

  if (stored.startsWith(`${PREFIX}$`)) {
    const parsed = parseScrypt(stored);
    if (!parsed) {
      return { ok: false, reason: "HASH_PARSE_FAILED" };
    }

    const ok = verifyScrypt(password, stored);
    return { ok, reason: ok ? "OK" : "PASSWORD_MISMATCH" };
  }

  const ok = password === stored;
  return { ok, reason: ok ? "OK" : "PASSWORD_MISMATCH" };
}
