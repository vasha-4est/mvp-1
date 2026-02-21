import { requireRole } from "@/lib/server/rbac";

export { hasRole, requireAuth, requirePageRole, requireRole } from "@/lib/server/rbac";
export type { AuthenticatedUser, GuardResult } from "@/lib/server/rbac";

export function requireOwner(request: Request) {
  return requireRole(request, ["OWNER"]);
}

export function requireAnyRole(request: Request, roles: string[]) {
  return requireRole(request, roles);
}
