import { hashPasswordToScryptToken, verifyScryptToken } from "@/lib/server/scryptToken";

const DEFAULT_TOKEN_COST = 4096;

export async function hashPasswordScrypt(plain: string): Promise<string> {
  return hashPasswordToScryptToken(plain, DEFAULT_TOKEN_COST);
}

export function verifyPasswordScrypt(plain: string, token: string): boolean {
  return verifyScryptToken(plain, token).matched;
}
