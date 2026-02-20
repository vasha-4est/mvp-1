import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";
const DEFAULT_N = 4096;

type VerifyReasonCode = "OK" | "MISMATCH" | "TOKEN_PARSE_FAIL" | "EXCEPTION";

export type PasswordCheckReason = "OK" | "HASH_PARSE_FAILED" | "PASSWORD_MISMATCH";
export type PasswordHashFormat = "scrypt" | "plain" | "empty";
export type PasswordVerifyPath = "raw_bytes" | "utf8_hex" | "plain";

export type ScryptTokenMeta = {
  kind: "scrypt" | "unknown";
  N: number | null;
  saltHexLen: number;
  dkHexLen: number;
  keyLen: number;
};

type ParsedScryptToken = {
  kind: "scrypt";
  N: number;
  saltHex: string;
  dkHex: string;
  saltBytes: Buffer;
  expectedBytes: Buffer;
  keyLen: number;
  saltHexLen: number;
  dkHexLen: number;
};

export type ScryptVerifyResult = {
  attempted: boolean;
  triedRawBytes: boolean;
  triedUtf8Hex: boolean;
  matched: boolean;
  reasonCode: VerifyReasonCode;
  whichVariant: "raw_bytes" | "utf8_hex" | null;
  meta: ScryptTokenMeta;
};

export async function hashPassword(password: string, cost = 12): Promise<string> {
  const saltBytes = randomBytes(16);
  const saltHex = saltBytes.toString("hex");
  const keyLength = 64;
  const N = 2 ** Math.max(12, cost);
  const derivedHex = scryptSync(password, saltBytes, keyLength, { N, r: 8, p: 1 }).toString("hex");
  return `${PREFIX}$${N}$${saltHex}$${derivedHex}`;
}

export function parseScryptToken(stored: string): ParsedScryptToken | null {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return null;
  }

  const N = parseInt(parts[1] ?? "", 10);
  const saltHex = parts[2] ?? "";
  const dkHex = parts[3] ?? "";

  if (!Number.isInteger(N) || N <= 1) {
    return null;
  }

  if (!/^[0-9a-fA-F]+$/.test(saltHex) || !/^[0-9a-fA-F]+$/.test(dkHex) || saltHex.length % 2 !== 0 || dkHex.length % 2 !== 0) {
    return null;
  }

  const keyLen = dkHex.length / 2;
  if (!Number.isInteger(keyLen) || keyLen <= 0) {
    return null;
  }

  const saltBytes = Buffer.from(saltHex, "hex");
  const expectedBytes = Buffer.from(dkHex, "hex");
  if (saltBytes.length === 0 || expectedBytes.length === 0) {
    return null;
  }

  return {
    kind: "scrypt",
    N,
    saltHex,
    dkHex,
    saltBytes,
    expectedBytes,
    keyLen,
    saltHexLen: saltHex.length,
    dkHexLen: dkHex.length,
  };
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function unknownScryptMeta(stored: string): ScryptTokenMeta {
  const parts = stored.split("$");
  const maybeN = parseInt(parts[1] ?? "", 10);
  const saltHex = parts[2] ?? "";
  const dkHex = parts[3] ?? "";

  return {
    kind: "unknown",
    N: Number.isInteger(maybeN) && maybeN > 1 ? maybeN : null,
    saltHexLen: typeof saltHex === "string" ? saltHex.length : 0,
    dkHexLen: typeof dkHex === "string" ? dkHex.length : 0,
    keyLen: typeof dkHex === "string" && dkHex.length % 2 === 0 ? dkHex.length / 2 : 0,
  };
}

