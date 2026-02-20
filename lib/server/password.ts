import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";

export type PasswordCheckReason = "OK" | "HASH_PARSE_FAILED" | "PASSWORD_MISMATCH";
export type PasswordHashFormat = "scrypt" | "plain" | "empty";
export type PasswordVerifyPath = "new" | "legacy" | "plain";

type ParsedScrypt = {
  N: number;
  saltHex: string;
  saltBytes: Buffer;
  expected: Buffer;
};

export async function hashPassword(password: string, cost = 12): Promise<string> {
  const saltBytes = randomBytes(16);
  const saltHex = saltBytes.toString("hex");
  const keyLength = 64;
  const N = 2 ** Math.max(12, cost);
  const derivedHex = scryptSync(password, saltBytes, keyLength, { N, r: 8, p: 1 }).toString("hex");
  return `${PREFIX}$${N}$${saltHex}$${derivedHex}`;
}

function parseScrypt(stored: string): ParsedScrypt | null {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return null;
  }

  const N = parseInt(parts[1] ?? "", 10);
  const saltHex = parts[2] ?? "";
  const expectedHex = parts[3] ?? "";

  if (!Number.isInteger(N) || N <= 0) {
    return null;
  }

  if (
    !/^[0-9a-f]+$/i.test(saltHex) ||
    !/^[0-9a-f]+$/i.test(expectedHex) ||
    saltHex.length % 2 !== 0 ||
    expectedHex.length % 2 !== 0
  ) {
    return null;
  }

  const saltBytes = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (saltBytes.length === 0 || expected.length === 0) {
    return null;
  }

  return { N, saltHex, saltBytes, expected };
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function verifyScrypt(password: string, stored: string): { ok: boolean; verifyPath: "new" | "legacy" } | null {
  const parsed = parseScrypt(stored);
  if (!parsed) {
    return null;
  }

  const derivedNew = scryptSync(password, parsed.saltBytes, parsed.expected.length, {
    N: parsed.N,
    r: 8,
    p: 1,
  });

  if (safeEqual(derivedNew, parsed.expected)) {
    return { ok: true, verifyPath: "new" };
  }

  const derivedLegacy = scryptSync(password, parsed.saltHex, parsed.expected.length, {
    N: parsed.N,
    r: 8,
    p: 1,
  });

  if (safeEqual(derivedLegacy, parsed.expected)) {
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
