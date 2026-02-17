import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const AUTH0_ENV_KEYS = [
  "AUTH0_SECRET",
  "AUTH0_BASE_URL",
  "AUTH0_ISSUER_BASE_URL",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
] as const;

let client: Auth0Client | null = null;

export function isAuth0Configured(): boolean {
  return AUTH0_ENV_KEYS.every((key) => typeof process.env[key] === "string" && process.env[key]!.trim().length > 0);
}

export function getAuth0Client(): Auth0Client {
  if (client) {
    return client;
  }

  client = new Auth0Client();
  return client;
}
