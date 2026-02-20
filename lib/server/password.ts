import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";
const DEFAULT_N = 4096;
const DEFAULT_KEY_LEN = 64;

type VerifyReasonCode = "OK" | "OK_LEGACY" | "MISMATCH" | "TOKEN_PARSE_FAIL" | "EXCEPTION";

export type PasswordCheckReason = "OK" | "HASH_PARSE_FAILED" | "PASSWORD_MISMATCH";
export type PasswordHashFormat = "scrypt" | "plain" | "empty";
export type PasswordVerifyPath = "standard" | "legacy_utf8_salt" | "legacy_default" | "plain";

export type ScryptTokenMeta = {
  kind: "scrypt" | "unknown";
  N: number | null;
  saltHexLen: number;
  dkHexLen: number;
  keyLen: number;
};

type ParsedScryptToken = {
  N: number;
  saltHex: string;
  dkHex: string;
  saltBytes: Buffer;
  expectedBytes: Buffer;
  keyLen: number;
  saltHexLen: number;
  dkHexLen: number;
};

function scryptOptions(cost: number): { cost: number; blockSize: number; parallelization: number; maxmem: number } {
  return {
    cost,
    blockSize: 8,
    parallelization: 1,
    maxmem: 64 * 1024 * 1024,
  };
}

export async function hashPassword(password: string, cost = 12): Promise<string> {
  const salt = randomBytes(16);
  const saltHex = salt.toString("hex");
  const derivedHex = scryptSync(password, salt, DEFAULT_KEY_LEN, scryptOptions(2 ** Math.max(12, cost))).toString("hex");
  return `${PREFIX}$${2 ** Math.max(12, cost)}$${saltHex}$${derivedHex}`;
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
    saltHexLen: saltHex.length,
    dkHexLen: dkHex.length,
    keyLen: dkHex.length > 0 && dkHex.length % 2 === 0 ? dkHex.length / 2 : 0,
  };
}

export function verifyScrypt(password: string, stored: string): {
  attempted: boolean;
  triedStandard: boolean;
  triedLegacyUtf8Salt: boolean;
  triedLegacyDefault: boolean;
  matched: boolean;
  reasonCode: VerifyReasonCode;
  whichVariant: "standard" | "legacy_utf8_salt" | "legacy_default" | null;
  meta: ScryptTokenMeta;
} {
  const parsed = parseScryptToken(stored);
  if (!parsed) {
    return {
      attempted: true,
      triedStandard: false,
      triedLegacyUtf8Salt: false,
      triedLegacyDefault: false,
      matched: false,
      reasonCode: "TOKEN_PARSE_FAIL",
      whichVariant: null,
      meta: unknownScryptMeta(stored),
    };
  }

  const meta: ScryptTokenMeta = {
    kind: "scrypt",
    N: parsed.N,
    saltHexLen: parsed.saltHexLen,
    dkHexLen: parsed.dkHexLen,
    keyLen: parsed.keyLen,
  };

  try {
    const derivedStandard = scryptSync(password, parsed.saltBytes, parsed.keyLen, scryptOptions(parsed.N));
    if (safeEqual(derivedStandard, parsed.expectedBytes)) {
      return {
        attempted: true,
        triedStandard: true,
        triedLegacyUtf8Salt: false,
        triedLegacyDefault: false,
        matched: true,
        reasonCode: "OK",
        whichVariant: "standard",
        meta,
      };
    }

    const legacyUtf8Salt = Buffer.from(parsed.saltHex, "utf8");
    const derivedLegacyUtf8 = scryptSync(password, legacyUtf8Salt, parsed.keyLen, scryptOptions(parsed.N));
    if (safeEqual(derivedLegacyUtf8, parsed.expectedBytes)) {
      return {
        attempted: true,
        triedStandard: true,
        triedLegacyUtf8Salt: true,
        triedLegacyDefault: false,
        matched: true,
        reasonCode: "OK_LEGACY",
        whichVariant: "legacy_utf8_salt",
        meta,
      };
    }

    const derivedLegacyDefault = scryptSync(password, legacyUtf8Salt, parsed.keyLen);
    if (safeEqual(derivedLegacyDefault, parsed.expectedBytes)) {
      return {
        attempted: true,
        triedStandard: true,
        triedLegacyUtf8Salt: true,
        triedLegacyDefault: true,
        matched: true,
        reasonCode: "OK_LEGACY",
        whichVariant: "legacy_default",
        meta,
      };
    }

    return {
      attempted: true,
      triedStandard: true,
      triedLegacyUtf8Salt: true,
      triedLegacyDefault: true,
      matched: false,
      reasonCode: "MISMATCH",
      whichVariant: null,
      meta,
    };
  } catch {
    return {
      attempted: true,
      triedStandard: true,
      triedLegacyUtf8Salt: true,
      triedLegacyDefault: true,
      matched: false,
      reasonCode: "EXCEPTION",
      whichVariant: null,
      meta,
    };
  }
}

export function buildLegacyScryptToken(password: string, N = DEFAULT_N): string {
  const salt = randomBytes(16);
  const saltHex = salt.toString("hex");
  const derivedLegacyHex = scryptSync(password, Buffer.from(saltHex, "utf8"), DEFAULT_KEY_LEN).toString("hex");
  return `${PREFIX}$${N}$${saltHex}$${derivedLegacyHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<{
  ok: boolean;
  reason: PasswordCheckReason;
  hashFormat: PasswordHashFormat;
  verifyPath: PasswordVerifyPath;
  verify: {
    attempted: boolean;
    triedStandard: boolean;
    triedLegacyUtf8Salt: boolean;
    triedLegacyDefault: boolean;
    matched: boolean;
    reason_code: VerifyReasonCode;
    which_variant: "standard" | "legacy_utf8_salt" | "legacy_default" | null;
  };
  tokenMeta: ScryptTokenMeta | null;
}> {
  if (!stored) {
    return {
      ok: false,
      reason: "PASSWORD_MISMATCH",
      hashFormat: "empty",
      verifyPath: "plain",
      verify: {
        attempted: false,
        triedStandard: false,
        triedLegacyUtf8Salt: false,
        triedLegacyDefault: false,
        matched: false,
        reason_code: "MISMATCH",
        which_variant: null,
      },
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
        triedStandard: checked.triedStandard,
        triedLegacyUtf8Salt: checked.triedLegacyUtf8Salt,
        triedLegacyDefault: checked.triedLegacyDefault,
        matched: checked.matched,
        reason_code: checked.reasonCode,
        which_variant: checked.whichVariant,
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
    verify: {
      attempted: true,
      triedStandard: false,
      triedLegacyUtf8Salt: false,
      triedLegacyDefault: false,
      matched: ok,
      reason_code: ok ? "OK" : "MISMATCH",
      which_variant: null,
    },
    tokenMeta: null,
  };
}
