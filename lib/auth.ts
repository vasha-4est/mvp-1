export {
  SESSION_COOKIE_NAME,
  getSessionFromRequest,
  hasRole,
  isAllowedRole,
  requireAuth,
  requireRole,
} from "@/lib/server/rbac";
export type { AuthenticatedUser, GuardResult } from "@/lib/server/rbac";

import { requireRole } from "@/lib/server/rbac";

export function isProductionAuthEnvironment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (typeof vercelEnv === "string" && vercelEnv.trim().length > 0) {
    return vercelEnv.trim().toLowerCase() === "production";
  }

  return process.env.NODE_ENV === "production";
}

export function requireOwner(request: Request) {
  return requireRole(request, ["OWNER"]);
}

export function requireAnyRole(request: Request, roles: string[]) {
  return requireRole(request, roles);
}