export function verifyScrypt(password: string, stored: string): ScryptVerifyResult {
  const parsed = parseScryptToken(stored);
  if (!parsed) {
    return {
      attempted: true,
      triedRawBytes: false,
      triedUtf8Hex: false,
      matched: false,
      reasonCode: "TOKEN_PARSE_FAIL",
      whichVariant: null,
      meta: unknownScryptMeta(stored),
    };
  }

  try {
    const derivedStandard = scryptSync(password, parsed.saltBytes, parsed.keyLen, {
      N: parsed.N,
      r: 8,
      p: 1,
    });

    if (safeEqual(derivedStandard, parsed.expectedBytes)) {
      return {
        attempted: true,
        triedRawBytes: true,
        triedUtf8Hex: false,
        matched: true,
        reasonCode: "OK",
        whichVariant: "raw_bytes",
        meta: {
          kind: "scrypt",
          N: parsed.N,
          saltHexLen: parsed.saltHexLen,
          dkHexLen: parsed.dkHexLen,
          keyLen: parsed.keyLen,
        },
      };
    }

    const derivedLegacy = scryptSync(password, parsed.saltHex, parsed.keyLen, {
      N: parsed.N,
      r: 8,
      p: 1,
    });

    if (safeEqual(derivedLegacy, parsed.expectedBytes)) {
      return {
        attempted: true,
        triedRawBytes: true,
        triedUtf8Hex: true,
        matched: true,
        reasonCode: "OK",
        whichVariant: "utf8_hex",
        meta: {
          kind: "scrypt",
          N: parsed.N,
          saltHexLen: parsed.saltHexLen,
          dkHexLen: parsed.dkHexLen,
          keyLen: parsed.keyLen,
        },
      };
    }

    return {
      attempted: true,
      triedRawBytes: true,
      triedUtf8Hex: true,
      matched: false,
      reasonCode: "MISMATCH",
      whichVariant: null,
      meta: {
        kind: "scrypt",
        N: parsed.N,
        saltHexLen: parsed.saltHexLen,
        dkHexLen: parsed.dkHexLen,
        keyLen: parsed.keyLen,
      },
    };
  } catch {
    return {
      attempted: true,
      triedRawBytes: true,
      triedUtf8Hex: true,
      matched: false,
      reasonCode: "EXCEPTION",
      whichVariant: null,
      meta: {
        kind: "scrypt",
        N: parsed.N,
        saltHexLen: parsed.saltHexLen,
        dkHexLen: parsed.dkHexLen,
        keyLen: parsed.keyLen,
      },
    };
  }
}

export function buildLegacyScryptToken(password: string, N = DEFAULT_N): string {
  const saltBytes = randomBytes(16);
  const saltHex = saltBytes.toString("hex");
  const keyLen = 64;
  const derivedLegacyHex = scryptSync(password, Buffer.from(saltHex, "utf8"), keyLen, { N, r: 8, p: 1 }).toString("hex");
  return `${PREFIX}$${N}$${saltHex}$${derivedLegacyHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<{
  ok: boolean;
  reason: PasswordCheckReason;
  hashFormat: PasswordHashFormat;
  verifyPath: PasswordVerifyPath;
  verify: {
    attempted: boolean;
    triedRawBytes: boolean;
    triedUtf8Hex: boolean;
    matched: boolean;
    reason_code: VerifyReasonCode;
    which_variant: "raw_bytes" | "utf8_hex" | null;
  };
  tokenMeta: ScryptTokenMeta | null;
}> {
  if (!stored) {
    return {
      ok: false,
      reason: "PASSWORD_MISMATCH",
      hashFormat: "empty",
      verifyPath: "plain",
      verify: { attempted: false, triedRawBytes: false, triedUtf8Hex: false, matched: false, reason_code: "MISMATCH", which_variant: null },
      tokenMeta: null,
    };
  }

  if (stored.startsWith(`${PREFIX}$`)) {
    const checked = verifyScrypt(password, stored);
    return {
      ok: checked.matched,
      reason: checked.reasonCode === "TOKEN_PARSE_FAIL" ? "HASH_PARSE_FAILED" : checked.matched ? "OK" : "PASSWORD_MISMATCH",
      hashFormat: "scrypt",
      verifyPath: checked.whichVariant ?? "plain",
      verify: {
        attempted: checked.attempted,
        triedRawBytes: checked.triedRawBytes,
        triedUtf8Hex: checked.triedUtf8Hex,
        which_variant: checked.whichVariant,
        matched: checked.matched,
        reason_code: checked.reasonCode,
      },
      tokenMeta: checked.meta,
    };
  }

  const ok = password === stored;
  return {
    ok,
    reason: ok ? "OK" : "PASSWORD_MISMATCH",
    hashFormat: "plain",
    verifyPath: "plain",
    verify: { attempted: true, triedRawBytes: false, triedUtf8Hex: false, matched: ok, reason_code: ok ? "OK" : "MISMATCH", which_variant: null },
    tokenMeta: null,
  };
}
