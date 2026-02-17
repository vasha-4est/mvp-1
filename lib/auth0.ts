import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client();

const AUTH0_ENV_KEYS = [
  "AUTH0_SECRET",
  "AUTH0_BASE_URL",
  "AUTH0_ISSUER_BASE_URL",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
] as const;

export function isAuth0Configured(): boolean {
  return AUTH0_ENV_KEYS.every((key) => typeof process.env[key] === "string" && process.env[key]!.trim().length > 0);
}
