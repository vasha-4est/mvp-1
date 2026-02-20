import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";

export type PasswordCheckReason = "OK" | "HASH_PARSE_FAILED" | "PASSWORD_MISMATCH";
export type PasswordHashFormat = "scrypt" | "plain" | "empty";
export type PasswordVerifyPath = "new" | "legacy" | "plain";

type ParsedScrypt = {
  N: number;
  saltHex: string;
  saltBuf: Buffer;
  expected: Buffer;
};

export async function hashPassword(password: string, cost = 12): Promise<string> {
  const saltBuf = randomBytes(16);
  const saltHex = saltBuf.toString("hex");
  const keyLength = 64;
  const N = 2 ** Math.max(12, cost);
  const derived = scryptSync(password, saltBuf, keyLength, { N, r: 8, p: 1 }).toString("hex");
  return `${PREFIX}$${N}$${saltHex}$${derived}`;
}

function parseScrypt(stored: string): ParsedScrypt | null {
  const parts = stored.split("$");
  if (parts.length !== 4) return null;
  if (parts[0] !== PREFIX) return null;

  const N = parseInt(parts[1] ?? "", 10);
  const saltHex = parts[2] ?? "";
  const dkHex = parts[3] ?? "";

  if (!Number.isInteger(N) || N <= 0) return null;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(dkHex) || saltHex.length % 2 !== 0 || dkHex.length % 2 !== 0) {
    return null;
  }

  const saltBuf = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(dkHex, "hex");
  if (saltBuf.length === 0 || expected.length === 0) {
    return null;
  }

  return { N, saltHex, saltBuf, expected };
}

function verifyDerived(derived: Buffer, expected: Buffer): boolean {
  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}

export function verifyScrypt(password: string, stored: string): { ok: boolean; verifyPath: "new" | "legacy" } | null {
  const parsed = parseScrypt(stored);
  if (!parsed) {
    return null;
  }

  const derivedNew = scryptSync(password, parsed.saltBuf, parsed.expected.length, {
    N: parsed.N,
    r: 8,
    p: 1,
  });

  if (verifyDerived(derivedNew, parsed.expected)) {
    return { ok: true, verifyPath: "new" };
  }

  const derivedLegacy = scryptSync(password, parsed.saltHex, parsed.expected.length, {
    N: parsed.N,
    r: 8,
    p: 1,
  });

  if (verifyDerived(derivedLegacy, parsed.expected)) {
    return { ok: true, verifyPath: "legacy" };
  }

  return { ok: false, verifyPath: "legacy" };
}

export async function verifyPassword(password: string, stored: string): Promise<{
  ok: boolean;
  reason: PasswordCheckReason;
  hashFormat: PasswordHashFormat;
  verifyPath: PasswordVerifyPath;
}> {
  if (!stored) {
    return { ok: false, reason: "PASSWORD_MISMATCH", hashFormat: "empty", verifyPath: "plain" };
  }

  if (stored.startsWith(`${PREFIX}$`)) {
    const result = verifyScrypt(password, stored);
    if (!result) {
      return { ok: false, reason: "HASH_PARSE_FAILED", hashFormat: "scrypt", verifyPath: "new" };
    }

    return {
      ok: result.ok,
      reason: result.ok ? "OK" : "PASSWORD_MISMATCH",
      hashFormat: "scrypt",
      verifyPath: result.verifyPath,
    };
  }

  const ok = password === stored;
  return { ok, reason: ok ? "OK" : "PASSWORD_MISMATCH", hashFormat: "plain", verifyPath: "plain" };
}
