import { randomBytes, scryptSync } from "crypto";

import { hashPasswordScrypt, verifyPasswordScrypt } from "@/lib/server/auth/scrypt";
import { hashPasswordToScryptToken, verifyScryptToken } from "@/lib/server/scryptToken";

const PREFIX = "scrypt";
const DEFAULT_N = 4096;
const DEFAULT_KEY_LEN = 64;

type VerifyReasonCode = "OK" | "OK_LEGACY" | "MISMATCH" | "TOKEN_PARSE_FAIL" | "EXCEPTION";

export type PasswordCheckReason = "OK" | "HASH_PARSE_FAILED" | "PASSWORD_MISMATCH";
export type PasswordHashFormat = "scrypt" | "plain" | "empty";
export type PasswordVerifyPath = "scrypt" | "plain";

export type ScryptTokenMeta = {
  kind: "scrypt" | "unknown";
  N: number | null;
  saltHexLen: number;
  dkHexLen: number;
  keyLen: number;
};

export async function hashPassword(password: string, cost = 12): Promise<string> {
  if (2 ** Math.max(12, cost) === 4096) {
    return hashPasswordScrypt(password);
  }

  return hashPasswordToScryptToken(password, 2 ** Math.max(12, cost));
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
    triedPaths: string[];
    matched_path: string | null;
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
        triedPaths: [],
        matched_path: null,
      },
      tokenMeta: null,
    };
  }

  if (stored.startsWith(`${PREFIX}$`)) {
    const checked = verifyScryptToken(password, stored);
    const fastMatched = verifyPasswordScrypt(password, stored);

    return {
      ok: checked.matched && fastMatched,
      reason: checked.reason_code === "TOKEN_PARSE_FAIL" ? "HASH_PARSE_FAILED" : checked.matched && fastMatched ? "OK" : "PASSWORD_MISMATCH",
      hashFormat: "scrypt",
      verifyPath: "scrypt",
      verify: {
        attempted: true,
        triedStandard: checked.triedPaths.includes("hex+tokenCost+explicit"),
        triedLegacyUtf8Salt: checked.triedPaths.includes("utf8+tokenCost+explicit"),
        triedLegacyDefault: checked.triedPaths.includes("utf8+16384+default"),
        matched: checked.matched && fastMatched,
        reason_code: checked.reason_code,
        which_variant:
          checked.matched_path === "hex+tokenCost+explicit"
            ? "standard"
            : checked.matched_path === "utf8+tokenCost+explicit"
              ? "legacy_utf8_salt"
              : checked.matched_path === "utf8+16384+default"
                ? "legacy_default"
                : null,
        triedPaths: checked.triedPaths,
        matched_path: checked.matched_path,
      },
      tokenMeta: {
        kind: checked.meta.tokenCost ? "scrypt" : "unknown",
        N: checked.meta.tokenCost,
        saltHexLen: checked.meta.saltHexLen,
        dkHexLen: checked.meta.dkHexLen,
        keyLen: checked.meta.keyLenBytes,
      },
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
      triedPaths: [],
      matched_path: null,
    },
    tokenMeta: null,
  };
}
