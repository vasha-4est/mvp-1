import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";
const LEGACY_DEFAULT_N = 4096;

export type PasswordCheckReason = "OK" | "HASH_PARSE_FAILED" | "PASSWORD_MISMATCH";

type ParsedScryptHash = {
  N: number;
  saltHex: string;
  hashHex: string;
};

export async function hashPassword(password: string, cost = 12): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const keyLength = 64;
  const N = 2 ** Math.max(12, cost);
  const derived = scryptSync(password, salt, keyLength, { N }).toString("hex");
  return `${PREFIX}$${N}$${salt}$${derived}`;
}

export function parseScryptHash(storedHash: string): ParsedScryptHash | null {
  if (!storedHash.startsWith(`${PREFIX}$`)) {
    return null;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 3 && parts.length !== 4) {
    return null;
  }

  let N = LEGACY_DEFAULT_N;
  let saltHex = "";
  let hashHex = "";

  if (parts.length === 4) {
    const maybeN = Number(parts[1]);
    if (!Number.isInteger(maybeN) || maybeN <= 0) {
      return null;
    }

    N = maybeN;
    saltHex = parts[2] ?? "";
    hashHex = parts[3] ?? "";
  } else {
    saltHex = parts[1] ?? "";
    hashHex = parts[2] ?? "";
  }

  if (
    !/^[0-9a-f]+$/i.test(saltHex) ||
    !/^[0-9a-f]+$/i.test(hashHex) ||
    saltHex.length % 2 !== 0 ||
    hashHex.length % 2 !== 0
  ) {
    return null;
  }

  return { N, saltHex, hashHex };
}

export function verifyScryptHash(password: string, storedHash: string): { ok: boolean; reason: PasswordCheckReason } {
  const parsed = parseScryptHash(storedHash);
  if (!parsed) {
    return { ok: false, reason: "HASH_PARSE_FAILED" };
  }

  const keyLength = parsed.hashHex.length / 2;
  const derived = scryptSync(password, parsed.saltHex, keyLength, {
    N: parsed.N,
    r: 8,
    p: 1,
  });
  const provided = Buffer.from(parsed.hashHex, "hex");

  if (derived.length !== provided.length) {
    return { ok: false, reason: "PASSWORD_MISMATCH" };
  }

  const matches = timingSafeEqual(derived, provided);
  return {
    ok: matches,
    reason: matches ? "OK" : "PASSWORD_MISMATCH",
  };
}

export async function verifyPassword(
  password: string,
  storedSecret: string
): Promise<{ ok: boolean; reason: PasswordCheckReason; isPlaintextMatch: boolean }> {
  if (!storedSecret.startsWith(`${PREFIX}$`)) {
    const matches = password === storedSecret;
    return {
      ok: matches,
      reason: matches ? "OK" : "PASSWORD_MISMATCH",
      isPlaintextMatch: matches,
    };
  }

  const checked = verifyScryptHash(password, storedSecret);
  return { ok: checked.ok, reason: checked.reason, isPlaintextMatch: false };
}
