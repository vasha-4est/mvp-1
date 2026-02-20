import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PREFIX = "scrypt";
const DEFAULT_TOKEN_COST = 4096;
const DEFAULT_KEY_LEN_BYTES = 64;

export type ScryptTokenParsed = {
  tokenCost: number;
  saltHex: string;
  dkHex: string;
  keyLenBytes: number;
};

export function parseScryptToken(token: string): ScryptTokenParsed | null {
  const parts = token.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return null;
  }

  const tokenCost = parseInt(parts[1] ?? "", 10);
  const saltHex = parts[2] ?? "";
  const dkHex = parts[3] ?? "";

  if (!Number.isInteger(tokenCost) || tokenCost <= 1) {
    return null;
  }

  if (!/^[0-9a-fA-F]+$/.test(saltHex) || !/^[0-9a-fA-F]+$/.test(dkHex) || saltHex.length % 2 !== 0 || dkHex.length % 2 !== 0) {
    return null;
  }

  const keyLenBytes = dkHex.length / 2;
  if (!Number.isInteger(keyLenBytes) || keyLenBytes <= 0) {
    return null;
  }

  return { tokenCost, saltHex, dkHex, keyLenBytes };
}

export function deriveScryptKey(
  password: string,
  saltBytes: Buffer,
  opts: { cost: number; blockSize: number; parallelization: number; maxmem?: number } | undefined,
  keyLenBytes: number
): Buffer {
  return opts
    ? scryptSync(password, saltBytes, keyLenBytes, opts)
    : scryptSync(password, saltBytes, keyLenBytes);
}

export function verifyScryptToken(
  password: string,
  token: string
): { matched: boolean; matched_path: string | null; triedPaths: string[]; reason_code: "OK" | "OK_LEGACY" | "MISMATCH" | "TOKEN_PARSE_FAIL" | "EXCEPTION"; meta: { tokenCost: number | null; saltHexLen: number; dkHexLen: number; keyLenBytes: number } } {
  const parsed = parseScryptToken(token);
  if (!parsed) {
    const parts = token.split("$");
    const cost = parseInt(parts[1] ?? "", 10);
    const saltHex = parts[2] ?? "";
    const dkHex = parts[3] ?? "";

    return {
      matched: false,
      matched_path: null,
      triedPaths: [],
      reason_code: "TOKEN_PARSE_FAIL",
      meta: {
        tokenCost: Number.isInteger(cost) && cost > 1 ? cost : null,
        saltHexLen: saltHex.length,
        dkHexLen: dkHex.length,
        keyLenBytes: dkHex.length > 0 && dkHex.length % 2 === 0 ? dkHex.length / 2 : 0,
      },
    };
  }

  const expected = Buffer.from(parsed.dkHex, "hex");
  const tokenCost = parsed.tokenCost;
  const triedPaths: string[] = [];
  const attempts: Array<{
    path: string;
    salt: Buffer;
    opts?: { cost: number; blockSize: number; parallelization: number };
  }> = [
    {
      path: "hex+tokenCost+explicit",
      salt: Buffer.from(parsed.saltHex, "hex"),
      opts: { cost: tokenCost, blockSize: 8, parallelization: 1 },
    },
    {
      path: "utf8+tokenCost+explicit",
      salt: Buffer.from(parsed.saltHex, "utf8"),
      opts: { cost: tokenCost, blockSize: 8, parallelization: 1 },
    },
    {
      path: "utf8+16384+default",
      salt: Buffer.from(parsed.saltHex, "utf8"),
      opts: undefined,
    },
  ];

  try {
    for (const attempt of attempts) {
      triedPaths.push(attempt.path);
      const derived = deriveScryptKey(password, attempt.salt, attempt.opts, parsed.keyLenBytes);
      if (derived.length === expected.length && timingSafeEqual(derived, expected)) {
        return {
          matched: true,
          matched_path: attempt.path,
          triedPaths,
          reason_code: attempt.path === "hex+tokenCost+explicit" ? "OK" : "OK_LEGACY",
          meta: {
            tokenCost,
            saltHexLen: parsed.saltHex.length,
            dkHexLen: parsed.dkHex.length,
            keyLenBytes: parsed.keyLenBytes,
          },
        };
      }
    }

    return {
      matched: false,
      matched_path: null,
      triedPaths,
      reason_code: "MISMATCH",
      meta: {
        tokenCost,
        saltHexLen: parsed.saltHex.length,
        dkHexLen: parsed.dkHex.length,
        keyLenBytes: parsed.keyLenBytes,
      },
    };
  } catch {
    return {
      matched: false,
      matched_path: null,
      triedPaths,
      reason_code: "EXCEPTION",
      meta: {
        tokenCost,
        saltHexLen: parsed.saltHex.length,
        dkHexLen: parsed.dkHex.length,
        keyLenBytes: parsed.keyLenBytes,
      },
    };
  }
}

export async function hashPasswordToScryptToken(password: string, tokenCost = DEFAULT_TOKEN_COST): Promise<string> {
  const saltBytes = randomBytes(16);
  const saltHex = saltBytes.toString("hex");
  const derived = deriveScryptKey(
    password,
    saltBytes,
    { cost: tokenCost, blockSize: 8, parallelization: 1 },
    DEFAULT_KEY_LEN_BYTES
  ).toString("hex");

  return `${PREFIX}$${tokenCost}$${saltHex}$${derived}`;
}
